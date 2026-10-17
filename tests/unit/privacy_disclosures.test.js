/**
 * The privacy policy and every listing disclose what the code does (plan
 * G5-B acceptance 3): every local and session storage key, every manifest
 * permission, and every `tabs` API the source calls (also when the call is
 * split across lines).
 * Run: node --test tests/unit/
 *
 * An inaccurate disclosure is grounds for takedown, and the privacy stance is
 * the product. Adding a key, a permission or an API without saying so in the
 * policy fails here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { StorageKey } from '../../src/constants.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const manifest = JSON.parse(read('src/manifest.json'));

/** Keys kept in storage.local and storage.session (plan: local and session data layout). */
const DEVICE_KEYS = [
  StorageKey.STATS,
  StorageKey.LIFECYCLE,
  StorageKey.BYPASSES,
  StorageKey.BADGED_TABS,
  StorageKey.LIFTED_RULES,
  StorageKey.SNOOZE,
];

/** Every `chrome.tabs.<method>` called under src/. */
function tabsApisUsed(dir = join(ROOT, 'src')) {
  const found = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      for (const api of tabsApisUsed(path)) found.add(api);
    } else if (entry.name.endsWith('.js')) {
      for (const [, method] of readFileSync(path, 'utf8').matchAll(/chrome\.tabs\s*\.\s*(\w+)/g)) {
        if (!method.startsWith('on')) found.add(`tabs.${method}`);
      }
    }
  }
  return found;
}

const DOCS = ['store/PRIVACY_POLICY.md', 'store/LISTING.md', 'store/LISTING_EDGE.md', 'store/LISTING_FIREFOX.md'];

test('the tabs APIs in use are the ones this test expects', () => {
  assert.deepEqual([...tabsApisUsed()].sort(), ['tabs.create', 'tabs.getCurrent', 'tabs.query', 'tabs.update']);
});

for (const doc of DOCS) {
  const text = read(doc);

  test(`${doc} names every local and session storage key`, () => {
    for (const key of DEVICE_KEYS) assert.ok(text.includes(`\`${key}\``), `${key} not disclosed`);
  });

  test(`${doc} names every manifest permission`, () => {
    for (const permission of manifest.permissions) {
      assert.ok(text.includes(`\`${permission}\``), `${permission} not disclosed`);
    }
  });

  test(`${doc} names every tabs API used`, () => {
    for (const api of tabsApisUsed()) assert.ok(text.includes(`\`${api}\``), `${api} not disclosed`);
  });
}

test('the privacy policy covers each browser\'s sync and the export file', () => {
  const policy = read('store/PRIVACY_POLICY.md');
  for (const phrase of ['Chrome Sync', 'Firefox Sync', 'Firefox for Android', 'Microsoft Edge', 'export']) {
    assert.ok(policy.includes(phrase), `missing "${phrase}"`);
  }
});
