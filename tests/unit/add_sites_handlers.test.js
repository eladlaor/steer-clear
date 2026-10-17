/**
 * The click handlers that add sites and ask for access: popup quick-add,
 * onboarding's "Turn on", and the settings page's add form.
 * Run: node --test tests/unit/
 *
 * Firefox drops the user gesture at the first `await`, and may close the
 * popup as soon as the permission prompt opens. So each handler sends the
 * worker message first, without waiting, and calls permissions.request in
 * the same synchronous tick. These tests call a handler and look at the
 * stubs before yielding once: anything awaited in between would show up as
 * a missing call.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { quickAdd, quickAddHost, quickAddOffer } from '../../src/popup/quick_add.js';
import { turnOn } from '../../src/onboarding/turn_on.js';
import { SitesNotAddedError, addSitesThenRequestAccess } from '../../src/shared/site_access.js';
import { originPatternsFor } from '../../src/background/permissions.js';
import { LifecycleEvent, MessageType } from '../../src/constants.js';

let log;
let grant;
const quiet = {};

beforeEach(() => {
  log = [];
  grant = true;
  globalThis.chrome = {
    runtime: {
      sendMessage: (message) => {
        log.push({ call: 'sendMessage', message });
        return Promise.resolve({ ok: true });
      },
    },
    permissions: {
      request: (request) => {
        log.push({ call: 'permissions.request', origins: request.origins });
        return Promise.resolve(grant);
      },
    },
  };
  for (const level of ['info', 'warn', 'error']) {
    quiet[level] = console[level];
    console[level] = () => {};
  }
});

afterEach(() => {
  delete globalThis.chrome;
  for (const level of Object.keys(quiet)) console[level] = quiet[level];
});

const calls = () => log.map((entry) => entry.call);

/* Popup quick-add ---------------------------------------------------------------------- */

test('quick-add sends ADD_SITES, then requests access, with no await between', async () => {
  const pending = quickAdd('reddit.com');

  // Nothing has been awaited yet: both calls must already have happened.
  assert.deepEqual(calls(), ['sendMessage', 'permissions.request']);
  assert.deepEqual(log[0].message, { type: MessageType.ADD_SITES, entries: [{ host: 'reddit.com' }] });
  assert.deepEqual(log[1].origins, originPatternsFor('reddit.com'));
  assert.equal(await pending, true);
});

test('quick-add resolves false when the prompt is refused; the site is still sent', async () => {
  grant = false;
  assert.equal(await quickAdd('reddit.com'), false);
  assert.equal(log[0].message.type, MessageType.ADD_SITES);
});

test('quickAddHost lists the site without www and skips pages that cannot be listed', () => {
  assert.equal(quickAddHost('https://www.reddit.com/r/all?x=1'), 'reddit.com');
  assert.equal(quickAddHost('http://news.example.org:8080/a'), 'news.example.org');
  assert.equal(quickAddHost('https://www.co'), 'www.co', 'a bare www. domain keeps its name');
  for (const url of ['chrome://extensions', 'about:addons', 'moz-extension://x/popup.html', 'file:///tmp/a.html', 'http://localhost:3000/']) {
    assert.equal(quickAddHost(url), null, url);
  }
  assert.equal(quickAddHost(undefined), null, 'a tab without a readable URL');
});

/** A config listing the given sites, as readConfig returns it (only the fields matching reads). */
const listing = (...sites) => ({
  sites: sites.map((site, index) => ({
    id: `s${index}`,
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    ...site,
  })),
});

test('quickAddOffer offers an unlisted web page and nothing for other pages', () => {
  assert.deepEqual(quickAddOffer('https://www.reddit.com/r/all', listing()), { host: 'reddit.com', listed: null });
  assert.equal(quickAddOffer('chrome://extensions', listing()), null);
  assert.equal(quickAddOffer(undefined, listing()), null);
});

test('quickAddOffer reports a site that already matches the tab instead of offering it', () => {
  const offer = quickAddOffer('https://old.reddit.com/', listing({ pattern: 'reddit.com' }));
  assert.equal(offer.host, 'old.reddit.com');
  assert.equal(offer.listed.pattern, 'reddit.com');
});

