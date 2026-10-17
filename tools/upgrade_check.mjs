/**
 * Upgrade and rollback check: the published 1.0.0 against this tree, in a
 * real Chromium profile (plan G5-A manual checks M1-M4, automated).
 *
 *   node tools/upgrade_check.mjs [--capture tests/unit/fixtures/config_v2_real.json]
 *
 * One unpacked-extension directory is loaded and its contents swapped between
 * the `v1.0.0` git tag and `src/`, reloading the extension in place in
 * between, so the extension id and its storage carry over as they do across
 * a store update.
 *
 * - M1 1.0.0 writes three sites with notes and overrides through its own
 *   modules; after the upgrade every value reads back, the settings page
 *   lists them, and `storage.sync.config` stays byte-identical, also after
 *   editing a site and a default on this version.
 * - M4 one `site:*` item corrupted by hand: the others still read, the
 *   settings page reports it, and continue on its host still works.
 * - M3 rolling back to 1.0.0 finds its unchanged `config` and lists the sites.
 * - M2 (fresh profile) 40 sites from 1.0.0 upgrade, and a 41st can be added.
 *
 * `--capture <path>` also writes the config 1.0.0 stored (fixture
 * `config_v2_real.json`). Needs git with the `v1.0.0` tag, and Playwright
 * with its Chromium (see knowledge/usage_guides/DEVOPS_GUIDE.md).
 */

import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { loadPlaywright, ROOT } from './extension_harness.mjs';
import { SRC_DIR_NAME } from './tool_constants.mjs';

/** The released version every upgrade starts from. */
const RELEASED_TAG = 'v1.0.0';
const OPTIONS_PAGE = 'options/options.html';
const WORKER_WAIT_MS = 15000;
/** How often a reload is checked for, in ms. */
const RELOAD_POLL_MS = 250;

const CAPTURE_FLAG = '--capture';
/** Sites in the M2 profile: more than a single 1.x item holds with notes. */
const MANY_SITES = 40;

/**
 * Unpack the released tag's src/ into a staging directory.
 *
 * @param {string} stageDir
 * @returns {string} The staged src directory.
 */
function stageReleased(stageDir) {
  const archive = execFileSync('git', ['archive', RELEASED_TAG, SRC_DIR_NAME], { cwd: ROOT });
  mkdirSync(stageDir, { recursive: true });
  execFileSync('tar', ['-x', '-C', stageDir], { input: archive });
  return path.join(stageDir, SRC_DIR_NAME);
}

/**
 * Replace the loaded extension directory's contents.
 *
 * @param {string} extDir
 * @param {string} fromDir
 */
function installInto(extDir, fromDir) {
  rmSync(extDir, { recursive: true, force: true });
  cpSync(fromDir, extDir, { recursive: true });
}

/**
 * @param {boolean} ok
 * @param {string} message
 */
function check(ok, message) {
  if (!ok) throw new Error(`[upgrade-check] FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}

/**
 * Launch Chromium with the directory loaded.
 *
 * @param {string} profileDir
 * @param {string} extDir
 * @returns {Promise<object>} The browser context.
 */
async function launch(profileDir, extDir) {
  const { chromium } = loadPlaywright();
  return chromium.launchPersistentContext(profileDir, {
    channel: 'chromium',
    args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
  });
}

/**
 * First launch of a profile (1.0.0): wait for the worker to learn the
 * extension's origin, which stays the same across swaps (it derives from the
 * directory).
 *
 * @param {string} profileDir
 * @param {string} extDir
 * @returns {Promise<{context: object, base: string}>}
 */
async function firstLaunch(profileDir, extDir) {
  const context = await launch(profileDir, extDir);
  let [worker] = context.serviceWorkers();
  if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: WORKER_WAIT_MS });
  return { context, base: `chrome-extension://${new URL(worker.url()).host}` };
}

/**
 * Swap the directory's contents and reload the extension in place from
 * chrome://extensions, as its Reload button does. The extension keeps its id
 * and storage, as across a store update or rollback.
 *
 * (Restarting the browser on the same profile was tried and does not model
 * an update: the storage.sync writes made after install were lost across the
 * restart of a command-line-loaded extension.)
 *
 * @param {object} context
 * @param {{extDir: string, base: string}} where
 * @param {string} fromDir
 */
async function swapAndReload(context, { extDir, base }, fromDir) {
  for (const page of context.pages()) await page.close();
  installInto(extDir, fromDir);
  const expected = JSON.parse(readFileSync(path.join(fromDir, 'manifest.json'), 'utf8'));
  const id = new URL(base).host;

  const extensions = await context.newPage();
  await extensions.goto('chrome://extensions');
  // Without developer mode Chromium disables an unpacked extension on reload.
  await extensions.evaluate(() => chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true }));
  await extensions.evaluate((id) => chrome.developerPrivate.reload(id, { failQuietly: true }), id);
  await extensions.close();

  const deadline = Date.now() + WORKER_WAIT_MS;
  for (;;) {
    const probe = await context.newPage();
    const loaded = await probe
      .goto(`${base}/${OPTIONS_PAGE}`)
      .then(() => probe.evaluate(() => chrome.runtime.getManifest().permissions))
      .catch(() => null);
    await probe.close();
    if (JSON.stringify(loaded) === JSON.stringify(expected.permissions)) return;
    if (Date.now() > deadline) {
      throw new Error(`[upgrade-check] the swapped-in build did not load at ${base} (permissions seen: ${loaded})`);
    }
    await new Promise((resolve) => setTimeout(resolve, RELOAD_POLL_MS));
  }
}

