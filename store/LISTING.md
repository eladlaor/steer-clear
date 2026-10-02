# Chrome Web Store Listing — Steer Clear

## Table of Contents

- [Summary](#summary)
- [Listing fields](#listing-fields)
- [Permission justifications](#permission-justifications)
- [Submission walkthrough](#submission-walkthrough)
- [Data-use disclosures](#data-use-disclosures)
- [Assets checklist](#assets-checklist)
- [LinkedIn launch post](#linkedin-launch-post)

---

## Summary

Copy-paste-ready text for every field of the Chrome Web Store submission form,
plus the permission justifications reviewers require and a draft launch post.
Every asset is prepared and the privacy policy is hosted; nothing blocks
submission. See `knowledge/setup/SUBMISSION_STEPS.md` for
current status.

---

## Listing fields

### Extension name (45 char max)

```
Steer Clear
```

### Short description (132 char max)

```
Catch the reflex. Sites you'd rather not open show you your own reason first, and one click to somewhere you'd rather be.
```

*(120 characters.)*

### Detailed description

```
You didn't decide to open that site. Your fingers did.

Steer Clear puts one small pause between the habit and the page. When you
navigate to a site on your list, you get a quiet reminder instead — showing you
the reason you wrote for yourself, and a single click to wherever you'd rather
have gone.

It is not a blocker. There is a "continue anyway" button, and it works. The
point isn't to lock you out of the internet; it's to make an automatic action
into a decision you actually make. Most of the time, seeing your own words is
enough.

HOW IT WORKS

• Add the sites that pull you in — ynet.co.il, x.com, whatever yours are
• Write yourself a note explaining why, in your own words
• Pick where you'd rather land instead
• Navigate there out of habit, and get your reminder rather than the page

MADE TO BE HONEST

• Continue anyway takes one click and lasts 5 minutes
• Uninstall whenever you want — this is your speed bump, not a cage
• Per-site destinations and notes, if you want different reasons for different
  habits, or one setting for everything

PRIVATE BY CONSTRUCTION

• No servers. No accounts. No network requests at all
• Your settings and your history stay in your browser
• It counts how often it steered you away, so you can see your own patterns —
  stored on your device only, auto-deleted after 90 days, erasable in one click
• It records only the domains you typed in yourself, never the pages you visit
• Fully open source

Steer Clear asks for access only to the specific sites you add, one at a time,
when you add them. It cannot read page content on any site, and it knows only
the domains you typed into it yourself.
```

### Category

```
Productivity
```

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
added in the extension's own settings page. Each configured domain becomes one
declarative redirect rule pointing at a reminder page bundled inside the
extension package (blocked/blocked.html).

Rules are supplied to Chrome declaratively, so the extension never observes,
receives, or intercepts the requests themselves. Only main_frame requests are
matched — subresources, XHR, and third-party requests are untouched. Redirect
destinations are always the extension's own local page; the extension never
redirects to any external or developer-controlled address.
```

### `storage`

```
Used to persist the user's own settings: the list of domains they added, the
destination they chose, and the reminder note they wrote. Stored via
storage.sync so settings follow the user's Chrome profile.

storage.session additionally holds temporary "continue anyway" passes, which are
discarded when the browser closes.

storage.local holds the interception history shown on the extension's own
statistics page: for each redirect, the user-configured domain and a timestamp.
It is kept out of storage.sync deliberately so it never leaves the device,
individual records expire after 90 days, and the user can erase all of it from
that page. No data is transmitted anywhere.
```

### `alarms`

```
When a user grants a temporary 5-minute bypass, the corresponding redirect rule
is removed. An alarm scheduled for the expiry time reinstates it. Without alarms
the bypass would persist indefinitely, silently disabling the feature the user
installed the extension for.
```

### Host permissions

```
Redirecting a navigation requires host access to the site being redirected, so
Steer Clear requests access to each site individually, at the moment the user
adds that site in the extension's settings page. Nothing is granted at install
time and the extension holds no access to any site the user has not personally
entered.

The broad pattern appears under optional_host_permissions rather than
host_permissions precisely so that no blanket grant exists: the user's list is
theirs to define, and a fixed list in the manifest would mean shipping an update
every time someone wanted to add a domain. A site the user has not granted
produces no redirect rule at all, and the settings page shows it as inactive
with a button to grant access.

Access is used solely to redirect top-level navigations to the extension's own
bundled reminder page. The extension injects no content scripts and reads no
page content on any site.
```

### Single-purpose statement

```
Steer Clear has one purpose: to redirect user-specified websites to a reminder
page inside the extension, so the user can reconsider before continuing.
```

### Remote code use

```
No. All code is contained in the extension package. No remote code is loaded or
executed.
```

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
of each interception, against the domain the user themselves configured. That is
timestamped activity data, and answering "No" because it never leaves the device
would be false: these questions ask what the extension *collects*, not what it
transmits. A disclosure that turns out to be inaccurate is grounds for takedown
after publication, which is a far worse outcome than declaring accurately now.

What is recorded is deliberately narrow, and the listing should say so in the
justification field:

> Steer Clear records the date and time it redirected you away from a site you
> configured, so it can show you your own patterns. It records only the domain
> you entered in settings — never the full address, the page, or anything you
> searched for. It is never sent anywhere: it is stored locally, is excluded
> from Chrome Sync by design, is deleted automatically after 90 days, and can be
> erased permanently at any time from the extension's statistics page.

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
| Screenshot | 1280×800 or 640×400 PNG, at least 1, up to 5 | Present — three in `store/screenshots/`, upload in numbered order |
| Small promo tile | 440×280 PNG | Optional |
| Marquee promo tile | 1400×560 PNG | Optional |

**The three in `store/screenshots/`**, upload in this order:

1. `1-reminder.png` — the reminder page with a real note; this is the product
2. `2-settings.png` — settings with the defaults filled in and two sites listed
3. `3-patterns.png` — the statistics page, which also makes the local-only
   data story concrete for a reviewer reading the privacy disclosures

---

## LinkedIn launch post

Draft — adjust to your voice before posting.

```
I kept typing ynet.co.il without deciding to.

Not reading it. Just... arriving there. Fingers faster than intent, twenty times
a day, then twenty minutes gone.

The usual fixes didn't fit. Blockers are all-or-nothing, so you disable them the
first time you actually need the site, and then never re-enable them. Redirects
are invisible — you just retype the URL without noticing you did.

So I built the smallest thing that seemed like it might work: a pause. Navigate
to a site on your list and you get a page showing the reason you wrote for
yourself, plus one click to wherever you meant to go.

There's a "continue anyway" button. It takes one click and it works. That's
deliberate — the goal was never to lock myself out. It was to turn something
automatic into something I decide. Turns out reading your own words back at the
exact moment you're ignoring them does most of the work.

It's free, open source, and makes no network requests at all — no accounts, no
analytics, and no permission to read any page you visit. Your list never leaves
your browser.

Steer Clear, on the Chrome Web Store: [LINK]
Source: [LINK]

Curious whether this generalizes. What's the site your fingers go to without
asking you?
```
