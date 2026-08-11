/**
 * Structural checks on manifest.json.
 * Run: node --test tests/unit/
 *
 * These exist because a complete, passing unit suite once coexisted with an
 * extension that did nothing at all: rule building was correct, but the
 * manifest declared no host permissions, so Chrome installed every rule and
 * silently refused to apply it. Nothing under test read the manifest, so
 * nothing caught it. The manifest is part of the contract; test it.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));

/**
 * Every .js file under a directory, recursively.
 *
 * @param {string} dir
 * @returns {string[]} Absolute paths.
 */
function jsFilesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return jsFilesUnder(path);
    }
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

test('manifest is MV3', () => {
  assert.equal(manifest.manifest_version, 3);
});

test('declares the permissions the service worker actually calls', () => {
  for (const permission of ['declarativeNetRequest', 'storage', 'alarms']) {
    assert.ok(
      manifest.permissions.includes(permission),
      `missing permission: ${permission}`
    );
  }
});

test('can obtain host access for redirects', () => {
  // A redirect rule is inert without host permission for the request URL.
  // Either form works; what must never happen is neither being present.
  const blanket = manifest.host_permissions ?? [];
  const optional = manifest.optional_host_permissions ?? [];

  assert.ok(
    blanket.length > 0 || optional.length > 0,
    'manifest declares no host permissions — redirect rules will be ignored'
  );
});

test('host access covers both http and https', () => {
  const patterns = [
    ...(manifest.host_permissions ?? []),
    ...(manifest.optional_host_permissions ?? []),
  ].join(' ');

  assert.match(patterns, /https:/, 'no https host pattern');
  assert.match(patterns, /http:/, 'no http host pattern');
});

test('every file the manifest references exists', () => {
  const referenced = [
    manifest.background.service_worker,
    manifest.options_page,
    ...Object.values(manifest.icons ?? {}),
    ...(manifest.web_accessible_resources ?? []).flatMap((e) => e.resources),
  ];

  for (const path of referenced) {
    assert.ok(existsSync(join(SRC, path)), `manifest references missing file: ${path}`);
  }
});

test('every chrome API used in source is declared', () => {
  // An undeclared namespace is undefined at runtime, so touching it at the top
  // level of the service worker throws before any listener registers — the
  // worker never starts and every message to it times out. That failure
  // presents as blank UI, nowhere near its actual cause.
  const alwaysAvailable = new Set([
    'runtime', // available to every extension
    'permissions', // checked below; also implied by optional_host_permissions
  ]);

  const used = new Set();
  for (const file of jsFilesUnder(SRC)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bchrome\.([a-zA-Z]+)\b/g)) {
      used.add(match[1]);
    }
  }

  const declared = new Set(manifest.permissions ?? []);
  const missing = [...used].filter(
    (api) => !declared.has(api) && !alwaysAvailable.has(api)
  );

  assert.deepEqual(
    missing,
    [],
    `chrome APIs used but not declared in manifest.permissions: ${missing.join(', ')}`
  );
});

test('the permissions API is declared, since the code calls it', () => {
  // chrome.permissions is not implicitly available; optional_host_permissions
  // declares what may be requested, not the API used to request it.
  assert.ok(
    (manifest.permissions ?? []).includes('permissions'),
    'optional host permissions are unusable without the "permissions" API'
  );
});

test('the interstitial is web-accessible', () => {
  // The redirect target must be reachable, or every redirect lands on an error.
  const resources = (manifest.web_accessible_resources ?? []).flatMap(
    (entry) => entry.resources
  );
  assert.ok(
    resources.some((resource) => resource.includes('blocked')),
    'blocked.html is not listed in web_accessible_resources'
  );
});
