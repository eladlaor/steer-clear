# DevOps Guide

## Table of Contents

- [Summary](#summary)
- [Build the store packages](#build-the-store-packages)
- [Lint the Firefox package](#lint-the-firefox-package)
- [Run the phone-width audit](#run-the-phone-width-audit)
- [Run the upgrade and import checks](#run-the-upgrade-and-import-checks)
- [Continuous integration](#continuous-integration)
- [Release to the three stores](#release-to-the-three-stores)
- [Pinned tool versions](#pinned-tool-versions)
- [Load the extension for manual checks](#load-the-extension-for-manual-checks)
- [Known lint and load warnings](#known-lint-and-load-warnings)

---

## Summary

- `node tools/build.mjs` writes `dist/steer-clear-chrome-<version>.zip` (Chrome
  Web Store and Edge Add-ons) and `dist/steer-clear-firefox-<version>.zip`
  (addons.mozilla.org), plus the unpacked folders `dist/chrome/` and
  `dist/firefox/`.
- `npx --yes web-ext@10.7.0 lint --source-dir dist/firefox --warnings-as-errors`
  must report 0 errors and 0 warnings.
- `node tools/mobile_audit.mjs` must pass: no sideways scrolling at 360×740 and
  every tap target at least 44×44 CSS px.
- CI (`.github/workflows/ci.yml`) runs all of the above plus the unit tests on
  every push and pull request. It holds no secrets and publishes nothing.
- Before a release, `node tools/upgrade_check.mjs` and
  `node tools/import_export_check.mjs` must pass (they need git tags and a
  browser, so CI does not run them).
- Releasing: bump `version`, update the manifest test and the changelog
  together, build, then upload the same version to all three stores; see
  [Release to the three stores](#release-to-the-three-stores). Store
  submission details live in `knowledge/setup/SUBMISSION_STEPS.md`.

---

## Build the store packages

```bash
node tools/build.mjs
```

Needs Node 20+ and the system `zip` and `unzip` commands; no npm packages.

`src/manifest.json` is the single cross-browser manifest. The build copies
`src/` to `dist/<target>/` without `*.md` and `.DS_Store`, writes a derived
manifest (`tools/manifest_targets.mjs`), zips the folder's contents so
`manifest.json` sits at the zip root, then lists the zip and fails if the
manifest is not at the root or an excluded file slipped in.

| Target | Store | Manifest changes |
|---|---|---|
| `chrome` | Chrome Web Store, Edge Add-ons | Drops `browser_specific_settings` and `background.scripts` |
| `firefox` | addons.mozilla.org (desktop and Android) | Drops `background.service_worker` and `minimum_chrome_version` |

To ship an update, bump `version` in `src/manifest.json`, rebuild, and upload
each zip to its store. Every store refuses a version that has not increased.

---

## Lint the Firefox package

```bash
node tools/build.mjs
npx --yes web-ext@10.7.0 lint --source-dir dist/firefox --warnings-as-errors
```

This is the same validator addons.mozilla.org runs on upload. The expected
result is `errors 0, notices 0, warnings 0`.

---

## Run the phone-width audit

```bash
npm install --global playwright@1.64.0
npx playwright install chromium
node tools/mobile_audit.mjs
```

The audit loads `src/` unpacked in Chromium emulating a touch phone at 360×740.
It first checks onboarding as a new user sees it (nothing picked, sites picked,
turned on), then seeds demo data and checks the reminder page (several states),
the settings page with every site expanded, the statistics page with the rating
banner, onboarding with synced sites, and the toolbar popup (with and without
quick-add, and snoozed). It fails on sideways scrolling, on any visible
interactive element smaller than 44×44 CSS px (a checkbox is measured by its
label), on an uncaught page error, on a page with no interactive element at
all, and on a state whose expected element did not render. The browser's own
permission prompt cannot be clicked by automation, so the "turned on" and
quick-add states stand in for it inside the audited page only. Links displayed inline inside a sentence are
exempt, following WCAG 2.5.8.

Playwright cannot load a Firefox extension, so Firefox and Firefox for Android
layouts are covered by the manual checks in the plan (G1 M3 and M4).

`tools/screenshots.mjs` uses the same loader (`tools/extension_harness.mjs`).
It writes the five 1280×800 listing screenshots and the 440×280 small promo
tile to `store/screenshots/` (or `--out <dir>`), and fails if any file is not
exactly that size.

---

## Run the upgrade and import checks

```bash
git fetch --tags        # upgrade_check needs the v1.0.0 tag
node tools/upgrade_check.mjs
node tools/import_export_check.mjs
```

`upgrade_check.mjs` loads one unpacked-extension directory in Chromium and
swaps its contents between the `v1.0.0` tag and `src/`, reloading the
extension in place from `chrome://extensions` (developer mode on), so the
extension id and storage carry over as in a store update. It checks the
1.0.0 `config` item stays byte-identical through the upgrade and through edits,
that a corrupt `site:*` item hides nothing else, that rolling back to 1.0.0
works, and that 40 legacy sites upgrade and accept a 41st.
`--capture <file>` also saves the `config` 1.0.0 wrote; that is how
`tests/unit/fixtures/config_v2_real.json` was made.

`import_export_check.mjs` clicks "Export settings" on the real settings page,
imports an edited copy with an invalid `bypassMinutes` (refused, storage
unchanged), then imports a valid copy and confirms.

---

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request, on Node 24:

1. `node --test tests/unit/*.js`
2. `node tools/build.mjs`
3. the pinned `web-ext lint` with `--warnings-as-errors`
4. installs the pinned Playwright and its Chromium, then `node tools/mobile_audit.mjs`
5. uploads both zips as the `steer-clear-packages` workflow artifact

The workflow has read-only repository permissions and uses no secrets.

---

## Release to the three stores

The same version ships to all three stores.

1. Set `version` in `src/manifest.json` and `RELEASE_VERSION` in
   `tests/unit/manifest.test.js`; promote `[Unreleased]` in `CHANGELOG.md` to
   `## [X.Y.Z] - <date>` with its compare link. The manifest test fails until
   all three agree.
2. If a permission, storage key or `tabs` call changed, update
   `store/PRIVACY_POLICY.md` and the three `store/LISTING*.md` files in the same
   change; `tests/unit/privacy_disclosures.test.js` fails until they name it.
3. Run the unit tests, the build, `web-ext lint`, the phone-width audit, and
   the two browser checks above.
4. Upload:

| Store | Package | Listing copy | Steps |
|---|---|---|---|
| Chrome Web Store | `dist/steer-clear-chrome-<version>.zip` | `store/LISTING.md` | `knowledge/setup/SUBMISSION_STEPS.md` |
| Edge Add-ons (Partner Center) | the same Chrome zip | `store/LISTING_EDGE.md` | `knowledge/setup/SUBMISSION_STEPS.md` |
| addons.mozilla.org | `dist/steer-clear-firefox-<version>.zip` | `store/LISTING_FIREFOX.md` | `knowledge/setup/SUBMISSION_STEPS.md` |

5. Re-check the comparison sentence against the named competitors' current
   manifests and record the date in `knowledge/setup/STORE_PRESENCE.md`.
6. Tag the release commit `vX.Y.Z` once the first store accepts it.
   `tools/upgrade_check.mjs` upgrades from `v1.0.0` (its `RELEASED_TAG`);
   point it at the newest published tag when the next storage change lands.

---

## Pinned tool versions

Pinned on 2026-10-16. Bump a version here and in `.github/workflows/ci.yml`
together, and run both tools locally before committing the bump.

| Tool | Version | Why this one |
|---|---|---|
| `web-ext` | 10.7.0 | Latest release older than a day at pin time (10.8.0 was one day old) |
| `playwright` | 1.64.0 | Bundles Chromium build 1248, the build the audit was verified against |
| Node (CI) | 24 | Current LTS line; the code needs 20+ |

---

## Load the extension for manual checks

| Browser | How |
|---|---|
| Chrome, Edge | `chrome://extensions` (or `edge://extensions`) → Developer mode → Load unpacked → `dist/chrome/` |
| Chrome, raw source | Load unpacked → `src/` (see the warning below) |
| Firefox desktop | `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/firefox/manifest.json` |
| Firefox for Android | `npx --yes web-ext@10.7.0 run -t firefox-android --source-dir dist/firefox --android-device <id>` with USB debugging on, or a signed test build |

---

## Known lint and load warnings

- **`web-ext lint`:** none. Any future warning that cannot be removed is listed
  here with its reason.
- **Chrome loading raw `src/`:** Chrome lists `browser_specific_settings` as an
  unrecognized manifest key. This is expected: `src/` is the cross-browser
  source, and the `dist/chrome/` package does not carry the key. Chrome 121+
  ignores `background.scripts` when `service_worker` is present.
