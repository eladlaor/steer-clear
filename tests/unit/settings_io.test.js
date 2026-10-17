/**
 * Unit tests for export and import of settings.
 * Run: node --test tests/unit/
 *
 * Export is how a user moves to another browser (Chrome to Firefox has no
 * shared sync). Import replaces everything, so it must refuse anything it
 * cannot read completely, and say exactly which field is wrong.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildExport,
  exportFileName,
  importedHosts,
  parseImport,
  validateImportedConfig,
} from '../../src/background/settings_io.js';
import { migrateLegacyConfig } from '../../src/background/config_migration.js';
import { newSite } from '../../src/background/config_mutations.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  MAX_IMPORT_BYTES,
  MAX_SITES,
  PauseStyle,
  SCHEMA_VERSION,
} from '../../src/constants.js';
import { sitesTypical } from './fixtures/sites_typical.js';

const NOW = Date.UTC(2026, 9, 16, 9, 0, 0);
const readFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

/** A v3 config as readConfig returns it, including the read-only report. */
function v3Config() {
  return {
    schemaVersion: SCHEMA_VERSION,
    defaults: { ...defaultSettings(), reasons: ['default reason'], bypassMinutes: 15 },
    sites: [
      { ...newSite('reddit.com', { id: 'r', order: 0, now: NOW, reason: 'one post' }) },
      { ...newSite('youtube.com', { id: 'y', order: 1, now: NOW }), overrides: { pauseStyle: PauseStyle.BREATHING } },
    ],
    invalidSites: [{ key: 'site:bad', error: 'broken' }],
  };
}

const envelope = (config, extra = {}) =>
  JSON.stringify({ format: EXPORT_FORMAT, exportVersion: EXPORT_VERSION, exportedAt: 'x', extensionVersion: '1.0.0', config, ...extra });

/* buildExport ------------------------------------------------------------------- */

test('buildExport writes the documented envelope', () => {
  const out = buildExport(v3Config(), '2.0.0', NOW);
  assert.equal(out.format, EXPORT_FORMAT);
  assert.equal(out.exportVersion, EXPORT_VERSION);
  assert.equal(out.exportedAt, '2026-10-16T09:00:00.000Z');
  assert.equal(out.extensionVersion, '2.0.0');
  assert.deepEqual(Object.keys(out.config).sort(), ['defaults', 'schemaVersion', 'sites']);
  assert.equal(out.config.schemaVersion, SCHEMA_VERSION);
});

test('parseImport(buildExport(c)) round-trips c', () => {
  const config = v3Config();
  const parsed = parseImport(JSON.stringify(buildExport(config, '2.0.0', NOW)));
  assert.deepEqual(parsed.config, { schemaVersion: SCHEMA_VERSION, defaults: config.defaults, sites: config.sites });
  assert.deepEqual(parsed.duplicates, []);
});

test('the 100 typical sites round-trip', () => {
  const config = { schemaVersion: SCHEMA_VERSION, defaults: defaultSettings(), sites: sitesTypical() };
  assert.deepEqual(parseImport(JSON.stringify(buildExport(config, '2.0.0', NOW))).config, config);
});

test('buildExport carries no statistics, lifecycle or bypasses at any depth', () => {
  const polluted = { ...v3Config(), stats: { totals: {} }, lifecycle: {}, bypasses: {} };
  const keys = [];
  const walk = (value) => {
    if (value && typeof value === 'object') {
      for (const [key, inner] of Object.entries(value)) {
        keys.push(key);
        walk(inner);
      }
    }
  };
  walk(buildExport(polluted, '2.0.0', NOW));
  for (const banned of ['stats', 'lifecycle', 'bypasses', 'invalidSites']) {
    assert.equal(keys.includes(banned), false, banned);
  }
});

test('buildExport does not share objects with the live config', () => {
  const config = v3Config();
  const out = buildExport(config, '2.0.0', NOW);
  out.config.sites[0].overrides.reasons.push('changed');
  assert.deepEqual(config.sites[0].overrides.reasons, ['one post']);
});

test('buildExport rejects a missing version or clock', () => {
  assert.throws(() => buildExport(v3Config(), '', NOW), /extensionVersion/);
  assert.throws(() => buildExport(v3Config(), '2.0.0', NaN), /now/);
});

test('the export file is named by the local date', () => {
  assert.equal(exportFileName(new Date(2026, 9, 6, 23, 30).getTime()), 'steer-clear-settings-2026-10-06.json');
});

/* parseImport: older configs ------------------------------------------------------- */

