/**
 * Unit tests for the one-time rating prompt.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { nextRatingState, shouldShowRatingPrompt, storeReviewUrl } from '../../src/background/rating.js';
import { normalizeLifecycle } from '../../src/background/lifecycle.js';
import {
  BrowserId,
  RATING_PROMPT_MAX_SHOWS,
  RATING_PROMPT_THRESHOLD,
  RatingEvent,
  RatingState,
  STORE_REVIEW_URL,
} from '../../src/constants.js';

const NOW = 1_700_000_000_000;
const URL = 'https://store.example/reviews';

/** A lifecycle whose rating prompt is in the given state. */
const withPrompt = (ratingPrompt) =>
  normalizeLifecycle({ ratingPrompt: { ...normalizeLifecycle(undefined).ratingPrompt, ...ratingPrompt } });

/* shouldShowRatingPrompt -------------------------------------------------------------- */

test('the prompt shows once a pending user reaches the steer threshold', () => {
  const fresh = normalizeLifecycle(undefined);
  assert.equal(shouldShowRatingPrompt(fresh, RATING_PROMPT_THRESHOLD, URL), true);
  assert.equal(shouldShowRatingPrompt(fresh, RATING_PROMPT_THRESHOLD + 5, URL), true);
});

test('the prompt does not show below the threshold', () => {
  assert.equal(shouldShowRatingPrompt(normalizeLifecycle(undefined), RATING_PROMPT_THRESHOLD - 1, URL), false);
  assert.equal(shouldShowRatingPrompt(normalizeLifecycle(undefined), 0, URL), false);
});

test('the prompt does not show without a store link', () => {
  assert.equal(shouldShowRatingPrompt(normalizeLifecycle(undefined), RATING_PROMPT_THRESHOLD, null), false);
});

test('the prompt never shows once rated, dismissed or expired', () => {
  for (const state of [RatingState.RATED, RatingState.DISMISSED, RatingState.EXPIRED]) {
    assert.equal(shouldShowRatingPrompt(withPrompt({ state }), 100, URL), false, state);
  }
});

test('shouldShowRatingPrompt rejects a malformed steer count', () => {
  assert.throws(() => shouldShowRatingPrompt(normalizeLifecycle(undefined), -1, URL), /steerCount/);
  assert.throws(() => shouldShowRatingPrompt(normalizeLifecycle(undefined), 1.5, URL), /steerCount/);
});

/* nextRatingState --------------------------------------------------------------------- */

test('"rated" and "dismissed" end a pending prompt and stamp the time', () => {
  const fresh = normalizeLifecycle(undefined);
  assert.deepEqual(nextRatingState(fresh, RatingEvent.RATED, NOW).ratingPrompt, {
    state: RatingState.RATED,
    shownCount: 0,
    resolvedAt: NOW,
  });
  assert.deepEqual(nextRatingState(fresh, RatingEvent.DISMISSED, NOW).ratingPrompt, {
    state: RatingState.DISMISSED,
    shownCount: 0,
    resolvedAt: NOW,
  });
});

test('a showing counts, and the third one expires the prompt', () => {
  let lifecycle = normalizeLifecycle(undefined);
  for (let shown = 1; shown < RATING_PROMPT_MAX_SHOWS; shown += 1) {
    lifecycle = nextRatingState(lifecycle, RatingEvent.SHOWN, NOW);
    assert.deepEqual(lifecycle.ratingPrompt, { state: RatingState.PENDING, shownCount: shown, resolvedAt: null });
  }
  lifecycle = nextRatingState(lifecycle, RatingEvent.SHOWN, NOW + 1);
  assert.equal(RATING_PROMPT_MAX_SHOWS, 3);
  assert.deepEqual(lifecycle.ratingPrompt, {
    state: RatingState.EXPIRED,
    shownCount: RATING_PROMPT_MAX_SHOWS,
    resolvedAt: NOW + 1,
  });
});

test('every non-pending state is final', () => {
  for (const state of [RatingState.RATED, RatingState.DISMISSED, RatingState.EXPIRED]) {
    const done = withPrompt({ state, shownCount: 1, resolvedAt: NOW });
    for (const event of Object.values(RatingEvent)) {
      assert.deepEqual(nextRatingState(done, event, NOW + 5).ratingPrompt, done.ratingPrompt, `${state} + ${event}`);
    }
  }
});

test('nextRatingState keeps the other lifecycle flags and does not mutate', () => {
  const lifecycle = normalizeLifecycle({ variationNoticeSeenAt: 7, onboardingCompletedAt: 8 });
  const next = nextRatingState(lifecycle, RatingEvent.RATED, NOW);
  assert.equal(next.variationNoticeSeenAt, 7);
  assert.equal(next.onboardingCompletedAt, 8);
  assert.equal(lifecycle.ratingPrompt.state, RatingState.PENDING);
});

test('nextRatingState rejects an unknown event', () => {
  assert.throws(() => nextRatingState(normalizeLifecycle(undefined), 'liked', NOW), /liked/);
});

/* storeReviewUrl --------------------------------------------------------------------- */

test('storeReviewUrl gives each browser its own store entry', () => {
  for (const browser of Object.values(BrowserId)) {
    assert.equal(storeReviewUrl(browser), STORE_REVIEW_URL[browser]);
  }
  assert.match(storeReviewUrl(BrowserId.CHROME), /^https:\/\/chromewebstore\.google\.com\/.*\/reviews$/);
});

test('storeReviewUrl rejects an unknown browser', () => {
  assert.throws(() => storeReviewUrl('safari'), /safari/);
});
