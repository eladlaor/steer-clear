/**
 * Unit tests for the degraded safety path: when the saved settings cannot be
 * read, the pause page still renders and "continue" still works.
 * Run: node --test tests/unit/
 *
 * "You're never locked out" is the one promise the product makes. A corrupt
 * sync item or settings from a newer version must not turn the pause page
 * into a wall.
 */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { degradedSiteView, ruleIdsMatchingUrl } from '../../src/background/degraded.js';
import { handleMessage } from '../../src/background/message_handlers.js';
import { expireBypass, rebuildRules } from '../../src/background/rule_sync.js';
import { buildRules } from '../../src/background/rules.js';
import { newSite } from '../../src/background/config_mutations.js';
import { siteKey } from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { BYPASS_ALARM_PREFIX, MessageType, MS_PER_MINUTE, StorageKey } from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const BASE = 'chrome-extension://test/';
const CONTEXT = { bypassedHosts: new Set(), grantedHosts: null, snoozedUntil: null, now: NOW };

/** Two listed sites, reddit.com (with subdomains) and youtube.com. */
function syncItems() {
  return {
    schema: 3,
    settings: { defaults: defaultSettings() },
    [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }),
    [siteKey('y')]: newSite('youtube.com', { id: 'y', order: 1, now: NOW }),
  };
}

function rulesFor(sites) {
  return buildRules({ defaults: defaultSettings(), sites }, BASE, CONTEXT);
}

/* ruleIdsMatchingUrl -------------------------------------------------------------- */

test('ruleIdsMatchingUrl matches a subdomain against a subdomain-inclusive rule', () => {
  const rules = rulesFor([newSite('reddit.com', { id: 'r', order: 0, now: NOW })]);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://www.reddit.com/'), [rules[0].id]);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://reddit.com/r/all?x=1'), [rules[0].id]);
});

test('ruleIdsMatchingUrl never matches a lookalike host', () => {
  const rules = rulesFor([newSite('reddit.com', { id: 'r', order: 0, now: NOW })]);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://notreddit.com/'), []);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://reddit.com.evil.example/'), []);
});

test('ruleIdsMatchingUrl returns only the rules that match, from several', () => {
  const rules = rulesFor([
    newSite('reddit.com', { id: 'r', order: 0, now: NOW }),
    newSite('youtube.com', { id: 'y', order: 1, now: NOW }),
  ]);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://m.youtube.com/watch'), [rules[1].id]);
});

test('ruleIdsMatchingUrl respects an exact-host rule', () => {
  const exact = { ...newSite('reddit.com', { id: 'r', order: 0, now: NOW }), includeSubdomains: false };
  const rules = rulesFor([exact]);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://www.reddit.com/'), []);
  assert.deepEqual(ruleIdsMatchingUrl(rules, 'https://REDDIT.com/'), [rules[0].id]);
});

test('ruleIdsMatchingUrl ignores rules without a regex filter and rejects bad input', () => {
  assert.deepEqual(ruleIdsMatchingUrl([{ id: 7, condition: { urlFilter: 'x' } }], 'https://x.com/'), []);
  assert.throws(() => ruleIdsMatchingUrl(null, 'https://x.com/'), /rules must be an array/);
  assert.throws(() => ruleIdsMatchingUrl([], ''), /url/);
});

/* degradedSiteView ---------------------------------------------------------------- */

test('degradedSiteView shows the host with default settings, flagged degraded', () => {
  const view = degradedSiteView('www.reddit.com');
  const defaults = defaultSettings();
  assert.equal(view.host, 'www.reddit.com');
  assert.equal(view.siteName, 'www.reddit.com');
  assert.equal(view.target, defaults.target);
  assert.equal(view.bypassMinutes, defaults.bypassMinutes);
  assert.equal(view.degraded, true);
  assert.equal(view.matched, false);
  assert.equal(view.showVariationNotice, false);
  assert.throws(() => degradedSiteView(''), /host/);
});

/* The worker with unreadable settings ------------------------------------------------ */

let fake;
const quiet = {};

beforeEach(async () => {
  mock.method(Date, 'now', () => NOW);
  for (const level of ['info', 'warn', 'error']) {
    quiet[level] = console[level];
    console[level] = () => {};
  }
  fake = createFakeChrome({ sync: syncItems() });
  globalThis.chrome = fake.chrome;
  await rebuildRules();
  assert.equal(fake.calls.dynamicRules.length, 2, 'both rules installed before the corruption');
});

