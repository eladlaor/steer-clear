/**
 * One-time lifecycle flags (storage.local `lifecycle`): pure shape and
 * transitions. Written only by the worker, through lifecycle_store.js.
 *
 * These flags describe this device's history with the extension. They are
 * not erased with statistics and never exported.
 */

import { LifecycleEvent, RatingState } from '../constants.js';

/**
 * The stored lifecycle with every documented field present.
 *
 * @param {object|undefined} raw What storage holds, if anything.
 * @returns {{onboardingCompletedAt: number|null, variationNoticeSeenAt: number|null,
 *   ratingPrompt: {state: string, shownCount: number, resolvedAt: number|null}}}
 */
export function normalizeLifecycle(raw) {
  return {
    onboardingCompletedAt: raw?.onboardingCompletedAt ?? null,
    variationNoticeSeenAt: raw?.variationNoticeSeenAt ?? null,
    ratingPrompt: {
      state: raw?.ratingPrompt?.state ?? RatingState.PENDING,
      shownCount: raw?.ratingPrompt?.shownCount ?? 0,
      resolvedAt: raw?.ratingPrompt?.resolvedAt ?? null,
    },
  };
}

/**
 * The lifecycle after an event. Stamps are set once and never moved.
 *
 * @param {object} lifecycle A normalized lifecycle.
 * @param {string} event A LifecycleEvent value.
 * @param {number} now Epoch ms.
 * @returns {object} A new lifecycle object.
 * @throws {Error} On an unknown event.
 */
export function applyLifecycleEvent(lifecycle, event, now) {
  switch (event) {
    case LifecycleEvent.VARIATION_NOTICE_SEEN:
      return { ...lifecycle, variationNoticeSeenAt: lifecycle.variationNoticeSeenAt ?? now };
    default:
      throw new Error(`applyLifecycleEvent: unknown lifecycle event "${event}"`);
  }
}

/**
 * Whether the pause page explains, this once, why it looks different.
 *
 * @param {object} lifecycle A normalized lifecycle.
 * @param {boolean} varyPresentation The resolved setting.
 * @returns {boolean}
 */
export function shouldShowVariationNotice(lifecycle, varyPresentation) {
  return varyPresentation && lifecycle.variationNoticeSeenAt === null;
}
