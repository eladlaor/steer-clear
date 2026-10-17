/**
 * Unit tests for the SiteSettings field table, validation and resolution.
 * Run: node --test tests/unit/
 *
 * The validator is the contract every config write passes through. It must
 * reject anything structurally wrong, and it must never add a constraint v2
 * did not have, or a valid 1.x config would stop migrating.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  SETTINGS_FIELDS,
  PER_SITE_FIELDS,
  defaultSettings,
  validateSettings,
  validateSite,
  resolveSettings,
} from '../../src/background/settings_schema.js';
import {
  ALWAYS_SCHEDULE,
  BYPASS_MINUTES_OPTIONS,
  DEFAULT_BYPASS_MINUTES,
  DEFAULT_PAUSE_SECONDS,
  DEFAULT_TARGET,
  MAX_REASONS_PER_SITE,
  PauseStyle,
  WEEKDAY_WORK_SCHEDULE,
} from '../../src/constants.js';

/** @returns {object} A valid site record. */
function site(overrides = {}, fields = {}) {
  return {
    id: 'site-1',
    pattern: 'reddit.com',
    displayName: null,
    includeSubdomains: true,
    enabled: true,
    addedAt: null,
    order: 0,
    overrides,
    ...fields,
  };
}

const full = (patch) => ({ ...defaultSettings(), ...patch });

/* Defaults ---------------------------------------------------------------- */

test('defaultSettings is valid and fills every field', () => {
  const defaults = defaultSettings();
  assert.doesNotThrow(() => validateSettings(defaults, { partial: false }));
  assert.deepEqual(Object.keys(defaults).sort(), Object.keys(SETTINGS_FIELDS).sort());
});

test('defaultSettings has the documented values', () => {
  const defaults = defaultSettings();
  assert.equal(defaults.target, DEFAULT_TARGET);
  assert.equal(defaults.targetName, '');
  assert.deepEqual(defaults.reasons, []);
  assert.equal(defaults.pauseStyle, PauseStyle.REASON);
  assert.equal(defaults.pauseSeconds, DEFAULT_PAUSE_SECONDS);
  assert.equal(defaults.bypassMinutes, DEFAULT_BYPASS_MINUTES);
  assert.equal(defaults.returnPauseOnExpiry, false);
  assert.equal(defaults.varyPresentation, true);
  assert.equal(defaults.autoContinue, false);
  assert.equal(defaults.countdownSeconds, 3);
  assert.deepEqual(defaults.schedule, ALWAYS_SCHEDULE);
  assert.equal(defaults.dailyContinueLimit, null);
});

test('defaultSettings returns a fresh object each time', () => {
  const a = defaultSettings();
  a.reasons.push('x');
  a.schedule.days.pop();
  assert.deepEqual(defaultSettings().reasons, []);
  assert.deepEqual(defaultSettings().schedule, ALWAYS_SCHEDULE);
});

test('per-site fields are reasons, destination, style, schedule and the two legacy fields', () => {
  assert.deepEqual(
    [...PER_SITE_FIELDS].sort(),
    ['autoContinue', 'countdownSeconds', 'pauseStyle', 'reasons', 'schedule', 'target', 'targetName'].sort()
  );
});

test('validateSettings accepts a daily limit of 1 to 50, or none', () => {
  for (const limit of [null, 1, 2, 50]) {
    assert.doesNotThrow(() => validateSettings(full({ dailyContinueLimit: limit })), String(limit));
  }
});

test('validateSettings rejects a daily limit outside 1 to 50', () => {
  for (const limit of [0, 51, 2.5, '3', undefined]) {
    assert.throws(() => validateSettings(full({ dailyContinueLimit: limit })), /dailyContinueLimit/, String(limit));
  }
});

test('validateSettings checks the schedule, naming the field path', () => {
  assert.doesNotThrow(() => validateSettings(full({ schedule: WEEKDAY_WORK_SCHEDULE })));
  assert.throws(
    () => validateSettings(full({ schedule: { days: [], ranges: [] } }), { path: 'defaults' }),
    /defaults\.schedule\.days/
  );
});

