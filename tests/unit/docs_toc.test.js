/**
 * Every maintained document starts with a clickable table of contents and a
 * summary, and every TOC link points at a real heading.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DOC_DIRS = ['store', 'knowledge/usage_guides', 'knowledge/setup', 'knowledge/plans'];
const REQUIRED_GUIDES = ['DEVELOPER_GUIDE.md', 'USER_GUIDE.md', 'DEVOPS_GUIDE.md', 'QA_GUIDE.md'];

/**
 * GitHub's heading anchor: lowercase, punctuation dropped, spaces to dashes.
 *
 * @param {string} heading
 * @returns {string}
 */
function slug(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s/g, '-');
}

const docs = [
  'README.md',
  ...DOC_DIRS.flatMap((dir) =>
    readdirSync(join(ROOT, dir))
      .filter((name) => name.endsWith('.md'))
      .map((name) => `${dir}/${name}`)
  ),
];

test('the four usage guides exist', () => {
  for (const guide of REQUIRED_GUIDES) {
    assert.ok(existsSync(join(ROOT, 'knowledge/usage_guides', guide)), `${guide} missing`);
  }
});

for (const doc of docs) {
  test(`${doc} has a clickable TOC and a summary, and its links resolve`, () => {
    const text = readFileSync(join(ROOT, doc), 'utf8');
    assert.match(text, /^## Table of Contents$/m, 'no "## Table of Contents"');
    assert.match(text, /^## Summary$/m, 'no "## Summary" section');

    const outsideCode = text.replace(/```[\s\S]*?```/g, '');
    const anchors = new Set(
      [...outsideCode.matchAll(/^#{2,4} (.+)$/gm)].map(([, heading]) => slug(heading))
    );
    const tocBlock = outsideCode.split(/^## Table of Contents$/m)[1].split(/^---$|^## /m)[0];
    const links = [...tocBlock.matchAll(/\]\(#([^)]+)\)/g)].map(([, anchor]) => anchor);
    assert.ok(links.length > 0, 'the TOC has no links');
    for (const link of links) assert.ok(anchors.has(link), `TOC link #${link} matches no heading`);
  });
}
