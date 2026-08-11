/**
 * Steer Clear options page controller.
 *
 * Edits the config in chrome.storage.sync. The service worker observes storage
 * changes and rebuilds rules; this page never touches declarativeNetRequest.
 */

import { readConfig, writeConfig, createSite } from '../background/config.js';
import { normalizePattern } from '../background/rules.js';
import {
  hasHostPermission,
  requestHostPermission,
  revokeHostPermission,
} from '../background/permissions.js';
import {
  MessageType,
  MIN_COUNTDOWN_SECONDS,
  MAX_COUNTDOWN_SECONDS,
} from '../constants.js';

const elements = {
  globalTarget: document.getElementById('global-target'),
  globalTargetName: document.getElementById('global-target-name'),
  globalNote: document.getElementById('global-note'),
  globalAutoContinue: document.getElementById('global-auto-continue'),
  globalCountdown: document.getElementById('global-countdown'),
  globalCountdownField: document.getElementById('global-countdown-field'),
  addForm: document.getElementById('add-form'),
  addPattern: document.getElementById('add-pattern'),
  addDisplayName: document.getElementById('add-display-name'),
  addTarget: document.getElementById('add-target'),
  addNote: document.getElementById('add-note'),
  sites: document.getElementById('sites'),
  empty: document.getElementById('empty'),
  status: document.getElementById('status'),
  rowTemplate: document.getElementById('site-row'),
};

/** In-memory working copy; persisted on every mutation. */
let config = null;

/** Debounce handle for text-input persistence. */
let saveTimer = null;

/**
 * Show a transient status message.
 *
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? 'var(--danger)' : 'var(--ink-soft)';

  if (message && !isError) {
    window.setTimeout(() => {
      if (elements.status.textContent === message) {
        elements.status.textContent = '';
      }
    }, 2000);
  }
}

/**
 * Persist the working config.
 *
 * @returns {Promise<void>}
 */
async function save() {
  try {
    await writeConfig(config);
    setStatus('Saved');
  } catch (error) {
    console.error('[steer-clear] save failed', { error: error.message });
    setStatus(`Could not save: ${error.message}`, true);
  }
}

/** Persist after a pause, so typing doesn't write on every keystroke. */
function saveDebounced() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 400);
}

/**
 * Build a DOM row for one site entry.
 *
 * @param {object} site The site entry.
 * @returns {DocumentFragment}
 */
