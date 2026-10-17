/**
 * Editor for a schedule: day toggles, up to MAX_SCHEDULE_RANGES time ranges,
 * and two presets ("Always", "Weekdays 9–17").
 *
 * Reports a schedule only when it is valid; otherwise it says what is wrong
 * through `onError` and keeps the user's input on screen. Times are read and
 * written with the pure helpers in background/schedule.js, so 00:00 as an
 * end time means the midnight that ends the day.
 */

import { ALWAYS_SCHEDULE, MAX_SCHEDULE_RANGES, WEEKDAY_WORK_SCHEDULE } from '../constants.js';
import { clockToMinutes, minutesToClock, validateSchedule } from '../background/schedule.js';

const DAY_NAMES = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
const PRESETS = Object.freeze([
  ['Always', ALWAYS_SCHEDULE],
  ['Weekdays 9–17', WEEKDAY_WORK_SCHEDULE],
]);

/**
 * @param {string} tag
 * @param {object} [props]
 * @param {Array<Node|string>} [children]
 * @returns {HTMLElement}
 */
function el(tag, props = {}, children = []) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

/**
 * A plain-language reason the schedule cannot be saved.
 *
 * @param {{days: number[], ranges: Array<{start: number, end: number}>}} schedule
 * @param {Error} error From validateSchedule.
 * @returns {string}
 */
function problemText(schedule, error) {
  if (schedule.days.length === 0) return 'Pick at least one day for the schedule.';
  if (schedule.ranges.some(({ start, end }) => start === end)) {
    return 'A time range cannot start and end at the same time.';
  }
  return `Schedule not saved: ${error.message}`;
}

/**
 * @param {{id: string, labelId: string, onChange: (schedule: object) => void,
 *   onError: (message: string) => void}} options `id` goes on the first day
 *   toggle; `labelId` names the group.
 * @returns {{element: HTMLElement, set: (schedule: object) => void}}
 */
export function createScheduleEditor({ id, labelId, onChange, onError }) {
  const dayInputs = DAY_NAMES.map((name, day) => {
    const input = el('input', { type: 'checkbox', value: String(day) });
    if (day === 0) input.id = id;
    return { input, label: el('label', { className: 'day-toggle' }, [input, el('span', { textContent: name })]) };
  });
  const days = el('div', { className: 'schedule-days' }, dayInputs.map(({ label }) => label));
  const ranges = el('ol', { className: 'schedule-ranges' });
  const addRange = el('button', { type: 'button', className: 'btn btn-ghost btn-small', textContent: 'Add a time range' });
  const presets = el(
    'div',
    { className: 'schedule-presets' },
    PRESETS.map(([text, schedule]) => {
      const button = el('button', { type: 'button', className: 'btn btn-ghost btn-small', textContent: text });
      button.addEventListener('click', () => {
        set(schedule);
        emit();
      });
      return button;
    })
  );
  const element = el('div', { className: 'schedule', role: 'group' }, [presets, days, ranges, addRange]);
  element.setAttribute('aria-labelledby', labelId);

  /** The schedule on screen, or null when a time is missing. */
  const read = () => {
    try {
      return {
        days: dayInputs.filter(({ input }) => input.checked).map(({ input }) => Number(input.value)),
        ranges: [...ranges.children].map((row) => ({
          start: clockToMinutes(row.querySelector('.range-start').value),
          end: clockToMinutes(row.querySelector('.range-end').value, { isEnd: true }),
        })),
      };
    } catch (error) {
      console.warn('[steer-clear] schedule has an incomplete time', { error: error.message });
      return null;
    }
  };

  const emit = () => {
    const schedule = read();
    if (schedule === null) {
      onError('Enter both times of each range, or remove the range.');
      return;
    }
    try {
      validateSchedule(schedule);
    } catch (error) {
      onError(problemText(schedule, error));
      return;
    }
    onChange(schedule);
  };

  const syncRows = () => {
    addRange.hidden = ranges.children.length >= MAX_SCHEDULE_RANGES;
    for (const row of ranges.children) {
      row.querySelector('.range-remove').hidden = ranges.children.length === 1;
    }
  };

  const appendRange = ({ start, end }) => {
    const index = ranges.children.length + 1;
    const startInput = el('input', { type: 'time', className: 'range-start', value: minutesToClock(start) });
    const endInput = el('input', { type: 'time', className: 'range-end', value: minutesToClock(end) });
    startInput.setAttribute('aria-label', `Range ${index} starts`);
    endInput.setAttribute('aria-label', `Range ${index} ends`);
    const remove = el('button', { type: 'button', className: 'link danger range-remove', textContent: 'Remove' });
    const row = el('li', { className: 'schedule-range' }, [startInput, el('span', { textContent: 'to' }), endInput, remove]);
    startInput.addEventListener('change', emit);
    endInput.addEventListener('change', emit);
    remove.addEventListener('click', () => {
      row.remove();
      syncRows();
      emit();
    });
    ranges.append(row);
    syncRows();
  };

  for (const { input } of dayInputs) input.addEventListener('change', emit);
  addRange.addEventListener('click', () => {
    appendRange(WEEKDAY_WORK_SCHEDULE.ranges[0]);
    emit();
  });

  function set(schedule) {
    for (const { input } of dayInputs) input.checked = schedule.days.includes(Number(input.value));
    ranges.replaceChildren();
    for (const range of schedule.ranges) appendRange(range);
  }

  return { element, set };
}
