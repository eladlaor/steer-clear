/**
 * Unit tests for per-site schedules.
 * Run: node --test tests/unit/
 *
 * Dates are built with local-time constructors, as the schedule is evaluated
 * on the user's wall clock. 2026-03-16 is a Monday.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  clockToMinutes,
  isAlwaysSchedule,
  isScheduleActiveAt,
  minutesToClock,
  nextScheduleBoundary,
  validateSchedule,
} from '../../src/background/schedule.js';
import { ALWAYS_SCHEDULE, WEEKDAY_WORK_SCHEDULE } from '../../src/constants.js';

/** Local time on a day of the reference week: 0 = Sun 2026-03-15 … 6 = Sat 2026-03-21. */
const at = (weekday, hour, minute = 0) => new Date(2026, 2, 15 + weekday, hour, minute);
const SUN = 0;
const MON = 1;
const THU = 4;
const FRI = 5;
const SAT = 6;

const WORK = WEEKDAY_WORK_SCHEDULE;
/** Friday 22:00–02:00, an overnight range. */
const FRIDAY_NIGHT = { days: [FRI], ranges: [{ start: 22 * 60, end: 2 * 60 }] };

/* isScheduleActiveAt --------------------------------------------------------- */

test('a same-day range is active from its start', () => {
  assert.equal(isScheduleActiveAt(WORK, at(MON, 9)), true);
  assert.equal(isScheduleActiveAt(WORK, at(MON, 16, 59)), true);
});

test('a same-day range is end-exclusive', () => {
  assert.equal(isScheduleActiveAt(WORK, at(MON, 17)), false);
  assert.equal(isScheduleActiveAt(WORK, at(MON, 8, 59)), false);
});

test('a range is inactive on days not listed', () => {
  assert.equal(isScheduleActiveAt(WORK, at(SAT, 10)), false);
  assert.equal(isScheduleActiveAt(WORK, at(SUN, 10)), false);
});

test('an overnight range runs from its start day into the next morning', () => {
  assert.equal(isScheduleActiveAt(FRIDAY_NIGHT, at(FRI, 23)), true);
  assert.equal(isScheduleActiveAt(FRIDAY_NIGHT, at(SAT, 1, 59)), true);
  assert.equal(isScheduleActiveAt(FRIDAY_NIGHT, at(SAT, 2)), false);
  assert.equal(isScheduleActiveAt(FRIDAY_NIGHT, at(THU, 23)), false);
  assert.equal(isScheduleActiveAt(FRIDAY_NIGHT, at(FRI, 21, 59)), false);
  // Friday morning belongs to Thursday's night, which is not listed.
  assert.equal(isScheduleActiveAt(FRIDAY_NIGHT, at(FRI, 1)), false);
});

test('the always schedule is active at every hour of a week', () => {
  for (let day = 0; day < 7; day += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      assert.equal(isScheduleActiveAt(ALWAYS_SCHEDULE, at(day, hour)), true, `day ${day} ${hour}:00`);
      assert.equal(isScheduleActiveAt(ALWAYS_SCHEDULE, at(day, hour, 59)), true, `day ${day} ${hour}:59`);
    }
  }
});

test('any matching range makes a schedule active', () => {
  const split = { days: [MON], ranges: [{ start: 9 * 60, end: 12 * 60 }, { start: 13 * 60, end: 17 * 60 }] };
  assert.equal(isScheduleActiveAt(split, at(MON, 10)), true);
  assert.equal(isScheduleActiveAt(split, at(MON, 12, 30)), false);
  assert.equal(isScheduleActiveAt(split, at(MON, 14)), true);
});

test('isScheduleActiveAt rejects a non-date', () => {
  assert.throws(() => isScheduleActiveAt(WORK, Date.now()), /Date/);
});

/* validateSchedule ------------------------------------------------------------ */

test('validateSchedule accepts always, weekdays and an overnight range', () => {
  for (const schedule of [ALWAYS_SCHEDULE, WORK, FRIDAY_NIGHT]) {
    assert.doesNotThrow(() => validateSchedule(schedule));
  }
});

test('validateSchedule rejects each malformed schedule, naming the field', () => {
  const range = { start: 540, end: 1020 };
  const cases = [
    [{ days: [], ranges: [range] }, /days/],
    [{ days: [7], ranges: [range] }, /days\[0\]/],
    [{ days: [-1], ranges: [range] }, /days\[0\]/],
    [{ days: [1, 1], ranges: [range] }, /duplicate/],
    [{ days: [3, 1], ranges: [range] }, /ascending/],
    [{ days: [1.5], ranges: [range] }, /days\[0\]/],
    [{ days: [1], ranges: [] }, /ranges/],
    [{ days: [1], ranges: Array.from({ length: 5 }, () => range) }, /ranges/],
    [{ days: [1], ranges: [{ start: 600, end: 600 }] }, /ranges\[0\]/],
    [{ days: [1], ranges: [{ start: 1440, end: 60 }] }, /ranges\[0\]\.start/],
    [{ days: [1], ranges: [{ start: 60, end: 0 }] }, /ranges\[0\]\.end/],
    [{ days: [1], ranges: [{ start: 60.5, end: 120 }] }, /ranges\[0\]\.start/],
    [{ days: [1], ranges: [{ start: 60, end: 1441 }] }, /ranges\[0\]\.end/],
    [{ days: [1], ranges: [range], extra: true }, /extra/],
    [null, /schedule/],
    [{ days: 'weekdays', ranges: [range] }, /days/],
  ];
  for (const [schedule, pattern] of cases) {
    assert.throws(() => validateSchedule(schedule), pattern, JSON.stringify(schedule));
  }
});

