# Chrome Web Store Listing — Steer Clear

## Table of Contents

- [Summary](#summary)
- [Listing fields](#listing-fields)
- [Permission justifications](#permission-justifications)
- [Data-use disclosures](#data-use-disclosures)
- [Assets checklist](#assets-checklist)
- [LinkedIn launch post](#linkedin-launch-post)

---

## Summary

Copy-paste-ready text for every field of the Chrome Web Store submission form,
plus the permission justifications reviewers require and a draft launch post.
Fields marked **YOU MUST SUPPLY** cannot be produced without design assets or
account access.

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

• No servers. No accounts. No analytics. No network requests at all
• Your settings never leave your browser
• No permission to read any web page, so it cannot see what you browse
• Fully open source

Steer Clear asks for no host permissions and cannot read page content on any
site. It knows only the domains you typed into it yourself.
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
discarded when the browser closes. No data is transmitted anywhere.
```

### `alarms`

```
When a user grants a temporary 5-minute bypass, the corresponding redirect rule
is removed. An alarm scheduled for the expiry time reinstates it. Without alarms
the bypass would persist indefinitely, silently disabling the feature the user
installed the extension for.
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
| Web history? | **No** — the extension stores only domains the user typed in manually; it does not record visits |
| User activity? | **No** |
| Website content? | **No** |

Then check all three certification boxes:

- Not being sold to third parties
- Not being used for purposes unrelated to the item's single purpose
- Not being used to determine creditworthiness or for lending

**Privacy policy URL:** **YOU MUST SUPPLY** — host `PRIVACY_POLICY.md` at a
public URL. A GitHub Pages site on the project repo is the least-effort route
that satisfies the requirement.

---

## Assets checklist

| Asset | Spec | Status |
|---|---|---|
| Icon | 128×128 PNG | **YOU MUST SUPPLY** — see `src/icons/README.md` |
| Toolbar icons | 16/32/48 PNG | **YOU MUST SUPPLY** |
| Screenshot | 1280×800 or 640×400 PNG, at least 1, up to 5 | **YOU MUST SUPPLY** — capture after loading the extension |
| Small promo tile | 440×280 PNG | Optional |
| Marquee promo tile | 1400×560 PNG | Optional |

**Suggested screenshots**, in order:

1. The reminder page with a filled-in note — this is the product, lead with it
2. The settings page showing two or three sites configured
3. A per-site override expanded, demonstrating the flexibility

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