/* Rejections (criterion 10) ----------------------------------------------- */

test('validateSettings rejects bypassMinutes 7', () => {
  assert.throws(() => validateSettings(full({ bypassMinutes: 7 })), /bypassMinutes/);
});

test('validateSettings accepts every offered bypass length', () => {
  for (const minutes of BYPASS_MINUTES_OPTIONS) {
    assert.doesNotThrow(() => validateSettings(full({ bypassMinutes: minutes })));
  }
});

test('validateSettings rejects pauseSeconds 61, -1 and a fraction', () => {
  assert.throws(() => validateSettings(full({ pauseSeconds: 61 })), /pauseSeconds/);
  assert.throws(() => validateSettings(full({ pauseSeconds: -1 })), /pauseSeconds/);
  assert.throws(() => validateSettings(full({ pauseSeconds: 1.5 })), /pauseSeconds/);
});

test('validateSettings accepts pauseSeconds 0 and 60', () => {
  assert.doesNotThrow(() => validateSettings(full({ pauseSeconds: 0 })));
  assert.doesNotThrow(() => validateSettings(full({ pauseSeconds: 60 })));
});

test('validateSettings rejects more reasons than the limit', () => {
  const reasons = Array.from({ length: MAX_REASONS_PER_SITE + 1 }, (_, i) => `r${i}`);
  assert.throws(() => validateSettings(full({ reasons })), /reasons/);
});

test('validateSettings rejects a blank reason and a non-string reason', () => {
  assert.throws(() => validateSettings(full({ reasons: ['ok', '   '] })), /reasons\[1\]/);
  assert.throws(() => validateSettings(full({ reasons: [42] })), /reasons\[0\]/);
  assert.throws(() => validateSettings(full({ reasons: 'one' })), /reasons/);
});

test('validateSettings rejects an unknown pauseStyle', () => {
  assert.throws(() => validateSettings(full({ pauseStyle: 'meditate' })), /pauseStyle/);
});

test('validateSettings accepts every pause style', () => {
  for (const style of Object.values(PauseStyle)) {
    assert.doesNotThrow(() => validateSettings(full({ pauseStyle: style })));
  }
});

test('validateSettings accepts a 5,000-character reason', () => {
  // v2 notes had no length limit; adding one would strand migrated configs.
  assert.doesNotThrow(() => validateSettings(full({ reasons: ['x'.repeat(5000)] })));
});

test('validateSettings rejects an empty target and non-boolean flags', () => {
  assert.throws(() => validateSettings(full({ target: '' })), /target/);
  assert.throws(() => validateSettings(full({ autoContinue: 'yes' })), /autoContinue/);
  assert.throws(() => validateSettings(full({ returnPauseOnExpiry: 1 })), /returnPauseOnExpiry/);
  assert.throws(() => validateSettings(full({ varyPresentation: null })), /varyPresentation/);
});

test('validateSettings keeps the v2 countdown bounds', () => {
  assert.throws(() => validateSettings(full({ countdownSeconds: 0 })), /countdownSeconds/);
  assert.throws(() => validateSettings(full({ countdownSeconds: 2.5 })), /countdownSeconds/);
  assert.doesNotThrow(() => validateSettings(full({ countdownSeconds: 60 })));
});

test('validateSettings (full) rejects a missing field', () => {
  const defaults = defaultSettings();
  delete defaults.bypassMinutes;
  assert.throws(() => validateSettings(defaults, { partial: false }), /bypassMinutes.*required/);
});

test('validateSettings rejects an unknown key in either mode', () => {
  assert.throws(() => validateSettings(full({ theme: 'dark' })), /theme.*unknown/);
  assert.throws(() => validateSettings({ theme: 'dark' }, { partial: true }), /theme.*unknown/);
});

test('validateSettings (partial) rejects global-only keys', () => {
  for (const key of ['pauseSeconds', 'bypassMinutes', 'returnPauseOnExpiry', 'varyPresentation', 'dailyContinueLimit']) {
    const value = defaultSettings()[key];
    assert.throws(
      () => validateSettings({ [key]: value }, { partial: true }),
      new RegExp(`${key}.*global`),
      key
    );
  }
});