test('validateSchedule prefixes errors with the given path', () => {
  assert.throws(() => validateSchedule({ days: [], ranges: [] }, 'defaults.schedule'), /^Error: defaults\.schedule\.days/);
});

/* isAlwaysSchedule -------------------------------------------------------------- */

test('isAlwaysSchedule recognises every day with a whole-day range', () => {
  assert.equal(isAlwaysSchedule(ALWAYS_SCHEDULE), true);
  assert.equal(isAlwaysSchedule({ days: [0, 1, 2, 3, 4, 5, 6], ranges: [{ start: 0, end: 600 }, { start: 0, end: 1440 }] }), true);
  assert.equal(isAlwaysSchedule(WORK), false);
  assert.equal(isAlwaysSchedule({ days: [1], ranges: [{ start: 0, end: 1440 }] }), false);
});

/* nextScheduleBoundary ---------------------------------------------------------- */

test('when inactive, the next boundary is the next range start', () => {
  assert.equal(nextScheduleBoundary([WORK], at(MON, 8).getTime()), at(MON, 9).getTime());
});

test('when active, the next boundary is the range end', () => {
  assert.equal(nextScheduleBoundary([WORK], at(MON, 10).getTime()), at(MON, 17).getTime());
});

test('a boundary exactly at now is skipped', () => {
  assert.equal(nextScheduleBoundary([WORK], at(MON, 9).getTime()), at(MON, 17).getTime());
});

test('after Friday work hours, the next boundary is Monday morning', () => {
  assert.equal(nextScheduleBoundary([WORK], at(FRI, 18).getTime()), new Date(2026, 2, 23, 9).getTime());
});

test('an overnight range ends the next morning', () => {
  assert.equal(nextScheduleBoundary([FRIDAY_NIGHT], at(FRI, 23).getTime()), at(SAT, 2).getTime());
  assert.equal(nextScheduleBoundary([FRIDAY_NIGHT], at(SAT, 1).getTime()), at(SAT, 2).getTime());
});

test('the earliest boundary across several sites wins', () => {
  const mondayTen = { days: [MON], ranges: [{ start: 10 * 60, end: 11 * 60 }] };
  assert.equal(nextScheduleBoundary([WORK, mondayTen], at(MON, 8).getTime()), at(MON, 9).getTime());
  assert.equal(nextScheduleBoundary([WORK, mondayTen], at(MON, 9, 30).getTime()), at(MON, 10).getTime());
  assert.equal(nextScheduleBoundary([WORK, mondayTen], at(MON, 10, 30).getTime()), at(MON, 11).getTime());
});

test('always-active schedules have no boundary', () => {
  assert.equal(nextScheduleBoundary([ALWAYS_SCHEDULE, ALWAYS_SCHEDULE], at(MON, 8).getTime()), null);
  assert.equal(nextScheduleBoundary([], at(MON, 8).getTime()), null);
});

test('an always schedule does not hide another site\'s boundary', () => {
  assert.equal(nextScheduleBoundary([ALWAYS_SCHEDULE, WORK], at(MON, 8).getTime()), at(MON, 9).getTime());
});

/* Clock conversion for the editor -------------------------------------------------- */

test('minutesToClock formats minutes of the day as HH:MM', () => {
  assert.equal(minutesToClock(0), '00:00');
  assert.equal(minutesToClock(540), '09:00');
  assert.equal(minutesToClock(1439), '23:59');
  assert.equal(minutesToClock(1440), '00:00');
});

test('clockToMinutes parses HH:MM, reading 00:00 as midnight at the end of a range', () => {
  assert.equal(clockToMinutes('09:30'), 570);
  assert.equal(clockToMinutes('00:00'), 0);
  assert.equal(clockToMinutes('00:00', { isEnd: true }), 1440);
  assert.equal(clockToMinutes('17:00', { isEnd: true }), 1020);
});

test('clockToMinutes rejects anything that is not a time', () => {
  for (const bad of ['', '9', '24:00', '12:60', 'noon', null]) {
    assert.throws(() => clockToMinutes(bad), /time/, String(bad));
  }
});
