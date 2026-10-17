/**
 * Unit tests for reading a legacy 1.x config as v3.
 * Run: node --test tests/unit/
 *
 * A v1 or v2 config sitting in a user's synced storage must come forward
 * intact, and must behave exactly as it did: same destination, same reason,
 * same auto-continue. Dropping a site list would be worse than any bug the
 * new fields fix.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { migrateLegacyConfig, legacyId } from '../../src/background/config_migration.js';
import {
  validateSettings,
  validateSite,
  resolveSettings,
} from '../../src/background/settings_schema.js';
import { presentSite } from '../../src/background/pause.js';
import { findMatchingSite } from '../../src/background/rules.js';
import { DEFAULT_COUNTDOWN_SECONDS } from '../../src/constants.js';

/** A config in the shape v1 actually wrote. */
function v1Config() {
  return {
    schemaVersion: 1,
    globalTarget: 'https://example.com',
    globalNote: 'my reason',
    sites: [
      { id: 'abc', pattern: 'ynet.co.il', includeSubdomains: true, target: null, note: null, enabled: true },
    ],
  };
}

/** A v2 config with every kind of per-site value. */
function v2Config() {
  return {
    schemaVersion: 2,
    globalTarget: 'https://example.com/',
    globalTargetName: 'Example',
    globalNote: '  global note  ',
    globalAutoContinue: true,
    globalCountdownSeconds: 3,
    sites: [
      v2Site({ id: 'inherit' }),
      v2Site({ id: 'override', pattern: 'reddit.com', target: 'https://override.com/', note: 'site note', autoContinue: false, countdownSeconds: 10 }),
      v2Site({ id: 'blank', pattern: 'x.com', target: '   ', note: '  ' }),
      v2Site({ id: 'named', pattern: 'cnn.com', displayName: 'The News', enabled: false, includeSubdomains: false }),
    ],
  };
}

function v2Site(fields = {}) {
  return {
    id: 'test-id',
    pattern: 'ynet.co.il',
    displayName: null,
    includeSubdomains: true,
    target: null,
    note: null,
    autoContinue: null,
    countdownSeconds: null,
    enabled: true,
    ...fields,
  };
}

/** Assert a migration result passes the v3 validators. */
function assertValid({ defaults, sites }) {
  validateSettings(defaults, { partial: false, path: 'defaults' });
  sites.forEach((site, i) => validateSite(site, `sites[${i}]`));
}

test('v1, v2 and placeholder configs migrate to valid v3', () => {
  assertValid(migrateLegacyConfig(v1Config()));
  assertValid(migrateLegacyConfig(v2Config()));
  assertValid(migrateLegacyConfig({ ...v2Config(), globalTargetName: 'somewhere better' }));
});

test('a config with no schemaVersion is treated as v1', () => {
  const legacy = v1Config();
  delete legacy.schemaVersion;
  const { defaults, sites } = migrateLegacyConfig(legacy);
  assert.equal(defaults.countdownSeconds, DEFAULT_COUNTDOWN_SECONDS);
  assert.equal(sites.length, 1);
});

test('v1 fills the fields v2 added with their defaults', () => {
  const { defaults, sites } = migrateLegacyConfig(v1Config());
  assert.equal(defaults.targetName, '');
  assert.equal(defaults.autoContinue, false);
  assert.equal(defaults.countdownSeconds, DEFAULT_COUNTDOWN_SECONDS);
  assert.equal(sites[0].displayName, null);
  assert.deepEqual(sites[0].overrides, {});
});

test('global values move into defaults; the note becomes one trimmed reason', () => {
  const { defaults } = migrateLegacyConfig(v2Config());
  assert.equal(defaults.target, 'https://example.com/');
  assert.equal(defaults.targetName, 'Example');
  assert.deepEqual(defaults.reasons, ['global note']);
  assert.equal(defaults.autoContinue, true);
  assert.equal(defaults.countdownSeconds, 3);
});

test('a blank global note becomes no reasons', () => {
  const { defaults } = migrateLegacyConfig({ ...v2Config(), globalNote: '   ' });
  assert.deepEqual(defaults.reasons, []);
});

test('the v2 placeholder destination name is cleared; a chosen one is kept', () => {
  assert.equal(migrateLegacyConfig({ ...v2Config(), globalTargetName: 'somewhere better' }).defaults.targetName, '');
  assert.equal(migrateLegacyConfig(v2Config()).defaults.targetName, 'Example');
});

test('non-blank per-site values become overrides; null and blank inherit', () => {
  const { sites } = migrateLegacyConfig(v2Config());
  assert.deepEqual(sites[0].overrides, {});
  assert.deepEqual(sites[1].overrides, {
    target: 'https://override.com/',
    reasons: ['site note'],
    autoContinue: false,
    countdownSeconds: 10,
  });
  assert.deepEqual(sites[2].overrides, {});
});

