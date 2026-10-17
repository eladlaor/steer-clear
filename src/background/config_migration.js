/**
 * Read-time migration of the legacy 1.x `config` item into the v3 shape.
 *
 * Pure and deterministic: no chrome.*, no clock, no crypto. It runs in memory
 * on every read while the legacy item is the source, and never writes. The
 * legacy item itself is never modified, so a rollback to 1.x finds it intact.
 *
 * Chain: v1 -> v2 (unchanged from 1.0, including the placeholder cleanup),
 * then v2 -> v3 (`{ defaults, sites }` with per-site `overrides`).
 */

import {
  DEFAULT_AUTO_CONTINUE,
  DEFAULT_COUNTDOWN_SECONDS,
  DEFAULT_TARGET_NAME,
  LEGACY_SCHEMA_VERSION,
  LEGACY_SITE_ID_PREFIX,
} from '../constants.js';
import { defaultSettings } from './settings_schema.js';

/** The placeholder destination name shipped briefly in v2; cleared on read. */
const LEGACY_PLACEHOLDER_TARGET_NAME = 'somewhere better';

/**
 * The id a hand-edited v1 site without one gets. Deterministic, so every
 * device derives the same id and therefore the same `site:<id>` key.
 *
 * @param {number} index The site's position in the legacy list.
 * @param {string} pattern The site's stored pattern.
 * @returns {string}
 */
export function legacyId(index, pattern) {
  return `${LEGACY_SITE_ID_PREFIX}${index}-${String(pattern).trim().toLowerCase()}`;
}

/**
 * v1 -> v2: fill the fields v2 added, and clear the v2 placeholder name.
 *
 * @param {object} stored A v1 or v2 config.
 * @returns {object} A v2 config (new object; the input is not mutated).
 */
function toV2(stored) {
  const v2 = {
    ...stored,
    schemaVersion: LEGACY_SCHEMA_VERSION,
    globalTargetName: stored.globalTargetName ?? DEFAULT_TARGET_NAME,
    globalAutoContinue: stored.globalAutoContinue ?? DEFAULT_AUTO_CONTINUE,
    globalCountdownSeconds: stored.globalCountdownSeconds ?? DEFAULT_COUNTDOWN_SECONDS,
    sites: (stored.sites ?? []).map((site) => ({
      ...site,
      displayName: site.displayName ?? null,
      autoContinue: site.autoContinue ?? null,
      countdownSeconds: site.countdownSeconds ?? null,
    })),
  };
  if (v2.globalTargetName === LEGACY_PLACEHOLDER_TARGET_NAME) {
    v2.globalTargetName = '';
  }
  return v2;
}

/**
 * A v2 note as a v3 reasons list: one trimmed reason, or none when blank.
 *
 * @param {unknown} note
 * @returns {string[]}
 */
function noteToReasons(note) {
  const trimmed = typeof note === 'string' ? note.trim() : '';
  return trimmed === '' ? [] : [trimmed];
}

/**
 * v2 -> v3 for one site. Blank or null per-site values meant "inherit" in v2,
 * so they produce no override key.
 *
 * @param {object} site A v2 site entry.
 * @param {number} index Its position in the legacy list.
 * @returns {object} A v3 site record.
 */
function siteToV3(site, index) {
  const overrides = {};
  if (typeof site.target === 'string' && site.target.trim() !== '') {
    overrides.target = site.target;
  }
  const reasons = noteToReasons(site.note);
  if (reasons.length > 0) {
    overrides.reasons = reasons;
  }
  if (site.autoContinue !== null && site.autoContinue !== undefined) {
    overrides.autoContinue = site.autoContinue;
  }
  if (site.countdownSeconds !== null && site.countdownSeconds !== undefined) {
    overrides.countdownSeconds = site.countdownSeconds;
  }

  return {
    id: site.id || legacyId(index, site.pattern),
    pattern: site.pattern,
    displayName: site.displayName,
    includeSubdomains: site.includeSubdomains,
    enabled: site.enabled,
    addedAt: null,
    order: index,
    overrides,
  };
}

/**
 * Migrate a legacy v1/v2 config to the v3 `{ defaults, sites }` shape.
 *
 * @param {object} stored The legacy `config` item.
 * @returns {{defaults: object, sites: object[]}}
 * @throws {Error} If `stored` is not an object or was written by a newer
 *   version than any 1.x.
 */
export function migrateLegacyConfig(stored) {
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    throw new Error('migrateLegacyConfig: the legacy config must be an object');
  }
  const from = stored.schemaVersion ?? 1;
  if (from > LEGACY_SCHEMA_VERSION) {
    throw new Error(
      `migrateLegacyConfig: legacy config schemaVersion ${from} is newer than ` +
        `${LEGACY_SCHEMA_VERSION}; update the extension`
    );
  }

  const v2 = toV2(stored);
  const defaults = {
    ...defaultSettings(),
    target: v2.globalTarget,
    targetName: v2.globalTargetName,
    reasons: noteToReasons(v2.globalNote),
    autoContinue: v2.globalAutoContinue,
    countdownSeconds: v2.globalCountdownSeconds,
  };

  return { defaults, sites: v2.sites.map(siteToV3) };
}