afterEach(() => {
  mock.restoreAll();
  delete globalThis.chrome;
  for (const level of Object.keys(quiet)) console[level] = quiet[level];
});

/** Make every storage.sync read fail, as a corrupt store would. */
function breakSyncReads() {
  fake.chrome.storage.sync.get = async () => {
    throw new Error('simulated: sync storage unreadable');
  };
}

/** Settings written by a newer version: readConfig refuses them. */
function writeNewerSchema() {
  fake.chrome.storage.sync.store.schema = 4;
}

const ruleIds = () => fake.calls.dynamicRules.map((rule) => rule.id).sort();

for (const [label, corrupt] of [
  ['readConfig throws', breakSyncReads],
  ['schema 4 from a newer version', writeNewerSchema],
]) {
  test(`${label}: GET_RESOLVED_SITE answers degraded with the host`, async () => {
    corrupt();
    const view = await handleMessage({ type: MessageType.GET_RESOLVED_SITE, fromUrl: 'https://www.reddit.com/r/all' });
    assert.equal(view.degraded, true);
    assert.equal(view.host, 'www.reddit.com');
  });

  test(`${label}: GRANT_BYPASS lifts exactly the matching rules and resolves`, async () => {
    const before = structuredClone(fake.calls.dynamicRules);
    const expected = ruleIdsMatchingUrl(before, 'https://www.reddit.com/');
    assert.equal(expected.length, 1);
    corrupt();

    const { expiresAt } = await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });

    assert.equal(expiresAt, NOW + defaultSettings().bypassMinutes * MS_PER_MINUTE);
    assert.deepEqual(ruleIds(), before.map((rule) => rule.id).filter((id) => !expected.includes(id)));
    const session = fake.chrome.storage.session.store;
    assert.deepEqual(session[StorageKey.LIFTED_RULES]['www.reddit.com'].map((rule) => rule.id), expected);
    assert.equal(session[StorageKey.BYPASSES]['www.reddit.com'], expiresAt);
    assert.equal(fake.calls.alarms[`${BYPASS_ALARM_PREFIX}www.reddit.com`].when, expiresAt);
  });

  test(`${label}: on expiry with settings still unreadable, the lifted rules come back`, async () => {
    const before = structuredClone(fake.calls.dynamicRules);
    corrupt();
    await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });

    await expireBypass('www.reddit.com');

    assert.deepEqual(ruleIds(), before.map((rule) => rule.id).sort());
    assert.deepEqual(fake.calls.dynamicRules.find((rule) => rule.id === before[0].id), before[0]);
    const session = fake.chrome.storage.session.store;
    assert.equal(session[StorageKey.LIFTED_RULES]['www.reddit.com'], undefined);
    assert.equal(session[StorageKey.BYPASSES]['www.reddit.com'], undefined);
  });
}

test('a degraded bypass that ends after the settings are fixed rebuilds normally', async () => {
  const before = structuredClone(fake.calls.dynamicRules);
  const syncStore = structuredClone(fake.chrome.storage.sync.store);
  writeNewerSchema();
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });

  fake.chrome.storage.sync.store.schema = syncStore.schema;
  await expireBypass('www.reddit.com');

  assert.deepEqual(ruleIds(), before.map((rule) => rule.id).sort());
  assert.equal(fake.chrome.storage.session.store[StorageKey.LIFTED_RULES]['www.reddit.com'], undefined);
});

test('two degraded bypasses of one site lift its rule once and restore it once', async () => {
  const before = structuredClone(fake.calls.dynamicRules);
  writeNewerSchema();
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });

  assert.equal(fake.chrome.storage.session.store[StorageKey.LIFTED_RULES]['www.reddit.com'].length, 1);
  await expireBypass('www.reddit.com');
  assert.deepEqual(ruleIds(), before.map((rule) => rule.id).sort());
});

test('a normal bypass that ends while settings are unreadable still fails loudly', async () => {
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });
  writeNewerSchema();
  await assert.rejects(expireBypass('reddit.com'), /newer version/);
  // The badge and bypass bookkeeping are still cleaned up before the error.
  assert.equal(fake.chrome.storage.session.store[StorageKey.BYPASSES]['reddit.com'], undefined);
});
