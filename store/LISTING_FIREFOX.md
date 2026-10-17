# Firefox Add-ons (AMO) Listing — Steer Clear

## Table of Contents

- [Summary](#summary)
- [Identity: add-on id and slug](#identity-add-on-id-and-slug)
- [What to upload](#what-to-upload)
- [Listing fields](#listing-fields)
- [Data collection declaration](#data-collection-declaration)
- [What is stored, permissions and tab functions](#what-is-stored-permissions-and-tab-functions)
- [Source code and notes to the reviewer](#source-code-and-notes-to-the-reviewer)
- [After it is live](#after-it-is-live)

---

## Summary

Paste-ready text for the addons.mozilla.org submission of Steer Clear for
Firefox desktop (140+) and Firefox for Android (142+). The package is
`dist/steer-clear-firefox-<version>.zip` from `node tools/build.mjs`, checked
with `web-ext lint` in CI. The slug is **`steer-clear`**. The copy follows the
rules in `store/LISTING.md` and is checked by
`tests/unit/listing_copy.test.js`.

---

## Identity: add-on id and slug

| Item | Value | Status |
|---|---|---|
| Add-on id (`browser_specific_settings.gecko.id`) | `steer-clear@eladlaor` | Permanent once the first version is uploaded; confirm before uploading |
| Slug (listing URL) | `steer-clear` → `https://addons.mozilla.org/firefox/addon/steer-clear/` | Free on 2026-10-17 (the AMO API answered 404 for it). Set it in the submission form; the rating prompt already links to its reviews page |

If the slug is taken by the time of submission, choose another, then change
`STORE_REVIEW_URL.firefox` in `src/constants.js` before building.

---

## What to upload

| Field | Value |
|---|---|
| Package | `dist/steer-clear-firefox-2.0.0.zip` |
| Distribution | On this site (listed) |
| Platforms | Firefox and Firefox for Android |
| Source code | Not required: no minification, bundling or generated code. The package is the source tree with the manifest stripped for Firefox |

---

## Listing fields

### Name

```
Steer Clear
```

### Summary (250 char max)

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

How it works

• Add the sites that pull you in, from the toolbar button or the welcome page
• Write a reason for each, in your own words (up to five, shown in turn)
• Pick where you'd rather land instead
• Go there out of habit, and get your pause rather than the page

Stays noticeable after the first week

• The pause screen changes its layout, colour and wording each time
• Pause styles: your reason, a paced breath, or "What did you come here for?"
• Schedules per site, a snooze, and an optional daily limit that makes the
  pause longer once you have continued enough times
• "Continue anyway" lasts 1, 5, 15 or 30 minutes, with the minutes left on the
  toolbar badge (desktop)
• A statistics page shows how often you steered clear, kept on your device

Private by construction

• No servers. No accounts. No analytics. No network requests at all
• Asks for access only to the sites you add, unlike one sec, LeechBlock NG and Freedom's Pause.
• Your settings travel only with Firefox Sync, which Firefox encrypts end to
  end; your history stays on this device and is deleted after 90 days
• Coming from Chrome? Export your settings there and import the file here
• Open source under the MIT license
```

### Categories

Pick the closest categories the form offers for Firefox and for Android at
submission time (AMO's category list differs from Chrome's and has changed
before); check where similar add-ons such as LeechBlock NG are listed.

### Other fields

| Field | Value |
|---|---|
| Support email | eladlaor88@gmail.com |
| Homepage | `https://github.com/eladlaor/steer-clear` |
| License | MIT |
| Privacy policy | Paste the text of `store/PRIVACY_POLICY.md` (AMO hosts it) |
| Screenshots | `store/screenshots/1-reminder.png` to `5-popup.png` |

---

## Data collection declaration

The manifest declares `data_collection_permissions: { required: ["none"] }`,
which AMO requires of new add-ons.

Rationale: Mozilla counts data as collected when it is handled outside the
add-on or the local browser. Steer Clear transmits nothing: settings sit in
`storage.sync`, which Firefox Sync carries end-to-end encrypted under the
user's own control, and the history sits in `storage.local` on the device.
Neither reaches the developer or any third party.

Open question (plan, open question 1): Mozilla's definition is silent on
`storage.sync`. Ask AMO before the first submission. If AMO requires a
category, declare it, update the privacy policy in the same change, and keep
sync; do not drop it silently.

---

## What is stored, permissions and tab functions

The same facts as `store/PRIVACY_POLICY.md`.

| What | Where |
|---|---|
| Settings and sites (`schema`, `settings`, `site:<id>`; 1.x `config` read only) | `storage.sync`: Firefox Sync on desktop; kept on the device on Firefox for Android |
| `stats` (domain, time, choice, random page id; 90 days) and `lifecycle` (one-time flags) | `storage.local`, this device only |
| `bypasses`, `badgedTabs`, `snooze`, `liftedRules`, `scheduleTzOffset` | `storage.session`, gone when Firefox closes |

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

## Source code and notes to the reviewer

```
No minification, bundling, transpiling or generated code: the package is the
repository's src/ directory with the manifest stripped for Firefox
(tools/build.mjs). Source: https://github.com/eladlaor/steer-clear

To test: install, add example.com on the welcome page and accept the access
prompt, then open https://example.com. The pause page appears; "Continue
anyway" loads the site. Host access is requested one site at a time
(optional_host_permissions); nothing is granted at install. No network
requests, no remote code, no accounts.
```

---

## After it is live

- Confirm the listing URL matches `STORE_REVIEW_URL.firefox`.
- Record the listing URL and the date in
  `knowledge/setup/SUBMISSION_STEPS.md`.
- Run the Firefox for Android manual checks in
  `knowledge/usage_guides/QA_GUIDE.md` against the signed build.
