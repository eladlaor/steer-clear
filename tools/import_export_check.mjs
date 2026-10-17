/**
 * Export and import through the real settings page, in Chromium (plan G5-B
 * manual check M2, automated, plus the export half of M1).
 *
 *   node tools/import_export_check.mjs
 *
 * - "Export settings" downloads `steer-clear-settings-YYYY-MM-DD.json` holding
 *   the current sites and defaults, and no statistics.
 * - A copy edited to an invalid `bypassMinutes` is refused with a message
 *   naming `defaults.bypassMinutes`, and storage is unchanged.
 * - A valid file with one site fewer replaces the settings after "Replace".
 *
 * The Firefox half of M1 (import there, one "Grant all" prompt) stays manual:
 * Playwright cannot load a Firefox extension. Needs Playwright and its
 * Chromium (see knowledge/usage_guides/DEVOPS_GUIDE.md).
 */

import { readFileSync } from 'node:fs';

import { launchExtension, seedDemoData } from './extension_harness.mjs';

const OPTIONS_PAGE = 'options/options.html';
const EXPORT_FILE_PATTERN = /^steer-clear-settings-\d{4}-\d{2}-\d{2}\.json$/;
const INVALID_BYPASS_MINUTES = 7;
const DEMO = {
  defaults: { reasons: ['Finish the draft first'] },
  sites: [
    { pattern: 'reddit.com', overrides: { reasons: ['One post is never one post'] } },
    { pattern: 'ynet.co.il', fields: { displayName: 'News' } },
    { pattern: 'x.com' },
  ],
  events: [{ host: 'reddit.com', at: Date.now() - 60000, outcome: 'steered' }],
};

/**
 * @param {boolean} ok
 * @param {string} message
 */
function check(ok, message) {
  if (!ok) throw new Error(`[import-export-check] FAILED: ${message}`);
  console.log(`  ok  ${message}`);
}

/** Every sync item, as the page sees it. */
const syncItems = (page) => page.evaluate(() => chrome.storage.sync.get(null));

/**
 * Choose a file in the import input and wait for the preview or a refusal.
 *
 * @param {object} page
 * @param {string} text
 */
async function chooseFile(page, text) {
  await page.setInputFiles('#import-file', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForFunction(() => {
    const status = document.getElementById('status');
    return !document.getElementById('import-preview').hidden || status.classList.contains('is-error');
  });
}

async function main() {
  const { context, base, close } = await launchExtension({});
  try {
    const page = await context.newPage();
    page.on('pageerror', (error) => {
      throw new Error(`[import-export-check] page error: ${error.message}`);
    });
    await page.goto(`${base}/${OPTIONS_PAGE}`);
    await seedDemoData(page, DEMO);
    await page.reload();
    await page.waitForSelector('.site');

    console.log('Export');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export-settings')]);
    check(EXPORT_FILE_PATTERN.test(download.suggestedFilename()), `file is named ${download.suggestedFilename()}`);
    const exported = readFileSync(await download.path(), 'utf8');
    const envelope = JSON.parse(exported);
    check(envelope.config.sites.length === DEMO.sites.length, 'it holds every site');
    check(!/"(stats|lifecycle|bypasses)"/.test(exported), 'it holds no statistics, lifecycle or bypasses');

    console.log('M2 an invalid file is refused, naming the field');
    const before = await syncItems(page);
    const invalid = structuredClone(envelope);
    invalid.config.defaults.bypassMinutes = INVALID_BYPASS_MINUTES;
    await chooseFile(page, JSON.stringify(invalid));
    const refusal = await page.locator('#status').textContent();
    check(refusal.includes('defaults.bypassMinutes'), `the message names defaults.bypassMinutes ("${refusal}")`);
    check(await page.locator('#import-preview').isHidden(), 'no replace button is offered');
    check(JSON.stringify(await syncItems(page)) === JSON.stringify(before), 'storage is unchanged');

    console.log('A valid file replaces the settings after confirmation');
    const fewer = structuredClone(envelope);
    fewer.config.sites = fewer.config.sites.slice(0, 2);
    await chooseFile(page, JSON.stringify(fewer));
    const summary = await page.locator('#import-summary').textContent();
    check(summary === 'Replace 3 sites with 2 sites?', `the preview states both counts ("${summary}")`);
    check(JSON.stringify(await syncItems(page)) === JSON.stringify(before), 'nothing is written before "Replace"');
    await page.click('#import-confirm');
    await page.waitForFunction(() => document.querySelectorAll('.site').length === 2);
    const after = await syncItems(page);
    check(Object.keys(after).filter((key) => key.startsWith('site:')).length === 2, 'two site items remain');
    check(after.settings.defaults.reasons[0] === DEMO.defaults.reasons[0], 'the defaults came from the file');
    console.log('[import-export-check] all checks passed');
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
