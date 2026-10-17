# Submitting Steer Clear to the Stores

## Table of Contents

- [Summary](#summary)
- [Status](#status)
- [Step 0 — Host the privacy policy](#step-0--host-the-privacy-policy)
- [Step 1 — Create the item](#step-1--create-the-item)
- [Step 2 — Store listing tab](#step-2--store-listing-tab)
- [Step 3 — Privacy practices tab](#step-3--privacy-practices-tab)
- [Step 4 — Distribution tab](#step-4--distribution-tab)
- [Step 5 — Submit](#step-5--submit)
- [After submitting](#after-submitting)
- [If it is rejected](#if-it-is-rejected)
- [Updating the Chrome item to 2.0.0](#updating-the-chrome-item-to-200)
- [Edge Add-ons](#edge-add-ons)
- [Firefox Add-ons (AMO)](#firefox-add-ons-amo)

---

## Summary

Everything is prepared: the package is built, the screenshots are captured, and
every field's text is written. What remains is uploading and pasting, in the
order below.

**Do Step 0 first.** The form cannot be submitted without a privacy-policy URL,
and discovering that with a half-filled form is annoying.

Paste-ready text for every field is in `store/LISTING.md`. Where this document
says "paste the X block", that is where X lives.

Steps 0–5 are the Chrome Web Store walkthrough that shipped 1.0.0. Version
2.0.0 is an update of that item (see
[Updating the Chrome item to 2.0.0](#updating-the-chrome-item-to-200)), and
the same version goes to Edge Add-ons and addons.mozilla.org with
`store/LISTING_EDGE.md` and `store/LISTING_FIREFOX.md`. Build both packages
with `node tools/build.mjs`.

---

## Status

As of 2026-10-16 — **approved and live on the Web Store; not yet announced**:

| Item | Status |
|---|---|
| Developer registration ($5) | **Done.** Dashboard is live; the account has a 2-item extension limit, Steer Clear uses one |
| Publisher account settings | **Done.** Publisher name `eladlaor`; contact email set and verified |
| Privacy policy hosted | **Done.** Repo is public; GitHub Pages serves `main` at `https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY` (verified rendering 2026-10-02) |
| Package, screenshots, listing text | **Done** |
| Submitted | **Done, 2026-10-02.** Version 1.0.0, item ID `fooahacimdgjcfoofpijkpmgiaghinbn` |
| Review | **Passed.** Listing is live at `https://chromewebstore.google.com/detail/steer-clear/fooahacimdgjcfoofpijkpmgiaghinbn` (verified 2026-10-15) |
| Public launch announcement | **Not yet.** Held pending competitive research; the draft is in `store/LISTING.md` |
| 2.0.0 package and listing text | **Ready on the branch** (2026-10-17): `dist/steer-clear-chrome-2.0.0.zip`, `dist/steer-clear-firefox-2.0.0.zip`, `store/LISTING*.md`. Not uploaded |
| Edge Add-ons | **Not started.** Partner Center account and the 1.0.0 upload come first (`store/LISTING_EDGE.md`) |
| Firefox Add-ons | **Not started.** Slug `steer-clear` free on 2026-10-17; ask AMO about the data-collection category first (`store/LISTING_FIREFOX.md`) |

---

## Step 0 — Host the privacy policy

**Done.** The policy is live at
`https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY`, served by GitHub
Pages from `main`. Any edit to `store/PRIVACY_POLICY.md` merged to `main` goes
live within a couple of minutes. The setup is kept below for reference.

The listing requires a publicly reachable privacy policy. Pages on a private
repo requires a paid GitHub plan, which is why the repo was made public. The
options were:

- **Make the repo public, then enable Pages.** Settings → General → visibility
  → Public; then Settings → Pages → **Deploy from a branch**, branch **`main`**,
  folder **`/ (root)`** → **Save**. The policy is then at
  `https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY`. This publishes
  the source too, which is harmless for an extension (installed code is
  readable anyway).
- **Keep the repo private and publish only the policy** — a public GitHub Gist,
  or a Google Doc shared as "anyone with the link can view". Paste the contents
  of `store/PRIVACY_POLICY.md`.

Whichever you choose, the policy published must be the current
`store/PRIVACY_POLICY.md` on `main`.

**Open the URL in a private window and confirm it renders as a formatted page**, not as raw
markdown and not as a 404. A reviewer who clicks through to a broken link is a
reviewer who rejects the submission.

---

## Step 1 — Create the item

1. Go to https://chrome.google.com/webstore/devconsole
2. **Add new item**
3. Upload `dist/steer-clear-1.0.0.zip`

If the upload is rejected with a manifest error, the zip was built wrong — the
manifest must sit at the zip root. Rebuild with `node tools/build.mjs`, which
handles and verifies this.

Once the upload succeeds, the dashboard opens the item's tabs. They can be
filled in any order, but all must be complete before Submit unlocks.

---

## Step 2 — Store listing tab

| Field | Value |
|---|---|
| Name | `Steer Clear` |
| Short description | the **Short description** block |
| Description | the **Detailed description** block |
| Category | `Productivity` |
| Language | `English` |

**Store icon:** upload `src/icons/icon-128.png` separately. The icon inside the
package is not used for the listing; without this upload the dashboard blocks
publishing with "Icon image is missing".

**Screenshots:** upload all five from `store/screenshots/`, in this order:

They are generated, not hand-made: `node tools/screenshots.mjs` loads `src/`
in Chromium, seeds the demo persona, and writes all five at exactly 1280×800,
plus the 440×280 small promo tile.
Re-run it after any UI change. Use `--out <dir>` to preview without
overwriting the committed set.

1. `1-reminder.png` — the reminder page; this is the product, so it leads
2. `2-breathing.png` — the breathing pause style
3. `3-settings.png` — settings, showing the model is comprehensible
4. `4-patterns.png` — statistics, which also makes the local-only data story
   concrete for a reviewer who is about to read the privacy disclosures
5. `5-popup.png` — the toolbar popup: quick-add, today, snooze

The small promo tile is `promo-small-440x280.png`; upload it before a Featured
nomination.

---

## Step 3 — Privacy practices tab

The tab that decides how long review takes. Every field here has prepared text.

**Single purpose** — paste the **Single-purpose statement** block.

**Permission justifications** — one field per permission:

| Permission | Paste |
|---|---|
| `declarativeNetRequest` | the **`declarativeNetRequest`** block |
| `storage` | the **`storage`** block |
| `alarms` | the **`alarms`** block |
| `activeTab` (2.0.0) | the **`activeTab`** block |
| Host permissions | the **Host permissions** block |

**Remote code** — answer **No**, and paste the **Remote code use** block.

**Data collection** — answer exactly as in the **Data-use disclosures** table:

- Personally identifiable information — **No**
- Health information — **No**
- Financial and payment information — **No**
- Authentication information — **No**
- Personal communications — **No**
- Location — **No**
- **Web history — Yes**
- **User activity — Yes**
- Website content — **No**

Then paste the prepared justification (the indented block under the table) into
the description field for the data collected.

> **Do not be tempted to answer No to those two.** The statistics feature
> records when you tried to reach a configured domain. That is timestamped
> activity data, and the question asks what the extension *collects*, not what
> it transmits. An inaccurate disclosure is grounds for takedown after
> publication — much worse than a slower review. The prepared justification
> makes the local-only, 90-day, one-click-erase story clearly, and it reads
> well.

**Certifications** — check all three:

- Not being sold to third parties
- Not being used for purposes unrelated to the item's single purpose
- Not being used to determine creditworthiness or for lending

**Privacy policy URL** — the GitHub Pages URL from Step 0.

---

## Step 4 — Distribution tab

| Field | Value |
|---|---|
| Visibility | **Public** |
| Distribution | All regions (default) |
| Pricing | Free |

---

## Step 5 — Submit

**Submit for review.** The dashboard will list anything still missing; the tabs
above cover all of it.

---

## After submitting

- **Expect a longer wait than average.** `declarativeNetRequest` with redirect
  is the permission set traffic-hijacking extensions use, and a first submission
  from a new developer account draws more scrutiny. Days to a couple of weeks is
  normal. Silence is not a bad sign.
- **Do not post the launch announcement until the listing is live.** The draft
  in `store/LISTING.md` is ready, but pointing people at a pending listing
  wastes the launch.
- **You will get an email** on approval or rejection.

---

## If it is rejected

Rejections name a specific policy, and most are fixable in an afternoon. The
plausible ones here:

| Likely rejection | Fix |
|---|---|
| Permission justification insufficient | Usually means a field was left short. The prepared blocks are deliberately specific; make sure they were pasted in full |
| Privacy policy unreachable | Step 0's URL did not resolve, or Pages was not enabled |
| Data disclosure inconsistent with behavior | The declared answers must match what the code does; this is why Web history and User activity are Yes |
| Single purpose unclear | Paste the prepared statement verbatim rather than paraphrasing |

To resubmit: fix the issue, bump `version` in `src/manifest.json`, rebuild with
`node tools/build.mjs`, upload `dist/steer-clear-chrome-<version>.zip`, and resubmit. Chrome refuses an upload
whose version has not increased.

Paste the rejection text into the working session and the fix can be made
directly.

---

## Updating the Chrome item to 2.0.0

1. Run the release checks in `knowledge/usage_guides/DEVOPS_GUIDE.md`
   ("Release to the three stores"), including `node tools/upgrade_check.mjs`.
2. Dashboard → the item → **Package** → **Upload new package** →
   `dist/steer-clear-chrome-2.0.0.zip`.
3. **Store listing:** replace the short and detailed descriptions with the
   2.0.0 blocks in `store/LISTING.md`; upload the five screenshots again and the
   small promo tile.
4. **Privacy practices:** add the `activeTab` justification; replace the
   `storage`, `alarms` and host-permission blocks with the 2.0.0 text; keep the
   data-use answers (re-checked for 2.0.0 in `store/LISTING.md`).
5. Re-check the comparison sentence (`knowledge/setup/STORE_PRESENCE.md`), then
   submit. Adding `activeTab` shows no install warning, so existing users are
   not asked to re-approve.

---

## Edge Add-ons

1. Create a Microsoft Partner Center developer account (free) and open the
   Edge program.
2. **Create new extension** → upload the package: first the 1.0.0 zip with the
   1.0.0 subset of the copy, then `dist/steer-clear-chrome-2.0.0.zip`.
3. **Availability:** public, all markets.
4. **Properties:** category, privacy policy URL, website and support contact
   from `store/LISTING_EDGE.md`.
5. **Store listings:** English; description, search terms, logo, screenshots
   and the small promo tile from `store/LISTING_EDGE.md`.
6. Paste the certification notes and publish.
7. Once live: set `STORE_REVIEW_URL.edge` in `src/constants.js` and record the
   listing URL and date in the status table above.

---

## Firefox Add-ons (AMO)

1. Confirm the add-on id `steer-clear@eladlaor` (permanent after the first
   upload) and that the slug `steer-clear` is still free.
2. Ask AMO about the data-collection declaration for `storage.sync`
   (`store/LISTING_FIREFOX.md`); change the manifest and the privacy policy
   together if the answer requires it.
3. Run `npx --yes web-ext@10.7.0 lint --source-dir dist/firefox --warnings-as-errors`.
4. addons.mozilla.org → **Developer Hub** → **Submit a New Add-on** → **On this
   site** → upload `dist/steer-clear-firefox-2.0.0.zip`; platforms Firefox and
   Firefox for Android.
5. Source code: answer that none is needed (no minification or bundling).
6. Describe the add-on: the fields in `store/LISTING_FIREFOX.md`, slug
   `steer-clear`, the privacy policy text, and the notes to the reviewer.
7. Once live: confirm the listing URL matches `STORE_REVIEW_URL.firefox`, and
   record it and the date in the status table above.
