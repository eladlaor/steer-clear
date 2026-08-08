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
