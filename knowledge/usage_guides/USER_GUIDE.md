# User Guide

## Table of Contents

- [Summary](#summary)
- [How do I start?](#how-do-i-start)
- [What happens when I open a listed site?](#what-happens-when-i-open-a-listed-site)
- [How long does a pass through to the site last?](#how-long-does-a-pass-through-to-the-site-last)
- [Why did the site stay open after my time ran out?](#why-did-the-site-stay-open-after-my-time-ran-out)
- [Why does the pause screen look different every time?](#why-does-the-pause-screen-look-different-every-time)
- [Can I make it pause only at certain times?](#can-i-make-it-pause-only-at-certain-times)
- [What is the daily limit?](#what-is-the-daily-limit)
- [How do I turn everything off for a while?](#how-do-i-turn-everything-off-for-a-while)
- [Why does a site say "needs access"?](#why-does-a-site-say-needs-access)
- [Does it work in private or incognito windows?](#does-it-work-in-private-or-incognito-windows)
- [Do my settings follow me to my other computers?](#do-my-settings-follow-me-to-my-other-computers)
- [How do I move my settings to another browser?](#how-do-i-move-my-settings-to-another-browser)
- [What does it record, and how do I erase it?](#what-does-it-record-and-how-do-i-erase-it)
- [The settings page shows an error. What now?](#the-settings-page-shows-an-error-what-now)

---

## Summary

- Steer Clear shows you a short pause, in your own words, before a site you
  listed loads, with one click to somewhere better and a second button that
  always lets you through to the site. It is a nudge, not a lock.
- Add sites from the welcome page, the toolbar button ("Steer clear of this
  site") or the settings page. Each site asks for access to that site only.
- On single-page sites (Reddit, YouTube, X), a pass through to the site does not
  end by itself while the tab stays open; the toolbar badge shows the minutes
  left, and "When my time is up, bring the pause back" makes the end real.
- Private windows are not paused unless you allow the extension there.
- **Update Steer Clear on every device that shares your browser sync.** After
  version 2.0 saves a change, devices still on 1.x no longer receive your
  edits (and theirs no longer reach 2.0).
- Export your settings to a file to move them to another browser; your
  history stays on the device where it happened.

---

## How do I start?

The welcome page opens when you install. Tap the sites that pull you in (or
type your own), optionally add a reason for each, and press **Turn on**. Your
browser then asks for access to those sites only; allow it. "Try it" opens the
first site so you can see the pause.

Later, add sites from the toolbar button while you are on them, or from the
settings page (right-click the toolbar icon → Options).

---

## What happens when I open a listed site?

Instead of the page you see a pause: the site, the reason you wrote, a button
to your chosen destination, and a button that continues to the site for a
set time (for example **reddit.com for 5 min**). Depending on your
settings the pause shows your reason, a paced breath, or asks "What did you
come here for?" (what you type there is never saved).

---

## How long does a pass through to the site last?

5 minutes by default; choose 1, 5, 15 or 30 in settings. It also ends when you
close the browser. While it runs, the toolbar badge on that tab shows the
minutes left (not on Firefox for Android, which has no toolbar badge).

---

## Why did the site stay open after my time ran out?

Because sites like Reddit, YouTube, X, Facebook and Instagram change pages
without loading a new one, and the pause only catches a real page load. When
your time is up the next full load (a new tab, a reload, typing the address)
pauses again, but a tab you keep scrolling never does.

Two things help: the badge tells you when the time is up, and in settings,
**When my time is up: bring the pause back** sends tabs still on that site
back to the pause page at that moment. It is off unless you turn it on.

---

## Why does the pause screen look different every time?

A screen that never changes stops being read. By default the layout, colour
and wording change on every visit; your reason is always there. You can turn
this off in settings.

---

## Can I make it pause only at certain times?

Yes. Under a site's **Customize**, set **Pause only during**: pick days and up
to four time ranges (a range that ends before it starts runs past midnight).
Outside those times the site loads normally, and the switch happens on its own.

---

## What is the daily limit?

An optional number of times per site per day you continue to the site. After that,
the pause waits at least 30 seconds before you can continue, until midnight.
It never removes the button.

---

## How do I turn everything off for a while?

Click the toolbar button and choose **Snooze** for 15, 30 or 60 minutes.
Every listed site loads normally until then, including your daily limit.
**Resume now** ends it early; closing the browser ends it too.

---

## Why does a site say "needs access"?

Your browser only lets Steer Clear pause a site you gave it access to. If you
said no to the prompt, or removed access in the browser's extension settings,
the site stays listed but inactive. Press **Grant access** on that site's row.
Steer Clear never has access to sites you have not added.

---

## Does it work in private or incognito windows?

Not unless you allow it there, so a listed site loads normally in those
windows:

- **Chrome and Edge:** on `chrome://extensions` (or `edge://extensions`), open
  Steer Clear's **Details** and turn on **Allow in Incognito** (Edge: **Allow
  in InPrivate**).
- **Firefox:** in **Add-ons and themes**, open Steer Clear and set **Run in
  Private Windows** to **Allow**.

---

## Do my settings follow me to my other computers?

If your browser's sync is on, yes, through your browser's own sync: Chrome
Sync, Edge sync, or Firefox Sync (end-to-end encrypted by Firefox). Firefox
for Android keeps settings on the phone. Your history of pauses never syncs.

**Update the extension on every device.** Version 2.0 stores each site
separately so the list is no longer limited to about 20 sites. It leaves the
1.x settings untouched, so an older device keeps working, but after 2.0 saves
a change the two versions stop seeing each other's edits. Once every device is
on 2.0, they all share the same list again.

---

## How do I move my settings to another browser?

Chrome and Firefox do not share sync. On the old browser, open settings →
**Your data** → **Export settings**; a file named
`steer-clear-settings-<date>.json` is saved. On the new browser, **Import
settings**, pick the file, check "Replace N sites with M sites?", and press
**Replace**. Import replaces everything; nothing is merged. Then press **Grant
all** once to give access to the imported sites.

The file holds your sites, reasons and defaults only, never your history. If
the file has a problem, nothing is changed and the message names the exact
field (for example `defaults.bypassMinutes`).

---

## What does it record, and how do I erase it?

For each pause: the site as you listed it, the time, and whether you went to
your destination or continued. Never the page address, what you searched, or
anything you typed. It stays on this device, records older than 90 days are
deleted automatically, and **Erase** on the statistics page removes all of it.
Nothing is ever sent anywhere. The full details are in the privacy policy.

---

## The settings page shows an error. What now?

- **"Some saved sites could not be read"**: one site's saved data is damaged
  (rare; usually a sync glitch). The other sites keep working. Press **Remove
  damaged item** next to it, then add the site again.
- **"Saved by a newer version; update the extension"**: another device runs a
  newer Steer Clear. Update this one. Until then, pauses still appear with
  default settings and continuing to the site still works.
