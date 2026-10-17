/**
 * Load the unpacked extension in Playwright's Chromium and seed its storage.
 *
 * Shared by tools/screenshots.mjs and tools/mobile_audit.mjs, so both drive
 * the real extension pages with real code; only the stored data is staged.
 *
 * Needs Playwright (local or global install) and its Chromium build:
 * `npm i -g playwright@<pinned>` and `npx playwright install chromium`. The
 * pinned version is recorded in knowledge/usage_guides/DEVOPS_GUIDE.md.
 */

import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SRC_DIR_NAME } from './tool_constants.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTENSION_DIR = path.join(ROOT, SRC_DIR_NAME);

/**
 * Resolve Playwright from the repository or the global npm root.
 *
 * @returns {object} The playwright module.
 */
export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  const searchPaths = [ROOT];
  try {
    searchPaths.push(execSync('npm root -g', { encoding: 'utf8' }).trim());
  } catch {
    // No global npm; the local lookup is all we have.
  }
  try {
    return require(require.resolve('playwright', { paths: searchPaths }));
  } catch {
    throw new Error(
      'Playwright not found. Install it with `npm i -g playwright` ' +
        'and `npx playwright install chromium`.'
    );
  }
}

/**
 * Launch Chromium with only this extension loaded, in a throwaway profile.
 *
 * @param {object} contextOptions Playwright persistent-context options
 *   (viewport, deviceScaleFactor, hasTouch, isMobile, ...).
 * @returns {Promise<{context: object, base: string, close: () => Promise<void>}>}
 *   `base` is the extension origin, `chrome-extension://<id>`.
 */
export async function launchExtension(contextOptions) {
  const { chromium } = loadPlaywright();
  const profileDir = mkdtempSync(path.join(tmpdir(), 'steer-clear-harness-'));

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chromium', // new headless mode, which supports extensions
    ...contextOptions,
    args: [
      `--disable-extensions-except=${EXTENSION_DIR}`,
      `--load-extension=${EXTENSION_DIR}`,
    ],
  });

  const close = async () => {
    await context.close();
    rmSync(profileDir, { recursive: true, force: true });
  };

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    const base = `chrome-extension://${new URL(worker.url()).host}`;

    // The options page opens itself on install; close it so it can't race the seed.
    for (const page of context.pages()) await page.close();

    return { context, base, close };
  } catch (error) {
    await close();
    throw error;
  }
}

/**
 * Replace the extension's stored config and statistics with demo data.
 *
 * Seeds through the extension's own modules so the stored shape is exactly
 * what the shipped code writes.
 *
 * @param {object} page A page already on an extension URL.
 * @param {{targetName: string, note: string,
 *   sites: Array<{pattern: string, fields?: object}>,
 *   events: Array<{host: string, at: number}>}} demo
 *   `fields` are written onto the created site (e.g. autoContinue).
 */
export async function seedDemoData(page, demo) {
  await page.evaluate(async ({ targetName, note, sites, events }) => {
    const { defaultConfig, createSite } = await import('/background/config.js');
    const { emptyStats, recordInterception } = await import('/background/stats.js');

    const config = defaultConfig();
    config.globalTargetName = targetName;
    config.globalNote = note;
    config.sites = sites.map(({ pattern, fields = {} }) => ({ ...createSite(pattern), ...fields }));

    let stats = emptyStats();
    for (const { host, at } of events) stats = recordInterception(stats, host, at);

    await chrome.storage.local.clear();
    await chrome.storage.sync.clear();
    await chrome.storage.sync.set({ config });
    await chrome.storage.local.set({ stats });
  }, demo);
}
