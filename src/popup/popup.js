/**
 * Steer Clear toolbar popup: today at a glance, "Steer clear of <this site>",
 * snooze, links, and the one-time rating banner.
 *
 * Reads statistics and status through the worker and the config directly
 * (reading has no side effects); every change is a worker message.
 */

import {
  MessageType,
  SNOOZE_ALLOWANCE_NOTE,
  SNOOZE_OPTIONS_MINUTES,
  STATS_PATH,
  STEERED_DAYS_WINDOW,
} from '../constants.js';
import { readConfig } from '../background/config.js';
import { steeredClearDays, todaySummary } from '../background/progress.js';
import { sendMessage } from '../shared/messaging.js';
import { mountRatingBanner } from '../shared/rating_banner.js';
import { quickAdd, quickAddOffer } from './quick_add.js';
import { SitesNotAddedError } from '../shared/site_access.js';
import { listedText, minutesLeft, snoozeOptionLabel, steeredDaysText, todayText } from './popup_text.js';

/** How often the snooze's time left is refreshed while the popup is open, in ms. */
const SNOOZE_REFRESH_MS = 15000;

const $ = (id) => document.getElementById(id);
const el = {
  configError: $('config-error'),
  todayFigure: $('today-figure'),
  todayDetail: $('today-detail'),
  steeredDays: $('steered-days'),
  quickAdd: $('quick-add'),
  quickAddButton: $('quick-add-button'),
  quickAddHost: $('quick-add-host'),
  listed: $('listed'),
  snoozeOff: $('snooze-off'),
  snoozeOptions: $('snooze-options'),
  snoozeNote: $('snooze-note'),
  snoozeOn: $('snooze-on'),
  snoozeRemaining: $('snooze-remaining'),
  resume: $('resume'),
  rating: $('rating'),
  status: $('status'),
  openStats: $('open-stats'),
  openSettings: $('open-settings'),
};

/** The host quick-add would list for the active tab. */
let quickAddTarget = null;
/** When the running snooze ends, or null. */
let snoozedUntil = null;

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle('is-error', isError);
}

/** @param {object} stats */
function renderToday(stats) {
  const now = Date.now();
  const text = todayText(todaySummary(stats, now));
  el.todayFigure.textContent = text.figure;
  el.todayDetail.textContent = text.detail;
  // Until any pause has an outcome, "0 of the last 7 days" would read as a
  // failure for someone who has simply not been paused yet.
  el.steeredDays.hidden = stats.outcomesSince === null;
  el.steeredDays.textContent = steeredDaysText(steeredClearDays(stats, now, STEERED_DAYS_WINDOW));
}

/**
 * Show either the snooze choices or the running snooze.
 *
 * @param {number|null} until
 * @param {{focus?: boolean}} [options] Move focus to the newly shown control,
 *   so a keyboard user is not left on a button that just disappeared.
 */
function renderSnooze(until, { focus = false } = {}) {
  snoozedUntil = until;
  const snoozed = until !== null;
  el.snoozeOff.hidden = snoozed;
  el.snoozeOn.hidden = !snoozed;
  if (snoozed) {
    const at = new Date(until).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    el.snoozeRemaining.textContent = `Pauses are off until ${at} (${minutesLeft(until, Date.now())} min left).`;
  }
  if (focus) (snoozed ? el.resume : el.snoozeOptions.querySelector('button'))?.focus();
}

/** Build one button per snooze length. */
function buildSnoozeOptions() {
  el.snoozeNote.textContent = SNOOZE_ALLOWANCE_NOTE;
  for (const minutes of SNOOZE_OPTIONS_MINUTES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-ghost';
    button.textContent = snoozeOptionLabel(minutes);
    button.setAttribute('aria-describedby', 'snooze-note');
    button.addEventListener('click', () => snooze(minutes));
    el.snoozeOptions.append(button);
  }
}

/** @param {number} minutes */
async function snooze(minutes) {
  try {
    const { until } = await sendMessage({ type: MessageType.SET_SNOOZE, minutes });
    renderSnooze(until, { focus: true });
    setStatus(`Snoozed for ${snoozeOptionLabel(minutes)}.`);
  } catch (error) {
    console.error('[steer-clear] snooze failed', { minutes, error: error.message });
    setStatus(`Could not snooze: ${error.message}`, true);
  }
}

