/**
 * Tests for detectBrowser in src/shared/platform.js.
 * Run: node --test tests/unit/
 *
 * Only the store link differs by browser. Edge and Chrome share one package,
 * so Edge is told apart by its user-agent brand; Firefox by its page scheme.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectBrowser } from '../../src/shared/platform.js';
import { BrowserId } from '../../src/constants.js';

const CHROME_BASE = 'chrome-extension://fooahacimdgjcfoofpijkpmgiaghinbn/';
const FIREFOX_BASE = 'moz-extension://0b9c2f8e-1d3a-4c55-9e0f-7a1b2c3d4e5f/';

const CHROME_BRANDS = [
  { brand: 'Chromium', version: '141' },
  { brand: 'Google Chrome', version: '141' },
  { brand: 'Not?A_Brand', version: '99' },
];
const EDGE_BRANDS = [
  { brand: 'Chromium', version: '141' },
  { brand: 'Microsoft Edge', version: '141' },
  { brand: 'Not?A_Brand', version: '99' },
];

test('moz-extension pages are firefox', () => {
  assert.equal(detectBrowser({ extensionBaseUrl: FIREFOX_BASE }), BrowserId.FIREFOX);
  assert.equal(detectBrowser({ extensionBaseUrl: FIREFOX_BASE, uaBrands: EDGE_BRANDS }), BrowserId.FIREFOX);
});

test('chrome-extension pages with the Edge brand are edge', () => {
  assert.equal(detectBrowser({ extensionBaseUrl: CHROME_BASE, uaBrands: EDGE_BRANDS }), BrowserId.EDGE);
});

test('every other chrome-extension page is chrome', () => {
  assert.equal(detectBrowser({ extensionBaseUrl: CHROME_BASE, uaBrands: CHROME_BRANDS }), BrowserId.CHROME);
  assert.equal(detectBrowser({ extensionBaseUrl: CHROME_BASE, uaBrands: [] }), BrowserId.CHROME);
  assert.equal(detectBrowser({ extensionBaseUrl: CHROME_BASE }), BrowserId.CHROME);
});

test('throws without an extension base URL', () => {
  assert.throws(() => detectBrowser({}), /extensionBaseUrl/);
  assert.throws(() => detectBrowser({ extensionBaseUrl: '' }), /extensionBaseUrl/);
  assert.throws(() => detectBrowser(), /extensionBaseUrl/);
});

test('throws on brands that are not a list', () => {
  assert.throws(
    () => detectBrowser({ extensionBaseUrl: CHROME_BASE, uaBrands: 'Microsoft Edge' }),
    /uaBrands/
  );
});
