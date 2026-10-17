/**
 * The worker as the sole config writer, end to end with chrome.* stubbed:
 * mutations queue, the legacy item is never touched, and a corrupt site
 * item hides nothing else.
 * Run: node --test tests/unit/
 *
 * These are the automated halves of the plan's G5-A manual checks M1, M2 and
 * M4; tools/upgrade_check.mjs runs the same checks in a real Chromium.
 */

import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { handleMessage } from '../../src/background/message_handlers.js';
import { applyMutation, readConfig } from '../../src/background/config.js';
import { newSite } from '../../src/background/config_mutations.js';
import { siteKey } from '../../src/background/sync_layout.js';
import { defaultSettings } from '../../src/background/settings_schema.js';
import { buildExport, parseImport } from '../../src/background/settings_io.js';
import { MessageType, PauseStyle, StorageKey } from '../../src/constants.js';
import { createFakeChrome } from './helpers/fake_chrome.js';

const NOW = 1_700_000_000_000;
const realConfig = () => JSON.parse(readFileSync(new URL('./fixtures/config_v2_real.json', import.meta.url), 'utf8'));

let fake;
const quiet = {};

function install(sync, options = {}) {
  fake = createFakeChrome({ sync, ...options });
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

const send = (message) => handleMessage(message);
const syncStore = () => fake.chrome.storage.sync.store;
const touchedKeys = () => [...fake.calls.syncSets.flat(), ...fake.calls.syncRemoves.flat()];

/* The mutation queue -------------------------------------------------------------- */

test('two concurrent mutations run in order: the second sees the first', async () => {
  install({ schema: 3, [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }) });
  const [add, update] = await Promise.all([
    send({ type: MessageType.ADD_SITES, entries: [{ host: 'youtube.com' }] }),
    send({ type: MessageType.UPDATE_SITE, siteId: 'r', setOverrides: { pauseStyle: PauseStyle.BREATHING } }),
  ]);
  assert.equal(add.added.length, 1);
  assert.deepEqual(update, {});
  const config = await readConfig();
  assert.deepEqual(config.sites.map((site) => site.pattern), ['reddit.com', 'youtube.com']);
  assert.equal(config.sites[0].overrides.pauseStyle, PauseStyle.BREATHING);
});

test('two concurrent adds both land, in the order they were sent', async () => {
  install({});
  await Promise.all([
    send({ type: MessageType.ADD_SITES, entries: [{ host: 'a.com' }] }),
    send({ type: MessageType.ADD_SITES, entries: [{ host: 'b.com' }] }),
  ]);
  const config = await readConfig();
  assert.deepEqual(config.sites.map((site) => [site.pattern, site.order]), [['a.com', 0], ['b.com', 1]]);
});

