/**
 * Unit tests for the pause screen's pure decisions: presentation variant,
 * concrete style, reason choice, auto-continue and breath count.
 * Run: node --test tests/unit/
 *
 * Habituation is the product risk here: a screen that never changes stops
 * being read. These tests make "it changes every time" measurable.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  presentationVariant,
  concretePauseStyle,
  pickReason,
  effectiveAutoContinue,
  breathCountFor,
  presentSite,
  effectivePauseSeconds,
} from '../../src/background/pause.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import {
  DESTINATION_FALLBACK_LABEL,
  OVER_LIMIT_PAUSE_SECONDS,
  PAUSE_PROMPTS,
  PRESENTATION_LAYOUTS,
  PRESENTATION_PALETTES,
  PauseStyle,
} from '../../src/constants.js';

const { REASON, BREATHING, INTENTION, ROTATE } = PauseStyle;

/** @returns {object} A site record. */
function site(fields = {}) {
  return {
    id: 'id-1',
    pattern: 'reddit.com',
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: null,
    order: 0,
    overrides: {},
    ...fields,
  };
}

const settings = (patch = {}) => ({ ...defaultSettings(), ...patch });

/* presentationVariant (criterion 1) --------------------------------------- */

test('every presentation list has at least two entries', () => {
  assert.ok(PRESENTATION_LAYOUTS.length >= 2);
  assert.ok(PRESENTATION_PALETTES.length >= 2);
  assert.ok(PAUSE_PROMPTS.length >= 2);
});

test('consecutive variants differ in layout, palette and prompt for n in 0..1000', () => {
  for (let n = 0; n <= 1000; n += 1) {
    const a = presentationVariant(n);
    const b = presentationVariant(n + 1);
    assert.notEqual(a.layout, b.layout, `layout at n=${n}`);
    assert.notEqual(a.palette, b.palette, `palette at n=${n}`);
    assert.notEqual(a.prompt.lead, b.prompt.lead, `prompt lead at n=${n}`);
    assert.notEqual(a.prompt.reasonLead, b.prompt.reasonLead, `prompt reasonLead at n=${n}`);
  }
});

test('every prompt wording is distinct, so a different prompt reads differently', () => {
  assert.equal(new Set(PAUSE_PROMPTS.map((p) => p.lead)).size, PAUSE_PROMPTS.length);
  assert.equal(new Set(PAUSE_PROMPTS.map((p) => p.reasonLead)).size, PAUSE_PROMPTS.length);
  assert.equal(new Set(PRESENTATION_LAYOUTS).size, PRESENTATION_LAYOUTS.length);
  assert.equal(new Set(PRESENTATION_PALETTES).size, PRESENTATION_PALETTES.length);
});

test('presentationVariant indexes each list by n', () => {
  const variant = presentationVariant(5);
  assert.equal(variant.layout, PRESENTATION_LAYOUTS[5 % PRESENTATION_LAYOUTS.length]);
  assert.equal(variant.palette, PRESENTATION_PALETTES[5 % PRESENTATION_PALETTES.length]);
  assert.deepEqual(variant.prompt, PAUSE_PROMPTS[5 % PAUSE_PROMPTS.length]);
});

test('presentationVariant rejects a negative or fractional count', () => {
  assert.throws(() => presentationVariant(-1), /presentationVariant/);
  assert.throws(() => presentationVariant(1.5), /presentationVariant/);
});

/* concretePauseStyle (criterion 5) ---------------------------------------- */

test('rotate yields reason, breathing, intention and repeats at 3', () => {
  assert.equal(concretePauseStyle(ROTATE, 0), REASON);
  assert.equal(concretePauseStyle(ROTATE, 1), BREATHING);
  assert.equal(concretePauseStyle(ROTATE, 2), INTENTION);
  assert.equal(concretePauseStyle(ROTATE, 3), REASON);
});

test('non-rotate styles return themselves', () => {
  for (const style of [REASON, BREATHING, INTENTION]) {
    for (const n of [0, 1, 2, 7]) assert.equal(concretePauseStyle(style, n), style);
  }
});

