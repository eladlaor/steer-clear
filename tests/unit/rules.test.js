/**
 * Unit tests for the pure rule-building logic.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePattern,
  escapeForRegex,
  buildRegexFilter,
  buildRules,
  findMatchingSite,
  isPauseInForce,
  siteLabel,
  hostnameOf,
} from '../../src/background/rules.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { MAX_PATTERN_HOST_LENGTH, WEEKDAY_WORK_SCHEDULE } from '../../src/constants.js';

const BASE_URL = 'chrome-extension://abcdefghijklmnop/';

/** Monday 2026-03-16, 10:00 local: inside weekday work hours. */
const MONDAY_TEN = new Date(2026, 2, 16, 10, 0).getTime();
/** Saturday 2026-03-21, 10:00 local: outside them. */
const SATURDAY_TEN = new Date(2026, 2, 21, 10, 0).getTime();

/**
 * A RuleContext with test defaults: nothing bypassed, no permission check,
 * not snoozed, Monday 10:00.
 *
 * @param {object} [fields]
 * @returns {object}
 */
function ctx(fields = {}) {
  return { bypassedHosts: new Set(), grantedHosts: null, snoozedUntil: null, now: MONDAY_TEN, ...fields };
}

/**
 * @param {object} overrides
 * @returns {object} A site entry with test defaults.
 */
function site(overrides = {}) {
  return {
    id: 'test-id',
    pattern: 'ynet.co.il',
    includeSubdomains: true,
    target: null,
    note: null,
    enabled: true,
    ...overrides,
  };
}

/**
 * @param {Array<object>} sites
 * @returns {object} A config with test defaults.
 */
function config(sites = []) {
  return { schemaVersion: 3, defaults: defaultSettings(), sites };
}

test('normalizePattern strips scheme, path, query, port', () => {
  assert.equal(normalizePattern('https://www.ynet.co.il/news?a=1'), 'www.ynet.co.il');
  assert.equal(normalizePattern('ynet.co.il'), 'ynet.co.il');
  assert.equal(normalizePattern('http://ynet.co.il:8080/x'), 'ynet.co.il');
  assert.equal(normalizePattern('  YNET.CO.IL  '), 'ynet.co.il');
  assert.equal(normalizePattern('*.ynet.co.il'), 'ynet.co.il');
});

test('normalizePattern rejects malformed input', () => {
  assert.throws(() => normalizePattern(''), /empty/);
  assert.throws(() => normalizePattern('   '), /empty/);
  assert.throws(() => normalizePattern('notadomain'), /valid hostname/);
  assert.throws(() => normalizePattern(42), /expected string/);
});

test('normalizePattern rejects a host the browser would refuse as an origin', () => {
  // "*.*.bad.com" keeps a wildcard after the leading "*." is stripped; Chrome
  // rejects the origin pattern, which used to fail every site's rebuild.
  for (const bad of ['*.*.bad.com', 'a b.com', 'bad.com.', '-[x].com', 'a..com', 'exa$mple.com']) {
    assert.throws(() => normalizePattern(bad), /valid hostname/, bad);
  }
});

test('normalizePattern rejects a host too long for a rule regex', () => {
  const longest = `${'a'.repeat(40)}.${'b'.repeat(MAX_PATTERN_HOST_LENGTH - 45)}.com`;
  assert.equal(longest.length, MAX_PATTERN_HOST_LENGTH);
  assert.equal(normalizePattern(longest), longest);
  assert.throws(() => normalizePattern(`a${longest}`), /at most/);
  assert.throws(() => normalizePattern(`${'a'.repeat(60)}.${'a'.repeat(60)}.${'a'.repeat(60)}.com`), /at most/);
});

test('normalizePattern keeps underscores, digits and hyphens, and turns an IDN into punycode', () => {
  assert.equal(normalizePattern('my_host.example-1.co.il'), 'my_host.example-1.co.il');
  assert.equal(normalizePattern('בית.example.com'), 'xn--5dbq5c.example.com');
});

test('escapeForRegex escapes dots', () => {
  assert.equal(escapeForRegex('ynet.co.il'), 'ynet\\.co\\.il');
});

test('buildRegexFilter handles subdomain inclusion', () => {
  const withSubs = buildRegexFilter(site({ includeSubdomains: true }));
  const exact = buildRegexFilter(site({ includeSubdomains: false }));

  assert.match(withSubs, /\(\?:\[a-z0-9-\]\+\\\.\)\*/);
  assert.doesNotMatch(exact, /\(\?:\[a-z0-9-\]\+\\\.\)\*/);
});

