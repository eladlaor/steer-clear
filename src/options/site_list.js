/**
 * The site list on the settings page: the add form, one row per site, and
 * each row's "needs access" banner and per-site settings.
 *
 * Every change is a worker message; rows re-render from storage. Rows are
 * keyed by site id and updated in place, so a change arriving from another
 * tab or device never steals focus or collapses an open row.
 */

import { MessageType, SETTINGS_SAVE_DELAY_MS, SettingsFormMode } from '../constants.js';
import { sendMessage } from '../shared/messaging.js';
import { addSitesThenRequestAccess } from '../shared/site_access.js';
import { normalizePattern } from '../background/rules.js';
import {
  hasHostPermission,
  requestHostPermission,
  revokeHostPermission,
} from '../background/permissions.js';
import { createSettingsForm } from './settings_form.js';

/**
 * @param {{list: HTMLElement, empty: HTMLElement, template: HTMLTemplateElement,
 *   addForm: HTMLFormElement, addPattern: HTMLInputElement, addReason: HTMLInputElement,
 *   setStatus: (message: string, isError?: boolean) => void}} dom
 * @returns {{update: (config: object) => void, refreshPermissions: () => void}}
 */
export function createSiteList(dom) {
  const rows = new Map();
  let current = null;

  const send = async (message, done) => {
    try {
      await sendMessage(message);
      if (done) dom.setStatus(done);
    } catch (error) {
      console.error('[steer-clear] settings change failed', { type: message.type, error: error.message });
      dom.setStatus(`Could not save: ${error.message}`, true);
    }
  };

  /**
   * Add a site. The worker message leaves first, then the permission prompt
   * opens in the same tick (site_access.js): Firefox drops the user gesture
   * at the first await. A refused prompt leaves a visible "needs access" row.
   */
  dom.addForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const raw = dom.addPattern.value;
    let host;
    try {
      host = normalizePattern(raw);
    } catch (error) {
      console.warn('[steer-clear] add rejected an invalid domain', { raw, error: error.message });
      dom.setStatus(`"${raw}" doesn't look like a domain`, true);
      return;
    }
    if (current.sites.some((site) => safeHost(site) === host)) {
      dom.setStatus(`${host} is already on the list`, true);
      return;
    }
    addSitesThenRequestAccess([{ host, reason: dom.addReason.value }])
      .then((granted) => {
        dom.setStatus(granted ? `${host} added` : `Added ${host}, but it needs access before it can work`, !granted);
      })
      .catch((error) => dom.setStatus(`Could not ask for access: ${error.message}`, true));
    dom.addForm.reset();
  });

  /**
   * Build the row for one site.
   *
   * @param {object} site
   * @returns {object} The row controller.
   */
  function buildRow(site) {
    const fragment = dom.template.content.cloneNode(true);
    const q = (selector) => fragment.querySelector(selector);
    const row = {
      element: q('.site'),
      enabled: q('.site-enabled'),
      name: q('.site-name'),
      pattern: q('.site-pattern'),
      expand: q('.site-expand'),
      detail: q('.site-detail'),
      warning: q('.site-warning'),
      displayName: q('.site-display-name'),
      subdomains: q('.site-subdomains'),
      site,
    };
    const siteId = site.id;
    row.displayName.id = `site-${siteId}-name`;
    q('.site-display-name-label').htmlFor = row.displayName.id;
    row.detail.id = `site-${siteId}-detail`;
    row.expand.setAttribute('aria-controls', row.detail.id);
    row.expand.setAttribute('aria-expanded', 'false');
    row.remove = q('.site-remove');
    row.grant = q('.site-grant');

    row.form = createSettingsForm(q('.site-settings'), {
      mode: SettingsFormMode.SITE,
      idPrefix: `site-${siteId}`,
      onPatch: (patch) => send({ type: MessageType.UPDATE_SITE, siteId, setOverrides: patch }, 'Saved'),
      onClear: (key) => send({ type: MessageType.UPDATE_SITE, siteId, clearOverrides: [key] }, 'Using the default'),
      onError: (message) => dom.setStatus(message, true),
    });

    row.enabled.addEventListener('change', () =>
      send({ type: MessageType.UPDATE_SITE, siteId, fields: { enabled: row.enabled.checked } }, 'Saved'));
    row.subdomains.addEventListener('change', () =>
      send({ type: MessageType.UPDATE_SITE, siteId, fields: { includeSubdomains: row.subdomains.checked } }, 'Saved'));
    let nameTimer = null;
    row.displayName.addEventListener('input', () => {
      window.clearTimeout(nameTimer);
      nameTimer = window.setTimeout(() => {
        const displayName = row.displayName.value.trim() || null;
        send({ type: MessageType.UPDATE_SITE, siteId, fields: { displayName } }, 'Saved');
      }, SETTINGS_SAVE_DELAY_MS);
    });
    row.expand.addEventListener('click', () => {
      row.detail.hidden = !row.detail.hidden;
      row.expand.textContent = row.detail.hidden ? 'Customize' : 'Done';
      row.expand.setAttribute('aria-expanded', String(!row.detail.hidden));
    });
    q('.site-remove').addEventListener('click', async () => {
      await send({ type: MessageType.REMOVE_SITE, siteId }, 'Removed');
      // Keeping access to a site the user removed would be a quiet over-reach.
      const host = safeHost(row.site);
      if (host) await revokeHostPermission(host);
    });
    q('.site-grant').addEventListener('click', () => handleGrant(row));

    return row;
  }

  /** Request access for a row's site; the worker rebuilds on the grant. */
  async function handleGrant(row) {
    const host = safeHost(row.site);
    try {
      const granted = await requestHostPermission(host);
      if (!granted) {
        dom.setStatus(`Steer Clear can't work on ${host} without access`, true);
        return;
      }
      row.warning.hidden = true;
      await sendMessage({ type: MessageType.REBUILD_RULES });
      dom.setStatus(`${host} is active`);
    } catch (error) {
      console.error('[steer-clear] handleGrant failed', { host, error: error.message });
      dom.setStatus(`Could not get access: ${error.message}`, true);
    }
  }

  /** Show or hide a row's "needs access" banner to match reality. */
  async function refreshPermission(row) {
    const host = safeHost(row.site);
    try {
      row.warning.hidden = host !== null && (await hasHostPermission(host));
    } catch (error) {
      console.error('[steer-clear] refreshPermission failed', { pattern: row.site.pattern, error: error.message });
      row.warning.hidden = false;
    }
  }

  /** Write a site's stored values into its row, sparing the focused input. */
  function fillRow(row, site, defaults) {
    row.site = site;
    const label = site.displayName?.trim();
    row.name.textContent = label || site.pattern;
    row.pattern.textContent = label ? site.pattern : '';
    // Every row has the same buttons; their names say which site they act on.
    const name = label || site.pattern;
    row.enabled.setAttribute('aria-label', `Pause ${name}`);
    row.expand.setAttribute('aria-label', `Customize ${name}`);
    row.remove.setAttribute('aria-label', `Remove ${name}`);
    row.grant.setAttribute('aria-label', `Grant access to ${name}`);
    row.enabled.checked = site.enabled;
    row.subdomains.checked = site.includeSubdomains;
    row.element.classList.toggle('disabled', !site.enabled);
    if (document.activeElement !== row.displayName) row.displayName.value = site.displayName ?? '';
    row.form.update(defaults, site);
  }

  return {
    update(config) {
      current = config;
      const ids = new Set(config.sites.map((site) => site.id));
      for (const [id, row] of rows) {
        if (!ids.has(id)) {
          row.element.remove();
          rows.delete(id);
        }
      }
      // Walk the list in display order, inserting only rows that are out of
      // place: moving a node would blur an input the user is typing in.
      let cursor = dom.list.firstElementChild;
      for (const site of config.sites) {
        let row = rows.get(site.id);
        if (!row) {
          row = buildRow(site);
          rows.set(site.id, row);
          refreshPermission(row);
        }
        fillRow(row, site, config.defaults);
        if (row.element === cursor) {
          cursor = cursor.nextElementSibling;
        } else {
          dom.list.insertBefore(row.element, cursor);
        }
      }
      dom.empty.hidden = config.sites.length > 0;
    },
    refreshPermissions() {
      for (const row of rows.values()) refreshPermission(row);
    },
  };
}

/**
 * @param {object} site
 * @returns {string|null} The site's host, or null for a malformed legacy pattern.
 */
function safeHost(site) {
  try {
    return normalizePattern(site.pattern);
  } catch {
    return null;
  }
}
