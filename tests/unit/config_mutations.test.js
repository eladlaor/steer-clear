/**
 * Unit tests for the config mutation planners.
 * Run: node --test tests/unit/
 *
 * Each planner turns the current sync items and one request into the exact
 * keys to set and remove. The safety rules: write only what changed, remove
 * only what the user removed, never touch the legacy `config` item.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  newSite,
  planAddSites,
  planUpdateSite,
  planRemoveSite,
  planUpdateDefaults,
  planImport,
} from '../../src/background/config_mutations.js';
import { assembleConfig, siteKey } from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { PauseStyle, SCHEMA_VERSION } from '../../src/constants.js';

const NOW = 1_700_000_000_000;

function idSource(...ids) {
  const queue = [...ids];
  return () => {
    if (queue.length === 0) throw new Error('test ran out of ids');
    return queue.shift();
  };
}

const legacy = {
  schemaVersion: 2,
  globalTarget: 'https://legacy.example/',
  globalTargetName: '',
  globalNote: '',
  globalAutoContinue: false,
  globalCountdownSeconds: 3,
  sites: [
    { id: 'old1', pattern: 'old1.com', displayName: null, includeSubdomains: true, target: null, note: null, autoContinue: null, countdownSeconds: null, enabled: true },
    { id: 'old2', pattern: 'old2.com', displayName: null, includeSubdomains: true, target: null, note: 'why', autoContinue: null, countdownSeconds: null, enabled: true },
  ],
};

function v3Items() {
  return {
    schema: 3,
    [siteKey('a')]: newSite('a.com', { id: 'a', order: 0, now: NOW }),
    [siteKey('b')]: newSite('b.com', { id: 'b', order: 1, now: NOW }),
  };
}

/** Apply a plan to an items object, as the worker's storage calls would. */
function apply(items, { set, remove }) {
  const next = { ...items, ...set };
  for (const key of remove) delete next[key];
  return next;
}

/* newSite ---------------------------------------------------------------------- */

test('newSite normalizes the host and applies the documented defaults', () => {
  const site = newSite('https://WWW.Reddit.com/r/x', { id: 'id', order: 3, now: NOW });
  assert.deepEqual(site, {
    id: 'id',
    pattern: 'www.reddit.com',
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: NOW,
    order: 3,
    overrides: {},
  });
});

test('newSite stores a trimmed reason as an override, and none when blank', () => {
  assert.deepEqual(newSite('a.com', { id: 'x', order: 0, now: NOW, reason: '  focus ' }).overrides, { reasons: ['focus'] });
  assert.deepEqual(newSite('a.com', { id: 'x', order: 0, now: NOW, reason: '   ' }).overrides, {});
});

/* planAddSites ------------------------------------------------------------------- */

test('planAddSites in v3 mode sets only the new site keys', () => {
  const { plan, added, skipped } = planAddSites(v3Items(), { entries: [{ host: 'c.com' }] }, { newId: idSource('c'), now: NOW });
  assert.deepEqual(Object.keys(plan.set), [siteKey('c')]);
  assert.deepEqual(plan.remove, []);
  assert.deepEqual(added, ['c']);
  assert.deepEqual(skipped, []);
  assert.equal(plan.set[siteKey('c')].order, 2);
});

test('planAddSites skips hosts already listed and duplicates within the request', () => {
  const { plan, added, skipped } = planAddSites(
    v3Items(),
    { entries: [{ host: 'A.com' }, { host: 'd.com' }, { host: 'd.com/path' }] },
    { newId: idSource('d'), now: NOW }
  );
  assert.deepEqual(added, ['d']);
  assert.deepEqual(skipped, ['a.com', 'd.com']);
  assert.deepEqual(Object.keys(plan.set), [siteKey('d')]);
});

test('the first write materializes the legacy sites and the schema marker, never settings or config', () => {
  const { plan } = planAddSites({ config: legacy }, { entries: [{ host: 'new.com', reason: 'r' }] }, { newId: idSource('n'), now: NOW });
  assert.deepEqual(Object.keys(plan.set).sort(), ['schema', siteKey('n'), siteKey('old1'), siteKey('old2')].sort());
  assert.equal(plan.set.schema, 3);
  assert.deepEqual(plan.set[siteKey('old2')].overrides, { reasons: ['why'] });
  assert.equal(plan.set[siteKey('n')].order, 2);
  assert.deepEqual(plan.remove, []);
});

