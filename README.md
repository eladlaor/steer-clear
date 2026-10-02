# Steer Clear

A Chrome extension that catches muscle-memory navigation. Sites on your list
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

Load `src/` as an unpacked extension, add a domain in its settings page, then
navigate to that domain. You get the reminder page rather than the site. Bypass
lasts 5 minutes and dies with the browser.

Unit tests cover the pure logic: `node --test tests/unit/*.js`.

---

## Install for development

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the **`src/`** directory — not the repository root

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

90 tests covering pattern normalization, regex generation, subdomain matching,
lookalike-domain rejection, rule construction, bypass filtering, and
global-versus-per-site resolution. No dependencies; Node 20+.

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
│   └── icons/                  # PLACEHOLDER — see icons/README.md
├── tools/
│   ├── package.sh              # Builds the Web Store upload zip
│   └── screenshots.mjs         # Regenerates store/screenshots/ at 1280×800
├── tests/unit/
├── store/                      # Web Store submission materials
│   ├── LISTING.md
│   └── PRIVACY_POLICY.md
└── knowledge/plans/
```

---

## Before publishing

See `store/LISTING.md` for copy-paste listing text, permission justifications,
and data-use disclosures. Outstanding items requiring you:

- **Icons** are present and usable; redraw for 16px legibility when convenient
- Screenshots, developer registration, publisher settings, and the
  [hosted privacy policy](https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY)
  are done — follow `knowledge/setup/SUBMISSION_STEPS.md` to submit

Expect closer-than-average review: `declarativeNetRequest` with redirect is the
permission set traffic-hijacking extensions use. The justifications in
`store/LISTING.md` are written to address that directly.

---

## License

[MIT](LICENSE)
