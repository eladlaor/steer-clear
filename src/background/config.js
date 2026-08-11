/**
 * Configuration persistence for Steer Clear.
 *
 * Single responsibility: read, validate, and write the user config in
 * chrome.storage.sync. No rule-building, no UI concerns.
 */

import {
  SCHEMA_VERSION,
  StorageKey,
  DEFAULT_TARGET,
  DEFAULT_NOTE,
  DEFAULT_TARGET_NAME,
  DEFAULT_AUTO_CONTINUE,
  DEFAULT_COUNTDOWN_SECONDS,
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
} from '../constants.js';

/**
 * The config applied on first install.
 *
 * @returns {object} A fresh default config.
 */
export function defaultConfig() {
  return {
    schemaVersion: SCHEMA_VERSION,
    globalTarget: DEFAULT_TARGET,
    globalTargetName: DEFAULT_TARGET_NAME,
    globalNote: DEFAULT_NOTE,
    globalAutoContinue: DEFAULT_AUTO_CONTINUE,
    globalCountdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
    sites: [],
  };
}

/**
 * Bring a stored config up to the current schema version.
 *
 * Runs on every read, so it must be idempotent and total: any config this
 * function returns has to satisfy validateConfig. Missing fields are filled
 * with defaults rather than rejected — a user who installed v1 must not have
 * their site list refused by a v2 validator.
 *
 * @param {object} stored The raw config from storage.
 * @returns {{config: object, migrated: boolean}} The upgraded config, and
 *   whether anything actually changed (so the caller can persist it).
 */
export function migrateConfig(stored) {
  if (!stored || typeof stored !== 'object') {
    throw new Error('migrateConfig: stored config must be an object');
  }

  const from = stored.schemaVersion ?? 1;

  if (from > SCHEMA_VERSION) {
    // A newer version of the extension wrote this, and sync pulled it onto an
    // older install. Refusing is safer than silently discarding fields we do
    // not understand.
    throw new Error(
      `migrateConfig: config schemaVersion ${from} is newer than supported ` +
        `version ${SCHEMA_VERSION}; update the extension`
    );
  }

  if (from === SCHEMA_VERSION) {
    return { config: stored, migrated: false };
  }

  const config = {
    ...stored,
    schemaVersion: SCHEMA_VERSION,
    globalTargetName: stored.globalTargetName ?? DEFAULT_TARGET_NAME,
    globalAutoContinue: stored.globalAutoContinue ?? DEFAULT_AUTO_CONTINUE,
    globalCountdownSeconds:
      stored.globalCountdownSeconds ?? DEFAULT_COUNTDOWN_SECONDS,
    sites: (stored.sites ?? []).map((site) => ({
      ...site,
      displayName: site.displayName ?? null,
      autoContinue: site.autoContinue ?? null,
      countdownSeconds: site.countdownSeconds ?? null,
    })),
  };

  console.info('[steer-clear] config migrated', {
    from,
    to: SCHEMA_VERSION,
    siteCount: config.sites.length,
  });

  return { config, migrated: true };
}

