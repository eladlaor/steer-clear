/**
 * Rule state: rebuilding the dynamic rule set, granting and ending
 * bypasses, and starting and ending a snooze.
 *
 * The worker is the sole owner of declarativeNetRequest dynamic rules. Rules
 * are always derivable from storage (config, bypasses, host permissions), so
 * a full rebuild is always safe and cannot drift.
 *
 * Every rule-table change, and every change to the session state rules are
 * derived from (bypasses, lifted rules, snooze), runs through one queue. Two
 * rebuilds that overlap would share one snapshot of the installed rules and
 * fail on duplicate ids, or the one that read older storage would finish
 * last and win; two bypass edits that overlap would write back a stale map.
 * The exported functions queue; the `...Now` helpers they call do not, and
 * must only run inside the queue.
 */

import { BYPASS_ALARM_PREFIX, SCHEDULE_ALARM, SNOOZE_ALARM, StorageKey } from '../constants.js';
import { readConfig } from './config.js';
import { buildRules, findMatchingSite, normalizePattern } from './rules.js';
import { nextScheduleBoundary } from './schedule.js';
import { defaultSettings, resolveSettings } from './settings_schema.js';
import { mergeLiftedRules, ruleIdsMatchingUrl } from './degraded.js';
import { grantedHostsAmong } from './permissions.js';
import { bypassExpiresAt } from './bypass_tabs.js';
import { endBypassBadges, returnExpiredTabs, showBypassBadge } from './bypass_badges.js';
import { snoozeEndsAt } from './snooze.js';
import { createCoalescedTask, createSerialQueue } from './serial_queue.js';
import { syncTimezoneWatch } from './timezone_watch.js';

/** The one queue for rule-table and rule-state changes. */
const ruleQueue = createSerialQueue();

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
 * @returns {Promise<number|null>} When the stored snooze ends (possibly
 *   already past), or null when none is stored.
 */
export async function readSnoozedUntil() {
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
  await syncTimezoneWatch(when !== null, now);
  return when;
}

/**
 * Rebuild the entire dynamic rule set from storage. Runs only inside
 * ruleQueue.
 *
 * Full replacement rather than diffing: the rule count is small (one per
 * site) and a full rebuild cannot drift out of sync with storage.
 *
 * @returns {Promise<void>}
 */
async function rebuildNow() {
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
 * Rebuild the rule set from storage, queued behind every other rule change.
 * Calls made while a rebuild is still waiting share it: it has not read
 * storage yet, so it sees what each of them wanted.
 *
 * @returns {Promise<void>}
 */
export const rebuildRules = createCoalescedTask(ruleQueue, rebuildNow);

/**
 * Browser startup: session bypasses, lifted rules and a snooze are gone by
 * definition, so their leftovers are cleared, then the rules rebuilt.
 *
 * @returns {Promise<void>}
 */
export function resetSessionRules() {
  return ruleQueue.run(async () => {
    try {
      await chrome.storage.session.remove([
        StorageKey.BYPASSES,
        StorageKey.BADGED_TABS,
        StorageKey.LIFTED_RULES,
        StorageKey.SNOOZE,
      ]);
      await chrome.alarms.clear(SNOOZE_ALARM);
      await rebuildNow();
    } catch (error) {
      console.error('[steer-clear] resetSessionRules failed', { error: error.message });
      throw error;
    }
  });
}

/**
 * @returns {Promise<Object<string, Array<object>>>} Host to the rules a
 *   degraded bypass lifted.
 */
async function readLiftedRules() {
  const stored = await chrome.storage.session.get(StorageKey.LIFTED_RULES);
  return stored[StorageKey.LIFTED_RULES] ?? {};
}

/**
 * Store a bypass's expiry and set the alarm that ends it.
 *
 * @param {string} host
 * @param {number} expiresAt
 */
async function storeBypass(host, expiresAt) {
  const bypasses = await readActiveBypasses();
  bypasses[host] = expiresAt;
  await chrome.storage.session.set({ [StorageKey.BYPASSES]: bypasses });
  // An alarm reinstates the rule when the pass expires; without it the rule
  // would stay absent until the next unrelated rebuild.
  await chrome.alarms.create(`${BYPASS_ALARM_PREFIX}${host}`, { when: expiresAt });
}

/**
 * Continue when the settings cannot be read: no rebuild is possible, so lift
 * the installed rules that match the host directly, and keep them in session
 * storage so the bypass's end can put them back.
 *
 * @param {string} rawHost The host the pause page was reached for.
 * @param {number|undefined} tabId
 * @returns {Promise<{expiresAt: number}>}
 */
async function grantDegradedBypass(rawHost, tabId) {
  const host = normalizePattern(rawHost);
  const expiresAt = bypassExpiresAt(Date.now(), defaultSettings().bypassMinutes);

  const installed = await chrome.declarativeNetRequest.getDynamicRules();
  const ids = ruleIdsMatchingUrl(installed, `https://${host}/`);
  const lifted = installed.filter((rule) => ids.includes(rule.id));

  const liftedRules = await readLiftedRules();
  liftedRules[host] = mergeLiftedRules(liftedRules[host] ?? [], lifted);
  await chrome.storage.session.set({ [StorageKey.LIFTED_RULES]: liftedRules });
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids });
  await storeBypass(host, expiresAt);
  await showBypassBadge(host, null, expiresAt, tabId);

  console.error('[steer-clear] degraded bypass granted: settings unreadable, matching rules lifted directly', {
    host,
    expiresAt,
    liftedRuleIds: ids,
  });
  return { expiresAt };
}

