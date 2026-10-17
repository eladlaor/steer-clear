/**
 * Tests for the page-to-worker messaging helpers in src/shared/messaging.js.
 * Run: node --test tests/unit/
 *
 * sendWithoutAwait exists for the permission-prompt pattern: the message must
 * leave in the same synchronous tick as the click, before any await, and a
 * failure must still be logged even though nobody awaits it.
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { sendMessage, sendWithoutAwait } from '../../src/shared/messaging.js';

let sent;
let reply;
let logged;
let originalError;

beforeEach(() => {
  sent = [];
  reply = async () => ({ ok: true });
  logged = [];
  globalThis.chrome = {
    runtime: {
      sendMessage: (message) => {
        sent.push(message);
        return reply(message);
      },
    },
  };
  originalError = console.error;
  console.error = (...args) => logged.push(args);
});

afterEach(() => {
  delete globalThis.chrome;
  console.error = originalError;
});

/** Let every pending promise callback run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('sendMessage resolves with the response when it is ok', async () => {
  reply = async () => ({ ok: true, stats: { totals: {} } });
  const response = await sendMessage({ type: 'GET_STATS' });
  assert.deepEqual(response, { ok: true, stats: { totals: {} } });
  assert.deepEqual(sent, [{ type: 'GET_STATS' }]);
});

test('sendMessage rejects with the worker error when the response is not ok', async () => {
  reply = async () => ({ ok: false, error: 'boom' });
  await assert.rejects(sendMessage({ type: 'GET_STATS' }), /boom/);
});

test('sendMessage rejects naming the message type when there is no response', async () => {
  reply = async () => undefined;
  await assert.rejects(sendMessage({ type: 'GET_STATS' }), /no response.*GET_STATS/);
});

test('sendWithoutAwait sends synchronously, before the caller continues', () => {
  sendWithoutAwait({ type: 'REBUILD_RULES' });
  assert.deepEqual(sent, [{ type: 'REBUILD_RULES' }]);
});

test('sendWithoutAwait returns nothing to await', () => {
  assert.equal(sendWithoutAwait({ type: 'REBUILD_RULES' }), undefined);
});

test('sendWithoutAwait logs a failed response', async () => {
  reply = async () => ({ ok: false, error: 'quota exceeded' });
  sendWithoutAwait({ type: 'ADD_SITES' });
  await flush();

  assert.equal(logged.length, 1);
  assert.match(logged[0][0], /^\[steer-clear\] sendWithoutAwait failed/);
  assert.deepEqual(logged[0][1], { type: 'ADD_SITES', error: 'quota exceeded' });
});

test('sendWithoutAwait logs a send that throws', async () => {
  globalThis.chrome.runtime.sendMessage = () => {
    throw new Error('Extension context invalidated.');
  };
  sendWithoutAwait({ type: 'ADD_SITES' });
  await flush();

  assert.equal(logged.length, 1);
  assert.match(logged[0][1].error, /context invalidated/);
});
