# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Reproducible generation of Web Store screenshots at 1280×800.
- Firefox (desktop 140+) and Firefox for Android (142+) support from the same
  source tree; Edge installs the Chrome package.
- A dependency-free build, `node tools/build.mjs`, that produces separate
  Chrome/Edge and Firefox store zips from one cross-browser manifest.
- Continuous integration running the unit tests, both builds, a pinned
  `web-ext lint` with warnings treated as errors, and a phone-width audit.
- The pause screen changes its layout, colour and wording on every visit so it
  keeps being noticed; a one-time note explains why, and Settings can turn it
  off.
- Pause styles: your reason (default), a paced breathing exercise, an
  intention prompt ("What did you come here for?"), or rotating through all
  three. Your reason is shown in every style; nothing typed is saved.
- Up to five reasons per site (or as defaults), shown in turn.
- A pause length (0–60 s, default 0) before continuing unlocks; the breathing
  style paces one 10-second breath per started 10 s.
- A choice of bypass length: 1, 5, 15 or 30 minutes.
- The toolbar badge shows the minutes left on a bypass in the tabs using it
  and clears when it ends (not available on Firefox for Android).
- Opt-in "When my time is up, bring the pause back": tabs still on the site
  return to the pause page when the bypass ends, including single-page sites
  that never reload.
- Per-site schedules: pick days and up to four time ranges (with "Always" and
  "Weekdays 9–17" presets, and ranges that run past midnight); outside them
  the site loads normally, and reminders switch on and off at the boundaries
  without any action. A bypass that ends outside the schedule leaves the
  site's tabs where they are.
- An opt-in daily allowance: after a chosen number of continues of a site in a
  day, its pause lasts at least 30 seconds until midnight. The pause page says
  why and links straight to the setting; continue is never removed.
- The statistics page answers "is this working?": steered clear vs continued
  over 30 days, the days you steered clear out of the last 7, today's pauses,
  and steered clear vs continued for each site, noting when choices began to
  be tracked.
- The pause page records what you chose (went elsewhere, or continued) with
  each interception; nothing you type is stored.
- A two-step welcome page on first install: pick sites from one-tap chips
  (none preselected) or type your own, optionally add a reason for each, then
  "Turn on" adds them all and asks for access to those sites only. If your
  sites already synced from another device, it says so and skips setup.
- A toolbar popup: today's pauses and the days you steered clear this week,
  "Steer clear of <this site>" for the tab you are on (or a note that it is
  already listed, and whether it is turned off), snooze all reminders for 15,
  30 or 60 minutes (with "Resume now"), and links to statistics and settings.
- After you have chosen the better destination 10 times, the popup and the
  statistics page ask once whether you would rate Steer Clear, with a link
  to this browser's store page; it never returns after you answer or after
  three showings.
- Escape stops a running auto-continue countdown, and the countdown is
  announced once when it starts and when it stops.

### Changed

- Settings are stored one site per sync item under new keys, so the list is
  no longer capped by the 8 KB per-item sync limit; the 1.x settings item is
  read but never modified, so rolling back to 1.x finds it intact.
- Only the background worker writes settings, one change at a time, so a
  settings tab open elsewhere can no longer overwrite a newer change.
- The settings page groups each form into the main fields (reasons,
  destination, pause style) and a collapsed Advanced section; each site's
  customized fields show "Use default" to inherit again.
- The add-site form takes a domain and an optional reason; other per-site
  settings are under "Customize".
- A site with its own destination but no name for it shows that
  destination's address on the button, not the default destination's name.
- The pause page still opens, with default settings, when saved settings
  cannot be read.
- Installing no longer writes default settings to sync storage, and opens the
  welcome page instead of settings; an update opens no tab.
- The toolbar button opens the new popup instead of the statistics page.
- Adding a site from settings, the popup or the welcome page uses one order
  that works in every browser: the site is saved first, then the browser asks
  for access, so a refused or interrupted prompt leaves the site listed as
  "needs access" instead of losing it.
- Pages share one type scale, spacing scale and corner radii; buttons in
  each site row name their site for screen readers, and charts on the
  statistics page describe themselves in words.
- Store screenshots now cover the breathing style and the popup, and a
  440×280 small promo tile is generated with them.
- Every page works at phone width (360 CSS px): no sideways scrolling, and
  every button, field, checkbox and standalone link is at least 44×44 CSS px.
- The statistics popup's minimum width is now the phone width (360 px), so it
  also fits when Firefox for Android opens it as a full tab.
- Pages share one set of colour tokens and base styles, and show a visible
  focus ring for keyboard users.
