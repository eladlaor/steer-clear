#!/usr/bin/env node
/**
 * Phone-width audit of every extension page.
 *
 * Loads src/ unpacked in Playwright's Chromium, emulating a touch phone at
 * MOBILE_VIEWPORT (360x740), audits onboarding as a new user sees it, seeds
 * demo data, opens each page (pause, settings, stats, popup, onboarding) in
 * each state worth checking, and fails when:
 *
 *   - the page is wider than the phone (documentElement.scrollWidth >
 *     MOBILE_VIEWPORT.width). Measured against the device width, not
 *     innerWidth: a mobile browser zooms out to fit an over-wide page, which
 *     grows innerWidth to match and would hide the overflow;
 *   - a visible interactive element is smaller than MIN_TOUCH_TARGET_PX
 *     (44x44 CSS px). A checkbox or radio is measured by its label, which is
 *     what a finger hits. Exempt: links displayed inline inside running text
 *     (WCAG 2.5.8's inline exception);
 *   - the page throws an uncaught error, or shows no interactive element at
 *     all (a blank page would otherwise pass).
 *
 * Firefox for Android is covered by the manual check G1 M4: Playwright cannot
 * load a Firefox extension.
 *
 * Usage:  node tools/mobile_audit.mjs
 * Needs:  Playwright and its Chromium build (see tools/extension_harness.mjs).
 */

import { launchExtension, seedDemoData } from './extension_harness.mjs';
import { MIN_TOUCH_TARGET_PX, MOBILE_VIEWPORT } from './tool_constants.mjs';

/** Sub-pixel layout can land a 44px box at 43.99; that is not a failure. */
const SIZE_TOLERANCE_PX = 0.5;

/** Settle time after load for the pages' async renders. */
const SETTLE_MS = 400;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Demo data that exercises the layouts: a reason, an auto-continue site (so
 * the countdown and its Stop button render), and a long hostname that must
 * wrap rather than push the page sideways.
 */
const LONG_HOST = 'a-very-long-subdomain-name.example-with-a-long-domain.co.uk';
const LIMIT_HOST = 'limit.example.net';
const DEMO = {
  defaults: {
    targetName: 'Wikipedia',
    reasons: ['I said I would write today, not read the news. This reason is long enough to wrap on a phone.'],
    // With one continue of LIMIT_HOST seeded today, its pause shows the over-limit line.
    dailyContinueLimit: 1,
  },
  sites: [
    { pattern: 'example.com' },
    { pattern: 'news.example.org', fields: { displayName: 'The news' }, overrides: { autoContinue: true, countdownSeconds: 60 } },
    { pattern: LONG_HOST },
    { pattern: 'breathe.example.net', overrides: { pauseStyle: 'breathing' } },
    { pattern: 'intent.example.net', overrides: { pauseStyle: 'intention', reasons: ['x'.repeat(280)] } },
    { pattern: LIMIT_HOST, overrides: { schedule: { days: [1, 2, 3, 4, 5], ranges: [{ start: 0, end: 1440 }, { start: 1320, end: 120 }] } } },
  ],
};

/** Outcomes cycled through the demo events, so every progress figure has data. */
const DEMO_OUTCOMES = [undefined, 'steered', 'continued'];

/**
 * A deterministic spread of interceptions over the last 30 days, plus one
 * continue of LIMIT_HOST a moment ago.
 *
 * @param {number} now
 * @returns {Array<{host: string, at: number, outcome?: string}>}
 */
function demoEvents(now) {
  const hosts = ['example.com', 'news.example.org', LONG_HOST];
  const spread = Array.from({ length: 60 }, (_, i) => ({
    host: hosts[i % hosts.length],
    at: now - (i % 30) * DAY_MS - (i % 24) * 60 * 60 * 1000,
    outcome: DEMO_OUTCOMES[i % DEMO_OUTCOMES.length],
  }));
  return [...spread, { host: LIMIT_HOST, at: now - 1000, outcome: 'continued' }];
}

/**
 * Count one more interception of a host, so its next pause page shows the
 * next presentation variant. Repeat visits within a minute count as one
 * view, so the audit advances the count itself.
 *
 * @param {string} base The extension origin.
 * @param {string} host
 * @returns {(page: object) => Promise<void>}
 */
function advanceVariant(base, host) {
  return async (page) => {
    // Not the stats page: opening it would count as a rating-banner showing.
    await page.goto(`${base}/options/options.html`);
    await page.evaluate(async (key) => {
      const { stats } = await chrome.storage.local.get('stats');
      stats.totals[key] = (stats.totals[key] ?? 0) + 1;
      await chrome.storage.local.set({ stats });
    }, host);
  };
}

/**
 * Every page state to audit. `prepare` runs after load, before measuring.
 *
 * @param {string} base The extension origin.
 */
