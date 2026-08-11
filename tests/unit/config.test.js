/**
 * Unit tests for config migration and validation.
 * Run: node --test tests/unit/
 *
 * Migration is the risky part of a schema change: a v1 config sitting in a
 * user's synced storage must come forward intact. Dropping their site list
 * would be worse than any bug the new fields fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  migrateConfig,
  validateConfig,
  defaultConfig,
  createSite,
} from '../../src/background/config.js';
import {
  SCHEMA_VERSION,
  DEFAULT_TARGET_NAME,
  DEFAULT_COUNTDOWN_SECONDS,
} from '../../src/constants.js';

/** A config in the shape v1 actually wrote. */
function v1Config() {
  return {
    schemaVersion: 1,
    globalTarget: 'https://example.com',
    globalNote: 'my reason',
    sites: [
      {
        id: 'abc',
        pattern: 'ynet.co.il',
        includeSubdomains: true,
        target: null,
        note: null,
        enabled: true,
      },
    ],
  };
}

test('migration produces a config the validator accepts', () => {
  const { config } = migrateConfig(v1Config());
  assert.doesNotThrow(() => validateConfig(config));
});

test('migration preserves the user site list', () => {
  const { config } = migrateConfig(v1Config());
  assert.equal(config.sites.length, 1);
  assert.equal(config.sites[0].pattern, 'ynet.co.il');
  assert.equal(config.sites[0].id, 'abc');
});

test('migration preserves existing global values', () => {
  const { config } = migrateConfig(v1Config());
  assert.equal(config.globalTarget, 'https://example.com');
  assert.equal(config.globalNote, 'my reason');
});

test('migration fills new fields with defaults', () => {
  const { config } = migrateConfig(v1Config());
  assert.equal(config.schemaVersion, SCHEMA_VERSION);
  assert.equal(config.globalTargetName, DEFAULT_TARGET_NAME);
  assert.equal(config.globalAutoContinue, false);
  assert.equal(config.globalCountdownSeconds, DEFAULT_COUNTDOWN_SECONDS);
  assert.equal(config.sites[0].displayName, null);
  assert.equal(config.sites[0].autoContinue, null);
  assert.equal(config.sites[0].countdownSeconds, null);
});

test('migration reports whether it changed anything', () => {
  assert.equal(migrateConfig(v1Config()).migrated, true);
  assert.equal(migrateConfig(defaultConfig()).migrated, false);
});

test('migration is idempotent', () => {
  const once = migrateConfig(v1Config()).config;
  const twice = migrateConfig(once).config;
  assert.deepEqual(twice, once);
});

test('migration refuses a config from a newer schema', () => {
  // Sync can push a newer config onto an older install. Guessing at fields we
  // do not understand risks discarding them on the next write.
  const future = { ...defaultConfig(), schemaVersion: SCHEMA_VERSION + 1 };
  assert.throws(() => migrateConfig(future), /newer than supported/);
});

test('a config with no schemaVersion is treated as v1', () => {
  const legacy = v1Config();
  delete legacy.schemaVersion;
  const { config, migrated } = migrateConfig(legacy);
  assert.equal(migrated, true);
  assert.equal(config.schemaVersion, SCHEMA_VERSION);
  assert.equal(config.sites.length, 1);
});

test('validator rejects an out-of-range countdown', () => {
  const config = { ...defaultConfig(), globalCountdownSeconds: 0 };
  assert.throws(() => validateConfig(config), /globalCountdownSeconds/);
});

test('validator rejects a non-integer countdown', () => {
  const config = { ...defaultConfig(), globalCountdownSeconds: 2.5 };
  assert.throws(() => validateConfig(config), /globalCountdownSeconds/);
});

test('validator rejects a non-boolean autoContinue on a site', () => {
  const config = defaultConfig();
  config.sites = [
    {
      id: 'x',
      pattern: 'a.com',
      displayName: null,
      includeSubdomains: true,
      target: null,
      note: null,
      autoContinue: 'yes',
      countdownSeconds: null,
      enabled: true,
    },
  ];
  assert.throws(() => validateConfig(config), /autoContinue/);
});

test('default config is valid', () => {
  assert.doesNotThrow(() => validateConfig(defaultConfig()));
});

test('createSite stores fields supplied at add time', () => {
  const site = createSite('ynet.co.il', {
    displayName: 'The news',
    target: 'https://wikipedia.org',
    note: 'not during work',
  });
  assert.equal(site.displayName, 'The news');
  assert.equal(site.target, 'https://wikipedia.org');
  assert.equal(site.note, 'not during work');
});

test('createSite treats blank add-time fields as inherit', () => {
  // Empty inputs must become null, not '', or resolution would return an empty
  // string instead of falling back to the global value.
  const site = createSite('ynet.co.il', { displayName: '  ', target: '', note: undefined });
  assert.equal(site.displayName, null);
  assert.equal(site.target, null);
  assert.equal(site.note, null);
});

test('createSite works with no fields argument', () => {
  const site = createSite('ynet.co.il');
  assert.equal(site.displayName, null);
  assert.equal(site.enabled, true);
  assert.equal(site.includeSubdomains, true);
});

test('a site from createSite passes validation', () => {
  const config = defaultConfig();
  config.sites = [createSite('ynet.co.il', { displayName: 'News' })];
  assert.doesNotThrow(() => validateConfig(config));
});
