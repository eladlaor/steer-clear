/**
 * Steer Clear settings page bootstrap.
 *
 * Reads the config directly (reading has no side effects) and changes it only
 * through worker messages. Re-renders whenever synced settings change — from
 * this tab, another tab, the pause page or another device.
 */

import { MessageType, SettingsFormMode, StorageArea, StorageKey } from '../constants.js';
import { readConfig } from '../background/config.js';
import { sendMessage } from '../shared/messaging.js';
import { createSettingsForm } from './settings_form.js';
import { createSiteList } from './site_list.js';
import { createDataPanel } from './data_panel.js';

/** How long a success message stays, in ms. */
const STATUS_CLEAR_MS = 2000;

const $ = (id) => document.getElementById(id);
const status = $('status');
const configError = $('config-error');

/**
 * Show a status message; successes clear themselves.
 *
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('is-error', isError);
  if (message && !isError) {
    window.setTimeout(() => {
      if (status.textContent === message) status.textContent = '';
    }, STATUS_CLEAR_MS);
  }
}

/** Send a defaults change to the worker. */
async function updateDefaults(patch) {
  try {
    await sendMessage({ type: MessageType.UPDATE_DEFAULTS, patch });
    setStatus('Saved');
  } catch (error) {
    console.error('[steer-clear] defaults change failed', { patch, error: error.message });
    setStatus(`Could not save: ${error.message}`, true);
  }
}

const defaultsForm = createSettingsForm($('defaults-form'), {
  mode: SettingsFormMode.DEFAULTS,
  idPrefix: SettingsFormMode.DEFAULTS,
  onPatch: updateDefaults,
  onClear: (key) => {
    throw new Error(`defaults cannot inherit; "${key}" has no default to fall back to`);
  },
  onError: (message) => setStatus(message, true),
});

const siteList = createSiteList({
  list: $('sites'),
  empty: $('empty'),
  template: $('site-row'),
  addForm: $('add-form'),
  addPattern: $('add-pattern'),
  addReason: $('add-reason'),
  setStatus,
});

createDataPanel({
  exportButton: $('export-settings'),
  importButton: $('import-settings'),
  fileInput: $('import-file'),
  preview: $('import-preview'),
  summary: $('import-summary'),
  duplicates: $('import-duplicates'),
  confirm: $('import-confirm'),
  cancel: $('import-cancel'),
  access: $('import-access'),
  accessText: $('import-access-text'),
  grant: $('import-grant'),
  setStatus,
});

/** Remove one damaged site item, by the key the error named. */
async function removeDamaged(key) {
  try {
    await sendMessage({ type: MessageType.REMOVE_SITE, siteId: key.slice(StorageKey.SITE_PREFIX.length) });
    setStatus('Removed the damaged item');
  } catch (error) {
    console.error('[steer-clear] removing a damaged site item failed', { key, error: error.message });
    setStatus(`Could not remove it: ${error.message}`, true);
  }
}

/**
 * List the site items that could not be read, each with a way to remove it.
 *
 * @param {Array<{key: string, error: string}>} invalidSites
 */
function showInvalidSites(invalidSites) {
  configError.hidden = invalidSites.length === 0;
  configError.replaceChildren();
  if (invalidSites.length === 0) return;

  const lead = document.createElement('p');
  lead.textContent = 'Some saved sites could not be read and are not active. Remove them and add the site again:';
  const list = document.createElement('ul');
  for (const { key, error } of invalidSites) {
    const item = document.createElement('li');
    item.append(`${key}: ${error} `);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn btn-small danger';
    remove.textContent = 'Remove damaged item';
    remove.addEventListener('click', () => removeDamaged(key));
    item.append(remove);
    list.append(item);
  }
  configError.append(lead, list);
}

/** Read the config and render every part of the page from it. */
async function render() {
  try {
    const config = await readConfig();
    defaultsForm.update(config.defaults);
    siteList.update(config);
    showInvalidSites(config.invalidSites);
  } catch (error) {
    console.error('[steer-clear] settings render failed', { error: error.message });
    configError.hidden = false;
    configError.textContent = `Could not load settings: ${error.message}`;
  }
}

/** Open the Advanced section and focus the field a link pointed at. */
function revealLinkedField() {
  const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
  if (!target) return;
  const details = target.closest('details');
  if (details) details.open = true;
  target.scrollIntoView({ block: 'center' });
  target.focus();
}

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === StorageArea.SYNC) render();
});
chrome.permissions.onAdded.addListener(() => siteList.refreshPermissions());
chrome.permissions.onRemoved.addListener(() => siteList.refreshPermissions());

render().then(revealLinkedField);