function buildRow(site) {
  const fragment = elements.rowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.site');
  const enabled = fragment.querySelector('.site-enabled');
  const nameEl = fragment.querySelector('.site-name');
  const pattern = fragment.querySelector('.site-pattern');
  const expand = fragment.querySelector('.site-expand');
  const remove = fragment.querySelector('.site-remove');
  const detail = fragment.querySelector('.site-detail');
  const warning = fragment.querySelector('.site-warning');
  const grant = fragment.querySelector('.site-grant');
  const displayName = fragment.querySelector('.site-display-name');
  const subdomains = fragment.querySelector('.site-subdomains');
  const target = fragment.querySelector('.site-target');
  const note = fragment.querySelector('.site-note');
  const autoContinue = fragment.querySelector('.site-auto-continue');
  const countdown = fragment.querySelector('.site-countdown');

  const label = site.displayName?.trim();
  nameEl.textContent = label || site.pattern;
  // Avoid printing the domain twice when it is also the label.
  pattern.textContent = label ? site.pattern : '';
  enabled.checked = site.enabled;
  displayName.value = site.displayName ?? '';
  subdomains.checked = site.includeSubdomains;
  target.value = site.target ?? '';
  note.value = site.note ?? '';
  countdown.value = site.countdownSeconds ?? '';
  autoContinue.value =
    site.autoContinue === null ? 'inherit' : String(site.autoContinue);
  row.classList.toggle('disabled', !site.enabled);

  // A site with no host permission is inert: the rule is never installed. Say
  // so plainly, because the alternative is a site that looks configured and
  // silently does nothing.
  refreshPermissionState(site, warning);

  grant.addEventListener('click', async () => {
    await handleGrant(site, warning);
  });

  enabled.addEventListener('change', () => {
    site.enabled = enabled.checked;
    row.classList.toggle('disabled', !site.enabled);
    save();
  });

  expand.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    expand.textContent = detail.hidden ? 'Customize' : 'Done';
  });

  remove.addEventListener('click', async () => {
    config.sites = config.sites.filter((entry) => entry.id !== site.id);
    render();
    await save();

    // Hand back the host permission; keeping access to a site the user removed
    // would be a quiet over-reach.
    try {
      await revokeHostPermission(normalizePattern(site.pattern));
    } catch (error) {
      console.warn('[steer-clear] could not revoke on remove', {
        pattern: site.pattern,
        error: error.message,
      });
    }
  });

  displayName.addEventListener('input', () => {
    site.displayName = displayName.value.trim() || null;
    const next = site.displayName;
    nameEl.textContent = next || site.pattern;
    pattern.textContent = next ? site.pattern : '';
    saveDebounced();
  });

  subdomains.addEventListener('change', () => {
    site.includeSubdomains = subdomains.checked;
    save();
  });

  target.addEventListener('input', () => {
    site.target = target.value.trim() || null;
    saveDebounced();
  });

  note.addEventListener('input', () => {
    site.note = note.value.trim() || null;
    saveDebounced();
  });

  autoContinue.addEventListener('change', () => {
    site.autoContinue =
      autoContinue.value === 'inherit' ? null : autoContinue.value === 'true';
    save();
  });

  countdown.addEventListener('input', () => {
    const raw = countdown.value.trim();

    if (raw === '') {
      site.countdownSeconds = null;
      saveDebounced();
      return;
    }

    const seconds = Number.parseInt(raw, 10);
    if (!inCountdownRange(seconds)) {
      setStatus(
        `Wait time must be between ${MIN_COUNTDOWN_SECONDS} and ${MAX_COUNTDOWN_SECONDS} seconds`,
        true
      );
      return;
    }

    site.countdownSeconds = seconds;
    saveDebounced();
  });

  return fragment;
}

/**
 * Show the countdown-duration field only when auto-continue is on.
 */
function syncCountdownVisibility() {
  elements.globalCountdownField.hidden = !elements.globalAutoContinue.checked;
}

/**
 * Whether a countdown value is within the accepted range.
 *
 * @param {number} seconds
 * @returns {boolean}
 */
function inCountdownRange(seconds) {
  return (
    Number.isInteger(seconds) &&
    seconds >= MIN_COUNTDOWN_SECONDS &&
    seconds <= MAX_COUNTDOWN_SECONDS
  );
}

/**
 * Show or hide a site's "needs permission" banner to match reality.
 *
 * @param {object} site
 * @param {HTMLElement} warning The banner element for this row.
 * @returns {Promise<void>}
 */
async function refreshPermissionState(site, warning) {
  try {
    const host = normalizePattern(site.pattern);
    warning.hidden = await hasHostPermission(host);
  } catch (error) {
    console.error('[steer-clear] refreshPermissionState failed', {
      pattern: site.pattern,
      error: error.message,
    });
    warning.hidden = false;
  }
}

/**
 * Request host permission for a site, then rebuild rules if granted.
 *
 * @param {object} site
 * @param {HTMLElement} warning The banner element for this row.
 * @returns {Promise<void>}
 */
async function handleGrant(site, warning) {
  try {
    const host = normalizePattern(site.pattern);
    const granted = await requestHostPermission(host);

    if (!granted) {
      setStatus(`Steer Clear can't work on ${host} without access`, true);
      return;
    }

    warning.hidden = true;

    // A permission grant is not a storage write, so nothing else would prompt
    // the worker to notice it.
    await chrome.runtime.sendMessage({ type: MessageType.REBUILD_RULES });
    setStatus(`${host} is active`);
  } catch (error) {
    console.error('[steer-clear] handleGrant failed', {
      pattern: site.pattern,
      error: error.message,
    });
    setStatus(`Could not get access: ${error.message}`, true);
  }
}

