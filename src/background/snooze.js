/**
 * Snooze: "turn every reminder off for N minutes". Pure timing and
 * validation; the session storage, alarm and rebuild live in rule_sync.js.
 *
 * Snooze skips the daily allowance and is not counted as a continue
 * (SNOOZE_ALLOWANCE_NOTE says so wherever it is offered). It dies with the
 * browser, like a bypass.
 */

import { MS_PER_MINUTE, SNOOZE_OPTIONS_MINUTES } from '../constants.js';

/**
 * @param {number} minutes One of SNOOZE_OPTIONS_MINUTES.
 * @param {number} now Epoch ms.
 * @returns {number} When the snooze ends, epoch ms.
 * @throws {Error} On a length the popup does not offer.
 */
export function snoozeEndsAt(minutes, now) {
  if (!SNOOZE_OPTIONS_MINUTES.includes(minutes)) {
    throw new Error(`snooze length must be one of ${SNOOZE_OPTIONS_MINUTES.join(', ')} minutes, got ${minutes}`);
  }
  return now + minutes * MS_PER_MINUTE;
}

/**
 * @param {{until: number}|undefined} stored The session `snooze` value.
 * @param {number} now Epoch ms.
 * @returns {number|null} When the running snooze ends, or null when none is running.
 * @throws {Error} On a malformed stored value.
 */
export function activeSnoozeUntil(stored, now) {
  if (stored === undefined || stored === null) return null;
  if (!Number.isFinite(stored.until)) {
    throw new Error(`activeSnoozeUntil: stored snooze.until must be epoch ms, got ${stored.until}`);
  }
  return stored.until > now ? stored.until : null;
}
