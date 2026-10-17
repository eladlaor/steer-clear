/**
 * The visible end of a bypass: a per-tab toolbar badge with the minutes left,
 * refreshed every minute, and the opt-in return of the pause page.
 *
 * Tabs are found with `tabs.query({ url })`, which returns a tab's URL only
 * for sites the extension already has host access to — exactly the sites
 * with a rule. No `tabs` permission is needed and nothing about a tab is
 * stored except its id, in session storage, until the badge is cleared.
 *
 * Badges are a side observation: a failure here is logged and never blocks
 * the continue the user asked for. Firefox for Android has no toolbar badge.
 */

import {
  BADGE_BACKGROUND_COLOR,
  BYPASS_TICK_ALARM,
  BYPASS_TICK_MINUTES,
  StorageKey,
} from '../constants.js';
import { normalizePattern } from './rules.js';
import { badgeText, expiredTabs, pausePageUrl, tabQueryPattern, tabsOnSite } from './bypass_tabs.js';

/**
 * @returns {boolean} Whether this browser shows a toolbar badge.
 */
function badgeSupported() {
  return typeof chrome.action?.setBadgeText === 'function';
}

/**
 * Set one tab's badge. A tab closed since it was recorded is expected.
 *
 * @param {number} tabId
 * @param {string} text '' clears it.
 */
async function setTabBadge(tabId, text) {
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text !== '') {
      await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_BACKGROUND_COLOR });
    }
  } catch (error) {
    console.warn('[steer-clear] badge not updated; the tab is likely closed', { tabId, error: error.message });
  }
}

/**
 * @returns {Promise<Object<string, number[]>>} Host to badged tab ids.
 */
async function readBadgedTabs() {
  const stored = await chrome.storage.session.get(StorageKey.BADGED_TABS);
  return stored[StorageKey.BADGED_TABS] ?? {};
}

/**
 * @param {object} config
 * @param {string} host
 * @returns {object|null} The listed site behind a bypassed host.
 */
function listedSite(config, host) {
  return (
    config.sites.find((site) => {
      try {
        return normalizePattern(site.pattern) === host;
      } catch {
        return false;
      }
    }) ?? null
  );
}

/**
 * The listed site behind a bypassed host, or a stand-in matching the host
 * and its subdomains when the site was removed mid-bypass (its badges still
 * need clearing).
 *
 * @param {object} config
 * @param {string} host
 * @returns {object}
 */
function siteForHost(config, host) {
  return listedSite(config, host) ?? { pattern: host, includeSubdomains: true, enabled: true };
}

/**
 * @param {object} site
 * @returns {Promise<Array<{id: number, url: string}>>} Tabs on the site.
 */
async function queryTabsOnSite(site) {
  return tabsOnSite(await chrome.tabs.query({ url: tabQueryPattern(site) }), site);
}

/**
 * Badge every tab on a freshly bypassed site, plus the pause page's own tab
 * (about to navigate there), and start the per-minute refresh.
 *
 * @param {string} host
 * @param {object|null} site The matched site, if any.
 * @param {number} expiresAt
 * @param {number|undefined} tabId The pause page's tab.
 * @returns {Promise<void>}
 */
export async function showBypassBadge(host, site, expiresAt, tabId) {
  if (!badgeSupported()) {
    console.info('[steer-clear] no toolbar badge on this browser; bypass time is not shown');
    return;
  }
  try {
    const tabs = await queryTabsOnSite(site ?? { pattern: host, includeSubdomains: true });
    const ids = new Set(tabs.map((tab) => tab.id));
    if (Number.isInteger(tabId)) ids.add(tabId);

    const text = badgeText(expiresAt, Date.now());
    await Promise.all([...ids].map((id) => setTabBadge(id, text)));

    const badged = await readBadgedTabs();
    badged[host] = [...new Set([...(badged[host] ?? []), ...ids])];
    await chrome.storage.session.set({ [StorageKey.BADGED_TABS]: badged });
    await chrome.alarms.create(BYPASS_TICK_ALARM, { periodInMinutes: BYPASS_TICK_MINUTES });
  } catch (error) {
    console.error('[steer-clear] showBypassBadge failed; continuing', { host, error: error.message });
  }
}

/**
 * Re-render every bypass badge: minutes left on tabs still on a bypassed
 * site, cleared on tabs that left it. Runs on the tick alarm and when a tab
 * finishes loading (Firefox resets a tab's badge on navigation).
 *
 * @param {object} config The assembled config.
 * @param {Object<string, number>} bypasses Active bypasses.
 * @param {number} now Epoch ms.
 * @returns {Promise<void>}
 */
export async function refreshBadges(config, bypasses, now) {
  if (!badgeSupported()) return;
  try {
    const badged = await readBadgedTabs();
    const next = {};
    for (const host of new Set([...Object.keys(bypasses), ...Object.keys(badged)])) {
      const text = bypasses[host] ? badgeText(bypasses[host], now) : '';
      const onSite = text === '' ? [] : (await queryTabsOnSite(siteForHost(config, host))).map((tab) => tab.id);
      await Promise.all(onSite.map((id) => setTabBadge(id, text)));
      const left = (badged[host] ?? []).filter((id) => !onSite.includes(id));
      await Promise.all(left.map((id) => setTabBadge(id, '')));
      if (onSite.length > 0) next[host] = onSite;
    }
    await chrome.storage.session.set({ [StorageKey.BADGED_TABS]: next });
    if (Object.keys(bypasses).length === 0) {
      await chrome.alarms.clear(BYPASS_TICK_ALARM);
    }
  } catch (error) {
    console.error('[steer-clear] refreshBadges failed; continuing', { error: error.message });
  }
}

/**
 * Clear a host's badges when its bypass ends, and stop the refresh when no
 * bypass remains.
 *
 * @param {string} host
 * @param {Object<string, number>} remaining Bypasses still active.
 * @returns {Promise<void>}
 */
export async function endBypassBadges(host, remaining) {
  try {
    if (badgeSupported()) {
      const badged = await readBadgedTabs();
      await Promise.all((badged[host] ?? []).map((id) => setTabBadge(id, '')));
      delete badged[host];
      await chrome.storage.session.set({ [StorageKey.BADGED_TABS]: badged });
    }
    if (Object.keys(remaining).length === 0) {
      await chrome.alarms.clear(BYPASS_TICK_ALARM);
    }
  } catch (error) {
    console.error('[steer-clear] endBypassBadges failed; continuing', { host, error: error.message });
  }
}

/**
 * Send every tab still on a site whose bypass ended back to the pause page.
 * The tab's current URL is read now and passed only in the pause page's
 * address; nothing is stored.
 *
 * @param {object} config The assembled config.
 * @param {string} host The host whose bypass ended.
 * @param {Object<string, number>} bypasses Bypasses still active.
 * @returns {Promise<void>}
 */
export async function returnExpiredTabs(config, host, bypasses) {
  const site = listedSite(config, host);
  if (!site?.enabled) {
    console.info('[steer-clear] not returning tabs: the site is no longer listed or is turned off', { host });
    return;
  }
  const tabs = expiredTabs(await chrome.tabs.query({ url: tabQueryPattern(site) }), site, bypasses, Date.now());
  const base = chrome.runtime.getURL('');
  await Promise.all(tabs.map((tab) => chrome.tabs.update(tab.id, { url: pausePageUrl(base, tab.url) })));
  console.info('[steer-clear] returned tabs to the pause page', { host, tabCount: tabs.length });
}
