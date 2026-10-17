/**
 * App-wide immutable constants for Steer Clear.
 * Configurable values live in the user's chrome.storage.sync config, not here.
 */

/** In-memory config shape version (see knowledge/plans/V2_COMPETITIVE_UPGRADE.md). */
export const SCHEMA_VERSION = 3;

/** Highest schemaVersion the legacy single-item `config` was written with (1.x). */
export const LEGACY_SCHEMA_VERSION = 2;

/** Id prefix derived for hand-edited v1 sites that were stored without an id. */
export const LEGACY_SITE_ID_PREFIX = 'v1-';

/** chrome.storage keys. */
export const StorageKey = Object.freeze({
  /** Legacy 1.x config item in storage.sync. Read, never written, by 2.0. */
  CONFIG: 'config',
  /** storage.sync: marker that sites live in their own `site:<id>` items. */
  SCHEMA_MARKER: 'schema',
  /** storage.sync: `{ defaults: SiteSettings }`. */
  SETTINGS: 'settings',
  /** storage.sync: prefix of one item per site, `site:<id>`. */
  SITE_PREFIX: 'site:',
  /** storage.local: one-time flags such as the variation notice. */
  LIFECYCLE: 'lifecycle',
  /** storage.session: `{ [host]: tabId[] }` tabs showing a bypass badge. */
  BADGED_TABS: 'badgedTabs',
  BYPASSES: 'bypasses',
  /**
   * Interception history. Lives in storage.local, never storage.sync: this is
   * a record of browsing urges, and sync would copy it to every machine on the
   * Chrome profile and through Google's servers. It stays on the device it
   * happened on.
   */
  STATS: 'stats',
});

/** chrome.storage area names, as storage.onChanged reports them. */
export const StorageArea = Object.freeze({
  SYNC: 'sync',
  LOCAL: 'local',
  SESSION: 'session',
});

/** runtime.onInstalled reason for a first install. */
export const INSTALL_REASON = 'install';

/** tabs.onUpdated status of a tab that finished loading. */
export const TAB_STATUS_COMPLETE = 'complete';

/** The settings form edits either the global defaults or one site's overrides. */
export const SettingsFormMode = Object.freeze({
  DEFAULTS: 'defaults',
  SITE: 'site',
});

/** Days of individual events retained before pruning. Totals are kept forever. */
export const STATS_RETENTION_DAYS = 90;

/** Runtime message types exchanged between surfaces and the service worker. */
export const MessageType = Object.freeze({
  GRANT_BYPASS: 'GRANT_BYPASS',
  GET_RESOLVED_SITE: 'GET_RESOLVED_SITE',
  REBUILD_RULES: 'REBUILD_RULES',
  GET_STATS: 'GET_STATS',
  CLEAR_STATS: 'CLEAR_STATS',
  RECORD_LIFECYCLE_EVENT: 'RECORD_LIFECYCLE_EVENT',
  ADD_SITES: 'ADD_SITES',
  UPDATE_SITE: 'UPDATE_SITE',
  REMOVE_SITE: 'REMOVE_SITE',
  UPDATE_DEFAULTS: 'UPDATE_DEFAULTS',
});

/** Events a page reports to the worker for one-time lifecycle flags. */
export const LifecycleEvent = Object.freeze({
  VARIATION_NOTICE_SEEN: 'variationNoticeSeen',
});

/** States of the one-time rating prompt (stored in `lifecycle`). */
export const RatingState = Object.freeze({
  PENDING: 'pending',
  RATED: 'rated',
  DISMISSED: 'dismissed',
  EXPIRED: 'expired',
});

/** chrome.alarms name for the periodic stats-retention sweep. */
export const STATS_PRUNE_ALARM = 'stats-prune';

/** chrome.alarms name prefix for bypass expiry. */
export const BYPASS_ALARM_PREFIX = 'bypass-expiry:';

/** chrome.alarms name for the per-minute refresh of bypass badges. */
export const BYPASS_TICK_ALARM = 'bypass-tick';
export const BYPASS_TICK_MINUTES = 1;

/** Bypass lengths the user can pick, in minutes. */
export const BYPASS_MINUTES_OPTIONS = Object.freeze([1, 5, 15, 30]);
export const DEFAULT_BYPASS_MINUTES = 5;

/** Suffix of the toolbar badge's minutes-left text ("5m"). */
export const BADGE_MINUTES_SUFFIX = 'm';

/** Bypass badge background: the light-scheme accent. */
export const BADGE_BACKGROUND_COLOR = '#2f6f5e';

