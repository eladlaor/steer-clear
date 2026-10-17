/**
 * Handler-level tests for the worker, with chrome.* stubbed in memory.
 * Run: node --test tests/unit/
 */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { handleMessage } from '../../src/background/message_handlers.js';
import { expireBypass } from '../../src/background/rule_sync.js';
import { newSite } from '../../src/background/config_mutations.js';
import { siteKey } from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { LifecycleEvent, MessageType, PauseStyle } from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const MINUTE = 60000;

let calls;
const quiet = {};

/** Install a fake chrome with one listed site, reddit.com. */
function install({ defaults = {}, tabs = [], sync, badge } = {}) {
  const fake = createFakeChrome({
    sync: sync ?? {
      schema: 3,
      settings: { defaults: { ...defaultSettings(), ...defaults } },
      [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }),
    },
    tabs,
    badge,
  });
  globalThis.chrome = fake.chrome;
  calls = fake.calls;
  return fake;
}

beforeEach(() => {
  mock.method(Date, 'now', () => NOW);
  for (const level of ['info', 'warn', 'error']) {
    quiet[level] = console[level];
    console[level] = () => {};
  }
});

afterEach(() => {
  mock.restoreAll();
  delete globalThis.chrome;
  for (const level of Object.keys(quiet)) console[level] = quiet[level];
});

const resolve = (fromUrl = 'https://www.reddit.com/r/all') =>
  handleMessage({ type: MessageType.GET_RESOLVED_SITE, fromUrl });

/* GET_RESOLVED_SITE ---------------------------------------------------------------- */

test('two consecutive interceptions of one site get different variants by default', async () => {
  install();
  const first = await resolve();
  const second = await resolve();
  assert.notDeepEqual(first.variant, second.variant);
  assert.notEqual(first.variant.layout, second.variant.layout);
  assert.notEqual(first.variant.palette, second.variant.palette);
  assert.notEqual(first.variant.prompt.lead, second.variant.prompt.lead);
});

test('with varyPresentation off, consecutive interceptions look the same and no notice shows', async () => {
  install({ defaults: { varyPresentation: false } });
  const first = await resolve();
  const second = await resolve();
  assert.deepEqual(first.variant, second.variant);
  assert.equal(first.showVariationNotice, false);
});

test('GET_RESOLVED_SITE returns the documented fields', async () => {
  install({ defaults: { reasons: ['focus'], bypassMinutes: 15, pauseStyle: PauseStyle.BREATHING, pauseSeconds: 20 } });
  const view = await resolve();
  assert.equal(view.host, 'www.reddit.com');
  assert.equal(view.siteName, 'reddit.com');
  assert.equal(view.reason, 'focus');
  assert.equal(view.pauseStyle, PauseStyle.BREATHING);
  assert.equal(view.pauseSeconds, 20);
  assert.equal(view.breathCount, 2);
  assert.equal(view.bypassMinutes, 15);
  assert.equal(view.matched, true);
  assert.equal(view.degraded, false);
  assert.equal(view.showVariationNotice, true);
});

test('the variation notice shows on the first visit only, even without "Got it"', async () => {
  install();
  assert.equal((await resolve()).showVariationNotice, true);
  assert.equal((await resolve()).showVariationNotice, false);
  assert.equal((await resolve()).showVariationNotice, false);
  assert.equal(globalThis.chrome.storage.local.store.lifecycle.variationNoticeSeenAt, NOW);
});

test('"Got it" before any visit means the notice never shows', async () => {
  install();
  await handleMessage({ type: MessageType.RECORD_LIFECYCLE_EVENT, event: LifecycleEvent.VARIATION_NOTICE_SEEN });
  assert.equal((await resolve()).showVariationNotice, false);
});

test('with varyPresentation off the notice is not used up', async () => {
  install({ defaults: { varyPresentation: false } });
  await resolve();
  assert.equal(globalThis.chrome.storage.local.store.lifecycle, undefined);
});

test('the pause page still renders when the notice cannot be recorded', async () => {
  const fake = install();
  const set = fake.chrome.storage.local.set;
  fake.chrome.storage.local.set = async (items) => {
    if ('lifecycle' in items) throw new Error('quota');
    return set.call(fake.chrome.storage.local, items);
  };
  const view = await resolve();
  assert.equal(view.showVariationNotice, true);
  assert.equal(view.reason, '');
});

