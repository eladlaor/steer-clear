/**
 * What the worker does when the extension is installed or updated.
 *
 * Never writes settings: reading returns defaults (or the synced settings)
 * until the user changes something, so a second device can never overwrite
 * settings that sync has not delivered yet. A first install opens
 * onboarding; an update opens nothing.
 */

import { INSTALL_REASON, ONBOARDING_PATH, STATS_PRUNE_ALARM, STATS_PRUNE_PERIOD_MINUTES } from '../constants.js';
import { rebuildRules } from './rule_sync.js';

/**
 * @param {{reason: string, previousVersion?: string}} details runtime.onInstalled details.
 * @returns {Promise<void>}
 * @throws {Error} When a step fails; the error names the reason.
 */
export async function handleInstalled(details) {
  try {
    if (details.reason === INSTALL_REASON) {
      await chrome.tabs.create({ url: chrome.runtime.getURL(ONBOARDING_PATH) });
    }
    await chrome.alarms.create(STATS_PRUNE_ALARM, { periodInMinutes: STATS_PRUNE_PERIOD_MINUTES });
    await rebuildRules();
    console.info('[steer-clear] installed', { reason: details.reason, previousVersion: details.previousVersion });
  } catch (error) {
    console.error('[steer-clear] onInstalled failed', { reason: details.reason, error: error.message });
    throw error;
  }
}
