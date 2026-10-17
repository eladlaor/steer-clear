/**
 * The SiteSettings field table: one place that says what each setting is,
 * what it defaults to, whether a site may override it, and what values it
 * accepts. Validation and resolution are generic over this table.
 *
 * Pure: no chrome.*, no clock. See "Config schema v3" in
 * knowledge/plans/V2_COMPETITIVE_UPGRADE.md for the contract.
 *
 * Rule for every validator here: never add a constraint v2 did not have.
 * `target` stays "non-empty string", reasons have no length limit, and the
 * countdown keeps 1–60, so every valid 1.x config migrates to a valid v3 one.
 * Input limits (URL format, 280-character reasons) live in the UI.
 */

import {
  BYPASS_MINUTES_OPTIONS,
  DEFAULT_AUTO_CONTINUE,
  DEFAULT_BYPASS_MINUTES,
  DEFAULT_COUNTDOWN_SECONDS,
  DEFAULT_PAUSE_SECONDS,
  DEFAULT_PAUSE_STYLE,
  DEFAULT_RETURN_PAUSE_ON_EXPIRY,
  DEFAULT_TARGET,
  DEFAULT_TARGET_NAME,
  DEFAULT_VARY_PRESENTATION,
  MAX_COUNTDOWN_SECONDS,
  MAX_PAUSE_SECONDS,
  MAX_REASONS_PER_SITE,
  MIN_COUNTDOWN_SECONDS,
  MIN_PAUSE_SECONDS,
  PauseStyle,
} from '../constants.js';

const PAUSE_STYLES = Object.freeze(Object.values(PauseStyle));

/* Field validators: each throws naming `path`, or returns nothing. -------- */

function assertNonEmptyString(value, path) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${path} must be a non-empty string, got ${JSON.stringify(value)}`);
  }
}

function assertString(value, path) {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string, got ${typeof value}`);
  }
}

function assertBoolean(value, path) {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean, got ${JSON.stringify(value)}`);
  }
}

function assertIntegerIn(min, max) {
  return (value, path) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${path} must be an integer between ${min} and ${max}, got ${JSON.stringify(value)}`);
    }
  };
}

function assertOneOf(allowed) {
  return (value, path) => {
    if (!allowed.includes(value)) {
      throw new Error(`${path} must be one of ${allowed.join(', ')}, got ${JSON.stringify(value)}`);
    }
  };
}