/**
 * Put back the rules a degraded bypass lifted, when a rebuild still fails at
 * its end.
 *
 * @param {Array<object>} lifted
 */
async function restoreLiftedRules(lifted) {
  const ids = lifted.map((rule) => rule.id);
  await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: ids, addRules: lifted });
}

/**
 * Grant a time-boxed bypass for a host, removing its rule until expiry.
 *
 * If the settings cannot be read, continue still works (degraded): the rules
 * matching the host are lifted directly and the error is logged.
 *
 * @param {string} rawHost The host the pause page was reached for.
 * @param {number|undefined} tabId The pause page's tab, which gets the badge.
 * @returns {Promise<{expiresAt: number}>}
 */
export function grantBypass(rawHost, tabId) {
  return ruleQueue.run(() => grantBypassNow(rawHost, tabId));
}

/** grantBypass's body, inside ruleQueue. */
async function grantBypassNow(rawHost, tabId) {
  try {
    let config;
    try {
      config = await readConfig();
    } catch (error) {
      console.error('[steer-clear] settings unreadable; granting a degraded bypass', {
        host: rawHost,
        error: error.message,
      });
      return await grantDegradedBypass(rawHost, tabId);
    }

    // Key the bypass on the *configured* pattern, not the requested host.
    // Rules are keyed on what the user typed ("facebook.com"); the pause page
    // reports where the browser went ("www.facebook.com"). Keying on the
    // latter would never lift the rule and bounce the user straight back.
    const site = findMatchingSite(config, `https://${rawHost}/`);
    const host = site ? normalizePattern(site.pattern) : normalizePattern(rawHost);
    const expiresAt = bypassExpiresAt(Date.now(), config.defaults.bypassMinutes);

    await storeBypass(host, expiresAt);
    await rebuildNow();
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
 * A degraded bypass (granted while the settings were unreadable) puts back
 * the rules it lifted if a rebuild still fails; once the settings read
 * again, the rebuild alone restores everything.
 *
 * @param {string} host The bypassed host (the alarm's suffix).
 * @returns {Promise<void>}
 */
export function expireBypass(host) {
  return ruleQueue.run(() => expireBypassNow(host));
}

/** expireBypass's body, inside ruleQueue. */
async function expireBypassNow(host) {
  try {
    const bypasses = await readActiveBypasses();
    delete bypasses[host];
    await chrome.storage.session.set({ [StorageKey.BYPASSES]: bypasses });

    const liftedRules = await readLiftedRules();
    const lifted = liftedRules[host];
    delete liftedRules[host];
    await chrome.storage.session.set({ [StorageKey.LIFTED_RULES]: liftedRules });

    try {
      await rebuildNow();
    } catch (error) {
      await endBypassBadges(host, bypasses);
      if (!lifted) throw error;
      await restoreLiftedRules(lifted);
      console.error('[steer-clear] settings still unreadable at bypass end; lifted rules restored', {
        host,
        restoredRuleIds: lifted.map((rule) => rule.id),
        error: error.message,
      });
      return;
    }
    await endBypassBadges(host, bypasses);

    const config = await readConfig();
    if (config.defaults.returnPauseOnExpiry) {
      await returnExpiredTabs(config, host, bypasses, { snoozedUntil: await readSnoozedUntil(), now: Date.now() });
    }
    console.info('[steer-clear] bypass expired', { host, returnPause: config.defaults.returnPauseOnExpiry });
  } catch (error) {
    console.error('[steer-clear] expireBypass failed', { host, error: error.message });
    throw error;
  }
}

/**
 * Turn every reminder off for a while: store the end in session storage (so
 * a browser restart ends it), set an alarm for the end, and rebuild.
 *
 * @param {number} minutes One of SNOOZE_OPTIONS_MINUTES.
 * @returns {Promise<{until: number}>}
 */
export function startSnooze(minutes) {
  return ruleQueue.run(async () => {
    try {
      const until = snoozeEndsAt(minutes, Date.now());
      await chrome.storage.session.set({ [StorageKey.SNOOZE]: { until } });
      await chrome.alarms.create(SNOOZE_ALARM, { when: until });
      await rebuildNow();
      console.info('[steer-clear] snooze started', { minutes, until });
      return { until };
    } catch (error) {
      console.error('[steer-clear] startSnooze failed', { minutes, error: error.message });
      throw error;
    }
  });
}

/**
 * End a snooze ("Resume now", or its alarm) and bring the reminders back.
 *
 * @returns {Promise<void>}
 */
export function endSnooze() {
  return ruleQueue.run(async () => {
    try {
      await chrome.storage.session.remove(StorageKey.SNOOZE);
      await chrome.alarms.clear(SNOOZE_ALARM);
      await rebuildNow();
      console.info('[steer-clear] snooze ended');
    } catch (error) {
      console.error('[steer-clear] endSnooze failed', { error: error.message });
      throw error;
    }
  });
}
