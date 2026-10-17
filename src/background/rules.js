/**
 * Pure translation from user config to declarativeNetRequest rules.
 *
 * This module deliberately touches no Chrome APIs so it can be unit-tested in a
 * plain JS runtime. The service worker owns all actual rule installation.
 *
 * Mechanism note: declarativeNetRequest cannot inject the originally-requested
 * URL into a redirect via `queryTransform` — `addOrReplaceParams` accepts only
 * static values. Preserving the source URL therefore requires a `regexFilter`
 * rule paired with `regexSubstitution`, where `\0` expands to the entire
 * matched URL. That is why every rule here is regex-based rather than using the
 * simpler `requestDomains` condition.
 */

import {
  RULE_ID_BASE,
  INTERSTITIAL_PATH,
  PARAM_FROM,
  MAX_REGEX_RULES,
  HOSTNAME_PATTERN,
  MAX_PATTERN_HOST_LENGTH,
} from '../constants.js';
import { isScheduleActiveAt } from './schedule.js';
import { resolveSettings } from './settings_schema.js';

/**
 * Normalize a user-entered pattern into a bare hostname.
 * Accepts "https://www.ynet.co.il/news", "www.ynet.co.il", "ynet.co.il".
 *
 * @param {string} pattern Raw user input.
 * @returns {string} Lowercased bare hostname.
 * @throws {Error} If the pattern yields no usable hostname.
 */
export function normalizePattern(pattern) {
  if (typeof pattern !== 'string') {
    throw new Error(`normalizePattern: expected string, got ${typeof pattern}`);
  }

  let host = pattern.trim().toLowerCase();
  if (host === '') {
    throw new Error('normalizePattern: pattern is empty');
  }

  // Strip scheme, credentials, path, query, fragment, and port.
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.replace(/^[^@/]*@/, '');
  host = host.split('/')[0].split('?')[0].split('#')[0];
  host = host.split(':')[0];

  // A leading "*." is implied by includeSubdomains; accept and strip it.
  host = host.replace(/^\*\./, '');

  if (host === '' || !host.includes('.')) {
    throw new Error(
      `normalizePattern: "${pattern}" does not contain a valid hostname`
    );
  }

  // Browsers match and grant internationalized hosts in their ASCII
  // (punycode) form, so that is the form a rule and a permission must use.
  if (/[^\x00-\x7f]/.test(host)) {
    try {
      host = new URL(`http://${host}`).hostname;
    } catch {
      throw new Error(`normalizePattern: "${pattern}" does not contain a valid hostname`);
    }
  }

  // Anything else left over (a second wildcard, spaces, brackets) would make
  // an origin pattern the browser rejects, and one rejected origin fails the
  // permission check and the rule update for every site.
  if (!HOSTNAME_PATTERN.test(host)) {
    throw new Error(`normalizePattern: "${pattern}" does not contain a valid hostname`);
  }
  if (host.length > MAX_PATTERN_HOST_LENGTH) {
    throw new Error(
      `normalizePattern: "${pattern}" names a host of ${host.length} characters; at most ${MAX_PATTERN_HOST_LENGTH} are supported`
    );
  }

  return host;
}

/**
 * Escape a hostname for safe embedding in a RE2 regex.
 *
 * @param {string} host A normalized hostname.
 * @returns {string} The host with regex metacharacters escaped.
 */
