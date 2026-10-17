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
import { nextScheduleBoundary } from '../../src/background/schedule.js';
import {
  LifecycleEvent,
  MessageType,
  OVER_LIMIT_PAUSE_SECONDS,
  Outcome,
  PauseStyle,
  SCHEDULE_ALARM,
  WEEKDAY_WORK_SCHEDULE,
} from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const MINUTE = 60000;

let calls;
const quiet = {};

/** Install a fake chrome with one listed site, reddit.com. */
function install({ defaults = {}, overrides = {}, tabs = [], sync, session, badge } = {}) {
  const fake = createFakeChrome({
    sync: sync ?? {
      schema: 3,
      settings: { defaults: { ...defaultSettings(), ...defaults } },
      [siteKey('r')]: { ...newSite('reddit.com', { id: 'r', order: 0, now: NOW }), overrides },
    },
    session,
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

const recordView = async (viewId, fromUrl = 'https://www.reddit.com/r/all') =>
  (await handleMessage({ type: MessageType.RECORD_VIEW, viewId, fromUrl })).eventId;

const storedStats = () => globalThis.chrome.storage.local.store.stats;

/* GET_RESOLVED_SITE ---------------------------------------------------------------- */

test('two consecutive interceptions of one site get different variants by default', async () => {
  install();
  const first = await resolve();
  await recordView('v1');
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

/* RECORD_VIEW and RECORD_OUTCOME (one event per view) ----------------------------- */

test('resolving the pause page records nothing by itself', async () => {
  install();
  await resolve();
  await resolve();
  assert.equal(storedStats(), undefined);
});

test('RECORD_VIEW logs one left event per view under the configured host', async () => {
  install();
  assert.equal(await recordView('v1'), 'v1');
  assert.equal(await recordView('v1'), 'v1', 'a reload of the same view');
  const stats = storedStats();
  assert.equal(stats.events.length, 1);
  assert.deepEqual(stats.events[0], { id: 'v1', host: 'reddit.com', at: NOW, outcome: Outcome.LEFT });
  assert.equal(stats.totals['reddit.com'], 1);
  assert.equal(stats.outcomesSince, NOW);
});

test('a retyped address within a minute is counted under the first view', async () => {
  install();
  await recordView('v1');
  mock.method(Date, 'now', () => NOW + 30_000);
  assert.equal(await recordView('v2'), 'v1');
  assert.equal(storedStats().events.length, 1);
});

test('RECORD_VIEW for a site that is not listed records nothing', async () => {
  install();
  assert.equal(await recordView('v1', 'https://example.org/'), null);
  assert.equal(storedStats(), undefined);
});

test('RECORD_VIEW with unreadable settings is logged and answers null', async () => {
  install({ sync: { schema: 4 } });
  assert.equal(await recordView('v1'), null);
});

test('RECORD_OUTCOME marks the view steered', async () => {
  install();
  const eventId = await recordView('v1');
  assert.deepEqual(await handleMessage({ type: MessageType.RECORD_OUTCOME, eventId, outcome: Outcome.STEERED }), {});
  assert.equal(storedStats().events[0].outcome, Outcome.STEERED);
});

test('RECORD_OUTCOME accepts only steered; continuing goes through GRANT_BYPASS', async () => {
  install();
  const eventId = await recordView('v1');
  await assert.rejects(
    handleMessage({ type: MessageType.RECORD_OUTCOME, eventId, outcome: Outcome.CONTINUED }),
    /steered/
  );
  assert.equal(storedStats().events[0].outcome, Outcome.LEFT);
});

test('RECORD_OUTCOME for an unknown event is logged and swallowed', async () => {
  install();
  await recordView('v1');
  assert.deepEqual(await handleMessage({ type: MessageType.RECORD_OUTCOME, eventId: 'nope', outcome: Outcome.STEERED }), {});
  assert.equal(storedStats().events[0].outcome, Outcome.LEFT);
});

test('GRANT_BYPASS with the view\'s event id records a continue', async () => {
  install();
  const eventId = await recordView('v1');
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com', eventId }, { tab: { id: 7 } });
  assert.equal(storedStats().events[0].outcome, Outcome.CONTINUED);
  assert.equal((await resolve()).continuesToday, 1);
});

test('GRANT_BYPASS without an event id still grants and records nothing', async () => {
  install();
  const { expiresAt } = await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com' }, { tab: { id: 7 } });
  assert.equal(expiresAt, NOW + 5 * MINUTE);
  assert.equal(storedStats(), undefined);
});

test('GRANT_BYPASS with a malformed event id is refused before anything is granted', async () => {
  install();
  await assert.rejects(
    handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com', eventId: 42 }, { tab: { id: 7 } }),
    /eventId/
  );
  assert.equal(calls.alarms['bypass-expiry:reddit.com'], undefined);
});

/* Daily allowance ------------------------------------------------------------------------ */

test('with a limit of 2, the third pause of the day is over the limit and waits 30 s', async () => {
  install({ defaults: { dailyContinueLimit: 2 } });
  for (const viewId of ['v1', 'v2']) {
    const before = await resolve();
    assert.equal(before.overLimit, false);
    assert.equal(before.pauseSeconds, 0);
    const eventId = await recordView(viewId);
    await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com', eventId }, { tab: { id: 7 } });
    mock.method(Date, 'now', () => NOW + 10 * MINUTE);
  }
  const third = await resolve();
  assert.equal(third.overLimit, true);
  assert.equal(third.continuesToday, 2);
  assert.equal(third.dailyContinueLimit, 2);
  assert.equal(third.pauseSeconds, OVER_LIMIT_PAUSE_SECONDS);

  // Friction, never a wall: continue is still granted.
  const eventId = await recordView('v3');
  const { expiresAt } = await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com', eventId }, { tab: { id: 7 } });
  assert.ok(expiresAt > NOW);
});

test('erasing statistics resets continues today and leaves lifecycle alone', async () => {
  install({ defaults: { dailyContinueLimit: 1 } });
  await resolve(); // shows and stamps the variation notice
  const eventId = await recordView('v1');
  await handleMessage({ type: MessageType.GRANT_BYPASS, host: 'reddit.com', eventId }, { tab: { id: 7 } });
  assert.equal((await resolve()).overLimit, true);

  await handleMessage({ type: MessageType.CLEAR_STATS });
  assert.equal(storedStats(), undefined);
  assert.equal(globalThis.chrome.storage.local.store.lifecycle.variationNoticeSeenAt, NOW);
  const after = await resolve();
  assert.equal(after.continuesToday, 0);
  assert.equal(after.overLimit, false);
});

/* Schedules and snooze in the rebuild ---------------------------------------------------- */

test('a rebuild sets the schedule alarm to the next boundary', async () => {
  install({ overrides: { schedule: WEEKDAY_WORK_SCHEDULE } });
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.deepEqual(calls.alarms[SCHEDULE_ALARM], { when: nextScheduleBoundary([WEEKDAY_WORK_SCHEDULE], NOW) });
});

test('a rebuild clears the schedule alarm when every site is always on', async () => {
  install();
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.equal(calls.alarms[SCHEDULE_ALARM], undefined);
  assert.ok(calls.clearedAlarms.includes(SCHEDULE_ALARM));
});

test('a disabled site\'s schedule sets no alarm', async () => {
  const site = { ...newSite('reddit.com', { id: 'r', order: 0, now: NOW }), enabled: false, overrides: { schedule: WEEKDAY_WORK_SCHEDULE } };
  install({ sync: { schema: 3, [siteKey('r')]: site } });
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.ok(calls.clearedAlarms.includes(SCHEDULE_ALARM));
});

test('while snoozed the rebuild installs no rules', async () => {
  install({ session: { snooze: { until: NOW + MINUTE } } });
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.equal(calls.dynamicRules.length, 0);
});

test('an ended snooze no longer removes the rules', async () => {
  install({ session: { snooze: { until: NOW - 1 } } });
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.equal(calls.dynamicRules.length, 1);
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
