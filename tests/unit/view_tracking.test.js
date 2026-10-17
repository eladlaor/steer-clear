/**
 * Unit tests for when the pause page reports a view: only once it is shown.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { whenShown } from '../../src/blocked/view_tracking.js';

/** A stand-in document whose visibility and prerendering can be changed. */
function fakeDocument({ visibilityState, prerendering }) {
  const doc = new EventTarget();
  doc.visibilityState = visibilityState;
  doc.prerendering = prerendering;
  return doc;
}

/** @returns {Promise<boolean>} Whether the promise settled by the next macrotask. */
async function settled(promise) {
  let done = false;
  promise.then(() => {
    done = true;
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return done;
}

test('a visible page is shown at once', async () => {
  assert.equal(await settled(whenShown(fakeDocument({ visibilityState: 'visible', prerendering: false }))), true);
});

test('a page without the prerendering property counts as not prerendering', async () => {
  assert.equal(await settled(whenShown(fakeDocument({ visibilityState: 'visible', prerendering: undefined }))), true);
});

test('a hidden page waits for visibilitychange', async () => {
  const doc = fakeDocument({ visibilityState: 'hidden', prerendering: false });
  const shown = whenShown(doc);
  assert.equal(await settled(shown), false);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(await settled(shown), true);
});

test('a prerendered page waits for activation even if it reports visible', async () => {
  const doc = fakeDocument({ visibilityState: 'visible', prerendering: true });
  const shown = whenShown(doc);
  doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(await settled(shown), false, 'a prerender is never counted');
  doc.prerendering = false;
  doc.dispatchEvent(new Event('prerenderingchange'));
  assert.equal(await settled(shown), true);
});

test('a prerendered page that is never shown stays silent', async () => {
  const doc = fakeDocument({ visibilityState: 'hidden', prerendering: true });
  assert.equal(await settled(whenShown(doc)), false);
});
