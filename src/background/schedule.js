/**
 * Per-site schedules: when a site's pause is in force.
 *
 * A schedule is `{ days, ranges }`: days 0–6 (0 = Sunday) and up to
 * MAX_SCHEDULE_RANGES ranges in minutes of the local day, `[start, end)`.
 * A range whose end is before its start runs past midnight and belongs to
 * the day it starts on (Friday 22:00–02:00 is active early Saturday).
 *
 * Everything is evaluated on the local wall clock with `Date` local getters,
 * so a daylight-saving shift follows the user's clock.
 *
 * Pure: no chrome.*, no DOM. The clock is passed in.
 */

import {
  DAYS_PER_WEEK,
  MAX_SCHEDULE_RANGES,
  MINUTES_PER_DAY,
  MINUTES_PER_HOUR,
  MS_PER_DAY,
  SCHEDULE_LOOKAHEAD_DAYS,
} from '../constants.js';

const SCHEDULE_KEYS = Object.freeze(['days', 'ranges']);
const RANGE_KEYS = Object.freeze(['start', 'end']);
const CLOCK_PATTERN = /^(\d{2}):(\d{2})$/;

/**
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @returns {boolean}
 */
function isIntegerIn(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

/**
 * @param {object} obj
 * @param {readonly string[]} allowed
 * @param {string} path
 */
function assertOnlyKeys(obj, allowed, path) {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path}.${key} is not a schedule field`);
    }
  }
}

/**
 * Validate a schedule, throwing on the first violation.
 *
 * @param {unknown} schedule
 * @param {string} [path] Error-message prefix, e.g. "defaults.schedule".
 * @throws {Error} Naming the offending field path.
 */
export function validateSchedule(schedule, path = 'schedule') {
  if (!schedule || typeof schedule !== 'object' || Array.isArray(schedule)) {
    throw new Error(`${path} must be an object, got ${JSON.stringify(schedule)}`);
  }
  assertOnlyKeys(schedule, SCHEDULE_KEYS, path);

  const { days, ranges } = schedule;
  if (!Array.isArray(days) || days.length === 0) {
    throw new Error(`${path}.days must list at least one day, got ${JSON.stringify(days)}`);
  }
  days.forEach((day, index) => {
    if (!isIntegerIn(day, 0, DAYS_PER_WEEK - 1)) {
      throw new Error(`${path}.days[${index}] must be a whole number from 0 (Sunday) to 6, got ${JSON.stringify(day)}`);
    }
    if (index > 0 && day === days[index - 1]) {
      throw new Error(`${path}.days has a duplicate day ${day}`);
    }
    if (index > 0 && day < days[index - 1]) {
      throw new Error(`${path}.days must be in ascending order, got ${JSON.stringify(days)}`);
    }
  });

  if (!Array.isArray(ranges) || ranges.length === 0 || ranges.length > MAX_SCHEDULE_RANGES) {
    throw new Error(`${path}.ranges must hold 1 to ${MAX_SCHEDULE_RANGES} time ranges, got ${JSON.stringify(ranges)}`);
  }
  ranges.forEach((range, index) => {
    const at = `${path}.ranges[${index}]`;
    if (!range || typeof range !== 'object') {
      throw new Error(`${at} must be an object with start and end`);
    }
    assertOnlyKeys(range, RANGE_KEYS, at);
    if (!isIntegerIn(range.start, 0, MINUTES_PER_DAY - 1)) {
      throw new Error(`${at}.start must be a whole minute from 0 to ${MINUTES_PER_DAY - 1}, got ${JSON.stringify(range.start)}`);
    }
    if (!isIntegerIn(range.end, 1, MINUTES_PER_DAY)) {
      throw new Error(`${at}.end must be a whole minute from 1 to ${MINUTES_PER_DAY}, got ${JSON.stringify(range.end)}`);
    }
    if (range.start === range.end) {
      throw new Error(`${at} starts and ends at the same time (${range.start})`);
    }
  });
}

/**
 * Whether a schedule is in force on every day at every minute.
 *
 * @param {{days: number[], ranges: Array<{start: number, end: number}>}} schedule
 * @returns {boolean}
 */
export function isAlwaysSchedule(schedule) {
  return (
    schedule.days.length === DAYS_PER_WEEK &&
    schedule.ranges.some((range) => range.start === 0 && range.end === MINUTES_PER_DAY)
  );
}

/**
 * Whether the schedule is in force at a moment.
 *
 * @param {{days: number[], ranges: Array<{start: number, end: number}>}} schedule
 * @param {Date} date
 * @returns {boolean}
 */
export function isScheduleActiveAt(schedule, date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error(`isScheduleActiveAt: expected a valid Date, got ${JSON.stringify(date)}`);
  }
  const day = date.getDay();
  const previousDay = (day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
  const minute = date.getHours() * MINUTES_PER_HOUR + date.getMinutes();

  return schedule.ranges.some(({ start, end }) => {
    if (end > start) {
      return schedule.days.includes(day) && minute >= start && minute < end;
    }
    // Overnight: the evening part on its own day, the morning part the day after.
    return (
      (schedule.days.includes(day) && minute >= start) ||
      (schedule.days.includes(previousDay) && minute < end)
    );
  });
}

/**
 * The next moment any schedule starts or ends, so the rules can be rebuilt
 * then without user action.
 *
 * @param {Array<object>} schedules The effective schedule of each site.
 * @param {number} now Epoch ms.
 * @returns {number|null} Epoch ms of the earliest boundary after `now`
 *   within SCHEDULE_LOOKAHEAD_DAYS, or null when every schedule is always on.
 */
export function nextScheduleBoundary(schedules, now) {
  if (!Array.isArray(schedules)) {
    throw new Error('nextScheduleBoundary: schedules must be a list');
  }
  if (!Number.isFinite(now)) {
    throw new Error(`nextScheduleBoundary: now must be epoch ms, got ${now}`);
  }
  const today = new Date(now);
  const horizon = now + SCHEDULE_LOOKAHEAD_DAYS * MS_PER_DAY;
  // Local-time constructors keep wall-clock minutes right across DST shifts.
  const localAt = (dayOffset, minutes) =>
    new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, 0, minutes).getTime();

  let earliest = null;
  const consider = (candidate) => {
    if (candidate > now && candidate <= horizon && (earliest === null || candidate < earliest)) {
      earliest = candidate;
    }
  };

  for (const schedule of schedules) {
    if (isAlwaysSchedule(schedule)) continue;
    // Start a day back: an overnight range that began yesterday ends today.
    for (let offset = -1; offset <= SCHEDULE_LOOKAHEAD_DAYS; offset += 1) {
      const weekday = new Date(localAt(offset, 0)).getDay();
      if (!schedule.days.includes(weekday)) continue;
      for (const { start, end } of schedule.ranges) {
        consider(localAt(offset, start));
        consider(localAt(end > start ? offset : offset + 1, end));
      }
    }
  }
  return earliest;
}

/**
 * Format minutes of the day for an `<input type="time">`. The end of the
 * day (1440) shows as 00:00, midnight.
 *
 * @param {number} minutes 0–1440.
 * @returns {string} "HH:MM".
 */
export function minutesToClock(minutes) {
  if (!isIntegerIn(minutes, 0, MINUTES_PER_DAY)) {
    throw new Error(`minutesToClock: expected 0–${MINUTES_PER_DAY}, got ${minutes}`);
  }
  const wrapped = minutes % MINUTES_PER_DAY;
  const hours = String(Math.floor(wrapped / MINUTES_PER_HOUR)).padStart(2, '0');
  return `${hours}:${String(wrapped % MINUTES_PER_HOUR).padStart(2, '0')}`;
}

/**
 * Parse an `<input type="time">` value. As a range end, 00:00 means the
 * midnight that ends the day (1440), so 00:00–00:00 is the whole day.
 *
 * @param {string} clock "HH:MM".
 * @param {{isEnd?: boolean}} [options]
 * @returns {number} Minutes of the day.
 * @throws {Error} If the value is not a time of day.
 */
export function clockToMinutes(clock, { isEnd = false } = {}) {
  const match = typeof clock === 'string' ? CLOCK_PATTERN.exec(clock) : null;
  const hours = match ? Number(match[1]) : NaN;
  const minutes = match ? Number(match[2]) : NaN;
  if (!isIntegerIn(hours, 0, 23) || !isIntegerIn(minutes, 0, MINUTES_PER_HOUR - 1)) {
    throw new Error(`clockToMinutes: "${clock}" is not a time of day (HH:MM)`);
  }
  const total = hours * MINUTES_PER_HOUR + minutes;
  return isEnd && total === 0 ? MINUTES_PER_DAY : total;
}
