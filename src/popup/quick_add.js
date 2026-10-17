/**
 * Popup quick-add: "Steer clear of <host>" for the tab the user is on.
 *
 * Kept free of the DOM so the click handler's call order (message, then
 * permission prompt, no await between) is unit-tested.
 */

import { QUICK_ADD_STRIPPED_PREFIX, SOURCE_URL_PROTOCOLS } from '../constants.js';
import { normalizePattern } from '../background/rules.js';
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
 * The quick-add click handler.
 *
 * @param {string} host From quickAddHost.
 * @returns {Promise<boolean>} Whether access was granted.
 */
export function quickAdd(host) {
  return addSitesThenRequestAccess([{ host }]);
}