test('quickAddOffer reports a turned-off site rather than offering an add the worker would skip', () => {
  // ADD_SITES skips a host that is already listed, so offering it would
  // claim "added" while the site stays off.
  const offer = quickAddOffer('https://www.reddit.com/', listing({ pattern: 'reddit.com', enabled: false }));
  assert.equal(offer.listed?.pattern, 'reddit.com');
  assert.equal(offer.listed.enabled, false);
});

test('quickAddOffer reports a listed host that does not cover the tab\'s www subdomain', () => {
  const offer = quickAddOffer('https://www.reddit.com/', listing({ pattern: 'reddit.com', includeSubdomains: false }));
  assert.equal(offer.listed?.pattern, 'reddit.com');
});

/* Onboarding "Turn on" ----------------------------------------------------------------- */

test('Turn on sends every selected site in one ADD_SITES, then requests all their access', async () => {
  const { hosts, granted } = turnOn({
    chips: ['reddit.com', 'youtube.com'],
    typedHosts: ['Example.com/path'],
    reasons: { 'reddit.com': 'I have work to do', 'example.com': '  ' },
  });

  assert.deepEqual(calls().slice(0, 2), ['sendMessage', 'permissions.request']);
  assert.deepEqual(hosts, ['reddit.com', 'youtube.com', 'example.com']);
  assert.deepEqual(log[0].message, {
    type: MessageType.ADD_SITES,
    entries: [
      { host: 'reddit.com', reason: 'I have work to do' },
      { host: 'youtube.com', reason: '' },
      { host: 'example.com', reason: '' },
    ],
  });
  assert.deepEqual(log[1].origins, hosts.flatMap(originPatternsFor));
  assert.equal(await granted, true);
});

test('Turn on also records onboarding as completed, after the prompt call', () => {
  turnOn({ chips: ['reddit.com'], typedHosts: [], reasons: {} });
  assert.deepEqual(calls(), ['sendMessage', 'permissions.request', 'sendMessage']);
  assert.deepEqual(log[2].message, {
    type: MessageType.RECORD_LIFECYCLE_EVENT,
    event: LifecycleEvent.ONBOARDING_COMPLETED,
  });
});

test('Turn on with nothing picked throws before sending anything', () => {
  assert.throws(() => turnOn({ chips: [], typedHosts: [], reasons: {} }), /pick at least one/i);
  assert.deepEqual(log, []);
});

/* Shared helper (settings add uses it directly) ------------------------------------------- */

test('addSitesThenRequestAccess rejects an empty list without prompting', () => {
  assert.throws(() => addSitesThenRequestAccess([]), /at least one/);
  assert.deepEqual(log, []);
});

test('a failed add rejects naming the worker error, and hands back the access just granted', async () => {
  // Nothing was stored, so "added" would be false, and access to a site that
  // is not listed is an over-reach.
  globalThis.chrome.runtime.sendMessage = (message) => {
    log.push({ call: 'sendMessage', message });
    return Promise.resolve({ ok: false, error: 'at most 200 sites can be listed' });
  };
  globalThis.chrome.permissions.remove = (request) => {
    log.push({ call: 'permissions.remove', origins: request.origins });
    return Promise.resolve(true);
  };
  const errors = [];
  console.error = (...args) => errors.push(args);

  const pending = addSitesThenRequestAccess([{ host: 'reddit.com' }]);
  assert.deepEqual(calls(), ['sendMessage', 'permissions.request'], 'the prompt still opened in the same tick');
  await assert.rejects(pending, (error) => {
    assert.ok(error instanceof SitesNotAddedError);
    assert.match(error.message, /Could not add reddit\.com: at most 200 sites/);
    return true;
  });
  assert.deepEqual(log[2], { call: 'permissions.remove', origins: originPatternsFor('reddit.com') });
  assert.ok(errors.some(([line]) => String(line).includes('[steer-clear]')), 'the failure is logged');
});

test('a failed add with a refused prompt revokes nothing', async () => {
  grant = false;
  globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ ok: false, error: 'quota' });
  globalThis.chrome.permissions.remove = () => assert.fail('nothing was granted');
  await assert.rejects(quickAdd('reddit.com'), SitesNotAddedError);
});

test('Turn on surfaces a failed add through its granted promise', async () => {
  globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ ok: false, error: 'quota' });
  globalThis.chrome.permissions.remove = () => Promise.resolve(true);
  const { granted } = turnOn({ chips: ['reddit.com'], typedHosts: [], reasons: {} });
  await assert.rejects(granted, SitesNotAddedError);
});
