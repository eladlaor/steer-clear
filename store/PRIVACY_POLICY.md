# Privacy Policy — Steer Clear

**Last updated:** 2026-08-08

## Table of Contents

- [Summary](#summary)
- [What Steer Clear stores](#what-steer-clear-stores)
- [What Steer Clear does not do](#what-steer-clear-does-not-do)
- [Permissions and why they are needed](#permissions-and-why-they-are-needed)
- [Data retention and deletion](#data-retention-and-deletion)
- [Changes to this policy](#changes-to-this-policy)
- [Contact](#contact)

---

## Summary

Steer Clear collects no personal data, transmits nothing, and contacts no
server. Your settings are stored in your own browser. The developer has no
access to them and no ability to see what sites you have configured or visited.

---

## What Steer Clear stores

Steer Clear stores only the settings you enter yourself:

- The list of website domains you have chosen to be reminded about
- The destination address you have chosen to be offered instead
- The optional reminder note you have written for yourself
- Per-site overrides of the destination and note
- Whether each entry is currently enabled, and whether it includes subdomains

This data is saved using Chrome's `storage.sync` API. That means it is held in
your browser and, if you have Chrome Sync enabled, synchronized across your own
signed-in Chrome installations by Google as part of your Chrome profile. It is
never sent to the developer or to any third party.

Temporary "continue anyway" passes are stored using Chrome's `storage.session`
API and are erased when you close the browser.

### Your interception history

So that the extension can show you your own patterns, it records each time it
steers you away from a site. Each record contains two things:

- The domain you were heading to, exactly as you entered it in settings
- The date and time it happened

It does **not** record the full address, the page, the article, or anything you
searched for — only the domain you yourself configured.

This history is saved using Chrome's `storage.local` API. Unlike your settings,
it is **not** synchronized to your other machines and does not pass through
Google's servers; it stays in the browser where it happened. Individual records
are deleted automatically after 90 days, while the per-site running totals are
kept until you erase them.

You can view this history on the extension's statistics page, and erase all of
it permanently from that same page at any time.

---

## What Steer Clear does not do

Steer Clear does not:

- Make any network requests of any kind
- Collect, transmit, or sell personal information
- Track, log, or report your browsing history
- Record which sites you visit, block, or bypass
- Include analytics, telemetry, advertising, or third-party code
- Read or modify the content of any web page

The extension contains no remote code. Everything it runs ships inside the
extension package and is reviewable in the source repository.

---

## Permissions and why they are needed

| Permission | Why it is required |
|---|---|
| `declarativeNetRequest` | To redirect navigations to the domains you configure toward the extension's own reminder page. Rules are supplied to Chrome declaratively; the extension does not observe or receive the requests themselves. |
| `storage` | To save your settings, and to hold temporary bypass passes for the current browser session. |
| `alarms` | To restore a reminder automatically when a temporary bypass expires. |

Steer Clear requests no host permissions and therefore cannot read page content
on any site.

---

## Data retention and deletion

Your settings persist until you delete them. To remove everything:

- Remove individual entries from the extension's settings page, or
- Uninstall the extension — Chrome deletes all of its stored data automatically

Uninstalling removes every trace of the extension's configuration. Because
nothing was ever transmitted, there is nothing held elsewhere to request the
deletion of.

---

## Changes to this policy

Any future change to this policy will be published at this address, with the
"Last updated" date revised. Material changes affecting how data is handled will
also be noted in the extension's Chrome Web Store listing.

---

## Contact

Questions about this policy: **eladlaor88@gmail.com**
