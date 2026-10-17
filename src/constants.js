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
  /**
   * storage.session: `{ [host]: Rule[] }` rules a degraded bypass lifted
   * (settings unreadable), put back at its end if a rebuild still fails.
   */
  LIFTED_RULES: 'liftedRules',
  /** storage.session: `{ until: epochMs }` while every reminder is snoozed. */
  SNOOZE: 'snooze',
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

/** How often the stats-retention sweep runs, in minutes. */
export const STATS_PRUNE_PERIOD_MINUTES = 24 * 60;

/** KeyboardEvent.key that stops a running auto-continue countdown. */
export const STOP_COUNTDOWN_KEY = 'Escape';

/**
 * Quick-add from the toolbar strips this leading label, so adding from
 * www.reddit.com lists reddit.com (subdomains included) rather than only
 * the www host.
 */
export const QUICK_ADD_STRIPPED_PREFIX = 'www.';

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
  RECORD_VIEW: 'RECORD_VIEW',
  RECORD_OUTCOME: 'RECORD_OUTCOME',
  SET_SNOOZE: 'SET_SNOOZE',
  CLEAR_SNOOZE: 'CLEAR_SNOOZE',
  GET_STATUS: 'GET_STATUS',
  IMPORT_SETTINGS: 'IMPORT_SETTINGS',
});

/**
 * What happened after one pause-page view. A view is logged as `left`;
 * choosing the destination makes it `steered`; continuing makes it
 * `continued`. "Steered clear" means left or steered.
 */
export const Outcome = Object.freeze({
  LEFT: 'left',
  STEERED: 'steered',
  CONTINUED: 'continued',
});

/**
 * A repeat view of the same host within this window, while the last view is
 * still `left`, is the same urge (a reload or a retyped address), not a new one.
 */
export const VIEW_MERGE_WINDOW_MS = 60000;

/** "You steered clear on D of the last N days" looks back this many local days. */
export const STEERED_DAYS_WINDOW = 7;

/** The stats page's steer rate covers this many days. */
export const STEER_RATE_WINDOW_DAYS = 30;

/** Events a page reports to the worker for one-time lifecycle flags. */
export const LifecycleEvent = Object.freeze({
  ONBOARDING_COMPLETED: 'onboardingCompleted',
  VARIATION_NOTICE_SEEN: 'variationNoticeSeen',
  RATING_SHOWN: 'ratingShown',
  RATING_RATED: 'ratingRated',
  RATING_DISMISSED: 'ratingDismissed',
});

/** States of the one-time rating prompt (stored in `lifecycle`). */
export const RatingState = Object.freeze({
  PENDING: 'pending',
  RATED: 'rated',
  DISMISSED: 'dismissed',
  EXPIRED: 'expired',
});

/** What can happen to the rating prompt: it is shown, or the user picks a button. */
export const RatingEvent = Object.freeze({
  SHOWN: 'shown',
  RATED: 'rated',
  DISMISSED: 'dismissed',
});

/** The rating prompt appears once the user has chosen the destination this many times. */
export const RATING_PROMPT_THRESHOLD = 10;

/** After this many showings without an answer, the prompt never returns. */
export const RATING_PROMPT_MAX_SHOWS = 3;

/**
 * Each store's reviews page, by BrowserId. A null entry hides the rating
 * prompt in that browser (logged at info level).
 *
 * - edge: filled in from the Edge Add-ons listing once 1.0.0 is live there
 *   (the listing URL carries a store-assigned id that does not exist yet).
 * - firefox: the AMO slug `steer-clear`, confirmed free on 2026-10-17 and set
 *   in the submission form (store/LISTING_FIREFOX.md).
 */