async function resume() {
  try {
    await sendMessage({ type: MessageType.CLEAR_SNOOZE });
    renderSnooze(null, { focus: true });
    setStatus('Pauses are back on.');
  } catch (error) {
    console.error('[steer-clear] resume failed', { error: error.message });
    setStatus(`Could not resume: ${error.message}`, true);
  }
}

/** Keep the time left current; drop back to the choices when it ends. */
function refreshSnooze() {
  if (snoozedUntil === null) return;
  renderSnooze(snoozedUntil > Date.now() ? snoozedUntil : null);
}

/**
 * Offer quick-add for the active tab when it is a web page not yet listed.
 *
 * @param {object|undefined} tab
 * @param {object|null} config Null when the settings cannot be read.
 */
function renderQuickAdd(tab, config) {
  if (config === null) return;
  const offer = quickAddOffer(tab?.url, config);
  if (offer === null) return;
  if (offer.listed) {
    el.listed.textContent = listedText(offer.listed);
    el.listed.hidden = false;
    return;
  }
  quickAddTarget = offer.host;
  el.quickAddHost.textContent = offer.host;
  el.quickAdd.hidden = false;
}

/**
 * Quick-add: the message leaves and the prompt opens in the same tick.
 * The popup may close when the prompt opens (Firefox); the site is stored
 * either way and shows in settings, granted or "needs access".
 */
function handleQuickAdd() {
  const host = quickAddTarget;
  let granted;
  try {
    granted = quickAdd(host);
  } catch (error) {
    console.error('[steer-clear] quick-add failed', { host, error: error.message });
    setStatus(`Could not add ${host}: ${error.message}`, true);
    return;
  }
  el.quickAdd.hidden = true;
  granted
    .then((ok) => {
      setStatus(
        ok ? `${host} added. Reload the tab to see your pause.` : `${host} added, but it needs access. Grant it in Settings.`,
        !ok
      );
    })
    .catch((error) => {
      // Nothing was stored when the add failed; offer it again.
      if (error instanceof SitesNotAddedError) el.quickAdd.hidden = false;
      setStatus(error instanceof SitesNotAddedError ? error.message : `Could not ask for access: ${error.message}`, true);
    });
}

/** @returns {Promise<object|null>} The config, or null when it cannot be read (GET_STATUS says why). */
async function readConfigOrNull() {
  try {
    return await readConfig();
  } catch (error) {
    console.error('[steer-clear] popup: settings unreadable; quick-add hidden', { error: error.message });
    return null;
  }
}

/** @returns {Promise<object|undefined>} The tab the popup was opened over. */
async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * Open an extension page in a tab and close the popup.
 *
 * @param {MouseEvent} event
 * @param {() => Promise<unknown>} open
 */
function openPage(event, open) {
  event.preventDefault();
  open()
    .then(() => window.close())
    .catch((error) => {
      console.error('[steer-clear] could not open page', { error: error.message });
      setStatus(`Could not open the page: ${error.message}`, true);
    });
}

async function init() {
  try {
    el.openStats.addEventListener('click', (event) =>
      openPage(event, () => chrome.tabs.create({ url: chrome.runtime.getURL(STATS_PATH) })));
    el.openSettings.addEventListener('click', (event) => openPage(event, () => chrome.runtime.openOptionsPage()));
    el.quickAddButton.addEventListener('click', handleQuickAdd);
    el.resume.addEventListener('click', resume);
    buildSnoozeOptions();
    window.setInterval(refreshSnooze, SNOOZE_REFRESH_MS);

    const [{ stats }, status, config, tab] = await Promise.all([
      sendMessage({ type: MessageType.GET_STATS }),
      sendMessage({ type: MessageType.GET_STATUS }),
      readConfigOrNull(),
      activeTab(),
    ]);
    renderToday(stats);
    renderSnooze(status.snoozedUntil);
    if (status.configError) {
      el.configError.textContent = `Your settings could not be read: ${status.configError}`;
      el.configError.hidden = false;
    }
    renderQuickAdd(tab, config);
    await mountRatingBanner(el.rating, stats);
  } catch (error) {
    console.error('[steer-clear] popup init failed', { error: error.message });
    setStatus(`Something went wrong: ${error.message}`, true);
  }
}

init();