/**
 * @param {object} context
 * @param {string} base
 * @returns {Promise<object>} A fresh settings page.
 */
async function openOptions(context, base) {
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    throw new Error(`[upgrade-check] page error on ${page.url()}: ${error.message}`);
  });
  await page.goto(`${base}/${OPTIONS_PAGE}`);
  return page;
}

/** In a 1.0.0 page: write the given sites through 1.0.0's own modules. */
async function writeReleasedConfig(page, { globals, sites }) {
  return page.evaluate(async ({ globals, sites }) => {
    const { createSite, readConfig, writeConfig } = await import('/background/config.js');
    // 1.0.0 writes its default config on install; writing before that lands
    // would lose this write to it.
    for (let tries = 0; !(await chrome.storage.sync.get('config')).config; tries += 1) {
      if (tries > 100) throw new Error('1.0.0 never wrote its install-time config');
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const config = { ...(await readConfig()), ...globals };
    config.sites = sites.map(({ pattern, fields = {}, extra = {} }) => ({ ...createSite(pattern, fields), ...extra }));
    await writeConfig(config);
    const stored = await chrome.storage.sync.get(null);
    return { configJson: JSON.stringify(stored.config), keys: Object.keys(stored) };
  }, { globals, sites });
}

/** In a page of this version: every sync item, plus the assembled config. */
async function readCurrent(page) {
  return page.evaluate(async () => {
    const { readConfig } = await import('/background/config.js');
    const items = await chrome.storage.sync.get(null);
    return { items, configJson: JSON.stringify(items.config), config: await readConfig() };
  });
}

/** Send a worker message from a page; reject on `ok: false`. */
async function send(page, message) {
  return page.evaluate(async (message) => {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error ?? 'no response');
    return response;
  }, message);
}

const M1_DATA = {
  globals: { globalNote: 'Finish the draft first', globalTargetName: 'Random article', globalAutoContinue: false },
  sites: [
    { pattern: 'reddit.com', fields: { note: 'You said one post. It is never one post.' } },
    {
      pattern: 'ynet.co.il',
      fields: { displayName: 'News', target: 'https://www.haaretz.co.il/', note: 'Read it at lunch' },
      extra: { autoContinue: true, countdownSeconds: 10 },
    },
    { pattern: 'x.com', fields: {}, extra: { includeSubdomains: false, enabled: false } },
  ],
};

