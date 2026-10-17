#!/usr/bin/env node
/**
 * Regenerate the store screenshots and the small promo tile in
 * store/screenshots/.
 *
 * Loads src/ as an unpacked extension in Chromium, seeds it with a fixed demo
 * configuration (schema v3) and a deterministic, outcome-tagged interception
 * history, then captures five listing screenshots at exactly 1280x800 and one
 * 440x280 promo tile:
 *
 *   1-reminder.png       the pause page: the product, so it leads the listing
 *   2-breathing.png      the breathing pause style
 *   3-settings.png       the settings page
 *   4-patterns.png       the statistics page
 *   5-popup.png          the toolbar popup, framed on a 1280x800 canvas
 *   promo-small-440x280.png  the small promo tile
 *
 * The real extension pages render with real code; only the stored data is
 * staged. Re-run after any UI change so the listing matches what ships.
 * Every file's pixel size is checked after it is written.
 *
 * Usage:  node tools/screenshots.mjs [--out <dir>]
 * Needs:  Playwright (local or global install) and a Chromium build. On a
 *         machine without one: `npm i -g playwright && npx playwright install chromium`.
 */

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { ROOT, launchExtension, seedDemoData } from './extension_harness.mjs';

const DEFAULT_OUT_DIR = path.join(ROOT, 'store', 'screenshots');

/** `--out <dir>` writes elsewhere, for a preview that leaves the committed set alone. */
function outDir() {
  const flag = process.argv.indexOf('--out');
  return flag === -1 ? DEFAULT_OUT_DIR : path.resolve(process.argv[flag + 1]);
}

/** Web Store accepts 1280x800 or 640x400; the larger one reads better. */
const VIEWPORT = { width: 1280, height: 800 };

/** The Web Store's small promo tile. */
const PROMO_TILE = { width: 440, height: 280 };

/** The popup is captured at its own size, then framed on the 1280x800 canvas. */
const POPUP_VIEWPORT = { width: 360, height: 560 };

/** Output file names, in listing order. */
const FILES = Object.freeze({
  reminder: '1-reminder.png',
  breathing: '2-breathing.png',
  settings: '3-settings.png',
  patterns: '4-patterns.png',
  popup: '5-popup.png',
  promo: 'promo-small-440x280.png',
});

/** Mid in-breath, so the breathing circle is visibly grown. */
const BREATHING_SETTLE_MS = 2500;

/** Light-scheme colours from src/shared/tokens.css, for the framed images. */
const FRAME = Object.freeze({ bg: '#f7f6f3', ink: '#1c1b19', inkSoft: '#6b6862', accent: '#2f6f5e', accentInk: '#ffffff' });

/** The demo tab the popup is opened over, so quick-add shows. */
const POPUP_TAB_URL = 'https://www.instagram.com/';

/**
 * Per-page zoom. At 100% the settings and statistics pages cut off above their
 * most telling content (the site list, the 30-day chart); zooming out fits it
 * while text stays legible at listing size. The reminder stays at 100%: it is
 * a centred card that already fits, and zoom would break its vh-based centring.
 */
const ZOOM = { reminder: 1, settings: 0.72, patterns: 0.8 };

const DEMO_NOTE = 'I said I would write today, not read the news.';
const DEMO_SITES = [
  { pattern: 'ynet.co.il' },
  { pattern: 'facebook.com', overrides: { pauseStyle: 'breathing', reasons: ['Messages can wait until lunch.'] } },
];

/**
 * Interception history shaped like a real habit: weekday mornings, a post-lunch
 * dip, an evening bump, nothing on Friday/Saturday. Seeded so every run
 * produces the same charts.
 */
const HISTORY = {
  seed: 42,
  days: 85,
  perSite: { 'ynet.co.il': 68, 'facebook.com': 15 },
  activeWeekdays: [0, 1, 2, 3, 4], // Sun–Thu
  hourWeights: { 9: 3, 10: 6, 11: 7, 13: 2, 14: 2, 15: 1, 18: 2, 19: 2, 20: 1 },
  /** Share of views that end steered or continued; the rest are left. */
  steeredShare: 0.35,
  continuedShare: 0.2,
  /** A few pauses earlier today, so the popup's "today" is not empty. */
  today: [
    { host: 'ynet.co.il', minutesAgo: 25, outcome: 'steered' },
    { host: 'facebook.com', minutesAgo: 15, outcome: undefined },
    { host: 'ynet.co.il', minutesAgo: 5, outcome: 'continued' },
  ],
};

