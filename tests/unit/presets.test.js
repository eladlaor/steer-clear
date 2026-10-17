/**
 * Unit tests for the onboarding site presets.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { PRESETS, normalizeOnboardingSelection, presetHosts } from '../../src/background/presets.js';
import { normalizePattern } from '../../src/background/rules.js';

test('presets are grouped into the four documented categories', () => {
  assert.deepEqual(
    PRESETS.map((group) => group.id),
    ['social', 'news', 'video', 'shopping']
  );
  for (const group of PRESETS) {
    assert.equal(typeof group.label, 'string');
    assert.ok(group.hosts.length > 0, group.id);
  }
  assert.deepEqual(PRESETS.find((group) => group.id === 'social').hosts, [
    'facebook.com',
    'instagram.com',
    'x.com',
    'tiktok.com',
    'reddit.com',
  ]);
});

test('presets cannot be changed at runtime', () => {
  assert.ok(Object.isFrozen(PRESETS));
  for (const group of PRESETS) {
    assert.ok(Object.isFrozen(group));
    assert.ok(Object.isFrozen(group.hosts));
  }
});

test('every preset host passes normalizePattern unchanged', () => {
  for (const host of presetHosts()) {
    assert.equal(normalizePattern(host), host);
  }
});

test('no host appears in two categories', () => {
  const hosts = presetHosts();
  assert.equal(new Set(hosts).size, hosts.length);
});

test('the selection is the union of chips and typed hosts, chips first', () => {
  assert.deepEqual(normalizeOnboardingSelection(['reddit.com', 'youtube.com'], ['example.com']), [
    'reddit.com',
    'youtube.com',
    'example.com',
  ]);
});

test('typed hosts are normalized', () => {
  assert.deepEqual(normalizeOnboardingSelection([], ['Example.com/path', 'https://News.example.org/?q=1']), [
    'example.com',
    'news.example.org',
  ]);
});

test('duplicates collapse, including a typed host that is also a chip', () => {
  assert.deepEqual(
    normalizeOnboardingSelection(['reddit.com', 'reddit.com'], ['REDDIT.com', 'example.com', 'example.com/x']),
    ['reddit.com', 'example.com']
  );
});

test('an empty selection is empty', () => {
  assert.deepEqual(normalizeOnboardingSelection([], []), []);
});

test('an unknown chip throws', () => {
  assert.throws(() => normalizeOnboardingSelection(['myspace.com'], []), /myspace\.com/);
});

test('an invalid typed host throws', () => {
  assert.throws(() => normalizeOnboardingSelection([], ['not a domain']), /not a domain/);
});

test('non-array arguments throw', () => {
  assert.throws(() => normalizeOnboardingSelection('reddit.com', []), /chips/);
  assert.throws(() => normalizeOnboardingSelection([], null), /typedHosts/);
});
