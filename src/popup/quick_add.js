/**
 * Popup quick-add: "Steer clear of <host>" for the tab the user is on.
 *
 * Kept free of the DOM so the click handler's call order (message, then
 * permission prompt, no await between) is unit-tested.
 */

import { QUICK_ADD_STRIPPED_PREFIX, SOURCE_URL_PROTOCOLS } from '../constants.js';
import { findMatchingSite, normalizePattern } from '../background/rules.js';
import { addSitesThenRequestAccess } from '../shared/site_access.js';

/**
 * The host quick-add would list for a tab, or null when the tab is not a
 * web page that can be listed (browser pages, extension pages, files,
 * single-label hosts such as localhost).
 *
 * @param {string|undefined} url The tab's URL; undefined when unreadable.
 * @returns {string|null}
 */
export function quickAddHost(url) {
  if (typeof url !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!SOURCE_URL_PROTOCOLS.includes(parsed.protocol)) return null;

  let host = parsed.hostname;
  const bare = host.slice(QUICK_ADD_STRIPPED_PREFIX.length);
  if (host.startsWith(QUICK_ADD_STRIPPED_PREFIX) && bare.includes('.')) host = bare;
  if (!host.includes('.')) return null;
  return normalizePattern(host);
}

/**
 * What the popup offers for a tab: the host quick-add would list, and the
 * listed site that already covers it, if any.
 *
 * A turned-off site, or one listed under the same host without its
 * subdomains, does not match the tab, but ADD_SITES would skip it as a
 * duplicate; offering it would report "added" while nothing changes. So it
 * counts as listed.
 *
 * @param {string|undefined} url The tab's URL.
 * @param {{sites: object[]}} config A readable config.
 * @returns {{host: string, listed: object|null}|null} Null for a page that
 *   cannot be listed.
 */
export function quickAddOffer(url, config) {
  const host = quickAddHost(url);
  if (host === null) return null;
  const listed =
    findMatchingSite(config, url) ?? config.sites.find((site) => normalizePattern(site.pattern) === host) ?? null;
  return { host, listed };
}

/**
 * The quick-add click handler.
 *
 * @param {string} host From quickAddHost.
 * @returns {Promise<boolean>} Whether access was granted.
 */
export function quickAdd(host) {
  return addSitesThenRequestAccess([{ host }]);
}
