/**
 * Unit tests for interception statistics aggregation.
 * Run: node --test tests/unit/
 *
 * Timestamps are passed in rather than read from the clock, so these tests are
 * deterministic and can exercise retention boundaries without fake timers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  emptyStats,
  recordInterception,
  pruneEvents,
  lifetimeTotal,
  totalsByHost,
  countsByHour,
  countsByWeekday,
  dailySeries,
  recentEvents,
  localDateKey,
  summarize,
} from '../../src/background/stats.js';
import { STATS_RETENTION_DAYS } from '../../src/constants.js';

const DAY = 24 * 60 * 60 * 1000;

/** A fixed reference point: 2026-03-15T10:30:00 local time. */
const NOW = new Date(2026, 2, 15, 10, 30, 0).getTime();

/**
 * Build a stats record from [host, offsetDays] pairs.
 *
 * @param {Array<[string, number]>} entries
 * @returns {object}
 */
function statsWith(entries) {
  return entries.reduce(
    (acc, [host, offsetDays]) =>
      recordInterception(acc, host, NOW - offsetDays * DAY),
    emptyStats()
  );
}

test('empty stats have no totals and no events', () => {
  const stats = emptyStats();
  assert.deepEqual(stats.totals, {});
  assert.deepEqual(stats.events, []);
  assert.equal(stats.since, null);
});

test('recording increments the per-host total', () => {
  let stats = emptyStats();
  stats = recordInterception(stats, 'ynet.co.il', NOW);
  stats = recordInterception(stats, 'ynet.co.il', NOW);
  assert.equal(stats.totals['ynet.co.il'], 2);
});

test('recording appends an event', () => {
  const stats = recordInterception(emptyStats(), 'ynet.co.il', NOW);
  assert.equal(stats.events.length, 1);
  assert.deepEqual(stats.events[0], { host: 'ynet.co.il', at: NOW });
});

test('recording does not mutate the input', () => {
  // The store reads, transforms, and writes; an in-place mutation would make
  // a failed write leave inconsistent state behind.
  const before = emptyStats();
  const frozen = JSON.stringify(before);
  recordInterception(before, 'ynet.co.il', NOW);
  assert.equal(JSON.stringify(before), frozen);
});

test('the first recorded event sets the since marker', () => {
  const stats = recordInterception(emptyStats(), 'ynet.co.il', NOW);
  assert.equal(stats.since, NOW);
});

test('the since marker does not move on later events', () => {
  let stats = recordInterception(emptyStats(), 'ynet.co.il', NOW - 5 * DAY);
  stats = recordInterception(stats, 'ynet.co.il', NOW);
  assert.equal(stats.since, NOW - 5 * DAY);
});

test('recording rejects a missing host', () => {
  assert.throws(() => recordInterception(emptyStats(), '', NOW), /expected a host/);
});

test('recording rejects a non-numeric timestamp', () => {
  assert.throws(
    () => recordInterception(emptyStats(), 'a.com', 'now'),
    /expected epoch ms/
  );
});

test('events past the retention window are pruned', () => {
  // Pruning is relative to an explicit "now" — the daily alarm supplies it.
  // recordInterception cannot: it only knows the event being written, and
  // discarding that event would be absurd.
  const stats = statsWith([['ynet.co.il', STATS_RETENTION_DAYS + 1]]);
  assert.equal(pruneEvents(stats, NOW).events.length, 0);
});

test('events inside the retention window survive', () => {
  const stats = statsWith([['ynet.co.il', STATS_RETENTION_DAYS - 1]]);
  assert.equal(pruneEvents(stats, NOW).events.length, 1);
});

test('a new event prunes history that has since expired', () => {
  // The write path still bounds the log: recording today drops events that
  // aged out while the extension was idle.
  let stats = statsWith([['ynet.co.il', STATS_RETENTION_DAYS + 1]]);
  assert.equal(stats.events.length, 1);

  stats = recordInterception(stats, 'ynet.co.il', NOW);
  assert.equal(stats.events.length, 1);
  assert.equal(stats.events[0].at, NOW);
  assert.equal(stats.totals['ynet.co.il'], 2);
});

