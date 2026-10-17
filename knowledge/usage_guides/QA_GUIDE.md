# QA Guide

## Table of Contents

- [Summary](#summary)
- [Automated suites](#automated-suites)
- [Test data and fixtures](#test-data-and-fixtures)
- [Manual checks: onboarding, popup, accessibility, rating (G4)](#manual-checks-onboarding-popup-accessibility-rating-g4)
  - [M1 First pause in 60 seconds and 4 clicks](#m1-first-pause-in-60-seconds-and-4-clicks)
  - [M2 to M9](#m2-to-m9)
  - [Results log](#results-log)
- [Reporting a bug](#reporting-a-bug)

---

## Summary

- Run `node tools/build.mjs`, `node --test tests/unit/*.js` and
  `node tools/mobile_audit.mjs` before every commit that touches `src/`; CI runs
  the same plus `web-ext lint`.
- Pure logic (everything under `src/background/` that does not call `chrome.*`,
  plus the page helpers named in each test file) is covered by unit tests;
  pages and browser behavior are covered by the manual checks below.
- The G4 manual checks (M1–M9) have **not been run yet**. Record each run in
  the [results log](#results-log), with browser, version and date.
- The full manual matrix for every goal lives in
  `knowledge/plans/V2_COMPETITIVE_UPGRADE.md`; this guide holds the steps and
  the recorded results.

---

## Automated suites

| Suite | Command | What it covers |
|---|---|---|
| Unit | `node --test tests/unit/*.js` | Pure logic, the worker's message handlers with `chrome.*` stubbed (`tests/unit/helpers/fake_chrome.js`), the manifest, install-time behavior, and the call order of the add-site click handlers |
| Build | `node tools/build.mjs` | Both store zips; fails on a missing file |
| Firefox lint | `npx --yes web-ext@<pinned> lint --source-dir dist/firefox --warnings-as-errors` | The validator addons.mozilla.org runs |
| Phone width | `node tools/mobile_audit.mjs` | Every page, including popup and onboarding, at 360×740: no sideways scroll, 44×44 px targets |
| Screenshots | `node tools/screenshots.mjs --out <dir>` | Five 1280×800 listing shots and the 440×280 promo tile; fails on a wrong size |

Pinned tool versions are in `knowledge/usage_guides/DEVOPS_GUIDE.md`.

---

## Test data and fixtures

- `tests/unit/helpers/fake_chrome.js` is an in-memory `chrome.*` that records
  every `storage.sync` write and remove, `storage.local` write, alarm, tab
  created or updated, and badge. Install-time tests assert on these logs.
- `tools/extension_harness.mjs` seeds demo settings and an outcome-tagged
  history through the extension's own modules, so the browser tools render the
  shape the shipped code writes.

---

## Manual checks: onboarding, popup, accessibility, rating (G4)

Use a fresh browser profile for each install check. Load the build from
`dist/chrome/` (Chrome, Edge) or `dist/firefox/` (Firefox); see
`DEVOPS_GUIDE.md` for Firefox for Android.

### M1 First pause in 60 seconds and 4 clicks

Fresh profile, fresh install, in Chrome, Firefox desktop and Firefox for
Android. Start a timer when onboarding opens.

1. Click the **reddit.com** chip (click 1).
2. Click **Turn on** (click 2).
3. Click **Allow** in the browser's prompt (click 3).
4. Click **Try it: open reddit.com** (click 4).

Pass when the reminder for reddit.com shows within 60 s and 4 clicks. Record
both numbers. Also record the exact Chrome prompt wording with 1, 3 and 10
sites picked; if many sites collapse it into a generic "on a number of
websites" prompt, note the threshold.

### M2 to M9

| Check | Steps | Pass when |
|---|---|---|
| M2 Denied prompt | In onboarding pick 2 sites, Turn on, **Deny** | Onboarding says "Almost there"; settings lists both as "needs access" with a working Grant access button |
| M3 Second device | Sign a second Chrome profile into the same sync account that has 3 sites; install | Onboarding shows "Your sites synced from another device" once they arrive; the first device's sites are intact afterwards |
| M4 Quick-add | Chrome and Firefox desktop: open a listed-free site, click the toolbar button, click "Steer clear of …" | The prompt shows; the site appears in settings (granted or "needs access") even if the popup closed during the prompt; reloading the tab after granting shows the reminder. On `about:` or `chrome:` pages quick-add is hidden |
| M5 Snooze | Popup → Snooze 15 min | Every listed site loads normally; the popup shows the time left. "Resume now" restores reminders at once. A browser restart also ends the snooze |
| M6 Keyboard | Every page, Tab only | Every action is reachable with a visible focus ring and no trap; Escape stops a running auto-continue countdown |
| M7 VoiceOver (macOS) | Pause page with a pause length | It reads the site, the reason, and why continue is disabled; the countdown is announced at start and on stop, not every second |
| M8 Rating | Record 10 steers (click the destination 10 times), open the popup and the statistics page | The banner shows; "Rate Steer Clear" opens this browser's store reviews page; the banner never returns after either button or after 3 showings |
| M9 Upgrade | Install 1.0.0, add sites, upgrade in place to this build | No tab opens; every setting is intact |

### Results log

| Date | Check | Browser and version | Result | Notes (clicks, seconds, prompt wording) |
|---|---|---|---|---|
| — | M1–M9 | — | Not run yet | — |

---

## Reporting a bug

Record: the browser and version, the extension version (`chrome://extensions`
or `about:addons`), the exact steps, what happened and what was expected, and
the `[steer-clear]` lines from the service worker console (Chrome: **service
worker** link on `chrome://extensions`; Firefox: **Inspect** on
`about:debugging`). Never include a site list or statistics you would not want
shared; they are the user's own data.
