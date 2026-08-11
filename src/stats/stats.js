/**
 * Steer Clear statistics page.
 *
 * Renders aggregates from the service worker's stats record. All computation
 * lives in stats.js; this file only asks for data and paints it.
 *
 * Charts are plain DOM elements sized with CSS custom properties rather than a
 * charting library — the shapes needed here are bars and a sparkline, and a
 * bundled dependency would be more code than the thing it draws.
 */

import { MessageType } from '../constants.js';
import {
  summarize,
  totalsByHost,
  countsByHour,
  countsByWeekday,
  dailySeries,
  lifetimeTotal,
} from '../background/stats.js';

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const elements = {
  since: document.getElementById('since'),
  total: document.getElementById('total'),
  last7: document.getElementById('last7'),
  topHost: document.getElementById('top-host'),
  emptyState: document.getElementById('empty-state'),
  content: document.getElementById('content'),
  bySite: document.getElementById('by-site'),
  byHour: document.getElementById('by-hour'),
  byWeekday: document.getElementById('by-weekday'),
  daily: document.getElementById('daily'),
  clear: document.getElementById('clear'),
  status: document.getElementById('status'),
  openOptions: document.getElementById('open-options'),
};

/** Whether the erase button is awaiting confirmation. */
let clearArmed = false;

/**
 * Ask the service worker for something, rejecting on a failed response.
 *
 * @param {object} message
 * @returns {Promise<object>}
 */
async function sendMessage(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) {
    throw new Error(response?.error ?? 'no response from service worker');
  }
  return response;
}

/**
 * Render a horizontal bar list into a container.
 *
 * @param {HTMLElement} container
 * @param {Array<{label: string, count: number}>} rows
 */
function renderBars(container, rows) {
  container.replaceChildren();

  const max = Math.max(1, ...rows.map((row) => row.count));

  for (const row of rows) {
    const item = document.createElement('li');
    item.className = 'bar-row';

    const label = document.createElement('span');
    label.className = 'bar-label';
    label.textContent = row.label;

    const track = document.createElement('span');
    track.className = 'bar-track';

    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    fill.style.setProperty('--fill', `${(row.count / max) * 100}%`);

    const value = document.createElement('span');
    value.className = 'bar-value';
    value.textContent = String(row.count);

    track.appendChild(fill);
    item.append(label, track, value);
    container.appendChild(item);
  }
}

/**
 * Render the 24-hour column chart.
 *
 * @param {number[]} hours
 */
function renderHours(hours) {
  elements.byHour.replaceChildren();
  const max = Math.max(1, ...hours);

  hours.forEach((count, hour) => {
    const column = document.createElement('div');
    column.className = 'hour';
    // Every hour gets a title, so the chart is readable without hover-guessing.
    column.title = `${formatHour(hour)} — ${count} ${count === 1 ? 'time' : 'times'}`;

    const fill = document.createElement('div');
    fill.className = 'hour-fill';
    fill.style.setProperty('--height', `${(count / max) * 100}%`);

    const label = document.createElement('span');
    label.className = 'hour-label';
    // Label every six hours; 24 labels would collide at this width.
    label.textContent = hour % 6 === 0 ? String(hour) : '';

    column.append(fill, label);
    elements.byHour.appendChild(column);
  });
}

/**
 * Render the trailing-30-day sparkline.
 *
 * @param {Array<{date: string, count: number}>} series
 */
function renderDaily(series) {
  elements.daily.replaceChildren();
  const max = Math.max(1, ...series.map((day) => day.count));

  for (const day of series) {
    const column = document.createElement('div');
    column.className = 'spark';
    column.style.setProperty('--height', `${(day.count / max) * 100}%`);
    column.title = `${day.date} — ${day.count} ${day.count === 1 ? 'time' : 'times'}`;
    elements.daily.appendChild(column);
  }
}

/**
 * Format an hour as a readable local time label.
 *
 * @param {number} hour 0–23
 * @returns {string}
 */
function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

/**
 * Paint the whole page from a stats record.
 *
 * @param {object} stats
 */
function render(stats) {
  const now = Date.now();
  const summary = summarize(stats, now);

  elements.total.textContent = String(summary.total);
  elements.last7.textContent = String(summary.last7);
  elements.topHost.textContent = summary.topHost ?? '—';

  elements.since.textContent = summary.since
    ? `Counting since ${new Date(summary.since).toLocaleDateString()}`
    : 'Nothing counted yet';

  const hasData = lifetimeTotal(stats) > 0;
  elements.emptyState.hidden = hasData;
  elements.content.hidden = !hasData;

  if (!hasData) {
    return;
  }

  renderBars(
    elements.bySite,
    totalsByHost(stats).map(({ host, count }) => ({ label: host, count }))
  );

  renderHours(countsByHour(stats));

  renderBars(
    elements.byWeekday,
    countsByWeekday(stats).map((count, day) => ({
      label: WEEKDAY_NAMES[day],
      count,
    }))
  );

  renderDaily(dailySeries(stats, now, 30));
}

/**
 * Two-step erase. The first click arms, the second confirms.
 *
 * A click-to-confirm rather than window.confirm(): a modal dialog blocks the
 * page, and this is destructive and unrecoverable.
 */
async function handleClear() {
  try {
    if (!clearArmed) {
      clearArmed = true;
      elements.clear.textContent = 'Click again to erase everything';
      elements.status.textContent = 'This cannot be undone.';

      window.setTimeout(() => {
        if (!clearArmed) {
          return;
        }
        clearArmed = false;
        elements.clear.textContent = 'Erase my statistics';
        elements.status.textContent = '';
      }, 5000);
      return;
    }

    clearArmed = false;
    elements.clear.textContent = 'Erase my statistics';

    await sendMessage({ type: MessageType.CLEAR_STATS });
    const { stats } = await sendMessage({ type: MessageType.GET_STATS });

    render(stats);
    elements.status.textContent = 'Erased.';
  } catch (error) {
    console.error('[steer-clear] handleClear failed', { error: error.message });
    elements.status.textContent = `Could not erase: ${error.message}`;
  }
}

/** Initialize the page. */
async function init() {
  try {
    elements.openOptions.addEventListener('click', (event) => {
      event.preventDefault();
      chrome.runtime.openOptionsPage();
    });

    elements.clear.addEventListener('click', handleClear);

    const { stats } = await sendMessage({ type: MessageType.GET_STATS });
    render(stats);
  } catch (error) {
    console.error('[steer-clear] stats init failed', { error: error.message });
    elements.status.textContent = `Could not load statistics: ${error.message}`;
  }
}

init();
