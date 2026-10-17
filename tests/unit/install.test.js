/**
 * First install and update: what the worker does, and above all what it
 * does not write.
 * Run: node --test tests/unit/
 *
 * On a second device, sync can install the extension before the synced
 * settings arrive. A write at that moment would be the newest write and
 * could replace the user's settings on every device, so installing must
 * never write to storage.sync.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { handleInstalled } from '../../src/background/install.js';
import { readConfig } from '../../src/background/config.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { newSite } from '../../src/background/config_mutations.js';
import { siteKey } from '../../src/background/sync_layout.js';
import { ONBOARDING_PATH, STATS_PRUNE_ALARM, StorageKey } from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const quiet = {};

/** A config in the shape 1.0.0 wrote. */
function v2Config() {
  return {
    schemaVersion: 2,
    globalTarget: 'https://example.com/',
    globalTargetName: 'Example',
    globalNote: 'write first',
    globalAutoContinue: false,
    globalCountdownSeconds: 3,
    sites: [
      {
        id: 'a',
        pattern: 'reddit.com',
        displayName: null,
        includeSubdomains: true,
        target: null,
        note: 'not now',
        enabled: true,
        autoContinue: null,
        countdownSeconds: null,
      },
    ],
  };
}

/** A 2.0 device's sync: the legacy item, the marker, its own settings and two site items. */
function v3Items() {
  return {
    config: v2Config(),
    schema: 3,
    [StorageKey.SETTINGS]: { defaults: { ...defaultSettings(), reasons: ['synced default'] } },
    [siteKey('s1')]: newSite('reddit.com', { id: 's1', order: 0, now: NOW }),
    [siteKey('s2')]: newSite('youtube.com', { id: 's2', order: 1, now: NOW, reason: 'later' }),
  };
}

/** Install a fake chrome and return its sync store and call log. */
function install(sync) {
  const fake = createFakeChrome({ sync });
  globalThis.chrome = fake.chrome;
  return fake;
}

beforeEach(() => {
  for (const level of ['info', 'warn', 'error']) {
    quiet[level] = console[level];
    console[level] = () => {};
  }
});

afterEach(() => {
  delete globalThis.chrome;
  for (const level of Object.keys(quiet)) console[level] = quiet[level];
});

for (const [name, items] of [
  ['a 1.x config', () => ({ config: v2Config() })],
  ['a 2.0 layout with the legacy config', v3Items],
  ['empty storage', () => ({})],
]) {
  test(`install then readConfig writes nothing to sync (${name})`, async () => {
    const before = items();
    const fake = install(structuredClone(before));

    await handleInstalled({ reason: 'install' });
    await readConfig();

    assert.deepEqual(fake.calls.syncSets, []);
    assert.deepEqual(fake.calls.syncRemoves, []);
    assert.deepEqual(fake.chrome.storage.sync.store, before);
    assert.deepEqual(fake.calls.localSets, [], 'install does not write local data either');
  });
}

test('with empty storage, readConfig after install returns the defaults', async () => {
  install({});
  await handleInstalled({ reason: 'install' });
  const config = await readConfig();
  assert.deepEqual(config.defaults, defaultSettings());
  assert.deepEqual(config.sites, []);
});

test('a synced 2.0 layout reads its own settings and sites after install', async () => {
  install(v3Items());
  await handleInstalled({ reason: 'install' });
  const config = await readConfig();
  assert.deepEqual(config.sites.map((site) => site.pattern), ['reddit.com', 'youtube.com']);
  assert.deepEqual(config.defaults.reasons, ['synced default']);
});

test('a synced 1.x config still reads after install', async () => {
  install({ config: v2Config() });
  await handleInstalled({ reason: 'install' });
  const config = await readConfig();
  assert.deepEqual(config.sites.map((site) => site.pattern), ['reddit.com']);
  assert.deepEqual(config.defaults.reasons, ['write first']);
});

test('a first install opens onboarding once and schedules the stats sweep', async () => {
  const fake = install({});
  await handleInstalled({ reason: 'install' });
  assert.deepEqual(fake.calls.tabCreates, [{ url: `chrome-extension://test/${ONBOARDING_PATH}` }]);
  assert.ok(fake.calls.alarms[STATS_PRUNE_ALARM], 'the retention alarm is created');
});

test('an update opens no tab and writes nothing', async () => {
  const before = v3Items();
  const fake = install(structuredClone(before));
  await handleInstalled({ reason: 'update', previousVersion: '1.0.0' });
  assert.deepEqual(fake.calls.tabCreates, []);
  assert.deepEqual(fake.calls.syncSets, []);
  assert.deepEqual(fake.calls.syncRemoves, []);
  assert.deepEqual(fake.chrome.storage.sync.store, before);
});

test('an install handler failure is reported, not swallowed', async () => {
  const fake = install({});
  fake.chrome.tabs.create = async () => {
    throw new Error('tabs unavailable');
  };
  await assert.rejects(handleInstalled({ reason: 'install' }), /tabs unavailable/);
});