test('concretePauseStyle rejects an unknown style', () => {
  assert.throws(() => concretePauseStyle('meditate', 0), /meditate/);
});

/* pickReason (criterion 6) ------------------------------------------------- */

test('rotation guard: the reason screen shows a, b, c at n = 0, 3, 6', () => {
  const reasons = ['a', 'b', 'c'];
  const shown = (n) => presentSite(settings({ pauseStyle: ROTATE, reasons }), site(), n, { host: 'reddit.com', continuesToday: 0 });

  assert.equal(shown(0).pauseStyle, REASON);
  assert.equal(shown(0).reason, 'a');
  assert.equal(shown(3).pauseStyle, REASON);
  assert.equal(shown(3).reason, 'b');
  assert.equal(shown(6).pauseStyle, REASON);
  assert.equal(shown(6).reason, 'c');
});

test('rotation guard: every reason appears in every style over n = 0..8', () => {
  const reasons = ['a', 'b', 'c'];
  const seen = new Set();
  for (let n = 0; n <= 8; n += 1) {
    const view = presentSite(settings({ pauseStyle: ROTATE, reasons }), site(), n, { host: 'reddit.com', continuesToday: 0 });
    seen.add(`${view.pauseStyle}:${view.reason}`);
  }
  for (const style of [REASON, BREATHING, INTENTION]) {
    for (const reason of reasons) assert.ok(seen.has(`${style}:${reason}`), `${style} with ${reason}`);
  }
});

test('without rotate, pickReason returns reasons[n % len]', () => {
  const reasons = ['a', 'b', 'c'];
  for (let n = 0; n < 10; n += 1) {
    assert.equal(pickReason(reasons, n, false), reasons[n % 3]);
  }
});

test('with rotate, pickReason advances once per full rotation', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((n) => pickReason(['a', 'b'], n, true)),
    ['a', 'a', 'a', 'b', 'b', 'b', 'a']
  );
});

test('pickReason with no reasons returns an empty string', () => {
  assert.equal(pickReason([], 0, false), '');
  assert.equal(pickReason([], 7, true), '');
});

/* effectiveAutoContinue and breathCountFor (criterion 7) ------------------- */

test('the intention style never auto-continues', () => {
  assert.equal(effectiveAutoContinue(INTENTION, true), false);
  assert.equal(effectiveAutoContinue(INTENTION, false), false);
});

test('other styles keep their auto-continue setting', () => {
  for (const style of [REASON, BREATHING]) {
    assert.equal(effectiveAutoContinue(style, true), true);
    assert.equal(effectiveAutoContinue(style, false), false);
  }
});

test('breathCountFor paces one 10-second breath per started 10 seconds, at least one', () => {
  assert.equal(breathCountFor(0), 1);
  assert.equal(breathCountFor(10), 1);
  assert.equal(breathCountFor(11), 2);
  assert.equal(breathCountFor(20), 2);
  assert.equal(breathCountFor(60), 6);
});

/* presentSite --------------------------------------------------------------- */

test('presentSite returns what the pause page renders', () => {
  const view = presentSite(
    settings({ reasons: ['focus'], targetName: 'Wikipedia', bypassMinutes: 15 }),
    site({ displayName: 'Reddit' }),
    0,
    { host: 'www.reddit.com', continuesToday: 0 }
  );
  assert.equal(view.siteName, 'Reddit');
  assert.equal(view.reason, 'focus');
  assert.equal(view.targetName, 'Wikipedia');
  assert.equal(view.pauseStyle, REASON);
  assert.equal(view.bypassMinutes, 15);
  assert.equal(view.breathCount, 1);
  assert.deepEqual(view.variant, presentationVariant(0));
});

test('presentSite owns the target-name fallback', () => {
  const named = (target) =>
    presentSite(settings({ target, targetName: '' }), site(), 0, { host: 'reddit.com', continuesToday: 0 }).targetName;
  assert.equal(named('https://www.wikipedia.org/wiki/X'), 'wikipedia.org');
  assert.equal(named('not a url'), DESTINATION_FALLBACK_LABEL);
});

