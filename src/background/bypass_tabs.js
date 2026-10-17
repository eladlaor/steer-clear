/**
 * Pure helpers for a running bypass: which tabs are on the site, what the
 * toolbar badge says, and which tabs to send back when it ends.
 *
 * Redirect rules only catch network requests. Single-page sites (Reddit,
 * YouTube, X) change pages without one, so lifting and reinstating a rule
 * never ends a bypass in an open tab. The badge makes the end visible; the
 * opt-in return makes it real.
 *
 * No chrome.* here — the worker passes in the tabs it queried.
 */

import {
  BADGE_MINUTES_SUFFIX,
  BYPASS_MINUTES_OPTIONS,
  INTERSTITIAL_PATH,
  MS_PER_MINUTE,
  PARAM_FROM,
} from '../constants.js';
import { findMatchingSite, normalizePattern } from './rules.js';

/**
 * The `tabs.query` URL pattern for a site. `*.host` also matches the bare
 * host. Reading the matched tabs' URLs needs only the site's host
 * permission, which every site with a rule already has.
 *
 * @param {{pattern: string, includeSubdomains: boolean}} site
 * @returns {string}
 */
export function tabQueryPattern(site) {
  const host = normalizePattern(site.pattern);
  return site.includeSubdomains ? `*://*.${host}/*` : `*://${host}/*`;
}

/**
 * The tabs currently on a site, using the same matching as the redirect, so
 * lookalike hosts (notreddit.com) are never included.
 *
 * @param {Array<{id: number, url?: string}>} tabs
 * @param {object} site
 * @returns {Array<{id: number, url: string}>}
 */
export function tabsOnSite(tabs, site) {
  // Matching is about the host only; a site disabled mid-bypass still owns
  // the tabs that bypass opened.
  const scope = { sites: [{ ...site, enabled: true }] };
  return tabs.filter((tab) => typeof tab.url === 'string' && findMatchingSite(scope, tab.url) !== null);
}

/**
 * The badge for a bypass: whole minutes left, rounded up ("5m"), or '' once
 * it has ended.
 *
 * @param {number} expiresAt Epoch ms.
 * @param {number} now Epoch ms.
 * @returns {string}
 */
export function badgeText(expiresAt, now) {
  const left = expiresAt - now;
  if (left <= 0) {
    return '';
  }
  return `${Math.ceil(left / MS_PER_MINUTE)}${BADGE_MINUTES_SUFFIX}`;
}

/**
 * Tabs on a site whose bypass has ended, unless a newer bypass for the same
 * site is running.
 *
 * @param {Array<{id: number, url?: string}>} tabs
 * @param {object} site
 * @param {Object<string, number>} activeBypasses Host to expiry, epoch ms.
 * @param {number} now Epoch ms.
 * @returns {Array<{id: number, url: string}>}
 */
export function expiredTabs(tabs, site, activeBypasses, now) {
  const expiry = activeBypasses[normalizePattern(site.pattern)];
  if (expiry !== undefined && expiry > now) {
    return [];
  }
  return tabsOnSite(tabs, site);
}

/**
 * When a bypass granted now ends.
 *
 * @param {number} now Epoch ms.
 * @param {number} bypassMinutes One of BYPASS_MINUTES_OPTIONS.
 * @returns {number} Epoch ms.
 */
export function bypassExpiresAt(now, bypassMinutes) {
  if (!BYPASS_MINUTES_OPTIONS.includes(bypassMinutes)) {
    throw new Error(
      `bypassExpiresAt: bypassMinutes must be one of ${BYPASS_MINUTES_OPTIONS.join(', ')}, got ${bypassMinutes}`
    );
  }
  return now + bypassMinutes * MS_PER_MINUTE;
}

/**
 * The pause page's address for a tab being returned to it. The tab's current
 * URL travels only in this address; nothing is stored.
 *
 * @param {string} extensionBaseUrl `chrome.runtime.getURL('')`.
 * @param {string} sourceUrl The tab's current URL.
 * @returns {string}
 */
export function pausePageUrl(extensionBaseUrl, sourceUrl) {
  return `${extensionBaseUrl}${INTERSTITIAL_PATH}?${PARAM_FROM}=${encodeURIComponent(sourceUrl)}`;
}
