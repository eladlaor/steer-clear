/**
 * How the config is laid out across storage.sync items, and the quota check
 * every write passes.
 *
 * Layout (v3): `schema` marker, `settings` `{ defaults }`, and one
 * `site:<id>` item per site. The legacy 1.x `config` item is read, never
 * written. One site per item keeps every item far under the 8,192-byte
 * per-item quota that a single list item hits at about 20 sites.
 *
 * Pure: takes the items object `storage.sync.get(null)` returns.
 */

import {
  SCHEMA_VERSION,
  StorageKey,
  SYNC_MAX_ITEMS,
  SYNC_QUOTA_BYTES,
  SYNC_QUOTA_BYTES_PER_ITEM,
} from '../constants.js';
import { migrateLegacyConfig } from './config_migration.js';
import { defaultSettings, validateSettings, validateSite } from './settings_schema.js';

const encoder = new TextEncoder();

/**
 * @param {string} id A site id.
 * @returns {string} Its storage.sync key.
 */
export function siteKey(id) {
  return `${StorageKey.SITE_PREFIX}${id}`;
}

/**
 * @param {string} key
 * @returns {boolean} Whether the key holds a site.
 */
export function isSiteKey(key) {
  return key.startsWith(StorageKey.SITE_PREFIX);
}

/**
 * Whether sites live in `site:*` items. Decided by the marker or by any site
 * item, never by the legacy `config`, so 2.0 never re-migrates over v3 data.
 *
 * @param {object} items Every sync item.
 * @returns {boolean}
 */
export function isV3SitesMode(items) {
  return items[StorageKey.SCHEMA_MARKER] === SCHEMA_VERSION || Object.keys(items).some(isSiteKey);
}

/**
 * The global settings: stored ones, else the legacy config's, else defaults.
 * Stored settings are laid over the defaults, so a field added by a later
 * release reads as its default rather than failing validation.
 *
 * @param {object} items
 * @returns {object} Validated SiteSettings.
 */
function assembleDefaults(items) {
  const stored = items[StorageKey.SETTINGS];
  let defaults;
  if (stored !== undefined) {
    defaults = { ...defaultSettings(), ...stored.defaults };
  } else if (items[StorageKey.CONFIG] !== undefined) {
    defaults = migrateLegacyConfig(items[StorageKey.CONFIG]).defaults;
  } else {
    defaults = defaultSettings();
  }
  validateSettings(defaults, { partial: false, path: 'defaults' });
  return defaults;
}

/**
 * Every valid site item, sorted by (order, id); invalid ones are reported.
 *
 * @param {object} items
 * @returns {{sites: object[], invalidSites: Array<{key: string, error: string}>}}
 */
function assembleV3Sites(items) {
  const sites = [];
  const invalidSites = [];
  for (const [key, value] of Object.entries(items)) {
    if (!isSiteKey(key)) continue;
    try {
      validateSite(value, key);
      sites.push(value);
    } catch (error) {
      console.error('[steer-clear] skipping invalid site item', { key, error: error.message });
      invalidSites.push({ key, error: error.message });
    }
  }
  sites.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { sites, invalidSites };
}

/**
 * Assemble the in-memory config from every storage.sync item.
 *
 * Never throws for a partially delivered sync: a site item that has not
 * arrived yet is simply absent until its own change event.
 *
 * @param {object} items The result of `storage.sync.get(null)`.
 * @returns {{schemaVersion: number, defaults: object, sites: object[],
 *   invalidSites: Array<{key: string, error: string}>}}
 * @throws {Error} When a newer version wrote the settings, or the global
 *   settings are invalid.
 */
export function assembleConfig(items) {
  if (!items || typeof items !== 'object') {
    throw new Error('assembleConfig: items must be an object');
  }
  const marker = items[StorageKey.SCHEMA_MARKER];
  if (marker !== undefined && marker > SCHEMA_VERSION) {
    throw new Error(
      `assembleConfig: settings were saved by a newer version (schema ${marker}); update the extension`
    );
  }

  const defaults = assembleDefaults(items);

  if (isV3SitesMode(items)) {
    return { schemaVersion: SCHEMA_VERSION, defaults, ...assembleV3Sites(items) };
  }

  const legacy = items[StorageKey.CONFIG];
  const sites = legacy === undefined ? [] : migrateLegacyConfig(legacy).sites;
  return { schemaVersion: SCHEMA_VERSION, defaults, sites, invalidSites: [] };
}

/**
 * The quota size of one item: UTF-8 bytes of the key plus its JSON value.
 * String length would undercount every non-ASCII character.
 *
 * @param {string} key
 * @param {unknown} value
 * @returns {number}
 */
export function itemBytes(key, value) {
  return encoder.encode(key + JSON.stringify(value)).length;
}

/**
 * Throw if writing `set` (and removing `remove`) would break a sync quota.
 * Checked before writing, so a violation writes nothing.
 *
 * @param {object} set Items about to be written.
 * @param {object} currentItems Every sync item now.
 * @param {string[]} [remove] Keys about to be removed.
 * @throws {Error} Naming the item and its size, or the total.
 */
export function assertSyncQuota(set, currentItems, remove = []) {
  for (const [key, value] of Object.entries(set)) {
    const bytes = itemBytes(key, value);
    if (bytes > SYNC_QUOTA_BYTES_PER_ITEM) {
      throw new Error(
        `${key} is ${bytes} bytes, over the ${SYNC_QUOTA_BYTES_PER_ITEM}-byte sync limit per item; shorten its reasons`
      );
    }
  }

  const after = { ...currentItems, ...set };
  for (const key of remove) delete after[key];

  const count = Object.keys(after).length;
  if (count > SYNC_MAX_ITEMS) {
    throw new Error(`sync storage would hold ${count} items, over the limit of ${SYNC_MAX_ITEMS}`);
  }
  const total = Object.entries(after).reduce((sum, [key, value]) => sum + itemBytes(key, value), 0);
  if (total > SYNC_QUOTA_BYTES) {
    throw new Error(`sync storage total would be ${total} bytes, over the limit of ${SYNC_QUOTA_BYTES}`);
  }
}
