# Steer Clear

A browser extension for Chrome, Edge, Firefox and Firefox for Android that
catches muscle-memory navigation. Sites on your list
show you your own reason instead of loading — plus one click to somewhere you'd
rather be, and an easy way through when you actually mean it.

## Table of Contents

- [Summary](#summary)
- [Install for development](#install-for-development)
- [Verify it works](#verify-it-works)
- [Run the tests](#run-the-tests)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Before publishing](#before-publishing)
- [License](#license)

---

## Summary

Load `src/` (or a built `dist/<target>/`) as an unpacked extension, pick a
site on the welcome page that opens (or add one from the toolbar popup or the
settings page), then navigate to that domain. You get the pause page rather than the site. A bypass
lasts 5 minutes by default (1, 5, 15 or 30 in settings) and dies with the
browser.

Unit tests cover the pure logic: `node --test tests/unit/*.js`. Store
packages come from `node tools/build.mjs`; build, lint, phone-width audit,
the upgrade and import checks, CI and releasing to the three stores are
described in `knowledge/usage_guides/DEVOPS_GUIDE.md`. The four usage guides
(developer, user, DevOps, QA) are in `knowledge/usage_guides/`.

Supported: Chrome 121+, Edge 121+, Firefox 140+ and Firefox for Android 142+.
Chrome for Android and iOS browsers do not run extensions.

---

## Install for development

**Chrome or Edge**

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the **`src/`** directory — not the repository root — or
   `dist/chrome/` after `node tools/build.mjs`

Loading `src/` shows a warning that `browser_specific_settings` is not
recognized. That key is for Firefox; the built `dist/chrome/` does not carry it.

**Firefox**

1. Run `node tools/build.mjs`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and pick `dist/firefox/manifest.json`

Firefox for Android: see `knowledge/usage_guides/DEVOPS_GUIDE.md`.

The welcome page (onboarding) opens automatically on first install; an update
opens nothing. The toolbar button opens a popup with today's pauses,
"Steer clear of <this site>", snooze, and links to statistics and settings.

---

## Verify it works

Numbered criteria correspond to the success criteria in
`knowledge/plans/STEER_CLEAR_MVP.md`.

| # | Check | Expected |
|---|---|---|
| 1 | Add `example.com`, visit `https://example.com` | Reminder page appears |
| 2 | Visit `https://example.com/some/path?q=1` | Full URL shown on the reminder page |
| 3 | Leave the site's target blank | "Go where I meant to" uses the global default |
| 4 | Set a per-site target | Button uses that instead |
| 5 | Set a per-site reason | That reason is shown, not the default one |
| 6 | With subdomains on, visit `www.example.com` | Reminder page appears |
| 7 | With subdomains off, visit `www.example.com` | Site loads normally |
| 8 | Click "Continue anyway" | Site loads |
| 9 | Wait 5 minutes, revisit | Reminder page returns |
| 10 | Bypass, restart Chrome, revisit | Reminder page returns |
| 11 | Restart Chrome | Settings still present |
| 12 | Untick a site's checkbox | Site loads normally |

**Debugging:** on `chrome://extensions`, click **service worker** under Steer
Clear to open its console. All log lines are prefixed `[steer-clear]`.

To inspect the live rules, run this in that console:

```js
chrome.declarativeNetRequest.getDynamicRules().then(console.table)
```

---

## Run the tests

```bash
node --test tests/unit/*.js
```

539 tests covering pattern normalization, regex generation, subdomain matching,
lookalike-domain rejection, rule construction (schedules and snooze included),
schedules, outcome-tagged statistics and progress figures, the daily
allowance, the settings schema, legacy
migration, the sync storage layout and quota, config mutations, pause
presentation and style rotation, the continue gate, bypass badges and tab
return, palette contrast, the worker's message handlers (with `chrome.*`
stubbed), snooze, install-time behavior (nothing written to sync), the
rating prompt, onboarding presets, the add-site click handlers' call order,
the cross-browser manifest and its exact permissions and version, source-URL
extraction, browser detection, the degraded continue path when settings
cannot be read, export and import, the store listing copy rules, the privacy
disclosures, and every document's table of contents. Schema fixtures,
including a config captured from a real 1.0.0 install, are in
`tests/unit/fixtures/`. No dependencies; Node 20+.

Browser behavior is checked in Chromium by `tools/mobile_audit.mjs`,
`tools/upgrade_check.mjs` (1.0.0 upgrade, corrupt item, rollback) and
`tools/import_export_check.mjs`, and by hand with the matrix in
`knowledge/usage_guides/QA_GUIDE.md` (Firefox needs the hand run).

---

## How it works

```
Navigation to a blocked site
        │
        ▼
declarativeNetRequest regex rule
        │  regexSubstitution: blocked.html?from=\0
        ▼
blocked.html asks the worker (GET_RESOLVED_SITE)
        │
        ├── per-site overrides ──► fall back to the defaults
        ├── settings unreadable ──► defaults, degraded: continue still works
        │
        └── renders: your reason, [Go where I meant to], [Continue anyway]
```

**Why regex rules rather than the simpler domain condition:** declarativeNetRequest
cannot inject the originally-requested URL into a redirect through
`queryTransform` — `addOrReplaceParams` takes static values only. Preserving the
source URL requires `regexFilter` paired with `regexSubstitution`, where `\0`
expands to the whole matched URL.

**Rule and settings ownership:** the service worker is the only writer of
dynamic rules and of the synced settings. Pages read storage directly and
change it only by sending a message (`ADD_SITES`, `UPDATE_SITE`, `REMOVE_SITE`,
`UPDATE_DEFAULTS`, `IMPORT_SETTINGS`), which the worker applies one at a time.
Rules are therefore always derivable from storage, so a full rebuild is always
safe and cannot drift. Settings live one site per sync item; the 1.x `config`
item is read and never written, so rolling back to 1.x is safe.

---

## Project layout

```
steer-clear/
├── src/                        # Load THIS directory as the unpacked extension
│   ├── manifest.json
│   ├── constants.js
│   ├── background/
│   │   ├── service_worker.js   # Listener registration only
│   │   ├── rule_sync.js        # Owns dynamic rules + bypass lifecycle
│   │   ├── bypass_badges.js    # Bypass badge countdown, return to the pause
│   │   ├── message_handlers.js # The worker's message table
│   │   ├── degraded.js         # Pure: continue when settings can't be read
│   │   ├── rules.js            # Pure config -> rules (unit-tested)
│   │   ├── pause.js            # Pure pause-screen decisions (variant, style, reason, allowance)
│   │   ├── schedule.js         # Pure schedules: active-at, validation, next boundary
│   │   ├── stats.js            # Pure event log: one event per view, outcomes
│   │   ├── progress.js         # Pure progress figures (steer rate, steered-clear days)
│   │   ├── pause_views.js      # Records pause-page views and choices
│   │   ├── settings_schema.js  # Settings field table, validation, resolution
│   │   ├── sync_layout.js      # Config across sync items, quota check
│   │   ├── config_mutations.js # Pure planners for every config change
│   │   ├── config.js           # Storage read, serialized writes
│   │   ├── settings_io.js      # Pure export file and import parsing
│   │   ├── install.js          # First install opens onboarding; never writes
│   │   ├── presets.js          # Onboarding's site chips
│   │   ├── rating.js           # Pure rating-prompt rules
│   │   ├── snooze.js           # Pure snooze timing
│   │   └── lifecycle*.js       # One-time flags (worker-written)
│   ├── blocked/                # The pause page and its style views
│   ├── options/                # Settings UI (form, site list, editors, export/import)
│   ├── stats/                  # Statistics page
│   ├── popup/                  # Toolbar popup: today, quick-add, snooze
│   ├── onboarding/             # Two-step welcome page opened on install
│   ├── shared/                 # Page helpers, rating banner, CSS tokens/base
│   └── icons/                  # PLACEHOLDER — see icons/README.md
├── tools/
│   ├── build.mjs               # Builds dist/ and both store zips
│   ├── manifest_targets.mjs    # Pure per-browser manifest derivation
│   ├── mobile_audit.mjs        # 360px / 44px-target audit in Chromium
│   ├── upgrade_check.mjs       # 1.0.0 -> this tree -> 1.0.0 in one Chromium profile
│   ├── import_export_check.mjs # Export and import through the settings page
│   └── screenshots.mjs         # Regenerates store/screenshots/ (1280×800 + promo tile)
├── tests/unit/                 # Unit tests; fixtures/ holds the schema fixtures
├── store/                      # Store submission materials
│   ├── LISTING.md              # Chrome Web Store (and the copy rules)
│   ├── LISTING_EDGE.md         # Edge Add-ons
│   ├── LISTING_FIREFOX.md      # addons.mozilla.org
│   └── PRIVACY_POLICY.md
└── knowledge/                  # plans/, setup/, usage_guides/, market_research/
```

---

## Before publishing

Version 1.0.0 passed review and is
[live on the Chrome Web Store](https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn).
Version 2.0.0 (this tree) is ready for the Chrome Web Store, Edge Add-ons and
addons.mozilla.org but not uploaded. The public launch has not been announced
yet. Release status is tracked in `knowledge/setup/SUBMISSION_STEPS.md`;
listing copy, permission justifications and data-use disclosures live in
`store/LISTING*.md`; the Featured nomination, promo video and category test
are tracked in `knowledge/setup/STORE_PRESENCE.md`.

Outstanding: **icons** are usable but should be redrawn for 16px legibility.

To ship an update, follow "Release to the three stores" in
`knowledge/usage_guides/DEVOPS_GUIDE.md`: bump `version` (the manifest test
and the changelog must agree), rebuild with `node tools/build.mjs`, and upload
each store's zip. Expect closer-than-average review:
`declarativeNetRequest` with redirect is the permission set traffic-hijacking
extensions use.

---

## License

[MIT](LICENSE)
