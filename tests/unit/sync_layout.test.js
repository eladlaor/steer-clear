/**
 * Unit tests for assembling the config from storage.sync items, and for the
 * sync quota check.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  assembleConfig,
  assertSyncQuota,
  isV3SitesMode,
  itemBytes,
  siteKey,
} from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import {
  SCHEMA_VERSION,
  SYNC_MAX_ITEMS,
  SYNC_QUOTA_BYTES_PER_ITEM,
} from '../../src/constants.js';

function site(id, fields = {}) {
  return {
    id,
    pattern: `${id}.com`,
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: 1,
    order: 0,
    overrides: {},
    ...fields,
  };
}

const legacy = {
  schemaVersion: 2,
  globalTarget: 'https://legacy.example/',
  globalTargetName: 'Legacy',
  globalNote: 'legacy reason',
  globalAutoContinue: false,
  globalCountdownSeconds: 3,
  sites: [
    { id: 'old', pattern: 'old.com', displayName: null, includeSubdomains: true, target: null, note: null, autoContinue: null, countdownSeconds: null, enabled: true },
  ],
};

/* assembleConfig ------------------------------------------------------------ */

test('empty storage assembles to the defaults and no sites', () => {
  const config = assembleConfig({});
  assert.equal(config.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(config.defaults, defaultSettings());
  assert.deepEqual(config.sites, []);
  assert.deepEqual(config.invalidSites, []);
});

test('a newer schema marker is refused with "update the extension"', () => {
  assert.throws(() => assembleConfig({ schema: 4 }), /update the extension/);
});

test('without a schema marker or site items, sites come from the legacy config', () => {
  const config = assembleConfig({ config: legacy });
  assert.deepEqual(config.sites.map((s) => s.id), ['old']);
  assert.equal(config.defaults.target, 'https://legacy.example/');
});

test('with schema 3 and no site items, removed sites never resurrect from config', () => {
  assert.deepEqual(assembleConfig({ schema: 3, config: legacy }).sites, []);
});

test('site items without a schema marker switch to v3 sites mode', () => {
  const items = { config: legacy, [siteKey('a')]: site('a') };
  assert.equal(isV3SitesMode(items), true);
  assert.deepEqual(assembleConfig(items).sites.map((s) => s.id), ['a']);
});

test('sites sort by order, then id', () => {
  const items = {
    schema: 3,
    [siteKey('b')]: site('b', { order: 1 }),
    [siteKey('c')]: site('c', { order: 0 }),
    [siteKey('a')]: site('a', { order: 1 }),
  };
  assert.deepEqual(assembleConfig(items).sites.map((s) => s.id), ['c', 'a', 'b']);
});

test('one invalid site item is skipped and reported; the others stay', () => {
  const items = {
    schema: 3,
    [siteKey('good')]: site('good'),
    [siteKey('bad')]: site('bad', { enabled: 'yes' }),
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    const config = assembleConfig(items);
    assert.deepEqual(config.sites.map((s) => s.id), ['good']);
    assert.equal(config.invalidSites.length, 1);
    assert.equal(config.invalidSites[0].key, siteKey('bad'));
    assert.match(config.invalidSites[0].error, /enabled/);
  } finally {
    console.error = originalError;
  }
});

test('with settings absent, defaults come from the legacy config', () => {
  const config = assembleConfig({ schema: 3, config: legacy });
  assert.equal(config.defaults.targetName, 'Legacy');
  assert.deepEqual(config.defaults.reasons, ['legacy reason']);
});

test('stored settings win over the legacy config', () => {
  const defaults = { ...defaultSettings(), targetName: 'Mine' };
  assert.equal(assembleConfig({ settings: { defaults }, config: legacy }).defaults.targetName, 'Mine');
});

test('stored settings missing a newer field are filled from the defaults', () => {
  const defaults = defaultSettings();
  delete defaults.varyPresentation;
  assert.equal(assembleConfig({ settings: { defaults } }).defaults.varyPresentation, true);
});

test('invalid stored settings throw naming the field', () => {
  const defaults = { ...defaultSettings(), bypassMinutes: 7 };
  assert.throws(() => assembleConfig({ settings: { defaults } }), /defaults\.bypassMinutes/);
});

/* Quota ----------------------------------------------------------------------- */

test('itemBytes measures UTF-8 bytes of key plus JSON value', () => {
  assert.equal(itemBytes('k', 'a'), 1 + 3); // k + "a"
  assert.equal(itemBytes('k', 'א'), 1 + 4); // Hebrew letter is 2 bytes
});

test('assertSyncQuota rejects an item over the per-item limit by bytes, naming it', () => {
  // 4,500 Hebrew characters: under 8,192 by string length, about 9,000 bytes.
  const value = site('heb', { overrides: { reasons: ['א'.repeat(4500)] } });
  assert.ok(JSON.stringify(value).length < SYNC_QUOTA_BYTES_PER_ITEM);
  assert.throws(
    () => assertSyncQuota({ [siteKey('heb')]: value }, {}),
    /site:heb.*\d+ bytes/
  );
});

test('assertSyncQuota accepts five 280-character Hebrew reasons', () => {
  const value = site('heb', { overrides: { reasons: Array.from({ length: 5 }, () => 'א'.repeat(280)) } });
  assert.doesNotThrow(() => assertSyncQuota({ [siteKey('heb')]: value }, {}));
});

test('assertSyncQuota accepts 100 typical sites', () => {
  const set = {};
  for (let i = 0; i < 100; i += 1) {
    const id = crypto.randomUUID();
    set[siteKey(id)] = site(id, {
      pattern: `site-${String(i).padStart(3, '0')}.co.il`,
      order: i,
      overrides: { reasons: ['r'.repeat(140)], target: `https://${'t'.repeat(44)}.example/` },
    });
  }
  assert.doesNotThrow(() => assertSyncQuota(set, {}));
});

test('assertSyncQuota rejects a total over the quota and too many items', () => {
  const big = (i) => site(`s${i}`, { overrides: { reasons: ['x'.repeat(7000)] } });
  const current = {};
  for (let i = 0; i < 14; i += 1) current[siteKey(`s${i}`)] = big(i);
  assert.throws(() => assertSyncQuota({ [siteKey('s99')]: big(99) }, current), /total/);

  const many = {};
  for (let i = 0; i < SYNC_MAX_ITEMS; i += 1) many[`k${i}`] = 1;
  assert.throws(() => assertSyncQuota({ extra: 1 }, many), /items/);
});

test('assertSyncQuota counts a removed key as gone', () => {
  const current = {};
  for (let i = 0; i < SYNC_MAX_ITEMS; i += 1) current[`k${i}`] = 1;
  assert.doesNotThrow(() => assertSyncQuota({ extra: 1 }, current, ['k0']));
});