test('pruning keeps lifetime totals intact', () => {
  // The whole point of splitting totals from events: history can expire
  // without the headline count resetting.
  const stats = statsWith([
    ['ynet.co.il', STATS_RETENTION_DAYS + 10],
    ['ynet.co.il', 1],
  ]);
  assert.equal(stats.events.length, 1);
  assert.equal(stats.totals['ynet.co.il'], 2);
});

test('pruning returns the same object when nothing expired', () => {
  // Identity is the signal the store uses to skip a redundant write.
  const stats = statsWith([['ynet.co.il', 1]]);
  assert.equal(pruneEvents(stats, NOW), stats);
});

test('lifetimeTotal sums across hosts', () => {
  const stats = statsWith([
    ['ynet.co.il', 1],
    ['ynet.co.il', 2],
    ['twitter.com', 1],
  ]);
  assert.equal(lifetimeTotal(stats), 3);
});

test('totalsByHost sorts by count descending', () => {
  const stats = statsWith([
    ['twitter.com', 1],
    ['ynet.co.il', 1],
    ['ynet.co.il', 2],
  ]);
  assert.deepEqual(totalsByHost(stats), [
    { host: 'ynet.co.il', count: 2 },
    { host: 'twitter.com', count: 1 },
  ]);
});

test('totalsByHost breaks ties alphabetically', () => {
  const stats = statsWith([
    ['b.com', 1],
    ['a.com', 1],
  ]);
  assert.deepEqual(totalsByHost(stats).map((e) => e.host), ['a.com', 'b.com']);
});

test('countsByHour buckets by local hour', () => {
  const nineAm = new Date(2026, 2, 15, 9, 0, 0).getTime();
  const stats = recordInterception(emptyStats(), 'ynet.co.il', nineAm);
  const hours = countsByHour(stats);
  assert.equal(hours.length, 24);
  assert.equal(hours[9], 1);
  assert.equal(hours[10], 0);
});

test('countsByWeekday buckets by local day', () => {
  // 2026-03-15 is a Sunday.
  const stats = recordInterception(emptyStats(), 'ynet.co.il', NOW);
  const days = countsByWeekday(stats);
  assert.equal(days.length, 7);
  assert.equal(days[0], 1);
});

test('dailySeries fills gaps with zeros', () => {
  const stats = statsWith([['ynet.co.il', 2]]);
  const series = dailySeries(stats, NOW, 5);
  assert.equal(series.length, 5);
  assert.equal(series.reduce((sum, day) => sum + day.count, 0), 1);
  assert.ok(series.some((day) => day.count === 0));
});

test('dailySeries runs oldest to newest', () => {
  const series = dailySeries(emptyStats(), NOW, 3);
  assert.deepEqual(
    series.map((day) => day.date),
    ['2026-03-13', '2026-03-14', '2026-03-15']
  );
});

test('localDateKey uses local date parts, not UTC', () => {
  // toISOString() would roll a late-evening local time into the next UTC day
  // for anyone east of Greenwich, filing events under the wrong date.
  const lateEvening = new Date(2026, 2, 15, 23, 30, 0);
  assert.equal(localDateKey(lateEvening), '2026-03-15');
});

test('recentEvents respects the window and sorts newest first', () => {
  const stats = statsWith([
    ['a.com', 1],
    ['b.com', 3],
    ['c.com', 20],
  ]);
  const recent = recentEvents(stats, NOW, 7);
  assert.deepEqual(recent.map((event) => event.host), ['a.com', 'b.com']);
});

test('summarize reports total, last 7 days, and top host', () => {
  const stats = statsWith([
    ['ynet.co.il', 1],
    ['ynet.co.il', 2],
    ['twitter.com', 30],
  ]);
  const summary = summarize(stats, NOW);
  assert.equal(summary.total, 3);
  assert.equal(summary.last7, 2);
  assert.equal(summary.topHost, 'ynet.co.il');
});

test('summarize handles an empty record', () => {
  const summary = summarize(emptyStats(), NOW);
  assert.equal(summary.total, 0);
  assert.equal(summary.last7, 0);
  assert.equal(summary.topHost, null);
});