/** Re-render the site list from the working config. */
function render() {
  elements.sites.replaceChildren();
  config.sites.forEach((site) => {
    elements.sites.appendChild(buildRow(site));
  });
  elements.empty.hidden = config.sites.length > 0;
}

/**
 * Handle the add-site form.
 *
 * @param {SubmitEvent} event
 */
async function handleAdd(event) {
  event.preventDefault();

  const raw = elements.addPattern.value;

  try {
    const host = normalizePattern(raw);

    const duplicate = config.sites.some((site) => {
      try {
        return normalizePattern(site.pattern) === host;
      } catch {
        return false;
      }
    });

    if (duplicate) {
      setStatus(`${host} is already on the list`, true);
      return;
    }

    // Ask for access while the click that submitted this form is still the
    // active user gesture — Chrome refuses permission prompts outside one.
    // The site is added either way: a refused prompt leaves a visible
    // "needs permission" row the user can act on later, which is friendlier
    // than silently discarding what they typed.
    const granted = await requestHostPermission(host);

    config.sites.push(
      createSite(host, {
        displayName: elements.addDisplayName.value,
        target: elements.addTarget.value,
        note: elements.addNote.value,
      })
    );

    elements.addForm.reset();
    render();
    await save();

    if (granted) {
      await chrome.runtime.sendMessage({ type: MessageType.REBUILD_RULES });
    } else {
      setStatus(`Added ${host}, but it needs access before it can work`, true);
    }
  } catch (error) {
    console.error('[steer-clear] handleAdd failed', {
      pattern: raw,
      error: error.message,
    });
    setStatus(`"${raw}" doesn't look like a domain`, true);
  }
}

/** Initialize the page. */
async function init() {
  try {
    config = await readConfig();

    elements.globalTarget.value = config.globalTarget;
    elements.globalTargetName.value = config.globalTargetName;
    elements.globalNote.value = config.globalNote;
    elements.globalAutoContinue.checked = config.globalAutoContinue;
    elements.globalCountdown.value = config.globalCountdownSeconds;

    elements.globalTarget.addEventListener('input', () => {
      config.globalTarget = elements.globalTarget.value.trim();
      if (config.globalTarget === '') {
        setStatus('A default destination is required', true);
        return;
      }
      saveDebounced();
    });

    elements.globalTargetName.addEventListener('input', () => {
      config.globalTargetName = elements.globalTargetName.value.trim();
      saveDebounced();
    });

    elements.globalNote.addEventListener('input', () => {
      config.globalNote = elements.globalNote.value;
      saveDebounced();
    });

    // The countdown duration is meaningless while auto-continue is off, and
    // showing it there implies a countdown is running when none is.
    syncCountdownVisibility();

    elements.globalAutoContinue.addEventListener('change', () => {
      config.globalAutoContinue = elements.globalAutoContinue.checked;
      syncCountdownVisibility();
      save();
      setStatus(
        config.globalAutoContinue
          ? `On — sites will move on by themselves after ${config.globalCountdownSeconds}s`
          : 'Off — the reminder will wait for you'
      );
    });

    elements.globalCountdown.addEventListener('input', () => {
      const seconds = Number.parseInt(elements.globalCountdown.value, 10);
      if (!inCountdownRange(seconds)) {
        setStatus(
          `Wait time must be between ${MIN_COUNTDOWN_SECONDS} and ${MAX_COUNTDOWN_SECONDS} seconds`,
          true
        );
        return;
      }
      config.globalCountdownSeconds = seconds;
      saveDebounced();
    });

    elements.addForm.addEventListener('submit', handleAdd);

    render();
  } catch (error) {
    console.error('[steer-clear] init failed', { error: error.message });
    setStatus(`Could not load settings: ${error.message}`, true);
  }
}

init();
