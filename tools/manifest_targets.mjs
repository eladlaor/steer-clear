/**
 * Per-browser manifests derived from the single cross-browser src/manifest.json.
 *
 * The source manifest carries both background keys and the Firefox settings,
 * so it loads unpacked in either browser. Each store gets a copy without the
 * other browser's keys, which keeps both stores' validators free of warnings.
 *
 * Pure: no filesystem access — unit-tested in tests/unit/build_manifest.test.js.
 */

import { BuildTarget } from './tool_constants.mjs';

/**
 * Throw unless `background[key]` is present, naming the target that needs it.
 *
 * @param {object} manifest
 * @param {string} key
 * @param {string} target
 */
function requireBackgroundKey(manifest, key, target) {
  if (manifest.background?.[key] === undefined) {
    throw new Error(`[build] deriveManifest: the ${target} target needs background.${key}, which the base manifest lacks`);
  }
}

/**
 * Derive the manifest for one store package.
 *
 * - chrome (also Edge): drops `browser_specific_settings` and `background.scripts`.
 * - firefox: drops `background.service_worker` and `minimum_chrome_version`.
 *
 * @param {object} base The parsed src/manifest.json. Not mutated.
 * @param {string} target A BuildTarget value.
 * @returns {object} A new manifest object sharing nothing with `base`.
 */
export function deriveManifest(base, target) {
  if (base === null || typeof base !== 'object' || Array.isArray(base)) {
    throw new Error(`[build] deriveManifest: expected a manifest object, got ${base === null ? 'null' : typeof base}`);
  }

  const derived = structuredClone(base);

  switch (target) {
    case BuildTarget.CHROME:
      requireBackgroundKey(base, 'service_worker', target);
      delete derived.browser_specific_settings;
      delete derived.background.scripts;
      return derived;

    case BuildTarget.FIREFOX:
      requireBackgroundKey(base, 'scripts', target);
      delete derived.background.service_worker;
      delete derived.minimum_chrome_version;
      return derived;

    default:
      throw new Error(
        `[build] deriveManifest: unknown target "${target}"; expected one of ${Object.values(BuildTarget).join(', ')}`
      );
  }
}