test('a v2 config (captured from 1.0.0) imports as v3', () => {
  const stored = readFixture('config_v2_real.json');
  const { config } = parseImport(envelope(stored));
  assert.equal(config.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual({ defaults: config.defaults, sites: config.sites }, migrateLegacyConfig(stored));
});

test('a v1 config imports as v3, with derived ids', () => {
  const v1 = { globalTarget: 'https://example.com/', globalNote: 'why', sites: [{ pattern: 'x.com', includeSubdomains: true, target: null, note: null, enabled: true }] };
  const { config } = parseImport(envelope(v1));
  assert.equal(config.schemaVersion, SCHEMA_VERSION);
  assert.equal(config.sites[0].id, 'v1-0-x.com');
  assert.deepEqual(config.defaults.reasons, ['why']);
});

test('duplicate patterns are reported, not rejected', () => {
  const config = v3Config();
  config.sites.push({ ...newSite('www.reddit.com', { id: 'r2', order: 2, now: NOW }), pattern: 'Reddit.com' });
  const parsed = parseImport(JSON.stringify(buildExport(config, '2.0.0', NOW)));
  assert.equal(parsed.config.sites.length, 3);
  assert.deepEqual(parsed.duplicates, ['reddit.com']);

  const legacy = readFixture('config_v2_real.json');
  legacy.sites.push({ ...legacy.sites[0], id: 'again' });
  assert.deepEqual(parseImport(envelope(legacy)).duplicates, [legacy.sites[0].pattern]);
});

/* parseImport: rejections name the field path ------------------------------------- */

const rejects = (text, pattern) => assert.throws(() => parseImport(text), pattern);

test('non-JSON is refused', () => {
  rejects('{"format": ', /not valid JSON/);
  rejects('', /not valid JSON/);
});

test('a wrong format, a newer export version or a newer schema is refused, naming the field', () => {
  rejects(JSON.stringify([]), /file must be an object/);
  rejects(envelope(v3Config(), { format: 'other' }), /format/);
  rejects(envelope(v3Config(), { exportVersion: 2 }), /exportVersion.*update the extension/);
  rejects(envelope(v3Config(), { exportVersion: 0 }), /exportVersion/);
  rejects(envelope({ ...v3Config(), schemaVersion: 4 }), /config\.schemaVersion.*update the extension/);
  rejects(envelope(null), /config must be an object/);
});

test('oversize input is refused before parsing', () => {
  const big = envelope({ ...v3Config(), padding: 'x'.repeat(MAX_IMPORT_BYTES) });
  rejects(big, new RegExp(`over the ${MAX_IMPORT_BYTES}-byte`));
  // Measured in bytes, not characters.
  const hebrew = 'א'.repeat(MAX_IMPORT_BYTES / 2 + 1);
  rejects(hebrew, /bytes/);
});

test('an invalid default names defaults.<field>', () => {
  const config = v3Config();
  config.defaults.bypassMinutes = 7;
  rejects(envelope(config), /defaults\.bypassMinutes/);
  delete config.defaults.bypassMinutes;
  rejects(envelope(config), /defaults\.bypassMinutes is required/);
});

test('an invalid site names sites[i].<field>', () => {
  const config = v3Config();
  config.sites[1].includeSubdomains = 'yes';
  rejects(envelope(config), /sites\[1\]\.includeSubdomains/);

  const global = v3Config();
  global.sites[0].overrides.bypassMinutes = 5;
  rejects(envelope(global), /sites\[0\]\.overrides\.bypassMinutes/);

  const blankPattern = v3Config();
  blankPattern.sites[0].pattern = '  ';
  rejects(envelope(blankPattern), /sites\[0\]\.pattern/);
});

test('a list that is not a list, repeated ids, or too many sites is refused', () => {
  rejects(envelope({ ...v3Config(), sites: {} }), /config\.sites must be a list/);
  const repeated = v3Config();
  repeated.sites[1].id = 'r';
  rejects(envelope(repeated), /sites\[1\]\.id "r" repeats sites\[0\]\.id/);
  const many = { ...v3Config(), sites: Array.from({ length: MAX_SITES + 1 }, (_, i) => newSite(`s${i}.com`, { id: `s${i}`, order: i, now: NOW })) };
  rejects(envelope(many), new RegExp(`at most ${MAX_SITES}`));
});

test('a legacy config that is not a 1.x shape is refused, naming the field', () => {
  rejects(envelope({ schemaVersion: 2, globalTarget: 'https://x.com/', sites: 'none' }), /config\.sites must be a list/);
  rejects(envelope({ schemaVersion: 2, globalTarget: '', sites: [] }), /defaults\.target/);
});

/* The worker re-validates what the page sends -------------------------------------- */

test('validateImportedConfig accepts only a complete v3 config', () => {
  const { config } = parseImport(envelope(v3Config()));
  assert.doesNotThrow(() => validateImportedConfig(config));
  assert.throws(() => validateImportedConfig({ ...config, schemaVersion: 2 }), /config\.schemaVersion must be 3/);
  assert.throws(() => validateImportedConfig({ ...config, defaults: { target: 'x' } }), /defaults\./);
});

test('importedHosts lists each enabled site\'s host once', () => {
  const config = v3Config();
  config.sites.push({ ...newSite('m.reddit.com', { id: 'm', order: 2, now: NOW }), pattern: 'reddit.com' });
  config.sites.push({ ...newSite('off.com', { id: 'o', order: 3, now: NOW }), enabled: false });
  assert.deepEqual(importedHosts(config), ['reddit.com', 'youtube.com']);
});
