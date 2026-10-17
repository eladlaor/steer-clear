/**
 * Add sites and ask for access to them, in the one order that works in
 * every browser: the worker message leaves first, without waiting, and the
 * permission prompt opens in the same synchronous tick.
 *
 * Firefox drops the user gesture at the first `await` and may close a popup
 * as soon as the prompt opens, so nothing may run between the two calls. A
 * refused prompt leaves the stored sites as "needs access" in settings, and
 * the worker's permissions.onAdded rebuild activates them when access is
 * granted later.
 *
 * The add itself can fail (sync quota, the site limit, settings from a newer
 * version). Then nothing was stored, so the caller must not report the site
 * as added, and any access the prompt just gave is handed back: access to a
 * site that is not listed is the over-reach removing a site avoids.
 *
 * Used by popup quick-add, onboarding's "Turn on" and the settings add form.
 */

import { MessageType } from '../constants.js';
import { originPatternsFor, revokeHostPermission } from '../background/permissions.js';
import { sendMessage } from './messaging.js';

/** The worker did not store the sites; the message says why. */
export class SitesNotAddedError extends Error {
  /**
   * @param {string[]} hosts
   * @param {Error} cause The worker's error.
   */
  constructor(hosts, cause) {
    super(`Could not add ${hosts.join(', ')}: ${cause.message}`);
    this.name = 'SitesNotAddedError';
    this.hosts = hosts;
  }
}

/**
 * Must be called directly from a click (or submit) handler, before any await.
 *
 * @param {Array<{host: string, reason?: string}>} entries Normalized hosts.
 * @returns {Promise<boolean>} Whether access was granted, once the sites are
 *   stored.
 * @throws {Error} Synchronously, on an empty list, before anything is sent.
 *   The promise rejects with SitesNotAddedError when the worker stored
 *   nothing (after giving back any access just granted), or with the prompt's
 *   own error.
 */
export function addSitesThenRequestAccess(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('addSitesThenRequestAccess: needs at least one site');
  }
  const hosts = entries.map((entry) => entry.host);
  const origins = hosts.flatMap(originPatternsFor);

  // Both calls start in this tick; only their results are awaited.
  const added = sendMessage({ type: MessageType.ADD_SITES, entries });
  const granted = chrome.permissions.request({ origins });

  return Promise.allSettled([added, granted]).then(async ([addResult, grantResult]) => {
    if (grantResult.status === 'fulfilled') {
      console.info('[steer-clear] host access request', { hosts, granted: grantResult.value });
    } else {
      console.error('[steer-clear] host access request failed', { hosts, error: grantResult.reason.message });
    }
    if (addResult.status === 'rejected') {
      console.error('[steer-clear] adding sites failed; nothing was stored', {
        hosts,
        error: addResult.reason.message,
      });
      if (grantResult.status === 'fulfilled' && grantResult.value) {
        for (const host of hosts) await revokeHostPermission(host);
      }
      throw new SitesNotAddedError(hosts, addResult.reason);
    }
    if (grantResult.status === 'rejected') throw grantResult.reason;
    return grantResult.value;
  });
}