test('settings from a newer version still get a usable, degraded pause page', async () => {
  install({ sync: { schema: 4 } });
  const view = await resolve();
  assert.equal(view.degraded, true);
  assert.equal(view.host, 'www.reddit.com');
  assert.equal(view.siteName, 'www.reddit.com');
  assert.equal(typeof view.target, 'string');
});

/* GRANT_BYPASS and expiry ------------------------------------------------------------------ */

test('a 15-minute bypass expires at now + 15 minutes and badges the pause tab', async () => {
  install({ defaults: { bypassMinutes: 15 } });
  const { expiresAt } = await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' }, { tab: { id: 7 } });
  assert.equal(expiresAt, NOW + 15 * MINUTE);
  assert.deepEqual(calls.alarms['bypass-expiry:reddit.com'], { when: NOW + 15 * MINUTE });
  assert.deepEqual(calls.badges, [{ tabId: 7, text: '15m' }]);
  assert.ok(calls.alarms['bypass-tick'], 'the per-minute badge refresh starts');
  assert.equal(calls.dynamicRules.length, 0, 'the rule is lifted');
});

test('the bypass still works on a browser without a toolbar badge', async () => {
  install({ badge: false });
  const { expiresAt } = await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com' }, { tab: { id: 7 } });
  assert.equal(expiresAt, NOW + 5 * MINUTE);
});

test('with return-on-expiry on, expiry sends tabs on the site back to the pause page', async () => {
  const tabs = [
    { id: 1, url: 'https://www.reddit.com/r/all/comments/x' },
    { id: 2, url: 'https://notreddit.com/' },
  ];
  install({ defaults: { returnPauseOnExpiry: true, bypassMinutes: 1 }, tabs });
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com' }, { tab: { id: 1 } });
  mock.method(Date, 'now', () => NOW + MINUTE);
  await expireBypass('reddit.com');

  assert.deepEqual(calls.tabUpdates, [
    {
      tabId: 1,
      url: `chrome-extension://test/blocked/blocked.html?from=${encodeURIComponent('https://www.reddit.com/r/all/comments/x')}`,
    },
  ]);
  assert.equal(calls.dynamicRules.length, 1, 'the rule is back');
  assert.ok(calls.clearedAlarms.includes('bypass-tick'));
});

test('with return-on-expiry off, expiry only clears the badge', async () => {
  install({ tabs: [{ id: 1, url: 'https://reddit.com/' }] });
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com' }, { tab: { id: 1 } });
  calls.badges.length = 0;
  await expireBypass('reddit.com');
  assert.deepEqual(calls.tabUpdates, []);
  assert.deepEqual(calls.badges, [{ tabId: 1, text: '' }]);
});

/* Config mutations ------------------------------------------------------------------------------ */

test('ADD_SITES then UPDATE_SITE persist through the worker', async () => {
  install();
  const { added, skipped } = await handleMessage({
    type: MessageType.ADD_SITES,
    entries: [{ host: 'youtube.com', reason: 'later' }, { host: 'reddit.com' }],
  });
  assert.equal(added.length, 1);
  assert.deepEqual(skipped, ['reddit.com']);

  await handleMessage({ type: MessageType.UPDATE_SITE, siteId: added[0], setOverrides: { pauseStyle: PauseStyle.INTENTION } });
  const stored = globalThis.chrome.storage.sync.store[siteKey(added[0])];
  assert.deepEqual(stored.overrides, { reasons: ['later'], pauseStyle: PauseStyle.INTENTION });
});

test('a rejected mutation writes nothing', async () => {
  install();
  await assert.rejects(
    handleMessage({ type: MessageType.UPDATE_DEFAULTS, patch: { bypassMinutes: 7 } }),
    /bypassMinutes/
  );
  assert.deepEqual(calls.syncSets, []);
});

test('an unknown message type is refused', async () => {
  install();
  await assert.rejects(handleMessage({ type: 'NOPE' }), /unknown message type/);
});
