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
  resolveSiteSettings,
  siteLabel,
  hostnameOf,
} from '../../src/background/rules.js';

const BASE_URL = 'chrome-extension://abcdefghijklmnop/';

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
  return {
    schemaVersion: 1,
    globalTarget: 'https://example.com/',
    globalNote: 'global note',
    sites,
  };
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
    BASE_URL
  );

  assert.equal(rules.length, 2);
  assert.notEqual(rules[0].id, rules[1].id);
});

test('buildRules skips disabled sites', () => {
  const rules = buildRules(config([site({ enabled: false })]), BASE_URL);
  assert.equal(rules.length, 0);
});

test('buildRules skips bypassed hosts', () => {
  const rules = buildRules(
    config([site({ pattern: 'ynet.co.il' })]),
    BASE_URL,
    new Set(['ynet.co.il'])
  );
  assert.equal(rules.length, 0);
});

test('buildRules skips malformed patterns without throwing', () => {
  const rules = buildRules(
    config([site({ pattern: 'garbage' }), site({ pattern: 'ynet.co.il' })]),
    BASE_URL
  );
  assert.equal(rules.length, 1);
});

test('buildRules redirect preserves the source URL via \\0', () => {
  const [rule] = buildRules(config([site()]), BASE_URL);
  const substitution = rule.action.redirect.regexSubstitution;

  assert.ok(substitution.startsWith(`${BASE_URL}blocked/blocked.html?from=`));
  assert.ok(substitution.endsWith('\\0'));
});

test('buildRules targets main_frame only', () => {
  const [rule] = buildRules(config([site()]), BASE_URL);
  assert.deepEqual(rule.condition.resourceTypes, ['main_frame']);
});

test('buildRules sets case-insensitive matching explicitly', () => {
  const [rule] = buildRules(config([site()]), BASE_URL);
  assert.equal(rule.condition.isUrlFilterCaseSensitive, false);
});

test('buildRules throws past the regex-rule cap', () => {
  const many = Array.from({ length: 1001 }, (_, index) =>
    site({ id: `id-${index}`, pattern: `site${index}.com` })
  );
  assert.throws(() => buildRules(config(many), BASE_URL), /exceeds the declarativeNetRequest/);
});

test('buildRules rejects bad input', () => {
  assert.throws(() => buildRules(null, BASE_URL), /sites must be an array/);
  assert.throws(() => buildRules(config(), ''), /extensionBaseUrl is required/);
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

test('resolveSiteSettings falls back to globals', () => {
  const cfg = config();
  const resolved = resolveSiteSettings(cfg, site({ target: null, note: null }));

  assert.equal(resolved.target, 'https://example.com/');
  assert.equal(resolved.note, 'global note');
});

test('resolveSiteSettings prefers per-site overrides', () => {
  const cfg = config();
  const resolved = resolveSiteSettings(
    cfg,
    site({ target: 'https://override.com/', note: 'site note' })
  );

  assert.equal(resolved.target, 'https://override.com/');
  assert.equal(resolved.note, 'site note');
});

test('resolveSiteSettings treats whitespace-only overrides as absent', () => {
  const cfg = config();
  const resolved = resolveSiteSettings(cfg, site({ target: '   ', note: '  ' }));

  assert.equal(resolved.target, 'https://example.com/');
  assert.equal(resolved.note, 'global note');
});

test('resolveSiteSettings handles a null site', () => {
  const resolved = resolveSiteSettings(config(), null);
  assert.equal(resolved.target, 'https://example.com/');
});

/* ---------------------------------------------------------------------------
 * Schema v2: display names, auto-continue, and permission gating.
 * ------------------------------------------------------------------------ */

/** @returns {object} A v2 config with test defaults. */
function v2Config(overrides = {}) {
  return {
    schemaVersion: 2,
    globalTarget: 'https://example.com',
    globalTargetName: 'Example',
    globalNote: 'global note',
    globalAutoContinue: false,
    globalCountdownSeconds: 3,
    sites: [],
    ...overrides,
  };
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

test('resolveSiteSettings inherits autoContinue from global', () => {
  const config = v2Config({ globalAutoContinue: true });
  const resolved = resolveSiteSettings(config, v2Site());
  assert.equal(resolved.autoContinue, true);
});

test('resolveSiteSettings lets a site turn autoContinue off', () => {
  // false must override a true global — the bug here is treating false as
  // "unset" and falling through to the global.
  const config = v2Config({ globalAutoContinue: true });
  const resolved = resolveSiteSettings(config, v2Site({ autoContinue: false }));
  assert.equal(resolved.autoContinue, false);
});

test('resolveSiteSettings lets a site turn autoContinue on', () => {
  const config = v2Config({ globalAutoContinue: false });
  const resolved = resolveSiteSettings(config, v2Site({ autoContinue: true }));
  assert.equal(resolved.autoContinue, true);
});

test('resolveSiteSettings inherits and overrides the countdown', () => {
  const config = v2Config({ globalCountdownSeconds: 3 });
  assert.equal(resolveSiteSettings(config, v2Site()).countdownSeconds, 3);
  assert.equal(
    resolveSiteSettings(config, v2Site({ countdownSeconds: 10 })).countdownSeconds,
    10
  );
});

test('resolveSiteSettings uses the target hostname when unnamed', () => {
  const config = v2Config({ globalTargetName: '' });
  const resolved = resolveSiteSettings(config, v2Site());
  assert.equal(resolved.targetName, 'example.com');
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
  const rules = buildRules(config, BASE_URL, new Set(), new Set());
  assert.equal(rules.length, 0);
});

test('buildRules includes sites with host permission', () => {
  const config = v2Config({ sites: [v2Site()] });
  const rules = buildRules(config, BASE_URL, new Set(), new Set(['ynet.co.il']));
  assert.equal(rules.length, 1);
});

test('buildRules ignores permission gating when passed null', () => {
  const config = v2Config({ sites: [v2Site()] });
  const rules = buildRules(config, BASE_URL, new Set(), null);
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

  const both = buildRules(config, BASE_URL, new Set(), new Set(['a.com', 'b.com']));
  const onlyB = buildRules(config, BASE_URL, new Set(), new Set(['b.com']));

  const bId = both.find((r) => r.condition.regexFilter.includes('b\\.com')).id;
  assert.equal(onlyB.length, 1);
  assert.equal(onlyB[0].id, bId);
});
