/**
 * Pure planners for every config mutation.
 *
 * Each takes the current storage.sync items and one request and returns
 * `{ set, remove }`: the exact items to write and keys to delete. The worker
 * runs them one at a time against freshly read items, so a page that edits
 * from an older copy can never overwrite a change made elsewhere.
 *
 * Safety rules, enforced here:
 * - write only what changed; remove only the site the user removed;
 * - never write or remove the legacy `config` item;
 * - the first write of any kind materializes the legacy sites as `site:<id>`
 *   items and sets the `schema` marker. It does not write `settings`.
 */

import { MAX_SITES, SCHEMA_VERSION, StorageKey } from '../constants.js';
import { normalizePattern } from './rules.js';
import { PER_SITE_FIELDS, validateSettings, validateSite } from './settings_schema.js';
import { assembleConfig, isV3SitesMode, siteKey } from './sync_layout.js';

/** Site fields a settings edit may change. `pattern` and `id` are fixed. */
const EDITABLE_SITE_FIELDS = Object.freeze(['displayName', 'includeSubdomains', 'enabled']);

/**
 * A new site record.
 *
 * @param {string} host What the user typed; normalized here.
 * @param {{id: string, order: number, now: number, reason?: string}} options
 * @returns {object}
 */
export function newSite(host, { id, order, now, reason }) {
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  const site = {
    id,
    pattern: normalizePattern(host),
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: now,
    order,
    overrides: trimmed === '' ? {} : { reasons: [trimmed] },
  };
  validateSite(site, `site:${id}`);
  return site;
}

/**
 * The current config, plus the items the first write must also carry.
 *
 * @param {object} items Every sync item.
 * @returns {{config: object, base: object}} `base` is `{}` in v3 sites mode;
 *   otherwise the schema marker and every legacy site as its own item.
 */
function startPlan(items) {
  const config = assembleConfig(items);
  if (isV3SitesMode(items)) {
    return { config, base: {} };
  }
  const base = { [StorageKey.SCHEMA_MARKER]: SCHEMA_VERSION };
  for (const site of config.sites) base[siteKey(site.id)] = site;
  return { config, base };
}

/**
 * @param {object} config
 * @param {string} siteId
 * @returns {object} The site.
 * @throws {Error} If no listed site has that id.
 */
function findSite(config, siteId) {
  const site = config.sites.find((entry) => entry.id === siteId);
  if (!site) {
    throw new Error(`no listed site has id "${siteId}"; it may have been removed on another device`);
  }
  return site;
}

/**
 * @param {object} site
 * @returns {string|null} The site's normalized host, or null if unparseable.
 */
function hostOf(site) {
  try {
    return normalizePattern(site.pattern);
  } catch {
    return null;
  }
}

/**
 * Add sites. Hosts already listed (or repeated in the request) are skipped.
 *
 * @param {object} items
 * @param {{entries: Array<{host: string, reason?: string}>}} request
 * @param {{newId: () => string, now: number}} env Id source and clock.
 * @returns {{plan: {set: object, remove: string[]}, added: string[], skipped: string[]}}
 */
export function planAddSites(items, { entries }, { newId, now }) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('ADD_SITES needs at least one entry');
  }
  const { config, base } = startPlan(items);
  const listed = new Set(config.sites.map(hostOf));
  let order = config.sites.reduce((max, site) => Math.max(max, site.order), -1);

  const set = { ...base };
  const added = [];
  const skipped = [];
  for (const entry of entries) {
    const host = normalizePattern(entry?.host);
    if (listed.has(host)) {
      skipped.push(host);
      continue;
    }
    order += 1;
    const site = newSite(host, { id: newId(), order, now, reason: entry.reason });
    set[siteKey(site.id)] = site;
    listed.add(host);
    added.push(site.id);
  }

  if (config.sites.length + added.length > MAX_SITES) {
    throw new Error(`at most ${MAX_SITES} sites can be listed`);
  }
  return { plan: { set, remove: [] }, added, skipped };
}

/**
 * Change one site's own fields and its overrides.
 *
 * @param {object} items
 * @param {{siteId: string, fields?: object, setOverrides?: object,
 *   clearOverrides?: string[]}} request
 * @returns {{set: object, remove: string[]}}
 */
export function planUpdateSite(items, { siteId, fields = {}, setOverrides = {}, clearOverrides = [] }) {
  const { config, base } = startPlan(items);
  const site = findSite(config, siteId);

  for (const key of Object.keys(fields)) {
    if (!EDITABLE_SITE_FIELDS.includes(key)) {
      throw new Error(`UPDATE_SITE cannot change "${key}"; editable fields are ${EDITABLE_SITE_FIELDS.join(', ')}`);
    }
  }
  validateSettings(setOverrides, { partial: true, path: `${siteKey(siteId)}.overrides` });
  for (const key of clearOverrides) {
    if (!PER_SITE_FIELDS.includes(key)) {
      throw new Error(`UPDATE_SITE cannot clear "${key}": it is not a per-site setting`);
    }
  }

  const overrides = { ...site.overrides, ...structuredClone(setOverrides) };
  for (const key of clearOverrides) delete overrides[key];

  const updated = { ...site, ...fields, overrides };
  validateSite(updated, siteKey(siteId));
  return { set: { ...base, [siteKey(siteId)]: updated }, remove: [] };
}

/**
 * Remove one site.
 *
 * @param {object} items
 * @param {{siteId: string}} request
 * @returns {{set: object, remove: string[]}}
 */
export function planRemoveSite(items, { siteId }) {
  const { config, base } = startPlan(items);
  findSite(config, siteId);
  const set = { ...base };
  delete set[siteKey(siteId)];
  return { set, remove: [siteKey(siteId)] };
}

/**
 * Change global settings.
 *
 * @param {object} items
 * @param {{patch: object}} request Any subset of the SiteSettings fields.
 * @returns {{set: object, remove: string[]}}
 */
export function planUpdateDefaults(items, { patch }) {
  if (!patch || typeof patch !== 'object' || Object.keys(patch).length === 0) {
    throw new Error('UPDATE_DEFAULTS needs a non-empty patch');
  }
  const { config, base } = startPlan(items);
  const defaults = { ...config.defaults, ...structuredClone(patch) };
  validateSettings(defaults, { partial: false, path: 'defaults' });
  return { set: { ...base, [StorageKey.SETTINGS]: { defaults } }, remove: [] };
}
