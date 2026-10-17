/**
 * Words the settings page's "Your data" panel shows. Pure, so the wording
 * is unit-tested.
 */

/**
 * @param {number} count
 * @returns {string} "no sites", "1 site", "12 sites".
 */
export function sitesCount(count) {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`sitesCount: count must be a whole number from 0, got ${count}`);
  }
  if (count === 0) return 'no sites';
  return `${count} ${count === 1 ? 'site' : 'sites'}`;
}

/**
 * @param {number} current Sites listed now.
 * @param {number} next Sites in the file.
 * @returns {string} The confirmation question.
 */
export function replaceSummary(current, next) {
  return `Replace ${sitesCount(current)} with ${sitesCount(next)}?`;
}

/**
 * @param {string[]} hosts Hosts the file lists more than once.
 * @returns {string} '' when there are none.
 */
export function duplicatesText(hosts) {
  if (hosts.length === 0) return '';
  return `Listed more than once: ${hosts.join(', ')}. You can remove the extra entries after importing.`;
}

/**
 * @param {number} count Imported sites without host access.
 * @returns {string}
 */
export function accessText(count) {
  return count === 1
    ? '1 site needs access before it can pause.'
    : `${sitesCount(count)} need access before they can pause.`;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function exportedText(count) {
  return `Exported ${sitesCount(count)} and your defaults.`;
}

/**
 * @param {number} count
 * @returns {string}
 */
export function importedText(count) {
  return `Imported ${sitesCount(count)} and the file's defaults.`;
}