test('migration preserves every site identity field and the order', () => {
  const { sites } = migrateLegacyConfig(v2Config());
  const legacy = v2Config().sites;
  sites.forEach((site, i) => {
    assert.equal(site.id, legacy[i].id);
    assert.equal(site.pattern, legacy[i].pattern);
    assert.equal(site.displayName, legacy[i].displayName);
    assert.equal(site.includeSubdomains, legacy[i].includeSubdomains);
    assert.equal(site.enabled, legacy[i].enabled);
    assert.equal(site.order, i);
    assert.equal(site.addedAt, null);
  });
});

test('two sites with the same pattern both migrate', () => {
  const stored = { ...v2Config(), sites: [v2Site({ id: 'a' }), v2Site({ id: 'b' })] };
  assert.equal(migrateLegacyConfig(stored).sites.length, 2);
});

test('long notes migrate untruncated', () => {
  const long = 'n'.repeat(2000);
  const stored = { ...v2Config(), globalNote: long, sites: [v2Site({ note: long })] };
  const { defaults, sites } = migrateLegacyConfig(stored);
  assert.equal(defaults.reasons[0].length, 2000);
  assert.equal(sites[0].overrides.reasons[0].length, 2000);
  assertValid({ defaults, sites });
});

test('a v1 site without an id gets a deterministic legacy id', () => {
  const stored = v1Config();
  delete stored.sites[0].id;
  stored.sites[0].pattern = ' YNET.co.il ';
  assert.equal(migrateLegacyConfig(stored).sites[0].id, legacyId(0, ' YNET.co.il '));
  assert.equal(legacyId(0, ' YNET.co.il '), 'v1-0-ynet.co.il');
});

test('migration is pure: the input is not mutated and repeats are equal', () => {
  const stored = v2Config();
  const before = JSON.stringify(stored);
  const first = migrateLegacyConfig(stored);
  assert.equal(JSON.stringify(stored), before);
  assert.deepEqual(migrateLegacyConfig(stored), first);
});

test('migration refuses a legacy config from a newer schema', () => {
  assert.throws(() => migrateLegacyConfig({ ...v2Config(), schemaVersion: 3 }), /update the extension/);
  assert.throws(() => migrateLegacyConfig(null), /must be an object/);
});

/* Behavioral equivalence with the v2 resolver ----------------------------- */

/**
 * What 1.x showed for a URL, written out from the v2 resolver's rules:
 * blank strings inherit, null booleans and numbers inherit, the button name
 * is the global name or the target's hostname.
 */
const V2_EXPECTED = {
  'https://ynet.co.il/': { target: 'https://example.com/', reason: 'global note', autoContinue: true, countdownSeconds: 3, targetName: 'Example' },
  'https://reddit.com/': { target: 'https://override.com/', reason: 'site note', autoContinue: false, countdownSeconds: 10, targetName: 'override.com' },
  'https://x.com/': { target: 'https://example.com/', reason: 'global note', autoContinue: true, countdownSeconds: 3, targetName: 'Example' },
};

test('the v3 pipeline shows what the v2 resolver showed', () => {
  const config = migrateLegacyConfig(v2Config());
  for (const [url, expected] of Object.entries(V2_EXPECTED)) {
    const site = findMatchingSite(config, url);
    const view = presentSite(resolveSettings(config.defaults, site), site, 0, { host: new URL(url).hostname });
    assert.equal(view.target, expected.target, `${url} target`);
    assert.equal(view.reason, expected.reason, `${url} reason`);
    assert.equal(view.autoContinue, expected.autoContinue, `${url} autoContinue`);
    assert.equal(view.countdownSeconds, expected.countdownSeconds, `${url} countdown`);
    // reddit.com differs from v2 by design: its own target no longer borrows
    // the global destination's name (resolution rule 2).
    assert.equal(view.targetName, expected.targetName, `${url} targetName`);
  }
});

test('an unnamed global destination shows its hostname, as in v2', () => {
  const config = migrateLegacyConfig({ ...v2Config(), globalTargetName: '' });
  const site = findMatchingSite(config, 'https://ynet.co.il/');
  const view = presentSite(resolveSettings(config.defaults, site), site, 0, { host: 'ynet.co.il' });
  assert.equal(view.targetName, 'example.com');
});

test('a v1 config with no note shows no reason', () => {
  const config = migrateLegacyConfig({ ...v1Config(), globalNote: '' });
  const view = presentSite(resolveSettings(config.defaults, config.sites[0]), config.sites[0], 0, { host: 'ynet.co.il' });
  assert.equal(view.reason, '');
});
