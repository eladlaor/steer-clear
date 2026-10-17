/**
 * Steer Clear service worker (an event page in Firefox).
 *
 * Listener registration only. Rule state lives in rule_sync.js, bypass
 * badges in bypass_badges.js, message handling in message_handlers.js.
 *
 * The worker is the sole owner of declarativeNetRequest dynamic rules and
 * the sole writer of the config, so rules are always derivable from storage.
 */

import {
  BYPASS_ALARM_PREFIX,
  BYPASS_TICK_ALARM,
  SCHEDULE_ALARM,
  SNOOZE_ALARM,
  STATS_PRUNE_ALARM,
  StorageArea,
  StorageKey,
  TAB_STATUS_COMPLETE,
} from '../constants.js';
import { readConfig } from './config.js';
import { isSiteKey } from './sync_layout.js';
import { endSnooze, expireBypass, readActiveBypasses, rebuildRules } from './rule_sync.js';
import { handleInstalled } from './install.js';
import { refreshBadges } from './bypass_badges.js';
import { hasBadgeWork } from './bypass_tabs.js';
import { handleMessage } from './message_handlers.js';
import { pruneStoredStats } from './stats_store.js';

/** sync keys whose change can alter the rule set. */
const RULE_INPUT_KEYS = Object.freeze([StorageKey.SCHEMA_MARKER, StorageKey.SETTINGS, StorageKey.CONFIG]);

/** Refresh every bypass badge, if any bypass is running or badged. */
async function refreshAllBadges() {
  const now = Date.now();
  const [config, bypasses] = await Promise.all([readConfig(), readActiveBypasses(now)]);
  await refreshBadges(config, bypasses, now);
}

/**
 * First install opens onboarding and writes nothing; an update opens
 * nothing. install.js logs any failure with its context.
 */
chrome.runtime.onInstalled.addListener((details) => {
  handleInstalled(details).catch(() => {});
});

/**
 * Rebuild on browser startup — session bypasses and a snooze are gone by
 * definition, so their leftovers are cleared too.
 */
chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.storage.session.remove([StorageKey.BYPASSES, StorageKey.BADGED_TABS, StorageKey.SNOOZE]);
    await chrome.alarms.clear(SNOOZE_ALARM);
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] onStartup failed', { error: error.message });
  }
});

/** Any change to a config item re-derives the rule set. */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  try {
    if (areaName !== StorageArea.SYNC) return;
    const keys = Object.keys(changes);
    if (keys.some((key) => RULE_INPUT_KEYS.includes(key) || isSiteKey(key))) {
      await rebuildRules();
    }
  } catch (error) {
    console.error('[steer-clear] onChanged rebuild failed', { error: error.message });
  }
});

/**
 * Permissions can also change from the browser's own extension settings.
 * Rebuilding keeps rules consistent with what the browser will honor.
 */
chrome.permissions.onAdded.addListener(async () => {
  try {
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] rebuild after permission grant failed', { error: error.message });
  }
});

chrome.permissions.onRemoved.addListener(async () => {
  try {
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] rebuild after permission revoke failed', { error: error.message });
  }
});

/**
 * Firefox resets a tab's badge when it navigates, so a bypassed tab that
 * finishes loading gets its badge back here rather than at the next tick.
 */
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo) => {
  try {
    if (changeInfo.status !== TAB_STATUS_COMPLETE) return;
    const stored = await chrome.storage.session.get([StorageKey.BYPASSES, StorageKey.BADGED_TABS]);
    if (!hasBadgeWork(stored[StorageKey.BYPASSES], stored[StorageKey.BADGED_TABS])) return;
    await refreshAllBadges();
  } catch (error) {
    console.error('[steer-clear] badge refresh on tab update failed', { error: error.message });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    // Retention must hold even for a user who never triggers another
    // interception, so pruning cannot rely only on the write path.
    if (alarm.name === STATS_PRUNE_ALARM) {
      await pruneStoredStats(Date.now());
    } else if (alarm.name === SCHEDULE_ALARM) {
      // A schedule started or ended; the rebuild reads the clock and sets
      // the alarm for the boundary after this one.
      await rebuildRules();
    } else if (alarm.name === SNOOZE_ALARM) {
      await endSnooze();
    } else if (alarm.name === BYPASS_TICK_ALARM) {
      await refreshAllBadges();
    } else if (alarm.name.startsWith(BYPASS_ALARM_PREFIX)) {
      await expireBypass(alarm.name.slice(BYPASS_ALARM_PREFIX.length));
    }
  } catch (error) {
    console.error('[steer-clear] alarm handler failed', { alarm: alarm.name, error: error.message });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((payload) => sendResponse({ ok: true, ...payload }))
    .catch((error) => {
      console.error('[steer-clear] message handler failed', { type: message?.type, error: error.message });
      sendResponse({ ok: false, error: error.message });
    });
  // Signals an async sendResponse.
  return true;
});
