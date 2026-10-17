/**
 * Fixture: 100 typical v3 sites, as defined in the plan (G5-A fixtures).
 *
 * Each has a UUID-shaped id, a 15-character pattern, `displayName: null`,
 * `addedAt` set, `order` 0-99, and overrides holding one 140-character ASCII
 * reason and a 60-character https destination. Deterministic, so a failing
 * quota test fails the same way every run.
 */

const ADDED_AT = 1_760_000_000_000;
const SITE_COUNT = 100;
const REASON_CHARS = 140;
const TARGET_CHARS = 60;

/**
 * @param {number} i
 * @returns {string} A UUID-shaped id unique to the index.
 */
function fixtureId(i) {
  const hex = i.toString(16).padStart(12, '0');
  return `0f1e2d3c-4b5a-4697-8877-${hex}`;
}

/**
 * @param {number} i
 * @returns {string} A 15-character pattern, e.g. "site-0042.co.il".
 */
function fixturePattern(i) {
  return `site-${String(i).padStart(4, '0')}.co.il`;
}

/**
 * @param {number} i
 * @returns {string} A 60-character https URL.
 */
function fixtureTarget(i) {
  const prefix = `https://read-${String(i).padStart(3, '0')}.example/`;
  return `${prefix}${'a'.repeat(TARGET_CHARS - prefix.length)}`;
}

/**
 * @returns {object[]} 100 fresh site records.
 */
export function sitesTypical() {
  return Array.from({ length: SITE_COUNT }, (_, i) => ({
    id: fixtureId(i),
    pattern: fixturePattern(i),
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: ADDED_AT + i,
    order: i,
    overrides: {
      reasons: [`Reason ${String(i).padStart(3, '0')}: `.padEnd(REASON_CHARS, 'x')],
      target: fixtureTarget(i),
    },
  }));
}

export const TYPICAL = Object.freeze({ SITE_COUNT, REASON_CHARS, TARGET_CHARS, PATTERN_CHARS: 15 });