test('planAddSites rejects an invalid host', () => {
  assert.throws(() => planAddSites(v3Items(), { entries: [{ host: 'nodot' }] }, { newId: idSource('x'), now: NOW }), /hostname/);
});

/* planUpdateSite ------------------------------------------------------------------ */

test('planUpdateSite in v3 mode sets exactly one key', () => {
  const plan = planUpdateSite(v3Items(), { siteId: 'a', fields: { enabled: false }, setOverrides: { pauseStyle: PauseStyle.BREATHING } });
  assert.deepEqual(Object.keys(plan.set), [siteKey('a')]);
  assert.deepEqual(plan.remove, []);
  assert.equal(plan.set[siteKey('a')].enabled, false);
  assert.deepEqual(plan.set[siteKey('a')].overrides, { pauseStyle: PauseStyle.BREATHING });
});

test('planUpdateSite clears overrides so the site inherits again', () => {
  const items = apply(v3Items(), planUpdateSite(v3Items(), { siteId: 'a', setOverrides: { pauseStyle: PauseStyle.INTENTION, reasons: ['x'] } }));
  const plan = planUpdateSite(items, { siteId: 'a', clearOverrides: ['pauseStyle'] });
  assert.deepEqual(plan.set[siteKey('a')].overrides, { reasons: ['x'] });
});

test('planUpdateSite rejects global-only overrides, unknown fields and unknown sites', () => {
  assert.throws(() => planUpdateSite(v3Items(), { siteId: 'a', setOverrides: { pauseSeconds: 10 } }), /global/);
  assert.throws(() => planUpdateSite(v3Items(), { siteId: 'a', fields: { pattern: 'x.com' } }), /pattern/);
  assert.throws(() => planUpdateSite(v3Items(), { siteId: 'a', clearOverrides: ['bypassMinutes'] }), /bypassMinutes/);
  assert.throws(() => planUpdateSite(v3Items(), { siteId: 'zzz', fields: { enabled: true } }), /zzz/);
});

test('planUpdateSite on a legacy site materializes, with the edit applied', () => {
  const plan = planUpdateSite({ config: legacy }, { siteId: 'old1', fields: { displayName: 'Old' } });
  assert.equal(plan.set.schema, 3);
  assert.equal(plan.set[siteKey('old1')].displayName, 'Old');
  assert.ok(plan.set[siteKey('old2')]);
  assert.equal(plan.set.config, undefined);
});

/* planRemoveSite ---------------------------------------------------------------------- */

test('planRemoveSite in v3 mode removes exactly one key and sets nothing', () => {
  const plan = planRemoveSite(v3Items(), { siteId: 'a' });
  assert.deepEqual(plan.set, {});
  assert.deepEqual(plan.remove, [siteKey('a')]);
});

test('planRemoveSite never removes a key the request did not name, even stray ones', () => {
  const items = { ...v3Items(), [siteKey('stray')]: { broken: true } };
  const plan = planRemoveSite(items, { siteId: 'b' });
  assert.deepEqual(plan.remove, [siteKey('b')]);
});

test('planRemoveSite removes a damaged site item the user named', () => {
  const items = { ...v3Items(), [siteKey('bad')]: { broken: true } };
  const plan = planRemoveSite(items, { siteId: 'bad' });
  assert.deepEqual(plan, { set: {}, remove: [siteKey('bad')] });
  assert.throws(() => planRemoveSite(items, { siteId: 'nope' }), /no listed site/);
});

test('planRemoveSite on legacy data materializes the remaining sites only', () => {
  const plan = planRemoveSite({ config: legacy }, { siteId: 'old1' });
  assert.deepEqual(Object.keys(plan.set).sort(), ['schema', siteKey('old2')].sort());
  const after = assembleConfig(apply({ config: legacy }, plan));
  assert.deepEqual(after.sites.map((s) => s.id), ['old2']);
});

/* planUpdateDefaults ---------------------------------------------------------------------- */

test('planUpdateDefaults in v3 mode sets only settings', () => {
  const plan = planUpdateDefaults(v3Items(), { patch: { bypassMinutes: 15 } });
  assert.deepEqual(Object.keys(plan.set), ['settings']);
  assert.equal(plan.set.settings.defaults.bypassMinutes, 15);
  assert.deepEqual(plan.remove, []);
});