function auditStates(base) {
  const from = (url) => `${base}/blocked/blocked.html?from=${url}`;
  return [
    { name: 'reminder', url: from(encodeURIComponent('https://www.example.com/a?x=1&y=2#frag')) },
    { name: 'reminder (unencoded source)', url: from('https://www.example.com/a?x=1&y=2#frag') },
    { name: 'reminder (auto-continue countdown)', url: from(encodeURIComponent('https://news.example.org/')) },
    { name: 'reminder (long host)', url: from(encodeURIComponent(`https://${LONG_HOST}/`)) },
    // Advancing the count between visits covers the layouts.
    { name: 'reminder (breathing)', url: from(encodeURIComponent('https://breathe.example.net/')) },
    {
      name: 'reminder (breathing, next variant)',
      before: advanceVariant(base, 'breathe.example.net'),
      url: from(encodeURIComponent('https://breathe.example.net/')),
    },
    { name: 'reminder (intention, longest reason)', url: from(encodeURIComponent('https://intent.example.net/')) },
    {
      name: 'reminder (intention, next variant)',
      before: advanceVariant(base, 'intent.example.net'),
      url: from(encodeURIComponent('https://intent.example.net/')),
    },
    {
      name: 'reminder (intention, third variant)',
      before: advanceVariant(base, 'intent.example.net'),
      url: from(encodeURIComponent('https://intent.example.net/')),
    },
    { name: 'reminder (over the daily limit)', url: from(encodeURIComponent(`https://${LIMIT_HOST}/`)) },
    { name: 'reminder (opened directly)', url: `${base}/blocked/blocked.html` },
    {
      name: 'settings (every site expanded)',
      url: `${base}/options/options.html`,
      prepare: async (page) => {
        for (const button of await page.locator('.site-expand').all()) await button.click();
        for (const summary of await page.locator('details > summary').all()) await summary.click();
      },
    },
    {
      name: 'settings (import preview, with duplicates)',
      url: `${base}/options/options.html`,
      prepare: chooseImportFile,
      expect: '#import-duplicates',
    },
    {
      name: 'settings (imported; sites need access)',
      init: () => {
        chrome.permissions.contains = async () => false;
      },
      url: `${base}/options/options.html`,
      prepare: async (page) => {
        await chooseImportFile(page);
        await page.click('#import-confirm');
      },
      expect: '#import-grant',
    },
    { name: 'stats (with the rating banner)', url: `${base}/stats/stats.html`, expect: '.rating' },
    { name: 'onboarding (sites synced from another device)', url: `${base}/onboarding/onboarding.html`, expect: '#synced' },
    { name: 'popup (on its own tab: no quick-add)', url: `${base}/popup/popup.html`, expect: '.rating' },
    {
      name: 'popup (quick-add for the active tab)',
      init: () => {
        chrome.tabs.query = async () => [{ id: 1, url: 'https://www.a-very-long-subdomain-name.example-with-a-long-domain.org/' }];
      },
      url: `${base}/popup/popup.html`,
      expect: '#quick-add-button',
    },
    {
      name: 'popup (snoozed)',
      expect: '#resume',
      before: async (page) => {
        await page.goto(`${base}/popup/popup.html`);
        await page.evaluate(() => chrome.runtime.sendMessage({ type: 'SET_SNOOZE', minutes: 15 }));
      },
      url: `${base}/popup/popup.html`,
    },
    {
      name: 'settings (a damaged site item)',
      before: async (page) => {
        await page.goto(`${base}/options/options.html`);
        await page.evaluate(() => chrome.storage.sync.set({ 'site:damaged-by-hand': { id: 42, pattern: '' } }));
      },
      url: `${base}/options/options.html`,
      expect: '#config-error button',
    },
  ];
}

/**
 * Onboarding as a new user sees it, audited before any data is seeded.
 *
 * @param {string} base The extension origin.
 */
function freshStates(base) {
  const url = `${base}/onboarding/onboarding.html`;
  const pick = async (page) => {
    for (const host of ['reddit.com', 'youtube.com', 'temu.com']) {
      await page.locator(`.chip[data-host="${host}"]`).click();
    }
    await page.fill('#domain-input', LONG_HOST);
    await page.click('#add-domain button[type="submit"]');
  };
  return [
    { name: 'onboarding (nothing picked)', url },
    { name: 'onboarding (sites picked, one typed)', url, prepare: pick, expect: '.picked-item' },
    {
      name: 'onboarding (turned on)',
      // The browser's own permission prompt cannot be clicked by automation.
      init: () => {
        chrome.permissions.request = async () => true;
      },
      url,
      prepare: async (page) => {
        await pick(page);
        await page.click('#turn-on');
      },
      expect: '#try-it',
    },
  ];
}

/**
 * Measure the current page. Runs in the browser.
 *
 * @param {{deviceWidth: number, minTarget: number, tolerance: number}} limits
 * @returns {{problems: string[], checked: number}}
 */