test('presentSite names an unmatched site by its host', () => {
  const view = presentSite(settings(), null, 0, { host: 'old.reddit.com', continuesToday: 0 });
  assert.equal(view.siteName, 'old.reddit.com');
});

test('presentSite varies the variant with n by default and freezes it when turned off', () => {
  const at = (n, vary) =>
    presentSite(settings({ varyPresentation: vary }), site(), n, { host: 'reddit.com', continuesToday: 0 }).variant;
  assert.notDeepEqual(at(0, true), at(1, true));
  assert.deepEqual(at(0, false), at(1, false));
  assert.deepEqual(at(7, false), presentationVariant(0));
});

test('presentSite forces auto-continue off when rotate lands on intention', () => {
  const resolved = settings({ pauseStyle: ROTATE, autoContinue: true });
  assert.equal(presentSite(resolved, site(), 0, { host: 'reddit.com', continuesToday: 0 }).autoContinue, true);
  assert.equal(presentSite(resolved, site(), 2, { host: 'reddit.com', continuesToday: 0 }).autoContinue, false);
});

test('presentSite paces breaths from the pause length', () => {
  const view = presentSite(settings({ pauseSeconds: 20 }), site(), 0, { host: 'reddit.com', continuesToday: 0 });
  assert.equal(view.pauseSeconds, 20);
  assert.equal(view.breathCount, 2);
});

test('presentSite rejects a missing host', () => {
  assert.throws(() => presentSite(settings(), null, 0, {}), /host/);
});

test('presentSite rejects a missing or negative continuesToday', () => {
  assert.throws(() => presentSite(settings(), null, 0, { host: 'reddit.com' }), /continuesToday/);
  assert.throws(() => presentSite(settings(), null, 0, { host: 'reddit.com', continuesToday: -1 }), /continuesToday/);
});

/* Daily allowance (resolution rule 11) ------------------------------------------- */

test('effectivePauseSeconds: limit 2 reached gives 30 s from a pause of 0, and keeps a longer pause', () => {
  assert.equal(effectivePauseSeconds({ pauseSeconds: 0, dailyContinueLimit: 2 }, 2), OVER_LIMIT_PAUSE_SECONDS);
  assert.equal(OVER_LIMIT_PAUSE_SECONDS, 30);
  assert.equal(effectivePauseSeconds({ pauseSeconds: 45, dailyContinueLimit: 2 }, 2), 45);
});

test('effectivePauseSeconds is the pause length below the limit or with no limit', () => {
  assert.equal(effectivePauseSeconds({ pauseSeconds: 0, dailyContinueLimit: 2 }, 1), 0);
  assert.equal(effectivePauseSeconds({ pauseSeconds: 10, dailyContinueLimit: null }, 40), 10);
});

test('presentSite reports the allowance and lengthens the pause once over the limit', () => {
  const resolved = settings({ dailyContinueLimit: 2, pauseStyle: BREATHING });
  const under = presentSite(resolved, site(), 0, { host: 'reddit.com', continuesToday: 1 });
  assert.equal(under.overLimit, false);
  assert.equal(under.pauseSeconds, 0);
  assert.equal(under.breathCount, 1);

  const over = presentSite(resolved, site(), 0, { host: 'reddit.com', continuesToday: 2 });
  assert.equal(over.overLimit, true);
  assert.equal(over.continuesToday, 2);
  assert.equal(over.dailyContinueLimit, 2);
  assert.equal(over.pauseSeconds, OVER_LIMIT_PAUSE_SECONDS);
  assert.equal(over.breathCount, 3, 'breathing paces the longer pause');
});

test('presentSite with no limit is never over it', () => {
  const view = presentSite(settings(), site(), 0, { host: 'reddit.com', continuesToday: 12 });
  assert.equal(view.overLimit, false);
  assert.equal(view.dailyContinueLimit, null);
});
