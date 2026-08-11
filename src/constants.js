/**
 * App-wide immutable constants for Steer Clear.
 * Configurable values live in the user's chrome.storage.sync config, not here.
 */

export const SCHEMA_VERSION = 2;

/** chrome.storage keys. */
export const StorageKey = Object.freeze({
  CONFIG: 'config',
  BYPASSES: 'bypasses',
});

/** Runtime message types exchanged between surfaces and the service worker. */
export const MessageType = Object.freeze({
  GRANT_BYPASS: 'GRANT_BYPASS',
  GET_RESOLVED_SITE: 'GET_RESOLVED_SITE',
  REBUILD_RULES: 'REBUILD_RULES',
});

/** chrome.alarms name prefix for bypass expiry. */
export const BYPASS_ALARM_PREFIX = 'bypass-expiry:';

/** Duration of a bypass grant, in milliseconds. */
export const BYPASS_DURATION_MS = 5 * 60 * 1000;

/** Path to the interstitial, relative to the extension root. */
export const INTERSTITIAL_PATH = 'blocked/blocked.html';

/** Query parameter carrying the originally-requested URL to the interstitial. */
export const PARAM_FROM = 'from';

/**
 * Dynamic rule IDs are allocated from this base upward, one per enabled site.
 * declarativeNetRequest requires positive integers.
 */
export const RULE_ID_BASE = 1000;

/**
 * declarativeNetRequest caps regex-based rules at 1000 per extension. Exceeding
 * it causes rules to be silently dropped, so we fail loudly instead.
 */
export const MAX_REGEX_RULES = 1000;

/** Defaults applied on first install. */
export const DEFAULT_TARGET = 'https://en.wikipedia.org/wiki/Special:Random';
export const DEFAULT_NOTE = '';
export const DEFAULT_TARGET_NAME = 'somewhere better';

/**
 * Auto-continue: show the gateway briefly, then proceed to the destination
 * unless the user stops the countdown.
 *
 * Off by default. The interstitial's purpose is to make an automatic reflex
 * conscious, and a screen that dismisses itself asks less of the user than one
 * that waits — so the deliberate version is the default and auto-continue is
 * the opt-in.
 */
export const DEFAULT_AUTO_CONTINUE = false;

/** Countdown before auto-continue proceeds, in seconds. */
export const DEFAULT_COUNTDOWN_SECONDS = 3;

/** Bounds for a user-supplied countdown, in seconds. */
export const MIN_COUNTDOWN_SECONDS = 1;
export const MAX_COUNTDOWN_SECONDS = 60;

/** Longest accepted site display name, in characters. */
export const MAX_DISPLAY_NAME_LENGTH = 60;
