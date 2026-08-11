/**
 * Steer Clear service worker.
 *
 * Sole owner of the declarativeNetRequest dynamic rule set. Every other surface
 * (options page, interstitial) mutates storage or sends a message; none of them
 * touch rules directly. This keeps rule state derivable from storage at all
 * times, so a rebuild is always safe.
 */

import {
  StorageKey,
  MessageType,
  BYPASS_ALARM_PREFIX,
  BYPASS_DURATION_MS,
  STATS_PRUNE_ALARM,
} from '../constants.js';
import { readConfig, writeConfig, defaultConfig } from './config.js';
import {
  buildRules,
  normalizePattern,
  findMatchingSite,
  resolveSiteSettings,
  siteLabel,
} from './rules.js';
import { grantedHostsAmong } from './permissions.js';
import {
  logInterception,
  readStats,
  clearStats,
  pruneStoredStats,
} from './stats_store.js';

/**
 * Read the currently-active bypasses, dropping any that have expired.
 *
 * @returns {Promise<Object<string, number>>} Map of host to expiry epoch ms.
 */
async function readActiveBypasses() {
  try {
    const stored = await chrome.storage.session.get(StorageKey.BYPASSES);
    const bypasses = stored[StorageKey.BYPASSES] ?? {};
    const now = Date.now();

    const active = {};
    for (const [host, expiry] of Object.entries(bypasses)) {
      if (expiry > now) {
        active[host] = expiry;
      }
    }
    return active;
  } catch (error) {
    console.error('[steer-clear] readActiveBypasses failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Rebuild the entire dynamic rule set from storage.
 *
 * Removes every existing dynamic rule and installs the freshly-computed set.
 * Full replacement rather than diffing: the rule count is small (one per
 * blocked site) and a full rebuild cannot drift out of sync with storage.
 *
 * @returns {Promise<void>}
 */
async function rebuildRules() {
  try {
    const [config, bypasses] = await Promise.all([
      readConfig(),
      readActiveBypasses(),
    ]);

    const bypassedHosts = new Set(Object.keys(bypasses));
    const extensionBaseUrl = chrome.runtime.getURL('');

    // Only sites the user has granted access to can be redirected. Passing the
    // granted set keeps un-permitted sites out of the rule table entirely,
    // rather than installing rules Chrome will quietly refuse to apply.
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

    const newRules = buildRules(
      config,
      extensionBaseUrl,
      bypassedHosts,
      grantedHosts
    );

    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existing.map((rule) => rule.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules: newRules,
    });

    console.info('[steer-clear] rules rebuilt', {
      ruleCount: newRules.length,
      bypassedCount: bypassedHosts.size,
      configuredCount: configuredHosts.length,
      ungrantedCount: configuredHosts.length - grantedHosts.size,
    });
  } catch (error) {
    console.error('[steer-clear] rebuildRules failed', {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Grant a time-boxed bypass for a host, removing its rule until expiry.
 *
 * @param {string} rawHost The host to bypass, as seen by the interstitial.
 * @returns {Promise<{expiresAt: number}>}
 */
async function grantBypass(rawHost) {
  try {
    const host = normalizePattern(rawHost);
    const expiresAt = Date.now() + BYPASS_DURATION_MS;

    const bypasses = await readActiveBypasses();
    bypasses[host] = expiresAt;
    await chrome.storage.session.set({ [StorageKey.BYPASSES]: bypasses });

    // An alarm reinstates the rule when the pass expires. Without this the rule
    // would stay absent until the next unrelated rebuild.
    await chrome.alarms.create(`${BYPASS_ALARM_PREFIX}${host}`, {
      when: expiresAt,
    });

    await rebuildRules();

    console.info('[steer-clear] bypass granted', { host, expiresAt });
    return { expiresAt };
  } catch (error) {
    console.error('[steer-clear] grantBypass failed', {
      host: rawHost,
      error: error.message,
    });
    throw error;
  }
}

/**
 * Resolve what the interstitial should display for a given blocked URL.
 *
 * @param {string} fromUrl The originally-requested URL.
 * @returns {Promise<{host: string, target: string, note: string, matched: boolean}>}
 */
async function getResolvedSite(fromUrl) {
  try {
    const config = await readConfig();
    const site = findMatchingSite(config, fromUrl);
    const { target, targetName, note, autoContinue, countdownSeconds } =
      resolveSiteSettings(config, site);

    const host = new URL(fromUrl).hostname;

    // One interception = one interstitial asking what to display, so this is
    // the single place a redirect can be counted exactly once. Counting at
    // rule-match time is not possible; declarativeNetRequest fires no event
    // the extension can observe without requesting feedback permissions.
    //
    // The *configured* host is recorded, not the requested one, so that
    // m.ynet.co.il and www.ynet.co.il aggregate under the entry the user
    // created rather than fragmenting the count across subdomains.
    if (site) {
      await logInterception(normalizePattern(site.pattern), Date.now());
    }

    return {
      host,
      // What to call the site the user was heading to. Falls back to the host
      // when unmatched, which happens only if config changed mid-navigation.
      siteName: site ? siteLabel(site) : host,
      target,
      targetName,
      note,
      autoContinue,
      countdownSeconds,
      matched: site !== null,
    };
  } catch (error) {
    console.error('[steer-clear] getResolvedSite failed', {
      fromUrl,
      error: error.message,
    });
    throw error;
  }
}

/** Seed default config on first install, then build the initial rule set. */
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (details.reason === 'install') {
      await writeConfig(defaultConfig());
      await chrome.runtime.openOptionsPage();
    }
    await chrome.alarms.create(STATS_PRUNE_ALARM, { periodInMinutes: 60 * 24 });
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] onInstalled failed', {
      reason: details.reason,
      error: error.message,
    });
  }
});

