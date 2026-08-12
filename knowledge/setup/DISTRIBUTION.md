# Distributing Steer Clear

## Table of Contents

- [Summary](#summary)
- [The three options](#the-three-options)
- [Option A — Chrome Web Store](#option-a--chrome-web-store)
- [Option B — Unpacked folder](#option-b--unpacked-folder)
- [Option C — Self-hosted CRX](#option-c--self-hosted-crx)
- [What blocks a Web Store submission today](#what-blocks-a-web-store-submission-today)
- [Publishing checklist](#publishing-checklist)
- [After publishing](#after-publishing)

---

## Summary

**You do not need the Chrome Web Store to let someone else use this.** You can
send them the folder today and it will work.

But for the audience described in the project plan — people who recognize the
habit and want it fixed, reached through a LinkedIn post — the store is the only
path that actually works. Unpacked installs demand a developer-mode walkthrough
most people abandon, and Chrome nags them at every startup afterward.

**Recommendation:** use unpacked installs for a handful of friends who will give
you feedback; publish to the store before any public announcement.

---

## The three options

| | Web Store | Unpacked folder | Self-hosted CRX |
|---|---|---|---|
| Recipient effort | Two clicks | Download, unzip, enable developer mode, load folder | Not possible on standard Chrome |
| Survives restart cleanly | Yes | Yes, but with a warning prompt each launch | — |
| Auto-updates | Yes | No — resend the folder every change | — |
| Cost | $5 once | Free | Free |
| Review delay | Days to weeks, longer for this permission set | None | — |
| Works for non-technical users | Yes | Rarely | No |
| Good for | Public launch | 2–5 testers | Enterprise only |

---

## Option A — Chrome Web Store

The only option that produces a link anyone can click.

**Cost:** $5 one-time developer registration.

**Review:** expect closer scrutiny than average. `declarativeNetRequest` with
redirect is the permission set traffic-hijacking extensions use, and reviewers
treat it accordingly. `store/LISTING.md` contains justifications written to
address exactly that suspicion. Do not weaken them to sound more casual.

**Unlisted publishing** is worth knowing about: the extension gets a real store
URL and installs in two clicks, but does not appear in search. It still goes
through full review. This is the best way to hand the extension to a dozen
people without committing to a public launch.

---

## Option B — Unpacked folder

What you are running now, and what you can share today at zero cost.

**Send them:** a zip of the `src/` directory. Nothing else is needed — no build
step, no dependencies.

**They do:**

1. Unzip somewhere permanent — the extension breaks if the folder moves or is
   deleted
2. Open `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the unzipped `src` folder

**Tell them these three things**, because each one generates a confused message
otherwise:

- **Chrome will warn them at every startup** about running extensions in
  developer mode. It is not an error and cannot be dismissed permanently.
- **Moving or deleting the folder breaks the extension.** It is a live link to
  that directory, not a copy.
- **Updates are manual.** Send a new zip; they replace the folder and click the
  reload icon on the extension card.

This is fine for a few people who will give you feedback. It is not a
distribution channel — the drop-off rate on "enable developer mode" is severe,
and a warning prompt on every launch reads as *something is wrong with this*.

---

## Option C — Self-hosted CRX

Packaging a `.crx` file and hosting it yourself.

**This no longer works for ordinary users.** Chrome blocks installation of CRX
files from outside the Web Store, and the policy that permits it
(`ExtensionInstallAllowlist`) requires enterprise management of the machine.

Useful only if you are deploying to a managed fleet. Ignore it otherwise.

---

## What blocks a Web Store submission today

Two items, both requiring you; everything else is prepared:

| Item | Status |
|---|---|
| Icons | **Done.** All four sizes present; the 128×128 reads clearly at listing size |
| Screenshots | **Done.** Three at 1280×800 in `store/screenshots/` |
| Submission zip | **Done.** `dist/steer-clear-1.0.0.zip`, rebuild with `./tools/package.sh` |
| Privacy policy hosted | **You must do this.** Repo Settings → Pages → deploy from `main` |
| Developer registration | **You must do this.** $5 one-time |

One thing to confirm visually before submitting, since it is what reviewers and
users react to most strongly: the extension should show **no** "read and change
all your data on all websites" warning at install. It requests access to each
site individually as the user adds it, via `optional_host_permissions` in
`src/manifest.json`. If that warning does appear, the manifest has regressed to
a blanket `host_permissions` grant and should be fixed before submitting.

---

## Publishing checklist

1. **Register** at the Chrome Web Store Developer Dashboard, pay the $5.
   https://chrome.google.com/webstore/devconsole
2. **Host the privacy policy.** Repo Settings → Pages → source: deploy from
   branch `main`, folder `/ (root)`. The public URL for the listing field is
   then `https://eladlaor.github.io/steer-clear/store/PRIVACY_POLICY`
3. **Upload** `dist/steer-clear-1.0.0.zip` — already built, manifest at the root
4. **Upload the screenshots** from `store/screenshots/`, in numbered order.
   The reminder page leads because it is the product
5. **Fill the listing** from `store/LISTING.md` — the copy, permission
   justifications, and data-use disclosures are written to be pasted verbatim
6. **Set visibility to Public** and submit

Rebuild the zip after any code change with `./tools/package.sh`.

---

## After publishing

- **Updates** require a version bump in `src/manifest.json` and a new zip.
  Chrome refuses an upload whose version has not increased.
- **Each update is re-reviewed.** A rejection can leave the previous version
  live, so a bad release is not automatically a broken one.
- **The LinkedIn post** in `store/LISTING.md` is written but should not go out
  until the store link is live; sending people to a developer-mode walkthrough
  is how a launch dies.