test('planUpdateDefaults starts from the legacy global values', () => {
  const plan = planUpdateDefaults({ config: legacy }, { patch: { pauseSeconds: 10 } });
  assert.equal(plan.set.settings.defaults.target, 'https://legacy.example/');
  assert.equal(plan.set.settings.defaults.pauseSeconds, 10);
  assert.equal(plan.set.schema, 3);
});

test('planUpdateDefaults rejects an invalid or unknown value', () => {
  assert.throws(() => planUpdateDefaults(v3Items(), { patch: { bypassMinutes: 7 } }), /bypassMinutes/);
  assert.throws(() => planUpdateDefaults(v3Items(), { patch: { theme: 'dark' } }), /theme/);
});

/* Invariants ------------------------------------------------------------------------------- */

test('no planner writes or removes the legacy config item', () => {
  const items = { config: legacy };
  const plans = [
    planAddSites(items, { entries: [{ host: 'n.com' }] }, { newId: idSource('n'), now: NOW }).plan,
    planUpdateSite(items, { siteId: 'old1', fields: { enabled: false } }),
    planRemoveSite(items, { siteId: 'old2' }),
    planUpdateDefaults(items, { patch: { varyPresentation: false } }),
  ];
  for (const plan of plans) {
    assert.equal('config' in plan.set, false);
    assert.equal(plan.remove.includes('config'), false);
  }
});

test('stale-copy race: an add, then an update built from an older read, keeps both', () => {
  let items = v3Items();
  // The settings tab read the config before the popup added a site...
  const staleRequest = { siteId: 'a', setOverrides: { reasons: ['edited'] } };
  // ...the popup's add lands first...
  items = apply(items, planAddSites(items, { entries: [{ host: 'popup.com' }] }, { newId: idSource('p'), now: NOW }).plan);
  // ...then the worker plans the settings edit against current storage.
  items = apply(items, planUpdateSite(items, staleRequest));

  const config = assembleConfig(items);
  assert.deepEqual(config.sites.map((s) => s.id), ['a', 'b', 'p']);
  assert.deepEqual(config.sites[0].overrides.reasons, ['edited']);
});

test('defaults written by planUpdateDefaults validate when read back', () => {
  const items = apply(v3Items(), planUpdateDefaults(v3Items(), { patch: { pauseStyle: PauseStyle.ROTATE } }));
  assert.deepEqual(assembleConfig(items).defaults, { ...defaultSettings(), pauseStyle: PauseStyle.ROTATE });
});

/* planImport -------------------------------------------------------------------- */

function imported(...ids) {
  return {
    schemaVersion: SCHEMA_VERSION,
    defaults: { ...defaultSettings(), bypassMinutes: 30 },
    sites: ids.map((id, order) => newSite(`${id}.example`, { id, order, now: NOW })),
  };
}

test('planImport replaces settings and sites, removing only the sites it replaces', () => {
  const items = { ...v3Items(), [siteKey('stray')]: { broken: true } };
  const { plan, siteCount } = planImport(items, { config: imported('a', 'n') });
  assert.equal(siteCount, 2);
  assert.deepEqual(Object.keys(plan.set).sort(), ['schema', 'settings', siteKey('a'), siteKey('n')].sort());
  assert.deepEqual(plan.set.settings.defaults.bypassMinutes, 30);
  // b was listed and is not in the file; a is overwritten; the unreadable
  // stray item was never listed, so it is left alone.
  assert.deepEqual(plan.remove, [siteKey('b')]);
});

test('planImport over legacy data never writes or removes config', () => {
  const { plan } = planImport({ config: legacy }, { config: imported('n') });
  assert.equal('config' in plan.set, false);
  assert.deepEqual(plan.remove, []);
  const items = apply({ config: legacy }, plan);
  assert.deepEqual(assembleConfig(items).sites.map((s) => s.id), ['n']);
  assert.deepEqual(items.config, legacy);
});

test('planImport re-validates what the page sent', () => {
  const bad = imported('a');
  bad.defaults.bypassMinutes = 7;
  assert.throws(() => planImport(v3Items(), { config: bad }), /defaults\.bypassMinutes/);
  assert.throws(() => planImport(v3Items(), { config: { ...imported('a'), schemaVersion: 2 } }), /schemaVersion/);
  assert.throws(() => planImport(v3Items(), {}), /config must be an object/);
});

test('planImport of an empty list removes every listed site', () => {
  const { plan, siteCount } = planImport(v3Items(), { config: imported() });
  assert.equal(siteCount, 0);
  assert.deepEqual(plan.remove.sort(), [siteKey('a'), siteKey('b')]);
});
