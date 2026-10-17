/**
 * Fixture: one v3 site at the input limits in Hebrew (plan G5-A fixtures):
 * five reasons of 280 Hebrew characters each, 2 UTF-8 bytes per character.
 * It must fit the 8,192-byte per-item sync quota.
 */

const REASON_COUNT = 5;
const REASON_CHARS = 280;
/** Hebrew letters, cycled so each reason reads as text rather than one letter. */
const LETTERS = 'אבגדהוזחטיכלמנסעפצקרשת';

/**
 * @param {number} k
 * @returns {string} 280 Hebrew characters.
 */
function hebrewReason(k) {
  return Array.from({ length: REASON_CHARS }, (_, i) => LETTERS[(i + k) % LETTERS.length]).join('');
}

/**
 * @returns {object} A fresh site record.
 */
export function siteHeavyHebrew() {
  return {
    id: '7c3b2a19-0e8d-4c6b-9a5f-3e2d1c0b9a87',
    pattern: 'ynet.co.il',
    displayName: 'חדשות',
    includeSubdomains: true,
    enabled: true,
    addedAt: 1_760_000_000_000,
    order: 0,
    overrides: { reasons: Array.from({ length: REASON_COUNT }, (_, k) => hebrewReason(k)) },
  };
}

export const HEAVY_HEBREW = Object.freeze({ REASON_COUNT, REASON_CHARS });
