/**
 * Unit tests for the one-time lifecycle flags.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeLifecycle,
  applyLifecycleEvent,
  shouldShowVariationNotice,
} from '../../src/background/lifecycle.js';
import { LifecycleEvent, RatingState } from '../../src/constants.js';

const NOW = 1_700_000_000_000;

test('normalizeLifecycle(undefined) returns the documented defaults', () => {
  assert.deepEqual(normalizeLifecycle(undefined), {
    onboardingCompletedAt: null,
    variationNoticeSeenAt: null,
    ratingPrompt: { state: RatingState.PENDING, shownCount: 0, resolvedAt: null },
  });
});

test('normalizeLifecycle keeps stored values and fills missing ones', () => {
  const lifecycle = normalizeLifecycle({ variationNoticeSeenAt: 5, ratingPrompt: { shownCount: 2 } });
  assert.equal(lifecycle.variationNoticeSeenAt, 5);
  assert.equal(lifecycle.onboardingCompletedAt, null);
  assert.deepEqual(lifecycle.ratingPrompt, { state: RatingState.PENDING, shownCount: 2, resolvedAt: null });
});

test('variationNoticeSeen stamps the time once and keeps the first stamp', () => {
  const once = applyLifecycleEvent(normalizeLifecycle(undefined), LifecycleEvent.VARIATION_NOTICE_SEEN, NOW);
  assert.equal(once.variationNoticeSeenAt, NOW);
  const twice = applyLifecycleEvent(once, LifecycleEvent.VARIATION_NOTICE_SEEN, NOW + 1);
  assert.equal(twice.variationNoticeSeenAt, NOW);
});

test('applyLifecycleEvent rejects an unknown event and does not mutate', () => {
  const lifecycle = normalizeLifecycle(undefined);
  assert.throws(() => applyLifecycleEvent(lifecycle, 'nope', NOW), /nope/);
  applyLifecycleEvent(lifecycle, LifecycleEvent.VARIATION_NOTICE_SEEN, NOW);
  assert.equal(lifecycle.variationNoticeSeenAt, null);
});

test('the variation notice shows until seen, and never when variation is off', () => {
  const fresh = normalizeLifecycle(undefined);
  assert.equal(shouldShowVariationNotice(fresh, true), true);
  assert.equal(shouldShowVariationNotice(fresh, false), false);
  const seen = applyLifecycleEvent(fresh, LifecycleEvent.VARIATION_NOTICE_SEEN, NOW);
  assert.equal(shouldShowVariationNotice(seen, true), false);
});

test('onboardingCompleted stamps the time once', () => {
  const once = applyLifecycleEvent(normalizeLifecycle(undefined), LifecycleEvent.ONBOARDING_COMPLETED, NOW);
  assert.equal(once.onboardingCompletedAt, NOW);
  const twice = applyLifecycleEvent(once, LifecycleEvent.ONBOARDING_COMPLETED, NOW + 1);
  assert.equal(twice.onboardingCompletedAt, NOW);
});

test('the rating events move the rating prompt', () => {
  const fresh = normalizeLifecycle(undefined);
  const shown = applyLifecycleEvent(fresh, LifecycleEvent.RATING_SHOWN, NOW);
  assert.deepEqual(shown.ratingPrompt, { state: RatingState.PENDING, shownCount: 1, resolvedAt: null });
  assert.equal(applyLifecycleEvent(shown, LifecycleEvent.RATING_RATED, NOW).ratingPrompt.state, RatingState.RATED);
  assert.equal(
    applyLifecycleEvent(shown, LifecycleEvent.RATING_DISMISSED, NOW).ratingPrompt.state,
    RatingState.DISMISSED
  );
});

test('a rating answer does not touch the other flags', () => {
  const lifecycle = applyLifecycleEvent(
    normalizeLifecycle({ variationNoticeSeenAt: 3 }),
    LifecycleEvent.RATING_DISMISSED,
    NOW
  );
  assert.equal(lifecycle.variationNoticeSeenAt, 3);
  assert.equal(lifecycle.onboardingCompletedAt, null);
});
