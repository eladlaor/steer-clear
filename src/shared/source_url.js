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

/** Starts a URL fragment. */
const FRAGMENT_MARKER = '#';

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
    // An encoded value has its own '#' escaped, so a raw '#' can only be the
    // original fragment the browser re-attached after the redirect. It was
    // never encoded, so it must not be decoded.
    const hashAt = raw.indexOf(FRAGMENT_MARKER);
    const encoded = hashAt === -1 ? raw : raw.slice(0, hashAt);
    const fragment = hashAt === -1 ? '' : raw.slice(hashAt);
    try {
      candidate = decodeURIComponent(encoded) + fragment;
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
