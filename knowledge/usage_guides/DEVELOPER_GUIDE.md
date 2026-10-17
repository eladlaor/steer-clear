# Developer Guide

## Table of Contents

- [Summary](#summary)
- [Set up and run it](#set-up-and-run-it)
- [How is the code organized?](#how-is-the-code-organized)
- [Who is allowed to write the settings?](#who-is-allowed-to-write-the-settings)
- [How are settings stored in sync?](#how-are-settings-stored-in-sync)
- [What happens when the settings cannot be read?](#what-happens-when-the-settings-cannot-be-read)
- [Why must the permission prompt come before any await?](#why-must-the-permission-prompt-come-before-any-await)
- [Coding conventions](#coding-conventions)
- [Contribution workflow](#contribution-workflow)

---

## Summary

- Vanilla JavaScript, Manifest V3, no bundler and no npm dependencies. Load
  `src/` unpacked; run `node --test tests/unit/*.js` (Node 20+).
- The background worker is the **only** writer of declarativeNetRequest rules
  and of the synced settings. Pages read storage directly and change it only
  by sending a message.
- Settings live in `storage.sync` as `schema`, `settings` and one `site:<id>`
  item per site. The 1.x `config` item is read and never written.
- Pure logic lives in modules that never touch `chrome.*` and is unit-tested
  first (TDD); `chrome.*` glue is tested with `tests/unit/helpers/fake_chrome.js`.
- Fail fast with a `[steer-clear]`-prefixed log; the one deliberate exception
  is the loud, logged degraded path that keeps "continue" working.
- The privacy stance is a product feature: no network, no accounts, no
  analytics, no remote code, per-site host access. Never weaken it.

---

## Set up and run it

```bash
git clone https://github.com/eladlaor/steer-clear.git
cd steer-clear
node --test tests/unit/*.js      # unit tests, no install step
node tools/build.mjs             # dist/chrome, dist/firefox and both zips
```

Load `src/` (or `dist/chrome/`) at `chrome://extensions` with Developer mode
on, or `dist/firefox/manifest.json` at `about:debugging` in Firefox. The
service worker's console (the **service worker** link on
`chrome://extensions`) shows every `[steer-clear]` log line.

The browser tools (`tools/mobile_audit.mjs`, `tools/screenshots.mjs`,
`tools/upgrade_check.mjs`, `tools/import_export_check.mjs`) need Playwright;
see `DEVOPS_GUIDE.md` for the pinned version.

---

## How is the code organized?

By surface, then by domain. One module, one reason to change; files stay
under about 500 lines.

| Path | What lives there |
|---|---|
| `src/background/service_worker.js` | Listener registration only |
| `src/background/rule_sync.js` | Rebuilding rules, bypasses (including the degraded one), snooze, schedule alarm |
| `src/background/message_handlers.js` | The message table: every page-to-worker message |
| `src/background/degraded.js` | Pure: which installed rules match a URL; the pause page's view when settings are unreadable |
| `src/background/settings_schema.js` | Pure: the settings field table, validation, `resolveSettings` |
| `src/background/config_migration.js` | Pure: 1.x `config` to v3, in memory, on every read |
| `src/background/sync_layout.js` | Pure: assembling the config from sync items; the byte-measured quota check |
| `src/background/config_mutations.js` | Pure: one planner per change (`planAddSites`, `planUpdateSite`, `planRemoveSite`, `planUpdateDefaults`, `planImport`) |
| `src/background/config.js` | Storage I/O: `readConfig` (never writes) and `applyMutation`, behind the worker's serial queue |
| `src/background/serial_queue.js` | The one-at-a-time queue that config mutations and rule rebuilds run through |
| `src/background/timezone_watch.js` | Notices a timezone or DST change while a schedule is set, so the worker rebuilds |
| `src/background/settings_io.js` | Pure: the export file and import parsing |
| `src/background/rules.js`, `pause.js`, `schedule.js`, `stats.js`, `progress.js` | Pure: rules, pause-screen decisions, schedules, event log, progress figures |
| `src/blocked/` | The pause page and its style views |
| `src/options/` | Settings: defaults form, site list, reasons and schedule editors, the "Your data" panel |
| `src/popup/`, `src/onboarding/`, `src/stats/` | Toolbar popup, welcome page, statistics |
| `src/shared/` | Page helpers (messaging, add-then-ask-for-access, source URL, browser detection) and CSS tokens |
| `src/constants.js` | Every behavior-affecting string and number |
| `tools/` | Build, audits, screenshots and browser checks (developer-only) |

The contract every goal codes against (schema v3, data layout, message table)
is in `knowledge/plans/V2_COMPETITIVE_UPGRADE.md`.

---

## Who is allowed to write the settings?

Only the worker. Pages send `ADD_SITES`, `UPDATE_SITE`, `REMOVE_SITE`,
`UPDATE_DEFAULTS` or `IMPORT_SETTINGS`; the worker runs each through one
promise queue that reads the current items, plans the change with a pure
planner, checks the sync quota, and writes. Pages re-render on
`storage.onChanged`.

The misunderstanding to avoid: "the page already has the config, so it can
save it." A settings tab holds a copy read minutes ago. Saving that copy
would erase a site added from the popup in between. Sending only the change
lets the worker apply it to what is stored now.

---

## How are settings stored in sync?

One item per site, because browsers refuse any sync item over 8,192 bytes and
a single list hits that at about 20 sites. `schema: 3` marks that sites live
in `site:<id>` items; `settings` holds the global defaults.

- **Reading never writes.** On a second device, sync can install the
  extension before the data arrives; a write then would be the newest and
  could replace the user's settings everywhere.
- **The first write materializes.** If only the 1.x `config` exists, the first
  change also writes `schema` and every legacy site as its own item, with ids
  every device derives identically. `settings` is written only when a default
  changes.
- **Only named keys are removed.** A planner removes the site the user
  removed (or, for a confirmed import, the listed sites it replaces), never a
  stray item, so out-of-order sync delivery can never delete anything.
- **Quota is bytes.** `itemBytes` measures UTF-8 bytes of key plus JSON value;
  a Hebrew reason costs two bytes per character.

---

## What happens when the settings cannot be read?

The pause page must never trap the user. If `readConfig` throws (a corrupt
item, or `schema: 4` from a newer version on another device):

- `GET_RESOLVED_SITE` answers with the host and default settings and
  `degraded: true`;
- `GRANT_BYPASS` lifts the installed rules whose regex matches the host
  (`ruleIdsMatchingUrl`), keeps them in session storage as `liftedRules`, and
  puts them back when the pass ends if a rebuild still fails.

Every step logs a `[steer-clear]` error. This is the one deliberate safety
path, not a silent fallback. A single invalid `site:*` item is different: it
is skipped and listed in `invalidSites` (shown on the settings page), and the
other sites keep working.

---

## Why must the permission prompt come before any await?

Firefox drops the user gesture at the first `await`, and may close the popup
as soon as the prompt opens. So every add-site click handler sends the worker
message without awaiting it and calls `permissions.request` in the same
synchronous tick (`src/shared/site_access.js`). Import's "Grant all" handler
calls `permissions.request` and nothing else. The worker's
`permissions.onAdded` rebuild activates whatever was granted.

---

## Coding conventions

- **Constants:** no inline behavior strings or numbers; add them to
  `src/constants.js` (tool-only ones to `tools/tool_constants.mjs`). Enums are
  frozen objects.
- **Errors:** wrap each async operation, log with a `[steer-clear]` prefix and
  a context object (`{ host, siteId, error: error.message }`), and rethrow.
  Side observations (statistics, badges) log and continue; config mutations
  reject and write nothing.
- **Validation messages name the field path** (`defaults.bypassMinutes`,
  `site:abc.overrides.reasons[2]`), because the user sees them.
- **No new constraint on a value 1.x accepted.** Input limits live in the UI.
- **Pages:** follow the system colour scheme through `src/shared/tokens.css`;
  every control at least 44×44 CSS px; usable at 360 CSS px wide.
- **Docs:** in `knowledge/`, `UPPERCASE_NAME.md`, a clickable TOC and a Summary
  first (checked by `tests/unit/docs_toc.test.js`).

---

## Contribution workflow

1. Write or extend the unit test for the pure logic first; watch it fail.
2. Implement until `node --test tests/unit/*.js` passes.
3. For page changes, run `node tools/mobile_audit.mjs`; for storage changes,
   `node tools/upgrade_check.mjs`.
4. If you add a permission, storage key or `tabs` call, update
   `store/PRIVACY_POLICY.md` and the three listings in the same change.
5. Add a user-visible entry under `[Unreleased]` in `CHANGELOG.md`.
6. Commit with a plain, human message describing the change.
