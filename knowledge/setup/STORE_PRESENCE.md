# Store Presence

## Table of Contents

- [Summary](#summary)
- [Status](#status)
- [Comparison claim verification](#comparison-claim-verification)
- [Promo assets](#promo-assets)
  - [Small promo tile](#small-promo-tile)
  - [Promo video script](#promo-video-script)
- [Featured badge nomination](#featured-badge-nomination)
- [Category test](#category-test)
- [Ratings](#ratings)

---

## Summary

The record of the work that makes Steer Clear findable and trusted in the
stores once 2.0.0 is live: the promo tile and video, the Chrome Web Store
Featured nomination, the 4+4-week category test, and the dated check of the
one comparison claim the listings make. Every number here comes from the
store's own developer dashboard; the extension reports nothing.

Order of work, after 2.0.0 is live on the Chrome Web Store:

1. Upload the 440×280 small promo tile and the 30–60 s promo video.
2. Nominate for the Featured badge through One Stop Support.
3. Start the category test: 4 weeks in the current category, then 4 weeks in
   "Workflow & Planning"; keep the better one.

---

## Status

| Item | Status |
|---|---|
| Small promo tile 440×280 | **Generated** (`store/screenshots/promo-small-440x280.png`, by `node tools/screenshots.mjs`); not uploaded yet |
| Promo video 30–60 s | **Script ready** (below); not recorded or uploaded yet |
| 2.0.0 live on the Chrome Web Store | Not yet |
| Featured nomination | Not submitted; waits for 2.0.0 live with the promo assets |
| Category test | Not started; waits for 2.0.0 live |
| Comparison claim re-checked on submission date | Last checked 2026-10-16 (research); re-check before submitting 2.0.0 |

---

## Comparison claim verification

The listings say, word for word: "Asks for access only to the sites you add,
unlike one sec, LeechBlock NG and Freedom's Pause." It is true only while each
named extension asks for all-sites access. Check before each submission by
downloading each package from Chrome's update endpoint
(`https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3D<ID>%26uc`)
and reading its `manifest.json`. If one has moved to per-site access, drop its
name from the sentence in all three listings and in
`tests/unit/listing_copy.test.js` together.

| Date | one sec (`femnahohginddofgekknfmaklcbpinkn`) | LeechBlock NG (`blaaajhemilngeeffpbfkdjjoefldkok`) | Freedom's Pause (`ljfdccdjpfjpfjbpdiihanpodilolofh`) | Checked by |
|---|---|---|---|---|
| 2026-10-16 | v1.4.2: `host_permissions` and content scripts `<all_urls>` | v1.8: `host_permissions` `<all_urls>` | v1.0.1: content script on `<all_urls>` (same "all your data on all websites" warning) | `knowledge/market_research/research_notes/competitive_landscape/uniqueness_verification.md` |
| (2.0.0 submission date) | | | | |

Never claim "only" or "first": Intention also asks per site.

---

## Promo assets

### Small promo tile

440×280 PNG, regenerated with the screenshots by `node tools/screenshots.mjs`
and committed in `store/screenshots/promo-small-440x280.png`. Upload it on the
Chrome listing's Store listing tab, and on Edge, before the nomination.

### Promo video script

30–60 seconds, captions only (no voice-over needed), 1280×800 screen capture
of a demo profile seeded by `tools/extension_harness.mjs`. Upload to YouTube
(unlisted is fine) and paste the link in the Chrome listing's "YouTube video"
field.

| Time | Screen | Caption |
|---|---|---|
| 0–5 s | Typing `reddit.com` in the address bar, out of habit | You didn't decide to open that site. Your fingers did. |
| 5–15 s | The pause page with the user's own reason | Steer Clear shows you your own reason first. |
| 15–25 s | One click on the destination button; the chosen page opens | One click to somewhere better. |
| 25–35 s | Back on the pause page; "Continue anyway"; the site loads; the badge shows `5m` | And when you mean it, you're through. It always lets you through. |
| 35–45 s | Settings: adding a site, the per-site prompt for that site only | It asks for access only to the sites you add. |
| 45–55 s | The statistics page: steered clear vs continued | Your patterns stay on your device. No accounts. No servers. |
| 55–60 s | Logo and name | Steer Clear. A nudge, not a wall. |

Keep the copy rules from `store/LISTING.md`: no health claims.

| Date | Version recorded | Length | Link | Uploaded to |
|---|---|---|---|---|
| — | — | — | — | Not recorded yet |

---

## Featured badge nomination

Submit through the Chrome Web Store One Stop Support form (pick the option for
nominating an item to be featured) **after** 2.0.0 is live with the promo tile and
the video uploaded. The criteria Google reviews (Manifest V3, no remote code,
minimal permissions, a clear listing and privacy disclosures) are the ones
Steer Clear is built around; say so briefly in the form.

| Date submitted | Version live | Outcome | Date of outcome | Reason if declined | Next step |
|---|---|---|---|---|---|
| — | — | Not submitted | — | — | Submit after 2.0.0 is live with the promo assets |

If declined, record the reason, change the listing accordingly, and resubmit
after that listing change.

---

## Category test

Weeks 1–4 in the current category (Productivity), then weeks 5–8 in "Workflow
& Planning" (where Unhook sits). Each week, copy impressions and installs from
the developer dashboard's store-listing report. At the end keep the category
with the higher installs per impression, and record the decision.

| Week | Dates | Category | Impressions | Installs | Installs per 1,000 impressions |
|---|---|---|---|---|---|
| 1 | | Productivity | | | |
| 2 | | Productivity | | | |
| 3 | | Productivity | | | |
| 4 | | Productivity | | | |
| 5 | | Workflow & Planning | | | |
| 6 | | Workflow & Planning | | | |
| 7 | | Workflow & Planning | | | |
| 8 | | Workflow & Planning | | | |

Decision: (to record after week 8)

---

## Ratings

The in-product rating prompt appears once a user has chosen the destination
10 times, on the popup and the statistics page, and links to the store of the
browser it runs in (`STORE_REVIEW_URL` in `src/constants.js`):

| Store | Reviews URL | Status |
|---|---|---|
| Chrome Web Store | `https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn/reviews` | Live |
| addons.mozilla.org | `https://addons.mozilla.org/firefox/addon/steer-clear/reviews/` | Slug `steer-clear` free on 2026-10-17; becomes live with the first AMO listing |
| Edge Add-ons | Not known until the listing exists | Prompt hidden on Edge until filled in |
