/**
 * Steer Clear onboarding: pick sites, then turn it on. Opened once, on
 * first install.
 *
 * Step 1 picks sites (chips, none preselected, plus typed domains) with an
 * optional reason each. Step 2 is one button that adds them all and asks
 * for access in the same tick (turn_on.js). If sites already exist, or
 * arrive from another device while this page is open, setup is skipped.
 */

import { LifecycleEvent, MessageType, REASON_INPUT_MAX_CHARS, StorageArea } from '../constants.js';
import { readConfig } from '../background/config.js';
import { PRESETS, normalizeOnboardingSelection } from '../background/presets.js';
import { normalizePattern } from '../background/rules.js';
import { sendWithoutAwait } from '../shared/messaging.js';
import { turnOn } from './turn_on.js';

const $ = (id) => document.getElementById(id);
const el = {
  skip: $('skip'),
  synced: $('synced'),
  setup: $('setup'),
  chips: $('chips'),
  addDomain: $('add-domain'),
  domainInput: $('domain-input'),
  domainError: $('domain-error'),
  picked: $('picked'),
  pickedList: $('picked-list'),
  pickedCount: $('picked-count'),
  turnOn: $('turn-on'),
  done: $('done'),
  doneHeading: $('done-heading'),
  doneText: $('done-text'),
  tryIt: $('try-it'),
  status: $('status'),
};

/** Picked preset hosts, in the order picked. */
const chips = [];
/** Typed hosts, normalized, in the order added. */
const typed = [];
/** Reason per host; kept when a site is unpicked and picked again. */
const reasons = new Map();
/** Once "Turn on" is pressed, our own write must not read as a synced one. */
let turnedOn = false;
let setupSkipped = false;

const completeOnboarding = () =>
  sendWithoutAwait({ type: MessageType.RECORD_LIFECYCLE_EVENT, event: LifecycleEvent.ONBOARDING_COMPLETED });

/** @returns {string[]} Every picked host, chips first. */
const selection = () => normalizeOnboardingSelection(chips, typed);

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.classList.toggle('is-error', isError);
}

/** @param {string} host @returns {string} A DOM id fragment. */
const idFor = (host) => host.replace(/[^a-z0-9]/g, '-');

/** One labelled group of chip buttons per preset category. */
function buildChips() {
  for (const group of PRESETS) {
    const wrapper = document.createElement('div');
    wrapper.className = 'chip-group';
    wrapper.setAttribute('role', 'group');
    wrapper.setAttribute('aria-labelledby', `chips-${group.id}`);

    const heading = Object.assign(document.createElement('h3'), { id: `chips-${group.id}`, textContent: group.label });
    const row = Object.assign(document.createElement('div'), { className: 'chips' });
    for (const host of group.hosts) {
      const chip = Object.assign(document.createElement('button'), { type: 'button', className: 'chip', textContent: host });
      chip.dataset.host = host;
      chip.setAttribute('aria-pressed', 'false');
      chip.addEventListener('click', () => toggleChip(host));
      row.append(chip);
    }
    wrapper.append(heading, row);
    el.chips.append(wrapper);
  }
}

/** @param {string} host A preset host. */
function toggleChip(host) {
  const index = chips.indexOf(host);
  if (index === -1) chips.push(host);
  else chips.splice(index, 1);
  renderSelection();
}

/** Add what the user typed: a preset turns its chip on; anything else is listed. */
function handleAddDomain(event) {
  event.preventDefault();
  const raw = el.domainInput.value;
  let host;
  try {
    host = normalizePattern(raw);
  } catch (error) {
    console.warn('[steer-clear] onboarding rejected a domain', { raw, error: error.message });
    el.domainInput.setAttribute('aria-invalid', 'true');
    el.domainError.textContent = `"${raw.trim()}" doesn't look like a domain, such as example.com.`;
    return;
  }
  el.domainInput.removeAttribute('aria-invalid');
  el.domainError.textContent = '';
  el.domainInput.value = '';
  if (selection().includes(host)) {
    setStatus(`${host} is already picked.`);
    return;
  }
  if (PRESETS.some((group) => group.hosts.includes(host))) chips.push(host);
  else typed.push(host);
  renderSelection();
  setStatus(`${host} added.`);
}

/**
 * One row per picked site: its name, an optional reason, and for a typed
 * site a remove button (a chip is unpicked by its chip).
 *
 * @param {string} host
 * @returns {HTMLLIElement}
 */