/** Small deterministic PRNG (mulberry32). */
function rng(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted(random, weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = random() * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return Number(key);
  }
  return Number(entries.at(-1)[0]);
}

/** A view's outcome: mostly steered clear, sometimes continued. */
function pickOutcome(random) {
  const roll = random();
  if (roll < HISTORY.steeredShare) return 'steered';
  if (roll < HISTORY.steeredShare + HISTORY.continuedShare) return 'continued';
  return undefined;
}

/** Build [{host, at, outcome}] events relative to `now`, in local time. */
function buildEvents(now) {
  const random = rng(HISTORY.seed);
  const events = [];
  for (const [host, count] of Object.entries(HISTORY.perSite)) {
    for (let i = 0; i < count; i += 1) {
      let day;
      do {
        day = new Date(now);
        day.setDate(day.getDate() - Math.floor(random() * HISTORY.days));
      } while (!HISTORY.activeWeekdays.includes(day.getDay()));
      day.setHours(pickWeighted(random, HISTORY.hourWeights), Math.floor(random() * 60), 0, 0);
      const outcome = pickOutcome(random);
      if (day.getTime() <= now) events.push({ host, at: day.getTime(), outcome });
    }
  }
  for (const { host, minutesAgo, outcome } of HISTORY.today) {
    events.push({ host, at: now - minutesAgo * 60 * 1000, outcome });
  }
  return events.sort((x, y) => x.at - y.at);
}

/**
 * Width and height from a PNG's header.
 *
 * @param {string} file
 * @returns {{width: number, height: number}}
 */