/**
 * Validate a config object, throwing on anything structurally wrong.
 * Fail-fast: a malformed config must surface immediately rather than being
 * silently coerced into something that blocks the wrong sites.
 *
 * @param {object} config
 * @throws {Error} On any structural violation.
 */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('validateConfig: config must be an object');
  }
  if (typeof config.globalTarget !== 'string' || config.globalTarget === '') {
    throw new Error('validateConfig: globalTarget must be a non-empty string');
  }
  if (typeof config.globalTargetName !== 'string') {
    throw new Error('validateConfig: globalTargetName must be a string');
  }
  if (typeof config.globalNote !== 'string') {
    throw new Error('validateConfig: globalNote must be a string');
  }
  if (typeof config.globalAutoContinue !== 'boolean') {
    throw new Error('validateConfig: globalAutoContinue must be a boolean');
  }
  assertCountdown(config.globalCountdownSeconds, 'globalCountdownSeconds');
  if (!Array.isArray(config.sites)) {
    throw new Error('validateConfig: sites must be an array');
  }

  config.sites.forEach((site, index) => {
    if (typeof site.pattern !== 'string' || site.pattern.trim() === '') {
      throw new Error(
        `validateConfig: sites[${index}].pattern must be a non-empty string`
      );
    }
    if (typeof site.includeSubdomains !== 'boolean') {
      throw new Error(
        `validateConfig: sites[${index}].includeSubdomains must be a boolean`
      );
    }
    if (typeof site.enabled !== 'boolean') {
      throw new Error(
        `validateConfig: sites[${index}].enabled must be a boolean`
      );
    }
    if (site.target !== null && typeof site.target !== 'string') {
      throw new Error(
        `validateConfig: sites[${index}].target must be a string or null`
      );
    }
    if (site.note !== null && typeof site.note !== 'string') {
      throw new Error(
        `validateConfig: sites[${index}].note must be a string or null`
      );
    }
    if (site.displayName !== null && typeof site.displayName !== 'string') {
      throw new Error(
        `validateConfig: sites[${index}].displayName must be a string or null`
      );
    }
    if (site.autoContinue !== null && typeof site.autoContinue !== 'boolean') {
      throw new Error(
        `validateConfig: sites[${index}].autoContinue must be a boolean or null`
      );
    }
    if (site.countdownSeconds !== null) {
      assertCountdown(site.countdownSeconds, `sites[${index}].countdownSeconds`);
    }
  });
}

/**
 * Assert that a value is a countdown duration within the accepted bounds.
 *
 * @param {unknown} value
 * @param {string} fieldName Field name, for the error message.
 * @throws {Error} If the value is not an in-range integer.
 */
function assertCountdown(value, fieldName) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < MIN_COUNTDOWN_SECONDS ||
    value > MAX_COUNTDOWN_SECONDS
  ) {
    throw new Error(
      `validateConfig: ${fieldName} must be an integer between ` +
        `${MIN_COUNTDOWN_SECONDS} and ${MAX_COUNTDOWN_SECONDS}, got ${value}`
    );
  }
}

/**
 * Read the config from sync storage, falling back to defaults on first run.
 *
 * @returns {Promise<object>} The stored config, or a fresh default.
 * @throws {Error} If storage access fails.
 */
export async function readConfig() {
  try {
    const stored = await chrome.storage.sync.get(StorageKey.CONFIG);
    const config = stored[StorageKey.CONFIG];

    if (!config) {
      return defaultConfig();
    }

    const { config: upgraded, migrated } = migrateConfig(config);
    validateConfig(upgraded);

    // Persist the upgrade so the migration runs once rather than on every read.
    if (migrated) {
      await chrome.storage.sync.set({ [StorageKey.CONFIG]: upgraded });
    }

    return upgraded;
  } catch (error) {
    console.error('[steer-clear] readConfig failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Write the config to sync storage after validating it.
 *
 * @param {object} config The config to persist.
 * @returns {Promise<void>}
 * @throws {Error} If the config is invalid or storage access fails.
 */
export async function writeConfig(config) {
  try {
    validateConfig(config);
    await chrome.storage.sync.set({ [StorageKey.CONFIG]: config });
  } catch (error) {
    console.error('[steer-clear] writeConfig failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Create a new site entry with defaults applied.
 *
 * @param {string} pattern The domain pattern.
 * @param {string|null} [displayName] Friendly label; null falls back to the host.
 * @returns {object} A site entry ready to append to config.sites.
 */
export function createSite(pattern, displayName = null) {
  return {
    id: crypto.randomUUID(),
    pattern,
    displayName,
    includeSubdomains: true,
    target: null,
    note: null,
    autoContinue: null,
    countdownSeconds: null,
    enabled: true,
  };
}
