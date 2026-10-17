/**
 * Rule state: rebuilding the dynamic rule set, and granting and ending
 * bypasses.
 *
 * The worker is the sole owner of declarativeNetRequest dynamic rules. Rules
 * are always derivable from storage (config, bypasses, host permissions), so
 * a full rebuild is always safe and cannot drift.
 */

import { BYPASS_ALARM_PREFIX, SCHEDULE_ALARM, StorageKey } from '../constants.js';
import { readConfig } from './config.js';
import { buildRules, findMatchingSite, normalizePattern } from './rules.js';
import { nextScheduleBoundary } from './schedule.js';
import { resolveSettings } from './settings_schema.js';
import { grantedHostsAmong } from './permissions.js';
import { bypassExpiresAt } from './bypass_tabs.js';
import { endBypassBadges, returnExpiredTabs, showBypassBadge } from './bypass_badges.js';

/**
 * Read the currently-active bypasses, dropping any that have expired.
 *
 * @param {number} [now] Epoch ms.
 * @returns {Promise<Object<string, number>>} Map of host to expiry epoch ms.
 */
export async function readActiveBypasses(now = Date.now()) {
  try {
    const stored = await chrome.storage.session.get(StorageKey.BYPASSES);
    const bypasses = stored[StorageKey.BYPASSES] ?? {};
    return Object.fromEntries(Object.entries(bypasses).filter(([, expiry]) => expiry > now));
  } catch (error) {
    console.error('[steer-clear] readActiveBypasses failed', { error: error.message });
    throw error;
  }
}

/**
 * @returns {Promise<number|null>} When the running snooze ends, or null.
 */
async function readSnoozedUntil() {
  try {
    const stored = await chrome.storage.session.get(StorageKey.SNOOZE);
    return stored[StorageKey.SNOOZE]?.until ?? null;
  } catch (error) {
    console.error('[steer-clear] readSnoozedUntil failed', { error: error.message });
    throw error;
  }
}

/**
 * Point the schedule alarm at the next moment any enabled site's schedule
 * starts or ends, so the rules change then without user action; clear it
 * when every schedule is always on.
 *
 * @param {object} config
 * @param {number} now Epoch ms.
 * @returns {Promise<number|null>} The alarm time, or null.
 */
async function syncScheduleAlarm(config, now) {
  const schedules = config.sites
    .filter((site) => site.enabled)
    .map((site) => resolveSettings(config.defaults, site).schedule);
  const when = nextScheduleBoundary(schedules, now);
  if (when === null) {
    await chrome.alarms.clear(SCHEDULE_ALARM);
  } else {
    await chrome.alarms.create(SCHEDULE_ALARM, { when });
  }
  return when;
}

/**
 * Rebuild the entire dynamic rule set from storage.
 *
 * Full replacement rather than diffing: the rule count is small (one per
 * site) and a full rebuild cannot drift out of sync with storage.
 *
 * @returns {Promise<void>}
 */
export async function rebuildRules() {
  try {
    const now = Date.now();
    const [config, bypasses, snoozedUntil] = await Promise.all([
      readConfig(),
      readActiveBypasses(now),
      readSnoozedUntil(),
    ]);
    const bypassedHosts = new Set(Object.keys(bypasses));

    // Only sites the user has granted access to can be redirected. Keeping
    // un-permitted sites out of the table avoids rules the browser would
    // quietly refuse to apply.
    const configuredHosts = config.sites
      .map((site) => {
        try {
          return normalizePattern(site.pattern);
        } catch {
          return null;
        }
      })
      .filter((host) => host !== null);
    const grantedHosts = await grantedHostsAmong(configuredHosts);

    const newRules = buildRules(config, chrome.runtime.getURL(''), { bypassedHosts, grantedHosts, snoozedUntil, now });
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map((rule) => rule.id),
      addRules: newRules,
    });
    const nextScheduleChange = await syncScheduleAlarm(config, now);

    console.info('[steer-clear] rules rebuilt', {
      ruleCount: newRules.length,
      bypassedCount: bypassedHosts.size,
      configuredCount: configuredHosts.length,
      ungrantedCount: configuredHosts.length - grantedHosts.size,
      snoozedUntil,
      nextScheduleChange,
    });
  } catch (error) {
    console.error('[steer-clear] rebuildRules failed', { error: error.message });
    throw error;
  }
}

/**
 * Grant a time-boxed bypass for a host, removing its rule until expiry.
 *
 * @param {string} rawHost The host the pause page was reached for.
 * @param {number|undefined} tabId The pause page's tab, which gets the badge.
 * @returns {Promise<{expiresAt: number}>}
 */
export async function grantBypass(rawHost, tabId) {
  try {
    // Key the bypass on the *configured* pattern, not the requested host.
    // Rules are keyed on what the user typed ("facebook.com"); the pause page
    // reports where the browser went ("www.facebook.com"). Keying on the
    // latter would never lift the rule and bounce the user straight back.
    const config = await readConfig();
    const site = findMatchingSite(config, `https://${rawHost}/`);
    const host = site ? normalizePattern(site.pattern) : normalizePattern(rawHost);
    const expiresAt = bypassExpiresAt(Date.now(), config.defaults.bypassMinutes);

    const bypasses = await readActiveBypasses();
    bypasses[host] = expiresAt;
    await chrome.storage.session.set({ [StorageKey.BYPASSES]: bypasses });

    // An alarm reinstates the rule when the pass expires; without it the rule
    // would stay absent until the next unrelated rebuild.
    await chrome.alarms.create(`${BYPASS_ALARM_PREFIX}${host}`, { when: expiresAt });
    await rebuildRules();
    await showBypassBadge(host, site, expiresAt, tabId);

    console.info('[steer-clear] bypass granted', { host, expiresAt, bypassMinutes: config.defaults.bypassMinutes });
    return { expiresAt };
  } catch (error) {
    console.error('[steer-clear] grantBypass failed', { host: rawHost, error: error.message });
    throw error;
  }
}

/**
 * End a host's bypass: reinstate its rule, clear its badges and, when the
 * user opted in, send its open tabs back to the pause page.
 *
 * @param {string} host The bypassed host (the alarm's suffix).
 * @returns {Promise<void>}
 */
export async function expireBypass(host) {
  try {
    const bypasses = await readActiveBypasses();
    delete bypasses[host];
    await chrome.storage.session.set({ [StorageKey.BYPASSES]: bypasses });
    await rebuildRules();
    await endBypassBadges(host, bypasses);

    const config = await readConfig();
    if (config.defaults.returnPauseOnExpiry) {
      await returnExpiredTabs(config, host, bypasses);
    }
    console.info('[steer-clear] bypass expired', { host, returnPause: config.defaults.returnPauseOnExpiry });
  } catch (error) {
    console.error('[steer-clear] expireBypass failed', { host, error: error.message });
    throw error;
  }
}