export function escapeForRegex(host) {
  return host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the regexFilter matching a site's main-frame navigations.
 *
 * Subdomain-inclusive matching accepts an optional `label.` prefix chain;
 * exact matching anchors directly to the host. The trailing `(?:[:/?#].*)?$`
 * allows an optional port, path, query, or fragment while preventing
 * "ynet.co.il" from matching "ynet.co.il.evil.com".
 *
 * @param {{pattern: string, includeSubdomains: boolean}} site
 * @returns {string} A RE2-compatible regex string.
 */
export function buildRegexFilter(site) {
  const host = escapeForRegex(normalizePattern(site.pattern));
  const hostPart = site.includeSubdomains
    ? `(?:[a-z0-9-]+\\.)*${host}`
    : host;
  return `^https?://${hostPart}(?:[:/?#].*)?$`;
}

/**
 * Check a RuleContext, throwing on anything malformed.
 *
 * @param {unknown} context
 */
function assertRuleContext(context) {
  if (!context || typeof context !== 'object') {
    throw new Error('buildRules: a rule context { bypassedHosts, grantedHosts, snoozedUntil, now } is required');
  }
  if (!(context.bypassedHosts instanceof Set)) {
    throw new Error('buildRules: context.bypassedHosts must be a Set');
  }
  if (context.grantedHosts !== null && !(context.grantedHosts instanceof Set)) {
    throw new Error('buildRules: context.grantedHosts must be a Set or null');
  }
  if (context.snoozedUntil !== null && !Number.isFinite(context.snoozedUntil)) {
    throw new Error(`buildRules: context.snoozedUntil must be epoch ms or null, got ${context.snoozedUntil}`);
  }
  if (!Number.isFinite(context.now)) {
    throw new Error(`buildRules: context.now must be epoch ms, got ${context.now}`);
  }
}

/**
 * Whether a listed site's pause is in force at a moment: no snooze is
 * running and the site's effective schedule is active. Shared by the rule
 * build and by the return of tabs when a bypass ends, so a tab is never sent
 * back to a pause that has no rule behind it.
 *
 * @param {{defaults: object}} config The assembled config.
 * @param {object} site A listed site.
 * @param {{snoozedUntil: number|null, now: number}} timing Epoch ms.
 * @returns {boolean}
 */
export function isPauseInForce(config, site, { snoozedUntil, now }) {
  if (!Number.isFinite(now)) {
    throw new Error(`isPauseInForce: now must be epoch ms, got ${now}`);
  }
  if (snoozedUntil !== null && snoozedUntil > now) {
    return false;
  }
  return isScheduleActiveAt(resolveSettings(config.defaults, site).schedule, new Date(now));
}

/**
 * Translate a config object into the full dynamic rule set.
 *
 * A site produces exactly one rule, redirecting to the local interstitial
 * with the original URL preserved via `\0` substitution, when it is enabled,
 * valid, not bypassed, granted, not snoozed, and its schedule is active now.
 *
 * A site with no host permission produces no rule. Chrome silently ignores
 * redirect rules for hosts the extension cannot access, so emitting one would
 * look like the extension was working when it was not — the exact failure mode
 * that made redirects appear broken before host permissions were declared.
 *
 * Everything that varies over time comes in through `context`, so rules stay
 * a pure function of storage, session state and the clock.
 *
 * @param {object} config The assembled config (`{ defaults, sites }`).
 * @param {string} extensionBaseUrl Result of chrome.runtime.getURL('').
 * @param {{bypassedHosts: Set<string>, grantedHosts: Set<string>|null,
 *   snoozedUntil: number|null, now: number}} context `bypassedHosts`:
 *   normalized hosts currently bypassed. `grantedHosts`: normalized hosts with
 *   host permission, or null to skip the check (tests, and builds that declare
 *   blanket host permissions). `snoozedUntil`: epoch ms while every reminder
 *   is snoozed. `now`: epoch ms, for schedules and snooze.
 * @returns {Array<object>} declarativeNetRequest rule objects.
 */
export function buildRules(config, extensionBaseUrl, context) {
  if (!config || !Array.isArray(config.sites)) {
    throw new Error('buildRules: config.sites must be an array');
  }
  if (typeof extensionBaseUrl !== 'string' || extensionBaseUrl === '') {
    throw new Error('buildRules: extensionBaseUrl is required');
  }
  assertRuleContext(context);
  const { bypassedHosts, grantedHosts, snoozedUntil, now } = context;

  // Snooze is "turn every reminder off for N minutes": no rule at all.
  if (snoozedUntil !== null && snoozedUntil > now) {
    return [];
  }

  const interstitialUrl = `${extensionBaseUrl}${INTERSTITIAL_PATH}`;
  const rules = [];

  config.sites.forEach((site, index) => {
    if (!site.enabled) {
      return;
    }

    let host;
    let regexFilter;
    try {
      host = normalizePattern(site.pattern);
      regexFilter = buildRegexFilter(site);
    } catch (error) {
      // A malformed pattern must not take down the whole rule set; skip it and
      // surface it, since silent omission would look like the extension broke.
      console.error('[steer-clear] skipping invalid pattern', {
        pattern: site.pattern,
        error: error.message,
      });
      return;
    }

    if (bypassedHosts.has(host)) {
      return;
    }

    if (grantedHosts !== null && !grantedHosts.has(host)) {
      return;
    }

    if (!isPauseInForce(config, site, { snoozedUntil, now })) {
      return;
    }

    rules.push({
      id: RULE_ID_BASE + index,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          // \0 expands to the entire matched URL. Chrome substitutes it
          // unencoded (observed on Chromium 1248), so it may contain '&' and
          // '#'; the reminder page reads it with extractSourceUrl, never
          // URLSearchParams.
          regexSubstitution: `${interstitialUrl}?${PARAM_FROM}=\\0`,
        },
      },
      condition: {
        regexFilter,
        // Hostnames are case-insensitive. This matches the API default, but is
        // stated explicitly so the intent survives any future default change.
        isUrlFilterCaseSensitive: false,
        resourceTypes: ['main_frame'],
      },
    });
  });

  if (rules.length > MAX_REGEX_RULES) {
    throw new Error(
      `buildRules: ${rules.length} rules exceeds the declarativeNetRequest ` +
        `limit of ${MAX_REGEX_RULES} regex rules`
    );
  }

  return rules;
}

/**
 * Resolve which configured site matches a given URL, honoring the
 * includeSubdomains flag. Used by the interstitial, which must decide what to
 * display and cannot know which rule fired.
 *
 * @param {object} config The user config.
 * @param {string} url The originally-requested URL.
 * @returns {object|null} The matching site entry, or null.
 */
export function findMatchingSite(config, url) {
  if (!config || !Array.isArray(config.sites)) {
    return null;
  }

  let requestHost;
  try {
    requestHost = new URL(url).hostname.toLowerCase();
  } catch (error) {
    console.error('[steer-clear] findMatchingSite: unparseable URL', {
      url,
      error: error.message,
    });
    return null;
  }

  return (
    config.sites.find((site) => {
      if (!site.enabled) {
        return false;
      }

      let host;
      try {
        host = normalizePattern(site.pattern);
      } catch {
        return false;
      }

      if (site.includeSubdomains) {
        return requestHost === host || requestHost.endsWith(`.${host}`);
      }
      return requestHost === host;
    }) ?? null
  );
}

/**
 * Best-effort hostname extraction, for display only.
 *
 * @param {string} url
 * @returns {string} The hostname without "www.", or '' if unparseable.
 */
export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The label to show for a blocked site: the user's chosen name, else the host.
 *
 * @param {object} site A site entry.
 * @returns {string}
 */
export function siteLabel(site) {
  const name = site?.displayName?.trim();
  if (name) {
    return name;
  }
  try {
    return normalizePattern(site.pattern);
  } catch {
    return site?.pattern ?? 'this site';
  }
}