/** Rebuild on browser startup — session bypasses are gone by definition. */
chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.storage.session.remove(StorageKey.BYPASSES);
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] onStartup failed', { error: error.message });
  }
});

/** Any config change re-derives the rule set. */
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  try {
    if (areaName === 'sync' && changes[StorageKey.CONFIG]) {
      await rebuildRules();
    }
  } catch (error) {
    console.error('[steer-clear] onChanged rebuild failed', {
      error: error.message,
    });
  }
});

/**
 * Permissions can also change from chrome://extensions, outside our UI.
 * Rebuilding on these events keeps rules consistent with what Chrome will
 * actually honor — without them, revoking access in Chrome's own settings
 * would leave a dead rule behind.
 */
chrome.permissions.onAdded.addListener(async () => {
  try {
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] rebuild after permission grant failed', {
      error: error.message,
    });
  }
});

chrome.permissions.onRemoved.addListener(async () => {
  try {
    await rebuildRules();
  } catch (error) {
    console.error('[steer-clear] rebuild after permission revoke failed', {
      error: error.message,
    });
  }
});

/** Bypass expiry reinstates the rule. */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  try {
    // Retention must hold even for a user who never triggers another
    // interception, so pruning cannot rely only on the write path.
    if (alarm.name === STATS_PRUNE_ALARM) {
      await pruneStoredStats(Date.now());
      return;
    }

    if (!alarm.name.startsWith(BYPASS_ALARM_PREFIX)) {
      return;
    }
    const host = alarm.name.slice(BYPASS_ALARM_PREFIX.length);

    const bypasses = await readActiveBypasses();
    delete bypasses[host];
    await chrome.storage.session.set({ [StorageKey.BYPASSES]: bypasses });

    await rebuildRules();
    console.info('[steer-clear] bypass expired', { host });
  } catch (error) {
    console.error('[steer-clear] bypass expiry failed', {
      alarm: alarm.name,
      error: error.message,
    });
  }
});

/** Message handler for the interstitial. */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case MessageType.GRANT_BYPASS: {
          const result = await grantBypass(message.host);
          sendResponse({ ok: true, ...result });
          break;
        }
        case MessageType.GET_RESOLVED_SITE: {
          const result = await getResolvedSite(message.fromUrl);
          sendResponse({ ok: true, ...result });
          break;
        }
        case MessageType.GET_STATS: {
          sendResponse({ ok: true, stats: await readStats() });
          break;
        }
        case MessageType.CLEAR_STATS: {
          await clearStats();
          sendResponse({ ok: true });
          break;
        }
        case MessageType.REBUILD_RULES: {
          // Granting a permission is not a storage change, so the options page
          // asks for a rebuild explicitly after the user approves a host.
          await rebuildRules();
          sendResponse({ ok: true });
          break;
        }
        default:
          throw new Error(`unknown message type: ${message?.type}`);
      }
    } catch (error) {
      console.error('[steer-clear] message handler failed', {
        type: message?.type,
        error: error.message,
      });
      sendResponse({ ok: false, error: error.message });
    }
  })();

  // Signals async sendResponse.
  return true;
});
