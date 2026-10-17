#!/usr/bin/env node
/**
 * Phone-width audit of every extension page.
 *
 * Loads src/ unpacked in Playwright's Chromium, emulating a touch phone at
 * MOBILE_VIEWPORT (360x740), seeds demo data, opens each page in each state
 * worth checking, and fails when:
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
const DEMO = {
  defaults: {
    targetName: 'Wikipedia',
    reasons: ['I said I would write today, not read the news. This reason is long enough to wrap on a phone.'],
  },
  sites: [
    { pattern: 'example.com' },
    { pattern: 'news.example.org', fields: { displayName: 'The news' }, overrides: { autoContinue: true, countdownSeconds: 60 } },
    { pattern: LONG_HOST },
    { pattern: 'breathe.example.net', overrides: { pauseStyle: 'breathing' } },
    { pattern: 'intent.example.net', overrides: { pauseStyle: 'intention', reasons: ['x'.repeat(280)] } },
  ],
};

/**
 * A deterministic spread of interceptions over the last 30 days.
 *
 * @param {number} now
 * @returns {Array<{host: string, at: number}>}
 */
function demoEvents(now) {
  const hosts = ['example.com', 'news.example.org', LONG_HOST];
  return Array.from({ length: 60 }, (_, i) => ({
    host: hosts[i % hosts.length],
    at: now - (i % 30) * DAY_MS - (i % 24) * 60 * 60 * 1000,
  }));
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
    // Each visit advances the presentation variant, so repeats cover the layouts.
    { name: 'reminder (breathing)', url: from(encodeURIComponent('https://breathe.example.net/')) },
    { name: 'reminder (breathing, next variant)', url: from(encodeURIComponent('https://breathe.example.net/')) },
    { name: 'reminder (intention, longest reason)', url: from(encodeURIComponent('https://intent.example.net/')) },
    { name: 'reminder (intention, next variant)', url: from(encodeURIComponent('https://intent.example.net/')) },
    { name: 'reminder (intention, third variant)', url: from(encodeURIComponent('https://intent.example.net/')) },
    { name: 'reminder (opened directly)', url: `${base}/blocked/blocked.html` },
    {
      name: 'settings (every site expanded)',
      url: `${base}/options/options.html`,
      prepare: async (page) => {
        for (const button of await page.locator('.site-expand').all()) await button.click();
        for (const summary of await page.locator('details > summary').all()) await summary.click();
      },
    },
    { name: 'stats', url: `${base}/stats/stats.html` },
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
 * Audit one page state.
 *
 * @param {object} context
 * @param {{name: string, url: string, prepare?: Function}} state
 * @returns {Promise<string[]>} Problems found.
 */
async function auditState(context, state) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`uncaught error: ${error.message}`));

  try {
    await page.goto(state.url);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(SETTLE_MS);
    if (state.prepare) {
      await state.prepare(page);
      await page.waitForTimeout(SETTLE_MS);
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
    const seedPage = await context.newPage();
    await seedPage.goto(`${base}/options/options.html`);
    await seedDemoData(seedPage, { ...DEMO, events: demoEvents(Date.now()) });
    await seedPage.close();

    const failures = [];
    for (const state of auditStates(base)) {
      for (const problem of await auditState(context, state)) {
        failures.push(`${state.name}: ${problem}`);
      }
    }

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
