/**
 * The settings page's "Your data" panel: export the settings to a file, and
 * import a file to replace them.
 *
 * Export needs no `downloads` permission: the file is a Blob saved through a
 * temporary `<a download>`. Import reads the file in the page, shows the
 * counts before and after, and only on "Replace" sends IMPORT_SETTINGS; the
 * worker validates the config again before writing. Imported sites then need
 * host access, which "Grant all" asks for in one prompt.
 */

import {
  EXPORT_JSON_INDENT,
  EXPORT_MIME_TYPE,
  EXPORT_URL_REVOKE_DELAY_MS,
  MAX_IMPORT_BYTES,
  MessageType,
} from '../constants.js';
import { readConfig } from '../background/config.js';
import { originPatternsFor } from '../background/permissions.js';
import { buildExport, exportFileName, importedHosts, parseImport } from '../background/settings_io.js';
import { sendMessage } from '../shared/messaging.js';
import { accessText, duplicatesText, exportedText, importedText, replaceSummary } from './data_text.js';

/**
 * @param {{exportButton: HTMLElement, importButton: HTMLElement,
 *   fileInput: HTMLInputElement, preview: HTMLElement, summary: HTMLElement,
 *   duplicates: HTMLElement, confirm: HTMLElement, cancel: HTMLElement,
 *   access: HTMLElement, accessText: HTMLElement, grant: HTMLElement,
 *   setStatus: (message: string, isError?: boolean) => void}} dom
 * @returns {void}
 */
export function createDataPanel(dom) {
  /** The parsed file awaiting confirmation. */
  let pending = null;
  /** Origins "Grant all" asks for, computed before the click. */
  let pendingOrigins = [];

  function resetPreview() {
    pending = null;
    dom.preview.hidden = true;
    dom.fileInput.value = '';
  }

  async function exportSettings() {
    try {
      const now = Date.now();
      const config = await readConfig();
      const envelope = buildExport(config, chrome.runtime.getManifest().version, now);
      const blob = new Blob([JSON.stringify(envelope, null, EXPORT_JSON_INDENT)], { type: EXPORT_MIME_TYPE });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(now);
      // Firefox starts the download after click() returns and may ignore a
      // detached link, so the link is attached for the click and the URL is
      // revoked only once the download has had time to start.
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), EXPORT_URL_REVOKE_DELAY_MS);
      console.info('[steer-clear] settings exported', { siteCount: config.sites.length, file: link.download });
      dom.setStatus(exportedText(config.sites.length));
    } catch (error) {
      console.error('[steer-clear] export failed', { error: error.message });
      dom.setStatus(`Could not export: ${error.message}`, true);
    }
  }

  async function previewFile() {
    const file = dom.fileInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) {
        throw new Error(`file: ${file.size} bytes, over the ${MAX_IMPORT_BYTES}-byte limit for a settings file`);
      }
      const parsed = parseImport(await file.text());
      const current = await readConfig();
      pending = parsed;
      dom.summary.textContent = replaceSummary(current.sites.length, parsed.config.sites.length);
      dom.duplicates.textContent = duplicatesText(parsed.duplicates);
      dom.duplicates.hidden = parsed.duplicates.length === 0;
      dom.preview.hidden = false;
      dom.access.hidden = true;
      dom.confirm.focus();
      console.info('[steer-clear] import previewed', {
        file: file.name,
        currentCount: current.sites.length,
        importCount: parsed.config.sites.length,
        duplicates: parsed.duplicates,
      });
    } catch (error) {
      console.error('[steer-clear] import refused', { file: file.name, error: error.message });
      resetPreview();
      dom.setStatus(`Not imported, nothing changed: ${error.message}`, true);
    }
  }

  /**
   * Show "Grant all" for the imported sites this browser has no access to.
   *
   * @param {object} config The imported config.
   */
  async function offerAccess(config) {
    const missing = [];
    for (const host of importedHosts(config)) {
      const origins = originPatternsFor(host);
      if (!(await chrome.permissions.contains({ origins }))) missing.push(host);
    }
    pendingOrigins = missing.flatMap(originPatternsFor);
    dom.access.hidden = missing.length === 0;
    dom.accessText.textContent = missing.length ? accessText(missing.length) : '';
    console.info('[steer-clear] imported sites without access', { hosts: missing });
  }

  async function confirmImport() {
    if (!pending) return;
    const { config } = pending;
    try {
      const { siteCount } = await sendMessage({ type: MessageType.IMPORT_SETTINGS, config });
      resetPreview();
      dom.setStatus(importedText(siteCount));
      console.info('[steer-clear] settings imported', { siteCount });
      await offerAccess(config);
    } catch (error) {
      console.error('[steer-clear] import failed', { error: error.message });
      dom.setStatus(`Not imported, nothing changed: ${error.message}`, true);
    }
  }

  /**
   * The only call in this click handler: Firefox drops the user gesture at
   * the first await. The worker's permissions.onAdded rebuild activates the
   * sites; the site list refreshes on the same event.
   */
  function grantAll() {
    chrome.permissions.request({ origins: pendingOrigins }).then(
      (granted) => {
        console.info('[steer-clear] import access request', { granted, originCount: pendingOrigins.length });
        if (granted) dom.access.hidden = true;
      },
      (error) => {
        console.error('[steer-clear] import access request failed', { error: error.message });
        dom.setStatus(`Could not ask for access: ${error.message}`, true);
      }
    );
  }

  dom.exportButton.addEventListener('click', exportSettings);
  dom.importButton.addEventListener('click', () => dom.fileInput.click());
  dom.fileInput.addEventListener('change', previewFile);
  dom.confirm.addEventListener('click', confirmImport);
  dom.cancel.addEventListener('click', () => {
    resetPreview();
    console.info('[steer-clear] import cancelled');
  });
  dom.grant.addEventListener('click', grantAll);
}
