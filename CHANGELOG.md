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

- Interstitial buttons name their destinations ("Wikipedia" / "ynet") instead of
  characterizing the choice ("Go where I meant to" / "Continue anyway"), so
  neither option is phrased as the approved one.
- Host access is now requested per site as it is added, via
  `optional_host_permissions`, replacing the blanket all-sites permission. Sites
  without granted access are inert and say so in settings, with a button to
  grant.

### Fixed

- Redirects had no effect: `declarativeNetRequest` redirect actions require host
  permissions, which the manifest did not declare. Chrome installed the rules
  and silently ignored them. Declared `http://*/*` and `https://*/*`.

### Changed

- Privacy-policy contact address is now a personal address rather than a work one.
