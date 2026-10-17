/**
 * Unit tests for the wording of the settings page's export and import panel.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { accessText, duplicatesText, exportedText, importedText, replaceSummary, sitesCount } from '../../src/options/data_text.js';

test('site counts read naturally', () => {
  assert.equal(sitesCount(0), 'no sites');
  assert.equal(sitesCount(1), '1 site');
  assert.equal(sitesCount(12), '12 sites');
  assert.throws(() => sitesCount(-1), /count/);
});

test('the import preview states the counts before and after', () => {
  assert.equal(replaceSummary(3, 5), 'Replace 3 sites with 5 sites?');
  assert.equal(replaceSummary(1, 1), 'Replace 1 site with 1 site?');
  assert.equal(replaceSummary(0, 2), 'Replace no sites with 2 sites?');
});

test('duplicates are listed, or nothing is said', () => {
  assert.equal(duplicatesText([]), '');
  assert.equal(
    duplicatesText(['reddit.com', 'x.com']),
    'Listed more than once: reddit.com, x.com. You can remove the extra entries after importing.'
  );
});

test('access needed reads as one or many', () => {
  assert.equal(accessText(1), '1 site needs access before it can pause.');
  assert.equal(accessText(4), '4 sites need access before they can pause.');
});

test('export and import confirmations', () => {
  assert.equal(exportedText(2), 'Exported 2 sites and your defaults.');
  assert.equal(importedText(1), "Imported 1 site and the file's defaults.");
});
