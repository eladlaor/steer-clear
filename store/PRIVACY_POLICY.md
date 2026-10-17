# Privacy Policy — Steer Clear

**Last updated:** 2026-10-17 (version 2.0.0)

## Table of Contents

- [Summary](#summary)
- [Which browsers this covers](#which-browsers-this-covers)
- [What Steer Clear stores](#what-steer-clear-stores)
  - [Your settings (synced by your browser)](#your-settings-synced-by-your-browser)
  - [Your interception history (this device only)](#your-interception-history-this-device-only)
  - [One-time flags (this device only)](#one-time-flags-this-device-only)
  - [Temporary state (gone when the browser closes)](#temporary-state-gone-when-the-browser-closes)
  - [Export files](#export-files)
- [How Steer Clear uses your tabs](#how-steer-clear-uses-your-tabs)
- [What Steer Clear does not do](#what-steer-clear-does-not-do)
- [Permissions and why they are needed](#permissions-and-why-they-are-needed)
- [Data retention and deletion](#data-retention-and-deletion)
- [Changes to this policy](#changes-to-this-policy)
- [Contact](#contact)

---

## Summary

Steer Clear collects no personal data, transmits nothing, and contacts no
server. It has no accounts and no analytics. Your settings are stored in your
own browser, and synchronized only by your browser's own sync if you have it
turned on. Your history of pauses stays on the device where it happened. The
developer has no access to any of it and cannot see which sites you have
configured or visited.

---

## Which browsers this covers

This policy covers Steer Clear on Google Chrome, Microsoft Edge, Mozilla
Firefox (desktop) and Firefox for Android. The extension is the same code in
every browser, and it stores and does the same things in each. What differs is
only how each browser synchronizes your settings, described below.

---

## What Steer Clear stores

### Your settings (synced by your browser)

Steer Clear stores only the settings you enter yourself:

- The website domains you chose to be reminded about, with an optional display
  name, whether each includes subdomains, and whether it is turned on
- The reasons you wrote for yourself, the destination you would rather go to
  and its name
- Your choices for the pause: its style, its length, a schedule, the length of
  a "continue anyway" pass, whether the pause comes back when that pass ends,
  whether the pause screen changes its look, and an optional daily limit

They are saved with the browser's `storage.sync` API under the keys `schema`,
`settings` and one `site:<id>` item per site. Versions 1.x saved them in one
`config` item; version 2.0 reads that item but never changes it, so going back
to 1.x finds it intact.

How the browser synchronizes them:

- **Chrome and Edge:** if you are signed in with sync on, Chrome Sync (or
  Microsoft Edge sync) copies them to your other signed-in installations as
  part of your browser profile.
- **Firefox desktop:** if you use Firefox Sync, Firefox copies them to your
  other Firefox installations. Firefox Sync data is end-to-end encrypted by
  Firefox.
- **Firefox for Android:** settings are kept on the device and are not
  synchronized.

In every case the copy is made by your browser for you. Nothing is ever sent
to the developer or to any third party.

### Your interception history (this device only)

So that it can show you your own patterns, Steer Clear keeps a record each
time it shows you a pause, under the `storage.local` key `stats`. Each record
holds:

- The domain you were heading to, exactly as you entered it in settings
- The date and time
- Which choice you made on the pause page: went to your destination,
  continued, or neither (you closed the tab or went elsewhere)
- A random id for that pause page, so that reloading the page is not counted
  twice

It does **not** record the full address, the page, the article, anything you
searched for, or anything you type on the pause page (the "intention" style
asks what you came for; that answer is never stored).

This history is saved with the `storage.local` API. It is **not**
synchronized to your other devices and does not pass through any sync service;
it stays in the browser where it happened. Individual records are deleted
automatically after 90 days, and the per-site running totals are kept until
you erase them. You can view the history on the statistics page and erase all
of it from that page at any time.

### One-time flags (this device only)

A few flags are kept in `storage.local` under the key `lifecycle`: when you
finished the welcome page, whether the note explaining that the pause screen
changes has been shown, and whether the request to rate Steer Clear has been
shown or answered. They contain no browsing data, are not synchronized, and
are not erased with your statistics. Uninstalling the extension removes them.

### Temporary state (gone when the browser closes)

These are kept with the `storage.session` API, which the browser erases when
it closes:

- `bypasses` — the "continue anyway" passes now running: the domain and when
  the pass ends
- `badgedTabs` — which tabs show the minutes left on a pass in the toolbar
  badge, so the badge can be cleared when the pass ends (tab numbers only, no
  addresses)
- `snooze` — when a snooze you started from the toolbar popup ends
- `liftedRules` — only if your saved settings cannot be read (for example,
  settings saved by a newer version on another device): the redirect rules a
  "continue anyway" removed, so they can be put back when the pass ends

### Export files

"Export settings" on the settings page saves your settings (sites, reasons,
destinations and defaults) to a file on your computer, only when you click it.
The file never includes your interception history or the flags above. It stays
wherever you save it; Steer Clear does not send it anywhere. "Import settings"
reads a file you choose and, after you confirm, replaces your settings with it.

---

## How Steer Clear uses your tabs

Steer Clear does not request the `tabs` permission and cannot see your tabs in
general. It uses these tab functions, each for one purpose:

| API | What it is used for |
|---|---|
| `tabs.query` | To find the tabs open on a site whose "continue anyway" pass is running or has just ended, to show or clear the minutes left in the toolbar badge. The browser only returns those tabs' addresses for sites you added and gave access to. The toolbar popup also uses it to read the address of the tab you are on, only after you click the toolbar button (see `activeTab` below) |
| `tabs.update` | Only if you turn on "When my time is up, bring the pause back": when a pass ends, tabs still on that site are sent back to the pause page. The tab's current address is read at that moment and passed only in the pause page's own address; it is not stored. The welcome page also uses it, with `tabs.getCurrent`, to open the first site you added in the welcome page's own tab when you click "Try it" |
| `tabs.create` | To open the welcome page once, when you first install Steer Clear, and to open the statistics page from the popup |

---

## What Steer Clear does not do

Steer Clear does not:

- Make any network requests of any kind
- Collect, transmit, or sell personal information
- Track, log, or report your general browsing history
- Record any site you have not added to your own list, or any page beyond the
  domain itself
- Store anything you type on the pause page
- Include analytics, telemetry, advertising, or third-party code
- Read or modify the content of any web page

The extension contains no remote code. Everything it runs ships inside the
extension package.

---

## Permissions and why they are needed

| Permission | Why it is required |
|---|---|
| `declarativeNetRequest` | To redirect navigations to the domains you configure toward the extension's own pause page. Rules are given to the browser declaratively; the extension does not observe or receive the requests themselves. |
| `storage` | To save your settings, your interception history and the one-time flags, and to hold the temporary state listed above for the current browser session. |
| `alarms` | To bring a reminder back when a "continue anyway" pass or a snooze ends, to count down the minutes in the toolbar badge, to switch reminders on and off at the edges of a schedule, and to delete history older than 90 days. |
| `activeTab` | Only when you click the toolbar button: to read the address of the tab you are on, so the popup can offer "Steer clear of" that site. Nothing is stored unless you add the site, and adding it asks for access to that site alone. |
| Site access (optional host permissions) | A browser only lets an extension redirect a site it has access to. Steer Clear asks for access to each site individually, when you add it, and holds no access to any site you have not entered. Removing a site gives its access back. The access is used only to redirect and, as described above, to find tabs on that site; Steer Clear injects no scripts and reads no page content on any site. |

On Firefox, the extension declares to Mozilla that it collects no data
(`data_collection_permissions: none`).

---

## Data retention and deletion

Your settings persist until you delete them. To remove everything:

- Remove individual entries from the extension's settings page,
- Erase your interception history from the extension's statistics page, or
- Uninstall the extension — the browser deletes all of its stored data
  automatically

Uninstalling removes every trace of the extension's data from that browser.
Because nothing was ever transmitted to the developer, there is nothing held
elsewhere to request the deletion of. An export file you saved stays where you
saved it until you delete it.

---

## Changes to this policy

Any future change to this policy will be published at this address, with the
"Last updated" date revised. Material changes affecting how data is handled will
also be noted in the extension's store listings.

---

## Contact

Questions about this policy: **eladlaor88@gmail.com**
