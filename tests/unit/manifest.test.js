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
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../src');
const manifest = JSON.parse(readFileSync(join(SRC, 'manifest.json'), 'utf8'));

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
