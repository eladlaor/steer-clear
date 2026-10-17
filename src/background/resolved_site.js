/**
 * What the pause page shows for one interception (GET_RESOLVED_SITE).
 *
 * The pause page must never trap the user. If the config cannot be read (a
 * corrupt item, settings from a newer version), this still answers with the
 * host and default settings, flagged `degraded: true`, and logs the error.
 * Statistics and lifecycle flags are side observations: their failure is
 * logged and the page still renders.
 */

import { LifecycleEvent } from '../constants.js';
import { readConfig } from './config.js';
import { findMatchingSite, normalizePattern } from './rules.js';
import { defaultSettings, resolveSettings } from './settings_schema.js';
import { presentSite } from './pause.js';
import { shouldShowVariationNotice } from './lifecycle.js';
import { readLifecycle, recordLifecycleEvent } from './lifecycle_store.js';
import { logInterception, readStats } from './stats_store.js';

/**
 * The site's lifetime interception count before this one, or 0 when the
 * statistics cannot be read.
 *
 * @param {string} key The configured host.
 * @returns {Promise<number>}
 */
async function priorInterceptions(key) {
  try {
    return (await readStats()).totals[key] ?? 0;
  } catch (error) {
    console.error('[steer-clear] interception count unavailable; showing the first variant', { key, error: error.message });
    return 0;
  }
}

/**
 * Whether to explain the varying presentation this time, or false when the
 * flags cannot be read (better to skip the notice than to block the page).
 *
 * The notice is shown on the first varied visit only: showing it stamps it
 * as seen, so a user who never presses "Got it" is not shown it again.
 *
 * @param {boolean} varyPresentation
 * @returns {Promise<boolean>}
 */
async function takeVariationNotice(varyPresentation) {
  let due;
  try {
    due = shouldShowVariationNotice(await readLifecycle(), varyPresentation);
  } catch (error) {
    console.error('[steer-clear] lifecycle unavailable; skipping the variation notice', { error: error.message });
    return false;
  }
  if (due) {
    try {
      await recordLifecycleEvent(LifecycleEvent.VARIATION_NOTICE_SEEN, Date.now());
    } catch (error) {
      // Showing it again next time is the lesser harm than hiding it now.
      console.error('[steer-clear] could not mark the variation notice as shown; it may show again', {
        error: error.message,
      });
    }
  }
  return due;
}

/**
 * Resolve the pause page's content for a blocked URL, and count the
 * interception.
 *
 * @param {string} fromUrl The originally-requested URL.
 * @returns {Promise<object>} See the GET_RESOLVED_SITE row of the message
 *   table in knowledge/plans/V2_COMPETITIVE_UPGRADE.md.
 */
export async function getResolvedSite(fromUrl) {
  const host = new URL(fromUrl).hostname;

  let config;
  try {
    config = await readConfig();
  } catch (error) {
    console.error('[steer-clear] settings unreadable; pause page shows defaults (degraded)', {
      host,
      error: error.message,
    });
    return {
      host,
      ...presentSite(defaultSettings(), null, 0, { host }),
      showVariationNotice: false,
      matched: false,
      degraded: true,
    };
  }

  const site = findMatchingSite(config, fromUrl);
  const resolved = resolveSettings(config.defaults, site);
  const key = site ? normalizePattern(site.pattern) : null;
  const n = key ? await priorInterceptions(key) : 0;
  const showVariationNotice = site !== null && (await takeVariationNotice(resolved.varyPresentation));

  // One pause-page load is one interception. The configured host is recorded
  // so www.x.com and m.x.com aggregate under the entry the user created.
  if (key) {
    await logInterception(key, Date.now());
  }

  return {
    host,
    ...presentSite(resolved, site, n, { host }),
    showVariationNotice,
    matched: site !== null,
    degraded: false,
  };
}
