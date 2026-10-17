/**
 * Add sites and ask for access to them, in the one order that works in
 * every browser: the worker message leaves first, without waiting, and the
 * permission prompt opens in the same synchronous tick.
 *
 * Firefox drops the user gesture at the first `await` and may close a popup
 * as soon as the prompt opens, so nothing may depend on code after the
 * prompt. The sites are stored either way; a refused prompt leaves them as
 * "needs access" in settings, and the worker's permissions.onAdded rebuild
 * activates them when access is granted later.
 *
 * Used by popup quick-add, onboarding's "Turn on" and the settings add form.
 */

import { MessageType } from '../constants.js';
import { originPatternsFor } from '../background/permissions.js';
import { sendWithoutAwait } from './messaging.js';

/**
 * Must be called directly from a click (or submit) handler, before any await.
 *
 * @param {Array<{host: string, reason?: string}>} entries Normalized hosts.
 * @returns {Promise<boolean>} Whether access was granted.
 * @throws {Error} Synchronously, on an empty list, before anything is sent.
 */
export function addSitesThenRequestAccess(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('addSitesThenRequestAccess: needs at least one site');
  }
  const hosts = entries.map((entry) => entry.host);
  const origins = hosts.flatMap(originPatternsFor);

  sendWithoutAwait({ type: MessageType.ADD_SITES, entries });
  return chrome.permissions.request({ origins }).then(
    (granted) => {
      console.info('[steer-clear] host access request', { hosts, granted });
      return granted;
    },
    (error) => {
      console.error('[steer-clear] host access request failed', { hosts, error: error.message });
      throw error;
    }
  );
}
