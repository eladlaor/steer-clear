/**
 * The degraded safety path: what the worker does when the saved settings
 * cannot be read (a corrupt sync item, or settings written by a newer
 * version on another device).
 *
 * The pause page must never trap the user. With only the host it was reached
 * for, the page still renders with default settings and "continue" still
 * lifts the installed rules that match. Callers log a `[steer-clear]` error
 * every time this path is taken: it is a deliberate, loud safety path, not a
 * silent fallback.
 *
 * Pure: no chrome.*, no clock.
 */

import { defaultSettings } from './settings_schema.js';
import { presentSite } from './pause.js';

/**
 * The ids of the installed redirect rules whose `regexFilter` matches a URL.
 * Uses the rule's own filter, so it lifts exactly what would have redirected
 * the URL: subdomains for a subdomain-inclusive rule, never a lookalike host.
 *
 * @param {Array<object>} rules declarativeNetRequest dynamic rules.
 * @param {string} url
 * @returns {number[]} Matching rule ids, in rule order.
 * @throws {Error} On malformed input.
 */
export function ruleIdsMatchingUrl(rules, url) {
  if (!Array.isArray(rules)) {
    throw new Error(`ruleIdsMatchingUrl: rules must be an array, got ${typeof rules}`);
  }
  if (typeof url !== 'string' || url === '') {
    throw new Error(`ruleIdsMatchingUrl: url must be a non-empty string, got ${JSON.stringify(url)}`);
  }
  return rules
    .filter((rule) => {
      const filter = rule?.condition?.regexFilter;
      if (typeof filter !== 'string') return false;
      // The API default (and every rule this extension builds) is
      // case-insensitive; honor an explicit `true` all the same.
      const flags = rule.condition.isUrlFilterCaseSensitive === true ? '' : 'i';
      return new RegExp(filter, flags).test(url);
    })
    .map((rule) => rule.id);
}

/**
 * The pause page's content when the settings cannot be read: the host it was
 * reached for and the default settings, flagged `degraded: true`.
 *
 * @param {string} host The requested hostname.
 * @returns {object} The GET_RESOLVED_SITE response shape.
 * @throws {Error} If `host` is empty.
 */
export function degradedSiteView(host) {
  if (typeof host !== 'string' || host === '') {
    throw new Error(`degradedSiteView: host must be a non-empty string, got ${JSON.stringify(host)}`);
  }
  return {
    host,
    ...presentSite(defaultSettings(), null, 0, { host, continuesToday: 0 }),
    showVariationNotice: false,
    matched: false,
    degraded: true,
  };
}

/**
 * Add rules to a host's lifted list, once per id.
 *
 * @param {Array<object>} existing Rules already lifted for the host.
 * @param {Array<object>} lifted Rules lifted now.
 * @returns {Array<object>} A new list.
 */
export function mergeLiftedRules(existing, lifted) {
  const ids = new Set(existing.map((rule) => rule.id));
  return [...existing, ...lifted.filter((rule) => !ids.has(rule.id))];
}
