/**
 * Export and import of settings as a file.
 *
 * The file is the way to move settings between browsers that do not share
 * sync (Chrome to Firefox). It holds the settings and sites only: statistics
 * and lifecycle flags describe one device's history and are never exported.
 *
 * Import replaces everything, so it refuses anything it cannot read in full,
 * and every refusal names the field path ("defaults.bypassMinutes"). Patterns
 * listed twice are reported, not refused: 1.x allowed them, and two devices
 * adding one site at once produce them.
 *
 * Pure: no chrome.*, no clock (the caller passes `now`).
 */

import {
  EXPORT_FILE_EXTENSION,
  EXPORT_FILE_PREFIX,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  LEGACY_SCHEMA_VERSION,
  MAX_IMPORT_BYTES,
  MAX_SITES,
  SCHEMA_VERSION,
} from '../constants.js';
import { migrateLegacyConfig } from './config_migration.js';
import { normalizePattern } from './rules.js';
import { SITE_FIELDS, isWebUrl, validateSettings, validateSite } from './settings_schema.js';

const encoder = new TextEncoder();

/**
 * @param {unknown} value
 * @returns {boolean} Whether it is a plain object (not null, not a list).
 */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * The export envelope for a config.
 *
 * @param {{defaults: object, sites: object[]}} config As readConfig returns it.
 * @param {string} extensionVersion The running version (manifest `version`).
 * @param {number} now Epoch ms.
 * @returns {object} `{ format, exportVersion, exportedAt, extensionVersion, config }`.
 * @throws {Error} On a missing version or clock.
 */
export function buildExport(config, extensionVersion, now) {
  if (typeof extensionVersion !== 'string' || extensionVersion === '') {
    throw new Error(`buildExport: extensionVersion must be a non-empty string, got ${JSON.stringify(extensionVersion)}`);
  }
  if (!Number.isFinite(now)) {
    throw new Error(`buildExport: now must be epoch ms, got ${now}`);
  }
  // Named fields only: whatever else the in-memory config carries (the
  // invalid-item report, anything added later) stays out of the file.
  return {
    format: EXPORT_FORMAT,
    exportVersion: EXPORT_VERSION,
    exportedAt: new Date(now).toISOString(),
    extensionVersion,
    config: structuredClone({
      schemaVersion: SCHEMA_VERSION,
      defaults: config.defaults,
      sites: config.sites.map((site) => Object.fromEntries(SITE_FIELDS.map((field) => [field, site[field]]))),
    }),
  };
}

/**
 * @param {number} now Epoch ms.
 * @returns {string} `steer-clear-settings-YYYY-MM-DD.json`, by the local date.
 */
