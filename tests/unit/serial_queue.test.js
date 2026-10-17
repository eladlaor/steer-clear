/**
 * Unit tests for the worker's mutation queue.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createSerialQueue } from '../../src/background/serial_queue.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('two concurrent tasks run in order and the second sees the first result', async () => {
  const queue = createSerialQueue();
  let store = [];
  const slowAppend = (value) => async () => {
    const read = [...store];
    await tick();
    store = [...read, value];
    return store;
  };

  const [first, second] = await Promise.all([queue.run(slowAppend('a')), queue.run(slowAppend('b'))]);
  assert.deepEqual(first, ['a']);
  assert.deepEqual(second, ['a', 'b']);
});

test('a failing task rejects its caller and does not block the next', async () => {
  const queue = createSerialQueue();
  const failed = queue.run(async () => {
    throw new Error('quota');
  });
  const next = queue.run(async () => 'ran');
  await assert.rejects(failed, /quota/);
  assert.equal(await next, 'ran');
});
