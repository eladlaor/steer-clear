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

### Fixed

- Redirects had no effect: `declarativeNetRequest` redirect actions require host
  permissions, which the manifest did not declare. Chrome installed the rules
  and silently ignored them. Declared `http://*/*` and `https://*/*`.

### Changed

- Privacy-policy contact address is now a personal address rather than a work one.