function buildPickedRow(host) {
  const item = Object.assign(document.createElement('li'), { className: 'picked-item' });
  const head = Object.assign(document.createElement('div'), { className: 'picked-head' });
  const inputId = `reason-${idFor(host)}`;
  const label = Object.assign(document.createElement('label'), { className: 'picked-host', htmlFor: inputId, textContent: host });
  head.append(label);

  if (typed.includes(host)) {
    const remove = Object.assign(document.createElement('button'), { type: 'button', className: 'link danger', textContent: 'Remove' });
    remove.setAttribute('aria-label', `Remove ${host}`);
    remove.addEventListener('click', () => {
      typed.splice(typed.indexOf(host), 1);
      renderSelection();
      el.domainInput.focus();
    });
    head.append(remove);
  }

  const input = Object.assign(document.createElement('input'), {
    type: 'text',
    id: inputId,
    maxLength: REASON_INPUT_MAX_CHARS,
    placeholder: 'Why steer clear? (optional)',
    value: reasons.get(host) ?? '',
  });
  input.addEventListener('input', () => reasons.set(host, input.value));
  item.append(head, input);
  return item;
}

/** Repaint the chips' pressed state, the picked list and the Turn on button. */
function renderSelection() {
  const hosts = selection();
  for (const chip of el.chips.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String(chips.includes(chip.dataset.host)));
  }
  el.pickedList.replaceChildren(...hosts.map(buildPickedRow));
  el.picked.hidden = hosts.length === 0;
  el.turnOn.setAttribute('aria-disabled', String(hosts.length === 0));
  el.pickedCount.textContent =
    hosts.length === 0 ? 'Pick at least one site first.' : `${hosts.length} ${hosts.length === 1 ? 'site' : 'sites'} picked.`;
}

/** "Turn on": message and prompt in one tick; nothing before it awaits. */
function handleTurnOn() {
  if (turnedOn) return;
  let result;
  try {
    result = turnOn({ chips, typedHosts: typed, reasons: Object.fromEntries(reasons) });
  } catch (error) {
    console.warn('[steer-clear] turn on refused', { error: error.message });
    setStatus(error.message, true);
    el.chips.querySelector('.chip')?.focus();
    return;
  }
  turnedOn = true;
  el.turnOn.setAttribute('aria-disabled', 'true');
  setStatus('Waiting for your browser…');
  result.granted
    .then((granted) => showDone(result.hosts, granted))
    .catch((error) => {
      console.error('[steer-clear] onboarding access request failed', { error: error.message });
      showDone(result.hosts, false);
    });
}

/**
 * @param {string[]} hosts What was added.
 * @param {boolean} granted Whether access was given.
 */
function showDone(hosts, granted) {
  el.setup.hidden = true;
  el.skip.hidden = true;
  el.done.hidden = false;
  setStatus('');
  const first = hosts[0];
  if (granted) {
    el.doneHeading.textContent = 'Steer Clear is on';
    el.doneText.textContent = `${hosts.length === 1 ? first : `${hosts.length} sites`} will show your pause instead of loading.`;
    el.tryIt.textContent = `Try it: open ${first}`;
    el.tryIt.href = `https://${first}/`;
    el.tryIt.hidden = false;
  } else {
    el.doneHeading.textContent = 'Almost there';
    el.doneText.textContent =
      'Your sites are saved, but they need your permission before they can pause. Grant it in Settings.';
    el.tryIt.hidden = true;
  }
  el.done.focus();
}

/**
 * Open the first site in this tab. The browser's own navigation, unlike a
 * link click from this page, is what the pause rule catches.
 *
 * @param {MouseEvent} event
 */
function handleTryIt(event) {
  event.preventDefault();
  const url = el.tryIt.href;
  chrome.tabs
    .getCurrent()
    .then((tab) => chrome.tabs.update(tab.id, { url }))
    .catch((error) => {
      console.error('[steer-clear] could not open the first site', { url, error: error.message });
      setStatus(`Could not open it: ${error.message}`, true);
    });
}

/** Sites are already set up (here, or synced from another device): skip setup. */
function showSynced() {
  if (setupSkipped) return;
  setupSkipped = true;
  el.setup.hidden = true;
  el.skip.hidden = true;
  el.done.hidden = true;
  el.synced.hidden = false;
  el.synced.focus();
  completeOnboarding();
}

/** Skip setup when the config already lists sites. */
async function checkForSyncedSites() {
  if (turnedOn) return;
  try {
    const config = await readConfig();
    // "Turn on" may have been pressed while this read was in flight; the
    // sites it finds are then the user's own, not synced ones.
    if (turnedOn) return;
    if (config.sites.length > 0) showSynced();
  } catch (error) {
    console.error('[steer-clear] onboarding could not read settings', { error: error.message });
    setStatus(`Your settings could not be read: ${error.message}. Open Settings for details.`, true);
  }
}

function init() {
  buildChips();
  renderSelection();
  el.addDomain.addEventListener('submit', handleAddDomain);
  el.turnOn.addEventListener('click', handleTurnOn);
  el.tryIt.addEventListener('click', handleTryIt);
  el.skip.addEventListener('click', completeOnboarding);
  // On a second device, synced sites can arrive after install opened this page.
  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === StorageArea.SYNC) checkForSyncedSites();
  });
  checkForSyncedSites();
}

init();