test('validateSettings (partial) accepts each per-site field alone', () => {
  const defaults = defaultSettings();
  for (const key of PER_SITE_FIELDS) {
    assert.doesNotThrow(() => validateSettings({ [key]: defaults[key] }, { partial: true }), key);
  }
  assert.doesNotThrow(() => validateSettings({}, { partial: true }));
});

test('validation errors name the field path', () => {
  assert.throws(
    () => validateSettings(full({ bypassMinutes: 7 }), { path: 'defaults' }),
    /defaults\.bypassMinutes/
  );
});

/* Site records ------------------------------------------------------------ */

test('validateSite accepts a well-formed site', () => {
  assert.doesNotThrow(() => validateSite(site({ pauseStyle: PauseStyle.BREATHING })));
});

test('validateSite rejects structural problems', () => {
  assert.throws(() => validateSite(site({}, { id: '' })), /id/);
  assert.throws(() => validateSite(site({}, { pattern: '  ' })), /pattern/);
  assert.throws(() => validateSite(site({}, { enabled: 'yes' })), /enabled/);
  assert.throws(() => validateSite(site({}, { includeSubdomains: 1 })), /includeSubdomains/);
  assert.throws(() => validateSite(site({}, { displayName: 3 })), /displayName/);
  assert.throws(() => validateSite(site({}, { order: '1' })), /order/);
  assert.throws(() => validateSite(site({}, { addedAt: 'today' })), /addedAt/);
  assert.throws(() => validateSite(site({}, { overrides: null })), /overrides/);
});

test('validateSite rejects a global-only override', () => {
  assert.throws(() => validateSite(site({ pauseSeconds: 10 })), /overrides\.pauseSeconds.*global/);
});

/* Resolution (criterion 9) ------------------------------------------------ */

test('resolveSettings returns the defaults for a null site', () => {
  const defaults = defaultSettings();
  assert.deepEqual(resolveSettings(defaults, null), defaults);
});

test('resolveSettings applies each per-site override and inherits the rest', () => {
  const defaults = full({ reasons: ['global'], autoContinue: true, countdownSeconds: 3 });
  const overrides = {
    target: 'https://example.org/',
    targetName: 'Example',
    reasons: ['site'],
    pauseStyle: PauseStyle.INTENTION,
    autoContinue: false,
    countdownSeconds: 10,
    schedule: WEEKDAY_WORK_SCHEDULE,
  };
  for (const [key, value] of Object.entries(overrides)) {
    const resolved = resolveSettings(defaults, site({ [key]: value }));
    assert.deepEqual(resolved[key], value, `${key} override wins`);
    const inherited = resolveSettings(defaults, site({}));
    assert.deepEqual(inherited[key], defaults[key], `${key} inherits when absent`);
  }
});

test('a false override wins over a true default', () => {
  const resolved = resolveSettings(full({ autoContinue: true }), site({ autoContinue: false }));
  assert.equal(resolved.autoContinue, false);
});

test('an empty reasons override wins over default reasons', () => {
  const resolved = resolveSettings(full({ reasons: ['global'] }), site({ reasons: [] }));
  assert.deepEqual(resolved.reasons, []);
});

test('the target name follows its target (resolution rule 2)', () => {
  const defaults = full({ targetName: 'Wikipedia' });
  assert.equal(resolveSettings(defaults, site({ target: 'https://x.org/' })).targetName, '');
  assert.equal(
    resolveSettings(defaults, site({ target: 'https://x.org/', targetName: 'X' })).targetName,
    'X'
  );
  assert.equal(resolveSettings(defaults, site({})).targetName, 'Wikipedia');
});

test('resolveSettings does not mutate its inputs', () => {
  const defaults = full({ reasons: ['a'] });
  const entry = site({ reasons: ['b'] });
  const before = JSON.stringify([defaults, entry]);
  const resolved = resolveSettings(defaults, entry);
  resolved.reasons.push('c');
  assert.equal(JSON.stringify([defaults, entry]), before);
});
