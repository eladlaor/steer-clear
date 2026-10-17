/**
 * What the worker does when the extension is installed or updated.
 *
 * Never writes settings: reading returns defaults (or the synced settings)
 * until the user changes something, so a second device can never overwrite
 * settings that sync has not delivered yet. A first install opens
 * onboarding; an update opens nothing.
 */

import { INSTALL_REASON, ONBOARDING_PATH, STATS_PRUNE_ALARM, STATS_PRUNE_PERIOD_MINUTES } from '../constants.js';
import { rebuildRules, resetSessionRules } from './rule_sync.js';
import { pruneStoredStats } from './stats_store.js';

/**
 * Make sure the daily stats-retention alarm exists, without resetting its
 * period when it does. Firefox does not keep alarms across browser sessions
 * (Chrome may also clear them on restart), so this runs on every worker
 * start and browser startup, not only on install.
 *
 * @returns {Promise<void>}
 */
export async function ensurePruneAlarm() {
  try {
    if (await chrome.alarms.get(STATS_PRUNE_ALARM)) return;
    await chrome.alarms.create(STATS_PRUNE_ALARM, { periodInMinutes: STATS_PRUNE_PERIOD_MINUTES });
    console.info('[steer-clear] stats prune alarm created');
  } catch (error) {
    console.error('[steer-clear] ensurePruneAlarm failed', { error: error.message });
    throw error;
  }
}

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
    await ensurePruneAlarm();
    await rebuildRules();
    console.info('[steer-clear] installed', { reason: details.reason, previousVersion: details.previousVersion });
  } catch (error) {
    console.error('[steer-clear] onInstalled failed', { reason: details.reason, error: error.message });
    throw error;
  }
}

/**
 * Browser startup: rebuild without the session's bypasses and snooze (gone
 * by definition), and catch up on retention, whose alarm may not have
 * survived the restart. Each part is attempted even if the other fails.
 *
 * @param {number} now Epoch ms.
 * @returns {Promise<void>}
 * @throws {Error} The first failure, after both parts were attempted.
 */
export async function handleStartup(now) {
  const failures = [];
  try {
    await resetSessionRules();
  } catch (error) {
    console.error('[steer-clear] startup rebuild failed', { error: error.message });
    failures.push(error);
  }
  try {
    await ensurePruneAlarm();
    await pruneStoredStats(now);
  } catch (error) {
    console.error('[steer-clear] startup retention failed', { error: error.message });
    failures.push(error);
  }
  if (failures.length > 0) throw failures[0];
}
