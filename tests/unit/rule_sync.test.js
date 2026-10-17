/**
 * Rule-table changes that overlap, permission checks that fail for one host,
 * and noticing a change of timezone, with chrome.* stubbed in memory.
 * Run: node --test tests/unit/
 *
 * Every rebuild reads storage, snapshots the installed rules and replaces
 * them. Overlapping rebuilds used to share one snapshot (a duplicate-id
 * error) and let a stale read win; overlapping bypass edits wrote back a
 * stale map. The worker now queues them.
 */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

import { expireBypass, grantBypass, rebuildRules } from '../../src/background/rule_sync.js';
import { grantedHostsAmong } from '../../src/background/permissions.js';
import { newSite } from '../../src/background/config_mutations.js';
import { siteKey } from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { timezoneChangedSinceRebuild, utcOffsetAt, utcOffsetChanged } from '../../src/background/timezone_watch.js';
import { StorageKey, TIMEZONE_CHECK_ALARM, TIMEZONE_CHECK_PERIOD_MINUTES, WEEKDAY_WORK_SCHEDULE } from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const MINUTE = 60000;
const quiet = {};
let fake;

/** @param {...string} hosts Listed sites, in order. */
function sitesSync(...hosts) {
  const sync = { schema: 3, settings: { defaults: defaultSettings() } };
  hosts.forEach((host, order) => {
    sync[siteKey(`s${order}`)] = newSite(host, { id: `s${order}`, order, now: NOW });
  });
  return sync;
}

function install(options) {
  fake = createFakeChrome(options);
  globalThis.chrome = fake.chrome;
  return fake;
}

const ruleHosts = () => fake.calls.dynamicRules.map((rule) => rule.condition.regexFilter).sort();

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

/* Overlapping changes --------------------------------------------------------------- */

test('two concurrent rebuilds both succeed and install each rule once', async () => {
  install({ sync: sitesSync('reddit.com', 'youtube.com') });
  const results = await Promise.allSettled([rebuildRules(), rebuildRules()]);
  assert.deepEqual(results.map((result) => result.status), ['fulfilled', 'fulfilled']);
  assert.equal(fake.calls.dynamicRules.length, 2);
});

test('a rebuild requested after a change, while another runs, ends with the latest storage', async () => {
  install({ sync: sitesSync('reddit.com') });
  const first = rebuildRules();
  // The first rebuild is under way; a site is added and another rebuild asked for.
  await new Promise((resolve) => setImmediate(resolve));
  fake.chrome.storage.sync.store[siteKey('s1')] = newSite('youtube.com', { id: 's1', order: 1, now: NOW });
  const second = rebuildRules();
  await Promise.all([first, second]);
  assert.equal(fake.calls.dynamicRules.length, 2, 'the last rebuild saw both sites');
});

test('many overlapping rebuild requests settle without a duplicate-id error', async () => {
  install({ sync: sitesSync('a.com', 'b.com', 'c.com') });
  const runs = Array.from({ length: 6 }, () => rebuildRules());
  await Promise.all(runs);
  assert.equal(fake.calls.dynamicRules.length, 3);
});

test('a bypass expiring on one site while another site continues keeps the new bypass', async () => {
  install({ sync: sitesSync('a.com', 'b.com') });
  await grantBypass('a.com');
  mock.method(Date, 'now', () => NOW + 5 * MINUTE);

  // A's expiry alarm lands while the user continues on B.
  await Promise.all([expireBypass('a.com'), grantBypass('b.com')]);

  const bypasses = fake.chrome.storage.session.store[StorageKey.BYPASSES];
  assert.deepEqual(Object.keys(bypasses), ['b.com'], "B's bypass survives A's expiry");
  assert.equal(fake.calls.dynamicRules.length, 1, "only A's rule is in place");
  assert.match(fake.calls.dynamicRules[0].condition.regexFilter, /a\\\.com/);
});

/* One bad host does not break the rest -------------------------------------------------- */

test('grantedHostsAmong treats a host whose check throws as not granted and keeps the others', async () => {
  install({});
  fake.chrome.permissions.contains = async ({ origins }) => {
    if (origins.some((origin) => origin.includes('bad.com'))) throw new Error('Invalid host wildcard');
    return true;
  };
  const errors = [];
  console.error = (...args) => errors.push(args);
  assert.deepEqual([...(await grantedHostsAmong(['good.com', 'bad.com']))], ['good.com']);
  assert.ok(errors.some(([line]) => String(line).startsWith('[steer-clear]')), 'the failure is logged');
});

test('a stored site with an unusable pattern is skipped and every other site still gets its rule', async () => {
  const sync = sitesSync('reddit.com');
  sync[siteKey('bad')] = { ...newSite('placeholder.com', { id: 'bad', order: 1, now: NOW }), pattern: '*.*.bad.com' };
  install({ sync });
  fake.chrome.permissions.contains = async ({ origins }) => {
    if (origins.some((origin) => origin.includes('*.*'))) throw new Error('Invalid host wildcard');
    return true;
  };
  await rebuildRules();
  assert.equal(ruleHosts().length, 1);
});

/* Timezone changes ---------------------------------------------------------------------- */

test('utcOffsetChanged compares with the stored offset, and nothing stored means no change', () => {
  assert.equal(utcOffsetChanged(-180, -180), false);
  assert.equal(utcOffsetChanged(-180, 300), true);
  assert.equal(utcOffsetChanged(undefined, 300), false);
  assert.equal(utcOffsetChanged(null, 0), false);
  assert.throws(() => utcOffsetChanged(0, Number.NaN), /currentOffset/);
});

test('a rebuild with a timed schedule starts the timezone check and records the offset', async () => {
  const sync = sitesSync('reddit.com');
  sync[siteKey('s0')].overrides = { schedule: WEEKDAY_WORK_SCHEDULE };
  install({ sync });
  await rebuildRules();
  assert.deepEqual(fake.calls.alarms[TIMEZONE_CHECK_ALARM], { periodInMinutes: TIMEZONE_CHECK_PERIOD_MINUTES });
  assert.equal(fake.chrome.storage.session.store[StorageKey.SCHEDULE_TZ_OFFSET], utcOffsetAt(NOW));
  assert.equal(await timezoneChangedSinceRebuild(NOW), false);

  fake.chrome.storage.session.store[StorageKey.SCHEDULE_TZ_OFFSET] = utcOffsetAt(NOW) + 480;
  assert.equal(await timezoneChangedSinceRebuild(NOW), true, 'a different offset asks for a rebuild');
});

test('a rebuild with only always-on schedules stops the timezone check', async () => {
  install({ sync: sitesSync('reddit.com'), session: { [StorageKey.SCHEDULE_TZ_OFFSET]: 0 } });
  fake.calls.alarms[TIMEZONE_CHECK_ALARM] = { periodInMinutes: TIMEZONE_CHECK_PERIOD_MINUTES };
  await rebuildRules();
  assert.equal(fake.calls.alarms[TIMEZONE_CHECK_ALARM], undefined);
  assert.equal(fake.chrome.storage.session.store[StorageKey.SCHEDULE_TZ_OFFSET], undefined);
});
