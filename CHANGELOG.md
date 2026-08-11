# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

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

### Added

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

### Fixed

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

### Changed

- Privacy-policy contact address is now a personal address rather than a work one.
