/**
 * What goes into a store zip, and a check of what actually went in.
 *
 * Pure: no filesystem access — unit-tested in tests/unit/package_rules.test.js.
 */

import {
  EXCLUDED_FILE_NAMES,
  EXCLUDED_FILE_SUFFIXES,
  MANIFEST_FILE_NAME,
} from './tool_constants.mjs';

/**
 * The last segment of a relative path, whichever separator it uses.
 *
 * @param {string} path
 * @returns {string}
 */
function baseName(path) {
  return path.split(/[\\/]/).at(-1);
}

/**
 * Whether a path under src/ belongs in the package.
 *
 * @param {string} relativePath Path relative to src/; '' is src/ itself.
 * @returns {boolean}
 */
export function isPackagedPath(relativePath) {
  const name = baseName(relativePath).toLowerCase();
  if (EXCLUDED_FILE_NAMES.some((excluded) => excluded.toLowerCase() === name)) {
    return false;
  }
  return !EXCLUDED_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix));
}

/**
 * Every reason a zip listing would be rejected by a store or ships a stray file.
 *
 * @param {string[]} entries Paths inside the zip, as `unzip -Z1` prints them.
 * @returns {string[]} Human-readable problems; empty when the zip is correct.
 */
export function zipListingProblems(entries) {
  if (!Array.isArray(entries)) {
    throw new Error(`[build] zipListingProblems: expected an array of zip entries, got ${typeof entries}`);
  }

  const problems = [];

  if (!entries.includes(MANIFEST_FILE_NAME)) {
    problems.push(`${MANIFEST_FILE_NAME} is not at the zip root`);
  }

  for (const entry of entries) {
    if (!isPackagedPath(entry.replace(/\/$/, ''))) {
      problems.push(`excluded file in zip: ${entry}`);
    }
  }

  return problems;
}
