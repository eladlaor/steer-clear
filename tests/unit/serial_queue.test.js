/**
 * Unit tests for the worker's mutation queue.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createCoalescedTask, createSerialQueue } from '../../src/background/serial_queue.js';

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

test('a coalesced task shares one waiting run between callers', async () => {
  const queue = createSerialQueue();
  let runs = 0;
  let release;
  const blocker = queue.run(() => new Promise((resolve) => (release = resolve)));
  const rebuild = createCoalescedTask(queue, async () => {
    runs += 1;
    return runs;
  });

  const first = rebuild();
  const second = rebuild();
  assert.equal(first, second, 'a run still waiting absorbs the later call');
  await tick(); // the blocker has started
  release();
  await blocker;
  assert.equal(await first, 1);
  assert.equal(runs, 1);
});

test('a coalesced task queues a new run once the waiting one has started', async () => {
  const queue = createSerialQueue();
  const seen = [];
  let state = 'old';
  const rebuild = createCoalescedTask(queue, async () => {
    const read = state;
    await tick();
    seen.push(read);
  });

  const first = rebuild();
  await tick(); // the first run has started and read 'old'
  state = 'new';
  const second = rebuild();
  assert.notEqual(first, second, 'a started run cannot see the later change');
  await Promise.all([first, second]);
  assert.deepEqual(seen, ['old', 'new']);
});

test('a coalesced task that fails rejects every caller it served and does not block the next', async () => {
  const queue = createSerialQueue();
  let fail = true;
  const rebuild = createCoalescedTask(queue, async () => {
    if (fail) throw new Error('boom');
    return 'ok';
  });
  const [a, b] = [rebuild(), rebuild()];
  await assert.rejects(a, /boom/);
  await assert.rejects(b, /boom/);
  fail = false;
  assert.equal(await rebuild(), 'ok');
});
