/**
 * Unit tests for the popup's wording.
 * Run: node --test tests/unit/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { listedText, minutesLeft, snoozeOptionLabel, steeredDaysText, todayText } from '../../src/popup/popup_text.js';
import { SNOOZE_OPTIONS_MINUTES } from '../../src/constants.js';

const MINUTE = 60000;

test('snooze options read as minutes or hours', () => {
  assert.deepEqual(SNOOZE_OPTIONS_MINUTES.map(snoozeOptionLabel), ['15 min', '30 min', '1 hour']);
  assert.equal(snoozeOptionLabel(120), '2 hours');
  assert.equal(snoozeOptionLabel(90), '90 min');
  assert.throws(() => snoozeOptionLabel(0), /minutes/);
});

test('minutesLeft rounds up and never goes negative', () => {
  assert.equal(minutesLeft(15 * MINUTE, 0), 15);
  assert.equal(minutesLeft(14 * MINUTE + 1, 0), 15);
  assert.equal(minutesLeft(1, 0), 1);
  assert.equal(minutesLeft(0, 0), 0);
  assert.equal(minutesLeft(0, MINUTE), 0);
});

test('today reads naturally for none, one and several pauses', () => {
  assert.deepEqual(todayText({ intercepted: 0, steeredClear: 0, continued: 0 }), {
    figure: '0 pauses today',
    detail: 'No pauses yet today.',
  });
  assert.equal(todayText({ intercepted: 1, steeredClear: 1, continued: 0 }).figure, '1 pause today');
  assert.equal(todayText({ intercepted: 3, steeredClear: 2, continued: 1 }).detail, '2 steered clear, 1 continued');
});

test('steered-clear days', () => {
  assert.equal(steeredDaysText({ days: 5, of: 7 }), 'You steered clear on 5 of the last 7 days.');
});

test('a listed site says whether it is on or turned off', () => {
  assert.equal(listedText({ pattern: 'reddit.com', displayName: null, enabled: true }), 'reddit.com is on your list.');
  assert.equal(
    listedText({ pattern: 'reddit.com', displayName: 'Reddit', enabled: false }),
    'Reddit is on your list but turned off. Turn it on in Settings.'
  );
});
