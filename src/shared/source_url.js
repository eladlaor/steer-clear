/**
 * Reading the originally-requested URL from the reminder page's address.
 *
 * The redirect rule substitutes the whole matched URL after `?from=`. Neither
 * Chrome nor Firefox documents whether that substitution is percent-encoded.
 * If it is not, URLSearchParams would cut the value at its first `&` and lose
 * its `#fragment` (which lands in the reminder page's own hash). So this takes
 * everything after the marker and decodes it only when it arrives encoded.
 *
 * Pure: no DOM, no chrome.* — unit-tested in Node.
 */

import { PARAM_FROM, SOURCE_URL_PROTOCOLS } from '../constants.js';

/** The marker the redirect rule writes, directly after the page path. */
const FROM_MARKER = `?${PARAM_FROM}=`;

/** An encoded value starts with an http(s) scheme whose colon is escaped. */
const ENCODED_SCHEME = /^https?%3A/i;

/**
 * Extract the original http(s) URL from the reminder page's href.
 *
 * @param {string} href The reminder page's full href, hash included.
 * @returns {string|null} The source URL exactly as requested, or null when it
 *   is missing, malformed, or not http(s).
 */
export function extractSourceUrl(href) {
  if (typeof href !== 'string') {
    throw new TypeError(`extractSourceUrl: expected the page href as a string, got ${typeof href}`);
  }

  const start = href.indexOf(FROM_MARKER);
  if (start === -1) {
    return null;
  }

  const raw = href.slice(start + FROM_MARKER.length);
  if (raw === '') {
    return null;
  }

  let candidate = raw;
  if (ENCODED_SCHEME.test(raw)) {
    try {
      candidate = decodeURIComponent(raw);
    } catch {
      // Malformed escapes: not a URL the redirect could have produced.
      return null;
    }
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  return SOURCE_URL_PROTOCOLS.includes(parsed.protocol) ? candidate : null;
}
