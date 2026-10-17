/**
 * Noticing a change of the device's UTC offset while a timed schedule is in
 * use.
 *
 * The schedule alarm holds an absolute moment computed in the offset of the
 * last rebuild. After a move across timezones, or a DST change, that moment
 * is no longer the schedule's local boundary, and the old rules would stay
 * until it fired. A periodic check compares the offset with the one stored
 * at the last rebuild; the worker rebuilds when they differ.
 */

import { StorageKey, TIMEZONE_CHECK_ALARM, TIMEZONE_CHECK_PERIOD_MINUTES } from '../constants.js';

/**
 * @param {number} now Epoch ms.
 * @returns {number} The device's offset at that moment (Date#getTimezoneOffset).
 */
export function utcOffsetAt(now) {
  return new Date(now).getTimezoneOffset();
}

/**
 * Whether the offset changed since the last rebuild.
 *
 * @param {number|undefined} storedOffset The offset stored at the last rebuild.
 * @param {number} currentOffset
 * @returns {boolean} False when nothing was stored (no timed schedule).
 * @throws {Error} On a current offset that is not a number.
 */
export function utcOffsetChanged(storedOffset, currentOffset) {
  if (!Number.isFinite(currentOffset)) {
    throw new Error(`utcOffsetChanged: currentOffset must be minutes, got ${currentOffset}`);
  }
  if (storedOffset === undefined || storedOffset === null) return false;
  return storedOffset !== currentOffset;
}

/**
 * Keep the periodic check running while a timed schedule is in use, and
 * record the offset the schedule alarm was computed in. Called by every
 * rebuild.
 *
 * @param {boolean} hasTimedSchedule Whether a schedule alarm is set.
 * @param {number} now Epoch ms the rebuild used.
 * @returns {Promise<void>}
 */
export async function syncTimezoneWatch(hasTimedSchedule, now) {
  try {
    if (!hasTimedSchedule) {
      await chrome.alarms.clear(TIMEZONE_CHECK_ALARM);
      await chrome.storage.session.remove(StorageKey.SCHEDULE_TZ_OFFSET);
      return;
    }
    await chrome.storage.session.set({ [StorageKey.SCHEDULE_TZ_OFFSET]: utcOffsetAt(now) });
    // Created only when missing, so frequent rebuilds do not keep pushing
    // the first check back.
    if (!(await chrome.alarms.get(TIMEZONE_CHECK_ALARM))) {
      await chrome.alarms.create(TIMEZONE_CHECK_ALARM, { periodInMinutes: TIMEZONE_CHECK_PERIOD_MINUTES });
    }
  } catch (error) {
    console.error('[steer-clear] syncTimezoneWatch failed', { hasTimedSchedule, error: error.message });
    throw error;
  }
}

/**
 * @param {number} now Epoch ms.
 * @returns {Promise<boolean>} Whether the offset differs from the last rebuild's.
 */
export async function timezoneChangedSinceRebuild(now) {
  try {
    const stored = await chrome.storage.session.get(StorageKey.SCHEDULE_TZ_OFFSET);
    return utcOffsetChanged(stored[StorageKey.SCHEDULE_TZ_OFFSET], utcOffsetAt(now));
  } catch (error) {
    console.error('[steer-clear] timezoneChangedSinceRebuild failed', { error: error.message });
    throw error;
  }
}
