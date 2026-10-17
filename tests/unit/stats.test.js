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
  normalizeStats,
  recordView,
  applyOutcome,
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
import { Outcome, STATS_RETENTION_DAYS } from '../../src/constants.js';

const DAY = 24 * 60 * 60 * 1000;
const SECOND = 1000;

/** A fixed reference point: 2026-03-15T10:30:00 local time. */
const NOW = new Date(2026, 2, 15, 10, 30, 0).getTime();

let nextId = 0;
/** @returns {string} A fresh view id. */
const newViewId = () => `view-${(nextId += 1)}`;

/**
 * Record one view and return the stats only.
 *
 * @returns {object}
 */
function view(stats, host, at, viewId = newViewId()) {
  return recordView(stats, { viewId, host, now: at }).stats;
}

/**
 * Build a stats record from [host, offsetDays] pairs.
 *
 * @param {Array<[string, number]>} entries
 * @returns {object}
 */
function statsWith(entries) {
  return entries.reduce((acc, [host, offsetDays]) => view(acc, host, NOW - offsetDays * DAY), emptyStats());
}

/** Stats as 1.0 stored them: no ids, no outcomes, no outcomesSince. */
function legacyStats() {
  return {
    totals: { 'reddit.com': 2 },
    events: [
      { host: 'reddit.com', at: NOW - 2 * DAY },
      { host: 'reddit.com', at: NOW - DAY },
    ],
    since: NOW - 2 * DAY,
  };
}

test('empty stats have no totals and no events', () => {
  const stats = emptyStats();
  assert.deepEqual(stats.totals, {});
  assert.deepEqual(stats.events, []);
  assert.equal(stats.since, null);
  assert.equal(stats.outcomesSince, null);
});

/* normalizeStats ------------------------------------------------------------ */

test('normalizeStats returns empty stats for nothing stored', () => {
  assert.deepEqual(normalizeStats(undefined), emptyStats());
  assert.deepEqual(normalizeStats(null), emptyStats());
});

test('normalizeStats fills the fields 1.0 did not store, leaving the rest alone', () => {
  const legacy = legacyStats();
  const normalized = normalizeStats(legacy);
  assert.equal(normalized.outcomesSince, null);
  assert.deepEqual(normalized.events, legacy.events);
  assert.deepEqual(normalized.totals, legacy.totals);
  assert.equal(normalized.since, legacy.since);
});

test('normalizeStats rejects a record that is not stats', () => {
  assert.throws(() => normalizeStats('stats'), /stats/);
  assert.throws(() => normalizeStats({ events: 'x' }), /events/);
  assert.throws(() => normalizeStats({ totals: [] }), /totals/);
});

/* recordView ------------------------------------------------------------------ */

test('recordView on legacy stats adds an outcome-tagged event and outcomesSince, and keeps legacy events', () => {
  const legacy = legacyStats();
  const { stats, eventId } = recordView(legacy, { viewId: 'v1', host: 'reddit.com', now: NOW });

  assert.equal(eventId, 'v1');
  assert.equal(stats.events.length, 3);
  assert.deepEqual(stats.events.slice(0, 2), legacy.events);
  assert.deepEqual(stats.events[2], { id: 'v1', host: 'reddit.com', at: NOW, outcome: Outcome.LEFT });
  assert.equal(stats.outcomesSince, NOW);
  assert.equal(stats.totals['reddit.com'], 3);
  assert.equal(stats.since, NOW - 2 * DAY);
});

test('recordView with an already-logged view id adds nothing and returns the same id', () => {
  const first = recordView(emptyStats(), { viewId: 'v1', host: 'reddit.com', now: NOW });
  // A reload or session restore, much later: same view, not a new urge.
  const again = recordView(first.stats, { viewId: 'v1', host: 'reddit.com', now: NOW + DAY });
  assert.equal(again.eventId, 'v1');
  assert.equal(again.stats, first.stats);
});

test('a view of the same host 59 s after a left view merges into it', () => {
  const first = recordView(emptyStats(), { viewId: 'v1', host: 'reddit.com', now: NOW });
  const retyped = recordView(first.stats, { viewId: 'v2', host: 'reddit.com', now: NOW + 59 * SECOND });
  assert.equal(retyped.eventId, 'v1');
  assert.equal(retyped.stats.events.length, 1);
  assert.equal(retyped.stats.totals['reddit.com'], 1);
});

test('a view of the same host 61 s later is a new event', () => {
  const first = recordView(emptyStats(), { viewId: 'v1', host: 'reddit.com', now: NOW });
  const later = recordView(first.stats, { viewId: 'v2', host: 'reddit.com', now: NOW + 61 * SECOND });
  assert.equal(later.eventId, 'v2');
  assert.equal(later.stats.events.length, 2);
  assert.equal(later.stats.totals['reddit.com'], 2);
});

test('a view right after a continued view is a new event', () => {
  const first = recordView(emptyStats(), { viewId: 'v1', host: 'reddit.com', now: NOW });
  const continued = applyOutcome(first.stats, 'v1', Outcome.CONTINUED);
  const next = recordView(continued, { viewId: 'v2', host: 'reddit.com', now: NOW + 10 * SECOND });
  assert.equal(next.eventId, 'v2');
  assert.equal(next.stats.events.length, 2);
});

test('a view right after a steered view is a new event', () => {
  const first = recordView(emptyStats(), { viewId: 'v1', host: 'reddit.com', now: NOW });
  const steered = applyOutcome(first.stats, 'v1', Outcome.STEERED);
  assert.equal(recordView(steered, { viewId: 'v2', host: 'reddit.com', now: NOW + 10 * SECOND }).eventId, 'v2');
});