test('generated regex matches the intended URLs', () => {
  const pattern = new RegExp(buildRegexFilter(site({ includeSubdomains: true })));

  assert.ok(pattern.test('https://ynet.co.il/'));
  assert.ok(pattern.test('https://www.ynet.co.il/'));
  assert.ok(pattern.test('https://m.ynet.co.il/news/article'));
  assert.ok(pattern.test('http://ynet.co.il'));
  assert.ok(pattern.test('https://ynet.co.il:443/x?y=1'));

  // Must not match a lookalike domain that merely ends with the pattern text.
  assert.ok(!pattern.test('https://ynet.co.il.evil.com/'));
  assert.ok(!pattern.test('https://notynet.co.il/'));
  assert.ok(!pattern.test('https://example.com/'));
});

test('exact-match regex excludes subdomains', () => {
  const pattern = new RegExp(buildRegexFilter(site({ includeSubdomains: false })));

  assert.ok(pattern.test('https://ynet.co.il/'));
  assert.ok(!pattern.test('https://www.ynet.co.il/'));
});

test('buildRules produces one rule per enabled site', () => {
  const rules = buildRules(
    config([site({ id: 'a', pattern: 'ynet.co.il' }), site({ id: 'b', pattern: 'x.com' })]),
    BASE_URL,
    ctx()
  );

  assert.equal(rules.length, 2);
  assert.notEqual(rules[0].id, rules[1].id);
});

test('buildRules skips disabled sites', () => {
  const rules = buildRules(config([site({ enabled: false })]), BASE_URL, ctx());
  assert.equal(rules.length, 0);
});

test('buildRules skips bypassed hosts', () => {
  const rules = buildRules(
    config([site({ pattern: 'ynet.co.il' })]),
    BASE_URL,
    ctx({ bypassedHosts: new Set(['ynet.co.il']) })
  );
  assert.equal(rules.length, 0);
});

test('buildRules skips malformed patterns without throwing', () => {
  const rules = buildRules(
    config([site({ pattern: 'garbage' }), site({ pattern: 'ynet.co.il' })]),
    BASE_URL,
    ctx()
  );
  assert.equal(rules.length, 1);
});

test('buildRules redirect preserves the source URL via \\0', () => {
  const [rule] = buildRules(config([site()]), BASE_URL, ctx());
  const substitution = rule.action.redirect.regexSubstitution;

  assert.ok(substitution.startsWith(`${BASE_URL}blocked/blocked.html?from=`));
  assert.ok(substitution.endsWith('\\0'));
});

test('buildRules targets main_frame only', () => {
  const [rule] = buildRules(config([site()]), BASE_URL, ctx());
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
});

test('buildRules sets case-insensitive matching explicitly', () => {
  const [rule] = buildRules(config([site()]), BASE_URL, ctx());
  assert.equal(rule.condition.isUrlFilterCaseSensitive, false);
});

test('buildRules throws past the regex-rule cap', () => {
  const many = Array.from({ length: 1001 }, (_, index) =>
    site({ id: `id-${index}`, pattern: `site${index}.com` })
  );
  assert.throws(() => buildRules(config(many), BASE_URL, ctx()), /exceeds the declarativeNetRequest/);
});

test('buildRules rejects bad input', () => {
  assert.throws(() => buildRules(null, BASE_URL, ctx()), /sites must be an array/);
  assert.throws(() => buildRules(config(), '', ctx()), /extensionBaseUrl is required/);
});

test('buildRules rejects a missing or malformed context', () => {
  assert.throws(() => buildRules(config([site()]), BASE_URL), /context/);
  assert.throws(() => buildRules(config([site()]), BASE_URL, ctx({ now: 'now' })), /now/);
  assert.throws(() => buildRules(config([site()]), BASE_URL, ctx({ bypassedHosts: [] })), /bypassedHosts/);
});

/* Schedules and snooze (RuleContext) -------------------------------------------- */

const scheduled = (fields = {}) => site({ overrides: { schedule: WEEKDAY_WORK_SCHEDULE }, ...fields });

test('buildRules includes a site inside its schedule and omits it outside', () => {
  assert.equal(buildRules(config([scheduled()]), BASE_URL, ctx({ now: MONDAY_TEN })).length, 1);
  assert.equal(buildRules(config([scheduled()]), BASE_URL, ctx({ now: SATURDAY_TEN })).length, 0);
});

test('buildRules applies the default schedule to sites without their own', () => {
  const cfg = config([site()]);
  cfg.defaults.schedule = WEEKDAY_WORK_SCHEDULE;
  assert.equal(buildRules(cfg, BASE_URL, ctx({ now: SATURDAY_TEN })).length, 0);
  assert.equal(buildRules(cfg, BASE_URL, ctx({ now: MONDAY_TEN })).length, 1);
});

