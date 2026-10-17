/**
 * The one-time rating prompt: when to show it and how answers move it.
 *
 * Pure. The prompt state lives in the `lifecycle` record (storage.local),
 * written only by the worker. A user who has actively chosen the
 * destination RATING_PROMPT_THRESHOLD times is asked once, on a page they
 * open themselves; an answer, or RATING_PROMPT_MAX_SHOWS showings without
 * one, ends it for good.
 */

import {
  RATING_PROMPT_MAX_SHOWS,
  RATING_PROMPT_THRESHOLD,
  RatingEvent,
  RatingState,
  STORE_REVIEW_URL,
} from '../constants.js';

/**
 * @param {{ratingPrompt: {state: string}}} lifecycle A normalized lifecycle.
 * @param {number} steerCount Views where the user chose the destination.
 * @param {string|null} storeUrl This browser's reviews page, or null.
 * @returns {boolean}
 */
export function shouldShowRatingPrompt(lifecycle, steerCount, storeUrl) {
  if (!Number.isInteger(steerCount) || steerCount < 0) {
    throw new Error(`shouldShowRatingPrompt: steerCount must be a non-negative integer, got ${steerCount}`);
  }
  return (
    lifecycle.ratingPrompt.state === RatingState.PENDING &&
    steerCount >= RATING_PROMPT_THRESHOLD &&
    typeof storeUrl === 'string' &&
    storeUrl !== ''
  );
}

/**
 * The lifecycle after a rating event. Only a pending prompt moves; every
 * other state is final.
 *
 * @param {object} lifecycle A normalized lifecycle.
 * @param {string} event A RatingEvent value.
 * @param {number} now Epoch ms.
 * @returns {object} A new lifecycle (or the same one when nothing changes).
 * @throws {Error} On an unknown event.
 */
export function nextRatingState(lifecycle, event, now) {
  if (!Object.values(RatingEvent).includes(event)) {
    throw new Error(`nextRatingState: unknown rating event "${event}"`);
  }
  const prompt = lifecycle.ratingPrompt;
  if (prompt.state !== RatingState.PENDING) {
    return lifecycle;
  }

  let next;
  if (event === RatingEvent.SHOWN) {
    const shownCount = prompt.shownCount + 1;
    next =
      shownCount >= RATING_PROMPT_MAX_SHOWS
        ? { state: RatingState.EXPIRED, shownCount, resolvedAt: now }
        : { ...prompt, shownCount };
  } else {
    const state = event === RatingEvent.RATED ? RatingState.RATED : RatingState.DISMISSED;
    next = { ...prompt, state, resolvedAt: now };
  }
  return { ...lifecycle, ratingPrompt: next };
}

/**
 * @param {string} browserId A BrowserId value.
 * @returns {string|null} That browser's store reviews page, or null when it
 *   is not known yet (the prompt is then hidden).
 * @throws {Error} On an unknown browser.
 */
export function storeReviewUrl(browserId) {
  if (!Object.hasOwn(STORE_REVIEW_URL, browserId)) {
    throw new Error(`storeReviewUrl: unknown browser "${browserId}"`);
  }
  return STORE_REVIEW_URL[browserId];
}