/** Time units, so durations read as what they are. */
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;

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
/**
 * Empty rather than a phrase: an unnamed destination falls back to the target's
 * own hostname, which tells the user where the button goes. A generic default
 * like "somewhere better" reads as placeholder text and hides the destination
 * behind a slogan.
 */
export const DEFAULT_TARGET_NAME = '';

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

/**
 * Shown on the destination button when the target has no name and no
 * parseable hostname.
 */
export const DESTINATION_FALLBACK_LABEL = 'your destination';

/** Pause styles. `rotate` cycles through PAUSE_ROTATION, one per interception. */
export const PauseStyle = Object.freeze({
  REASON: 'reason',
  BREATHING: 'breathing',
  INTENTION: 'intention',
  ROTATE: 'rotate',
});
export const PAUSE_ROTATION = Object.freeze([
  PauseStyle.REASON,
  PauseStyle.BREATHING,
  PauseStyle.INTENTION,
]);
export const DEFAULT_PAUSE_STYLE = PauseStyle.REASON;

/** The one pause-length control: seconds before continue unlocks. */
export const MIN_PAUSE_SECONDS = 0;
export const MAX_PAUSE_SECONDS = 60;
export const DEFAULT_PAUSE_SECONDS = 0;

/** One paced breath: in, then a longer out. */
export const BREATH_INHALE_MS = 4000;
export const BREATH_EXHALE_MS = 6000;
export const BREATH_CYCLE_SECONDS = 10;

/** Reasons per site. The validator has no length limit; inputs do. */
export const MAX_REASONS_PER_SITE = 5;
export const REASON_INPUT_MAX_CHARS = 280;

/** Non-space characters the intention style needs before continue unlocks. */
export const MIN_INTENTION_CHARS = 3;

/** What is holding the continue button back, if anything. */
export const ContinueBlock = Object.freeze({
  BREATHING: 'breathing',
  INTENTION: 'intention',
  WAITING: 'waiting',
});

/** "When my time is up: bring the pause back." Off unless the user opts in. */
export const DEFAULT_RETURN_PAUSE_ON_EXPIRY = false;

/** Vary layout, colour and wording on each interception. On by default. */
export const DEFAULT_VARY_PRESENTATION = true;

/**
 * Presentation variants. Each list has at least two entries, so consecutive
 * interceptions always differ in all three. Layout and palette names are CSS
 * hooks (`layout-<name>` class, `data-palette` attribute); every palette has a
 * light and a dark token set in shared/tokens.css checked by the contrast test.
 */
export const PRESENTATION_LAYOUTS = Object.freeze(['center', 'left', 'split']);
export const PRESENTATION_PALETTES = Object.freeze(['sage', 'dusk', 'clay', 'sea']);
export const PAUSE_PROMPTS = Object.freeze([
  Object.freeze({ lead: 'You were heading to', reasonLead: 'You wrote this for yourself' }),
  Object.freeze({ lead: 'About to open', reasonLead: 'Your reason' }),
  Object.freeze({ lead: 'A moment before', reasonLead: 'Remember why' }),
  Object.freeze({ lead: 'Pausing before', reasonLead: 'In your own words' }),
]);

/** Typing pauses this long before a settings text field is saved, in ms. */
export const SETTINGS_SAVE_DELAY_MS = 400;

/** Upper bound on listed sites; the sync quota is the binding limit in practice. */
export const MAX_SITES = 200;

/** storage.sync quotas, in UTF-8 bytes of key plus JSON value. */
export const SYNC_QUOTA_BYTES = 102400;
export const SYNC_QUOTA_BYTES_PER_ITEM = 8192;
export const SYNC_MAX_ITEMS = 512;

/** Browsers whose behavior or store link may need telling apart. */
export const BrowserId = Object.freeze({
  CHROME: 'chrome',
  EDGE: 'edge',
  FIREFOX: 'firefox',
});

/** URL scheme of extension pages in Firefox; Chromium browsers use chrome-extension:. */
export const FIREFOX_EXTENSION_SCHEME = 'moz-extension:';

/**
 * The navigator.userAgentData brand Edge reports. Edge installs the same
 * package as Chrome, so the brand is the only way to tell them apart.
 */
export const EDGE_UA_BRAND = 'Microsoft Edge';

/** Protocols a source URL on the reminder page may have. */
export const SOURCE_URL_PROTOCOLS = Object.freeze(['http:', 'https:']);
