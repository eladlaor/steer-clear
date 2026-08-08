/**
 * Steer Clear options page controller.
 *
 * Edits the config in chrome.storage.sync. The service worker observes storage
 * changes and rebuilds rules; this page never touches declarativeNetRequest.
 */

import { readConfig, writeConfig, createSite } from '../background/config.js';
import { normalizePattern } from '../background/rules.js';

const elements = {
  globalTarget: document.getElementById('global-target'),
  globalNote: document.getElementById('global-note'),
  addForm: document.getElementById('add-form'),
  addPattern: document.getElementById('add-pattern'),
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
  const pattern = fragment.querySelector('.site-pattern');
  const expand = fragment.querySelector('.site-expand');
  const remove = fragment.querySelector('.site-remove');
  const detail = fragment.querySelector('.site-detail');
  const subdomains = fragment.querySelector('.site-subdomains');
  const target = fragment.querySelector('.site-target');
  const note = fragment.querySelector('.site-note');

  pattern.textContent = site.pattern;
  enabled.checked = site.enabled;
  subdomains.checked = site.includeSubdomains;
  target.value = site.target ?? '';
  note.value = site.note ?? '';
  row.classList.toggle('disabled', !site.enabled);

  enabled.addEventListener('change', () => {
    site.enabled = enabled.checked;
    row.classList.toggle('disabled', !site.enabled);
    save();
  });

  expand.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    expand.textContent = detail.hidden ? 'Customize' : 'Done';
  });

  remove.addEventListener('click', () => {
    config.sites = config.sites.filter((entry) => entry.id !== site.id);
    render();
    save();
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

  return fragment;
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
function handleAdd(event) {
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

    config.sites.push(createSite(host));
    elements.addPattern.value = '';
    render();
    save();
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
    elements.globalNote.value = config.globalNote;

    elements.globalTarget.addEventListener('input', () => {
      config.globalTarget = elements.globalTarget.value.trim();
      if (config.globalTarget === '') {
        setStatus('A default destination is required', true);
        return;
      }
      saveDebounced();
    });

    elements.globalNote.addEventListener('input', () => {
      config.globalNote = elements.globalNote.value;
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
