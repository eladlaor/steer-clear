/**
 * Unit tests for the honest progress figures derived from the event log.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  continuesToday,
  outcomesByHost,
  startOfLocalDay,
  steerCount,
  steerRate,
  steeredClearDays,
  todaySummary,
} from '../../src/background/progress.js';
import { normalizeStats } from '../../src/background/stats.js';
import { Outcome, STEERED_DAYS_WINDOW } from '../../src/constants.js';

const { LEFT, STEERED, CONTINUED } = Outcome;

/** 2026-03-15 10:30 local time. */
const NOW = new Date(2026, 2, 15, 10, 30).getTime();
/** Local noon `daysAgo` calendar days before NOW. */
const noonDaysAgo = (daysAgo) => new Date(2026, 2, 15 - daysAgo, 12, 0).getTime();

let nextId = 0;
/** One event; `outcome` undefined makes a legacy (pre-1.1) event. */
function ev(outcome, { host = 'reddit.com', at = NOW } = {}) {
  nextId += 1;
  return outcome === undefined ? { host, at } : { id: `e${nextId}`, host, at, outcome };
}

/** A stats record holding exactly these events. */
const stats = (events) => normalizeStats({ totals: {}, events, since: null });

/* steerCount (the rating threshold) ------------------------------------------------ */

test('steerCount counts steered events only', () => {
  const log = stats([ev(LEFT), ev(LEFT), ev(LEFT), ev(STEERED), ev(STEERED), ev(CONTINUED), ev(undefined)]);
  assert.equal(steerCount(log), 2);
});

/* continuesToday --------------------------------------------------------------------- */

test('continuesToday counts that host\'s continues since local midnight', () => {
  const midnight = startOfLocalDay(NOW);
  const log = stats([
    ev(CONTINUED, { at: midnight }),
    ev(CONTINUED, { at: NOW - 60_000 }),
    ev(CONTINUED, { at: midnight - 60_000 }), // yesterday 23:59
    ev(STEERED, { at: NOW }),
    ev(LEFT, { at: NOW }),
    ev(CONTINUED, { host: 'youtube.com', at: NOW }),
  ]);
  assert.equal(continuesToday(log, 'reddit.com', NOW), 2);
  assert.equal(continuesToday(log, 'youtube.com', NOW), 1);
  assert.equal(continuesToday(log, 'x.com', NOW), 0);
});

test('startOfLocalDay is local midnight of the same day', () => {
  const midnight = new Date(startOfLocalDay(NOW));
  assert.deepEqual(
    [midnight.getFullYear(), midnight.getMonth(), midnight.getDate(), midnight.getHours(), midnight.getMinutes()],
    [2026, 2, 15, 0, 0]
  );
});

/* steerRate ------------------------------------------------------------------------------ */

test('steerRate: 3 left, 1 steered and 1 continued give 0.8', () => {
  const log = stats([ev(LEFT), ev(LEFT), ev(LEFT), ev(STEERED), ev(CONTINUED)]);
  assert.deepEqual(steerRate(log, NOW, 30), { steeredClear: 4, continued: 1, rate: 0.8 });
});

test('steerRate leaves out legacy events without an outcome', () => {
  const log = stats([ev(undefined), ev(undefined), ev(STEERED), ev(CONTINUED)]);
  assert.deepEqual(steerRate(log, NOW, 30), { steeredClear: 1, continued: 1, rate: 0.5 });
});

test('steerRate is null with no outcome data', () => {
  assert.deepEqual(steerRate(stats([]), NOW, 30), { steeredClear: 0, continued: 0, rate: null });
  assert.equal(steerRate(stats([ev(undefined)]), NOW, 30).rate, null);
});

test('steerRate counts only events inside the window', () => {
  const log = stats([ev(CONTINUED, { at: noonDaysAgo(31) }), ev(STEERED, { at: noonDaysAgo(2) })]);
  assert.deepEqual(steerRate(log, NOW, 30), { steeredClear: 1, continued: 0, rate: 1 });
});

/* steeredClearDays ------------------------------------------------------------------------ */

test('steered-clear events on 5 distinct days of the last 7 give 5 of 7', () => {
  const log = stats([0, 1, 2, 4, 6].map((daysAgo) => ev(LEFT, { at: noonDaysAgo(daysAgo) })));
  assert.deepEqual(steeredClearDays(log, NOW, STEERED_DAYS_WINDOW), { days: 5, of: 7 });
});

test('a continue on a day with a steer still counts the day; a continue alone does not', () => {
  const log = stats([
    ev(STEERED, { at: noonDaysAgo(1) }),
    ev(CONTINUED, { at: noonDaysAgo(1) }),
    ev(CONTINUED, { at: noonDaysAgo(3) }),
  ]);
  assert.deepEqual(steeredClearDays(log, NOW, STEERED_DAYS_WINDOW), { days: 1, of: 7 });
});

test('events 7 and 8 days ago fall outside the last 7 days', () => {
  const log = stats([ev(STEERED, { at: noonDaysAgo(7) }), ev(LEFT, { at: noonDaysAgo(8) })]);
  assert.deepEqual(steeredClearDays(log, NOW, STEERED_DAYS_WINDOW), { days: 0, of: 7 });
});

test('several steers on one day count that day once, and legacy events never count', () => {
  const log = stats([ev(LEFT), ev(STEERED), ev(undefined, { at: noonDaysAgo(2) })]);
  assert.deepEqual(steeredClearDays(log, NOW, STEERED_DAYS_WINDOW), { days: 1, of: 7 });
});

/* todaySummary ------------------------------------------------------------------------------ */

test('todaySummary counts today\'s views, steers-clear and continues', () => {
  const log = stats([
    ev(LEFT),
    ev(STEERED),
    ev(CONTINUED),
    ev(CONTINUED, { host: 'youtube.com' }),
    ev(LEFT, { at: startOfLocalDay(NOW) - 1 }),
  ]);
  assert.deepEqual(todaySummary(log, NOW), { intercepted: 4, steeredClear: 2, continued: 2 });
});

/* outcomesByHost -------------------------------------------------------------------------------- */

test('outcomesByHost splits each host\'s outcome-tagged events', () => {
  const log = stats([
    ev(LEFT),
    ev(STEERED),
    ev(CONTINUED),
    ev(undefined),
    ev(CONTINUED, { host: 'youtube.com' }),
  ]);
  assert.deepEqual(outcomesByHost(log), {
    'reddit.com': { steeredClear: 2, continued: 1 },
    'youtube.com': { steeredClear: 0, continued: 1 },
  });
});
