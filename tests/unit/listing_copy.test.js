/**
 * The store listing copy rules (plan G5-B), checked on every listing.
 * Run: node --test tests/unit/
 *
 * Store copy is the first thing a user reads and the first thing a reviewer
 * checks. These rules keep the benefit first, use the phrases people search
 * for, say plainly who it is not for, make the one comparison claim in its
 * verified wording, and make no health claims.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const STORE = join(dirname(fileURLToPath(import.meta.url)), '../../store');
const LISTING_FILES = ['LISTING.md', 'LISTING_EDGE.md', 'LISTING_FIREFOX.md'];

const BENEFIT_LINE =
  "A nudge in your own words, not a wall: your own reason, one click to something better, and you're never locked out.";
const SEARCH_PHRASES = ['stop doomscrolling', 'block distracting sites', 'mindless browsing'];
const TARGET_USER = 'people who check social and news sites on autopilot';
const NOT_FOR_LINE = 'Not for you if you want sites locked: Steer Clear always lets you through.';
const COMPARISON =
  "Asks for access only to the sites you add, unlike one sec, LeechBlock NG and Freedom's Pause.";
const ALLOWED_SENTENCE = 'Built for people who get pulled off-task';
const FORBIDDEN = /dopamine|detox|ADHD|treat|cure|diagnos/i;

const listings = LISTING_FILES.map((name) => [name, readFileSync(join(STORE, name), 'utf8')]);

test('the three store listings exist, and no other listing file is unchecked', () => {
  const found = readdirSync(STORE).filter((name) => name.startsWith('LISTING') && name.endsWith('.md'));
  assert.deepEqual(found.sort(), [...LISTING_FILES].sort());
});

for (const [name, text] of listings) {
  test(`${name} leads with the benefit line`, () => {
    assert.ok(text.includes(BENEFIT_LINE), 'benefit line missing');
  });

  test(`${name} uses the real search phrases and names its user`, () => {
    for (const phrase of SEARCH_PHRASES) assert.ok(text.includes(phrase), `missing "${phrase}"`);
    assert.ok(text.includes(TARGET_USER), 'target user missing');
  });

  test(`${name} says it is not a hard lock`, () => {
    assert.ok(text.includes(NOT_FOR_LINE));
  });

  test(`${name} makes the comparison in its exact wording only`, () => {
    assert.ok(text.includes(COMPARISON), 'comparison sentence missing');
    // Intention also asks per site, so Steer Clear is never "the only" or "the first".
    assert.doesNotMatch(text, /\bthe (only|first)\b[^.\n]*\b(extension|blocker|one)\b/i);
  });

  test(`${name} makes no health or treatment claim`, () => {
    const outsideAllowed = text.split(ALLOWED_SENTENCE).join('');
    const match = outsideAllowed.match(FORBIDDEN);
    assert.equal(match, null, `forbidden wording "${match?.[0]}"`);
  });
}
