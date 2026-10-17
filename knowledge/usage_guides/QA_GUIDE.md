# QA Guide

## Table of Contents

- [Summary](#summary)
- [Automated suites](#automated-suites)
- [Test data and fixtures](#test-data-and-fixtures)
- [Manual check matrix](#manual-check-matrix)
  - [G1 Reach: browsers, phone width, private windows](#g1-reach-browsers-phone-width-private-windows)
  - [G2 Pause screens and bypasses that end](#g2-pause-screens-and-bypasses-that-end)
  - [G3 Schedules, daily allowance, progress](#g3-schedules-daily-allowance-progress)
  - [G4 Onboarding, popup, accessibility, rating](#g4-onboarding-popup-accessibility-rating)
  - [G5-A Upgrade, rollback and corrupt data](#g5-a-upgrade-rollback-and-corrupt-data)
  - [G5-B Export, import and store assets](#g5-b-export-import-and-store-assets)
- [Results log](#results-log)
- [Reporting a bug](#reporting-a-bug)

---

## Summary

- Before every commit that touches `src/`: `node --test tests/unit/*.js`,
  `node tools/build.mjs` and `node tools/mobile_audit.mjs`. CI runs the same
  plus `web-ext lint`.
- Before a release, also run the two browser checks that need git history or
  a download: `node tools/upgrade_check.mjs` (1.0.0 upgrade, corrupt item,
  rollback, 40+ sites) and `node tools/import_export_check.mjs`.
- Pure logic is covered by unit tests; pages and browser behavior by the
  manual matrix below. Where a manual check is automated in Chromium, the
  table says so, and Firefox still needs the hand run.
- Record every run in the [results log](#results-log) with browser, version
  and date. Onboarding timings (G4 M1) have not been recorded yet.

---

## Automated suites

| Suite | Command | What it covers |
|---|---|---|
| Unit | `node --test tests/unit/*.js` | Pure logic; the worker's message handlers with `chrome.*` stubbed (`tests/unit/helpers/fake_chrome.js`); the manifest and its exact permissions and version; install-time behavior; the add-site click order; the store listing copy rules; the privacy disclosures; every doc's TOC |
| Build | `node tools/build.mjs` | Both store zips; fails on a missing file |
| Firefox lint | `npx --yes web-ext@<pinned> lint --source-dir dist/firefox --warnings-as-errors` | The validator addons.mozilla.org runs |
| Phone width | `node tools/mobile_audit.mjs` | Every page and state, including popup, onboarding, the import preview and a damaged site item, at 360×740: no sideways scroll, 44×44 px targets |
| Upgrade | `node tools/upgrade_check.mjs` | G5-A M1–M4 in Chromium: 1.0.0 (from the `v1.0.0` tag) to this tree and back in one profile |
| Export and import | `node tools/import_export_check.mjs` | G5-B M2 and the export half of M1 in Chromium, through the real settings page |
| Screenshots | `node tools/screenshots.mjs --out <dir>` | Five 1280×800 listing shots and the 440×280 promo tile; fails on a wrong size |

The browser tools need Playwright and its Chromium; pinned versions are in
`knowledge/usage_guides/DEVOPS_GUIDE.md`. `upgrade_check.mjs` also needs a
clone with tags (`git fetch --tags`).

---

## Test data and fixtures

- `tests/unit/helpers/fake_chrome.js` is an in-memory `chrome.*` that records
  every `storage.sync` write and remove, `storage.local` write, alarm, tab
  created or updated, badge, and dynamic-rule change.
- `tests/unit/fixtures/` holds the schema fixtures the plan defines:

| Fixture | What it is |
|---|---|
| `config_v2_real.json` | The `config` item 1.0.0 wrote, captured from a real 1.0.0 install with `node tools/upgrade_check.mjs --capture tests/unit/fixtures/config_v2_real.json` |
| `config_v2_long_note.json` | A valid v2 config whose global note and one site note are 2,000 characters |
| `sites_typical.js` | 100 sites: 15-character patterns, a 140-character reason and a 60-character destination each |
| `site_heavy_hebrew.js` | One site with five 280-character Hebrew reasons (2 bytes per character) |

- `tools/extension_harness.mjs` seeds demo settings and an outcome-tagged
  history through the extension's own modules, so the browser tools render the
  shape the shipped code writes.

---

## Manual check matrix

Use a fresh browser profile for each install check. Load `dist/chrome/`
(Chrome, Edge) or `dist/firefox/` (Firefox); see `DEVOPS_GUIDE.md` for
Firefox for Android.

### G1 Reach: browsers, phone width, private windows

| Check | Steps | Pass when |
|---|---|---|
| M1 Chrome | Load `dist/chrome` | README checks 1–12 pass |
| M2 Edge | Load `dist/chrome` (and the 1.0.0 zip before listing it) | Add a site, see the reminder, continue; the bypass expires |
| M3 Firefox desktop | `about:debugging` → load `dist/firefox`; add a site | The prompt appears; `https://example.com/a?x=1&y=2#frag` shows the reminder and continuing lands on that exact URL; the bypass expires; revoking access in the Add-ons Manager shows "needs access" |
| M4 Firefox for Android | `web-ext run -t firefox-android`, phone about 360 CSS px wide | Add, grant, navigate, see the reminder, continue, all by tapping, without zoom or sideways scroll, every control at least 44×44 CSS px |
| M5 Private windows | Firefox private window without "Run in Private Windows"; Chrome incognito with "Allow in Incognito" off | A listed site loads normally (documented in the user guide) |
| M6 Raw source | Chrome: load `src/` unpacked | Works; the `browser_specific_settings` warning is expected |

### G2 Pause screens and bypasses that end

| Check | Steps | Pass when |
|---|---|---|
| M1 Renders | Each style and variant, Chrome and Firefox, light and dark, 1280×800 and 360×740 | No console error; site name, reason and both buttons visible; no scrolling at 1280×800; the destination button visible at 360×740; no overflow |
| M2 Variation | Visit one site three times | Each visit looks different and shows the reason; the notice shows on the first visit only |
| M3 Badge | reddit.com in Chrome and Firefox desktop: continue | The tab's badge shows `5m`, counts down each minute, clears at expiry |
| M4 Return | "Bring the pause back" on, 1-minute bypass, youtube.com, click between videos | At expiry the tab shows the pause page; with it off, only the badge clears |
| M5 Breathing | Pause length 0, then 20 s; also with reduced motion | About 10 s, then 2 breaths; continue unlocks after the last breath; the destination button works throughout; no animation with reduced motion, cue and counter still advance |
| M6 Per-site style | Override one site's style | Applies to that site only; "Use default" restores inheritance |
| M7 Intention | Pick the intention style | The auto-continue control is disabled with an explanation |

### G3 Schedules, daily allowance, progress

| Check | Steps | Pass when |
|---|---|---|
| M1 One event per view | Reload the pause page 3 times, then retype the URL within a minute; type an address without pressing Enter | One interception; a prerendered page logs nothing |
| M2 Schedule | A schedule ending 2 minutes from now | The site loads normally after the boundary with no action; the reminder returns at the next start |
| M3 Daily limit | Limit 2, third visit of the day | The over-limit line, a 30 s wait, then a working continue; the settings link opens the limit field |
| M4 Progress | 2 steers, 1 continue | The stats page shows the matching steer rate, steered-clear days and today |
| M5 Erase | Erase statistics | Steer rate, steered-clear days and continues-today reset; `lifecycle` is untouched |

### G4 Onboarding, popup, accessibility, rating

**M1 First pause in 60 seconds and 4 clicks.** Fresh profile, fresh install,
in Chrome, Firefox desktop and Firefox for Android. Start a timer when
onboarding opens: click the **reddit.com** chip (1), **Turn on** (2),
**Allow** in the prompt (3), **Try it: open reddit.com** (4). Pass when the
reminder shows within 60 s and 4 clicks; record both numbers. Also record the
exact Chrome prompt wording with 1, 3 and 10 sites picked, and the threshold
if it collapses to "on a number of websites".

| Check | Steps | Pass when |
|---|---|---|
| M2 Denied prompt | Pick 2 sites, Turn on, **Deny** | "Almost there"; settings lists both as "needs access" with a working Grant access button |
| M3 Second device | Second Chrome profile on the same sync account with 3 sites; install | "Your sites synced from another device" once they arrive; the first device's sites are intact |
| M4 Quick-add | Chrome and Firefox desktop, popup on an unlisted site | The prompt shows; the site is in settings even if the popup closed; reloading after granting shows the reminder; hidden on `about:`/`chrome:` pages |
| M5 Snooze | Popup → Snooze 15 min | Listed sites load; time left shows; "Resume now" restores at once; a restart ends it |
| M6 Keyboard | Every page, Tab only | Every action reachable, visible focus ring, no trap; Escape stops a countdown |
| M7 VoiceOver | Pause page with a pause length | Reads the site, the reason, and why continue is disabled; the countdown is announced at start and stop only |
| M8 Rating | 10 steers, then the popup and statistics | The banner shows; "Rate Steer Clear" opens this browser's reviews page; never returns after either button or 3 showings |
| M9 Upgrade | Install 1.0.0, add sites, upgrade in place | No tab opens; every setting is intact |

### G5-A Upgrade, rollback and corrupt data

Automated in Chromium by `node tools/upgrade_check.mjs`; run by hand in
Firefox desktop (`about:debugging` → reload after replacing the folder).

| Check | Steps | Pass when |
|---|---|---|
| M1 Upgrade | Install 1.0.0, add 3 sites with notes and overrides, upgrade in place, open settings, edit a site and a default | Every value is present and behaves as before; `storage.sync.config` is byte-identical before and after, including after the edits |
| M2 Many sites | Same with 40 sites | Adding a 41st site succeeds |
| M3 Rollback | After M1 and edits, load 1.0.0 again | It reads its unchanged `config` and lists its sites |
| M4 Corrupt item | In the worker console, overwrite one `site:<id>` with `{ "id": 42 }` | Other sites keep working; settings names the bad item; continue on the corrupt site's pause page still works; "Remove damaged item" clears it and nothing else |

### G5-B Export, import and store assets

| Check | Steps | Pass when |
|---|---|---|
| M1 Chrome to Firefox | Export in Chrome; import the file in Firefox; click **Grant all** | Same sites and settings; one prompt activates them all. The export half is automated by `import_export_check.mjs` |
| M2 Invalid import | Edit the file's `defaults.bypassMinutes` to 7; import | Refused with a message naming `defaults.bypassMinutes`; settings unchanged. Automated by `import_export_check.mjs` |
| M3 Store assets | `node tools/screenshots.mjs`; review the three listings | Screenshots regenerated and committed; `store/LISTING*.md` ready to paste |

---

## Results log

| Date | Check | Browser and version | Result | Notes |
|---|---|---|---|---|
| 2026-10-17 | G5-A M1–M4 (`tools/upgrade_check.mjs`) | Playwright Chromium build 1248 | Pass | 1.0.0 from the `v1.0.0` tag; reload via chrome://extensions in developer mode |
| 2026-10-17 | G5-B M2 and M1 export half (`tools/import_export_check.mjs`) | Playwright Chromium build 1248 | Pass | Message: "defaults.bypassMinutes must be one of 1, 5, 15, 30, got 7" |
| 2026-10-17 | Phone-width audit incl. import states | Playwright Chromium build 1248 | Pass | 23 states |
| 2026-10-17 | Release-readiness: unit suite, both builds, `web-ext@10.7.0 lint --warnings-as-errors`, phone-width audit, screenshots regenerated | Node 26.11.1; Playwright Chromium | Pass | 569 unit tests; lint 0 errors, 0 warnings, 0 notices |
| — | G1, G2, G3, G4 M1–M9, G5-A in Firefox, G5-B M1 import in Firefox | — | Not run yet | Onboarding timings and prompt wording still to record |

---

## Reporting a bug

Record: the browser and version, the extension version (`chrome://extensions`
or `about:addons`), the exact steps, what happened and what was expected, and
the `[steer-clear]` lines from the service worker console (Chrome: **service
worker** link on `chrome://extensions`; Firefox: **Inspect** on
`about:debugging`). Never include a site list or statistics you would not want
shared; they are the user's own data.
