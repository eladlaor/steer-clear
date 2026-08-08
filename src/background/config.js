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
    globalNote: DEFAULT_NOTE,
    sites: [],
  };
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
  if (typeof config.globalNote !== 'string') {
    throw new Error('validateConfig: globalNote must be a string');
  }
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
  });
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

    validateConfig(config);
    return config;
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
 * @returns {object} A site entry ready to append to config.sites.
 */
export function createSite(pattern) {
  return {
    id: crypto.randomUUID(),
    pattern,
    includeSubdomains: true,
    target: null,
    note: null,
    enabled: true,
  };
}