function pngSize(file) {
  const bytes = readFileSync(file);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/**
 * Fail loudly when a written image is not the size the store requires.
 *
 * @param {string} file
 * @param {{width: number, height: number}} expected
 */
function assertSize(file, expected) {
  const actual = pngSize(file);
  if (actual.width !== expected.width || actual.height !== expected.height) {
    throw new Error(`${file} is ${actual.width}x${actual.height}, expected ${expected.width}x${expected.height}`);
  }
  console.log(`wrote ${path.relative(ROOT, file)} (${actual.width}x${actual.height})`);
}

/** @param {Buffer} png @returns {string} A data: URL. */
const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

/**
 * The popup framed on the listing canvas: a headline on the left, the popup
 * as it renders on the right.
 *
 * @param {Buffer} popupPng
 * @returns {string} HTML.
 */
function popupFrameHtml(popupPng) {
  return `<!DOCTYPE html><html><body style="margin:0;width:${VIEWPORT.width}px;height:${VIEWPORT.height}px;
    display:flex;align-items:center;justify-content:center;gap:96px;background:${FRAME.bg};
    font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:${FRAME.ink}">
    <div style="max-width:420px">
      <p style="margin:0 0 12px;font-size:20px;color:${FRAME.accent};font-weight:600">One click from the toolbar</p>
      <h1 style="margin:0 0 16px;font-size:44px;line-height:1.15">Add the site you're on. Snooze when you need to.</h1>
      <p style="margin:0;font-size:20px;color:${FRAME.inkSoft}">Today's pauses at a glance, and access asked for one site at a time.</p>
    </div>
    <img src="${dataUrl(popupPng)}" alt="" style="border:1px solid #e4e1da;border-radius:12px;
      box-shadow:0 18px 48px rgba(0,0,0,.14)">
  </body></html>`;
}

/**
 * The small promo tile: icon, name and the listing's lead line.
 *
 * @returns {string} HTML.
 */
function promoTileHtml() {
  const icon = readFileSync(path.join(ROOT, 'src', 'icons', 'icon-128.png'));
  return `<!DOCTYPE html><html><body style="margin:0;width:${PROMO_TILE.width}px;height:${PROMO_TILE.height}px;
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:${FRAME.accent};
    color:${FRAME.accentInk};font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;text-align:center">
    <img src="${dataUrl(icon)}" alt="" width="72" height="72">
    <div style="font-size:34px;font-weight:700;letter-spacing:-0.01em">Steer Clear</div>
    <div style="max-width:360px;font-size:17px;line-height:1.35">A nudge in your own words, not a wall.</div>
  </body></html>`;
}

async function main() {
  const { context, base, close } = await launchExtension({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });

  try {
    const now = Date.now();
    const page = await context.newPage();
    await page.goto(`${base}/options/options.html`);
    await seedDemoData(page, {
      defaults: { targetName: 'Wikipedia', reasons: [DEMO_NOTE] },
      sites: DEMO_SITES,
      events: buildEvents(now),
      // The listing shows the screens as a returning user sees them, without
      // the one-time notice and rating banner.
      lifecycle: {
        onboardingCompletedAt: now,
        variationNoticeSeenAt: now,
        ratingPrompt: { state: 'dismissed', shownCount: 1, resolvedAt: now },
      },
    });

    // A real user grants each site's access through Chrome's own prompt, which
    // automation cannot click. Report the demo sites as granted so the settings
    // page shows the state a user actually lives in, not the pre-grant banner.
    // Capture browser only; nothing here touches the shipped code.
    await context.addInitScript(() => {
      if (globalThis.chrome?.permissions) {
        chrome.permissions.contains = async () => true;
      }
    });

    const out = outDir();
    mkdirSync(out, { recursive: true });

    const shoot = async (url, file, zoom, { settleMs = 500, scrollTo = null } = {}) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      if (zoom !== 1) await page.addStyleTag({ content: `html { zoom: ${zoom}; }` });
      await page.waitForTimeout(settleMs); // let async renders and fonts settle
      if (scrollTo) await page.locator(scrollTo).evaluate((node) => node.scrollIntoView({ block: 'center' }));
      const target = path.join(out, file);
      await page.screenshot({ path: target });
      assertSize(target, VIEWPORT);
    };

    // Statistics first: opening the pause page records a real interception,
    // which would add a stray event (stamped today) to the seeded history.
    await shoot(`${base}/stats/stats.html`, FILES.patterns, ZOOM.patterns);
    // The defaults form is long; centre the site list, the part a listing reader needs.
    await shoot(`${base}/options/options.html`, FILES.settings, ZOOM.settings, { scrollTo: '#sites-heading' });

    // The popup, opened over a demo tab so quick-add shows, then framed.
    const popup = await context.newPage();
    await popup.addInitScript((url) => {
      chrome.tabs.query = async () => [{ id: 1, url }];
    }, POPUP_TAB_URL);
    await popup.setViewportSize(POPUP_VIEWPORT);
    await popup.goto(`${base}/popup/popup.html`);
    await popup.waitForLoadState('networkidle');
    await popup.waitForTimeout(500);
    const popupPng = await popup.locator('body').screenshot();
    await popup.setViewportSize(VIEWPORT);
    await popup.setContent(popupFrameHtml(popupPng));
    const popupTarget = path.join(out, FILES.popup);
    await popup.screenshot({ path: popupTarget });
    assertSize(popupTarget, VIEWPORT);

    await popup.setViewportSize(PROMO_TILE);
    await popup.setContent(promoTileHtml());
    const promoTarget = path.join(out, FILES.promo);
    await popup.screenshot({ path: promoTarget });
    assertSize(promoTarget, PROMO_TILE);
    await popup.close();

    const from = (url) => `${base}/blocked/blocked.html?from=${encodeURIComponent(url)}`;
    await shoot(from('https://www.ynet.co.il/news'), FILES.reminder, ZOOM.reminder);
    await shoot(from('https://www.facebook.com/'), FILES.breathing, ZOOM.reminder, { settleMs: BREATHING_SETTLE_MS });
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error('[screenshots] failed:', error.message);
  process.exit(1);
});
