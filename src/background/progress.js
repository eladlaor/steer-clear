/**
 * Honest progress figures, derived from the outcome-tagged event log.
 *
 * Nothing here is counted separately: every figure follows from `stats.events`,
 * so erasing statistics resets all of them, which is what an erase should do.
 *
 * Definitions (the contract for the stats page and the daily allowance):
 * - Steered clear = outcome `left` or `steered`: the user did not continue.
 * - Steer rate = steered clear / (steered clear + continued) over the
 *   outcome-tagged events in a window; null when there are none.
 * - Steered-clear days = local days among the last N, counting today, with
 *   at least one steered-clear event. A continue never breaks or resets it.
 * - Continues today = that host's `continued` events since local midnight.
 * - steerCount = `steered` only, the active choice (the rating threshold).
 *
 * Events from before outcome tracking have no outcome and count in none of
 * these. Pure: the clock is passed in.
 */

import { MS_PER_DAY, Outcome } from '../constants.js';
import { localDateKey } from './stats.js';

/**
 * @param {{outcome?: string}} event
 * @returns {boolean} Whether the user did not continue.
 */
function isSteeredClear(event) {
  return event.outcome === Outcome.LEFT || event.outcome === Outcome.STEERED;
}

/**
 * @param {number} now Epoch ms.
 * @returns {number} Epoch ms of the local midnight that started that day.
 */
export function startOfLocalDay(now) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/**
 * @param {object} stats
 * @returns {number} Views where the user chose the destination.
 */
export function steerCount(stats) {
  return stats.events.filter((event) => event.outcome === Outcome.STEERED).length;
}

/**
 * @param {object} stats
 * @param {string} host The configured host.
 * @param {number} now Epoch ms.
 * @returns {number} The host's continues since local midnight, counted by
 *   when the continue happened (events from before `continuedAt` was
 *   recorded fall back to the view's time).
 */
export function continuesToday(stats, host, now) {
  const midnight = startOfLocalDay(now);
  return stats.events.filter(
    (event) => event.host === host && event.outcome === Outcome.CONTINUED && (event.continuedAt ?? event.at) >= midnight
  ).length;
}

/**
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @param {number} days Window length.
 * @returns {{steeredClear: number, continued: number, rate: number|null}}
 */
export function steerRate(stats, now, days) {
  const cutoff = now - days * MS_PER_DAY;
  let steeredClear = 0;
  let continued = 0;
  for (const event of stats.events) {
    if (event.at < cutoff) continue;
    if (isSteeredClear(event)) steeredClear += 1;
    else if (event.outcome === Outcome.CONTINUED) continued += 1;
  }
  const total = steeredClear + continued;
  return { steeredClear, continued, rate: total === 0 ? null : steeredClear / total };
}

/**
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @param {number} days How many local days to look back, counting today.
 * @returns {{days: number, of: number}}
 */
export function steeredClearDays(stats, now, days) {
  const today = new Date(now);
  const window = new Set();
  for (let back = 0; back < days; back += 1) {
    // Calendar arithmetic, not 24-hour steps, so DST days are not skipped.
    window.add(localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back)));
  }
  const hit = new Set(
    stats.events
      .filter(isSteeredClear)
      .map((event) => localDateKey(new Date(event.at)))
      .filter((key) => window.has(key))
  );
  return { days: hit.size, of: days };
}

/**
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @returns {{intercepted: number, steeredClear: number, continued: number}}
 *   Since local midnight.
 */
export function todaySummary(stats, now) {
  const midnight = startOfLocalDay(now);
  const today = stats.events.filter((event) => event.at >= midnight);
  return {
    intercepted: today.length,
    steeredClear: today.filter(isSteeredClear).length,
    continued: today.filter((event) => event.outcome === Outcome.CONTINUED).length,
  };
}

/**
 * @param {object} stats
 * @returns {Object<string, {steeredClear: number, continued: number}>}
 *   Per host, over the retained outcome-tagged events.
 */
export function outcomesByHost(stats) {
  const byHost = {};
  for (const event of stats.events) {
    if (event.outcome === undefined) continue;
    byHost[event.host] ??= { steeredClear: 0, continued: 0 };
    if (isSteeredClear(event)) byHost[event.host].steeredClear += 1;
    else if (event.outcome === Outcome.CONTINUED) byHost[event.host].continued += 1;
  }
  return byHost;
}
