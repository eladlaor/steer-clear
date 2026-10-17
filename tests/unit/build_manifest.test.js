/**
 * Tests for the per-browser manifest derivation in tools/manifest_targets.mjs.
 * Run: node --test tests/unit/
 *
 * src/manifest.json carries both background keys and the Firefox settings, so
 * it loads unpacked in Chrome and Firefox alike. Each store gets a stripped
 * copy: Chrome's has nothing Firefox-only, Firefox's has nothing Chrome-only.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { deriveManifest } from '../../tools/manifest_targets.mjs';
import { BuildTarget } from '../../tools/tool_constants.mjs';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const base = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));

test('chrome target drops the Firefox-only keys', () => {
  const chrome = deriveManifest(base, BuildTarget.CHROME);

  assert.equal(chrome.browser_specific_settings, undefined);
  assert.equal(chrome.background.scripts, undefined);
});

test('chrome target keeps the service worker, module type and minimum version', () => {
  const chrome = deriveManifest(base, BuildTarget.CHROME);

  assert.equal(chrome.background.service_worker, base.background.service_worker);
  assert.equal(chrome.background.type, 'module');
  assert.equal(chrome.minimum_chrome_version, base.minimum_chrome_version);
});

test('firefox target drops the Chrome-only keys', () => {
  const firefox = deriveManifest(base, BuildTarget.FIREFOX);

  assert.equal(firefox.background.service_worker, undefined);
  assert.equal(firefox.minimum_chrome_version, undefined);
});

test('firefox target keeps scripts, module type, gecko settings and optional host access', () => {
  const firefox = deriveManifest(base, BuildTarget.FIREFOX);

  assert.deepEqual(firefox.background.scripts, base.background.scripts);
  assert.equal(firefox.background.type, 'module');
  assert.deepEqual(firefox.browser_specific_settings, base.browser_specific_settings);
  assert.deepEqual(firefox.optional_host_permissions, base.optional_host_permissions);
});

test('both targets keep everything that is not browser-specific', () => {
  for (const target of Object.values(BuildTarget)) {
    const derived = deriveManifest(base, target);
    for (const key of ['name', 'version', 'permissions', 'action', 'icons', 'web_accessible_resources']) {
      assert.deepEqual(derived[key], base[key], `${target} lost ${key}`);
    }
  }
});

test('does not mutate its input', () => {
  const snapshot = structuredClone(base);

  deriveManifest(base, BuildTarget.CHROME);
  deriveManifest(base, BuildTarget.FIREFOX);

  assert.deepEqual(base, snapshot);
});

test('returns a copy that does not share nested objects with the input', () => {
  const firefox = deriveManifest(base, BuildTarget.FIREFOX);
  firefox.background.scripts.push('extra.js');

  assert.deepEqual(base.background.scripts, ['background/service_worker.js']);
});

test('throws on an unknown target', () => {
  assert.throws(() => deriveManifest(base, 'safari'), /unknown target "safari"/);
  assert.throws(() => deriveManifest(base, undefined), /unknown target/);
});

test('throws when the base manifest lacks the key a target needs', () => {
  const noWorker = structuredClone(base);
  delete noWorker.background.service_worker;
  assert.throws(() => deriveManifest(noWorker, BuildTarget.CHROME), /service_worker/);

  const noScripts = structuredClone(base);
  delete noScripts.background.scripts;
  assert.throws(() => deriveManifest(noScripts, BuildTarget.FIREFOX), /scripts/);
});

test('throws on a non-object manifest', () => {
  assert.throws(() => deriveManifest(null, BuildTarget.CHROME), /manifest object/);
  assert.throws(() => deriveManifest('{}', BuildTarget.CHROME), /manifest object/);
});