/** M1, M4 and M3 in one profile. */
async function upgradeAndRollback(workDir, releasedDir, capturePath) {
  const extDir = path.join(workDir, 'ext-a');
  installInto(extDir, releasedDir);
  const profileDir = path.join(workDir, 'profile-a');
  const { context, base } = await firstLaunch(profileDir, extDir);
  const where = { profileDir, extDir, base };
  try {
    console.log('M1 upgrade from 1.0.0 keeps every value');
    let page = await openOptions(context, base);
    const released = await writeReleasedConfig(page, M1_DATA);
    check(released.keys.length === 1 && released.keys[0] === 'config', '1.0.0 stores one `config` item');
    if (capturePath) {
      writeFileSync(capturePath, `${JSON.stringify(JSON.parse(released.configJson), null, 2)}\n`);
      console.log(`  captured 1.0.0 config to ${capturePath}`);
    }

    await swapAndReload(context, where, path.join(ROOT, SRC_DIR_NAME));
    page = await openOptions(context, base);
    await page.waitForSelector('.site');
    let current = await readCurrent(page);
    check(current.configJson === released.configJson, '`config` is byte-identical after the upgrade');
    check(Object.keys(current.items).length === 1, 'the upgrade itself writes nothing');
    const { defaults, sites } = current.config;
    check(sites.length === 3, 'three sites read back');
    check(defaults.reasons[0] === M1_DATA.globals.globalNote, 'the global note reads as the default reason');
    check(defaults.targetName === 'Random article', 'the destination name reads back');
    const news = sites.find((site) => site.pattern === 'ynet.co.il');
    check(news.displayName === 'News' && news.overrides.target === 'https://www.haaretz.co.il/', 'per-site name and target');
    check(news.overrides.autoContinue === true && news.overrides.countdownSeconds === 10, 'per-site auto-continue');
    const x = sites.find((site) => site.pattern === 'x.com');
    check(x.enabled === false && x.includeSubdomains === false, 'disabled, exact-host site');
    check((await page.locator('.site').count()) === 3, 'settings lists three sites');

    await send(page, { type: 'UPDATE_SITE', siteId: news.id, setOverrides: { reasons: ['Edited on 2.0'] } });
    await send(page, { type: 'UPDATE_DEFAULTS', patch: { bypassMinutes: 15 } });
    current = await readCurrent(page);
    check(current.configJson === released.configJson, '`config` is byte-identical after editing on this version');
    check(current.items.schema === 3 && Object.keys(current.items).filter((k) => k.startsWith('site:')).length === 3,
      'the first edit materialized three site items and the schema marker');

    console.log('M4 one corrupt site item leaves the others working');
    const corruptKey = `site:${sites.find((site) => site.pattern === 'reddit.com').id}`;
    await page.evaluate((key) => chrome.storage.sync.set({ [key]: { id: 42, pattern: '' } }), corruptKey);
    page = await openOptions(context, base);
    await page.waitForSelector('.site');
    current = await readCurrent(page);
    check(current.config.sites.length === 2 && current.config.invalidSites.length === 1, 'two sites read; one is reported');
    check(await page.locator('#config-error').isVisible(), 'settings shows the error');
    check((await page.locator('#config-error').textContent()).includes(corruptKey), 'the error names the item');
    const view = await send(page, { type: 'GET_RESOLVED_SITE', fromUrl: 'https://www.reddit.com/' });
    check(view.host === 'www.reddit.com', 'its pause page still resolves');
    const pass = await send(page, { type: 'GRANT_BYPASS', host: 'www.reddit.com' });
    check(Number.isFinite(pass.expiresAt), 'continue on its host still works');
    await page.click('#config-error button');
    await page.waitForSelector('#config-error', { state: 'hidden' });
    current = await readCurrent(page);
    check(!(corruptKey in current.items) && current.config.sites.length === 2, '"Remove damaged item" clears only that item');

    console.log('M3 rollback to 1.0.0');
    await swapAndReload(context, where, releasedDir);
    page = await openOptions(context, base);
    await page.waitForSelector('.site');
    const rolledBack = await page.evaluate(async () => {
      const { readConfig } = await import('/background/config.js');
      const config = await readConfig();
      return { sites: config.sites.length, configJson: JSON.stringify((await chrome.storage.sync.get('config')).config) };
    });
    check(rolledBack.configJson === released.configJson, '1.0.0 finds its `config` unchanged');
    check(rolledBack.sites === 3 && (await page.locator('.site').count()) === 3, '1.0.0 lists its three sites');
  } finally {
    await context.close();
  }
}

/** M2 in a fresh profile. */
async function manySites(workDir, releasedDir) {
  console.log(`M2 ${MANY_SITES} sites from 1.0.0, then a ${MANY_SITES + 1}st`);
  const extDir = path.join(workDir, 'ext-b');
  installInto(extDir, releasedDir);
  const profileDir = path.join(workDir, 'profile-b');
  const { context, base } = await firstLaunch(profileDir, extDir);
  const where = { profileDir, extDir, base };
  try {
    let page = await openOptions(context, base);
    const sites = Array.from({ length: MANY_SITES }, (_, i) => ({ pattern: `s${String(i).padStart(2, '0')}.com` }));
    const released = await writeReleasedConfig(page, { globals: {}, sites });
    check(released.keys.includes('config'), `1.0.0 stored ${MANY_SITES} sites`);

    await swapAndReload(context, where, path.join(ROOT, SRC_DIR_NAME));
    page = await openOptions(context, base);
    const { added } = await send(page, { type: 'ADD_SITES', entries: [{ host: 'site-forty-one.com', reason: 'one more' }] });
    check(added.length === 1, 'the 41st site is added');
    const current = await readCurrent(page);
    check(current.config.sites.length === MANY_SITES + 1, `${MANY_SITES + 1} sites read back`);
    check(current.configJson === released.configJson, '`config` is byte-identical');
  } finally {
    await context.close();
  }
}

async function main() {
  const captureIndex = process.argv.indexOf(CAPTURE_FLAG);
  const capturePath = captureIndex === -1 ? null : path.resolve(process.argv[captureIndex + 1] ?? '');
  if (captureIndex !== -1 && !process.argv[captureIndex + 1]) {
    throw new Error(`[upgrade-check] ${CAPTURE_FLAG} needs a file path`);
  }
  const workDir = mkdtempSync(path.join(tmpdir(), 'steer-clear-upgrade-'));
  try {
    const releasedDir = stageReleased(path.join(workDir, 'released'));
    await upgradeAndRollback(workDir, releasedDir, capturePath);
    await manySites(workDir, releasedDir);
    console.log('[upgrade-check] all checks passed');
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
