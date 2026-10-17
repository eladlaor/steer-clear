/**
 * Unit tests for the bypass badge and tab helpers.
 * Run: node --test tests/unit/
 *
 * A bypass that only lifts a rule never ends on a single-page site (Reddit,
 * YouTube): the tab never makes another request the rule could catch. These
 * helpers make the end visible (badge) and, opt-in, enforced (return the tab
 * to the pause page).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  tabQueryPattern,
  tabsOnSite,
  badgeText,
  expiredTabs,
  bypassExpiresAt,
  pausePageUrl,
} from '../../src/background/bypass_tabs.js';
import { extractSourceUrl } from '../../src/shared/source_url.js';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const NOW = 1_700_000_000_000;

function site(fields = {}) {
  return {
    id: 'r',
    pattern: 'reddit.com',
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: null,
    order: 0,
    overrides: {},
    ...fields,
  };
}

const tab = (id, url) => ({ id, url });

/* badgeText (criterion 3) ----------------------------------------------------- */

test('badgeText rounds minutes left up', () => {
  assert.equal(badgeText(NOW + 4 * MINUTE + 1 * SECOND, NOW), '5m');
  assert.equal(badgeText(NOW + 60 * SECOND, NOW), '1m');
  assert.equal(badgeText(NOW + 1, NOW), '1m');
  assert.equal(badgeText(NOW + 5 * MINUTE, NOW), '5m');
});

test('badgeText is empty once expired', () => {
  assert.equal(badgeText(NOW, NOW), '');
  assert.equal(badgeText(NOW - MINUTE, NOW), '');
});

/* tabQueryPattern and tabsOnSite (criterion 3) ------------------------------------ */

test('tabQueryPattern includes subdomains only when the site does', () => {
  assert.equal(tabQueryPattern(site()), '*://*.reddit.com/*');
  assert.equal(tabQueryPattern(site({ includeSubdomains: false })), '*://reddit.com/*');
});

test('tabQueryPattern normalizes the stored pattern', () => {
  assert.equal(tabQueryPattern(site({ pattern: 'https://WWW.Reddit.com/r/x' })), '*://*.www.reddit.com/*');
});

test('tabsOnSite keeps the site and its subdomains and drops lookalikes', () => {
  const tabs = [
    tab(1, 'https://reddit.com/r/x'),
    tab(2, 'https://old.reddit.com/'),
    tab(3, 'https://notreddit.com/'),
    tab(4, 'https://reddit.com.evil.example/'),
    tab(5, undefined),
  ];
  assert.deepEqual(tabsOnSite(tabs, site()).map((t) => t.id), [1, 2]);
  assert.deepEqual(tabsOnSite(tabs, site({ includeSubdomains: false })).map((t) => t.id), [1]);
});

test('tabsOnSite still matches a site that was disabled during its bypass', () => {
  assert.deepEqual(tabsOnSite([tab(1, 'https://reddit.com/')], site({ enabled: false })).map((t) => t.id), [1]);
});

/* expiredTabs (criterion 4) ----------------------------------------------------------- */

test('expiredTabs returns the tabs on a site whose bypass has ended', () => {
  const tabs = [tab(1, 'https://www.reddit.com/'), tab(2, 'https://youtube.com/'), tab(3, 'https://notreddit.com/')];
  assert.deepEqual(expiredTabs(tabs, site(), {}, NOW).map((t) => t.id), [1]);
  assert.deepEqual(expiredTabs(tabs, site(), { 'reddit.com': NOW - 1 }, NOW).map((t) => t.id), [1]);
});

test('expiredTabs excludes a site with a newer active bypass', () => {
  const tabs = [tab(1, 'https://reddit.com/')];
  assert.deepEqual(expiredTabs(tabs, site(), { 'reddit.com': NOW + MINUTE }, NOW), []);
});

test('expiredTabs ignores active bypasses of other sites', () => {
  const tabs = [tab(1, 'https://reddit.com/')];
  assert.deepEqual(expiredTabs(tabs, site(), { 'youtube.com': NOW + MINUTE }, NOW).map((t) => t.id), [1]);
});

/* Expiry time (criterion 11) -------------------------------------------------------------- */

test('a 15-minute bypass expires at now + 15 x 60,000', () => {
  assert.equal(bypassExpiresAt(NOW, 15), NOW + 15 * 60000);
  assert.equal(bypassExpiresAt(NOW, 1), NOW + 60000);
});

test('bypassExpiresAt rejects a length that is not offered', () => {
  assert.throws(() => bypassExpiresAt(NOW, 7), /bypassMinutes/);
});

/* Return to the pause page --------------------------------------------------------------- */

test('pausePageUrl carries the tab address so the pause page reads it back exactly', () => {
  const base = 'chrome-extension://abc/';
  const source = 'https://www.youtube.com/watch?v=x&t=10#comments';
  const url = pausePageUrl(base, source);
  assert.ok(url.startsWith('chrome-extension://abc/blocked/blocked.html?from='));
  assert.equal(extractSourceUrl(url), source);
});
