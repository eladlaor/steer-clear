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
} from '../constants.js';

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
 * Translate a config object into the full dynamic rule set.
 *
 * Every enabled, non-bypassed site produces exactly one rule redirecting to the
 * local interstitial, with the original URL preserved via `\0` substitution.
 *
 * A site with no host permission produces no rule. Chrome silently ignores
 * redirect rules for hosts the extension cannot access, so emitting one would
 * look like the extension was working when it was not — the exact failure mode
 * that made redirects appear broken before host permissions were declared.
 *
 * @param {object} config The user config (see knowledge/plans).
 * @param {string} extensionBaseUrl Result of chrome.runtime.getURL('').
 * @param {Set<string>} [bypassedPatterns] Normalized hosts currently bypassed.
 * @param {Set<string>|null} [grantedHosts] Normalized hosts with host
 *   permission. Pass null to skip the check (used by tests and by builds that
 *   declare blanket host permissions).
 * @returns {Array<object>} declarativeNetRequest rule objects.
 */
export function buildRules(
  config,
  extensionBaseUrl,
  bypassedPatterns = new Set(),
  grantedHosts = null
) {
  if (!config || !Array.isArray(config.sites)) {
    throw new Error('buildRules: config.sites must be an array');
  }
  if (typeof extensionBaseUrl !== 'string' || extensionBaseUrl === '') {
    throw new Error('buildRules: extensionBaseUrl is required');
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

    if (bypassedPatterns.has(host)) {
      return;
    }

    if (grantedHosts !== null && !grantedHosts.has(host)) {
      return;
    }

    rules.push({
      id: RULE_ID_BASE + index,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          // \0 expands to the entire matched URL. It is percent-encoded by
          // Chrome when substituted into a query parameter position.
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
 * Resolve the effective settings for a site, applying global fallback.
 *
 * Strings fall back when blank; booleans and numbers fall back only when null,
 * since `false` and `0` are meaningful values a user may have chosen
 * deliberately and must not be treated as "unset".
 *
 * @param {object} config The user config.
 * @param {object|null} site The matched site entry, or null.
 * @returns {{target: string, targetName: string, note: string,
 *   autoContinue: boolean, countdownSeconds: number}}
 */
export function resolveSiteSettings(config, site) {
  const target = site?.target?.trim() || config.globalTarget;
  const note = site?.note?.trim() || config.globalNote;

  // The destination label is cosmetic; if the user never named it, fall back to
  // the target's hostname rather than showing a raw URL on a button.
  const targetName =
    config.globalTargetName?.trim() || hostnameOf(target) || 'your destination';

  const autoContinue = site?.autoContinue ?? config.globalAutoContinue;
  const countdownSeconds =
    site?.countdownSeconds ?? config.globalCountdownSeconds;

  return { target, targetName, note, autoContinue, countdownSeconds };
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