function measurePage({ deviceWidth, minTarget, tolerance }) {
  const problems = [];

  const describe = (el) => {
    const id = el.id ? `#${el.id}` : '';
    const classes = [...el.classList].map((c) => `.${c}`).join('');
    const text = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `<${el.tagName.toLowerCase()}${id}${classes}>${text ? ` "${text}"` : ''}`;
  };

  const scrollWidth = document.documentElement.scrollWidth;
  if (scrollWidth > deviceWidth) {
    const culprits = [...document.body.querySelectorAll('*')]
      .filter((el) => el.getBoundingClientRect().right > deviceWidth + tolerance)
      .slice(0, 5)
      .map(describe);
    problems.push(`wider than the phone: scrollWidth ${scrollWidth} > ${deviceWidth}; overflowing: ${culprits.join(', ')}`);
  }

  // A link inside a sentence is exempt; a standalone link is a target.
  const isInlineTextLink = (el) => {
    if (el.tagName !== 'A' || getComputedStyle(el).display !== 'inline') return false;
    const own = (el.textContent || '').trim().length;
    const surrounding = (el.parentElement?.textContent || '').trim().length;
    return surrounding > own;
  };

  // What a finger hits: the label for a checkbox or radio, the element otherwise.
  const tapTarget = (el) =>
    el.matches('input[type="checkbox"], input[type="radio"]') && el.labels?.length ? el.labels[0] : el;

  const interactive = document.querySelectorAll(
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])'
  );

  let checked = 0;
  for (const el of interactive) {
    if (!el.checkVisibility({ checkVisibilityCSS: true })) continue;
    if (isInlineTextLink(el)) continue;
    checked += 1;

    const rect = tapTarget(el).getBoundingClientRect();
    if (rect.width + tolerance < minTarget || rect.height + tolerance < minTarget) {
      problems.push(`target too small: ${describe(el)} is ${rect.width.toFixed(1)}x${rect.height.toFixed(1)}px`);
    }
  }

  if (checked === 0) {
    problems.push('no visible interactive element: the page did not render');
  }

  return { problems, checked };
}

/**
 * Pick an import file on the settings page: the current settings exported,
 * plus a second entry for the first site so the duplicate note shows too.
 *
 * @param {object} page The settings page.
 */
async function chooseImportFile(page) {
  const text = await page.evaluate(async () => {
    const { readConfig } = await import('/background/config.js');
    const { buildExport } = await import('/background/settings_io.js');
    const config = await readConfig();
    config.sites.push({ ...config.sites[0], id: 'duplicate-entry', order: config.sites.length });
    return JSON.stringify(buildExport(config, chrome.runtime.getManifest().version, Date.now()));
  });
  await page.setInputFiles('#import-file', { name: 'settings.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await page.waitForSelector('#import-preview:not([hidden])');
}

/**
 * Audit one page state.
 *
 * @param {object} context
 * @param {{name: string, url: string, init?: Function, before?: Function, prepare?: Function,
 *   expect?: string}} state
 *   `init` runs in the page before its own scripts (to stand in for what
 *   automation cannot do, such as a permission prompt); `before` stages data
 *   before the page loads; `prepare` runs after. `expect` is a selector that
 *   must be visible, so a state that did not render is not audited as passing.
 * @returns {Promise<string[]>} Problems found.
 */
async function auditState(context, state) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught error: ${error.message}`));

  try {
    if (state.init) await page.addInitScript(state.init);
    if (state.before) await state.before(page);
    await page.goto(state.url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
    if (state.prepare) {
      await state.prepare(page);
      await page.waitForTimeout(SETTLE_MS);
    }

    if (state.expect && !(await page.locator(state.expect).first().isVisible())) {
      errors.push(`expected ${state.expect} to be visible: the state did not render`);
    }

    const { problems, checked } = await page.evaluate(measurePage, {
      deviceWidth: MOBILE_VIEWPORT.width,
      minTarget: MIN_TOUCH_TARGET_PX,
      tolerance: SIZE_TOLERANCE_PX,
    });
    console.log(`[mobile-audit] ${problems.length + errors.length === 0 ? 'ok  ' : 'FAIL'} ${state.name} (${checked} targets)`);
    return [...errors, ...problems];
  } finally {
    await page.close();
  }
}

async function main() {
  const { context, base, close } = await launchExtension({
    viewport: MOBILE_VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });

  try {
    const failures = [];
    const audit = async (states) => {
      for (const state of states) {
        for (const problem of await auditState(context, state)) {
          failures.push(`${state.name}: ${problem}`);
        }
      }
    };

    await audit(freshStates(base));

    const seedPage = await context.newPage();
    await seedPage.goto(`${base}/options/options.html`);
    await seedDemoData(seedPage, { ...DEMO, events: demoEvents(Date.now()) });
    await seedPage.close();

    await audit(auditStates(base));

    if (failures.length > 0) {
      throw new Error(`${failures.length} problem(s) at ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}:\n  ${failures.join('\n  ')}`);
    }
    console.log(`[mobile-audit] all pages pass at ${MOBILE_VIEWPORT.width}x${MOBILE_VIEWPORT.height}`);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error(`[mobile-audit] failed: ${error.message}`);
  process.exit(1);
});
