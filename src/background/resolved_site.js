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
import { resolveSettings } from './settings_schema.js';
import { degradedSiteView } from './degraded.js';
import { presentSite } from './pause.js';
import { shouldShowVariationNotice } from './lifecycle.js';
import { readLifecycle, recordLifecycleEvent } from './lifecycle_store.js';
import { continuesToday } from './progress.js';
import { readStats } from './stats_store.js';

/**
 * What the statistics say about this site: its lifetime interception count
 * before this view (which picks the variant) and today's continues (which
 * apply the daily allowance). Both read as 0 when the statistics cannot be
 * read: the page must render, and an error is logged.
 *
 * @param {string} key The configured host.
 * @param {number} now Epoch ms.
 * @returns {Promise<{n: number, continuesToday: number}>}
 */
async function siteHistory(key, now) {
  try {
    const stats = await readStats();
    return { n: stats.totals[key] ?? 0, continuesToday: continuesToday(stats, key, now) };
  } catch (error) {
    console.error('[steer-clear] statistics unavailable; showing the first variant without the daily limit', {
      key,
      error: error.message,
    });
    return { n: 0, continuesToday: 0 };
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
 * Resolve the pause page's content for a blocked URL. It records no
 * interception: the page sends RECORD_VIEW once it is actually visible.
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
    return degradedSiteView(host);
  }

  const site = findMatchingSite(config, fromUrl);
  const resolved = resolveSettings(config.defaults, site);
  const key = site ? normalizePattern(site.pattern) : null;
  const { n, continuesToday: continues } = key ? await siteHistory(key, Date.now()) : { n: 0, continuesToday: 0 };
  const showVariationNotice = site !== null && (await takeVariationNotice(resolved.varyPresentation));

  return {
    host,
    ...presentSite(resolved, site, n, { host, continuesToday: continues }),
    showVariationNotice,
    matched: site !== null,
    degraded: false,
  };
}
