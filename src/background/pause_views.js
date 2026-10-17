/**
 * Recording what happens on the pause page: one event per view, and the
 * user's choice on it.
 *
 * Side observations: a failure is logged and the page keeps working, so
 * nothing here throws for a storage or config problem. A malformed request
 * is a programming error and does throw.
 */

import { Outcome } from '../constants.js';
import { readConfig } from './config.js';
import { findMatchingSite, normalizePattern } from './rules.js';
import { recordOutcome, recordView } from './stats_store.js';

/**
 * Record one pause-page view under the configured host it matched.
 *
 * @param {string} viewId The page's id for this view (kept in history.state).
 * @param {string} fromUrl The originally-requested URL.
 * @returns {Promise<string|null>} The event id the view counts under, or
 *   null when nothing was recorded (no listed site matched, or the settings
 *   or statistics could not be read).
 */
export async function recordPauseView(viewId, fromUrl) {
  if (typeof viewId !== 'string' || viewId === '') {
    throw new Error(`RECORD_VIEW: viewId must be a non-empty string, got ${JSON.stringify(viewId)}`);
  }
  let site;
  try {
    site = findMatchingSite(await readConfig(), fromUrl);
  } catch (error) {
    console.error('[steer-clear] settings unreadable; this view is not recorded', { error: error.message });
    return null;
  }
  if (!site) {
    console.info('[steer-clear] pause view matches no listed site; not recorded', { fromUrl });
    return null;
  }
  // The configured host, so www.x.com and m.x.com count under the user's entry.
  return recordView({ viewId, host: normalizePattern(site.pattern), now: Date.now() });
}

/**
 * Record that the user chose the destination on a view.
 *
 * @param {string} eventId The id RECORD_VIEW returned.
 * @param {string} outcome Must be Outcome.STEERED; continuing is recorded by
 *   GRANT_BYPASS.
 * @returns {Promise<void>}
 */
export async function recordSteered(eventId, outcome) {
  if (outcome !== Outcome.STEERED) {
    throw new Error(`RECORD_OUTCOME: outcome must be "${Outcome.STEERED}", got ${JSON.stringify(outcome)}`);
  }
  if (typeof eventId !== 'string' || eventId === '') {
    throw new Error(`RECORD_OUTCOME: eventId must be a non-empty string, got ${JSON.stringify(eventId)}`);
  }
  await recordOutcome(eventId, Outcome.STEERED);
}

/**
 * Check GRANT_BYPASS's optional event id before anything is granted, so a
 * malformed request fails without leaving a bypass behind.
 *
 * @param {unknown} eventId
 * @throws {Error} If present but not a non-empty string.
 */
export function assertOptionalEventId(eventId) {
  if (eventId === undefined || eventId === null) return;
  if (typeof eventId !== 'string' || eventId === '') {
    throw new Error(`GRANT_BYPASS: eventId must be a non-empty string, got ${JSON.stringify(eventId)}`);
  }
}

/**
 * Record that the user continued through a view, when the page knows which.
 *
 * @param {string|null|undefined} eventId Checked with assertOptionalEventId.
 * @returns {Promise<void>}
 */
export async function recordContinued(eventId) {
  assertOptionalEventId(eventId);
  if (eventId === undefined || eventId === null) {
    console.info('[steer-clear] continue without a recorded view; not counted');
    return;
  }
  await recordOutcome(eventId, Outcome.CONTINUED);
}
