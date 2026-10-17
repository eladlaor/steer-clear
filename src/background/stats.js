/**
 * Interception statistics: pure aggregation over a recorded event log.
 *
 * Touches no Chrome APIs, so it is unit-testable in a plain runtime. Storage
 * lives in stats_store.js; this module only shapes and summarizes data.
 *
 * Privacy shape, stated once because it constrains everything here: an event
 * records the *configured host* and a timestamp. Not the full URL, not the
 * path, not the query. "You tried ynet.co.il at 09:14" is what the user asked
 * to see; "you tried ynet.co.il/specific-article" is a browsing-history log
 * with no added value for the counts they wanted.
 */

import { MS_PER_DAY, Outcome, STATS_RETENTION_DAYS, VIEW_MERGE_WINDOW_MS } from '../constants.js';

/**
 * The outcomes each outcome may move to. A view starts `left`; `steered`
 * (chose the destination) may follow `left` only; `continued` may follow
 * either, since the user can still go through after steering away.
 */
const NEXT_OUTCOMES = Object.freeze({
  [Outcome.LEFT]: Object.freeze([Outcome.STEERED, Outcome.CONTINUED]),
  [Outcome.STEERED]: Object.freeze([Outcome.CONTINUED]),
  [Outcome.CONTINUED]: Object.freeze([]),
});

/** An empty stats record, used on first run and after a reset. */
export function emptyStats() {
  return {
    /** Per-host lifetime counts; survives event pruning. */
    totals: {},
    /**
     * Recent events: `{ id, host, at, outcome, continuedAt? }`, times in
     * epoch ms; `continuedAt` is set when the view was continued. Events
     * recorded before outcome tracking (1.0) have only `host` and `at`.
     */
    events: [],
    /** When counting began, so the UI can say "since March 3". */
    since: null,
    /** When outcome tracking began: the first event recorded with an outcome. */
    outcomesSince: null,
  };
}

/**
 * Fill the fields an older release did not store, so no stored-stats
 * migration is ever needed. Existing events are kept exactly as stored.
 *
 * @param {unknown} raw The stored record, or undefined on first run.
 * @returns {object} A complete stats record; the input itself when nothing
 *   was missing, so callers can tell "unchanged" by identity.
 * @throws {Error} If the stored value is not a stats record.
 */
export function normalizeStats(raw) {
  if (raw === undefined || raw === null) {
    return emptyStats();
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`normalizeStats: stored stats must be an object, got ${JSON.stringify(raw)}`);
  }
  const complete = Object.keys(emptyStats()).every((key) => key in raw);
  const stats = complete ? raw : { ...emptyStats(), ...raw };
  if (!stats.totals || typeof stats.totals !== 'object' || Array.isArray(stats.totals)) {
    throw new Error('normalizeStats: stats.totals must be an object of counts');
  }
  if (!Array.isArray(stats.events)) {
    throw new Error('normalizeStats: stats.events must be a list');
  }
  return stats;
}

/**
 * Record one pause-page view, returning the new stats and the id of the
 * event the view is counted under.
 *
 * - A view id that is already logged (a reload, a restored session) adds
 *   nothing.
 * - A view of a host whose latest event is younger than VIEW_MERGE_WINDOW_MS
 *   and still `left` is the same urge (a retyped address): it returns that
 *   event's id and adds nothing.
 * - Otherwise a new event is logged as `left`.
 *
 * Pure: the caller controls persistence and the clock.
 *
 * @param {object} stats Previous stats (normalized or not).
 * @param {{viewId: string, host: string, now: number}} view `host` is the
 *   configured host, so www.x.com and m.x.com count under the user's entry.
 * @returns {{stats: object, eventId: string}}
 */
export function recordView(stats, { viewId, host, now }) {
  if (typeof viewId !== 'string' || viewId === '') {
    throw new Error(`recordView: expected a viewId, got ${JSON.stringify(viewId)}`);
  }
  if (typeof host !== 'string' || host.trim() === '') {
    throw new Error(`recordView: expected a host, got "${host}"`);
  }
  if (!Number.isFinite(now)) {
    throw new Error(`recordView: expected epoch ms, got ${now}`);
  }

  const base = normalizeStats(stats);
  if (base.events.some((event) => event.id === viewId)) {
    return { stats: base, eventId: viewId };
  }

  const latest = base.events
    .filter((event) => event.host === host)
    .reduce((newest, event) => (newest === null || event.at > newest.at ? event : newest), null);
  const age = latest === null ? null : now - latest.at;
  if (latest?.outcome === Outcome.LEFT && age >= 0 && age < VIEW_MERGE_WINDOW_MS) {
    return { stats: base, eventId: latest.id };
  }

  // Prune against the newest timestamp seen, not the incoming one. A
  // backdated event must not drag the retention cutoff into the past and
  // resurrect already-expired history.
  const newest = base.events.reduce((max, event) => Math.max(max, event.at), now);
  const next = pruneEvents(
    {
      ...base,
      since: base.since === null ? now : Math.min(base.since, now),
      outcomesSince: base.outcomesSince === null ? now : Math.min(base.outcomesSince, now),
      totals: { ...base.totals, [host]: (base.totals[host] ?? 0) + 1 },
      events: [...base.events, { id: viewId, host, at: now, outcome: Outcome.LEFT }],
    },
    newest
  );
  return { stats: next, eventId: viewId };
}

