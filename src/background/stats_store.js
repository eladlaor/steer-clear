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
import { applyOutcome, normalizeStats, pruneEvents, recordView as addView } from './stats.js';
import { createSerialQueue } from './serial_queue.js';

/**
 * Every stats write reads, transforms and writes. Two pause pages reporting
 * at once would otherwise both read the old record and one view would be
 * lost, so writes queue.
 */
const statsQueue = createSerialQueue();

/**
 * Read the stats record, returning an empty one on first run.
 *
 * @returns {Promise<object>}
 */
export async function readStats() {
  try {
    const stored = await chrome.storage.local.get(StorageKey.STATS);
    return normalizeStats(stored[StorageKey.STATS]);
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
 * Record one pause-page view and persist the result.
 *
 * Failure is logged and swallowed: statistics are a side observation, and
 * losing a count must never break the pause page the user actually depends
 * on. Recording views and outcomes are the only places in the codebase that
 * deliberately do not re-raise.
 *
 * @param {{viewId: string, host: string, now: number}} view `host` is the
 *   configured host.
 * @returns {Promise<string|null>} The id of the event the view is counted
 *   under (an earlier one when it merged), or null when recording failed.
 */
export function recordView(view) {
  return statsQueue.run(async () => {
    try {
      const stats = await readStats();
      const { stats: next, eventId } = addView(stats, view);
      if (next !== stats) await writeStats(next);
      return eventId;
    } catch (error) {
      console.error('[steer-clear] recordView failed; continuing', { host: view?.host, error: error.message });
      return null;
    }
  });
}

/**
 * Record what the user did after a view, and persist. Failure is logged and
 * swallowed, as for recordView.
 *
 * @param {string} eventId An id recordView returned.
 * @param {string} outcome Outcome.STEERED or Outcome.CONTINUED.
 * @returns {Promise<void>}
 */
export function recordOutcome(eventId, outcome) {
  return statsQueue.run(async () => {
    try {
      const stats = await readStats();
      const next = applyOutcome(stats, eventId, outcome);
      if (next !== stats) await writeStats(next);
    } catch (error) {
      console.error('[steer-clear] recordOutcome failed; continuing', { eventId, outcome, error: error.message });
    }
  });
}

/**
 * Drop expired events and persist, so retention holds even for a user who
 * stops triggering interceptions.
 *
 * @param {number} now Epoch ms.
 * @returns {Promise<void>}
 */
export function pruneStoredStats(now) {
  return statsQueue.run(() => pruneNow(now));
}

/** @param {number} now */
async function pruneNow(now) {
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
export function clearStats() {
  return statsQueue.run(async () => {
    try {
      await chrome.storage.local.remove(StorageKey.STATS);
      console.info('[steer-clear] stats cleared');
    } catch (error) {
      console.error('[steer-clear] clearStats failed', { error: error.message });
      throw error;
    }
  });
}