export const STORE_REVIEW_URL = Object.freeze({
  chrome: 'https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn/reviews',
  edge: null,
  firefox: 'https://addons.mozilla.org/firefox/addon/steer-clear/reviews/',
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
export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 1440;
export const MS_PER_DAY = MINUTES_PER_DAY * MS_PER_MINUTE;
export const DAYS_PER_WEEK = 7;

/** chrome.alarms name for the next schedule start or end, which triggers a rebuild. */
export const SCHEDULE_ALARM = 'schedule-boundary';

/** Path of the settings page, relative to the extension root. */
export const OPTIONS_PATH = 'options/options.html';

/** Path of the first-run page, opened once on install. */
export const ONBOARDING_PATH = 'onboarding/onboarding.html';

/** Path of the statistics page, relative to the extension root. */
export const STATS_PATH = 'stats/stats.html';

/** Anchor of the daily-limit field on the settings page. */
export const DAILY_LIMIT_ANCHOR = 'daily-limit';

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

/**
 * Schedules: days are 0–6 (0 = Sunday); ranges are minutes of the local day,
 * `[start, end)`. A range whose end is before its start runs past midnight
 * and belongs to the day it starts on.
 */
export const MAX_SCHEDULE_RANGES = 4;
export const ALWAYS_SCHEDULE = Object.freeze({
  days: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
  ranges: Object.freeze([Object.freeze({ start: 0, end: MINUTES_PER_DAY })]),
});
/** The "Weekdays 9–17" preset: Monday to Friday, 09:00–17:00. */
export const WEEKDAY_WORK_SCHEDULE = Object.freeze({
  days: Object.freeze([1, 2, 3, 4, 5]),
  ranges: Object.freeze([Object.freeze({ start: 9 * MINUTES_PER_HOUR, end: 17 * MINUTES_PER_HOUR })]),
});
/**
 * How far ahead the next schedule boundary is searched. A week plus a day
 * covers every weekly range, including an overnight one that started yesterday.
 */
export const SCHEDULE_LOOKAHEAD_DAYS = 8;

/**
 * Daily allowance: after this many continues of a site in a local day, its
 * pause lasts at least OVER_LIMIT_PAUSE_SECONDS until midnight. Friction,
 * never a wall: continue is never removed. `null` = no limit (the default).
 */
export const MIN_DAILY_CONTINUE_LIMIT = 1;
export const MAX_DAILY_CONTINUE_LIMIT = 50;
export const DEFAULT_DAILY_CONTINUE_LIMIT = null;
export const OVER_LIMIT_PAUSE_SECONDS = 30;

/**
 * Snooze turns every reminder off for a while, so it also skips the daily
 * allowance and is not counted as a continue. Wherever snooze is offered,
 * this line says so.
 */
export const SNOOZE_ALLOWANCE_NOTE = 'Pauses all reminders, including your daily limit.';

/** Snooze lengths the popup offers, in minutes. */
export const SNOOZE_OPTIONS_MINUTES = Object.freeze([15, 30, 60]);

/** chrome.alarms name for the end of a snooze, which triggers a rebuild. */
export const SNOOZE_ALARM = 'snooze-end';

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

/**
 * Settings export file. Statistics and lifecycle flags are never exported:
 * they describe one device's history.
 */
export const EXPORT_FORMAT = 'steer-clear-settings';
export const EXPORT_VERSION = 1;
/** Largest import file accepted, in UTF-8 bytes (256 KB). */
export const MAX_IMPORT_BYTES = 262144;
/** Export file name: `<prefix>YYYY-MM-DD.json`, by the local date. */
export const EXPORT_FILE_PREFIX = 'steer-clear-settings-';
export const EXPORT_FILE_EXTENSION = '.json';
export const EXPORT_MIME_TYPE = 'application/json';
/** Indentation of the exported JSON, so the file is readable and editable by hand. */
export const EXPORT_JSON_INDENT = 2;
/**
 * How long the export's object URL stays alive after the click, in ms.
 * Revoking it at once can cancel the download in Firefox, which starts it
 * asynchronously.
 */
export const EXPORT_URL_REVOKE_DELAY_MS = 60000;