/**
 * Record what the user did after a view: `steered` (chose the destination)
 * or `continued` (went through). Applying the outcome an event already has
 * changes nothing and returns the same object.
 *
 * @param {object} stats
 * @param {string} eventId An id returned by recordView.
 * @param {string} outcome Outcome.STEERED or Outcome.CONTINUED.
 * @param {number} [now] Epoch ms; required for a continue, which records
 *   `continuedAt` so the daily allowance counts it on the day it happened,
 *   not the day of the view (a pause shown before midnight).
 * @returns {object} The updated stats.
 * @throws {Error} On an unknown event id, an outcome the event cannot move
 *   to, or a continue without a time.
 */
export function applyOutcome(stats, eventId, outcome, now) {
  if (outcome !== Outcome.STEERED && outcome !== Outcome.CONTINUED) {
    throw new Error(`applyOutcome: outcome must be steered or continued, got ${JSON.stringify(outcome)}`);
  }
  if (outcome === Outcome.CONTINUED && !Number.isFinite(now)) {
    throw new Error(`applyOutcome: a continue needs the time it happened, got ${now}`);
  }
  const base = normalizeStats(stats);
  const index = base.events.findIndex((event) => event.id === eventId);
  if (index === -1) {
    throw new Error(`applyOutcome: no event with id "${eventId}"`);
  }
  const event = base.events[index];
  if (event.outcome === outcome) {
    return base;
  }
  if (!(NEXT_OUTCOMES[event.outcome] ?? []).includes(outcome)) {
    throw new Error(`applyOutcome: event "${eventId}" is ${event.outcome}; it cannot become ${outcome}`);
  }
  const events = [...base.events];
  events[index] = outcome === Outcome.CONTINUED ? { ...event, outcome, continuedAt: now } : { ...event, outcome };
  return { ...base, events };
}

/**
 * Drop events older than the retention window. Totals are untouched.
 *
 * Pruning on write rather than on a timer keeps the log bounded without an
 * alarm, and means the stored data never exceeds the retention promise even if
 * the extension goes unused for months.
 *
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @returns {object} Stats with expired events removed.
 */
export function pruneEvents(stats, now) {
  const cutoff = now - STATS_RETENTION_DAYS * MS_PER_DAY;
  const events = stats.events.filter((event) => event.at >= cutoff);

  if (events.length === stats.events.length) {
    return stats;
  }
  return { ...stats, events };
}

/**
 * Total interceptions across all hosts, for the whole recorded lifetime.
 *
 * @param {object} stats
 * @returns {number}
 */
export function lifetimeTotal(stats) {
  return Object.values(stats.totals).reduce((sum, count) => sum + count, 0);
}

/**
 * Per-host lifetime counts, most-intercepted first.
 *
 * @param {object} stats
 * @returns {Array<{host: string, count: number}>}
 */
export function totalsByHost(stats) {
  return Object.entries(stats.totals)
    .map(([host, count]) => ({ host, count }))
    .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host));
}

/**
 * Interception counts per hour of the day, 0–23.
 *
 * Answers "when does this happen to me" — the question a raw total cannot.
 * Uses local time, since the user's sense of "morning" is local, not UTC.
 *
 * @param {object} stats
 * @returns {number[]} 24 counts, index = hour.
 */
export function countsByHour(stats) {
  const hours = new Array(24).fill(0);
  for (const event of stats.events) {
    hours[new Date(event.at).getHours()] += 1;
  }
  return hours;
}

/**
 * Interception counts per day of the week, 0 = Sunday.
 *
 * @param {object} stats
 * @returns {number[]} 7 counts, index = day.
 */
export function countsByWeekday(stats) {
  const days = new Array(7).fill(0);
  for (const event of stats.events) {
    days[new Date(event.at).getDay()] += 1;
  }
  return days;
}

/**
 * Interceptions per calendar day over a trailing window.
 *
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @param {number} [days] Window length.
 * @returns {Array<{date: string, count: number}>} Oldest first, gaps filled
 *   with zeros so a chart has a continuous axis.
 */
export function dailySeries(stats, now, days = 30) {
  const counts = new Map();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    counts.set(localDateKey(new Date(now - offset * MS_PER_DAY)), 0);
  }

  for (const event of stats.events) {
    const key = localDateKey(new Date(event.at));
    if (counts.has(key)) {
      counts.set(key, counts.get(key) + 1);
    }
  }

  return [...counts.entries()].map(([date, count]) => ({ date, count }));
}

/**
 * Events within the trailing window, newest first.
 *
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @param {number} [days]
 * @returns {Array<{host: string, at: number}>}
 */
export function recentEvents(stats, now, days = 7) {
  const cutoff = now - days * MS_PER_DAY;
  return stats.events
    .filter((event) => event.at >= cutoff)
    .sort((a, b) => b.at - a.at);
}

/**
 * A local-time YYYY-MM-DD key.
 *
 * Built from local date parts rather than toISOString(), which converts to UTC
 * and would file a 01:00 interception under the previous day for anyone east
 * of Greenwich.
 *
 * @param {Date} date
 * @returns {string}
 */
export function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A compact summary for the stats page header.
 *
 * @param {object} stats
 * @param {number} now Epoch ms.
 * @returns {{total: number, last7: number, topHost: string|null, since: number|null}}
 */
export function summarize(stats, now) {
  const last7 = recentEvents(stats, now, 7).length;
  const [top] = totalsByHost(stats);

  return {
    total: lifetimeTotal(stats),
    last7,
    topHost: top?.host ?? null,
    since: stats.since,
  };
}