- The minimum supported Chrome and Edge version is 121.
- An interception is counted once per pause-page view: reloading it, restoring
  the session, or retyping the address within a minute no longer adds to the
  count, and a page the browser preloads while you type is not counted unless
  you open it.
- The statistics page counts "pauses" rather than calling every interception
  "steered clear", since some of them end in a continue.

### Fixed

- Opening settings at a linked field (such as "Turn this off in Settings")
  shows that field's saved value instead of an empty field.
- The reminder page keeps the full original address, including everything
  after an `&` and any `#fragment`, whether or not the browser percent-encodes
  it, so "continue" returns to the exact page that was requested. A fragment the
  browser re-attaches after an encoded address is kept exactly as typed.

### Removed

- `tools/package.sh`, replaced by `tools/build.mjs`.

## [1.0.0] - 2026-10-02

### Added

- Redirect of user-configured domains to a local reminder page instead of the
  requested site, via declarativeNetRequest regex rules.
- Settings page for managing blocked domains, with a global destination and
  reminder note plus optional per-site overrides of each.
- Per-site subdomain-inclusion toggle, defaulting to inclusive.
- Per-site enable/disable without removing the entry.
- Time-boxed 5-minute bypass that removes the rule and reinstates it on expiry;
  bypasses are session-scoped and do not survive a browser restart.
- Unit test suite covering pattern normalization, regex generation, subdomain
  and lookalike-domain matching, rule construction, and setting resolution.
- Chrome Web Store submission materials: listing copy, permission
  justifications, data-use disclosures, and privacy policy.
- Placeholder extension icons with a design brief for replacements.
- Interception statistics: each time a site is intercepted, the configured
  domain and a timestamp are recorded locally. A statistics page shows lifetime
  and 7-day totals, a per-site breakdown, hour-of-day and day-of-week
  distributions, and a 30-day trend, reachable from the toolbar icon and from
  settings.
- One-click permanent erase of all recorded statistics.
- Automatic 90-day retention for individual interception records; per-site
  running totals are kept until erased.
- Per-site display name, used on the interstitial buttons and in settings, so a
  site can be called what the user calls it rather than by bare hostname.
- Name for the default destination, shown on its button.
- Auto-continue mode: the reminder appears, counts down, and proceeds to the
  destination on its own unless stopped. Configurable globally and per site,
  with a configurable countdown (default 3 seconds).
- Config schema v2 with a migration that carries v1 configs forward, filling
  new fields with defaults rather than rejecting the stored config.
- Manifest structural tests, covering the host-permission declaration whose
  absence made every redirect a silent no-op.

### Changed

- The countdown-duration setting is hidden while auto-continue is off, where it
  implied a countdown was running when none was, and toggling auto-continue now
  confirms which state it is in.
- The interstitial logs its resolved settings to the console, so unexpected
  behavior can be diagnosed from the page rather than from stored data.
- Adding a site now collects its name, destination, and reminder in the add
  form, instead of requiring a second pass through Customize on the new row.
- Interstitial buttons name their destinations ("Wikipedia" / "ynet") instead of
  characterizing the choice ("Go where I meant to" / "Continue anyway"), so
  neither option is phrased as the approved one.
- Host access is now requested per site as it is added, via
  `optional_host_permissions`, replacing the blanket all-sites permission. Sites
  without granted access are inert and say so in settings, with a button to
  grant.
- Privacy-policy contact address is now a personal address rather than a work one.

### Fixed

- "Continue anyway" did not work for any site reached via a subdomain: the
  bypass was recorded against the requested host (`www.facebook.com`) while
  redirect rules are keyed on the configured pattern (`facebook.com`), so the
  rule was never lifted and the reminder page reappeared immediately. The
  bypass is now resolved to the configured site before being stored.
- Removed an arbitrary 150 ms delay before the post-bypass redirect; the
  service worker already awaits its rule rebuild before responding.
- The countdown block and its Stop button were permanently visible on the
  interstitial, alongside empty placeholder text, because a class setting
  `display` outranks the `hidden` attribute. The same defect hid nothing on the
  per-site permission banner and the statistics cards.
- An unnamed destination showed the placeholder "somewhere better" on the
  primary button instead of the destination's own hostname.
- Manifest no longer declares a `permissions` entry, which is not a valid
  permission and produced an "unknown permission" warning on load. Added tests
  asserting every `chrome.*` API used in source is declared and that no
  declared permission is unrecognized.
- Redirects had no effect: `declarativeNetRequest` redirect actions require host
  permissions, which the manifest did not declare. Chrome installed the rules
  and silently ignored them. Declared `http://*/*` and `https://*/*`.

[Unreleased]: https://github.com/eladlaor/steer-clear/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/eladlaor/steer-clear/releases/tag/v1.0.0
