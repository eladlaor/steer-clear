# Steer Clear 2.0 — Competitive Upgrade Plan

## Table of Contents

- [Summary](#summary)
- [Why these five goals](#why-these-five-goals)
- [Verified platform facts and minimum versions](#verified-platform-facts-and-minimum-versions)
- [Architecture decisions](#architecture-decisions)
- [Config schema v3 (the shared contract)](#config-schema-v3-the-shared-contract)
  - [In-memory shape](#in-memory-shape)
  - [Storage layout in storage.sync](#storage-layout-in-storagesync)
  - [SiteSettings fields](#sitesettings-fields)
  - [Schedule type](#schedule-type)
  - [Resolution rules](#resolution-rules)
  - [Validation rules](#validation-rules)
  - [Migration v1/v2 to v3](#migration-v1v2-to-v3)
  - [Export envelope](#export-envelope)
- [Local and session data layout](#local-and-session-data-layout)
- [Messages between surfaces and the service worker](#messages-between-surfaces-and-the-service-worker)
- [New constants](#new-constants)
- [G1 — Reach: Firefox, Firefox for Android, Edge, phone-width UI](#g1--reach-firefox-firefox-for-android-edge-phone-width-ui)
- [G2 — Pause screens that resist habituation](#g2--pause-screens-that-resist-habituation)
- [G3 — Schedules, daily allowance, outcomes and progress](#g3--schedules-daily-allowance-outcomes-and-progress)
- [G4 — Onboarding, toolbar popup, accessibility, rating prompt](#g4--onboarding-toolbar-popup-accessibility-rating-prompt)
- [G5 — Trust, portability and release engineering](#g5--trust-portability-and-release-engineering)
- [Implementation order and file ownership](#implementation-order-and-file-ownership)
- [Out of scope](#out-of-scope)
- [Target version and SemVer reasoning](#target-version-and-semver-reasoning)
- [Open questions to settle during implementation](#open-questions-to-settle-during-implementation)

---

## Summary

Steer Clear 2.0 closes the gaps the competitive landscape identified against
one sec, Intention and LeechBlock NG, and keeps the privacy stance intact: no
accounts, no servers, no analytics, no remote code, local-only data, and host
access requested one site at a time.

**What gets built, in order:**

1. **G1 Reach.** One source tree ships to Chrome, Edge, Firefox desktop and
   Firefox for Android. A Node build script (no dependencies) produces a
   Chrome/Edge zip and a Firefox zip from `src/`. `web-ext lint` passes. Every
   page works on a 360px-wide phone screen.
2. **G5-A Foundation.** Config schema v3 and its migration land before any
   feature work, together with CI. v3 moves sites out of the single `config`
   sync item, because the 8 KB per-item sync quota caps the current layout at
   roughly 20–30 sites.
3. **G2 Pause screens.** Three pause styles (your reason, breathing, intention
   prompt) plus a rotate option, multiple reasons per site, configurable bypass
   length, continue friction (instant, wait, type a phrase), and a theme setting.
4. **G3 Progress.** Per-site schedules, an optional daily allowance of
   continues, outcome tracking (steered clear vs continued), steer rate and
   streak on the stats page.
5. **G4 UX.** First-run onboarding with presets and one permission prompt, a
   real toolbar popup (quick-add, today's summary, snooze all), accessibility
   work, a shared design system, and a one-time rating prompt.
6. **G5-B Release.** Settings export/import, privacy policy and store listings
   for three stores, usage guides, changelog, and version **2.0.0**.

**The contract.** Every goal implements against the
[config schema v3](#config-schema-v3-the-shared-contract) and the
[local data layout](#local-and-session-data-layout) defined here. A goal that
needs a field not listed here amends this plan first, then the code.

**Definition of done for every goal:** its unit tests are written first and
pass (`node --test tests/unit/*.js`), CI is green once it exists, the manual
checks listed for the goal pass in the named browsers, `CHANGELOG.md` has
entries under `[Unreleased]`, and no file exceeds about 500 lines.

---

## Why these five goals

Each goal maps to a gap in
`knowledge/market_research/STEER_CLEAR_COMPETITIVE_LANDSCAPE.md`:

| Gap in the report | Goal that addresses it |
|---|---|
| Platform reach is Chrome only; Edge port is nearly free, Firefox suits a local-only open-source tool | G1 |
| Habituation threatens the core mechanic: a pause page that never changes stops being read | G2 (styles, rotating reasons, rotate mode with an explanation) |
| Intervention variety and goals are thinner (breathing, budgets, streaks at competitors) | G2, G3 |
| Social proof is the largest gap (zero ratings); onboarding should reach the first saved moment fast | G4 (onboarding, rating prompt) |
| Easy bypass may become the default path | G2 friction controls, G3 daily allowance (both opt-in) |
| Trust is the second-line selling point | G5 (export, CI, accurate disclosures), and a hard rule: no goal weakens privacy |

---

## Verified platform facts and minimum versions

Checked on 2026-10-16 against MDN browser-compat-data (`mdn/browser-compat-data`
main branch), MDN reference pages, Chrome for Developers, and Mozilla's
Extension Workshop and add-ons blog.

| Claim the plan relies on | Verified | Minimum version |
|---|---|---|
| `declarativeNetRequest` with `Redirect`, `regexFilter`, `isRegexSupported` in Firefox | Yes (BCD) | Firefox 113, Firefox for Android 113 |
| `regexSubstitution` supports `\0` for the whole match | Yes (MDN Redirect page; Chrome DNR reference) | Same as above |
| Regex rule cap is 1000 | Yes (Chrome DNR reference); Firefox exposes `MAX_NUMBER_OF_REGEX_RULES` | — |
| Redirect needs host permission for the request URL; navigations are exempt from the initiator check | Yes (MDN DNR page) | — |
| Redirect target must be listed in `web_accessible_resources` | Yes (MDN Redirect `extensionPath`; Chrome DNR reference) | — |
| `background.service_worker` unsupported in Firefox | Yes (BCD: `false`) | — |
| Both `background.scripts` and `background.service_worker` in one manifest | Chrome ignores `scripts` from 121 (rejected the manifest before 121). Firefox uses `scripts` and, from 121, starts the background page even when `service_worker` is present | Chrome 121, Firefox 121 |
| `background.type: "module"` | Yes | Chrome 92, Firefox 112 |
| `optional_host_permissions` (MV3) | Yes, Android mirrors desktop | Chrome 102, Firefox 128 |
| `permissions.request()` | Yes | Firefox 55 desktop, **Firefox for Android 120** |
| `storage.session` | Yes, Android mirrors desktop | Chrome 102, Firefox 115 |
| `storage.sync` on Firefox for Android | Partial: works locally, does not sync, quotas not enforced | Android 53 |
| `storage.sync` quotas | 102,400 bytes total, **8,192 bytes per item**, 512 items, 120 writes/min (Chrome reference; Firefox desktop enforces from 79) | — |
| `options_page` in Firefox | Yes | Firefox 126 |
| `action.default_popup` | Yes | Chrome 88, Firefox 109 |
| `activeTab` | Yes | Firefox 48 |
| `chrome.*` namespace returns promises in Firefox MV3 | Yes ("In Manifest V3, Firefox supports promises ... in the `chrome.*` namespace", Extension Workshop MV3 migration guide) | Firefox 109 (MV3 GA) |
| `browser_specific_settings.gecko.data_collection_permissions` | Yes. Required by AMO for **new** extensions since 2025-11-03; `{"required": ["none"]}` declares no collection | Firefox 140, Firefox for Android 142 |
| `gecko_android.strict_min_version` | Yes | Firefox for Android 113 |
| Chrome for Android and iOS browsers run extensions | No — out of scope | — |

**Minimum versions this release declares:**

| Browser | Key | Value | Why this floor |
|---|---|---|---|
| Chrome | `minimum_chrome_version` | `"121"` | Lowest version that accepts the cross-browser `background` block when loading `src/` unpacked |
| Edge | (same package) | 121 | Chromium 121 |
| Firefox desktop | `browser_specific_settings.gecko.strict_min_version` | `"140.0"` | `data_collection_permissions` support (140) covers every other floor (DNR 113, session 115, optional host permissions 128) and matches ESR 140 |
| Firefox for Android | `browser_specific_settings.gecko_android.strict_min_version` | `"142.0"` | `data_collection_permissions` on Android (142); `permissions.request` needs 120 |

**Two facts that shape code, not just manifests:**

- **Firefox loses the user gesture at the first `await`.** `permissions.request()`
  must be the first asynchronous call in any click handler that uses it. The
  current `handleAdd` and `handleGrant` already follow this order; every new
  call site (onboarding, popup quick-add, import "grant all") must too.
- **Whether `\0` is percent-encoded when it is substituted into the query is not
  documented by either browser.** If it is not encoded, a source URL containing
  `&` or `#` is truncated by `URLSearchParams.get`. G1 replaces that read with
  a pure `extractSourceUrl(href)` that takes everything after `?from=` and
  decodes only when the value is encoded. This works for both behaviors.

---

## Architecture decisions

**The service worker stays the sole owner of dynamic rules.** In Firefox the
same file runs as an event page (`background.scripts`). Rules remain derivable
from storage plus session state plus the clock, so a full rebuild is always safe.
New rule inputs (snooze, schedule) are added to a single `RuleContext`, not
scattered.

**Sites move out of the `config` sync item.** Chrome and Firefox reject any
`storage.sync` item over 8,192 bytes. One v2 site entry is about 250 bytes of
JSON; with v3 overrides, rotating reasons and schedules it reaches 400–1,500. A
single `config` item would fail at roughly 20 sites, and onboarding presets add
up to 18 at once. v3 stores global settings in `config` and each site in its own
`site:<id>` item. The in-memory config keeps the familiar `sites` array; only the
storage layer splits and assembles.

**Per-site settings become an `overrides` object.** v2 used flat nullable fields
(`null` means inherit), which cannot express settings where `null` is itself a
meaningful value, such as an unlimited daily allowance. In v3 a key that is
absent from `site.overrides` inherits; a present key wins, whatever its value.
One field table, one validator per field, one generic resolver. The settings
form is written once and reused for the defaults panel and every site.

**Derive, do not count.** Daily continues, steer rate, streak and the rating
threshold are computed from the outcome-tagged event log that already exists.
No parallel counters can drift from the log. The cost: these numbers reset when
the user erases statistics, which is the behavior an erase button should have.

**Enforcement lives in the worker where it can.** The daily allowance is checked
in the worker before a bypass is granted, so a page that skips the UI check
cannot exceed it. Wait-and-phrase friction is UI-only, because the worker cannot
observe a wait. That is acceptable for a nudge tool.

**No shim library.** Firefox MV3 returns promises from `chrome.*`, so the code
keeps the `chrome` namespace. The only platform-specific logic is browser
detection for the store link, in a pure module.

**Build by derivation.** `src/manifest.json` is the single cross-browser
manifest and loads unpacked in both Chrome and Firefox. The build derives a
stripped manifest per target. The derivation is a pure function with unit tests.

---

## Config schema v3 (the shared contract)

### In-memory shape

What `readConfig()` returns and `writeConfig()` accepts:

```js
{
  schemaVersion: 3,
  defaults: SiteSettings,        // global settings; every field required
  theme: 'system' | 'light' | 'dark',
  sites: Site[],                 // display order
}
```

`Site`:

| Field | Type | Default on create | Notes |
|---|---|---|---|
| `id` | string (UUID) | `crypto.randomUUID()` | Stable; carried through migration and import |
| `pattern` | string | normalized host | `normalizePattern` output |
| `displayName` | string \| null | `null` | `null` = show the host |
| `includeSubdomains` | boolean | `true` | |
| `enabled` | boolean | `true` | |
| `addedAt` | number \| null | `Date.now()` | Epoch ms; `null` for migrated sites |
| `overrides` | `Partial<SiteSettings>` | `{}` | Absent key = inherit from `defaults` |

### Storage layout in storage.sync

| Key | Value | Notes |
|---|---|---|
| `config` | `{ schemaVersion: 3, defaults, theme, siteOrder: string[] }` | `siteOrder` lists site ids in display order |
| `site:<id>` | `Site` | One item per site |

- `toSyncItems(config)` and `fromSyncItems(items)` in
  `src/background/sync_layout.js` are pure inverses.
- `writeConfig` validates, runs `assertSyncQuota(items)` (each item ≤ 8,192
  bytes measured as key length + `JSON.stringify(value)` length, total ≤
  102,400, count ≤ 512), then makes **one** `storage.sync.set` call with every
  item. It then removes any `site:*` keys that are no longer in `siteOrder`. A
  quota violation throws a descriptive error naming the largest item, and nothing
  is written.
- `fromSyncItems` throws if `siteOrder` names an id with no `site:<id>` item.
  This can happen briefly while sync delivers items out of order. The worker
  logs the error and keeps the previous rules; the next `onChanged` rebuild
  succeeds. Stray `site:*` keys that `siteOrder` does not list are ignored on
  read and cleaned on the next write.
- The worker's `storage.onChanged` listener rebuilds on a change to `config`
  **or** any `site:*` key in the `sync` area.

### SiteSettings fields

Every field below is required in `defaults` and optional in `site.overrides`.

| Field | Type / allowed values | Default | Goal | Notes |
|---|---|---|---|---|
| `target` | non-empty string | `DEFAULT_TARGET` (Wikipedia random) | existing | URL format is checked in the UI, not the validator, because v2 accepted any non-empty string |
| `targetName` | string | `''` | existing | `''` = show the target's hostname |
| `reasons` | string[]; 0–`MAX_REASONS_PER_SITE` (5) items; each trimmed, 1–`MAX_REASON_LENGTH` (1000) chars | `[]` | G2 | Replaces `note`. More than one rotates |
| `pauseStyle` | `'reason' \| 'breathing' \| 'intention' \| 'rotate'` | `'reason'` | G2 | `rotate` cycles reason → breathing → intention |
| `breathCount` | integer 1–10 | `3` | G2 | Breaths in the breathing style |
| `autoContinue` | boolean | `false` | existing | Ignored for the intention style (see resolution rules) |
| `countdownSeconds` | integer 1–60 | `3` | existing | |
| `bypassMinutes` | one of `1, 5, 15, 30` | `5` | G2 | Replaces `BYPASS_DURATION_MS` |
| `continueFriction` | `'instant' \| 'wait' \| 'phrase'` | `'instant'` | G2 | |
| `continueWaitSeconds` | integer 3–60 | `10` | G2 | Used when friction is `wait` |
| `continuePhrase` | string, trimmed, 1–80 chars | `'I choose to open this'` | G2 | Used when friction is `phrase`; compared case-insensitively with whitespace collapsed |
| `dailyContinueLimit` | integer 1–50, or `null` | `null` | G3 | `null` = unlimited. `null` as an override means "unlimited for this site" |
| `schedule` | `Schedule` | `ALWAYS_SCHEDULE` | G3 | Outside the schedule the site loads normally |

Global-only fields: `theme` (`'system'` default) on the config root.
Site-only fields: `pattern`, `displayName`, `includeSubdomains`, `enabled`,
`addedAt`.

### Schedule type

```js
Schedule = {
  days: number[],                       // subset of 0..6 (0 = Sunday); unique, ascending, at least one
  ranges: { start: number, end: number }[]  // 1..MAX_SCHEDULE_RANGES (4); minutes of local day
}
ALWAYS_SCHEDULE = { days: [0,1,2,3,4,5,6], ranges: [{ start: 0, end: 1440 }] }
```

- `start` is 0–1439 and `end` is 1–1440. `start === end` is invalid.
- `end > start` is a same-day range, `[start, end)`.
- `end < start` is an overnight range. It belongs to the day it **starts** on and
  runs from `start` to midnight, then from midnight to `end` on the next day.
  Example: Friday 22:00–02:00 is active Saturday 01:00.
- All times are local wall-clock times, evaluated with `Date` local getters, so
  DST shifts follow the user's clock.

### Resolution rules

`resolveSettings(defaults, site)` in `src/background/settings_schema.js`:

1. Start from `{ ...defaults }` and apply each key present in `site.overrides`.
2. **Target name follows its target.** If the site overrides `target` but not
   `targetName`, the resolved `targetName` is `''` and the button shows that
   target's hostname. This fixes a v2 bug where a per-site target showed the
   global destination's name.
3. `pauseStyle: 'rotate'` resolves to a concrete style in the worker:
   `ROTATION[n % 3]`, where `n` is the site's lifetime interception count before
   this one (`stats.totals[host] ?? 0`) and `ROTATION = ['reason', 'breathing',
   'intention']`.
4. With several reasons, the reason shown is `reasons[n % reasons.length]`, using
   the same `n`. No new state is stored.
5. If the concrete style is `intention`, `autoContinue` is forced to `false`.
   Typing an intention and being carried away from the site contradict each
   other. The settings UI disables the toggle and says why.
6. If the concrete style is `breathing` and `autoContinue` is on, the countdown
   starts after the last breath.

### Validation rules

- `validateSettings(obj, { partial })` validates each present field with its
  field validator. `partial: false` (defaults) requires every field.
  `partial: true` (overrides) rejects unknown keys.
- **No new constraint on any field v2 accepted.** `target` stays "non-empty
  string", `displayName` keeps no length limit, and `countdownSeconds` keeps
  1–60. New input limits for existing fields are UI-level only. This
  guarantees that every valid v2 config migrates to a valid v3 config.
- Site patterns must be unique after normalization.
  `sites.length ≤ MAX_SITES` (200). The sync quota is the binding limit in
  practice, and `assertSyncQuota` reports it.

### Migration v1/v2 to v3

`migrateConfig(stored)` in `src/background/config_migration.js` is a pure chain
of steps (`v1 → v2 → v3`). It is idempotent and total over valid inputs and
returns `{ config, migrated }`. The existing v1→v2 step, including the
`'somewhere better'` placeholder cleanup, is kept unchanged as the first step.

**v2 → v3 mapping:**

| v2 field | v3 location | Rule |
|---|---|---|
| `globalTarget` | `defaults.target` | Copied |
| `globalTargetName` | `defaults.targetName` | Copied |
| `globalNote` | `defaults.reasons` | `[note.trim()]` if non-blank, else `[]` |
| `globalAutoContinue` | `defaults.autoContinue` | Copied |
| `globalCountdownSeconds` | `defaults.countdownSeconds` | Copied |
| — | `defaults.*` (new fields) | Filled from the defaults table |
| — | `theme` | `'system'` |
| `sites[i].id/pattern/displayName/includeSubdomains/enabled` | same names | Copied |
| — | `sites[i].addedAt` | `null` |
| `sites[i].target` (non-null, non-blank) | `overrides.target` | Copied. Blank or null means no key, matching v2's "blank inherits" |
| `sites[i].note` (non-null, non-blank) | `overrides.reasons` | `[note.trim()]` |
| `sites[i].autoContinue` (non-null) | `overrides.autoContinue` | Copied |
| `sites[i].countdownSeconds` (non-null) | `overrides.countdownSeconds` | Copied |
| site missing `id` (hand-edited v1) | `id` | Assigned `crypto.randomUUID()` |

**Data-safety rules:**

- **Back up before migrating.** Before the first v3 write, `readConfig` copies
  the raw stored config to `storage.local` under `configBackup` (see
  [local data layout](#local-and-session-data-layout)), then writes the v3
  items in one `set` call. If the backup write fails, migration stops and the
  error surfaces. Nothing is written to sync.
- **Never truncate.** A legacy note longer than `MAX_REASON_LENGTH` makes the
  migration throw a descriptive error. Stored data stays untouched, and the
  settings page shows the error. `MAX_REASON_LENGTH` is 1000 to make this
  practically unreachable.
- **A newer schema is refused,** as today: `schemaVersion > 3` throws "update the
  extension".
- **Older synced installs.** A 1.x install on another machine signed into the
  same sync profile reads `schemaVersion: 3` and refuses it. It never
  overwrites the config, because 1.x writes only after a successful read. This
  is the breaking change behind the major version bump.
- **Behavioral equivalence test:** for every v1/v2 fixture, the v2 resolver and
  the v3 resolver produce equal `target`, `autoContinue`, `countdownSeconds`, and
  v2 `note` equals v3 `reasons[0] ?? ''`. `targetName` must also match, except
  for the documented per-site-target fix (resolution rule 2), which has its own
  test.

### Export envelope

```js
{
  format: 'steer-clear-settings',   // EXPORT_FORMAT
  exportVersion: 1,                 // EXPORT_VERSION
  exportedAt: '2026-10-16T09:00:00.000Z',
  extensionVersion: '2.0.0',
  config: { schemaVersion, defaults, theme, sites }   // in-memory shape
}
```

- Import accepts an envelope whose `config` is schema 1, 2 or 3 and runs it
  through `migrateConfig` and `validateConfig`.
- It rejects a wrong `format`, an `exportVersion` above 1, a `schemaVersion` above
  3, files over `MAX_IMPORT_BYTES` (256 KB), duplicate patterns, and quota
  overflow. Each rejection gives a message naming the field path.
- Import **replaces** the current settings after an explicit confirmation that
  states the site counts before and after. There is no merge mode.
- Statistics and lifecycle flags are never exported. They describe one device's
  history.

---

## Local and session data layout

| Area | Key | Shape | Written by | Retention |
|---|---|---|---|---|
| `local` | `stats` | see below | worker | Events: 90 days (`STATS_RETENTION_DAYS`), pruned on write and by the daily alarm. `totals`: until erased. Erased in one click on the stats page |
| `local` | `lifecycle` | `{ onboardingCompletedAt: number\|null, ratingPrompt: { state: 'pending'\|'rated'\|'dismissed'\|'expired', shownCount: number, resolvedAt: number\|null } }` | onboarding page, popup | Until uninstall. Not erased with stats, so a resolved rating prompt never returns |
| `local` | `configBackup` | `{ fromSchemaVersion: number, backedUpAt: number, raw: object }` | `readConfig` during migration | Deleted by the daily alarm `CONFIG_BACKUP_RETENTION_DAYS` (30) after `backedUpAt` |
| `session` | `bypasses` | `{ [host]: expiresAtMs }` | worker | Unchanged: dies with the browser |
| `session` | `snooze` | `{ until: number }` | worker | Dies with the browser; cleared by alarm or "Resume now" |

**`stats` v3 shape** (additive; `normalizeStats(raw)` fills missing fields, so no
stored-stats migration is needed):

```js
{
  totals: { [host]: number },        // unchanged
  events: [{
    id?: string,                     // new; absent on pre-2.0 events
    host: string,
    at: number,
    outcome?: 'left' | 'steered' | 'continued'   // new; absent on pre-2.0 events
  }],
  since: number | null,              // unchanged
  outcomesSince: number | null       // new; first event recorded with an outcome
}
```

- **Outcome lifecycle.** An interception is logged as `outcome: 'left'` when the
  pause page asks what to display. Clicking the alternative, or auto-continue
  reaching it, updates it to `'steered'`. Granting a bypass updates it to
  `'continued'`. "Steered clear" = `left` + `steered`. Closing the tab needs no
  tracking: the event simply stays `left`.
- Pre-2.0 events have no outcome. They count in totals and in the hour and
  weekday charts but not in steer rate or streaks. The stats page says outcome
  tracking began on `outcomesSince`.
- Typed intentions and typed phrases are **never** stored or logged.

---

## Messages between surfaces and the service worker

| Type | Payload → response | Status |
|---|---|---|
| `GET_RESOLVED_SITE` | `{ fromUrl }` → `{ eventId, host, siteName, target, targetName, reason, pauseStyle (concrete), breathCount, autoContinue, countdownSeconds, bypassMinutes, continueFriction, continueWaitSeconds, continuePhrase, dailyContinueLimit, continuesToday, limitReached, theme, matched }` | Extended |
| `GRANT_BYPASS` | `{ host, eventId }` → `{ expiresAt }`; rejects with `DAILY_LIMIT_REACHED` when over the allowance | Extended |
| `RECORD_OUTCOME` | `{ eventId, outcome: 'steered' }` → `{}` | New (G3) |
| `ADD_SITE` | `{ host }` → `{ siteId }` (popup quick-add; the worker writes) | New (G4) |
| `SET_SNOOZE` | `{ minutes }` → `{ until }` | New (G4) |
| `CLEAR_SNOOZE` | `{}` → `{}` | New (G4) |
| `GET_STATUS` | `{}` → `{ snoozedUntil: number\|null }` | New (G4) |
| `GET_STATS`, `CLEAR_STATS`, `REBUILD_RULES` | unchanged | Kept |

Recording outcomes is a side observation and follows `logInterception`: on
failure it is logged and swallowed, **except** for a site with a
`dailyContinueLimit`. If stats cannot be read there, `GRANT_BYPASS` rejects with
a descriptive error rather than granting an unchecked bypass.

---

## New constants

All in `src/constants.js`. Enums are frozen objects, as existing code does.
Values are the contract; names may be refined in review.

- `SCHEMA_VERSION = 3`
- `StorageKey`: add `SITE_PREFIX: 'site:'`, `SNOOZE: 'snooze'`,
  `LIFECYCLE: 'lifecycle'`, `CONFIG_BACKUP: 'configBackup'`
- `PauseStyle { REASON, BREATHING, INTENTION, ROTATE }`, `PAUSE_ROTATION`
- `ContinueFriction { INSTANT, WAIT, PHRASE }`
- `Theme { SYSTEM, LIGHT, DARK }`
- `Outcome { LEFT, STEERED, CONTINUED }`
- `RatingState { PENDING, RATED, DISMISSED, EXPIRED }`
- `BrowserId { CHROME, EDGE, FIREFOX }`
- `MessageType`: add `RECORD_OUTCOME, ADD_SITE, SET_SNOOZE, CLEAR_SNOOZE, GET_STATUS`
- `ErrorCode { DAILY_LIMIT_REACHED }`
- `BYPASS_MINUTES_OPTIONS = [1, 5, 15, 30]`, `DEFAULT_BYPASS_MINUTES = 5`
  (remove `BYPASS_DURATION_MS`)
- `MIN_BREATH_COUNT = 1`, `MAX_BREATH_COUNT = 10`, `DEFAULT_BREATH_COUNT = 3`,
  `BREATH_INHALE_MS = 4000`, `BREATH_EXHALE_MS = 6000`
- `MIN_CONTINUE_WAIT_SECONDS = 3`, `MAX_CONTINUE_WAIT_SECONDS = 60`,
  `DEFAULT_CONTINUE_WAIT_SECONDS = 10`
- `DEFAULT_CONTINUE_PHRASE = 'I choose to open this'`, `MAX_CONTINUE_PHRASE_LENGTH = 80`
- `MIN_DAILY_CONTINUE_LIMIT = 1`, `MAX_DAILY_CONTINUE_LIMIT = 50`
- `MAX_REASONS_PER_SITE = 5`, `MAX_REASON_LENGTH = 1000`, `MIN_INTENTION_CHARS = 3`
- `MINUTES_PER_DAY = 1440`, `MAX_SCHEDULE_RANGES = 4`, `ALWAYS_SCHEDULE`
- `SNOOZE_OPTIONS_MINUTES = [15, 30, 60]`, `SNOOZE_ALARM = 'snooze-end'`,
  `SCHEDULE_ALARM = 'schedule-boundary'`
- `MAX_SITES = 200`
- `SYNC_QUOTA_BYTES = 102400`, `SYNC_QUOTA_BYTES_PER_ITEM = 8192`, `SYNC_MAX_ITEMS = 512`
- `CONFIG_BACKUP_RETENTION_DAYS = 30`
- `RATING_PROMPT_THRESHOLD = 10`, `RATING_PROMPT_MAX_SHOWS = 3`
- `STORE_REVIEW_URL = { chrome: 'https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn/reviews', edge: null, firefox: null }`
  — Firefox and Edge are filled in when those listings exist. `null` hides the
  prompt on that browser and logs it at info level.
- `EXPORT_FORMAT = 'steer-clear-settings'`, `EXPORT_VERSION = 1`, `MAX_IMPORT_BYTES = 262144`
- `ONBOARDING_PATH = 'onboarding/onboarding.html'`

Tool-only constants (`tools/`): `MOBILE_VIEWPORT = { width: 360, height: 740 }`,
`MIN_TOUCH_TARGET_PX = 44`.

---

## G1 — Reach: Firefox, Firefox for Android, Edge, phone-width UI

**Goal.** One source tree runs on Chrome, Edge, Firefox desktop and Firefox for
Android. Two release zips come out of a single build command, and every page is
usable at 360px.

**Scope — files:**

| Action | File | What |
|---|---|---|
| Change | `src/manifest.json` | `background: { service_worker, scripts: ["background/service_worker.js"], type: "module" }`; `minimum_chrome_version: "121"`; `browser_specific_settings.gecko { id: "steer-clear@eladlaor", strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } }`; `gecko_android { strict_min_version: "142.0" }` |
| Add | `tools/manifest_targets.mjs` | Pure `deriveManifest(base, target)`. `chrome` drops `browser_specific_settings` and `background.scripts`. `firefox` drops `background.service_worker` and `minimum_chrome_version` |
| Add | `tools/build.mjs` | Copies `src/` to `dist/chrome/` and `dist/firefox/` (excluding `*.md`, `.DS_Store`), writes the derived manifests, and zips each with the system `zip` (manifest at zip root) to `dist/steer-clear-chrome-<v>.zip` and `dist/steer-clear-firefox-<v>.zip`. Exits non-zero with a `[build]` message on any failure |
| Remove | `tools/package.sh` | Replaced by `tools/build.mjs`; references in docs are updated |
| Add | `src/shared/source_url.js` | Pure `extractSourceUrl(href)` (see verified facts) |
| Add | `src/shared/platform.js` | Pure `detectBrowser({ extensionBaseUrl, uaBrands })` (`moz-extension:` → firefox; brand `Microsoft Edge` → edge; else chrome) |
| Add | `src/shared/messaging.js` | The `sendMessage` wrapper now duplicated in `blocked.js` and `stats.js` |
| Add | `src/shared/tokens.css`, `src/shared/base.css` | Theme tokens and the shared reset, `[hidden]` rule, buttons, focus ring, and 44px minimum target sizes. The three page stylesheets import these instead of duplicating `:root` |
| Change | `src/blocked/*`, `src/options/*`, `src/stats/*` (CSS) | Fluid layouts. No fixed widths over 360px; the options add-grid becomes one column under 480px; site rows wrap; the hour chart scales |
| Change | `src/blocked/blocked.js` | Uses `extractSourceUrl` |
| Add | `tools/mobile_audit.mjs` | Playwright (same loading as `screenshots.mjs`). Opens every extension page at 360×740 and fails if `scrollWidth > innerWidth` or any visible interactive element is smaller than 44×44 CSS px |
| Change | `tests/unit/manifest.test.js` | Asserts both background keys point at the same existing file, `type: module`, gecko id and both `strict_min_version` values present, `data_collection_permissions.required` is `["none"]`, and `tabs` is in the always-available set (popup `tabs.query` under `activeTab`, G4) |
| Add | `tests/unit/build_manifest.test.js`, `tests/unit/source_url.test.js`, `tests/unit/platform.test.js` | |

**Acceptance criteria:**

1. [unit] `deriveManifest(base, 'chrome')` has no `browser_specific_settings` and
   no `background.scripts`, and keeps `service_worker`, `type` and
   `minimum_chrome_version`.
2. [unit] `deriveManifest(base, 'firefox')` has no `background.service_worker`
   and no `minimum_chrome_version`, and keeps `scripts`, `type`,
   `browser_specific_settings` and `optional_host_permissions`.
3. [unit] `deriveManifest` does not mutate its input and throws on an unknown
   target.
4. [unit] `extractSourceUrl` returns the full original URL for: an encoded
   value; an unencoded value containing `&`, `=`, `?` and `#fragment`; and a
   value with a port. It returns `null` for a missing or non-http(s) value.
5. [unit] `detectBrowser` maps `moz-extension://…` to firefox,
   `chrome-extension://…` with an Edge brand to edge, and otherwise to chrome.
6. [unit] The manifest tests listed above pass. Existing tests still pass
   (90 at baseline).
7. [cmd] `node tools/build.mjs` produces both zips. `unzip -l` shows
   `manifest.json` at each root, and neither zip contains `.md` files.
8. [cmd] `npx --yes web-ext@<pinned> lint --source-dir dist/firefox` reports
   0 errors and 0 warnings. Any warning that cannot be removed is listed with a
   reason in `knowledge/usage_guides/DEVOPS_GUIDE.md`.
9. [cmd] `node tools/mobile_audit.mjs` passes for the reminder, settings, stats,
   popup and onboarding pages. Popup and onboarding are added to the audit as
   G4 creates them.

**Manual checks (each browser named):**

- M1 Chrome (unpacked `dist/chrome`): README checks 1–12 pass.
- M2 Edge (unpacked `dist/chrome`): add a site, see the reminder, continue, and
  check the bypass expires.
- M3 Firefox desktop (`about:debugging` → load `dist/firefox`): add a site;
  the permission prompt appears; navigating to
  `https://example.com/a?x=1&y=2#frag` shows the reminder with that exact URL;
  continue works; the bypass expires; revoking access in the Add-ons Manager
  makes the site show "needs access".
- M4 Firefox for Android (`web-ext run -t firefox-android` or a signed test
  build): add a site from settings, grant access, navigate, see the reminder,
  continue. All three pages are usable one-handed with no horizontal scroll.
- M5 Firefox private window, without "Run in Private Windows": the site loads
  normally, and the user guide documents this.
- M6 Chrome loading raw `src/` unpacked still works (the manifest warning about
  `browser_specific_settings` is expected and documented).

**Spike first.** Before the rest of G1, prove M3 and M4 by hand with the current
code plus only the manifest change. If a DNR redirect to a `moz-extension://`
web-accessible page does not work on Firefox for Android, stop and amend this
plan. There is no silent fallback.

---

## G2 — Pause screens that resist habituation

**Goal.** The pause screen varies in a way the user chose and understands. The
way through can be made deliberately slower, globally or per site.

**Scope — files:**

| Action | File | What |
|---|---|---|
| Add | `src/background/pause.js` | Pure: `concretePauseStyle(style, n)`, `pickReason(reasons, n)`, `effectiveAutoContinue(style, autoContinue)` |
| Add | `src/background/continue_gate.js` | Pure `continueGate(state)` → `{ enabled, blockedBy: 'breathing'\|'intention'\|'waiting'\|'phrase'\|'limit'\|null, remainingSeconds }`. Continue is enabled when the style gate (reason: immediately; breathing: all breaths done; intention: at least `MIN_INTENTION_CHARS` non-space characters typed) **and** the friction gate (instant; wait: `continueWaitSeconds` elapsed since render; phrase: typed text matches) are both satisfied, and the limit is not reached. `phraseMatches(typed, phrase)` is exported |
| Change | `src/background/message_handlers.js` (see G5-A) | `GET_RESOLVED_SITE` returns the concrete style, the picked reason and the friction fields. `grantBypass` uses `bypassMinutes` |
| Change | `src/blocked/blocked.html`, `blocked.js`, `blocked.css` | `blocked.js` stays the controller (≤ 250 lines) and delegates to the views below. The bypass button's sub-label shows `bypassMinutes` |
| Add | `src/blocked/breathing_view.js` | Animated circle (CSS transform) with a text cue "Breathe in / Breathe out" and a counter "2 of 3". Under `prefers-reduced-motion: reduce`, no scaling: the cue text and counter only, same timing |
| Add | `src/blocked/intention_view.js` | Labeled input "What did you come here for?". Value is held in memory only |
| Add | `src/blocked/continue_view.js` | Renders the gate: disabled continue button with `aria-disabled`, the remaining seconds, the phrase input |
| Add | `src/shared/theme.js` | `applyTheme(theme)` sets `data-theme` on `<html>` (`system` removes it). Used by every page |
| Change | `src/shared/tokens.css` | Light and dark token sets; `prefers-color-scheme` applies only when `data-theme` is absent |
| Add | `src/options/settings_form.js` | One generic form for the SiteSettings fields. In defaults mode every field is set. In override mode each field has a "Use default" state that removes the key. Used by the defaults panel and every site row |
| Change | `src/options/options.js`, `options.html`, `options.css` | Split: `options.js` (bootstrap, ≤ 200 lines), `site_list.js` (rows, add form, permission banner), `settings_form.js`. Adds a reasons list editor (add, remove, reorder up to 5), a pause-style picker with a one-line explanation of rotate ("changes each time so it stays noticeable"), bypass length, friction and theme |
| Add | `tests/unit/pause.test.js`, `tests/unit/continue_gate.test.js` | |

**Acceptance criteria:**

1. [unit] `concretePauseStyle('rotate', n)` yields reason, breathing, intention
   for n = 0, 1, 2 and repeats at n = 3. Non-rotate styles return themselves for
   any n.
2. [unit] `pickReason([], n)` returns `''`. `pickReason([a], n)` returns `a`.
   `pickReason([a, b, c], n)` returns `reasons[n % 3]`.
3. [unit] `effectiveAutoContinue('intention', true)` is `false`. For the other
   styles it returns its input.
4. [unit] `continueGate`, for each style × friction combination: disabled with
   the correct `blockedBy` before its condition holds, enabled after;
   `remainingSeconds` counts down for `wait`; `limit` overrides everything.
5. [unit] `phraseMatches` ignores case and repeated or leading or trailing
   whitespace, and rejects a partial phrase.
6. [unit] `resolveSettings` returns per-site overrides for each new field and
   inherits when the key is absent (shared with G5-A tests).
7. [unit] `validateSettings` rejects: `bypassMinutes: 7`, `breathCount: 0`,
   `breathCount: 11`, `continueWaitSeconds: 2`, an empty `continuePhrase`, 6
   reasons, a blank reason, a 1001-character reason, and an unknown
   `pauseStyle`.
8. [unit] `buildRules` and bypass expiry use `bypassMinutes` from the resolved
   site settings (a bypass of 15 minutes expires at `now + 15 × 60 000`).

**Manual checks:**

- M1 Each style renders correctly in light, dark and system themes, in Chrome
  and Firefox.
- M2 Breathing with 3 breaths takes about 30 s (4 s in, 6 s out). Continue
  unlocks after the last breath. The alternative button works throughout.
- M3 With OS reduced motion on, the circle does not animate, and the text cue
  and counter still advance.
- M4 Rotate mode shows a different style on consecutive visits to the same
  site, and a site with 3 reasons shows each in turn.
- M5 Friction `wait 10`: continue is disabled with a visible countdown.
  `phrase`: continue unlocks only after the phrase is typed.
- M6 Per-site override of style or friction applies to that site only;
  "Use default" restores inheritance.
- M7 Intention style disables the auto-continue control in settings and explains
  why.

---

## G3 — Schedules, daily allowance, outcomes and progress

**Goal.** A site can be paused only when it matters (work hours), the user can
opt into a daily cap on continues, and the stats page answers "is this
working?" with a steer rate and a streak.

**Scope — files:**

| Action | File | What |
|---|---|---|
| Add | `src/background/schedule.js` | Pure: `validateSchedule(s)`, `isScheduleActiveAt(schedule, date)`, `nextScheduleBoundary(schedules, now)` (earliest start or end of any range across sites within 8 days, or `null` if every schedule is `ALWAYS`) |
| Change | `src/background/rules.js` | `buildRules(config, extensionBaseUrl, context)`, where `context = { bypassedHosts, grantedHosts, snoozedUntil, now }`. A site produces a rule only if it is enabled, valid, not bypassed, granted, not snoozed, and its resolved schedule is active at `now`. The existing positional signature is replaced, and its tests are updated |
| Change | `src/background/rule_sync.js` (G5-A) | After every rebuild, (re)creates `SCHEDULE_ALARM` at `nextScheduleBoundary`, or clears it when `null`. The alarm handler rebuilds |
| Change | `src/background/stats.js` | `normalizeStats`, `recordInterception` (assigns `id`, `outcome: 'left'`, sets `outcomesSince`), pure `applyOutcome(stats, eventId, outcome)` (unknown id → throws; `continued` may follow `left` or `steered`; `steered` may follow `left` only) |
| Add | `src/background/progress.js` | Pure: `continuesToday(stats, host, now)`, `steerRate(stats, now, days)` → `{ steered, continued, rate \| null }`, `currentStreak(stats, now)` → `{ days, capped }`, `todaySummary(stats, now)` → `{ intercepted, steered, continued }`, `steerCount(stats)` |
| Change | `src/background/stats_store.js` | `recordOutcome(eventId, outcome)` |
| Change | `src/background/message_handlers.js` | `RECORD_OUTCOME`. `GRANT_BYPASS` checks `continuesToday < dailyContinueLimit` first and records `continued` |
| Change | `src/blocked/*` | Clicking the alternative sends `RECORD_OUTCOME steered`, then navigates. So does auto-continue reaching the target. When `limitReached`, the continue button is replaced by "You've used today's N opens of X. It resets at midnight — or change this in Settings." |
| Add | `src/options/schedule_editor.js` | Day toggles plus up to 4 time ranges, a preset "Weekdays 9–17", and "Always" |
| Change | `src/stats/stats.html`, `stats.js`, `stats.css` | Cards: steer rate (30 days), current streak, today. Per-site rows show steered vs continued. The note "Choices tracked since <outcomesSince>" |
| Add | `tests/unit/schedule.test.js`, `tests/unit/progress.test.js`; extend `stats.test.js`, `rules.test.js` | |

**Definitions (the contract for the stats UI):**

- **Steer rate** over N days = `(left + steered) / (left + steered + continued)`
  over events in the window that have an outcome. It is `null` when the
  denominator is 0, and the UI shows "—".
- **Current streak** = consecutive local days ending today with no
  `continued` event. It counts days on or after the local day of
  `outcomesSince`. It is capped at the retention window, with `capped: true`
  shown as "90+ days". With `outcomesSince === null` it is 0.
- **Continues today** = events for that host since local midnight with
  `outcome === 'continued'`.

**Acceptance criteria:**

1. [unit] `isScheduleActiveAt`: Mon–Fri 09:00–17:00 is active Mon 09:00, inactive
   Mon 17:00 (end-exclusive), and inactive Sat 10:00. Overnight Fri 22:00–02:00 is
   active Fri 23:00 and Sat 01:59, and inactive Sat 02:00 and Thu 23:00.
   `ALWAYS_SCHEDULE` is active at every hour of a sampled week.
2. [unit] `validateSchedule` rejects: empty `days`, a day of 7, duplicate days,
   0 or 5 ranges, `start === end`, `start` 1440, `end` 0, and non-integers.
3. [unit] `nextScheduleBoundary` returns the next range start when currently
   inactive, the range end when active, the earliest boundary across several
   sites, and `null` when every site is always-active.
4. [unit] `buildRules` omits a site outside its schedule and includes it inside;
   it returns `[]` while `snoozedUntil > now`, and the full set once
   `snoozedUntil <= now`.
5. [unit] `recordInterception` on stats without outcome fields adds `id`,
   `outcome: 'left'` and `outcomesSince`, and keeps legacy events unchanged.
6. [unit] `applyOutcome` updates exactly one event, throws on an unknown id, and
   rejects `steered` after `continued`.
7. [unit] `continuesToday` counts only that host's `continued` events since
   local midnight, and ignores yesterday 23:59.
8. [unit] `steerRate` excludes legacy events and returns `null` with no data;
   for 3 left, 1 steered and 1 continued it returns 0.8.
9. [unit] `currentStreak`: a continue today → 0; a continue 3 days ago only → 3
   (today, yesterday, the day before); a day with no events at all still counts.
   It is capped at retention.
10. [unit] The worker-side check (pure helper `canGrantBypass(settings, stats,
    host, now)`) refuses when `continuesToday >= dailyContinueLimit` and always
    allows when the limit is `null`.
11. [unit] `pruneEvents` keeps working on outcome-tagged events (existing tests
    extended).

**Manual checks:**

- M1 A schedule ending 2 minutes from now: the site loads normally after the
  boundary without any user action, and the reminder returns at the next start.
- M2 Daily limit 2: the third reminder of the day shows the limit message and no
  continue button. Changing the limit in settings restores it.
- M3 The stats page shows steer rate, streak and today, with the right values
  after a scripted sequence (2 steers, 1 continue).
- M4 Erase statistics resets steer rate, streak and continues-today, and
  leaves `lifecycle` untouched.

---

## G4 — Onboarding, toolbar popup, accessibility, rating prompt

**Goal.** A new user reaches their first useful pause within a minute. Everyday
actions live one click from the toolbar. Every surface is keyboard- and
screen-reader-usable with AA contrast in both themes. A satisfied user is asked
once for a rating.

**Scope — files:**

| Action | File | What |
|---|---|---|
| Add | `src/background/presets.js` | Frozen `PRESETS`: `social` (facebook.com, instagram.com, x.com, tiktok.com, reddit.com), `news` (cnn.com, nytimes.com, bbc.com, theguardian.com, foxnews.com), `video` (youtube.com, netflix.com, twitch.tv), `shopping` (amazon.com, ebay.com, aliexpress.com, temu.com, etsy.com). Pure `hostsForPresets(ids, extraHosts)` returns deduplicated normalized hosts |
| Add | `src/onboarding/onboarding.html`, `.js`, `.css` | Steps: (1) what it is — "a nudge, not a wall"; (2) pick presets and/or type domains; (3) write a reason, pick a destination and a pause style; (4) **one** "Turn on Steer Clear" button that calls `permissions.request` for every selected host's origins as its first async call, then writes the config. Ungranted sites are added and shown as "needs access" — the same behavior as settings. (5) Done, with "try it: open <first site>". Sets `lifecycle.onboardingCompletedAt`. Skippable at every step |
| Change | `src/background/service_worker.js` | On `install`: write the default config and open `ONBOARDING_PATH` with `chrome.tabs.create`, replacing `openOptionsPage`. On `update`: no tab opens |
| Add | `src/popup/popup.html`, `.js`, `.css` | Today's summary (`todaySummary`) and streak; "Steer clear of <host>" quick-add when the active tab is http(s) and not already listed (calls `permissions.request` first, then sends `ADD_SITE`, so the worker persists the site even if the popup closes during the prompt); snooze 15/30/60 and "Resume now" with the remaining time; links to stats and settings; the rating banner |
| Change | `src/manifest.json` | `action.default_popup` → `popup/popup.html`; add `activeTab` to `permissions` |
| Add | `src/background/rating.js` | Pure: `shouldShowRatingPrompt(lifecycle, steerCount, storeUrl)` and `nextRatingState(lifecycle, event, now)` for the events `shown`, `rated`, `dismissed`. After `RATING_PROMPT_MAX_SHOWS` shows the state becomes `expired` |
| Add | `src/background/lifecycle_store.js` | Read and write `lifecycle` in `storage.local`, with `normalizeLifecycle` |
| Change | `src/background/rule_sync.js`, `message_handlers.js` | Snooze: `SET_SNOOZE` writes `session.snooze`, creates `SNOOZE_ALARM`, rebuilds; the alarm or `CLEAR_SNOOZE` clears it and rebuilds; `GET_STATUS` |
| Change | `src/shared/tokens.css`, `base.css`, every page | One visual system: type scale, spacing scale, radius, and button variants. Visible `:focus-visible` ring; 44px targets |
| Change | All pages | Accessibility: a single `<h1>` per page and logical headings; every input labeled; status regions `aria-live="polite"`; the countdown announces at start and on stop, not every second; the breathing circle is `aria-hidden` with a live text cue; initial focus on the pause page's alternative button; Escape stops a running countdown; disabled-continue reasons are associated via `aria-describedby` |
| Add | `tools/contrast.mjs` (pure) and `tests/unit/contrast.test.js` | Parses `src/shared/tokens.css` and asserts WCAG contrast for each text/background token pair in the light and dark sets |
| Change | `tools/screenshots.mjs` | Seeds v3 config and outcome-tagged history. Captures: 1 reminder, 2 breathing style, 3 settings, 4 patterns, 5 popup (Chrome Web Store allows 5) |
| Add | `tests/unit/presets.test.js`, `tests/unit/rating.test.js`, `tests/unit/lifecycle.test.js` | |

**Acceptance criteria:**

1. [unit] `hostsForPresets(['social', 'video'], ['Example.com/path'])` returns
   the union, normalized and deduplicated, including `example.com`. An unknown
   preset id throws.
2. [unit] Every preset host passes `normalizePattern` unchanged.
3. [unit] `shouldShowRatingPrompt` is true only when the state is `pending`,
   `steerCount >= RATING_PROMPT_THRESHOLD` and `storeUrl` is non-null.
   `nextRatingState` moves `pending` → `rated` or `dismissed` on click, and
   `pending` → `expired` on the 3rd `shown`. Every non-pending state is final.
4. [unit] `normalizeLifecycle(undefined)` returns the documented defaults.
5. [unit] `contrast.test.js`: `--ink` on `--bg` and on `--card`, `--ink-soft` on
   `--card`, `--accent-ink` on `--accent`, and `--danger` on `--card` are each
   ≥ 4.5:1 in light and in dark.
6. [unit] `manifest.test.js`: `activeTab` declared; `default_popup` exists;
   `onboarding/onboarding.html` exists.
7. [cmd] `node tools/mobile_audit.mjs` passes for popup and onboarding.
8. [cmd] `node tools/screenshots.mjs --out <tmp>` writes 5 PNGs at 1280×800.

**Manual checks:**

- M1 Fresh install (Chrome, Firefox desktop, Firefox Android): onboarding opens.
  Picking Social + one typed domain gives **one** permission prompt; after
  granting, visiting facebook.com shows the reminder.
- M2 Deny the prompt in onboarding: the sites appear in settings as
  "needs access", with a working grant button.
- M3 Popup on a normal site: quick-add asks for access and adds the site.
  Reloading that tab shows the reminder. On an `about:`/`chrome:` page, the
  quick-add is hidden.
- M4 Snooze 15: every listed site loads normally and the popup shows the time
  remaining. "Resume now" restores the reminders immediately. A browser restart
  also ends the snooze.
- M5 Keyboard only: every action on every page is reachable with Tab, with a
  visible focus ring and no keyboard traps.
- M6 Screen reader (VoiceOver on macOS): the pause page reads the site,
  the reason, and why continue is disabled.
- M7 After 10 steers, the popup shows the rating banner. "Rate" opens the
  Chrome Web Store reviews page. The banner never reappears after either button
  or after 3 showings.
- M8 Upgrading from 1.0.0 opens no tab, and existing settings are intact (see
  G5-A).

---

## G5 — Trust, portability and release engineering

G5 is split: **G5-A** is foundation work that lands right after G1; **G5-B** is
release work that lands last.

### G5-A — Schema v3, storage split, worker split, CI

**Scope — files:**

| Action | File | What |
|---|---|---|
| Add | `src/background/settings_schema.js` | Field table, `defaultSettings()`, `validateSettings(obj, { partial })`, `resolveSettings(defaults, site)` |
| Add | `src/background/config_migration.js` | `migrateConfig` chain (v1→v2 kept, v2→v3 new) |
| Add | `src/background/sync_layout.js` | `toSyncItems`, `fromSyncItems`, `assertSyncQuota` |
| Change | `src/background/config.js` | Storage I/O only: `readConfig` (read all sync items, assemble, migrate, back up, persist), `writeConfig`, `createSite`, `validateConfig` (structure + delegates to `settings_schema`) |
| Change | `src/background/rules.js` | `resolveSiteSettings` replaced by `resolveSettings` from `settings_schema.js`; `findMatchingSite`, `siteLabel` and `normalizePattern` stay |
| Split | `src/background/service_worker.js` | Into `service_worker.js` (listener registration only), `rule_sync.js` (rebuild, bypass, snooze, schedule alarm, backup prune), and `message_handlers.js` (dispatch table) |
| Change | `src/options/*` | Reads and writes the v3 in-memory shape |
| Add | `.github/workflows/ci.yml` | On push and PR, Node 24: `node --test tests/unit/*.js`; `node tools/build.mjs`; `npx --yes web-ext@<pinned exact version> lint --source-dir dist/firefox`; upload both zips as workflow artifacts. No secrets; no publishing |
| Replace | `tests/unit/config.test.js` | Becomes `config_migration.test.js`, `settings_schema.test.js` and `sync_layout.test.js`. Every existing assertion's intent is kept |

**Acceptance criteria:**

1. [unit] v1, v2 and v2-with-placeholder fixtures migrate to configs that pass
   `validateConfig`, with `schemaVersion: 3`.
2. [unit] Migration preserves every site id, pattern, displayName,
   includeSubdomains and enabled value, and site order.
3. [unit] Behavioral equivalence (defined in the
   [migration section](#migration-v1v2-to-v3)) holds for every fixture,
   including blank-string overrides inheriting.
4. [unit] Migration is idempotent: migrating a v3 config returns
   `migrated: false` and an identical object.
5. [unit] A legacy note of 1001 characters makes migration throw, naming the
   site; the input object is not mutated.
6. [unit] `schemaVersion: 4` throws with "update the extension".
7. [unit] `fromSyncItems(toSyncItems(c))` deep-equals `c` for fixtures with 0, 1
   and 50 sites.
8. [unit] `fromSyncItems` throws naming the missing id when `siteOrder`
   references an absent item, and ignores stray `site:*` items.
9. [unit] `assertSyncQuota` throws naming the offending key when one item exceeds
   8,192 bytes, when the total exceeds 102,400 bytes, or when there are more than
   512 items. It passes for 100 sites with typical settings.
10. [unit] `resolveSettings`: an absent key inherits, a present key wins
    (including `dailyContinueLimit: null` over a numeric default), and rule 2
    (target name follows its target) holds.
11. [unit] `validateSettings(partial: true)` rejects unknown keys;
    `partial: false` rejects a missing field.
12. [unit] `migrateConfig` is the only producer of v3 from older data. The test
    fixtures include a real v2 config captured from 1.0.0
    (`tests/unit/fixtures/config_v2_real.json`).
13. [ci] The CI workflow runs green on the branch.

**Manual checks:**

- M1 Install 1.0.0 from the store zip, add 3 sites with notes and overrides,
  upgrade in place to the branch build, and open settings: all values are
  present and behavior is unchanged. `storage.local.configBackup` holds the raw
  v2 config.
- M2 Same upgrade with 40 sites (above the old single-item limit): it succeeds.

### G5-B — Export/import, docs, store, version

**Scope — files:**

| Action | File | What |
|---|---|---|
| Add | `src/background/settings_io.js` | Pure `buildExport(config, extensionVersion, now)` and `parseImport(text)` → `{ config }`, or throws with a field path |
| Add | `src/options/data_panel.js` + markup | "Export settings" (Blob plus `<a download>`, file name `steer-clear-settings-YYYY-MM-DD.json`; needs no `downloads` permission). "Import settings" (file input, preview "Replace N sites with M sites?", confirm). After import, "M sites need access — Grant all" makes one `permissions.request` as the first async call |
| Change | `store/PRIVACY_POLICY.md` | New "Last updated". Adds: choices on the reminder page (which button) stored with each record; snooze and bypass state in session storage; onboarding and rating flags; the temporary 30-day settings backup after upgrade; export files are created only on request and stay where the user saves them; `activeTab` use. Covers all three browsers and their sync services (Chrome Sync; Firefox Sync, end-to-end encrypted by Firefox; Firefox for Android does not sync) |
| Change | `store/LISTING.md` | Chrome: updated description and features, `activeTab` justification (reads the current tab's address only when the user opens the popup, to offer quick-add), `alarms` justification adds snooze and schedules, data-use disclosures re-checked ("User activity" now also covers choices) |
| Add | `store/LISTING_FIREFOX.md`, `store/LISTING_EDGE.md` | AMO listing copy, category, `data_collection_permissions` rationale, and "source code submission not required — no minification or bundling". Edge Partner Center listing copy |
| Add | `knowledge/usage_guides/DEVELOPER_GUIDE.md`, `USER_GUIDE.md`, `DEVOPS_GUIDE.md`, `QA_GUIDE.md` | Required guides (none exist yet). DEVOPS covers build, CI, and releasing to three stores. QA holds the full manual check matrix from this plan |
| Change | `README.md` | Cross-browser install (Chrome, Edge, Firefox, Firefox for Android), new layout, `tools/build.mjs`, test count, and the supported-platform statement |
| Change | `knowledge/setup/SUBMISSION_STEPS.md`, `DISTRIBUTION.md` | `package.sh` → `build.mjs`; AMO and Edge steps |
| Change | `src/manifest.json` | `version: "2.0.0"` |
| Change | `CHANGELOG.md` | `[Unreleased]` entries promoted to `## [2.0.0] - <date>` with a compare link |
| Change | `.claude/CLAUDE.md` (project), if present | Updated commands (build, lint, audit) |

**Acceptance criteria:**

1. [unit] `parseImport(JSON.stringify(buildExport(c, …)))` round-trips `c`.
2. [unit] `parseImport` accepts envelopes holding v1, v2 and v3 configs and
   returns v3.
3. [unit] `parseImport` rejects non-JSON, a wrong `format`, `exportVersion: 2`,
   `schemaVersion: 4`, oversize input, duplicate patterns, and an invalid field.
   Each error message contains the field path.
4. [unit] `buildExport` output contains no `stats`, `lifecycle` or `bypasses`
   key at any depth.
5. [unit] `manifest.test.js` asserts `version` is `2.0.0` and that the declared
   permissions are exactly `declarativeNetRequest, storage, alarms, activeTab`
   (a permission added later must update this test and the privacy docs
   together).
6. [cmd] CI is green: unit tests, both builds, and web-ext lint.
7. [doc] Every new or changed `.md` starts with a clickable TOC and a summary
   section, and `knowledge/usage_guides/` contains the four guides.
8. [doc] The privacy policy and the three listings mention every key in the
   [local data layout](#local-and-session-data-layout) and every permission in
   the manifest. Review against this checklist before submitting.

**Manual checks:**

- M1 Export in Chrome, import in Firefox: same sites, settings and theme; one
  "Grant all" prompt activates them.
- M2 Import a file edited to an invalid `bypassMinutes`: it is refused with a
  message naming `defaults.bypassMinutes`, and current settings are unchanged.
- M3 Screenshots regenerated and committed. Listings for the three stores are
  ready to paste.

---

## Implementation order and file ownership

Each phase ends with a commit series on `v2-competitive-upgrade`, green tests,
and a CHANGELOG update. A file is **owned** by one phase at a time. Later phases
may extend it but must not restructure it.

| Phase | Goal | Owns (creates or restructures) | Extends only |
|---|---|---|---|
| 1 | **G1** Reach | `src/manifest.json` (background and gecko keys), `tools/build.mjs`, `tools/manifest_targets.mjs`, `tools/mobile_audit.mjs`, `src/shared/{source_url,platform,messaging}.js`, `src/shared/{tokens,base}.css`, page CSS layouts, `tests/unit/{build_manifest,source_url,platform}.test.js`, `manifest.test.js` | `blocked.js` (source URL only) |
| 2 | **G5-A** Foundation | `src/background/{settings_schema,config_migration,sync_layout,rule_sync,message_handlers}.js`, `config.js`, `service_worker.js` split, `rules.js` (resolver swap), `.github/workflows/ci.yml`, config tests | `src/options/options.js` (shape change only), `src/constants.js` |
| 3 | **G2** Pause | `src/background/{pause,continue_gate}.js`, `src/blocked/*` (restructure into views), `src/options/{settings_form,site_list}.js` (options split), `src/shared/theme.js`, token themes | `message_handlers.js`, `constants.js` |
| 4 | **G3** Progress | `src/background/{schedule,progress}.js`, `stats.js`, `stats_store.js`, `rules.js` (`RuleContext`), `src/options/schedule_editor.js`, `src/stats/*` | `rule_sync.js`, `message_handlers.js`, `blocked.js`, `settings_form.js` |
| 5 | **G4** UX | `src/popup/*`, `src/onboarding/*`, `src/background/{presets,rating,lifecycle_store}.js`, `tools/contrast.mjs`, design-system pass over all CSS, `tools/screenshots.mjs` | `manifest.json` (popup, `activeTab`), `service_worker.js` (install), `rule_sync.js` (snooze), every page (ARIA) |
| 6 | **G5-B** Release | `src/background/settings_io.js`, `src/options/data_panel.js`, `store/*`, `knowledge/usage_guides/*`, README, setup docs, version | `CHANGELOG.md` |

**Why this order.** G1 first, because the build, lint and phone-width
constraints shape every later file, and a Firefox incompatibility found late
would be expensive. G5-A second, because the schema is the contract G2–G4 code
against, and CI then guards each later phase. G2 before G3, because G3's
interstitial changes (limit message, outcome on click) slot into the view
structure G2 creates. G4 after G2 and G3, because onboarding sets pause style and
the popup shows streaks. G5-B last, because docs and listings describe the
finished product.

**Parallelism.** Within a phase, pure modules and their tests can be built in
parallel with the UI. Across phases, `schedule.js` and `progress.js` (G3) and
`presets.js` and `rating.js` (G4) are pure and depend only on constants and the
schema, so they can start any time after phase 2.

**Line budgets to watch.** `options.js` (422 today) is split in phase 3;
`service_worker.js` (352) in phase 2; `blocked.js` stays a thin controller.
No file may exceed about 500 lines.

---

## Out of scope

- **Native mobile apps** (iOS, Android). one sec's mobile lead is real, but a
  native app is a different product with a different stack.
- **Safari (macOS and iOS).** It needs an Apple Developer Program membership and
  an Xcode app wrapper. Revisit after 2.0 traction.
- **Chrome for Android and iOS browsers.** They do not run extensions, so there is
  nothing to ship. Edge for Android's extension support is not targeted.
- **Chromium derivatives** (Brave, Opera, Vivaldi). They install the Chrome Web
  Store build. Not separately packaged or tested.
- **Cloud sync, accounts, servers, analytics, telemetry, remote config.** The
  browser's own `storage.sync` remains the only sync. This is a product
  decision, not a deferral.
- **A paid tier or license checks.**
- **Hard-lock or "strict" modes** beyond the opt-in daily allowance. Settings
  remain the escape hatch by design, and the listing says Steer Clear is a
  nudge, not a wall.
- **Content scripts, in-page timers, or time-spent tracking on sites.** That would
  need page access the privacy stance rules out.
- **Path- or URL-level blocking** (only whole domains and subdomains).
- **Storing typed intentions** or any free text typed on the pause page.
- **Localization.** English only for 2.0; strings are kept out of logic so i18n
  can follow.
- **Merge-mode import** (2.0 import replaces).
- **A "What's new" page on update.**

---

## Target version and SemVer reasoning

**2.0.0.** Most of the release is additive (MINOR-worthy), but one change is
incompatible: the synced storage format. After upgrading, settings are stored as
schema v3 across several sync items. Any 1.x install on another machine with the
same sync profile refuses to read them ("update the extension"). The release
also changes the toolbar button from the stats page to a popup and replaces
first-run behavior. A public, persisted-data format that older versions cannot
read is a breaking change, so the MAJOR version increments. The same version
ships to all three stores.

---

## Open questions to settle during implementation

1. **AMO data-collection category.** The plan declares
   `data_collection_permissions: { required: ["none"] }`, because nothing is
   transmitted by the extension. Mozilla defines transmission as data handled
   "outside the add-on or the local browser". `storage.sync` through Firefox
   Sync (end-to-end encrypted and controlled by the user) is the browser's own
   transport, not the developer's. Confirm with AMO policy before the first
   Firefox submission. If AMO disagrees, declare the category it requires and
   update the privacy policy. Do not drop sync silently.
2. **Gecko id.** `steer-clear@eladlaor` is permanent once published to AMO.
   Confirm before the first upload.
3. **AMO slug and Edge listing id.** These fill `STORE_REVIEW_URL.firefox` and
   `STORE_REVIEW_URL.edge`. Until then the rating prompt stays off in those
   browsers by design.
4. **Firefox for Android popup.** Popups open as a full page there, and
   `tabs.query({ active: true, currentWindow: true })` may return the popup's own
   tab. If M3 of G4 fails on Android, quick-add is hidden on Android, decided by
   `detectBrowser` plus `runtime.getPlatformInfo().os === 'android'`, and
   documented. This is a defined behavior, not a fallback.
5. **`web-ext` version pin.** Pin the exact current release in CI at
   implementation time and record it in `DEVOPS_GUIDE.md`.
