# Submitting Steer Clear to the Chrome Web Store

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

---

## Summary

Everything is prepared: the package is built, the screenshots are captured, and
every field's text is written. What remains is uploading and pasting, in the
order below.

**Do Step 0 first.** The form cannot be submitted without a privacy-policy URL,
and discovering that with a half-filled form is annoying.

Paste-ready text for every field is in `store/LISTING.md`. Where this document
says "paste the X block", that is where X lives.

---

## Status

As of 2026-10-02:

| Item | Status |
|---|---|
| Developer registration ($5) | **Done.** Dashboard is live; the account has a 2-item extension limit, Steer Clear will use one |
| Publisher account settings | **Done.** Publisher name `eladlaor`; contact email set and verified |
| Privacy policy hosted | **Done.** Repo is public; GitHub Pages serves `main` at `https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY` (verified rendering 2026-10-02) |
| Package, screenshots, listing text | **Done** |
| Submitted | No |

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
manifest must sit at the zip root. Rebuild with `./tools/package.sh`, which
handles this.

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

**Screenshots:** upload all three from `store/screenshots/`, in this order:

1. `1-reminder.png` — the reminder page; this is the product, so it leads
2. `2-settings.png` — settings, showing the model is comprehensible
3. `3-patterns.png` — statistics, which also makes the local-only data story
   concrete for a reviewer who is about to read the privacy disclosures

Promotional tiles are optional. Skip them for a first submission.

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
- **Do not post the launch announcement yet.** The draft in `store/LISTING.md`
  is ready, but pointing people at a pending listing wastes the launch.
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
`./tools/package.sh`, upload the new zip, and resubmit. Chrome refuses an upload
whose version has not increased.

Paste the rejection text into the working session and the fix can be made
directly.