function assertReasons(value, path) {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be a list of strings, got ${typeof value}`);
  }
  if (value.length > MAX_REASONS_PER_SITE) {
    throw new Error(`${path} holds ${value.length} reasons; at most ${MAX_REASONS_PER_SITE} are allowed`);
  }
  value.forEach((reason, index) => {
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(`${path}[${index}] must be a non-blank string, got ${JSON.stringify(reason)}`);
    }
  });
}

/**
 * Every SiteSettings field. `perSite` fields may appear in `site.overrides`;
 * the rest are global only. `fresh()` returns the default, newly allocated.
 */
export const SETTINGS_FIELDS = Object.freeze({
  target: { perSite: true, fresh: () => DEFAULT_TARGET, validate: assertNonEmptyString },
  targetName: { perSite: true, fresh: () => DEFAULT_TARGET_NAME, validate: assertString },
  reasons: { perSite: true, fresh: () => [], validate: assertReasons },
  pauseStyle: { perSite: true, fresh: () => DEFAULT_PAUSE_STYLE, validate: assertOneOf(PAUSE_STYLES) },
  autoContinue: { perSite: true, fresh: () => DEFAULT_AUTO_CONTINUE, validate: assertBoolean },
  countdownSeconds: {
    perSite: true,
    fresh: () => DEFAULT_COUNTDOWN_SECONDS,
    validate: assertIntegerIn(MIN_COUNTDOWN_SECONDS, MAX_COUNTDOWN_SECONDS),
  },
  pauseSeconds: {
    perSite: false,
    fresh: () => DEFAULT_PAUSE_SECONDS,
    validate: assertIntegerIn(MIN_PAUSE_SECONDS, MAX_PAUSE_SECONDS),
  },
  bypassMinutes: {
    perSite: false,
    fresh: () => DEFAULT_BYPASS_MINUTES,
    validate: assertOneOf(BYPASS_MINUTES_OPTIONS),
  },
  returnPauseOnExpiry: { perSite: false, fresh: () => DEFAULT_RETURN_PAUSE_ON_EXPIRY, validate: assertBoolean },
  varyPresentation: { perSite: false, fresh: () => DEFAULT_VARY_PRESENTATION, validate: assertBoolean },
});

/** Names of the fields a site may override. */
export const PER_SITE_FIELDS = Object.freeze(
  Object.keys(SETTINGS_FIELDS).filter((key) => SETTINGS_FIELDS[key].perSite)
);

/**
 * The global settings a fresh install starts with.
 *
 * @returns {object} A complete SiteSettings object.
 */
export function defaultSettings() {
  return Object.fromEntries(
    Object.entries(SETTINGS_FIELDS).map(([key, field]) => [key, field.fresh()])
  );
}

/**
 * Validate a settings object, throwing on the first violation.
 *
 * @param {object} settings
 * @param {{partial?: boolean, path?: string}} [options] `partial: false`
 *   (defaults) requires every field; `partial: true` (overrides) accepts any
 *   subset of the per-site fields and rejects global-only keys. `path` prefixes
 *   error messages, e.g. "defaults" or "site:abc.overrides".
 * @throws {Error} Naming the offending field path.
 */
export function validateSettings(settings, { partial = false, path = 'settings' } = {}) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error(`${path} must be an object, got ${JSON.stringify(settings)}`);
  }

  for (const [key, value] of Object.entries(settings)) {
    const field = SETTINGS_FIELDS[key];
    if (!field) {
      throw new Error(`${path}.${key} is an unknown setting`);
    }
    if (partial && !field.perSite) {
      throw new Error(`${path}.${key} is a global setting and cannot be set per site`);
    }
    field.validate(value, `${path}.${key}`);
  }

  if (!partial) {
    for (const key of Object.keys(SETTINGS_FIELDS)) {
      if (!(key in settings)) {
        throw new Error(`${path}.${key} is required`);
      }
    }
  }
}

/**
 * Validate one stored site record.
 *
 * @param {object} site
 * @param {string} [path] Error-message prefix, e.g. the storage key.
 * @throws {Error} Naming the offending field path.
 */
export function validateSite(site, path = 'site') {
  if (!site || typeof site !== 'object') {
    throw new Error(`${path} must be an object`);
  }
  assertNonEmptyString(site.id, `${path}.id`);
  if (typeof site.pattern !== 'string' || site.pattern.trim() === '') {
    throw new Error(`${path}.pattern must be a non-empty string`);
  }
  if (site.displayName !== null) {
    assertString(site.displayName, `${path}.displayName`);
  }
  assertBoolean(site.includeSubdomains, `${path}.includeSubdomains`);
  assertBoolean(site.enabled, `${path}.enabled`);
  if (site.addedAt !== null && !Number.isFinite(site.addedAt)) {
    throw new Error(`${path}.addedAt must be epoch milliseconds or null`);
  }
  if (!Number.isFinite(site.order)) {
    throw new Error(`${path}.order must be a number`);
  }
  validateSettings(site.overrides, { partial: true, path: `${path}.overrides` });
}

/**
 * The effective settings for a site: defaults, with each key the site
 * overrides replaced. A present key wins whatever its value (`false`, `[]`).
 *
 * A site that overrides its target but not the target's name gets
 * `targetName: ''`, so the button shows the new target's hostname rather than
 * the name of the global destination.
 *
 * @param {object} defaults Complete global settings.
 * @param {object|null} site The matched site, or null.
 * @returns {object} A complete, newly allocated SiteSettings object.
 */
export function resolveSettings(defaults, site) {
  const overrides = site?.overrides ?? {};
  const resolved = structuredClone({ ...defaults, ...overrides });

  if ('target' in overrides && !('targetName' in overrides)) {
    resolved.targetName = '';
  }
  return resolved;
}
