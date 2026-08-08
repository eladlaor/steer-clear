# Steer Clear — MVP Implementation Plan

## Table of Contents

- [Summary](#summary)
- [Problem](#problem)
- [Design Decisions](#design-decisions)
- [Architecture](#architecture)
- [Data Model](#data-model)
- [Component Breakdown](#component-breakdown)
- [Success Criteria (TDD)](#success-criteria-tdd)
- [Distribution](#distribution)
- [Out of Scope](#out-of-scope)

---

## Summary

Steer Clear is a Manifest V3 Chrome extension that intercepts navigation to
user-configured sites and serves a local **interstitial** page instead. The
interstitial shows the user their own previously-written reason for blocking the
site, offers a one-click path to a chosen alternative destination, and provides
an easy time-boxed bypass.

The mechanism is behavioral, not technical: the goal is to convert an automatic
reflex into a conscious decision. Bypass is deliberately easy — this is a
self-imposed speed bump, not a lock.

**Actionable content:** build a 4-surface extension (background service worker,
interstitial page, options page, manifest) with all config in
`chrome.storage.sync`, redirect via `declarativeNetRequest` dynamic rules, and
prepare Chrome Web Store submission materials.

---

## Problem

Muscle-memory navigation: the user types a domain out of habit, not intent, and
is on the page before deciding to be. A hard redirect (site A → site B) fails
because it is invisible — the user simply retypes. The intervention must be
*visible* to interrupt the reflex.

---

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Intervention | Local interstitial page | Makes the reflex visible; a silent redirect gets retyped around |
| Redirect target | Global default + optional per-site override | User chooses their own level of granularity |
| Note/reason | Global default + optional per-site override | Per-site reasons land harder; global keeps setup to one field |
| Bypass | Easy, 5-minute time-boxed | An un-removable tool is a worse category of thing; friction gates drive uninstalls |
| Bypass persistence | `chrome.storage.session` | Must not survive a browser restart |
| Config persistence | `chrome.storage.sync` | Follows the Chrome profile across machines |
| Subdomain matching | Inclusive by default, per-site toggle | `ynet.co.il` should catch `www.` and `m.` |
| Public name | Steer Clear | Names the behavior, not the person; no health-claim framing |

### Why not the alternatives

- **`/etc/hosts`** — maps names to IPs; cannot redirect to a URL, and breaks TLS.
- **Third-party extensions (Redirector, Requestly)** — grant a vendor read access
  to all browsing traffic.
- **DNS-level (Pi-hole / NextDNS)** — blocks rather than redirects, not
  per-browser, no interstitial.

---

## Architecture

```
Navigation to blocked.example
        │
        ▼
declarativeNetRequest dynamic rule  ──►  redirect to
        │                                chrome-extension://<id>/blocked/blocked.html
        │                                    ?from=<original-url>
        ▼
   blocked.html reads chrome.storage.sync
        │
        ├── resolves per-site target  ──► falls back to global target
        ├── resolves per-site note    ──► falls back to global note
        │
        └── renders: reason, [Go to target], [Continue anyway (5m)]
```

**Key constraint driving this shape:** a static `rules.json` cannot read from
`chrome.storage`, and dynamic-rule redirect targets are awkward to vary per
rule. Redirecting *all* blocked sites to one local page and resolving the target
inside that page sidesteps the limitation entirely — one uniform rule shape, and
all per-site logic lives in storage where the options page can edit it freely.

**Rule lifecycle:** the service worker is the single owner of the dynamic rule
set. It rebuilds rules from storage on `onInstalled`, on `onStartup`, on any
`storage.sync` change, and on bypass grant/expiry. No other surface writes rules.

---

## Data Model

`chrome.storage.sync`, key `config`:

```jsonc
{
  "schemaVersion": 1,
  "globalTarget": "https://en.wikipedia.org/wiki/Special:Random",
  "globalNote": "I said I'd stop doomscrolling during work hours.",
  "sites": [
    {
      "id": "uuid",
      "pattern": "ynet.co.il",
      "includeSubdomains": true,
      "target": null,        // null → inherit globalTarget
      "note": null,          // null → inherit globalNote
      "enabled": true
    }
  ]
}
```

`chrome.storage.session`, key `bypasses`:

```jsonc
{ "ynet.co.il": 1754651234567 }   // pattern → expiry epoch ms
```

`schemaVersion` is present from v1 so later migrations have something to branch
on without guessing.

---

## Component Breakdown

| File | Responsibility |
|---|---|
| `src/manifest.json` | MV3 manifest; permissions `declarativeNetRequest`, `storage`, `alarms` |
| `src/background/service_worker.js` | Sole owner of dynamic rules; rebuilds from storage; handles bypass grant + expiry alarm |
| `src/background/rules.js` | Pure functions: config → DNR rule array. Unit-testable, no Chrome APIs |
| `src/background/config.js` | Storage read/write, defaults, schema validation |
| `src/blocked/blocked.html/.js/.css` | The interstitial; resolves target + note, renders, handles bypass |
| `src/options/options.html/.js/.css` | Config UI: global fields + per-site rows with overrides |
| `src/icons/` | 16/32/48/128 px — **USER MUST SUPPLY** |
| `store/` | Listing copy, privacy policy, permission justifications |

Single Responsibility: `rules.js` is pure translation, `config.js` is pure
persistence, the service worker orchestrates. The interstitial never writes
rules — it messages the worker.

---

## Success Criteria (TDD)

Each is independently verifiable. Manual-verification steps are given because
Chrome extension APIs need a real browser; `rules.js` is unit-testable headless.

| # | Criterion | How to verify |
|---|---|---|
| 1 | Blocked site serves the interstitial | Navigate to a configured site → `blocked.html` renders, address bar shows extension URL |
| 2 | Original URL is preserved | Interstitial displays the full URL that was requested, including path |
| 3 | Global target resolves | Site with `target: null` → "Go to" button points at `globalTarget` |
| 4 | Per-site target overrides | Site with explicit `target` → button points at that, not the global |
| 5 | Per-site note overrides | Same inheritance behavior for the note text |
| 6 | Subdomain inclusion | `ynet.co.il` with `includeSubdomains: true` catches `www.` and `m.` |
| 7 | Subdomain exclusion | Same with `false` catches only the exact host |
| 8 | Bypass grants access | Click "Continue anyway" → site loads |
| 9 | Bypass expires | After 5 min, navigating again serves the interstitial |
| 10 | Bypass dies with browser | Grant bypass, restart Chrome, navigate → interstitial |
| 11 | Config survives restart | Settings persist via `storage.sync` |
| 12 | Disabled site is inert | `enabled: false` → site loads normally |
| 13 | Rules match config exactly | `rules.js` unit tests: config in → expected rule array out |
| 14 | No rule leak | Removing a site removes its rule; verify via `getDynamicRules()` |

---

## Distribution

Chrome Web Store. Requires:

- $5 one-time developer registration
- Publicly-hosted privacy policy URL
- Icon 128×128 + at least one 1280×800 screenshot
- Per-permission justification text

`declarativeNetRequest` with redirect draws closer review than average — it is
the permission set traffic-hijacking extensions use. The listing must be
unambiguous that redirects go only to user-configured destinations and that no
data leaves the browser.

---

## Out of Scope

- Firefox/Safari ports
- Scheduled blocking (work hours only)
- Usage statistics or streak tracking
- Sync to any backend — the extension makes no network requests, by design
