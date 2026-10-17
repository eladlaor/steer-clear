/**
 * Tests for extractSourceUrl in src/shared/source_url.js.
 * Run: node --test tests/unit/
 *
 * The redirect substitutes the whole requested URL after `?from=`. Neither
 * Chrome nor Firefox documents whether that value is percent-encoded, so the
 * reader must return the full original URL either way. URLSearchParams would
 * cut an unencoded value at its first `&` and drop its `#fragment`.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { extractSourceUrl } from '../../src/shared/source_url.js';

const PAGE = 'chrome-extension://abcdefghijklmnop/blocked/blocked.html';
const FIREFOX_PAGE = 'moz-extension://0b9c2f8e-1d3a-4c55-9e0f-7a1b2c3d4e5f/blocked/blocked.html';

const ORIGINAL = 'https://example.com/a?x=1&y=2&q=a=b?c#frag';

test('returns the full URL from an encoded value', () => {
  const href = `${PAGE}?from=${encodeURIComponent(ORIGINAL)}`;
  assert.equal(extractSourceUrl(href), ORIGINAL);
});

test('returns the full URL from an unencoded value with &, =, ? and #fragment', () => {
  const href = `${PAGE}?from=${ORIGINAL}`;
  assert.equal(extractSourceUrl(href), ORIGINAL);
});

test('returns a URL with a port, encoded or not', () => {
  const ported = 'http://localhost:8080/path?a=1';
  assert.equal(extractSourceUrl(`${PAGE}?from=${ported}`), ported);
  assert.equal(extractSourceUrl(`${PAGE}?from=${encodeURIComponent(ported)}`), ported);
});

test('works on a moz-extension page', () => {
  assert.equal(extractSourceUrl(`${FIREFOX_PAGE}?from=${ORIGINAL}`), ORIGINAL);
});

test('keeps percent-escapes that belong to an unencoded source URL', () => {
  const original = 'https://example.com/caf%C3%A9?q=a%20b';
  assert.equal(extractSourceUrl(`${PAGE}?from=${original}`), original);
});

test('decodes an encoded value exactly once', () => {
  const original = 'https://example.com/caf%C3%A9?q=a%20b';
  assert.equal(extractSourceUrl(`${PAGE}?from=${encodeURIComponent(original)}`), original);
});

test('keeps a raw fragment the browser appended after an encoded value', () => {
  // A request URL carries no fragment, so the redirect cannot encode it; the
  // browser re-attaches the original fragment to the redirect target as-is.
  // Decoding it again would turn "%20" into a space and "%23" into "#".
  const query = 'https://example.com/a?x=1&y=2';
  const fragment = '#sec%20one%23two';
  assert.equal(
    extractSourceUrl(`${PAGE}?from=${encodeURIComponent(query)}${fragment}`),
    `${query}${fragment}`
  );
});

test('treats the encoded scheme case-insensitively', () => {
  assert.equal(extractSourceUrl(`${PAGE}?from=HTTPS%3a%2F%2Fexample.com%2F`), 'HTTPS://example.com/');
});

test('returns null when the parameter is missing or empty', () => {
  assert.equal(extractSourceUrl(PAGE), null);
  assert.equal(extractSourceUrl(`${PAGE}?other=1`), null);
  assert.equal(extractSourceUrl(`${PAGE}?from=`), null);
});

test('returns null for a non-http(s) value', () => {
  for (const value of ['javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/', 'chrome://settings']) {
    assert.equal(extractSourceUrl(`${PAGE}?from=${value}`), null, value);
    assert.equal(extractSourceUrl(`${PAGE}?from=${encodeURIComponent(value)}`), null, `encoded ${value}`);
  }
});

test('returns null for a value that is not a URL', () => {
  assert.equal(extractSourceUrl(`${PAGE}?from=not a url`), null);
  assert.equal(extractSourceUrl(`${PAGE}?from=https%3A%2F%2F%E0%A4%A`), null);
});

test('throws on a non-string href, which is a caller bug', () => {
  assert.throws(() => extractSourceUrl(undefined), /expected the page href/);
});