test('a site\'s own schedule wins over the default one', () => {
  const cfg = config([site({ overrides: { schedule: { days: [6], ranges: [{ start: 0, end: 1440 }] } } })]);
  cfg.defaults.schedule = WEEKDAY_WORK_SCHEDULE;
  assert.equal(buildRules(cfg, BASE_URL, ctx({ now: SATURDAY_TEN })).length, 1);
  assert.equal(buildRules(cfg, BASE_URL, ctx({ now: MONDAY_TEN })).length, 0);
});

test('a site outside its schedule does not shift the rule ids after it', () => {
  const cfg = config([scheduled({ id: 'a', pattern: 'a.com' }), site({ id: 'b', pattern: 'b.com' })]);
  const weekday = buildRules(cfg, BASE_URL, ctx({ now: MONDAY_TEN }));
  const weekend = buildRules(cfg, BASE_URL, ctx({ now: SATURDAY_TEN }));
  assert.equal(weekend.length, 1);
  assert.equal(weekend[0].id, weekday[1].id);
});

test('buildRules returns no rules while snoozed', () => {
  const cfg = config([site({ id: 'a', pattern: 'a.com' }), site({ id: 'b', pattern: 'b.com' })]);
  assert.deepEqual(buildRules(cfg, BASE_URL, ctx({ snoozedUntil: MONDAY_TEN + 60_000 })), []);
});

test('buildRules returns the full set once the snooze has ended', () => {
  const cfg = config([site({ id: 'a', pattern: 'a.com' }), site({ id: 'b', pattern: 'b.com' })]);
  assert.equal(buildRules(cfg, BASE_URL, ctx({ snoozedUntil: MONDAY_TEN })).length, 2);
  assert.equal(buildRules(cfg, BASE_URL, ctx({ snoozedUntil: MONDAY_TEN - 1 })).length, 2);
});

test('isPauseInForce follows the site\'s schedule and any running snooze', () => {
  const cfg = config([scheduled()]);
  const [listed] = cfg.sites;
  assert.equal(isPauseInForce(cfg, listed, { snoozedUntil: null, now: MONDAY_TEN }), true);
  assert.equal(isPauseInForce(cfg, listed, { snoozedUntil: null, now: SATURDAY_TEN }), false);
  assert.equal(isPauseInForce(cfg, listed, { snoozedUntil: MONDAY_TEN + 1, now: MONDAY_TEN }), false);
  assert.equal(isPauseInForce(cfg, listed, { snoozedUntil: MONDAY_TEN, now: MONDAY_TEN }), true);
  assert.throws(() => isPauseInForce(cfg, listed, { snoozedUntil: null, now: 'now' }), /now/);
});

test('findMatchingSite honors subdomain inclusion', () => {
  const withSubs = config([site({ includeSubdomains: true })]);
  const exact = config([site({ includeSubdomains: false })]);

  assert.ok(findMatchingSite(withSubs, 'https://www.ynet.co.il/x'));
  assert.ok(findMatchingSite(withSubs, 'https://ynet.co.il/x'));
  assert.equal(findMatchingSite(exact, 'https://www.ynet.co.il/x'), null);
  assert.ok(findMatchingSite(exact, 'https://ynet.co.il/x'));
});

test('findMatchingSite rejects lookalike domains', () => {
  const cfg = config([site({ includeSubdomains: true })]);
  assert.equal(findMatchingSite(cfg, 'https://ynet.co.il.evil.com/'), null);
});

test('findMatchingSite returns null for disabled sites and bad URLs', () => {
  assert.equal(
    findMatchingSite(config([site({ enabled: false })]), 'https://ynet.co.il/'),
    null
  );
  assert.equal(findMatchingSite(config([site()]), 'not a url'), null);
});

/* ---------------------------------------------------------------------------
 * Schema v2: display names, auto-continue, and permission gating.
 * ------------------------------------------------------------------------ */

/** @returns {object} A v2 config with test defaults. */
function v2Config(overrides = {}) {
  return { schemaVersion: 3, defaults: defaultSettings(), sites: [], ...overrides };
}

/** @returns {object} A v2 site entry with test defaults. */
function v2Site(overrides = {}) {
  return {
    id: 'test-id',
    pattern: 'ynet.co.il',
    displayName: null,
    includeSubdomains: true,
    target: null,
    note: null,
    autoContinue: null,
    countdownSeconds: null,
    enabled: true,
    ...overrides,
  };
}

