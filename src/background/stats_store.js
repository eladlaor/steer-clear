/**
 * Persistence for interception statistics.
 *
 * Single responsibility: moving the stats record in and out of
 * chrome.storage.local. All aggregation lives in stats.js.
 *
 * storage.local, not storage.sync — deliberately. Sync would replicate a log
 * of the user's blocked-site attempts across every machine on their Chrome
 * profile and through Google's servers. It also has a 100 KB quota that a
 * 90-day event log would eventually breach, failing writes silently.
 */

import { StorageKey } from '../constants.js';
import { emptyStats, recordInterception, pruneEvents } from './stats.js';

/**
 * Read the stats record, returning an empty one on first run.
 *
 * @returns {Promise<object>}
 */
export async function readStats() {
  try {
    const stored = await chrome.storage.local.get(StorageKey.STATS);
    return stored[StorageKey.STATS] ?? emptyStats();
  } catch (error) {
    console.error('[steer-clear] readStats failed', { error: error.message });
    throw error;
  }
}

/**
 * Persist a stats record.
 *
 * @param {object} stats
 * @returns {Promise<void>}
 */
export async function writeStats(stats) {
  try {
    await chrome.storage.local.set({ [StorageKey.STATS]: stats });
  } catch (error) {
    console.error('[steer-clear] writeStats failed', { error: error.message });
    throw error;
  }
}

/**
 * Record one interception and persist the result.
 *
 * Failure is logged and swallowed: statistics are a side observation, and
 * losing a count must never break the redirect the user actually depends on.
 * This is the one place in the codebase that deliberately does not re-raise.
 *
 * @param {string} host The configured host that was intercepted.
 * @param {number} at Epoch ms.
 * @returns {Promise<void>}
 */
export async function logInterception(host, at) {
  try {
    const stats = await readStats();
    await writeStats(recordInterception(stats, host, at));
  } catch (error) {
    console.error('[steer-clear] logInterception failed; continuing', {
      host,
      error: error.message,
    });
  }
}

/**
 * Drop expired events and persist, so retention holds even for a user who
 * stops triggering interceptions.
 *
 * @param {number} now Epoch ms.
 * @returns {Promise<void>}
 */
export async function pruneStoredStats(now) {
  try {
    const stats = await readStats();
    const pruned = pruneEvents(stats, now);
    if (pruned !== stats) {
      await writeStats(pruned);
      console.info('[steer-clear] pruned expired stats events', {
        removed: stats.events.length - pruned.events.length,
      });
    }
  } catch (error) {
    console.error('[steer-clear] pruneStoredStats failed', {
      error: error.message,
    });
  }
}

/**
 * Erase all recorded statistics.
 *
 * @returns {Promise<void>}
 */
export async function clearStats() {
  try {
    await chrome.storage.local.remove(StorageKey.STATS);
    console.info('[steer-clear] stats cleared');
  } catch (error) {
    console.error('[steer-clear] clearStats failed', { error: error.message });
    throw error;
  }
}