test('a view of another host never merges', () => {
  const first = recordView(emptyStats(), { viewId: 'v1', host: 'reddit.com', now: NOW });
  const other = recordView(first.stats, { viewId: 'v2', host: 'youtube.com', now: NOW + SECOND });
  assert.equal(other.eventId, 'v2');
  assert.equal(other.stats.events.length, 2);
});

test('outcomesSince stays at the first outcome-tagged view', () => {
  let stats = view(emptyStats(), 'a.com', NOW - DAY);
  stats = view(stats, 'a.com', NOW);
  assert.equal(stats.outcomesSince, NOW - DAY);
});

test('recordView does not mutate its input', () => {
  // The store reads, transforms, and writes; an in-place mutation would make
  // a failed write leave inconsistent state behind.
  const before = legacyStats();
  const frozen = JSON.stringify(before);
  recordView(before, { viewId: 'v1', host: 'reddit.com', now: NOW });
  assert.equal(JSON.stringify(before), frozen);
});

test('recordView rejects a missing view id, host or time', () => {
  assert.throws(() => recordView(emptyStats(), { viewId: '', host: 'a.com', now: NOW }), /viewId/);
  assert.throws(() => recordView(emptyStats(), { viewId: 'v', host: '', now: NOW }), /host/);
  assert.throws(() => recordView(emptyStats(), { viewId: 'v', host: 'a.com', now: 'now' }), /epoch ms/);
});

/* applyOutcome ------------------------------------------------------------------ */

test('applyOutcome updates exactly one event', () => {
  let stats = view(emptyStats(), 'a.com', NOW - DAY, 'x');
  stats = view(stats, 'a.com', NOW, 'y');
  const updated = applyOutcome(stats, 'y', Outcome.STEERED);
  assert.deepEqual(updated.events[0], stats.events[0]);
  assert.equal(updated.events[1].outcome, Outcome.STEERED);
  assert.equal(stats.events[1].outcome, Outcome.LEFT, 'the input is not mutated');
});

test('applyOutcome throws on an unknown event id', () => {
  const stats = view(emptyStats(), 'a.com', NOW, 'x');
  assert.throws(() => applyOutcome(stats, 'nope', Outcome.STEERED), /nope/);
});

test('applyOutcome rejects steered after continued', () => {
  const stats = applyOutcome(view(emptyStats(), 'a.com', NOW, 'x'), 'x', Outcome.CONTINUED);
  assert.throws(() => applyOutcome(stats, 'x', Outcome.STEERED), /continued/);
});

test('applyOutcome lets continued follow steered', () => {
  const steered = applyOutcome(view(emptyStats(), 'a.com', NOW, 'x'), 'x', Outcome.STEERED);
  assert.equal(applyOutcome(steered, 'x', Outcome.CONTINUED).events[0].outcome, Outcome.CONTINUED);
});

test('applying the outcome an event already has changes nothing', () => {
  const continued = applyOutcome(view(emptyStats(), 'a.com', NOW, 'x'), 'x', Outcome.CONTINUED);
  assert.equal(applyOutcome(continued, 'x', Outcome.CONTINUED), continued);
});

test('applyOutcome rejects an outcome a view cannot move to', () => {
  const stats = view(emptyStats(), 'a.com', NOW, 'x');
  assert.throws(() => applyOutcome(stats, 'x', Outcome.LEFT), /outcome/);
  assert.throws(() => applyOutcome(stats, 'x', 'ignored'), /outcome/);
});

/* Totals and retention ------------------------------------------------------------ */

test('recording increments the per-host total', () => {
  let stats = emptyStats();
  stats = view(stats, 'ynet.co.il', NOW - DAY);
  stats = view(stats, 'ynet.co.il', NOW);
  assert.equal(stats.totals['ynet.co.il'], 2);
});

test('the first recorded event sets the since marker', () => {
  const stats = view(emptyStats(), 'ynet.co.il', NOW);
  assert.equal(stats.since, NOW);
});

test('the since marker does not move on later events', () => {
  let stats = view(emptyStats(), 'ynet.co.il', NOW - 5 * DAY);
  stats = view(stats, 'ynet.co.il', NOW);
  assert.equal(stats.since, NOW - 5 * DAY);
});

test('events past the retention window are pruned', () => {
  // Pruning is relative to an explicit "now" — the daily alarm supplies it.
  // recordView cannot: it only knows the event being written, and
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

  stats = view(stats, 'ynet.co.il', NOW);
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

test('pruning keeps working on outcome-tagged events', () => {
  let stats = view(emptyStats(), 'a.com', NOW - (STATS_RETENTION_DAYS + 1) * DAY, 'old');
  stats = view(stats, 'a.com', NOW - DAY, 'kept');
  stats = applyOutcome(stats, 'kept', Outcome.CONTINUED);
  const pruned = pruneEvents(stats, NOW);
  assert.deepEqual(pruned.events, [{ id: 'kept', host: 'a.com', at: NOW - DAY, outcome: Outcome.CONTINUED }]);
  assert.equal(pruned.totals['a.com'], 2);
  assert.equal(pruned.outcomesSince, stats.outcomesSince);
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
  const stats = view(emptyStats(), 'ynet.co.il', nineAm);
  const hours = countsByHour(stats);
  assert.equal(hours.length, 24);
  assert.equal(hours[9], 1);
  assert.equal(hours[10], 0);
});

test('countsByWeekday buckets by local day', () => {
  // 2026-03-15 is a Sunday.
  const stats = view(emptyStats(), 'ynet.co.il', NOW);
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
