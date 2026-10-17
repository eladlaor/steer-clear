/**
 * Which browser the extension is running in.
 *
 * The code keeps the `chrome.*` namespace everywhere (Firefox MV3 returns
 * promises from it), so this is the only browser-specific decision: which
 * store to link to. Pure, so callers pass in what they read from the runtime.
 */

import { BrowserId, EDGE_UA_BRAND, FIREFOX_EXTENSION_SCHEME } from '../constants.js';

/**
 * Identify the browser from the extension's own base URL and the UA brands.
 *
 * @param {{extensionBaseUrl: string,
 *   uaBrands?: Array<{brand: string, version: string}>}} input
 *   `extensionBaseUrl` is `chrome.runtime.getURL('')`; `uaBrands` is
 *   `navigator.userAgentData?.brands` (absent in Firefox).
 * @returns {string} A BrowserId value.
 */
export function detectBrowser({ extensionBaseUrl, uaBrands } = {}) {
  if (typeof extensionBaseUrl !== 'string' || extensionBaseUrl === '') {
    throw new Error(`detectBrowser: extensionBaseUrl must be a non-empty string, got "${extensionBaseUrl}"`);
  }

  if (extensionBaseUrl.startsWith(FIREFOX_EXTENSION_SCHEME)) {
    return BrowserId.FIREFOX;
  }

  const brands = uaBrands ?? [];
  if (!Array.isArray(brands)) {
    throw new Error(`detectBrowser: uaBrands must be a list of {brand, version}, got ${typeof uaBrands}`);
  }

  return brands.some((entry) => entry?.brand === EDGE_UA_BRAND) ? BrowserId.EDGE : BrowserId.CHROME;
}
