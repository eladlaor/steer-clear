/**
 * Snooze ("turn every reminder off for N minutes") and the popup's status
 * message, with chrome.* stubbed in memory.
 * Run: node --test tests/unit/
 */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { handleMessage } from '../../src/background/message_handlers.js';
import { activeSnoozeUntil, snoozeEndsAt } from '../../src/background/snooze.js';
import { endSnooze } from '../../src/background/rule_sync.js';
import { newSite } from '../../src/background/config_mutations.js';
import { siteKey } from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { MessageType, SNOOZE_ALARM, SNOOZE_OPTIONS_MINUTES } from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const MINUTE = 60000;
const quiet = {};
let fake;

function install({ sync, session } = {}) {
  fake = createFakeChrome({
    sync: sync ?? {
      schema: 3,
      settings: { defaults: defaultSettings() },
      [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }),
    },
    session,
  });
  globalThis.chrome = fake.chrome;
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

/* Pure helpers ------------------------------------------------------------------------- */

test('snoozeEndsAt accepts only the offered lengths', () => {
  for (const minutes of SNOOZE_OPTIONS_MINUTES) {
    assert.equal(snoozeEndsAt(minutes, NOW), NOW + minutes * MINUTE);
  }
  for (const bad of [0, 7, -15, '15', null]) {
    assert.throws(() => snoozeEndsAt(bad, NOW), /snooze/i, String(bad));
  }
});

test('activeSnoozeUntil is the end time while running, else null', () => {
  assert.equal(activeSnoozeUntil(undefined, NOW), null);
  assert.equal(activeSnoozeUntil({ until: NOW + 1 }, NOW), NOW + 1);
  assert.equal(activeSnoozeUntil({ until: NOW }, NOW), null);
  assert.throws(() => activeSnoozeUntil({ until: 'soon' }, NOW), /until/);
});

/* SET_SNOOZE / CLEAR_SNOOZE ------------------------------------------------------------ */

test('SET_SNOOZE stores the end, sets the alarm and removes every rule', async () => {
  install();
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.equal(fake.calls.dynamicRules.length, 1);

  const { until } = await handleMessage({ type: MessageType.SET_SNOOZE, minutes: 15 });
  assert.equal(until, NOW + 15 * MINUTE);
  assert.deepEqual(fake.chrome.storage.session.store.snooze, { until });
  assert.deepEqual(fake.calls.alarms[SNOOZE_ALARM], { when: until });
  assert.equal(fake.calls.dynamicRules.length, 0);
});

test('SET_SNOOZE rejects a length the popup does not offer and changes nothing', async () => {
  install();
  await assert.rejects(handleMessage({ type: MessageType.SET_SNOOZE, minutes: 5 }), /snooze/i);
  assert.equal(fake.chrome.storage.session.store.snooze, undefined);
  assert.equal(fake.calls.alarms[SNOOZE_ALARM], undefined);
});

test('SET_SNOOZE writes nothing to sync', async () => {
  install();
  await handleMessage({ type: MessageType.SET_SNOOZE, minutes: 30 });
  assert.deepEqual(fake.calls.syncSets, []);
});

test('CLEAR_SNOOZE ("Resume now") restores the rules at once', async () => {
  install({ session: { snooze: { until: NOW + 10 * MINUTE } } });
  await handleMessage({ type: MessageType.REBUILD_RULES });
  assert.equal(fake.calls.dynamicRules.length, 0);

  await handleMessage({ type: MessageType.CLEAR_SNOOZE });
  assert.equal(fake.chrome.storage.session.store.snooze, undefined);
  assert.ok(fake.calls.clearedAlarms.includes(SNOOZE_ALARM));
  assert.equal(fake.calls.dynamicRules.length, 1);
});

test('the snooze alarm ends the snooze the same way', async () => {
  install({ session: { snooze: { until: NOW - 1 } } });
  await endSnooze();
  assert.equal(fake.chrome.storage.session.store.snooze, undefined);
  assert.equal(fake.calls.dynamicRules.length, 1);
});

/* GET_STATUS --------------------------------------------------------------------------- */

test('GET_STATUS reports a running snooze and no config error', async () => {
  install({ session: { snooze: { until: NOW + 5 * MINUTE } } });
  assert.deepEqual(await handleMessage({ type: MessageType.GET_STATUS }), {
    snoozedUntil: NOW + 5 * MINUTE,
    configError: null,
  });
});

test('GET_STATUS treats an ended snooze as none', async () => {
  install({ session: { snooze: { until: NOW - 1 } } });
  assert.equal((await handleMessage({ type: MessageType.GET_STATUS })).snoozedUntil, null);
});

test('GET_STATUS reports settings it cannot read instead of failing', async () => {
  install({ sync: { schema: 4 } });
  const status = await handleMessage({ type: MessageType.GET_STATUS });
  assert.equal(status.snoozedUntil, null);
  assert.match(status.configError, /update the extension/);
});
