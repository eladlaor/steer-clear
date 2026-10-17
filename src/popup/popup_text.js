/**
 * Words and numbers the popup shows. Pure, so the wording is unit-tested.
 */

import { MINUTES_PER_HOUR, MS_PER_MINUTE } from '../constants.js';
import { siteLabel } from '../background/rules.js';

/**
 * @param {number} minutes A snooze length.
 * @returns {string} "15 min", "1 hour", "2 hours".
 */
export function snoozeOptionLabel(minutes) {
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw new Error(`snoozeOptionLabel: expected a positive whole number of minutes, got ${minutes}`);
  }
  if (minutes % MINUTES_PER_HOUR !== 0) return `${minutes} min`;
  const hours = minutes / MINUTES_PER_HOUR;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * Whole minutes left, rounded up, so "1 min left" shows until the very end.
 *
 * @param {number} until Epoch ms.
 * @param {number} now Epoch ms.
 * @returns {number} 0 once the time has passed.
 */
export function minutesLeft(until, now) {
  return Math.max(0, Math.ceil((until - now) / MS_PER_MINUTE));
}

/**
 * @param {{intercepted: number, steeredClear: number, continued: number}} today
 * @returns {{figure: string, detail: string}}
 */
export function todayText(today) {
  const pauses = today.intercepted === 1 ? 'pause' : 'pauses';
  return {
    figure: `${today.intercepted} ${pauses} today`,
    detail:
      today.intercepted === 0
        ? 'Nothing has caught you today.'
        : `${today.steeredClear} steered clear, ${today.continued} continued`,
  };
}

/**
 * @param {{days: number, of: number}} days From steeredClearDays.
 * @returns {string}
 */
export function steeredDaysText({ days, of }) {
  return `You steered clear on ${days} of the last ${of} days.`;
}

/**
 * @param {{pattern: string, displayName: string|null, enabled: boolean}} site
 *   The listed site that covers the active tab.
 * @returns {string}
 */
export function listedText(site) {
  const label = siteLabel(site);
  return site.enabled ? `${label} is on your list.` : `${label} is on your list but turned off. Turn it on in Settings.`;
}