test('a failed mutation does not block the next one', async () => {
  install({});
  const results = await Promise.allSettled([
    send({ type: MessageType.UPDATE_SITE, siteId: 'missing', setOverrides: {} }),
    send({ type: MessageType.ADD_SITES, entries: [{ host: 'a.com' }] }),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.match(results[0].reason.message, /missing/);
  assert.equal(results[1].status, 'fulfilled');
});

test('applyMutation checks the quota before writing anything', async () => {
  install({});
  const huge = { ...newSite('a.com', { id: 'a', order: 0, now: NOW }), overrides: { reasons: ['א'.repeat(4500)] } };
  await assert.rejects(applyMutation({ set: { [siteKey('a')]: huge }, remove: [] }, {}), /site:a is \d+ bytes/);
  assert.deepEqual(fake.calls.syncSets, []);
});

/** `count` sites with five long Hebrew reasons each, under ids `${prefix}<n>`. */
function heavySites(prefix, count) {
  const reasons = Array.from({ length: 5 }, (_, k) => 'אבגדהוזחטי'.repeat(14).slice(k));
  return Array.from({ length: count }, (_, n) => ({
    ...newSite(`site${n}.example.com`, { id: `${prefix}${n}`, order: n, now: NOW }),
    overrides: { reasons },
  }));
}

test('an import that replaces every site fits when its final state fits, even if old plus new would not', async () => {
  // Chrome checks the total at the set: writing the new sites before removing
  // the old ones refused an import from another browser whose result fits.
  const current = { schema: 3 };
  for (const site of heavySites('old', 30)) current[siteKey(site.id)] = site;
  const config = { schemaVersion: 3, defaults: defaultSettings(), sites: heavySites('new', 30) };
  const bytes = (items) => Object.entries(items).reduce((sum, [key, value]) => sum + new TextEncoder().encode(key + JSON.stringify(value)).length, 0);
  const quota = Math.ceil(bytes(current) * 1.5);
  install(structuredClone(current), { syncQuotaBytes: quota });

  assert.equal((await send({ type: MessageType.IMPORT_SETTINGS, config })).siteCount, 30);
  assert.deepEqual((await readConfig()).sites.map((site) => site.id), config.sites.map((site) => site.id));
});

test('when the write fails after the removal, the removed sites are put back and the error says so', async () => {
  const current = { schema: 3, [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }) };
  install(structuredClone(current));
  const realSet = fake.chrome.storage.sync.set;
  let failNext = true;
  fake.chrome.storage.sync.set = async (items) => {
    if (failNext) {
      failNext = false;
      throw new Error('MAX_WRITE_OPERATIONS_PER_MINUTE');
    }
    return realSet(items);
  };
  const config = { schemaVersion: 3, defaults: defaultSettings(), sites: [newSite('youtube.com', { id: 'y', order: 0, now: NOW })] };

  await assert.rejects(send({ type: MessageType.IMPORT_SETTINGS, config }), /\[steer-clear\].*MAX_WRITE.*restored/);
  assert.deepEqual(syncStore(), current, 'the settings are as they were');
});

/* Upgrade from 1.0.0 (M1) --------------------------------------------------------- */

test('editing on this version never writes or removes the 1.0.0 config item', async () => {
  const stored = realConfig();
  install({ [StorageKey.CONFIG]: stored });
  const before = JSON.stringify(syncStore().config);
  const [first, second] = (await readConfig()).sites;

  await send({ type: MessageType.UPDATE_SITE, siteId: first.id, setOverrides: { reasons: ['edited'] } });
  await send({ type: MessageType.UPDATE_DEFAULTS, patch: { bypassMinutes: 15 } });
  await send({ type: MessageType.ADD_SITES, entries: [{ host: 'youtube.com' }] });
  await send({ type: MessageType.REMOVE_SITE, siteId: second.id });

  assert.equal(JSON.stringify(syncStore().config), before);
  assert.equal(touchedKeys().includes(StorageKey.CONFIG), false);
  const config = await readConfig();
  assert.deepEqual(config.sites.map((site) => site.pattern), [stored.sites[0].pattern, stored.sites[2].pattern, 'youtube.com']);
  assert.deepEqual(config.sites[0].overrides.reasons, ['edited']);
  assert.equal(config.defaults.bypassMinutes, 15);
  assert.equal(config.defaults.targetName, stored.globalTargetName, 'legacy global values carried into settings');
});

test('reading after the upgrade writes nothing', async () => {
  install({ [StorageKey.CONFIG]: realConfig() });
  await readConfig();
  await send({ type: MessageType.GET_RESOLVED_SITE, fromUrl: 'https://www.reddit.com/' });
  await send({ type: MessageType.GET_STATUS });
  assert.deepEqual(fake.calls.syncSets, []);
});

/* Many sites (M2) ------------------------------------------------------------------- */

test('40 legacy sites upgrade, and a 41st can be added', async () => {
  const stored = realConfig();
  stored.sites = Array.from({ length: 40 }, (_, i) => ({
    ...stored.sites[0],
    id: `legacy-${i}`,
    pattern: `s${String(i).padStart(2, '0')}.com`,
    note: `reason ${i}`.padEnd(150, '.'),
  }));
  install({ [StorageKey.CONFIG]: stored });
  const { added } = await send({ type: MessageType.ADD_SITES, entries: [{ host: 'forty-one.com' }] });
  assert.equal(added.length, 1);
  assert.equal((await readConfig()).sites.length, 41);
});

/* A corrupt site item (M4) ------------------------------------------------------------ */

test('one corrupt site item leaves the others working and continue on it still works', async () => {
  install({
    schema: 3,
    [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }),
    [siteKey('y')]: newSite('youtube.com', { id: 'y', order: 1, now: NOW }),
  });
  syncStore()[siteKey('r')] = { id: 42, pattern: '' };

  const config = await readConfig();
  assert.deepEqual(config.sites.map((site) => site.id), ['y']);
  assert.deepEqual(config.invalidSites.map((entry) => entry.key), [siteKey('r')]);

  const youtube = await send({ type: MessageType.GET_RESOLVED_SITE, fromUrl: 'https://www.youtube.com/' });
  assert.equal(youtube.matched, true);
  const reddit = await send({ type: MessageType.GET_RESOLVED_SITE, fromUrl: 'https://www.reddit.com/' });
  assert.equal(reddit.host, 'www.reddit.com');
  const pass = await send({ type: MessageType.GRANT_BYPASS, host: 'www.reddit.com' });
  assert.ok(Number.isFinite(pass.expiresAt));

  // Editing another site never rewrites or removes the corrupt item.
  await send({ type: MessageType.UPDATE_SITE, siteId: 'y', fields: { enabled: false } });
  assert.deepEqual(syncStore()[siteKey('r')], { id: 42, pattern: '' });
});

/* Import (G5-B) --------------------------------------------------------------------- */

test('IMPORT_SETTINGS replaces sites and settings and leaves the 1.0.0 item alone', async () => {
  install({ [StorageKey.CONFIG]: realConfig() });
  const before = JSON.stringify(syncStore().config);
  const source = {
    schemaVersion: 3,
    defaults: { ...(await readConfig()).defaults, bypassMinutes: 30 },
    sites: [newSite('youtube.com', { id: 'y', order: 0, now: NOW })],
  };
  const { config } = parseImport(JSON.stringify(buildExport(source, '2.0.0', NOW)));

  assert.deepEqual(await send({ type: MessageType.IMPORT_SETTINGS, config }), { siteCount: 1, revokeHosts: ['reddit.com', 'ynet.co.il', 'x.com'] });
  const after = await readConfig();
  assert.deepEqual(after.sites.map((site) => site.id), ['y']);
  assert.equal(after.defaults.bypassMinutes, 30);
  assert.equal(JSON.stringify(syncStore().config), before);
});

test('an invalid import is refused and changes nothing', async () => {
  install({ schema: 3, [siteKey('r')]: newSite('reddit.com', { id: 'r', order: 0, now: NOW }) });
  const before = structuredClone(syncStore());
  const config = { schemaVersion: 3, defaults: { bypassMinutes: 7 }, sites: [] };
  await assert.rejects(send({ type: MessageType.IMPORT_SETTINGS, config }), /defaults\.bypassMinutes/);
  assert.deepEqual(syncStore(), before);
  assert.deepEqual(fake.calls.syncSets, []);
});
