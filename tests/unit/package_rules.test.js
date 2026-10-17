/**
 * Tests for the packaging rules in tools/package_rules.mjs.
 * Run: node --test tests/unit/
 *
 * A store upload fails, or ships developer notes, when the zip is built wrong.
 * These rules decide what is copied and verify what was zipped.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isPackagedPath, zipListingProblems } from '../../tools/package_rules.mjs';

test('isPackagedPath keeps extension files and directories', () => {
  for (const path of ['', 'manifest.json', 'background', 'background/rules.js', 'icons/icon-16.png', 'icons/icon.svg']) {
    assert.equal(isPackagedPath(path), true, path);
  }
});

test('isPackagedPath drops Markdown at any depth, whatever the case', () => {
  for (const path of ['README.md', 'icons/README.md', 'a/b/NOTES.MD']) {
    assert.equal(isPackagedPath(path), false, path);
  }
});

test('isPackagedPath drops macOS folder metadata', () => {
  for (const path of ['.DS_Store', 'icons/.DS_Store']) {
    assert.equal(isPackagedPath(path), false, path);
  }
});

test('isPackagedPath accepts Windows separators', () => {
  assert.equal(isPackagedPath('icons\\README.md'), false);
  assert.equal(isPackagedPath('icons\\icon-16.png'), true);
});

test('zipListingProblems is empty for a correct listing', () => {
  assert.deepEqual(zipListingProblems(['manifest.json', 'background/', 'background/rules.js']), []);
});

test('zipListingProblems reports a manifest that is not at the root', () => {
  const problems = zipListingProblems(['src/manifest.json', 'src/background/rules.js']);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /manifest\.json is not at the zip root/);
});

test('zipListingProblems reports every excluded file that slipped in', () => {
  const problems = zipListingProblems(['manifest.json', 'icons/README.md', '.DS_Store']);
  assert.equal(problems.length, 2);
  assert.match(problems.join('\n'), /icons\/README\.md/);
  assert.match(problems.join('\n'), /\.DS_Store/);
});

test('zipListingProblems rejects a non-array', () => {
  assert.throws(() => zipListingProblems('manifest.json'), /array/);
});
