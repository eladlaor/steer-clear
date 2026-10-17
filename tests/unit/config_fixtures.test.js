/**
 * The schema v3 contract checked against the defined fixtures: a config
 * captured from 1.0.0 (`tools/upgrade_check.mjs --capture`), a v2 config with
 * 2,000-character notes, 100 typical sites, and one site of Hebrew reasons at
 * the input limits.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { legacyId, migrateLegacyConfig } from '../../src/background/config_migration.js';
import { resolveSettings, validateSettings, validateSite } from '../../src/background/settings_schema.js';
import { presentSite } from '../../src/background/pause.js';
import { findMatchingSite, hostnameOf } from '../../src/background/rules.js';
import { assembleConfig, assertSyncQuota, itemBytes, siteKey } from '../../src/background/sync_layout.js';
import { DESTINATION_FALLBACK_LABEL, SYNC_QUOTA_BYTES_PER_ITEM } from '../../src/constants.js';
import { sitesTypical, TYPICAL } from './fixtures/sites_typical.js';
import { HEAVY_HEBREW, siteHeavyHebrew } from './fixtures/site_heavy_hebrew.js';

const readFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/** Legacy fixtures: the 1.0.0 capture, the long-note config, and v1 shapes. */
function legacyFixtures() {
  const real = readFixture('config_v2_real.json');
  const v1 = {
    schemaVersion: 1,
    globalTarget: 'https://example.com/',
    globalNote: 'v1 reason',
    sites: real.sites.map(({ id, pattern, includeSubdomains, target, note, enabled }) => ({
      id, pattern, includeSubdomains, target, note, enabled,
    })),
  };
  return {
    'config_v2_real.json': real,
    'config_v2_long_note.json': readFixture('config_v2_long_note.json'),
    'v1 (from the real fixture)': v1,
    'v2 with the placeholder name': { ...real, globalTargetName: 'somewhere better' },
  };
}

/**
 * What 1.0.0 showed, verbatim from its `resolveSiteSettings`: blank strings
 * inherit, null booleans and numbers inherit, and the button name is the
 * global name or the target's hostname.
 */
function v2Resolve(config, site) {
  const target = site?.target?.trim() || config.globalTarget;
  const note = site?.note?.trim() || config.globalNote;
  const globalName = config.globalTargetName === 'somewhere better' ? '' : config.globalTargetName;
  const targetName = globalName?.trim() || hostnameOf(target) || DESTINATION_FALLBACK_LABEL;
  return {
    target,
    targetName,
    note: note?.trim() ?? '',
    autoContinue: site?.autoContinue ?? config.globalAutoContinue ?? false,
    countdownSeconds: site?.countdownSeconds ?? config.globalCountdownSeconds ?? 3,
  };
}

/* Migration --------------------------------------------------------------------------- */

test('every legacy fixture migrates to v3 that passes validation', () => {
  for (const [name, stored] of Object.entries(legacyFixtures())) {
    const { defaults, sites } = migrateLegacyConfig(stored);
    validateSettings(defaults, { partial: false, path: `${name} defaults` });
    sites.forEach((site, i) => validateSite(site, `${name} sites[${i}]`));
    assert.equal(sites.length, stored.sites.length, name);
  }
});

test('2,000-character notes migrate intact and untruncated', () => {
  const stored = readFixture('config_v2_long_note.json');
  const { defaults, sites } = migrateLegacyConfig(stored);
  assert.equal(stored.globalNote.length, 2000);
  assert.deepEqual(defaults.reasons, [stored.globalNote.trim()]);
  assert.deepEqual(sites[0].overrides.reasons, [stored.sites[0].note.trim()]);
  assert.equal(sites[0].overrides.reasons[0].length, stored.sites[0].note.trim().length);
});

test('migration preserves each site\'s identity fields and order', () => {
  for (const [name, stored] of Object.entries(legacyFixtures())) {
    const { sites } = migrateLegacyConfig(stored);
    stored.sites.forEach((legacy, i) => {
      assert.equal(sites[i].id, legacy.id, `${name} id`);
      assert.equal(sites[i].pattern, legacy.pattern, `${name} pattern`);
      assert.equal(sites[i].displayName, legacy.displayName ?? null, `${name} displayName`);
      assert.equal(sites[i].includeSubdomains, legacy.includeSubdomains, `${name} includeSubdomains`);
      assert.equal(sites[i].enabled, legacy.enabled, `${name} enabled`);
      assert.equal(sites[i].order, i, `${name} order`);
    });
  }
});

test('a captured config with two sites of one pattern migrates with both', () => {
  const stored = readFixture('config_v2_real.json');
  stored.sites.push({ ...stored.sites[0], id: 'duplicate' });
  const { sites } = migrateLegacyConfig(stored);
  assert.deepEqual(sites.filter((site) => site.pattern === stored.sites[0].pattern).map((s) => s.id), [
    stored.sites[0].id,
    'duplicate',
  ]);
});

