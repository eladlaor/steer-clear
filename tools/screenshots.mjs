#!/usr/bin/env node
/**
 * Regenerate the Chrome Web Store screenshots in store/screenshots/.
 *
 * Loads src/ as an unpacked extension in Chromium, seeds it with a fixed demo
 * configuration and a deterministic interception history, then captures the
 * three listing screenshots at exactly 1280x800:
 *
 *   1-reminder.png  the interstitial — the product, so it leads the listing
 *   2-settings.png  the options page
 *   3-patterns.png  the statistics page
 *
 * The real extension pages render with real code; only the stored data is
 * staged. Re-run after any UI change so the listing matches what ships.
 *
 * Usage:  node tools/screenshots.mjs [--out <dir>]
 * Needs:  Playwright (local or global install) and a Chromium build. On a
 *         machine without one: `npm i -g playwright && npx playwright install chromium`.
 */

import { mkdirSync } from 'node:fs';
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

/**
 * Per-page zoom. At 100% the settings and statistics pages cut off above their
 * most telling content (the site list, the 30-day chart); zooming out fits it
 * while text stays legible at listing size. The reminder stays at 100%: it is
 * a centred card that already fits, and zoom would break its vh-based centring.
 */
const ZOOM = { reminder: 1, settings: 0.72, patterns: 0.8 };

const DEMO_NOTE = 'I said I would write today, not read the news.';
const DEMO_SITES = ['ynet.co.il', 'facebook.com'];

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
  return events.sort((x, y) => x.at - y.at);
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
      sites: DEMO_SITES.map((pattern) => ({ pattern })),
      events: buildEvents(now),
      // The listing shows the screen as a returning user sees it.
      lifecycle: { variationNoticeSeenAt: now },
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

    const shoot = async (url, file, zoom) => {
      await page.goto(url);
      await page.waitForLoadState('networkidle');
      if (zoom !== 1) await page.addStyleTag({ content: `html { zoom: ${zoom}; }` });
      await page.waitForTimeout(500); // let async renders and fonts settle
      const target = path.join(out, file);
      await page.screenshot({ path: target });
      console.log(`wrote ${path.relative(ROOT, target)}`);
    };

    // Statistics first: opening the interstitial records a real interception,
    // which would add a stray event (stamped today) to the seeded history.
    await shoot(`${base}/stats/stats.html`, '3-patterns.png', ZOOM.patterns);
    await shoot(`${base}/options/options.html`, '2-settings.png', ZOOM.settings);
    const from = encodeURIComponent('https://www.ynet.co.il/news');
    await shoot(`${base}/blocked/blocked.html?from=${from}`, '1-reminder.png', ZOOM.reminder);
  } finally {
    await close();
  }
}

main().catch((error) => {
  console.error('[screenshots] failed:', error.message);
  process.exit(1);
});
