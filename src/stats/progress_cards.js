/**
 * The "is this working?" cards on the stats page: steer rate, steered-clear
 * days and today. Every figure comes from progress.js; this module only
 * formats and paints. A figure with no data shows "—", never a made-up 0%.
 */

import { STEER_RATE_WINDOW_DAYS, STEERED_DAYS_WINDOW } from '../constants.js';
import { steerRate, steeredClearDays, todaySummary } from '../background/progress.js';

/** Shown in place of a figure that has no data behind it. */
const NO_DATA = '—';

/**
 * @param {{rateValue: HTMLElement, rateDetail: HTMLElement, daysValue: HTMLElement,
 *   daysLabel: HTMLElement, todayValue: HTMLElement, todayDetail: HTMLElement,
 *   outcomesSince: HTMLElement}} elements
 * @param {object} stats A normalized stats record.
 * @param {number} now Epoch ms.
 */
export function renderProgress(elements, stats, now) {
  const rate = steerRate(stats, now, STEER_RATE_WINDOW_DAYS);
  elements.rateValue.textContent = rate.rate === null ? NO_DATA : `${Math.round(rate.rate * 100)}%`;
  elements.rateDetail.textContent =
    `steered clear vs continued, last ${STEER_RATE_WINDOW_DAYS} days ` +
    `(${rate.steeredClear} vs ${rate.continued})`;

  const days = steeredClearDays(stats, now, STEERED_DAYS_WINDOW);
  elements.daysValue.textContent = `${days.days} of ${days.of}`;
  elements.daysLabel.textContent = `days you steered clear, of the last ${days.of}`;

  const today = todaySummary(stats, now);
  elements.todayValue.textContent = String(today.intercepted);
  elements.todayDetail.textContent =
    `${today.intercepted === 1 ? 'pause' : 'pauses'} today: ` +
    `${today.steeredClear} steered clear, ${today.continued} continued`;

  elements.outcomesSince.textContent =
    stats.outcomesSince === null
      ? 'Your choices on the pause page are tracked from your next pause.'
      : `Choices tracked since ${new Date(stats.outcomesSince).toLocaleDateString()}.`;
}

/**
 * The per-site line under a site's bar, or '' when it has no choices yet.
 *
 * @param {{steeredClear: number, continued: number}|undefined} outcomes
 * @returns {string}
 */
export function siteOutcomeText(outcomes) {
  if (!outcomes) return '';
  return `${outcomes.steeredClear} steered clear, ${outcomes.continued} continued`;
}
