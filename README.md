# Steer Clear

A browser extension for Chrome, Edge, Firefox and Firefox for Android that
catches muscle-memory navigation. Sites on your list
show you your own reason instead of loading — plus one click to somewhere you'd
rather be, and an easy way through when you actually mean it.

## Table of Contents

- [Summary](#summary)
- [Install for development](#install-for-development)
- [Verify it works](#verify-it-works)
- [Run the tests](#run-the-tests)
- [How it works](#how-it-works)
- [Project layout](#project-layout)
- [Before publishing](#before-publishing)
- [License](#license)

---

## Summary

Load `src/` (or a built `dist/<target>/`) as an unpacked extension, add a
domain in its settings page, then navigate to that domain. You get the reminder page rather than the site. Bypass
lasts 5 minutes and dies with the browser.

Unit tests cover the pure logic: `node --test tests/unit/*.js`. Store
packages come from `node tools/build.mjs`; build, lint, phone-width audit and
CI are described in `knowledge/usage_guides/DEVOPS_GUIDE.md`.

Supported: Chrome 121+, Edge 121+, Firefox 140+ and Firefox for Android 142+.
Chrome for Android and iOS browsers do not run extensions.

---

## Install for development

**Chrome or Edge**

1. Open `chrome://extensions` (or `edge://extensions`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the **`src/`** directory — not the repository root — or
   `dist/chrome/` after `node tools/build.mjs`

Loading `src/` shows a warning that `browser_specific_settings` is not
recognized. That key is for Firefox; the built `dist/chrome/` does not carry it.

**Firefox**

1. Run `node tools/build.mjs`
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on** and pick `dist/firefox/manifest.json`

Firefox for Android: see `knowledge/usage_guides/DEVOPS_GUIDE.md`.

The settings page opens automatically on first install.

---

## Verify it works

Numbered criteria correspond to the success criteria in
`knowledge/plans/STEER_CLEAR_MVP.md`.

| # | Check | Expected |
|---|---|---|
| 1 | Add `example.com`, visit `https://example.com` | Reminder page appears |
| 2 | Visit `https://example.com/some/path?q=1` | Full URL shown on the reminder page |
| 3 | Leave the site's target blank | "Go where I meant to" uses the global default |
| 4 | Set a per-site target | Button uses that instead |
| 5 | Set a per-site note | That note is shown, not the global one |
| 6 | With subdomains on, visit `www.example.com` | Reminder page appears |
| 7 | With subdomains off, visit `www.example.com` | Site loads normally |
| 8 | Click "Continue anyway" | Site loads |
| 9 | Wait 5 minutes, revisit | Reminder page returns |
| 10 | Bypass, restart Chrome, revisit | Reminder page returns |
| 11 | Restart Chrome | Settings still present |
| 12 | Untick a site's checkbox | Site loads normally |

**Debugging:** on `chrome://extensions`, click **service worker** under Steer
Clear to open its console. All log lines are prefixed `[steer-clear]`.

To inspect the live rules, run this in that console:

```js
chrome.declarativeNetRequest.getDynamicRules().then(console.table)
```

---

## Run the tests

```bash
node --test tests/unit/*.js
```

137 tests covering pattern normalization, regex generation, subdomain matching,
lookalike-domain rejection, rule construction, bypass filtering,
global-versus-per-site resolution, the cross-browser manifest and its per-store
derivation, source-URL extraction, and browser detection. No dependencies;
Node 20+.

The Chrome-dependent surfaces (service worker, options page, interstitial) are
verified manually via the table above — they need a real browser.

---

## How it works

```
Navigation to a blocked site
        │
        ▼
declarativeNetRequest regex rule
        │  regexSubstitution: blocked.html?from=\0
        ▼
blocked.html reads the config from chrome.storage.sync
        │
        ├── per-site target  ──► falls back to global target
        ├── per-site note    ──► falls back to global note
        │
        └── renders: your reason, [Go where I meant to], [Continue anyway]
```

**Why regex rules rather than the simpler domain condition:** declarativeNetRequest
cannot inject the originally-requested URL into a redirect through
`queryTransform` — `addOrReplaceParams` takes static values only. Preserving the
source URL requires `regexFilter` paired with `regexSubstitution`, where `\0`
expands to the whole matched URL.

**Rule ownership:** the service worker is the only writer of dynamic rules. The
options page and interstitial mutate storage or send messages; the worker
observes and rebuilds. Rules are therefore always derivable from storage, so a
full rebuild is always safe and cannot drift.

---

## Project layout

```
steer-clear/
├── src/                        # Load THIS directory as the unpacked extension
│   ├── manifest.json
│   ├── constants.js
│   ├── background/
│   │   ├── service_worker.js   # Owns dynamic rules + bypass lifecycle
│   │   ├── rules.js            # Pure config -> rules (unit-tested)
│   │   └── config.js           # Storage read/write/validate
│   ├── blocked/                # The interstitial
│   ├── options/                # Settings UI
│   ├── stats/                  # Statistics page (the toolbar popup)
│   ├── shared/                 # Page helpers and shared CSS tokens/base
│   └── icons/                  # PLACEHOLDER — see icons/README.md
├── tools/
│   ├── build.mjs               # Builds dist/ and both store zips
│   ├── manifest_targets.mjs    # Pure per-browser manifest derivation
│   ├── mobile_audit.mjs        # 360px / 44px-target audit in Chromium
│   └── screenshots.mjs         # Regenerates store/screenshots/ at 1280×800
├── tests/unit/
├── store/                      # Web Store submission materials
│   ├── LISTING.md
│   └── PRIVACY_POLICY.md
└── knowledge/plans/
```

---

## Before publishing

Version 1.0.0 passed review and is
[live on the Chrome Web Store](https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn).
The public launch has not been announced yet. Release status is tracked in
`knowledge/setup/SUBMISSION_STEPS.md`; listing copy, permission justifications,
and data-use disclosures live in `store/LISTING.md`.

Outstanding: **icons** are usable but should be redrawn for 16px legibility.

To ship an update: bump `version` in `src/manifest.json`, rebuild with
`node tools/build.mjs`, and upload each store's zip. Expect closer-than-average review:
`declarativeNetRequest` with redirect is the permission set traffic-hijacking
extensions use.

---

## License

[MIT](LICENSE)
