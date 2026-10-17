/**
 * Sites onboarding offers as one-tap chips, grouped by category.
 *
 * None is preselected: the user picks the sites they open on autopilot.
 * Pure: the selection is normalized here and sent to the worker as one
 * ADD_SITES write.
 */

import { normalizePattern } from './rules.js';

/** @param {string} id @param {string} label @param {string[]} hosts */
const group = (id, label, hosts) => Object.freeze({ id, label, hosts: Object.freeze(hosts) });

/** Every chip, by category, in display order. Each host is already normalized. */
export const PRESETS = Object.freeze([
  group('social', 'Social', ['facebook.com', 'instagram.com', 'x.com', 'tiktok.com', 'reddit.com']),
  group('news', 'News', ['cnn.com', 'nytimes.com', 'bbc.com', 'theguardian.com', 'foxnews.com']),
  group('video', 'Video', ['youtube.com', 'netflix.com', 'twitch.tv']),
  group('shopping', 'Shopping', ['amazon.com', 'ebay.com', 'aliexpress.com', 'temu.com', 'etsy.com']),
]);

/**
 * @returns {string[]} Every preset host, in display order.
 */
export function presetHosts() {
  return PRESETS.flatMap((entry) => entry.hosts);
}

/**
 * The sites onboarding will add: the chosen chips, then the typed hosts,
 * normalized, without duplicates.
 *
 * @param {string[]} chips Preset hosts the user picked.
 * @param {string[]} typedHosts What the user typed, raw.
 * @returns {string[]} Normalized hosts.
 * @throws {Error} On a chip that is not a preset, or a typed value that is
 *   not a domain.
 */
export function normalizeOnboardingSelection(chips, typedHosts) {
  if (!Array.isArray(chips)) {
    throw new Error(`normalizeOnboardingSelection: chips must be a list of preset hosts, got ${typeof chips}`);
  }
  if (!Array.isArray(typedHosts)) {
    throw new Error(`normalizeOnboardingSelection: typedHosts must be a list, got ${typedHosts}`);
  }
  const known = new Set(presetHosts());
  for (const chip of chips) {
    if (!known.has(chip)) {
      throw new Error(`normalizeOnboardingSelection: "${chip}" is not a preset site`);
    }
  }
  return [...new Set([...chips, ...typedHosts.map(normalizePattern)])];
}
