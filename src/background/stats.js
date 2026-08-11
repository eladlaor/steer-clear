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

import { STATS_RETENTION_DAYS } from '../constants.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** An empty stats record, used on first run and after a reset. */
export function emptyStats() {
  return {
    /** Per-host lifetime counts; survives event pruning. */
    totals: {},
    /** Recent events: { host, at } with `at` an epoch-ms timestamp. */
    events: [],
    /** When counting began, so the UI can say "since March 3". */
    since: null,
  };
}

/**
 * Record an interception, returning a new stats object.
 *
 * Pure: takes the previous state and returns the next one, so the caller
 * controls persistence and the function stays testable without fake timers.
 *
 * @param {object} stats Previous stats.
 * @param {string} host The configured host that was intercepted.
 * @param {number} at Epoch ms.
 * @returns {object} The updated stats.
 */
export function recordInterception(stats, host, at) {
  if (typeof host !== 'string' || host.trim() === '') {
    throw new Error(`recordInterception: expected a host, got "${host}"`);
  }
  if (!Number.isFinite(at)) {
    throw new Error(`recordInterception: expected epoch ms, got ${at}`);
  }

  const base = stats ?? emptyStats();

  // Prune against the newest timestamp seen, not the incoming one. A
  // backdated event must not drag the retention cutoff into the past and
  // resurrect already-expired history.
  const newest = base.events.reduce((max, event) => Math.max(max, event.at), at);

  return pruneEvents(
    {
      ...base,
      since: base.since === null ? at : Math.min(base.since, at),
      totals: { ...base.totals, [host]: (base.totals[host] ?? 0) + 1 },
      events: [...base.events, { host, at }],
    },
    newest
  );
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
