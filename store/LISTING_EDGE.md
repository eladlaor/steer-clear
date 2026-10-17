# Edge Add-ons Listing — Steer Clear

## Table of Contents

- [Summary](#summary)
- [What to upload](#what-to-upload)
- [Listing fields](#listing-fields)
- [Properties](#properties)
- [What is stored, permissions and tab functions](#what-is-stored-permissions-and-tab-functions)
- [Notes for certification](#notes-for-certification)
- [After it is live](#after-it-is-live)

---

## Summary

Paste-ready text for the Microsoft Partner Center form that lists Steer Clear
on Edge Add-ons. Edge installs the same package as Chrome
(`dist/steer-clear-chrome-<version>.zip` from `node tools/build.mjs`), so the
copy, the privacy policy and the permission justifications are the Chrome
ones, with Edge's own fields. The copy follows the rules in
`store/LISTING.md` and is checked by `tests/unit/listing_copy.test.js`.

Plan order: the existing 1.0.0 zip goes up first with this copy's 1.0.0
subset (no popup, schedules or export lines), then 2.0.0 replaces it.

---

## What to upload

| Release | Package | Notes |
|---|---|---|
| 1.0.0 | `steer-clear-1.0.0.zip` (the Chrome Web Store upload) | Drop the "STAYS NOTICEABLE" block and the export, Firefox and popup lines from the description |
| 2.0.0 | `dist/steer-clear-chrome-2.0.0.zip` | The full description below |

---

## Listing fields

### Display name

```
Steer Clear
```

### Short description

```
A nudge in your own words, not a wall: your own reason, one click to something better, and you're never locked out.
```

### Description

```
A nudge in your own words, not a wall: your own reason, one click to something better, and you're never locked out.

You didn't decide to open that site. Your fingers did.

Steer Clear is for people who check social and news sites on autopilot. When
you go to a site on your list, you get a short pause instead of the page: the
reason you wrote for yourself, one click to wherever you'd rather be, and a
"continue anyway" button that works.

If you want to stop doomscrolling and cut down on mindless browsing, but every
tool that tries to block distracting sites ends up switched off, this is the
gentler version. It asks once, in your own words, and then lets you decide.

Not for you if you want sites locked: Steer Clear always lets you through.

HOW IT WORKS

• Add the sites that pull you in, from the toolbar button or the welcome page
• Write a reason for each, in your own words (up to five, shown in turn)
• Pick where you'd rather land instead
• Go there out of habit, and get your pause rather than the page

STAYS NOTICEABLE AFTER THE FIRST WEEK

• The pause screen changes its layout, colour and wording each time
• Pause styles: your reason, a paced breath, or "What did you come here for?"
• Schedules per site, a snooze, and an optional daily limit that makes the
  pause longer once you have continued enough times
• "Continue anyway" lasts 1, 5, 15 or 30 minutes, with the minutes left on the
  toolbar badge
• A statistics page shows how often you steered clear, kept on your device

PRIVATE BY CONSTRUCTION

• No servers. No accounts. No analytics. No network requests at all
• Asks for access only to the sites you add, unlike one sec, LeechBlock NG and Freedom's Pause.
• Your history stays on this device and is deleted after 90 days
• Export your settings to a file to move them to another browser
• Open source under the MIT license
```

### Search terms

Edge allows a short list of search terms. Use these, in this order:

```
stop doomscrolling
block distracting sites
mindless browsing
focus
mindful browsing
site blocker
```

---

## Properties

| Field | Value |
|---|---|
| Category | Productivity |
| Privacy policy URL | `https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY` |
| Website | `https://github.com/eladlaor/steer-clear` |
| Support contact | eladlaor88@gmail.com |
| Does it collect personal data? | Same answers as the Chrome "Data-use disclosures" in `store/LISTING.md`: it records, on the device only, the configured domain, time and choice of each pause |
| Mature content | No |

Assets: the 128×128 icon is `src/icons/icon-128.png`; Edge asks for a
300×300 logo, which is the same artwork exported larger; screenshots and the
440×280 small promo tile are in `store/screenshots/`.

---

## What is stored, permissions and tab functions

The same facts as `store/PRIVACY_POLICY.md`.

| What | Where |
|---|---|
| Settings and sites (`schema`, `settings`, `site:<id>`; 1.x `config` read only) | `storage.sync`, synced only by Edge's own sync |
| `stats` (domain, time, choice, random page id; 90 days) and `lifecycle` (one-time flags) | `storage.local`, this device only |
| `bypasses`, `badgedTabs`, `snooze`, `liftedRules`, `scheduleTzOffset` | `storage.session`, gone when Edge closes |

| Permission or function | Use |
|---|---|
| `declarativeNetRequest` | Redirect listed sites to the bundled pause page |
| `storage` | The keys above |
| `alarms` | End passes and snoozes, badge tick, schedules, history pruning |
| `activeTab` | The popup reads the current tab's address after a click |
| `tabs.query` | Find tabs on a site with a running or ended pass; the popup reads the active tab |
| `tabs.update` | Opt-in return of the pause when a pass ends; the welcome page's "Try it" |
| `tabs.getCurrent` | The welcome page finds its own tab |
| `tabs.create` | Open the welcome page on install, and statistics from the popup |

---

## Notes for certification

```
Steer Clear redirects navigations to sites the user adds to a pause page
bundled in the package (blocked/blocked.html). It asks for host access one
site at a time, when the user adds it (optional_host_permissions); nothing is
granted at install. To test: install, add example.com on the welcome page and
accept the access prompt, then open https://example.com. The pause page
appears; "Continue anyway" loads the site. No network requests, no remote
code, no accounts.
```

---

## After it is live

- Put the listing's reviews URL in `STORE_REVIEW_URL.edge` in
  `src/constants.js`, so Edge users get the rating prompt; until then the
  prompt is hidden on Edge (logged at info level).
- Record the listing URL and the date in
  `knowledge/setup/SUBMISSION_STEPS.md`.
