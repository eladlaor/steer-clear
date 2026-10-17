/**
 * Unit tests for the continue gate: when the pause page lets the user through.
 * Run: node --test tests/unit/
 *
 * Continue unlocks when both the style's own condition (breaths done, an
 * intention typed) and the pause length are satisfied. The gate is friction,
 * never a wall: it always unlocks.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { continueGate } from '../../src/background/continue_gate.js';
import { ContinueBlock, PauseStyle } from '../../src/constants.js';

const { REASON, BREATHING, INTENTION } = PauseStyle;

/** A state with the style's own condition unmet, at render time. */
function before(style, pauseSeconds) {
  return { style, pauseSeconds, elapsedMs: 0, breathsDone: 0, breathCount: 2, intentionText: '' };
}

/** The same state with the style's condition met. */
function styleDone(state) {
  return { ...state, breathsDone: state.breathCount, intentionText: 'reply to Dana' };
}

const STYLE_BLOCK = { [REASON]: null, [BREATHING]: ContinueBlock.BREATHING, [INTENTION]: ContinueBlock.INTENTION };

for (const style of [REASON, BREATHING, INTENTION]) {
  test(`${style}, pause 0: blocked only by the style, then enabled`, () => {
    const start = continueGate(before(style, 0));
    assert.equal(start.blockedBy, STYLE_BLOCK[style]);
    assert.equal(start.enabled, STYLE_BLOCK[style] === null);
    assert.equal(start.remainingSeconds, 0);

    const done = continueGate(styleDone(before(style, 0)));
    assert.deepEqual(done, { enabled: true, blockedBy: null, remainingSeconds: 0 });
  });

  test(`${style}, pause 10: blocked by the style first, then by the wait, then enabled`, () => {
    const start = continueGate(before(style, 10));
    assert.equal(start.enabled, false);
    assert.equal(start.blockedBy, STYLE_BLOCK[style] ?? ContinueBlock.WAITING);
    assert.equal(start.remainingSeconds, 10);

    const waiting = continueGate({ ...styleDone(before(style, 10)), elapsedMs: 3000 });
    assert.equal(waiting.enabled, false);
    assert.equal(waiting.blockedBy, ContinueBlock.WAITING);
    assert.equal(waiting.remainingSeconds, 7);

    const after = continueGate({ ...styleDone(before(style, 10)), elapsedMs: 10000 });
    assert.deepEqual(after, { enabled: true, blockedBy: null, remainingSeconds: 0 });
  });
}

test('remainingSeconds counts down, rounding partial seconds up', () => {
  const at = (elapsedMs) => continueGate({ ...before(REASON, 10), elapsedMs }).remainingSeconds;
  assert.deepEqual([0, 1, 999, 1000, 9001, 9999, 10000, 15000].map(at), [10, 10, 10, 9, 1, 1, 0, 0]);
});

test('the wait keeps running while the style condition is unmet', () => {
  const gate = continueGate({ ...before(BREATHING, 10), elapsedMs: 4000 });
  assert.equal(gate.blockedBy, ContinueBlock.BREATHING);
  assert.equal(gate.remainingSeconds, 6);
});

test('intention needs three non-space characters', () => {
  const typed = (intentionText) => continueGate({ ...before(INTENTION, 0), intentionText }).enabled;
  assert.equal(typed('ab'), false);
  assert.equal(typed(' a  b '), false);
  assert.equal(typed('a b c'), true);
  assert.equal(typed('abc'), true);
});

test('breathing needs every breath, not just one', () => {
  assert.equal(continueGate({ ...before(BREATHING, 0), breathsDone: 1 }).enabled, false);
  assert.equal(continueGate({ ...before(BREATHING, 0), breathsDone: 2 }).enabled, true);
});

test('continueGate rejects rotate and unknown styles', () => {
  assert.throws(() => continueGate(before(PauseStyle.ROTATE, 0)), /concrete/);
  assert.throws(() => continueGate(before('nap', 0)), /nap/);
});

/* The over-limit line on the pause page ------------------------------------------- */

test('the over-limit line names the site, today\'s count, the limit and the wait', async () => {
  const { overLimitMessage } = await import('../../src/blocked/continue_view.js');
  assert.equal(
    overLimitMessage({ siteName: 'reddit.com', continuesToday: 2, dailyContinueLimit: 2, pauseSeconds: 30 }),
    "You've opened reddit.com 2 times today, past your daily limit of 2, so continue unlocks after 30 s."
  );
  assert.match(
    overLimitMessage({ siteName: 'x.com', continuesToday: 1, dailyContinueLimit: 1, pauseSeconds: 45 }),
    /1 time today.*after 45 s/
  );
});