test('migration is pure and deterministic: legacy ids repeat and the input is untouched', () => {
  const stored = readFixture('config_v2_real.json');
  for (const site of stored.sites) delete site.id;
  const before = JSON.stringify(stored);

  const first = migrateLegacyConfig(stored);
  const second = migrateLegacyConfig(stored);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(stored), before);
  first.sites.forEach((site, i) => {
    assert.equal(site.id, legacyId(i, stored.sites[i].pattern));
    assert.equal(site.id, `v1-${i}-${stored.sites[i].pattern.trim().toLowerCase()}`);
  });
});

/* Behavioral equivalence ------------------------------------------------------------- */

test('the v3 pipeline shows what 1.0.0 showed, for every fixture and site', () => {
  for (const [name, stored] of Object.entries(legacyFixtures())) {
    const config = migrateLegacyConfig(stored);
    stored.sites.forEach((legacy, i) => {
      const site = config.sites[i];
      const expected = v2Resolve(stored, legacy);
      const view = presentSite(resolveSettings(config.defaults, site), site, 0, { host: 'h.example', continuesToday: 0 });
      const label = `${name} ${legacy.pattern}`;
      assert.equal(view.target, expected.target, `${label} target`);
      assert.equal(view.reason, expected.note, `${label} reason`);
      assert.equal(view.autoContinue, expected.autoContinue, `${label} autoContinue`);
      assert.equal(view.countdownSeconds, expected.countdownSeconds, `${label} countdown`);

      // Resolution rule 2, the one documented difference: a site with its own
      // target no longer borrows the global destination's name.
      const ownTarget = typeof legacy.target === 'string' && legacy.target.trim() !== '';
      const expectedName = ownTarget ? hostnameOf(expected.target) || DESTINATION_FALLBACK_LABEL : expected.targetName;
      assert.equal(view.targetName, expectedName, `${label} targetName`);
    });
  }
});

test('the captured fixture exercises rule 2: v2 showed the global name on a per-site target', () => {
  const stored = readFixture('config_v2_real.json');
  const news = stored.sites.find((site) => site.target);
  assert.equal(v2Resolve(stored, news).targetName, stored.globalTargetName);
  const config = migrateLegacyConfig(stored);
  const site = findMatchingSite(config, `https://${news.pattern}/`);
  const view = presentSite(resolveSettings(config.defaults, site), site, 0, { host: news.pattern, continuesToday: 0 });
  assert.equal(view.targetName, hostnameOf(news.target));
});

test('the captured config assembles from sync items exactly as it migrates', () => {
  const stored = readFixture('config_v2_real.json');
  const config = assembleConfig({ config: stored });
  assert.deepEqual({ defaults: config.defaults, sites: config.sites }, migrateLegacyConfig(stored));
});

/* Quota ---------------------------------------------------------------------------------- */

test('the 100 typical sites match their definition and pass the quota', () => {
  const sites = sitesTypical();
  assert.equal(sites.length, TYPICAL.SITE_COUNT);
  for (const site of sites) {
    validateSite(site, site.id);
    assert.equal(site.pattern.length, TYPICAL.PATTERN_CHARS);
    assert.equal(site.overrides.reasons[0].length, TYPICAL.REASON_CHARS);
    assert.equal(site.overrides.target.length, TYPICAL.TARGET_CHARS);
  }
  const set = Object.fromEntries(sites.map((site) => [siteKey(site.id), site]));
  assert.doesNotThrow(() => assertSyncQuota(set, { schema: 3 }));
  assert.equal(assembleConfig({ schema: 3, ...set }).sites.length, TYPICAL.SITE_COUNT);
});

test('the heavy Hebrew site fits one sync item, measured in bytes', () => {
  const site = siteHeavyHebrew();
  validateSite(site, 'heavy');
  assert.equal(site.overrides.reasons.length, HEAVY_HEBREW.REASON_COUNT);
  assert.ok(site.overrides.reasons.every((reason) => reason.length === HEAVY_HEBREW.REASON_CHARS));
  const bytes = itemBytes(siteKey(site.id), site);
  assert.ok(bytes > JSON.stringify(site).length, 'Hebrew counts two bytes per character');
  assert.ok(bytes <= SYNC_QUOTA_BYTES_PER_ITEM, `${bytes} bytes`);
  assert.doesNotThrow(() => assertSyncQuota({ [siteKey(site.id)]: site }, {}));
});

test('a 4,500-character Hebrew reason throws naming the key and its byte size', () => {
  const site = { ...siteHeavyHebrew(), overrides: { reasons: ['ש'.repeat(4500)] } };
  const key = siteKey(site.id);
  assert.ok(JSON.stringify(site).length < SYNC_QUOTA_BYTES_PER_ITEM, 'under the limit by string length');
  const bytes = itemBytes(key, site);
  assert.throws(() => assertSyncQuota({ [key]: site }, {}), (error) =>
    error.message.includes(key) && error.message.includes(`${bytes} bytes`));
});