test('siteLabel prefers the display name', () => {
  assert.equal(siteLabel(v2Site({ displayName: 'The News' })), 'The News');
});

test('siteLabel falls back to the hostname', () => {
  assert.equal(siteLabel(v2Site()), 'ynet.co.il');
});

test('siteLabel ignores a whitespace-only display name', () => {
  assert.equal(siteLabel(v2Site({ displayName: '   ' })), 'ynet.co.il');
});

test('hostnameOf strips www', () => {
  assert.equal(hostnameOf('https://www.wikipedia.org/wiki/X'), 'wikipedia.org');
});

test('hostnameOf returns empty for an unparseable URL', () => {
  assert.equal(hostnameOf('not a url'), '');
});

test('buildRules skips sites without host permission', () => {
  // The core guard: an un-permitted rule is one Chrome installs and ignores,
  // which looks identical to the extension being broken.
  const config = v2Config({ sites: [v2Site()] });
  const rules = buildRules(config, BASE_URL, ctx({ grantedHosts: new Set() }));
  assert.equal(rules.length, 0);
});

test('buildRules includes sites with host permission', () => {
  const config = v2Config({ sites: [v2Site()] });
  const rules = buildRules(config, BASE_URL, ctx({ grantedHosts: new Set(['ynet.co.il']) }));
  assert.equal(rules.length, 1);
});

test('buildRules ignores permission gating when passed null', () => {
  const config = v2Config({ sites: [v2Site()] });
  const rules = buildRules(config, BASE_URL, ctx({ grantedHosts: null }));
  assert.equal(rules.length, 1);
});

test('buildRules keeps rule ids stable when a site is skipped', () => {
  // Ids are derived from array position, so a skipped site must not shift the
  // ids of the sites after it.
  const config = v2Config({
    sites: [
      v2Site({ id: 'a', pattern: 'a.com' }),
      v2Site({ id: 'b', pattern: 'b.com' }),
    ],
  });

  const both = buildRules(config, BASE_URL, ctx({ grantedHosts: new Set(['a.com', 'b.com']) }));
  const onlyB = buildRules(config, BASE_URL, ctx({ grantedHosts: new Set(['b.com']) }));

  const bId = both.find((r) => r.condition.regexFilter.includes('b\\.com')).id;
  assert.equal(onlyB.length, 1);
  assert.equal(onlyB[0].id, bId);
});

/* ---------------------------------------------------------------------------
 * Bypass key resolution.
 *
 * Rules are keyed on the configured pattern; the interstitial reports the
 * requested host. When a user configures "facebook.com" and navigates to
 * "www.facebook.com", a bypass stored under the requested host never matches
 * the rule it is meant to lift, and clicking through returns to the
 * interstitial. Every www-prefixed site was affected.
 * ------------------------------------------------------------------------ */

test('a bypass keyed on the configured pattern lifts the rule', () => {
  const config = v2Config({ sites: [v2Site({ pattern: 'facebook.com' })] });
  const rules = buildRules(config, BASE_URL, ctx({ bypassedHosts: new Set(['facebook.com']) }));
  assert.equal(rules.length, 0);
});

test('a bypass keyed on the requested subdomain does NOT lift the rule', () => {
  // Documents the failure precisely: this is why the resolution happens in the
  // service worker before the bypass is stored.
  const config = v2Config({ sites: [v2Site({ pattern: 'facebook.com' })] });
  const rules = buildRules(config, BASE_URL, ctx({ bypassedHosts: new Set(['www.facebook.com']) }));
  assert.equal(rules.length, 1);
});

test('findMatchingSite maps a requested host back to its configured pattern', () => {
  // The mapping the service worker relies on to key the bypass correctly.
  const config = v2Config({ sites: [v2Site({ pattern: 'facebook.com' })] });
  for (const host of ['www.facebook.com', 'm.facebook.com', 'facebook.com']) {
    const site = findMatchingSite(config, `https://${host}/`);
    assert.ok(site, `no match for ${host}`);
    assert.equal(normalizePattern(site.pattern), 'facebook.com');
  }
});

test('an exact-match site does not resolve a subdomain bypass', () => {
  // includeSubdomains false means www.facebook.com was never blocked, so there
  // is nothing to bypass and no site should match.
  const config = v2Config({
    sites: [v2Site({ pattern: 'facebook.com', includeSubdomains: false })],
  });
  assert.equal(findMatchingSite(config, 'https://www.facebook.com/'), null);
  assert.ok(findMatchingSite(config, 'https://facebook.com/'));
});
