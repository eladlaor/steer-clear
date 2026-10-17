# Chrome Web Store Listing — Steer Clear

## Table of Contents

- [Summary](#summary)
- [Copy rules (all three stores)](#copy-rules-all-three-stores)
- [Listing fields](#listing-fields)
- [Permission justifications](#permission-justifications)
- [What is stored and which tab functions are used](#what-is-stored-and-which-tab-functions-are-used)
- [Submission walkthrough](#submission-walkthrough)
- [Data-use disclosures](#data-use-disclosures)
- [Assets checklist](#assets-checklist)
- [LinkedIn launch post](#linkedin-launch-post)

---

## Summary

Copy-paste-ready text for every field of the Chrome Web Store form for
version 2.0.0, plus the permission justifications reviewers require and a
draft launch post. The Edge and Firefox listings reuse this copy:
`store/LISTING_EDGE.md` and `store/LISTING_FIREFOX.md`. The copy rules below
are enforced by `tests/unit/listing_copy.test.js`, and the disclosures by
`tests/unit/privacy_disclosures.test.js`. Release status is in
`knowledge/setup/SUBMISSION_STEPS.md`; store-presence work (Featured
nomination, promo video, category test) is in
`knowledge/setup/STORE_PRESENCE.md`.

---

## Copy rules (all three stores)

- **Benefit first.** The first line is: "A nudge in your own words, not a
  wall: your own reason, one click to something better, and you're never
  locked out."
- **Search phrases.** The description uses "stop doomscrolling", "block
  distracting sites" and "mindless browsing", the phrases people type.
- **Who it is for, and not for.** It names "people who check social and news
  sites on autopilot" and says "Not for you if you want sites locked: Steer
  Clear always lets you through."
- **One comparison, in exactly these words:** "Asks for access only to the
  sites you add, unlike one sec, LeechBlock NG and Freedom's Pause." Before
  each submission it is checked against those extensions' current manifests,
  and the date is recorded in `knowledge/setup/STORE_PRESENCE.md`. Never say
  Steer Clear is the only or the first to do this: Intention also asks per
  site.
- **No health claims.** Nothing about brain chemistry, attention disorders or
  any medical condition, and no promise to fix or heal anything; the banned
  words are listed in `tests/unit/listing_copy.test.js`. The allowed phrasing
  is "Built for people who get pulled off-task".

---

## Listing fields

### Extension name (45 char max)

```
Steer Clear
```

### Short description (132 char max)

```
A nudge in your own words, not a wall: your own reason, one click to something better, and you're never locked out.
```

*(115 characters.)*

### Detailed description

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

HOW IT WORKS

• Add the sites that pull you in, from the toolbar button or the welcome page
• Write a reason for each, in your own words (up to five, shown in turn)
• Pick where you'd rather land instead
• Go there out of habit, and get your pause rather than the page

STAYS NOTICEABLE AFTER THE FIRST WEEK

• The pause screen changes its layout, colour and wording each time, so it
  keeps being read
• Pause styles: your reason, a paced breath, or "What did you come here for?"
• Schedules per site (say, weekdays 9 to 5), a snooze, and an optional daily
  limit that makes the pause longer once you have continued enough times
• "Continue anyway" lasts 1, 5, 15 or 30 minutes; the toolbar badge shows the
  minutes left, and the pause can come back when the time is up
• A statistics page shows how often you steered clear, kept on your device

PRIVATE BY CONSTRUCTION

• No servers. No accounts. No analytics. No network requests at all
• Asks for access only to the sites you add, unlike one sec, LeechBlock NG and Freedom's Pause.
• Your history stays on this device, is deleted after 90 days, and can be
  erased in one click
• Export your settings to a file to move them to another browser
• Works in Chrome, Edge and Firefox (including Firefox for Android)
• Open source under the MIT license
```

### Category

```
Productivity
```

Category test: 4 weeks in the current category, then 4 weeks in "Workflow &
Planning". The log and the decision are in `knowledge/setup/STORE_PRESENCE.md`.

### Language

```
English
```

---

## Permission justifications

Reviewers reject vague answers. These are specific and map to actual code.

### `declarativeNetRequest`

```
Steer Clear redirects top-level navigations to domains the user has explicitly
added in the extension's own settings, popup or welcome page. Each configured
domain becomes one declarative redirect rule pointing at a pause page bundled
inside the extension package (blocked/blocked.html).

Rules are supplied to Chrome declaratively, so the extension never observes,
receives, or intercepts the requests themselves. Only main_frame requests are
matched; subresources, XHR, and third-party requests are untouched. Redirect
destinations are always the extension's own local page; the extension never
redirects to any external or developer-controlled address.
```

### `storage`

```
storage.sync holds the user's own settings: the domains they added, their
reasons, the destination they chose, and their pause preferences (keys
"schema", "settings" and one "site:<id>" item per site; the 1.x "config" item
is read but never written).

storage.local holds the interception history shown on the extension's own
statistics page ("stats": for each pause, the user-configured domain, a
timestamp, which choice was made, and a random id for the pause page) and a
few one-time flags ("lifecycle": welcome page finished, notice shown, rating
prompt answered). It is kept out of storage.sync deliberately so it never
leaves the device; history records expire after 90 days and the user can
erase all of it.

storage.session holds state that must end with the browser: running "continue
anyway" passes ("bypasses"), which tabs show the minutes left ("badgedTabs",
tab numbers only), a running snooze ("snooze"), while a schedule is set the
device's UTC offset so a timezone change re-times it ("scheduleTzOffset"),
and, only when saved settings cannot be read, the rules a pass removed so they
can be restored ("liftedRules"). No data is transmitted anywhere.
```

### `alarms`

```
When a user grants a temporary "continue anyway" pass (1 to 30 minutes), the
corresponding redirect rule is removed. An alarm at the expiry time reinstates
it; without it the pass would never end. Alarms also: tick the toolbar badge
once a minute to show the minutes left on a pass; end a snooze the user
started from the toolbar popup; switch reminders on and off at the start and
end of a per-site schedule, and every 15 minutes while a schedule is set check
whether the device changed timezone; and delete history older than 90 days.
```

### `activeTab`

```
When the user clicks the toolbar button, the popup offers "Steer clear of
<this site>" for the tab they are on. activeTab lets the popup read that one
tab's address (tabs.query on the active tab), only after that click. Nothing
is read or stored unless the user then adds the site, and adding it asks for
access to that site alone. activeTab carries no install-time warning and
grants nothing in the background.
```

### Host permissions

```
Redirecting a navigation requires host access to the site being redirected, so
Steer Clear requests access to each site individually, at the moment the user
adds that site. Nothing is granted at install time and the extension holds no
access to any site the user has not personally entered.

The broad pattern appears under optional_host_permissions rather than
host_permissions precisely so that no blanket grant exists: the user's list is
theirs to define. A site the user has not granted produces no redirect rule at
all, and the settings page shows it as inactive with a button to grant access.

Access is used to redirect top-level navigations to the extension's own
bundled pause page, and to find the tabs open on a site whose pass is running
or has ended (tabs.query), to update the toolbar badge and, only if the user
opted in, to send those tabs back to the pause page (tabs.update). The
extension injects no content scripts and reads no page content on any site.
```

### Single-purpose statement

```
Steer Clear has one purpose: to show a pause page, in the user's own words,
before user-specified websites load, so the user can reconsider before
continuing.
```

### Remote code use

```
No. All code is contained in the extension package. No remote code is loaded or
executed.
```

---

## What is stored and which tab functions are used

The same facts as `store/PRIVACY_POLICY.md`, for reviewers on every store.

| What | Where | Notes |
|---|---|---|
| Settings and sites | `storage.sync`: `schema`, `settings`, `site:<id>` (1.x `config` read only) | Synced only by the browser's own sync |
| `stats` | `storage.local` | Domain, time, choice, random page id; 90-day records; erasable |
| `lifecycle` | `storage.local` | Welcome done, notice shown, rating answered |
| `bypasses` | `storage.session` | Running passes; gone when the browser closes |
| `badgedTabs` | `storage.session` | Tab numbers showing a badge |
| `snooze` | `storage.session` | When a snooze ends |
| `liftedRules` | `storage.session` | Only when settings cannot be read |
| `scheduleTzOffset` | `storage.session` | Device's UTC offset, only while a schedule is set |

| Permission | Use |
|---|---|
| `declarativeNetRequest` | Redirect listed sites to the bundled pause page |
| `storage` | The keys above |
| `alarms` | End passes and snoozes, badge tick, schedules, history pruning |
| `activeTab` | The popup reads the current tab's address after a click |

| Tab function | Use |
|---|---|
| `tabs.query` | Find tabs on a site with a running or ended pass (badge); the popup reads the active tab |
| `tabs.update` | Opt-in return of the pause when a pass ends; the welcome page's "Try it" |
| `tabs.getCurrent` | The welcome page finds its own tab for "Try it" |
| `tabs.create` | Open the welcome page on install, and statistics from the popup |

---

## Submission walkthrough

Step-by-step, in the order the dashboard presents things:
`knowledge/setup/SUBMISSION_STEPS.md`.

---

## Data-use disclosures

In the Privacy practices tab, declare:

| Question | Answer |
|---|---|
| Does it collect personally identifiable information? | **No** |
| Health information? | **No** |
| Financial and payment information? | **No** |
| Authentication information? | **No** |
| Personal communications? | **No** |
| Location? | **No** |
| Web history? | **Yes** — see the note below |
| User activity? | **Yes** — see the note below |
| Website content? | **No** |

**On the two "Yes" answers.** The statistics feature records the date and time
of each pause against the domain the user configured, and, since 1.1, which
button the user chose on the pause page. That is timestamped activity data,
and answering "No" because it never leaves the device would be wrong: these
questions ask what the extension *collects*, not what it transmits. A
disclosure that turns out to be inaccurate is grounds for takedown after
publication, which is a far worse outcome than declaring it correctly now.

Re-checked for 2.0.0 on 2026-10-17: nothing typed on the pause page is stored,
export files are created only on request and stay on the user's computer, and
no new category applies.

What is recorded is deliberately narrow, and the listing should say so in the
justification field:

> Steer Clear records the date and time it showed you a pause for a site you
> configured, and which choice you made there, so it can show you your own
> patterns. It records only the domain you entered in settings — never the
> full address, the page, anything you searched for or anything you typed. It
> is never sent anywhere: it is stored locally, is excluded from Chrome Sync
> by design, is deleted automatically after 90 days, and can be erased
> permanently at any time from the extension's statistics page.

Then check all three certification boxes:

- Not being sold to third parties
- Not being used for purposes unrelated to the item's single purpose
- Not being used to determine creditworthiness or for lending

**Privacy policy URL:**

```
https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY
```

---

## Assets checklist

| Asset | Spec | Status |
|---|---|---|
| Store icon | 128×128 PNG | `src/icons/icon-128.png` — must be uploaded separately on the Store listing tab |
| Toolbar icons | 16/32/48 PNG | Present — 16px is muddy; redraw when convenient |
| Screenshot | 1280×800 or 640×400 PNG, at least 1, up to 5 | Present — five in `store/screenshots/`, upload in numbered order. Regenerate with `node tools/screenshots.mjs` |
| Small promo tile | 440×280 PNG | Present — `store/screenshots/promo-small-440x280.png`, generated with the screenshots. Upload before the Featured nomination |
| Promo video | 30–60 s, YouTube link | Script in `knowledge/setup/STORE_PRESENCE.md`; not recorded yet |
| Marquee promo tile | 1400×560 PNG | Optional |

**The five in `store/screenshots/`**, upload in this order:

1. `1-reminder.png` — the pause page with a real reason; this is the product
2. `2-breathing.png` — the breathing pause style, with the site's own reason
3. `3-settings.png` — settings with two sites listed
4. `4-patterns.png` — the statistics page, which also makes the local-only
   data story concrete for a reviewer reading the privacy disclosures
5. `5-popup.png` — the toolbar popup: today, quick-add for the current site,
   and snooze

---

## LinkedIn launch post

Draft — adjust to your voice before posting.

```
I kept typing ynet.co.il without deciding to.

Not reading it. Just... arriving there. Fingers faster than intent, twenty times
a day, then twenty minutes gone.

The usual fixes didn't fit. Blockers are all-or-nothing, so you switch them off
when you actually need a site, and then never switch them back on. Redirects
are invisible — you just retype the URL without noticing you did.

So I built the smallest thing that seemed like it might work: a pause. Go to a
site on your list and you get a page showing the reason you wrote for
yourself, plus one click to wherever you meant to go.

There's a "continue anyway" button. It takes one click and it works. That's
deliberate — the goal was never to lock myself out. It was to turn something
automatic into something I decide. Reading your own words back at the exact
moment you're ignoring them does most of the work.

It's free, open source, and makes no network requests at all — no accounts, no
analytics, and it asks for access only to the sites you add. Your list never
leaves your browser.

Steer Clear, for Chrome, Edge and Firefox: [LINK]
Source: [LINK]

Curious whether this generalizes. What's the site your fingers go to without
asking you?
```
