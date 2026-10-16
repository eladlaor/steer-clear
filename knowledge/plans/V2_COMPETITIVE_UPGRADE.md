# Steer Clear 2.0 — Competitive Upgrade Plan

## Table of Contents

- [Summary](#summary)
- [Why these five goals](#why-these-five-goals)
- [Release plan: 1.0.0 on Edge, 1.1.0, then 2.0.0](#release-plan-100-on-edge-110-then-200)
- [Verified platform facts and minimum versions](#verified-platform-facts-and-minimum-versions)
- [Architecture decisions](#architecture-decisions)
- [Config schema v3 (the shared contract)](#config-schema-v3-the-shared-contract)
  - [In-memory shape](#in-memory-shape)
  - [Storage layout in storage.sync](#storage-layout-in-storagesync)
  - [Reading and writing](#reading-and-writing)
  - [SiteSettings fields](#sitesettings-fields)
  - [Schedule type](#schedule-type)
  - [Resolution rules](#resolution-rules)
  - [Validation rules](#validation-rules)
  - [Migration v1/v2 to v3](#migration-v1v2-to-v3)
  - [Export envelope](#export-envelope)
- [Local and session data layout](#local-and-session-data-layout)
- [Messages between surfaces and the service worker](#messages-between-surfaces-and-the-service-worker)
- [New constants](#new-constants)
- [G1 — Reach: Firefox, Firefox for Android, Edge, phone-width UI, CI](#g1--reach-firefox-firefox-for-android-edge-phone-width-ui-ci)
- [G2 — Pause screens that resist habituation, and bypasses that end](#g2--pause-screens-that-resist-habituation-and-bypasses-that-end)
- [G3 — Schedules, daily allowance, outcomes and progress](#g3--schedules-daily-allowance-outcomes-and-progress)
- [G4 — Onboarding, toolbar popup, accessibility, rating prompt](#g4--onboarding-toolbar-popup-accessibility-rating-prompt)
- [G5 — Trust, portability, release engineering and store presence](#g5--trust-portability-release-engineering-and-store-presence)
- [Implementation order and file ownership](#implementation-order-and-file-ownership)
- [Out of scope](#out-of-scope)
- [Target versions and SemVer reasoning](#target-versions-and-semver-reasoning)
- [Open questions to settle during implementation](#open-questions-to-settle-during-implementation)
- [Rejected critique points](#rejected-critique-points)

---

## Summary

Steer Clear 2.0 closes the gaps the competitive landscape identified against
one sec, Intention and LeechBlock NG, and keeps the privacy stance intact: no
accounts, no servers, no analytics, no remote code, local-only data, and host
access requested one site at a time.

**Revision 2 (2026-10-16)** applies the plan review: bypasses now end visibly on
single-page sites, first install never writes, the storage change is
non-breaking and rollback-safe, every config write goes through the worker, the
pause page never traps the user, the sync quota is measured in bytes,
presentation varies by default, the daily allowance adds friction instead of a
wall, settings are simplified, and the release is split so a 1.1.0 ships before
the schema rewrite. Points not accepted are listed in
[Rejected critique points](#rejected-critique-points).

**What gets built, in release order:**

1. **Now — 1.0.0 on Edge.** The existing 1.0.0 zip is listed on Edge Add-ons.
   No code changes.
2. **1.1.0 — reach and the first habituation fix (no schema change).**
   - **G1** Chrome, Edge, Firefox desktop and Firefox for Android from one
     source tree, a dependency-free Node build, `web-ext lint`, phone-width
     pages, and CI.
   - **Fixes:** first install never writes to sync; the pause page and its
     continue button work even when settings cannot be read.
   - **G2 (part):** the pause page varies its presentation by default and
     explains why once; the toolbar badge shows the bypass minutes left.
   - **G3 (part):** outcome tracking with one event per pause-page view.
   - **G4 (part):** the rating prompt on the stats page (the 1.x toolbar page).
3. **2.0.0 — the rest.**
   - **G5-A Foundation:** config schema v3 under new keys, with the legacy
     `config` item left untouched, and the worker as the only config writer.
   - **G2:** pause styles (your reason, breathing, intention, rotate), several
     reasons per site, one pause-length setting, bypass length, and an opt-in
     "bring the pause back when my time is up".
   - **G3:** per-site schedules, an opt-in daily allowance that adds a longer
     wait, and progress on the stats page.
   - **G4:** a two-step onboarding, a real toolbar popup (quick-add, today,
     snooze), and accessibility and design-system work.
   - **G5-B:** export and import, privacy policy, store listings and store
     presence work, and usage guides.

**The contract.** Every goal implements against the
[config schema v3](#config-schema-v3-the-shared-contract), the
[local data layout](#local-and-session-data-layout) and the
[message table](#messages-between-surfaces-and-the-service-worker). A goal that
needs a field not listed here amends this plan first, then the code.

**Definition of done for every goal:** its unit tests are written first and
pass (`node --test tests/unit/*.js`), CI is green, the manual checks listed for
the goal pass in the named browsers, `CHANGELOG.md` has entries under
`[Unreleased]`, and no file exceeds about 500 lines.

---

## Why these five goals

Each goal maps to a gap in
`knowledge/market_research/STEER_CLEAR_COMPETITIVE_LANDSCAPE.md`:

| Gap in the report | Goal that addresses it |
|---|---|
| Platform reach is Chrome only; Edge port is nearly free, Firefox suits a local-only open-source tool | G1, Edge listing now |
| Habituation threatens the core mechanic: a pause page that never changes stops being read | G2: presentation varies **by default**, explained once on the pause page; optional styles and rotating reasons |
| Intention's timed unlock ends the session; Steer Clear's bypass never ends on single-page sites | G2: badge countdown, opt-in return of the pause |
| Intervention variety and goals are thinner (breathing, budgets, streaks at competitors) | G2, G3 |
| Social proof is the largest gap (zero ratings); onboarding should reach the first saved moment fast | G4 (two-step onboarding, rating prompt on popup and stats page), G5-B (Featured nomination, promo assets) |
| Easy bypass may become the default path | G2 pause length, G3 daily allowance as extra friction (both opt-in; never a wall) |
| Simplicity is the edge over LeechBlock | Settings cut back: no theme, no typed phrase, one timing control, few per-site overrides |
| Trust is the second-line selling point | G5 (export, CI, accurate disclosures, exact comparison wording), and a hard rule: no goal weakens privacy |

---

## Release plan: 1.0.0 on Edge, 1.1.0, then 2.0.0

Ratings accumulate slowly and Intention has not shipped since March 2025, so
reach and the default habituation fix ship before the schema rewrite.

| Release | Contents | Gate |
|---|---|---|
| 1.0.0 on Edge | Upload the existing `steer-clear-1.0.0.zip` to Edge Partner Center with the Chrome listing copy and privacy policy URL | Edge M2 check of G1 against the 1.0.0 zip |
| **1.1.0** (all stores) | G1 in full; install fix; worker split (from G5-A) and degraded-safe continue; G2 presentation variation, variation notice and badge countdown; G3 outcome tracking and view deduplication; G4 rating prompt on the stats page; privacy policy and AMO listing for these | All `[1.1]` acceptance criteria and manual checks below; CI green |
| **2.0.0** (all stores) | Everything else in G2–G5 | All remaining criteria; CI green |

Criteria tagged **[1.1]** below ship in 1.1.0. Untagged criteria ship in 2.0.0.
1.1.0 keeps storage schema v2 unchanged; it adds only `storage.local` and
`storage.session` keys, which 1.0.0 ignores, so a store rollback is safe.

---

## Verified platform facts and minimum versions

Checked on 2026-10-16 against MDN browser-compat-data (`mdn/browser-compat-data`
main branch), MDN reference pages, Chrome for Developers, and Mozilla's
Extension Workshop and add-ons blog. The plan review re-checked the rows marked
with † against MDN's compatibility data and found them correct.

| Claim the plan relies on | Verified | Minimum version |
|---|---|---|
| † `declarativeNetRequest` with `Redirect`, `regexFilter`, `isRegexSupported` in Firefox | Yes (BCD) | Firefox 113, Firefox for Android 113 |
| `regexSubstitution` supports `\0` for the whole match | Yes (MDN Redirect page; Chrome DNR reference) | Same as above |
| Regex rule cap is 1000 | Yes (Chrome DNR reference); Firefox exposes `MAX_NUMBER_OF_REGEX_RULES` | — |
| Redirect needs host permission for the request URL; navigations are exempt from the initiator check | Yes (MDN DNR page) | — |
| Redirect rules match only network requests; same-document (history API) navigations in single-page sites never hit them | Yes (DNR matches requests, not history changes) | — |
| Redirect target must be listed in `web_accessible_resources` | Yes (MDN Redirect `extensionPath`; Chrome DNR reference) | — |
| `background.service_worker` unsupported in Firefox | Yes (BCD: `false`) | — |
| † Both `background.scripts` and `background.service_worker` in one manifest | Chrome ignores `scripts` from 121 (rejected the manifest before 121). Firefox uses `scripts` and, from 121, starts the background page even when `service_worker` is present | Chrome 121, Firefox 121 |
| `background.type: "module"` | Yes | Chrome 92, Firefox 112 |
| † `optional_host_permissions` (MV3) | Yes, Android mirrors desktop | Chrome 102, Firefox 128 |
| † `permissions.request()` | Yes | Firefox 55 desktop, **Firefox for Android 120** |
| `tabs.query({ url })` returns matching tabs and their `url` with host permission for those URLs, without the `tabs` permission | Yes (Chrome `tabs` reference; MDN `tabs.query`) | — |
| `action.setBadgeText({ tabId, text })` per tab | Yes, desktop. Firefox for Android shows no toolbar badge | Chrome 88, Firefox 109 |
| `storage.session` | Yes, Android mirrors desktop | Chrome 102, Firefox 115 |
| † `storage.sync` on Firefox for Android | Partial: works locally, does not sync, quotas not enforced | Android 53 |
| `storage.sync` quotas | 102,400 bytes total, **8,192 bytes per item** (key plus JSON value, in bytes), 512 items, 120 writes/min (Chrome reference; Firefox desktop enforces from 79) | — |
| † `options_page` in Firefox | Yes | Firefox 126 |
| `action.default_popup` | Yes | Chrome 88, Firefox 109 |
| `activeTab` | Yes; no install warning | Firefox 48 |
| `chrome.*` namespace returns promises in Firefox MV3 | Yes ("In Manifest V3, Firefox supports promises ... in the `chrome.*` namespace", Extension Workshop MV3 migration guide) | Firefox 109 (MV3 GA) |
| `browser_specific_settings.gecko.data_collection_permissions` | Yes. Required by AMO for **new** extensions since 2025-11-03; `{"required": ["none"]}` declares no collection | Firefox 140, Firefox for Android 142 |
| `gecko_android.strict_min_version` | Yes | Firefox for Android 113 |
| Chrome for Android and iOS browsers run extensions | No — out of scope | — |

Sources: [MDN background key](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background),
[mdn/browser-compat-data](https://github.com/mdn/browser-compat-data),
[Firefox data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

**Minimum versions this release declares:**

| Browser | Key | Value | Why this floor |
|---|---|---|---|
| Chrome | `minimum_chrome_version` | `"121"` | Lowest version that accepts the cross-browser `background` block when loading `src/` unpacked |
| Edge | (same package) | 121 | Chromium 121 |
| Firefox desktop | `browser_specific_settings.gecko.strict_min_version` | `"140.0"` | `data_collection_permissions` support (140) covers every other floor (DNR 113, session 115, optional host permissions 128) and matches ESR 140 |
| Firefox for Android | `browser_specific_settings.gecko_android.strict_min_version` | `"142.0"` | `data_collection_permissions` on Android (142); `permissions.request` needs 120 |

**Three facts that shape code, not just manifests:**

- **The permission prompt must come before any `await`, and nothing may depend
  on code after it.** Firefox loses the user gesture at the first `await`. The
  plan review also reports that Firefox closes a toolbar popup when a permission
  prompt opens (Bugzilla [1382953](https://bugzil.la/1382953) and
  [2026687](https://bugzilla.mozilla.org/show_bug.cgi?id=2026687)), so code after
  `await permissions.request` in a popup may never run. Whether Chrome does the
  same was not confirmed. Every call site therefore uses one pattern:
  **send the worker message without awaiting it, then call
  `permissions.request` in the same synchronous tick.** The site is stored as
  "needs access", and the existing `permissions.onAdded` rebuild activates it
  when access is granted. This applies to popup quick-add, onboarding, settings
  add, and import's "Grant all".
- **Whether `\0` is percent-encoded when it is substituted into the query is not
  documented by either browser.** If it is not encoded, a source URL containing
  `&` or `#` is truncated by `URLSearchParams.get`. G1 replaces that read with
  a pure `extractSourceUrl(href)` that takes everything after `?from=` and
  decodes only when the value is encoded. This works for both behaviors.
- **A bypass that only lifts a rule never ends on a single-page site.** Reddit,
  YouTube, X, Facebook and Instagram change pages without a full load, so a
  reinstated rule is never hit while the tab stays open. G2 makes the end of a
  bypass visible (badge) and, opt-in, enforced (`tabs.update`).

---

## Architecture decisions

**The service worker stays the sole owner of dynamic rules, and becomes the sole
writer of the config.** In Firefox the same file runs as an event page
(`background.scripts`). Rules remain derivable from storage plus session state
plus the clock, so a full rebuild is always safe. New rule inputs (snooze,
schedule) are added to a single `RuleContext`. Pages read the config directly
(reading has no side effects) but change it only by sending small messages
(`ADD_SITES`, `UPDATE_SITE`, `REMOVE_SITE`, `UPDATE_DEFAULTS`,
`IMPORT_SETTINGS`). The worker runs every mutation through one promise queue, so
each one reads, applies and writes without interleaving. Pages re-render on
`storage.onChanged`. This removes the stale-copy overwrite where an open
settings tab erased a site quick-added from the popup.

**The pause page never traps the user.** Continue must work with only the host.
If the config cannot be resolved (a corrupt item, a newer schema from another
device), `GET_RESOLVED_SITE` still answers with the host and default settings
plus `degraded: true`, and `GRANT_BYPASS` lifts the installed rules that match
the URL directly. Both log a `[steer-clear]` error, and the settings page shows
the config error. This is a deliberate, loud safety path for the one action the
product promises always works ("you're never locked out"), not a silent
fallback.

**Sites move out of the `config` sync item, under new keys.** Chrome and Firefox
reject any `storage.sync` item over 8,192 bytes. One v2 site entry is about 250
bytes of JSON; with v3 overrides and several reasons it reaches 400–3,000. A
single item fails at roughly 20 sites. v3 stores global settings in `settings`
and each site in its own `site:<id>` item that carries its own `order`. The
legacy v2 `config` item is **never written or deleted** by 2.0: it stays as a
read-only copy, so 1.x devices keep working and a store rollback to 1.x finds
its settings intact.

**Write only what changed; delete only what the user removed.** Each mutation
writes the items it changed and removes only the `site:<id>` the user removed.
Nothing sweeps "stray" items, so out-of-order sync delivery can never cause a
deletion.

**Never write on install.** `readConfig` returns defaults or the migrated legacy
config in memory and never writes. Storage is written only on a user action.
On a second device, sync can install the extension before synced data arrives;
a write on install would be the newer write and could replace the user's
settings everywhere.

**Per-site settings are an `overrides` object.** In v3 a key that is absent from
`site.overrides` inherits; a present key wins, whatever its value. One field
table, one validator per field, one generic resolver. Only a few fields are
per-site (reasons, destination, style, schedule, plus the two v1.0 per-site
fields); everything else is global.

**Derive, do not count.** Daily continues, steer rate, steered-clear days and
the rating threshold are computed from the outcome-tagged event log. The cost:
these numbers reset when the user erases statistics, which is the behavior an
erase button should have.

**Friction, never a wall.** The daily allowance lengthens the wait before
continue; it never removes the button. Waits are UI-enforced; the worker cannot
observe a wait, which is acceptable for a nudge tool.

**No shim library.** Firefox MV3 returns promises from `chrome.*`, so the code
keeps the `chrome` namespace. The only platform-specific logic is browser
detection for the store link, in a pure module.

**Build by derivation.** `src/manifest.json` is the single cross-browser
manifest and loads unpacked in both Chrome and Firefox. The build derives a
stripped manifest per target. The derivation is a pure function with unit tests.

---

## Config schema v3 (the shared contract)

### In-memory shape

What `readConfig()` returns:

```js
{
  schemaVersion: 3,
  defaults: SiteSettings,   // global settings; every field required
  sites: Site[],            // sorted by (order, id)
}
```

`Site`:

| Field | Type | Default on create | Notes |
|---|---|---|---|
| `id` | string | `crypto.randomUUID()` (worker only) | Stable; carried through migration and import. Legacy sites without an id get a derived id (see migration) |
| `pattern` | string | normalized host | `normalizePattern` output for new sites; legacy values kept as stored |
| `displayName` | string \| null | `null` | `null` = show the host |
| `includeSubdomains` | boolean | `true` | |
| `enabled` | boolean | `true` | |
| `addedAt` | number \| null | `Date.now()` | Epoch ms; `null` for migrated sites |
| `order` | number | `max(order) + 1`, or `0` | Display order. Ties (two devices adding at once) sort by `id` |
| `overrides` | `Partial<SiteSettings>` (per-site fields only) | `{}` | Absent key = inherit from `defaults` |

### Storage layout in storage.sync

| Key | Value | Written by 2.0 | Notes |
|---|---|---|---|
| `schema` | `3` | Once, on the first 2.0 write of any kind | Marker that sites live in `site:*` items. Same value on every device, so sync conflicts on it are harmless. A value above 3 means a newer version wrote here |
| `settings` | `{ defaults: SiteSettings }` | `UPDATE_DEFAULTS`, `IMPORT_SETTINGS` only | Absent until the user first changes a global setting |
| `site:<id>` | `Site` | `ADD_SITES`, `UPDATE_SITE`, `REMOVE_SITE` (removes), `IMPORT_SETTINGS`, and once at materialization | One item per site |
| `config` | v1/v2 config | **Never** (read-only legacy copy) | 1.x devices keep reading and writing it |

### Reading and writing

**Reading** — pure `assembleConfig(items)` in `src/background/sync_layout.js`,
given every sync item (`storage.sync.get(null)`):

1. `items.schema > 3` → throw "settings were saved by a newer version; update
   the extension".
2. `defaults` = `items.settings.defaults` if present; else migrated from the
   legacy `config` if present; else `defaultSettings()`.
3. **v3 sites mode** is on when `items.schema === 3` or any `site:*` key exists.
   Then `sites` = every `site:*` item, sorted by `(order, id)`. A site item that
   fails validation is skipped and reported in `invalidSites` (logged at error
   level and shown in settings), so one bad item never hides the others.
4. Otherwise `sites` = migrated from the legacy `config` if present, else `[]`.
5. It never throws for a partially delivered sync: there is no order list that
   can point at a missing item. A site item that has not arrived yet is simply
   absent until its `onChanged` rebuild.

**Writing** — every mutation goes through the worker:

- A pure planner per mutation (`planAddSites`, `planUpdateSite`,
  `planRemoveSite`, `planUpdateDefaults`, `planImport` in
  `src/background/config_mutations.js`) takes the current items and the request
  and returns `{ set: {key: value}, remove: [key] }`.
- **Materialization.** If v3 sites mode is off, the first mutation also writes
  `schema: 3` and every legacy-migrated site as a `site:<id>` item (the user's
  own data, with ids identical on every device). It does **not** write
  `settings`; legacy global values keep being read from `config` until the user
  changes a global setting. This keeps an empty default from ever overwriting
  real synced settings.
- `remove` only ever contains the key of a site the user removed (or, for an
  import the user confirmed, the sites it replaces).
- `assertSyncQuota(set, currentItems)` measures each item as
  `new TextEncoder().encode(key + JSON.stringify(value)).length`, checks each
  written item ≤ 8,192 bytes, the resulting total ≤ 102,400 bytes and the item
  count ≤ 512. A violation throws a descriptive error naming the key and its byte
  size, and nothing is written.
- The worker then makes one `storage.sync.set(set)` call and, if needed, one
  `storage.sync.remove(remove)` call.
- The worker's `storage.onChanged` listener rebuilds on a change to `schema`,
  `settings`, `config` or any `site:*` key in the `sync` area.

### SiteSettings fields

Every field below is required in `defaults`. Only fields marked **per-site** may
appear in `site.overrides`.

| Field | Type / allowed values | Default | Per-site | Goal | Notes |
|---|---|---|---|---|---|
| `target` | non-empty string | `DEFAULT_TARGET` (Wikipedia random) | yes | existing | URL format is checked in the UI, not the validator, because v2 accepted any non-empty string |
| `targetName` | string | `''` | yes | existing | `''` = show the target's hostname |
| `reasons` | string[]; 0–`MAX_REASONS_PER_SITE` (5) items; each a string that is non-empty after trimming; **no length limit in the validator** | `[]` | yes | G2 | Replaces `note`. New reasons are limited to `REASON_INPUT_MAX_CHARS` (280) by the inputs only |
| `pauseStyle` | `'reason' \| 'breathing' \| 'intention' \| 'rotate'` | `'reason'` | yes | G2 | `rotate` cycles reason → breathing → intention |
| `schedule` | `Schedule` | `ALWAYS_SCHEDULE` | yes | G3 | Outside the schedule the site loads normally |
| `autoContinue` | boolean | `false` | yes (legacy) | existing | Per-site because 1.0 offered it; shown under the site's collapsed "Advanced". Ignored for the intention style |
| `countdownSeconds` | integer 1–60 | `3` | yes (legacy) | existing | Seconds before auto-continue steers to the destination. Shown only when auto-continue is on |
| `pauseSeconds` | integer 0–60 | `0` | no | G2 | The one pause-length control: continue unlocks after this many seconds. The breathing style paces `max(1, ceil(pauseSeconds / 10))` breaths, so its default is one 10 s breath |
| `bypassMinutes` | one of `1, 5, 15, 30` | `5` | no | G2 | Replaces `BYPASS_DURATION_MS` |
| `returnPauseOnExpiry` | boolean | `false` | no | G2 | "When my time is up: bring the pause back" |
| `varyPresentation` | boolean | `true` | no | G2 | Layout, accent colour and prompt wording change on each interception |
| `dailyContinueLimit` | integer 1–50, or `null` | `null` | no | G3 | Opens per site per day before the longer wait applies. `null` = no limit |

Site-only fields: `pattern`, `displayName`, `includeSubdomains`, `enabled`,
`addedAt`, `order`. There is no theme setting: every page follows the system
colour scheme, as 1.0 does.

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

`resolveSettings(defaults, site)` in `src/background/settings_schema.js`, and
`presentSite(resolved, site, n, context)` in `src/background/pause.js`:

1. Start from `{ ...defaults }` and apply each key present in `site.overrides`.
2. **Target name follows its target.** If the site overrides `target` but not
   `targetName`, the resolved `targetName` is `''`. This fixes a v2 bug where a
   per-site target showed the global destination's name.
3. **The worker owns the display fallback.** `presentSite` turns `targetName: ''`
   into the target's hostname (`hostnameOf`), or `DESTINATION_FALLBACK_LABEL`
   when unparseable, exactly as the v2 resolver did. The pause page displays
   what it receives and has no fallback of its own.
4. `n` is the site's lifetime interception count before this one
   (`stats.totals[host] ?? 0`).
5. `pauseStyle: 'rotate'` resolves to `PAUSE_ROTATION[n % 3]`
   (`['reason', 'breathing', 'intention']`).
6. **Reason choice is independent of the style.** The reason shown is
   `reasons[k % reasons.length]`, where `k = floor(n / 3)` when the configured
   style is `rotate` and `k = n` otherwise. Every reason therefore appears in
   every style. No new state is stored.
7. **Every style shows the user's reason** when one exists: above the breathing
   circle and above the intention input, as well as on the reason screen.
8. `varyPresentation: true` picks `presentationVariant(n)` →
   `{ layout, palette, prompt }`, with
   `layout = n % PRESENTATION_LAYOUTS.length`,
   `palette = n % PRESENTATION_PALETTES.length` and
   `prompt = n % PAUSE_PROMPTS.length`. Each list has at least two entries, so
   consecutive interceptions always differ in all three. No step is added.
9. If the concrete style is `intention`, `autoContinue` is forced to `false`.
10. If the concrete style is `breathing` and `autoContinue` is on, the countdown
    starts after the last breath.
11. `effectivePauseSeconds = max(pauseSeconds, OVER_LIMIT_PAUSE_SECONDS)` when
    `dailyContinueLimit` is set and `continuesToday >= dailyContinueLimit`;
    otherwise `pauseSeconds`.

### Validation rules

- `validateSettings(obj, { partial })` validates each present field with its
  field validator. `partial: false` (defaults) requires every field.
  `partial: true` (overrides) rejects unknown keys and global-only keys.
- **No new constraint on any value v2 accepted.** `target` stays "non-empty
  string", `displayName` keeps no length limit, `countdownSeconds` keeps 1–60,
  reasons have no validator length limit, and **duplicate patterns are
  allowed** (v2 allowed them; two devices adding the same site at once also
  produce them). New input limits are UI-level only. This guarantees every
  valid v2 config migrates to a valid v3 config.
- Duplicate handling: `ADD_SITES` skips hosts already listed and reports them;
  `findMatchingSite` uses the first match in display order; the settings page
  marks duplicates and offers to remove one.
- `sites.length ≤ MAX_SITES` (200). The sync quota is the binding limit in
  practice, and `assertSyncQuota` reports it. A legacy site item too large for
  the per-item quota still reads; only a write of it fails, with an error naming
  the site and asking the user to shorten its reason.

### Migration v1/v2 to v3

`migrateLegacyConfig(stored)` in `src/background/config_migration.js` is a pure
chain of steps (`v1 → v2 → v3`) that runs **in memory on every read** while the
legacy `config` is the source. It is idempotent and total over every value v2's
`validateConfig` accepted, and returns `{ defaults, sites }`. The existing v1→v2
step, including the `'somewhere better'` placeholder cleanup, is kept unchanged
as the first step. It does not call `crypto` or the clock.

**v2 → v3 mapping:**

| v2 field | v3 location | Rule |
|---|---|---|
| `globalTarget` | `defaults.target` | Copied |
| `globalTargetName` | `defaults.targetName` | Copied |
| `globalNote` | `defaults.reasons` | `[note.trim()]` if non-blank, else `[]`. Any length |
| `globalAutoContinue` | `defaults.autoContinue` | Copied |
| `globalCountdownSeconds` | `defaults.countdownSeconds` | Copied |
| — | `defaults.*` (new fields) | Filled from the defaults table |
| `sites[i].id/pattern/displayName/includeSubdomains/enabled` | same names | Copied |
| — | `sites[i].addedAt` | `null` |
| — | `sites[i].order` | `i` |
| `sites[i].target` (non-null, non-blank) | `overrides.target` | Copied. Blank or null means no key, matching v2's "blank inherits" |
| `sites[i].note` (non-null, non-blank) | `overrides.reasons` | `[note.trim()]`. Any length |
| `sites[i].autoContinue` (non-null) | `overrides.autoContinue` | Copied |
| `sites[i].countdownSeconds` (non-null) | `overrides.countdownSeconds` | Copied |
| site missing `id` (hand-edited v1) | `id` | `legacyId(i, pattern)` = `` `v1-${i}-${pattern.trim().toLowerCase()}` ``: deterministic, so two devices derive the same id and the same `site:<id>` key |

**Data-safety rules:**

- **The legacy item is never modified.** No backup is needed: the source stays
  where it was. A store rollback to 1.x reads it unchanged.
- **After materialization, 2.0 ignores legacy sites.** A 1.x device that has not
  updated can keep editing `config`. Those edits keep reaching other 1.x devices
  but not 2.0 devices, and 2.0 edits do not reach 1.x devices. 2.0 never
  re-migrates over v3 data, because v3 sites mode is decided by the presence of
  `schema` or `site:*` keys, not by `config`. Legacy **global** values are still
  read from `config` until the user changes a global setting on 2.0. The user
  guide and release notes say "update the extension on every device".
- **A newer schema is refused** (`schema > 3`), and the pause page keeps working
  in degraded mode.
- **Behavioral equivalence test:** for every v1/v2 fixture, the v2 resolver and
  the v3 pipeline (`resolveSettings` then `presentSite`) produce equal `target`,
  `autoContinue`, `countdownSeconds` and displayed `targetName`, and v2 `note`
  (trimmed) equals v3's shown reason (`''` when none). The only allowed
  difference is resolution rule 2, which has its own test.

### Export envelope

```js
{
  format: 'steer-clear-settings',   // EXPORT_FORMAT
  exportVersion: 1,                 // EXPORT_VERSION
  exportedAt: '2026-10-16T09:00:00.000Z',
  extensionVersion: '2.0.0',
  config: { schemaVersion, defaults, sites }   // in-memory shape
}
```

- Import accepts an envelope whose `config` is schema 1, 2 or 3, runs it through
  `migrateLegacyConfig` when needed, and validates it.
- It rejects a wrong `format`, an `exportVersion` above 1, a `schemaVersion`
  above 3, files over `MAX_IMPORT_BYTES` (256 KB), and quota overflow. Each
  rejection gives a message naming the field path. Duplicate patterns are
  reported in the preview, not rejected.
- Import **replaces** the current settings after an explicit confirmation that
  states the site counts before and after. There is no merge mode.
- Statistics and lifecycle flags are never exported. They describe one device's
  history.

---

## Local and session data layout

| Area | Key | Shape | Written by | Retention |
|---|---|---|---|---|
| `local` | `stats` | see below | worker | Events: 90 days (`STATS_RETENTION_DAYS`), pruned on write and by the daily alarm. `totals`: until erased. Erased in one click on the stats page |
| `local` | `lifecycle` | `{ onboardingCompletedAt: number\|null, variationNoticeSeenAt: number\|null, ratingPrompt: { state: 'pending'\|'rated'\|'dismissed'\|'expired', shownCount: number, resolvedAt: number\|null } }` | worker (`RECORD_LIFECYCLE_EVENT`) | Until uninstall. Not erased with stats |
| `session` | `bypasses` | `{ [host]: expiresAtMs }` | worker | Unchanged: dies with the browser |
| `session` | `badgedTabs` | `{ [host]: tabId[] }` | worker | Tabs showing a bypass badge, so expiry can clear them. Dies with the browser |
| `session` | `liftedRules` | `{ [host]: Rule[] }` | worker | Rules removed by a degraded bypass, re-added on expiry if a rebuild still fails |
| `session` | `snooze` | `{ until: number }` | worker | Dies with the browser; cleared by alarm or "Resume now" |

No URL, page title or typed text is stored in any of these. The opt-in return
of the pause reads the tab's current URL at expiry and passes it only in the
pause page's address.

**`stats` shape** (additive; `normalizeStats(raw)` fills missing fields, so no
stored-stats migration is needed; ships in 1.1):

```js
{
  totals: { [host]: number },        // unchanged
  events: [{
    id?: string,                     // new: the pause page's view id; absent on pre-1.1 events
    host: string,
    at: number,
    outcome?: 'left' | 'steered' | 'continued'   // new; absent on pre-1.1 events
  }],
  since: number | null,              // unchanged
  outcomesSince: number | null       // new; first event recorded with an outcome
}
```

- **One event per pause-page view.** The page reads `history.state.viewId`, or
  creates one with `crypto.randomUUID()` and stores it with
  `history.replaceState`, so a reload or session restore keeps the same id. It
  sends `RECORD_VIEW { viewId, fromUrl }` only once `document.visibilityState`
  is `visible` (a prerendered page waits for `visibilitychange`). The worker
  ignores a `viewId` it has already logged.
- **Repeat views merge.** If the host's latest event is younger than
  `VIEW_MERGE_WINDOW_MS` (60 s) and still `left`, `RECORD_VIEW` returns that
  event's id and logs nothing new. This covers retyping the URL.
- **Outcome lifecycle.** A view is logged as `left`. Clicking the alternative,
  or auto-continue reaching it, updates it to `steered`. Granting a bypass
  updates it to `continued`. Closing the tab needs no tracking.
- **Definitions.** "Steered clear" = `left` + `steered` (the user did not
  continue). `steerCount` (the rating threshold) = `steered` only, the active
  choice.
- Pre-1.1 events have no outcome. They count in totals and in the hour and
  weekday charts but not in outcome figures. The stats page says outcome
  tracking began on `outcomesSince`.
- Typed intentions are **never** stored or logged.

---

## Messages between surfaces and the service worker

| Type | Payload → response | Status |
|---|---|---|
| `GET_RESOLVED_SITE` | `{ fromUrl }` → `{ host, siteName, target, targetName (display), reason, pauseStyle (concrete), variant, pauseSeconds (effective), autoContinue, countdownSeconds, bypassMinutes, dailyContinueLimit, continuesToday, overLimit, showVariationNotice, matched, degraded }`. Side-effect free. Never rejects for a config failure: returns `degraded: true` with the host and defaults | Extended [1.1 for `variant`, `showVariationNotice`, `degraded`] |
| `RECORD_VIEW` | `{ viewId, fromUrl }` → `{ eventId }` | New [1.1] |
| `RECORD_OUTCOME` | `{ eventId, outcome: 'steered' }` → `{}` | New [1.1] |
| `GRANT_BYPASS` | `{ host, eventId? }` → `{ expiresAt }`. Never refused for the allowance. Works in degraded mode | Extended [1.1] |
| `RECORD_LIFECYCLE_EVENT` | `{ event: 'onboardingCompleted' \| 'variationNoticeSeen' \| 'ratingShown' \| 'ratingRated' \| 'ratingDismissed' }` → `{ lifecycle }` | New [1.1] |
| `ADD_SITES` | `{ entries: [{ host, reason? }] }` → `{ added: siteId[], skipped: host[] }` (popup sends one entry; onboarding sends its selection in one write) | New |
| `UPDATE_SITE` | `{ siteId, fields?, setOverrides?, clearOverrides?: string[] }` → `{}` | New |
| `REMOVE_SITE` | `{ siteId }` → `{}` | New |
| `UPDATE_DEFAULTS` | `{ patch }` → `{}` | New |
| `IMPORT_SETTINGS` | `{ config }` (already parsed and confirmed) → `{ siteCount }` | New |
| `SET_SNOOZE` | `{ minutes }` → `{ until }` | New |
| `CLEAR_SNOOZE` | `{}` → `{}` | New |
| `GET_STATUS` | `{}` → `{ snoozedUntil: number\|null, configError: string\|null }` | New |
| `GET_STATS`, `CLEAR_STATS`, `REBUILD_RULES` | unchanged | Kept |

- Recording views and outcomes is a side observation and follows
  `logInterception`: on failure it is logged and swallowed, and the pause page
  keeps working.
- Config mutations are fail-fast: an invalid request or a quota violation
  rejects with a descriptive error and writes nothing; the page shows it.

---

## New constants

All in `src/constants.js`. Enums are frozen objects, as existing code does.
Values are the contract; names may be refined in review.

- `SCHEMA_VERSION = 3`
- `StorageKey`: add `SETTINGS: 'settings'`, `SCHEMA_MARKER: 'schema'`,
  `SITE_PREFIX: 'site:'`, `SNOOZE: 'snooze'`, `LIFECYCLE: 'lifecycle'`,
  `BADGED_TABS: 'badgedTabs'`, `LIFTED_RULES: 'liftedRules'`; `CONFIG` stays as
  the legacy key
- `LEGACY_SITE_ID_PREFIX = 'v1-'`
- `PauseStyle { REASON, BREATHING, INTENTION, ROTATE }`, `PAUSE_ROTATION`
- `PRESENTATION_LAYOUTS`, `PRESENTATION_PALETTES`, `PAUSE_PROMPTS` (each at
  least two entries; palette names map to token sets checked by the contrast
  test; prompts are user-facing strings such as "You wrote this for yourself")
- `Outcome { LEFT, STEERED, CONTINUED }`
- `RatingState { PENDING, RATED, DISMISSED, EXPIRED }`
- `LifecycleEvent { ONBOARDING_COMPLETED, VARIATION_NOTICE_SEEN, RATING_SHOWN, RATING_RATED, RATING_DISMISSED }`
- `BrowserId { CHROME, EDGE, FIREFOX }`
- `MessageType`: add `RECORD_VIEW, RECORD_OUTCOME, RECORD_LIFECYCLE_EVENT,
  ADD_SITES, UPDATE_SITE, REMOVE_SITE, UPDATE_DEFAULTS, IMPORT_SETTINGS,
  SET_SNOOZE, CLEAR_SNOOZE, GET_STATUS`
- `BYPASS_MINUTES_OPTIONS = [1, 5, 15, 30]`, `DEFAULT_BYPASS_MINUTES = 5`
  (remove `BYPASS_DURATION_MS` in 2.0; 1.1 keeps it)
- `BYPASS_TICK_ALARM = 'bypass-tick'`, `BYPASS_TICK_MINUTES = 1`
- `MIN_PAUSE_SECONDS = 0`, `MAX_PAUSE_SECONDS = 60`, `DEFAULT_PAUSE_SECONDS = 0`,
  `OVER_LIMIT_PAUSE_SECONDS = 30`
- `BREATH_INHALE_MS = 4000`, `BREATH_EXHALE_MS = 6000`, `BREATH_CYCLE_SECONDS = 10`
- `MIN_DAILY_CONTINUE_LIMIT = 1`, `MAX_DAILY_CONTINUE_LIMIT = 50`
- `MAX_REASONS_PER_SITE = 5`, `REASON_INPUT_MAX_CHARS = 280`, `MIN_INTENTION_CHARS = 3`
- `DESTINATION_FALLBACK_LABEL = 'your destination'` (moved from `rules.js`)
- `MINUTES_PER_DAY = 1440`, `MAX_SCHEDULE_RANGES = 4`, `ALWAYS_SCHEDULE`
- `SNOOZE_OPTIONS_MINUTES = [15, 30, 60]`, `SNOOZE_ALARM = 'snooze-end'`,
  `SCHEDULE_ALARM = 'schedule-boundary'`
- `VIEW_MERGE_WINDOW_MS = 60000`, `STEERED_DAYS_WINDOW = 7`
- `MAX_SITES = 200`
- `SYNC_QUOTA_BYTES = 102400`, `SYNC_QUOTA_BYTES_PER_ITEM = 8192`, `SYNC_MAX_ITEMS = 512`
- `RATING_PROMPT_THRESHOLD = 10`, `RATING_PROMPT_MAX_SHOWS = 3`
- `STORE_REVIEW_URL = { chrome: 'https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn/reviews', edge: <filled from the 1.0.0 Edge listing before 1.1>, firefox: 'https://addons.mozilla.org/firefox/addon/<slug>/reviews/' }`
  — the AMO slug is chosen and confirmed free before the first Firefox build is
  made, and set in the submission form, so Firefox users get the prompt from
  launch. A `null` entry hides the prompt and logs it at info level.
- `EXPORT_FORMAT = 'steer-clear-settings'`, `EXPORT_VERSION = 1`, `MAX_IMPORT_BYTES = 262144`
- `ONBOARDING_PATH = 'onboarding/onboarding.html'`

Removed from the earlier draft: `Theme`, `ContinueFriction`, the continue
phrase, breath count, `MAX_REASON_LENGTH`, `CONFIG_BACKUP*`, and
`ErrorCode.DAILY_LIMIT_REACHED`.

Tool-only constants (`tools/`): `MOBILE_VIEWPORT = { width: 360, height: 740 }`,
`MIN_TOUCH_TARGET_PX = 44`.

---

## G1 — Reach: Firefox, Firefox for Android, Edge, phone-width UI, CI

**Ships in 1.1.0.** The Edge listing of 1.0.0 happens before G1 starts.

**Goal.** One source tree runs on Chrome, Edge, Firefox desktop and Firefox for
Android. Two release zips come out of a single build command, every page is
usable at 360px, and CI guards it.

**Scope — files:**

| Action | File | What |
|---|---|---|
| Change | `src/manifest.json` | `background: { service_worker, scripts: ["background/service_worker.js"], type: "module" }`; `minimum_chrome_version: "121"`; `browser_specific_settings.gecko { id: "steer-clear@eladlaor", strict_min_version: "140.0", data_collection_permissions: { required: ["none"] } }`; `gecko_android { strict_min_version: "142.0" }` |
| Add | `tools/manifest_targets.mjs` | Pure `deriveManifest(base, target)`. `chrome` drops `browser_specific_settings` and `background.scripts`. `firefox` drops `background.service_worker` and `minimum_chrome_version` |
| Add | `tools/build.mjs` | Copies `src/` to `dist/chrome/` and `dist/firefox/` (excluding `*.md`, `.DS_Store`), writes the derived manifests, and zips each with the system `zip` (manifest at zip root) to `dist/steer-clear-chrome-<v>.zip` and `dist/steer-clear-firefox-<v>.zip`. Exits non-zero with a `[build]` message on any failure |
| Remove | `tools/package.sh` | Replaced by `tools/build.mjs`; references in docs are updated |
| Add | `src/shared/source_url.js` | Pure `extractSourceUrl(href)` (see verified facts) |
| Add | `src/shared/platform.js` | Pure `detectBrowser({ extensionBaseUrl, uaBrands })` (`moz-extension:` → firefox; brand `Microsoft Edge` → edge; else chrome) |
| Add | `src/shared/messaging.js` | The `sendMessage` wrapper now duplicated in `blocked.js` and `stats.js`, plus `sendWithoutAwait(message)` that attaches a logging `.catch` |
| Add | `src/shared/tokens.css`, `src/shared/base.css` | Colour tokens (light and dark via `prefers-color-scheme`) and the shared reset, `[hidden]` rule, buttons, focus ring, and 44px minimum target sizes. The page stylesheets import these instead of duplicating `:root` |
| Change | `src/blocked/*`, `src/options/*`, `src/stats/*` (CSS) | Fluid layouts. No fixed widths over 360px; the options add-grid becomes one column under 480px; site rows wrap; the hour chart scales |
| Change | `src/blocked/blocked.js` | Uses `extractSourceUrl` |
| Add | `tools/mobile_audit.mjs` | Playwright on Chromium (same loading as `screenshots.mjs`). Opens every extension page at 360×740 and fails if `scrollWidth > innerWidth` or any visible interactive element is smaller than 44×44 CSS px. **Exempt:** links whose computed `display` is `inline` inside running text (WCAG 2.5.8's inline exception) |
| Add | `.github/workflows/ci.yml` | On push and PR, Node 24: `node --test tests/unit/*.js`; `node tools/build.mjs`; `npx --yes web-ext@<pinned exact version> lint --source-dir dist/firefox`; install pinned Playwright Chromium and run `node tools/mobile_audit.mjs`; upload both zips as workflow artifacts. No secrets; no publishing |
| Change | `tests/unit/manifest.test.js` | Asserts both background keys point at the same existing file, `type: module`, gecko id and both `strict_min_version` values present, and `data_collection_permissions.required` is `["none"]` |
| Add | `tests/unit/build_manifest.test.js`, `tests/unit/source_url.test.js`, `tests/unit/platform.test.js` | |

**Acceptance criteria (all [1.1]):**

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
9. [ci] `node tools/mobile_audit.mjs` runs in CI on Chromium and passes for the
   reminder, settings and stats pages. Popup and onboarding are added as G4
   creates them. Inline text links are exempt from the 44px rule; every other
   interactive element is not.
10. [ci] The CI workflow runs green on the branch.

**Manual checks (each browser named):**

- M1 Chrome (unpacked `dist/chrome`): README checks 1–12 pass.
- M2 Edge (unpacked `dist/chrome`, and the 1.0.0 zip before listing it): add a
  site, see the reminder, continue, and check the bypass expires.
- M3 Firefox desktop (`about:debugging` → load `dist/firefox`): add a site;
  the permission prompt appears; navigating to
  `https://example.com/a?x=1&y=2#frag` shows the reminder with that exact URL;
  continue works; the bypass expires; revoking access in the Add-ons Manager
  makes the site show "needs access".
- M4 Firefox for Android (`web-ext run -t firefox-android` or a signed test
  build) on a phone about 360 CSS px wide: add a site from settings, grant
  access, navigate, see the reminder, continue. **One-handed** means: on each
  page, every primary action (add, grant, continue, go to the destination) is
  reached by tapping only, without zooming, without horizontal scrolling, and
  every tapped control is at least 44×44 CSS px (the same rule `mobile_audit`
  applies in Chromium).
- M5 Private browsing, extension not allowed there: in a Firefox private window
  without "Run in Private Windows", and in a **Chrome incognito** window with
  "Allow in Incognito" off, a listed site loads normally. The user guide
  documents both.
- M6 Chrome loading raw `src/` unpacked still works (the manifest warning about
  `browser_specific_settings` is expected and documented).

**Spike first.** Before the rest of G1, prove M3 and M4 by hand with the current
code plus only the manifest change, and prove `tabs.query({ url })` returns the
tab's URL with host permission only in Firefox desktop and Android (G2 relies on
it). If a DNR redirect to a `moz-extension://` web-accessible page does not work
on Firefox for Android, stop and amend this plan. There is no silent fallback.

---

## G2 — Pause screens that resist habituation, and bypasses that end

**Goal.** By default the pause screen changes visibly on every interception
while always showing the user's own reason, and it explains why once. The user
can pick a style and a pause length. A bypass shows its time left and, if the
user opts in, ends even on single-page sites.

**Scope — files:**

| Action | File | What | Ships |
|---|---|---|---|
| Add | `src/background/pause.js` | Pure: `presentationVariant(n)`, `concretePauseStyle(style, n)`, `pickReason(reasons, n, isRotating)`, `effectiveAutoContinue(style, autoContinue)`, `breathCountFor(pauseSeconds)`, `presentSite(resolved, site, n, context)` | `presentationVariant` in 1.1; rest 2.0 |
| Add | `src/background/bypass_tabs.js` | Pure: `tabQueryPattern(site)` (`*://*.host/*` with subdomains, else `*://host/*`), `tabsOnSite(tabs, site)` (filters with `findMatchingSite`), `badgeText(expiresAt, now)` (whole minutes left, rounded up, as `"5m"`; `''` when expired), `expiredTabs(tabs, site, activeBypasses, now)` (tabs on a site whose bypass has ended and that has no newer bypass) | 1.1 (badge helpers); 2.0 (`expiredTabs`) |
| Add | `src/background/continue_gate.js` | Pure `continueGate(state)` → `{ enabled, blockedBy: 'breathing'\|'intention'\|'waiting'\|null, remainingSeconds }`. Continue is enabled when the style gate (reason: immediately; breathing: all breaths done; intention: at least `MIN_INTENTION_CHARS` non-space characters typed) and the wait (`effectivePauseSeconds` elapsed since render) are both satisfied | 2.0 |
| Change | `src/background/rule_sync.js` (split from the worker in 1.1) | On grant: set the badge on matching tabs and start `BYPASS_TICK_ALARM` (every minute) that refreshes badges; on expiry: clear the badges in `badgedTabs`, stop the tick when no bypass remains, and, when `returnPauseOnExpiry` is on, send each `expiredTabs` tab to the pause page with `tabs.update(tabId, { url: <pause page>?from=<tab.url> })` | Badge 1.1; return 2.0 |
| Change | `src/background/message_handlers.js` | `GET_RESOLVED_SITE` returns the variant, concrete style, picked reason and effective pause; `grantBypass` uses `bypassMinutes` | Variant 1.1; rest 2.0 |
| Change | `src/blocked/blocked.html`, `blocked.js`, `blocked.css` | `blocked.js` stays the controller (≤ 250 lines) and delegates to the views below. Applies the variant (layout class, palette token set, prompt wording). Shows the variation notice once: "This screen changes a little each time, so it stays noticeable." with "Got it" and a link to turn it off in Settings; "Got it" sends `RECORD_LIFECYCLE_EVENT variationNoticeSeen`. The bypass button's sub-label shows `bypassMinutes` | Variant and notice 1.1 |
| Add | `src/blocked/breathing_view.js` | Animated circle (CSS transform) with the reason above it, a text cue "Breathe in / Breathe out" and a counter "1 of 2". Under `prefers-reduced-motion: reduce`, no scaling: cue text and counter only, same timing | 2.0 |
| Add | `src/blocked/intention_view.js` | The reason, then a labeled input "What did you come here for?". Value is held in memory only | 2.0 |
| Add | `src/blocked/continue_view.js` | Renders the gate: disabled continue button with `aria-disabled` and the remaining seconds | 2.0 |
| Add | `src/options/settings_form.js` | One generic form over the SiteSettings fields. Main section: reasons, destination, style, schedule. A collapsed **Advanced** section: pause length, bypass length, bring the pause back, vary presentation, daily limit, auto-continue and countdown. In site mode it shows only per-site fields, each with "Use default" | 2.0 |
| Change | `src/options/options.js`, `options.html`, `options.css` | Split: `options.js` (bootstrap, ≤ 200 lines), `site_list.js` (rows, add form, permission banner), `settings_form.js`. Reasons list editor (add, remove, up to 5, `maxlength` 280). All changes are sent as worker messages; the page re-renders on `storage.onChanged` and does not overwrite the focused input | 2.0 |
| Add | `tests/unit/pause.test.js`, `tests/unit/bypass_tabs.test.js`, `tests/unit/continue_gate.test.js` | | as above |

**Acceptance criteria:**

1. [unit] [1.1] **Habituation, measurable:** `presentationVariant(n)` differs
   from `presentationVariant(n + 1)` in `layout`, `palette` and `prompt` for
   every n in 0..1000, and every palette passes the contrast test.
2. [unit] [1.1] With `varyPresentation` at its default, `GET_RESOLVED_SITE`
   results for two consecutive interceptions of one site have different
   `variant` values (handler test with stubbed storage).
3. [unit] [1.1] `badgeText`: 4 min 1 s left → `"5m"`; 60 s left → `"1m"`;
   expired → `''`. `tabQueryPattern` gives `*://*.reddit.com/*` with subdomains
   and `*://reddit.com/*` without. `tabsOnSite` drops tabs on lookalike hosts
   (`notreddit.com`).
4. [unit] `expiredTabs` returns the tabs on a site whose bypass has expired,
   excludes tabs on other sites, and excludes the site when a newer bypass for it
   is active.
5. [unit] `concretePauseStyle('rotate', n)` yields reason, breathing, intention
   for n = 0, 1, 2 and repeats at n = 3. Non-rotate styles return themselves.
6. [unit] **Rotation bug guard:** with style `rotate` and reasons `[a, b, c]`,
   n = 0..8 shows the reason screen with `a`, `b`, `c` in turn (n = 0, 3, 6), and
   every reason appears in every style. Without rotate, `pickReason` returns
   `reasons[n % len]`; `pickReason([], n)` returns `''`.
7. [unit] `effectiveAutoContinue('intention', true)` is `false`; other styles
   return their input. `breathCountFor(0)` is 1, `breathCountFor(20)` is 2.
8. [unit] `continueGate`, for each style × pause length 0 and 10: disabled with
   the correct `blockedBy` before its condition holds, enabled after;
   `remainingSeconds` counts down.
9. [unit] `resolveSettings` returns per-site overrides for each per-site field
   and inherits when the key is absent; `validateSettings(partial: true)`
   rejects a global-only key such as `pauseSeconds`.
10. [unit] `validateSettings` rejects: `bypassMinutes: 7`, `pauseSeconds: 61`,
    `pauseSeconds: -1`, 6 reasons, a blank reason and an unknown `pauseStyle`.
    It **accepts** a 5,000-character reason (no validator length limit).
11. [unit] Bypass expiry uses `bypassMinutes` (a 15-minute bypass expires at
    `now + 15 × 60 000`).

**Manual checks:**

- M1 **Renders correctly**, defined as: for each style and each presentation
  variant, in Chrome and Firefox, with the OS in light and in dark mode, at
  1280×800 and 360×740: no console errors; the site name, the reason and both
  buttons are visible; at 1280×800 nothing needs scrolling; at 360×740 the
  "go to destination" button is visible without scrolling; no text overflows its
  container.
- M2 [1.1] Three consecutive visits to one site look visibly different (layout,
  colour, wording) and the user's reason appears each time. The variation notice
  appears on the first visit only; "Got it" hides it for good.
- M3 [1.1] On reddit.com in Chrome and Firefox desktop: continue; the toolbar
  badge on that tab shows `5m` and counts down each minute; it clears at expiry.
- M4 With "bring the pause back" on and a 1-minute bypass: continue on
  youtube.com, keep clicking between videos (no full load); at expiry the tab
  shows the pause page. With it off, the tab stays and only the badge clears.
- M5 Breathing at pause length 0 takes about 10 s; at 20 s it shows 2 breaths.
  Continue unlocks after the last breath. The alternative button works
  throughout. With OS reduced motion on, the circle does not animate and the
  cue and counter still advance.
- M6 Per-site override of style applies to that site only; "Use default"
  restores inheritance.
- M7 Intention style disables the auto-continue control in settings and explains
  why.

---

## G3 — Schedules, daily allowance, outcomes and progress

**Goal.** A site can be paused only when it matters (work hours), the user can
opt into a daily allowance that adds friction once used up, and the stats page
answers "is this working?" with honest numbers.

**Scope — files:**

| Action | File | What | Ships |
|---|---|---|---|
| Change | `src/background/stats.js` | `normalizeStats`; `recordView(stats, { viewId, host, now })` (dedupes by `viewId`, merges within `VIEW_MERGE_WINDOW_MS`, assigns `outcome: 'left'`, sets `outcomesSince`); pure `applyOutcome(stats, eventId, outcome)` (unknown id → throws; `continued` may follow `left` or `steered`; `steered` may follow `left` only) | 1.1 |
| Change | `src/background/stats_store.js` | `recordView`, `recordOutcome` | 1.1 |
| Change | `src/blocked/*` | Creates and keeps the `viewId` in `history.state`; sends `RECORD_VIEW` once visible; clicking the alternative (or auto-continue reaching it) sends `RECORD_OUTCOME steered`, then navigates | 1.1 |
| Add | `src/background/progress.js` | Pure: `continuesToday(stats, host, now)`, `steerRate(stats, now, days)` → `{ steeredClear, continued, rate \| null }`, `steeredClearDays(stats, now, days)` → `{ days, of }`, `todaySummary(stats, now)` → `{ intercepted, steeredClear, continued }`, `steerCount(stats)` (steered only) | `steerCount` 1.1; rest 2.0 |
| Add | `src/background/schedule.js` | Pure: `validateSchedule(s)`, `isScheduleActiveAt(schedule, date)`, `nextScheduleBoundary(schedules, now)` (earliest start or end of any range across sites within 8 days, or `null` if every schedule is `ALWAYS`) | 2.0 |
| Change | `src/background/rules.js` | `buildRules(config, extensionBaseUrl, context)`, where `context = { bypassedHosts, grantedHosts, snoozedUntil, now }`. A site produces a rule only if it is enabled, valid, not bypassed, granted, not snoozed, and its schedule is active at `now`. The positional signature is replaced and its tests updated | 2.0 |
| Change | `src/background/rule_sync.js` | After every rebuild, (re)creates `SCHEDULE_ALARM` at `nextScheduleBoundary`, or clears it when `null`. The alarm handler rebuilds | 2.0 |
| Change | `src/background/message_handlers.js` | `RECORD_VIEW`, `RECORD_OUTCOME` (1.1). `GET_RESOLVED_SITE` returns `continuesToday`, `overLimit` and the effective pause (2.0). `GRANT_BYPASS` records `continued` | as noted |
| Change | `src/blocked/*` | When `overLimit`: "You've opened <site> N times today, past your limit of L. Continue unlocks in 30 s." plus a direct link to the limit setting (`options/options.html#daily-limit`). Continue stays on the page | 2.0 |
| Add | `src/options/schedule_editor.js` | Day toggles plus up to 4 time ranges, a preset "Weekdays 9–17", and "Always" | 2.0 |
| Change | `src/stats/stats.html`, `stats.js`, `stats.css` | Cards: steered clear vs continued (30 days), "You steered clear on D of the last 7 days", today. Per-site rows show steered clear vs continued. The note "Choices tracked since <outcomesSince>" | 2.0 (1.1 shows the note and per-site counts only) |
| Add | `tests/unit/schedule.test.js`, `tests/unit/progress.test.js`; extend `stats.test.js`, `rules.test.js` | | |

**Definitions (the contract for the stats UI):**

- **Steered clear** = events with outcome `left` or `steered`.
- **Steer rate** over N days = steered clear / (steered clear + continued) over
  events in the window that have an outcome. `null` when the denominator is 0;
  the UI shows "—".
- **Steered-clear days** = the number of local days among the last
  `STEERED_DAYS_WINDOW` (7), counting today, with at least one steered-clear
  event. A continue does not break or reset anything. This replaces the earlier
  streak, which treated the deliberately easy bypass as failure.
- **Continues today** = events for that host since local midnight with
  `outcome === 'continued'`.
- **Daily allowance** = after `dailyContinueLimit` continues of a site today,
  that site's pause length becomes at least `OVER_LIMIT_PAUSE_SECONDS` (30 s)
  until local midnight. Continue is never removed.
- **Snooze and the allowance.** Snooze is the user's explicit "turn every
  reminder off for N minutes". It removes all rules, so it skips the allowance
  and is not counted as a continue. The popup's snooze row says so: "Pauses all
  reminders, including your daily limit." This is a stated definition, not a
  loophole; disabling the extension is always two clicks away anyway.

**Acceptance criteria:**

1. [unit] [1.1] `recordView` on stats without outcome fields adds `id`,
   `outcome: 'left'` and `outcomesSince`, and keeps legacy events unchanged.
2. [unit] [1.1] `recordView` with a `viewId` already logged adds nothing and
   returns the same id (reload, session restore).
3. [unit] [1.1] `recordView` for the same host 59 s after a `left` event returns
   that event's id and adds nothing; at 61 s, or after a `continued` event, it
   adds a new event.
4. [unit] [1.1] `applyOutcome` updates exactly one event, throws on an unknown
   id, and rejects `steered` after `continued`.
5. [unit] [1.1] `steerCount` counts `steered` events only: 3 left, 2 steered and
   1 continued give 2.
6. [unit] `isScheduleActiveAt`: Mon–Fri 09:00–17:00 is active Mon 09:00, inactive
   Mon 17:00 (end-exclusive), and inactive Sat 10:00. Overnight Fri 22:00–02:00 is
   active Fri 23:00 and Sat 01:59, and inactive Sat 02:00 and Thu 23:00.
   `ALWAYS_SCHEDULE` is active at every hour of a sampled week.
7. [unit] `validateSchedule` rejects: empty `days`, a day of 7, duplicate days,
   0 or 5 ranges, `start === end`, `start` 1440, `end` 0, and non-integers.
8. [unit] `nextScheduleBoundary` returns the next range start when currently
   inactive, the range end when active, the earliest boundary across several
   sites, and `null` when every site is always-active.
9. [unit] `buildRules` omits a site outside its schedule and includes it inside;
   it returns `[]` while `snoozedUntil > now`, and the full set once
   `snoozedUntil <= now`.
10. [unit] `continuesToday` counts only that host's `continued` events since
    local midnight, and ignores yesterday 23:59.
11. [unit] `steerRate` excludes legacy events and returns `null` with no data;
    for 3 left, 1 steered and 1 continued it returns 0.8.
12. [unit] `steeredClearDays`: steered-clear events on 5 distinct days of the
    last 7 → `{ days: 5, of: 7 }`; a continue on a day with a steer still counts
    the day; an event 8 days ago does not count.
13. [unit] `effectivePauseSeconds`: limit 2 and 2 continues today → 30 with
    `pauseSeconds` 0, and 45 with `pauseSeconds` 45; limit `null` → `pauseSeconds`.
14. [unit] `pruneEvents` keeps working on outcome-tagged events.

**Manual checks:**

- M1 [1.1] Reload the pause page 3 times, then retype the URL within a minute:
  the stats page shows one interception. A prerendered pause page (typing the
  address and not pressing Enter, in Chrome) logs nothing.
- M2 A schedule ending 2 minutes from now: the site loads normally after the
  boundary without any user action, and the reminder returns at the next start.
- M3 Daily limit 2: the third reminder of the day shows the over-limit line, a
  30 s wait, then a working continue; the settings link opens the limit field.
- M4 The stats page shows steer rate, steered-clear days and today, with the
  right values after a scripted sequence (2 steers, 1 continue).
- M5 Erase statistics resets steer rate, steered-clear days and
  continues-today, and leaves `lifecycle` untouched.

---

## G4 — Onboarding, toolbar popup, accessibility, rating prompt

**Goal.** A new user reaches their first pause in 60 seconds or less, with at
most 4 clicks. Everyday actions live one click from the toolbar. Every surface
is keyboard- and screen-reader-usable with AA contrast. A satisfied user is
asked once for a rating, where they will see it.

**Scope — files:**

| Action | File | What | Ships |
|---|---|---|---|
| Change | `src/background/service_worker.js` | On `install`: **no storage write**; open `ONBOARDING_PATH` with `chrome.tabs.create` (2.0; 1.1 keeps opening the options page). On `update`: no tab opens | No-write in 1.1 |
| Add | `src/background/rating.js` | Pure: `shouldShowRatingPrompt(lifecycle, steerCount, storeUrl)` and `nextRatingState(lifecycle, event, now)` for `shown`, `rated`, `dismissed`. After `RATING_PROMPT_MAX_SHOWS` shows the state becomes `expired` | 1.1 |
| Add | `src/background/lifecycle_store.js` | Read and write `lifecycle` in `storage.local`, with `normalizeLifecycle`; written only by the worker | 1.1 |
| Change | `src/stats/*` | The rating banner (1.1: the stats page is the toolbar page). Shown at most once per page open | 1.1 |
| Add | `src/background/presets.js` | Frozen `PRESETS` grouped by category: social (facebook.com, instagram.com, x.com, tiktok.com, reddit.com), news (cnn.com, nytimes.com, bbc.com, theguardian.com, foxnews.com), video (youtube.com, netflix.com, twitch.tv), shopping (amazon.com, ebay.com, aliexpress.com, temu.com, etsy.com). Pure `normalizeOnboardingSelection(chips, typedHosts)` returns deduplicated normalized hosts | 2.0 |
| Add | `src/onboarding/onboarding.html`, `.js`, `.css` | **Two steps.** (1) "Pick sites": one line "A nudge in your own words, not a wall"; per-site chips grouped by category, **none preselected**; a domain input; each selected site gets an optional reason field (`maxlength` 280) — reasons are per site. (2) "Turn on Steer Clear": one button that calls `sendWithoutAwait(ADD_SITES)` and then `permissions.request` for the selected origins **in the same synchronous tick**. Then a done state with "Try it: open <first site>". Destination and pause style use defaults and are changed in settings. "Skip" is always visible. **If synced sites already exist** (on open, or when they arrive via `storage.onChanged`), it shows "Your sites synced from another device" with a link to settings and skips setup | 2.0 |
| Add | `src/popup/popup.html`, `.js`, `.css` | Today's summary and steered-clear days; "Steer clear of <host>" quick-add when the active tab is http(s) and not already listed (`sendWithoutAwait(ADD_SITES)` then `permissions.request` in the same tick); snooze 15/30/60 with the allowance note, and "Resume now" with the remaining time; links to stats and settings; the rating banner | 2.0 |
| Change | `src/manifest.json` | `action.default_popup` → `popup/popup.html`; add `activeTab` to `permissions` | 2.0 |
| Change | `src/background/rule_sync.js`, `message_handlers.js` | Snooze: `SET_SNOOZE` writes `session.snooze`, creates `SNOOZE_ALARM`, rebuilds; the alarm or `CLEAR_SNOOZE` clears it and rebuilds; `GET_STATUS` | 2.0 |
| Change | `src/options/site_list.js` | Settings add uses the same send-then-request pattern | 2.0 |
| Change | `src/shared/tokens.css`, `base.css`, every page | One visual system: type scale, spacing scale, radius, button variants, presentation palettes. Visible `:focus-visible` ring; 44px targets | 2.0 |
| Change | All pages | Accessibility: a single `<h1>` per page and logical headings; every input labeled; status regions `aria-live="polite"`; the countdown announces at start and on stop, not every second; the breathing circle is `aria-hidden` with a live text cue; initial focus on the pause page's alternative button; Escape stops a running countdown; disabled-continue reasons are associated via `aria-describedby` | 2.0 |
| Add | `tools/contrast.mjs` (pure) and `tests/unit/contrast.test.js` | Parses `src/shared/tokens.css` and asserts WCAG contrast for each text/background pair in light, dark and every presentation palette | 1.1 (palettes ship then) |
| Change | `tools/screenshots.mjs` | Seeds v3 config and outcome-tagged history. Captures: 1 reminder, 2 breathing style, 3 settings, 4 patterns, 5 popup; and the 440×280 small promo tile | 2.0 |
| Add | `tests/unit/presets.test.js`, `tests/unit/rating.test.js`, `tests/unit/lifecycle.test.js`, `tests/unit/install.test.js` | | |

**Acceptance criteria:**

1. [unit] [1.1] **Install never writes.** With a stubbed `chrome.storage.sync`
   holding a v2 `config` (and, for 2.0, also `schema` and `site:*` items),
   running the `install` handler and then `readConfig` makes zero `set` and zero
   `remove` calls, and the items are unchanged. With empty storage, the same
   holds and `readConfig` returns the defaults.
2. [unit] [1.1] `shouldShowRatingPrompt` is true only when the state is
   `pending`, `steerCount >= RATING_PROMPT_THRESHOLD` and `storeUrl` is non-null.
   `nextRatingState` moves `pending` → `rated` or `dismissed` on click, and
   `pending` → `expired` on the 3rd `shown`. Every non-pending state is final.
3. [unit] [1.1] `normalizeLifecycle(undefined)` returns the documented defaults.
4. [unit] [1.1] `contrast.test.js`: `--ink` on `--bg` and on `--card`,
   `--ink-soft` on `--card`, `--accent-ink` on `--accent`, and `--danger` on
   `--card` are each ≥ 4.5:1 in light, in dark, and in every presentation
   palette.
5. [unit] `normalizeOnboardingSelection` returns the union of chips and typed
   hosts, normalized and deduplicated (`Example.com/path` → `example.com`), and
   throws on an unknown chip. Every preset host passes `normalizePattern`
   unchanged.
6. [unit] The popup and onboarding click handlers are written so that
   `permissions.request` is called before the first `await` and after the
   message is sent: a unit test drives each handler with stubs and asserts the
   call order (`sendMessage` then `permissions.request`) and that no `await`
   resolves between them.
7. [unit] `manifest.test.js`: `activeTab` declared; `default_popup` exists;
   `onboarding/onboarding.html` exists.
8. [ci] `node tools/mobile_audit.mjs` passes for popup and onboarding.
9. [cmd] `node tools/screenshots.mjs --out <tmp>` writes 5 PNGs at 1280×800 and
   a 440×280 promo tile.

**Manual checks:**

- M1 **First pause in ≤ 60 s and ≤ 4 clicks.** Fresh profile, fresh install, in
  Chrome, Firefox desktop and Firefox Android. Start a timer when onboarding
  opens: click the reddit.com chip (1), "Turn on" (2), "Allow" in the prompt (3),
  "Try it: open reddit.com" (4). Pass when the reminder for reddit.com is shown
  within 60 s and 4 clicks; record both numbers in `QA_GUIDE.md`. Also record
  the exact Chrome prompt wording when 1, 3 and 10 sites are selected; if many
  sites turn it into a generic "on a number of websites" prompt, note the
  threshold and limit the onboarding hint accordingly.
- M2 Deny the prompt in onboarding: the sites appear in settings as
  "needs access", with a working grant button.
- M3 Second device: sign a second Chrome profile into the same sync account
  with 3 sites saved; install. Onboarding shows "Your sites synced from another
  device" once they arrive, and the first device's sites are intact afterwards.
- M4 Popup on a normal site in Chrome and Firefox desktop: quick-add shows the
  prompt; the site appears in settings (granted or "needs access") even when the
  popup closed during the prompt; reloading the tab after granting shows the
  reminder. On an `about:`/`chrome:` page, quick-add is hidden.
- M5 Snooze 15: every listed site loads normally and the popup shows the time
  remaining. "Resume now" restores the reminders immediately. A browser restart
  also ends the snooze.
- M6 Keyboard only: every action on every page is reachable with Tab, with a
  visible focus ring and no keyboard traps.
- M7 Screen reader (VoiceOver on macOS): the pause page reads the site,
  the reason, and why continue is disabled.
- M8 [1.1] After 10 steers, the stats page (1.1) and the popup (2.0) show the
  rating banner. "Rate" opens the store's reviews page for the current browser.
  The banner never reappears after either button or after 3 showings.
- M9 Upgrading from 1.0.0 opens no tab, and existing settings are intact.

---

## G5 — Trust, portability, release engineering and store presence

G5 is split: **G5-A** is the 2.0 foundation that lands first in the 2.0 cycle
(its worker split lands in 1.1); **G5-B** is release and store work that lands
last, with a 1.1 subset.

### G5-A — Schema v3, storage layout, worker as sole writer, degraded safety

**Scope — files:**

| Action | File | What | Ships |
|---|---|---|---|
| Split | `src/background/service_worker.js` | Into `service_worker.js` (listener registration only), `rule_sync.js` (rebuild, bypass, badge tick, snooze, schedule alarm), and `message_handlers.js` (dispatch table; split by domain if it nears 500 lines) | 1.1 |
| Add | `src/background/degraded.js` | Pure `ruleIdsMatchingUrl(rules, url)` (tests each rule's `regexFilter` against the URL) and `degradedSiteView(host)` (host plus `defaultSettings()`, `degraded: true`) | 1.1 |
| Change | `rule_sync.js` `grantBypass` | If resolving the configured site throws: log a `[steer-clear]` error, key the bypass on `normalizePattern(rawHost)`, remove the rules from `ruleIdsMatchingUrl`, keep them in `session.liftedRules`, and on expiry re-add them if a rebuild still fails | 1.1 |
| Add | `src/background/settings_schema.js` | Field table (with per-site flags), `defaultSettings()`, `validateSettings(obj, { partial })`, `resolveSettings(defaults, site)` | 2.0 |
| Add | `src/background/config_migration.js` | `migrateLegacyConfig` chain (v1→v2 kept, v2→v3 new), `legacyId` | 2.0 |
| Add | `src/background/sync_layout.js` | `assembleConfig(items)`, `siteKey(id)`, `assertSyncQuota(set, currentItems)`, `itemBytes(key, value)` (UTF-8 via `TextEncoder`) | 2.0 |
| Add | `src/background/config_mutations.js` | Pure planners: `planAddSites`, `planUpdateSite`, `planRemoveSite`, `planUpdateDefaults`, `planImport`, each including materialization when needed | 2.0 |
| Change | `src/background/config.js` | Storage I/O only: `readConfig()` (read all sync items, `assembleConfig`; never writes) and `applyMutation(plan)` (quota check, one `set`, one `remove`). Used for writing only by the worker's mutation queue | 2.0 |
| Change | `src/background/rules.js` | `resolveSiteSettings` replaced by `resolveSettings` and `presentSite`; `findMatchingSite`, `siteLabel` and `normalizePattern` stay | 2.0 |
| Change | `src/options/*`, `src/onboarding/*`, `src/popup/*` | Read with `readConfig`; write only by message; re-render on `storage.onChanged` | 2.0 |
| Replace | `tests/unit/config.test.js` | Becomes `config_migration.test.js`, `settings_schema.test.js`, `sync_layout.test.js` and `config_mutations.test.js`. Every existing assertion's intent is kept | 2.0 |
| Add | `tests/unit/fixtures/` | `config_v2_real.json` (captured from 1.0.0), `sites_typical.js`, `site_heavy_hebrew.js`, `config_v2_long_note.json` | 2.0 |

**Fixtures (defined):**

- `sites_typical.js`: 100 sites. Each has a UUID id, a 15-character pattern,
  `displayName: null`, `addedAt` set, `order` 0–99, and overrides
  `{ reasons: [<140 ASCII characters>], target: <60-character https URL> }`.
- `site_heavy_hebrew.js`: one site with 5 reasons of 280 Hebrew characters each
  (2 UTF-8 bytes per character).
- `config_v2_long_note.json`: a valid v2 config whose `globalNote` and one
  site note are 2,000 characters each.

**Acceptance criteria:**

1. [unit] [1.1] **Corrupt config, continue still works:** with `readConfig`
   stubbed to throw (and separately with `schema: 4` in 2.0),
   `GET_RESOLVED_SITE` returns `degraded: true` with the host, and `GRANT_BYPASS`
   for that host removes exactly the rule ids `ruleIdsMatchingUrl` returns and
   resolves with `expiresAt`. On expiry with config still unreadable, those
   rules are re-added.
2. [unit] [1.1] `ruleIdsMatchingUrl` matches `www.reddit.com` against a
   subdomain-inclusive reddit.com rule and not `notreddit.com`.
3. [unit] v1, v2 and v2-with-placeholder fixtures migrate to `{ defaults, sites }`
   that pass validation. `config_v2_long_note.json` migrates with both notes
   intact and untruncated.
4. [unit] Migration preserves every site id, pattern, displayName,
   includeSubdomains and enabled value, and site order (as `order`). A v2 config
   with two sites of the same pattern migrates with both.
5. [unit] Migration is pure and deterministic: a v1 site without an id gets
   `v1-<index>-<pattern>` on every call; the input object is not mutated.
6. [unit] Behavioral equivalence (defined in the
   [migration section](#migration-v1v2-to-v3)) holds for every fixture,
   including blank-string overrides inheriting and the displayed `targetName`.
7. [unit] `assembleConfig`: `schema: 4` throws with "update the extension"; no
   `schema` and no `site:*` with a v2 `config` → sites from `config`; `schema: 3`
   with zero `site:*` → `sites: []` (removed sites never resurrect from
   `config`); `site:*` items without `schema` → v3 mode; sites sort by
   `(order, id)`; one invalid site item is skipped and listed in `invalidSites`;
   `settings` absent with a v2 `config` → defaults from `config`.
8. [unit] Mutation planners: `planAddSites` sets only the new `site:*` keys
   (plus `schema` and the materialized legacy sites on the first write) and never
   `settings`; `planUpdateSite` sets exactly one key; `planRemoveSite` removes
   exactly one key and sets nothing; `planUpdateDefaults` sets only `settings`;
   no planner ever writes or removes `config`; no planner removes a key the
   request did not name, even when stray `site:*` items exist.
9. [unit] **Stale-copy race:** applying `ADD_SITES` (popup) and then an
   `UPDATE_SITE` built from an older read (settings tab) leaves both the new site
   and the edit in storage.
10. [unit] `assertSyncQuota` measures UTF-8 bytes: an item holding a reason of
    4,500 Hebrew characters (under 8,192 by `JSON.stringify(...).length`, about
    9,000 bytes) throws naming the key and its byte size;
    `site_heavy_hebrew.js` passes; `sites_typical.js` (100 sites) passes;
    totals over 102,400 bytes and more than 512 items throw.
11. [unit] `resolveSettings`: an absent key inherits, a present key wins, and
    rule 2 (target name follows its target) holds. `presentSite` applies the
    hostname fallback.
12. [unit] `validateSettings(partial: true)` rejects unknown and global-only
    keys; `partial: false` rejects a missing field.
13. [unit] The worker's mutation queue runs two concurrent mutations in order:
    the second sees the first's result.

**Manual checks:**

- M1 Install 1.0.0 from the store zip, add 3 sites with notes and overrides,
  upgrade in place to the branch build, and open settings: all values are
  present and behavior is unchanged. `storage.sync.config` is byte-identical
  before and after, including after editing a site on 2.0.
- M2 Same upgrade with 40 sites (above the old single-item limit): adding a 41st
  site succeeds.
- M3 Rollback: after M1 plus edits on 2.0, load the 1.0.0 build again: it reads
  its unchanged `config` and works.
- M4 Corrupt one `site:*` item by hand in the devtools console: the other sites
  keep working, settings lists the error, and continue on the corrupt site's
  pause page (if its rule is still installed) still works.

### G5-B — Export/import, docs, store presence, version

**Scope — files:**

| Action | File | What | Ships |
|---|---|---|---|
| Change | `store/PRIVACY_POLICY.md` | New "Last updated". 1.1 adds: Firefox and Edge; choices on the reminder page (which button) stored with each record; the per-tab bypass badge; `tabs.query` used to find tabs on a site whose bypass is running or ended, with access only to sites the user added. 2.0 adds: `tabs.update` used only for the opt-in "bring the pause back", which reads the tab's current address at that moment and stores nothing; snooze and bypass state in session storage; onboarding, rating and notice flags; export files are created only on request and stay where the user saves them; `activeTab` use. Covers all three browsers' sync (Chrome Sync; Firefox Sync, end-to-end encrypted by Firefox; Firefox for Android does not sync) | 1.1 and 2.0 |
| Add | `store/LISTING_FIREFOX.md`, `store/LISTING_EDGE.md` | AMO listing copy, category, `data_collection_permissions` rationale, "source code submission not required — no minification or bundling", and the chosen AMO slug. Edge Partner Center listing copy | Edge now; AMO 1.1 |
| Change | `store/LISTING.md` | Copy rules below; `activeTab` justification (2.0); `alarms` justification adds badge tick, snooze and schedules; data-use disclosures re-checked ("User activity" now also covers choices) | 1.1 and 2.0 |
| Add | `tests/unit/listing_copy.test.js` | Reads `store/LISTING*.md` and asserts the copy rules below | 1.1 |
| Add | `src/background/settings_io.js` | Pure `buildExport(config, extensionVersion, now)` and `parseImport(text)` → `{ config, duplicates }`, or throws with a field path | 2.0 |
| Add | `src/options/data_panel.js` + markup | "Export settings" (Blob plus `<a download>`, file name `steer-clear-settings-YYYY-MM-DD.json`; needs no `downloads` permission). "Import settings" (file input, preview "Replace N sites with M sites?", confirm, then `IMPORT_SETTINGS`). After import, "M sites need access — Grant all" calls `permissions.request` as the only call in the click handler | 2.0 |
| Add | `knowledge/usage_guides/DEVELOPER_GUIDE.md`, `USER_GUIDE.md`, `DEVOPS_GUIDE.md`, `QA_GUIDE.md` | Required guides (none exist yet). DEVOPS covers build, CI, and releasing to three stores. QA holds the full manual check matrix from this plan, with the recorded onboarding timings. USER covers private windows, single-page-site bypasses, and "update on every device" | 1.1 (start), 2.0 |
| Add | `knowledge/setup/STORE_PRESENCE.md` | Featured nomination record, promo video script and link, category test log | 2.0 |
| Change | `README.md` | Cross-browser install, new layout, `tools/build.mjs`, test count, and the supported-platform statement | 1.1 |
| Change | `knowledge/setup/SUBMISSION_STEPS.md`, `DISTRIBUTION.md` | `package.sh` → `build.mjs`; AMO and Edge steps | 1.1 |
| Change | `src/manifest.json` | `version: "1.1.0"`, then `"2.0.0"` | both |
| Change | `CHANGELOG.md` | `[Unreleased]` entries promoted to `## [1.1.0] - <date>` and later `## [2.0.0] - <date>`, with compare links | both |
| Change | `.claude/CLAUDE.md` (project), if present | Updated commands (build, lint, audit) | 1.1 |

**Listing copy rules (all three stores):**

- The first line leads with the user benefit: "A nudge in your own words, not a
  wall: your own reason, one click to something better, and you're never locked
  out."
- The description uses the real search phrases "stop doomscrolling", "block
  distracting sites" and "mindless browsing".
- It names the target user ("people who check social and news sites on
  autopilot") and includes the explicit line: "Not for you if you want sites
  locked: Steer Clear always lets you through."
- The comparison claim uses exactly this wording: "Asks for access only to the
  sites you add, unlike one sec, LeechBlock NG and Freedom's Pause." It is
  re-verified against each named competitor's current manifest on the
  submission date, and the date is recorded in `STORE_PRESENCE.md`. It never
  says "only" or "first" about Steer Clear itself, because Intention also asks
  per site.
- No "dopamine detox", and no ADHD or other treatment or health claims. "Built
  for people who get pulled off-task" is the allowed phrasing.

**Acceptance criteria:**

1. [unit] [1.1] `listing_copy.test.js`: each listing contains the benefit line,
   the three search phrases, the not-for-hard-lock line, and the comparison
   sentence verbatim; none matches `/dopamine|detox|ADHD|treat|cure|diagnos/i`
   except inside the allowed "pulled off-task" sentence.
2. [unit] [1.1] `manifest.test.js` asserts the declared permissions are exactly
   `declarativeNetRequest, storage, alarms` in 1.1 and
   `declarativeNetRequest, storage, alarms, activeTab` in 2.0 (a permission
   added later must update this test and the privacy docs together), and that
   `version` matches the release.
3. [doc] [1.1] The privacy policy and the listings mention every key in the
   [local data layout](#local-and-session-data-layout), every permission in the
   manifest, and every `tabs` API used (`tabs.query`, `tabs.create`, and in 2.0
   `tabs.update`). Review against this checklist before submitting.
4. [doc] Every new or changed `.md` starts with a clickable TOC and a summary
   section, and `knowledge/usage_guides/` contains the four guides.
5. [unit] `parseImport(JSON.stringify(buildExport(c, …)))` round-trips `c`.
6. [unit] `parseImport` accepts envelopes holding v1, v2 and v3 configs and
   returns v3; it reports duplicate patterns without rejecting.
7. [unit] `parseImport` rejects non-JSON, a wrong `format`, `exportVersion: 2`,
   `schemaVersion: 4`, oversize input and an invalid field. Each error message
   contains the field path.
8. [unit] `buildExport` output contains no `stats`, `lifecycle` or `bypasses`
   key at any depth.
9. [ci] CI is green: unit tests, both builds, web-ext lint and the mobile audit.
10. [store] **Promo assets:** a 440×280 small promo tile (generated by
    `tools/screenshots.mjs`) and a 30–60 s promo video (reason on the pause
    page → one click to the destination → easy continue; captions, no
    voice-over needed) are uploaded to the Chrome listing before the Featured
    nomination.
11. [store] **Featured nomination:** submitted through the Chrome Web Store One
    Stop Support form after 2.0 is live with the promo assets; the date and the
    outcome are recorded in `STORE_PRESENCE.md`. If declined, the reason is
    recorded and the nomination is resubmitted after the next listing change.
12. [store] **Category test:** the listing runs 4 weeks in its current category,
    then 4 weeks in "Workflow & Planning" (where Unhook sits); weekly
    impressions and installs from the developer dashboard are logged in
    `STORE_PRESENCE.md`, and the better category is kept. The dashboard is the
    store's own developer report; the extension sends nothing.

**Manual checks:**

- M1 Export in Chrome, import in Firefox: same sites and settings; one
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

| Phase | Release | Work | Owns (creates or restructures) | Extends only |
|---|---|---|---|---|
| 0 | 1.0.0 on Edge | List the existing zip on Edge Add-ons | `store/LISTING_EDGE.md` | — |
| 1 | 1.1.0 | **G1** Reach and CI | `src/manifest.json` (background and gecko keys), `tools/{build,manifest_targets,mobile_audit}.mjs`, `.github/workflows/ci.yml`, `src/shared/{source_url,platform,messaging}.js`, `src/shared/{tokens,base}.css`, page CSS layouts, their tests | `blocked.js` (source URL only) |
| 2 | 1.1.0 | **1.1 slice**: install no-write, worker split and degraded continue (G5-A), presentation variation, notice and badge (G2), view dedup and outcomes (G3), rating on the stats page (G4), 1.1 docs and listings (G5-B) | `service_worker.js` split into `rule_sync.js` and `message_handlers.js`, `src/background/{degraded,bypass_tabs,rating,lifecycle_store}.js`, `pause.js` (`presentationVariant`), `stats.js` (`recordView`, `applyOutcome`), `tools/contrast.mjs`, `listing_copy.test.js` | `blocked.js`, `stats/*`, `constants.js`, `store/*` |
| 3 | 2.0.0 | **G5-A** Foundation | `src/background/{settings_schema,config_migration,sync_layout,config_mutations}.js`, `config.js`, `rules.js` (resolver swap), config tests and fixtures | `message_handlers.js` (mutation messages), `src/options/options.js` (messages only), `constants.js` |
| 4 | 2.0.0 | **G2** Pause | `src/background/continue_gate.js`, rest of `pause.js` and `bypass_tabs.js`, `src/blocked/*` (views), `src/options/{settings_form,site_list}.js` (options split) | `rule_sync.js` (return on expiry), `message_handlers.js` |
| 5 | 2.0.0 | **G3** Progress | `src/background/{schedule,progress}.js`, `rules.js` (`RuleContext`), `src/options/schedule_editor.js`, `src/stats/*` | `rule_sync.js`, `message_handlers.js`, `blocked.js`, `settings_form.js` |
| 6 | 2.0.0 | **G4** UX | `src/popup/*`, `src/onboarding/*`, `src/background/presets.js`, design-system pass over all CSS, `tools/screenshots.mjs` | `manifest.json` (popup, `activeTab`), `service_worker.js` (install opens onboarding), `rule_sync.js` (snooze), every page (ARIA) |
| 7 | 2.0.0 | **G5-B** Release | `src/background/settings_io.js`, `src/options/data_panel.js`, `store/*`, `knowledge/usage_guides/*`, `knowledge/setup/STORE_PRESENCE.md`, README, version | `CHANGELOG.md` |

**Why this order.** Edge first, because it costs nothing. G1 next, because the
build, lint, CI and phone-width constraints shape every later file, and a
Firefox incompatibility found late would be expensive. The 1.1 slice follows,
because it changes no synced data and puts the default habituation fix and the
rating prompt in front of users while the schema work proceeds. G5-A opens the
2.0 cycle because the schema is the contract G2–G4 code against. G2 before G3,
because G3's pause-page changes slot into the view structure G2 creates. G4
after G2 and G3, because the popup shows progress. G5-B last, because docs and
listings describe the finished product.

**Parallelism.** Within a phase, pure modules and their tests can be built in
parallel with the UI. `schedule.js` and `progress.js` (G3) and `presets.js` (G4)
are pure and depend only on constants and the schema, so they can start any time
after phase 3.

**Line budgets to watch.** `service_worker.js` (352 today) is split in phase 2;
`options.js` (422) in phase 4; `blocked.js` stays a thin controller. No file may
exceed about 500 lines.

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
- **Hard-lock or "strict" modes,** including removing the continue button. The
  daily allowance only adds a wait. Settings remain the escape hatch by design,
  and the listing says Steer Clear is a nudge, not a wall.
- **A theme setting and typed-phrase friction.** Pages follow the system colour
  scheme; a typed phrase reads as a wall.
- **Content scripts, in-page timers, or time-spent tracking on sites.** That would
  need page access the privacy stance rules out. The badge countdown uses only
  the action API and the bypass expiry time.
- **Path- or URL-level blocking** (only whole domains and subdomains).
- **Storing typed intentions** or any free text typed on the pause page.
- **Localization.** English only for 2.0; strings are kept out of logic so i18n
  can follow.
- **Merge-mode import** (2.0 import replaces).
- **Reordering sites by hand** (display order is the order sites were added).
- **A "What's new" page on update.**

---

## Target versions and SemVer reasoning

**1.1.0** is MINOR: new browsers, presentation variation, outcome tracking, the
badge and the rating prompt are additive. Synced storage is unchanged, and the
new `local` and `session` keys are ignored by 1.0.0, so 1.0.0 and 1.1.0 can run
side by side on synced devices and a rollback is safe.

**2.0.0** is MAJOR. Storage is no longer destructive or unreadable for 1.x, but
the synced-settings contract still changes incompatibly: after the first 2.0
write, settings edited on a 2.0 device no longer reach 1.x devices on the same
sync profile, and 1.x edits no longer reach 2.0 devices. The release also turns
the toolbar button from the stats page into a popup and replaces first-run
behavior. The same version ships to all three stores.

---

## Open questions to settle during implementation

1. **AMO data-collection category.** The plan declares
   `data_collection_permissions: { required: ["none"] }`, because nothing is
   transmitted by the extension. Mozilla defines transmission as data handled
   "outside the add-on or the local browser" and is silent on `storage.sync`.
   `storage.sync` through Firefox Sync (end-to-end encrypted and controlled by
   the user) is the browser's own transport, not the developer's. Confirm with
   AMO before the first Firefox submission. If AMO disagrees, declare the
   category it requires and update the privacy policy. Do not drop sync
   silently.
2. **Gecko id and AMO slug.** `steer-clear@eladlaor` is permanent once published
   to AMO. Confirm before the first upload. Confirm the slug (`steer-clear`) is
   free before building 1.1, so `STORE_REVIEW_URL.firefox` is correct at launch.
3. **Firefox for Android popup.** Popups open as a full page there, and
   `tabs.query({ active: true, currentWindow: true })` may return the popup's own
   tab. If M4 of G4 fails on Android, quick-add is hidden on Android, decided by
   `detectBrowser` plus `runtime.getPlatformInfo().os === 'android'`, and
   documented. This is a defined behavior, not a fallback.
4. **Chrome's permission prompt with many hosts.** Whether 10+ hosts collapse the
   prompt into "on a number of websites" is unverified; G4 M1 records it.
5. **`web-ext` and Playwright version pins.** Pin the exact current releases in
   CI at implementation time and record them in `DEVOPS_GUIDE.md`.

---

## Rejected critique points

Everything in the plan review was accepted except the points below.

- **Merging the auto-continue countdown into the single timing control (#13).**
  Accepted: one `pauseSeconds` replaces breath count and the continue wait.
  Rejected: folding `countdownSeconds` into it. The countdown times an automatic
  move **to the destination**, while `pauseSeconds` times when **continue to the
  site** unlocks. With one number, auto-continue would steer the user away at the
  exact moment continue unlocks, so continue could never be used. The countdown
  stays, shown only when auto-continue is on, under Advanced.
- **Limiting per-site overrides strictly to reasons, destination, style and
  schedule (#13).** Kept, plus `autoContinue` and `countdownSeconds`: 1.0 already
  offers them per site, users have them stored, and the plan's own rule is that
  every valid v2 config migrates without behavior change. They sit in the site's
  collapsed "Advanced", so the main per-site form has the four fields asked for.
- **"Left counts as steered clear" (#11).** The inflation came from duplicate
  events, which the per-view id, visibility check and merge window remove. A
  user who closes the tab instead of continuing has done what the product asks,
  so `left` stays in the steered-clear figure. The rating threshold
  (`steerCount`) counts `steered` only, as required.
- **Running `mobile_audit` in Firefox (#16).** Accepted: CI, and the inline-link
  exemption. Kept Chromium-only: Playwright cannot load a Firefox extension, so
  Firefox and Firefox for Android layouts are covered by the defined manual
  checks G1 M3 and M4.
- **Message name `ADD_SITE` (#4).** Renamed `ADD_SITES` with a list, so
  onboarding's selection is one sync write rather than one per site (sync allows
  120 writes per minute). The popup sends a one-item list.
- **Factual correction to #6.** Five 1,000-character ASCII reasons are about
  5.1 KB of JSON and do fit in 8,192 bytes. The conclusion still holds: the same
  reasons in Hebrew are about 10 KB and do not, and the old check measured
  UTF-16 length. Byte measurement and the 280-character input limit are adopted.