export function exportFileName(now) {
  const date = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${EXPORT_FILE_PREFIX}${day}${EXPORT_FILE_EXTENSION}`;
}

/**
 * The settings form accepts only full http(s) destinations; so does a file,
 * which could otherwise point the pause page's button at javascript: or
 * file: and record a steer that went nowhere.
 *
 * @param {unknown} value
 * @param {string} path
 */
function assertWebTarget(value, path) {
  if (!isWebUrl(value)) {
    throw new Error(`${path} must be an http(s) address, got ${JSON.stringify(value)}`);
  }
}

/**
 * Check a complete v3 config `{ schemaVersion: 3, defaults, sites }`. Used on
 * the parsed file in the page and again by the worker, which never trusts
 * what a page sends.
 *
 * @param {unknown} config
 * @throws {Error} Naming the first offending field path.
 */
export function validateImportedConfig(config) {
  if (!isObject(config)) {
    throw new Error(`config must be an object, got ${JSON.stringify(config)}`);
  }
  if (config.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`config.schemaVersion must be ${SCHEMA_VERSION}, got ${JSON.stringify(config.schemaVersion)}`);
  }
  validateSettings(config.defaults, { partial: false, path: 'defaults' });
  if (!Array.isArray(config.sites)) {
    throw new Error(`config.sites must be a list, got ${typeof config.sites}`);
  }
  if (config.sites.length > MAX_SITES) {
    throw new Error(`config.sites holds ${config.sites.length} sites; at most ${MAX_SITES} can be listed`);
  }
  assertWebTarget(config.defaults.target, 'defaults.target');
  const seen = new Map();
  config.sites.forEach((site, index) => {
    validateSite(site, `sites[${index}]`);
    const unknown = Object.keys(site).find((key) => !SITE_FIELDS.includes(key));
    if (unknown !== undefined) {
      throw new Error(`sites[${index}].${unknown} is not a site field`);
    }
    // Stored 1.x data may hold patterns that name no host; a file may not.
    // One such pattern used to fail the permission check, and so the rule
    // update, for every site.
    try {
      normalizePattern(site.pattern);
    } catch (error) {
      throw new Error(`sites[${index}].pattern ${JSON.stringify(site.pattern)} is not a usable domain (${error.message})`);
    }
    if (site.overrides && 'target' in site.overrides) {
      assertWebTarget(site.overrides.target, `sites[${index}].overrides.target`);
    }
    if (seen.has(site.id)) {
      throw new Error(`sites[${index}].id "${site.id}" repeats sites[${seen.get(site.id)}].id`);
    }
    seen.set(site.id, index);
  });
}

/**
 * The host a pattern stands for, for duplicate detection. Patterns 1.x
 * accepted but that name no host compare as typed.
 *
 * @param {string} pattern
 * @returns {string}
 */
function hostKey(pattern) {
  try {
    return normalizePattern(pattern);
  } catch {
    return pattern.trim().toLowerCase();
  }
}

/**
 * @param {object[]} sites
 * @returns {string[]} Hosts listed more than once, in first-seen order.
 */
function duplicateHosts(sites) {
  const counts = new Map();
  for (const site of sites) {
    const host = hostKey(site.pattern);
    counts.set(host, (counts.get(host) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([host]) => host);
}

/**
 * Bring the file's config to v3: v1 and v2 go through the same migration as
 * the legacy sync item.
 *
 * @param {object} config
 * @returns {object} A v3 `{ schemaVersion, defaults, sites }`.
 */
function toV3(config) {
  const from = config.schemaVersion ?? 1;
  if (!Number.isInteger(from) || from < 1) {
    throw new Error(`config.schemaVersion must be a whole number from 1, got ${JSON.stringify(config.schemaVersion)}`);
  }
  if (from > SCHEMA_VERSION) {
    throw new Error(
      `config.schemaVersion ${from} was saved by a newer version (this one reads up to ${SCHEMA_VERSION}); update the extension`
    );
  }
  if (from === SCHEMA_VERSION) {
    return config;
  }
  if (from <= LEGACY_SCHEMA_VERSION && config.sites !== undefined && !Array.isArray(config.sites)) {
    throw new Error(`config.sites must be a list, got ${typeof config.sites}`);
  }
  return { schemaVersion: SCHEMA_VERSION, ...migrateLegacyConfig(config) };
}

/**
 * Read an export file.
 *
 * @param {string} text The file's contents.
 * @returns {{config: object, duplicates: string[]}} A validated v3 config,
 *   and the hosts it lists more than once.
 * @throws {Error} Naming the field path, for anything it cannot read in full.
 */
export function parseImport(text) {
  if (typeof text !== 'string') {
    throw new Error(`file: expected text, got ${typeof text}`);
  }
  const bytes = encoder.encode(text).length;
  if (bytes > MAX_IMPORT_BYTES) {
    throw new Error(`file: ${bytes} bytes, over the ${MAX_IMPORT_BYTES}-byte limit for a settings file`);
  }

  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch (error) {
    throw new Error(`file: not valid JSON (${error.message})`);
  }
  if (!isObject(envelope)) {
    throw new Error('file must be an object with format, exportVersion and config');
  }
  if (envelope.format !== EXPORT_FORMAT) {
    throw new Error(`format must be "${EXPORT_FORMAT}", got ${JSON.stringify(envelope.format)}`);
  }
  if (!Number.isInteger(envelope.exportVersion) || envelope.exportVersion < 1) {
    throw new Error(`exportVersion must be a whole number from 1, got ${JSON.stringify(envelope.exportVersion)}`);
  }
  if (envelope.exportVersion > EXPORT_VERSION) {
    throw new Error(
      `exportVersion ${envelope.exportVersion} was written by a newer version (this one reads ${EXPORT_VERSION}); update the extension`
    );
  }
  if (!isObject(envelope.config)) {
    throw new Error(`config must be an object, got ${JSON.stringify(envelope.config)}`);
  }

  const config = toV3(envelope.config);
  validateImportedConfig(config);
  return {
    config: { schemaVersion: SCHEMA_VERSION, defaults: config.defaults, sites: config.sites },
    duplicates: duplicateHosts(config.sites),
  };
}

/**
 * The hosts an imported config needs access to: each enabled site's host,
 * once, in list order. Patterns that name no host are left out (they never
 * get a rule).
 *
 * @param {{sites: object[]}} config
 * @returns {string[]}
 */
export function importedHosts(config) {
  const hosts = [];
  for (const site of config.sites) {
    if (!site.enabled) continue;
    try {
      const host = normalizePattern(site.pattern);
      if (!hosts.includes(host)) hosts.push(host);
    } catch {
      // No host, no rule, nothing to grant.
    }
  }
  return hosts;
}
