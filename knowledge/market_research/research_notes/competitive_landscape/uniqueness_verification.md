# Steer Clear uniqueness verification: per-site host access and a user-written reason on the pause page

Method: on 2026-10-16 each competitor's current package was downloaded from Chrome's public update endpoint (`clients2.google.com/service/update2/crx?...x=id%3D<ID>`), and its `manifest.json` and bundled JS were read directly. Chrome Web Store (CWS) listings were fetched for the privacy disclosures. The CRX link pattern used below is `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3D<ID>%26uc`.

## (A) Which host permissions do competitors request, and is per-site optional host access rare?

### Takeaway
Claim A is **partly refuted**. Most competitors do ask for access to all sites. **Intention (getintention), the closest rival, already does what Steer Clear does:** it puts `<all_urls>` only under `optional_host_permissions` and asks for one site's access each time the user adds a site. The accurate claim is "rare", not "unique": 1 of the 7 extensions checked works this way.

### Cited Findings
| Extension (CWS ID) | Version | `host_permissions` | `optional_host_permissions` | Content scripts | Source |
|---|---|---|---|---|---|
| one sec (femnahohginddofgekknfmaklcbpinkn) | 1.4.2 | `<all_urls>` | none | `<all_urls>` | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dfemnahohginddofgekknfmaklcbpinkn%26uc) |
| Intention – Stop Mindless Browsing (dladanhaondcgpahgiflodhckhoeohoe) | 1.5.0 | none | `<all_urls>` | none (uses `scripting` + `activeTab`) | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Ddladanhaondcgpahgiflodhckhoeohoe%26uc) |
| Freedom's Pause – Stop Mindless Browsing (ljfdccdjpfjpfjbpdiihanpodilolofh) | 1.0.1 | none | none | `<all_urls>` | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dljfdccdjpfjpfjbpdiihanpodilolofh%26uc) |
| PauseTab, the site-delay one (enghckakgjjoncdcdlkagoodggpgoleg) | 0.1.0 | `http://*/*`, `https://*/*` | none | `http(s)://*/*` | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Denghckakgjjoncdcdlkagoodggpgoleg%26uc) |
| Pause Tab, the overlay one (mchlboajlegefhfppofhgmmjifkpcbch) | 1.9.1 | `<all_urls>` | none | none | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dmchlboajlegefhfppofhgmmjifkpcbch%26uc) |
| ZenBlock (gnjnoncblhhofbhekoogfohpppkbiclo) | 1.0.9 | `<all_urls>` | none | `*://*.google.com/*` | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dgnjnoncblhhofbhekoogfohpppkbiclo%26uc) |
| LeechBlock NG, CWS build (blaaajhemilngeeffpbfkdjjoefldkok) | 1.8 | `<all_urls>` | none (optional `history` only) | `<all_urls>` | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dblaaajhemilngeeffpbfkdjjoefldkok%26uc); [GitHub manifest](https://raw.githubusercontent.com/proginosko/LeechBlockNG/master/manifest.json), which also shows `host_permissions: ["<all_urls>"]` |
| With Intention, a minor rival (fccbnilmkfoeamilfnaannjjocnnigio) | 0.2 | `http://*/`, `https://*/` | none | none | [CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dfccbnilmkfoeamilfnaannjjocnnigio%26uc) |

- **Intention asks for one site at a time.** Its sites store has an `add(site, "blacklist")` method that calls `permissions.request({origins:[<that site's pattern>]})` and stops if the user declines. The same code appears in `background.bundle.js`, `popup.bundle.js`, `options.bundle.js`, `welcome.bundle.js` and `inject.bundle.js`. Its onboarding permission set is `{origins: [], permissions: ["notifications"]}` (plus `tabs` on one browser branch), so onboarding asks for no host access. The background script also listens on `permissions.onAdded` to start working on newly granted origins. — [Intention CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Ddladanhaondcgpahgiflodhckhoeohoe%26uc)
- **The two "PauseTab" listings are different products.** Gelform's PauseTab (dgdanonfgilmmpcmidfmipgiefhmpnbd) snoozes tabs and is not a site-pause tool. The site-delay PauseTab is enghckakgjjoncdcdlkagoodggpgoleg. — [extensionauditor](https://extensionauditor.com/scan/pausetab-dgdanonfgilmmpcmidfmipgiefhmpnbd); [extscope](https://extscope.org/extension/enghckakgjjoncdcdlkagoodggpgoleg)
- **The one sec listing** shows developer riedel.wtf GmbH, 40,000 users, v1.4.2, updated 2026-09-25. — [CWS one sec](https://chromewebstore.google.com/detail/femnahohginddofgekknfmaklcbpinkn)
- **The Intention listing** shows developer Road to Ramen LLC, 7,000 users, v1.5.0, last updated 2025-03-15. — [CWS Intention](https://chromewebstore.google.com/detail/dladanhaondcgpahgiflodhckhoeohoe)

### Inferences
- Freedom's Pause declares no host permissions, but its content script matches `<all_urls>`. Chrome raises the same "Read and change all your data on all websites" warning for that, so it still counts as all-sites access.
- Every competitor except Intention triggers the all-sites warning at install.
- Steer Clear can honestly say it "asks for access only to the sites you add, unlike one sec, Freedom's Pause, LeechBlock NG, ZenBlock and PauseTab". It cannot say "the only one".

### Gaps
- I did not see the actual install dialogs. The warnings above are inferred from manifests using Chrome's documented rules, not from screenshots.
- I did not check whether Intention also requests all-sites access at some other point, for example the "top sites" suggestions, which use the optional `topSites` permission. The code I read requests only single-site origins.

## (B) Does any competitor show a reason the user wrote for that site on its pause page?

### Takeaway
Claim B is **partly refuted**. **LeechBlock NG already does this.** The user writes a message for each "block set" (a named group of sites), and LeechBlock shows it on both its block page and its delay countdown page. one sec lets the user write one breathing phrase, but that phrase applies to every site, not to one. Freedom's Pause, ZenBlock and Pause Tab showed no such feature in what I checked. Intention asks for a time limit and a reflection at the end; it does not show a stored reason. Steer Clear's real difference is a reason tied to each individual site, with no block-set setup.

### Cited Findings
- **LeechBlock NG options page:** each block set has the field "Enter a custom message for the blocking page (optional):". — [LeechBlock CRX options.html](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dblaaajhemilngeeffpbfkdjjoefldkok%26uc)
- **LeechBlock NG pages:** `background.js` reads ``gOptions[`customMsg${blockedSet}`]``, so the message is stored per block set. It is passed to the page, and both `blocked.html` and `delayed.html` contain `<!-- custom message (optional) --> <div id="lbCustomMsgDiv">`. The Azerbaijani translation of the label reads "a message from yourself". — same CRX
- **one sec phrase:** the breathing exercise has a "Phrase" field, placeholder "Custom breathing reminder...", default "It's time to take a deep breath…". It is stored in one global entry, `useLocalStorage("interventionSettings.basicBreath", {types, duration, phrase, ...})`. — [one sec CRX](https://clients2.google.com/service/update2/crx?response=redirect&prodversion=130.0&acceptformat=crx2,crx3&x=id%3Dfemnahohginddofgekknfmaklcbpinkn%26uc)
- **one sec per-site settings:** a per-site "App-specific settings → Customize intervention settings" dialog exists. Its English strings cover only show/hide, timing (immediately/delayed/always ask), delay, maximum time interval, and domain scope. No phrase or message field appears there. — same CRX
- **one sec free vs Pro:** some intervention types and timing modes are Pro-only ("Only {{-allowedInterventions}} are available for free. To use more, get a Pro subscription."; delayed or always-ask timing is "free for a single website"). — same CRX
- **Intention:** the listing describes committing to a time limit to unlock a site and reflecting when time runs out. It does not mention a stored user-written reason. — [CWS Intention](https://chromewebstore.google.com/detail/dladanhaondcgpahgiflodhckhoeohoe)
- **Freedom's Pause:** a green screen and a 5-second pause (adjustable), then continue, stay, or close. There is a pre-seeded list of 50 sites and no mention of custom messages. — [Freedom blog](https://freedom.to/blog/introducing-pause-a-chrome-extension-for-intentional-browsing/); [CWS Pause](https://chromewebstore.google.com/detail/ljfdccdjpfjpfjbpdiihanpodilolofh)
- **With Intention:** a minor rival that asks the user to type an intention on every visit, not a stored reason. — search-result summary of its [CWS listing](https://chrome.google.com/webstore/detail/with-intention/fccbnilmkfoeamilfnaannjjocnnigio); not checked against its code

### Inferences
- LeechBlock NG is the precedent that weakens claim B. A user can put each site in its own block set and get a per-site message. But the feature is optional and buried in a dense options page, and Steer Clear makes it the main feature.
- Suggested wording: "the reason you wrote for this site, shown every time", rather than "the only extension that shows your own reason".

### Gaps
- I read one sec's code from minified locale strings and logic. I did not see a running one sec pause screen.
- one sec's mapping `{duration:!0, phrase:!1, ...}` looks like it might mean "phrase cannot be set per site". That reading is unconfirmed.
- ZenBlock and both PauseTab variants: I did not grep their bundles for custom message fields. "No such feature" for them is unconfirmed.

## (C) What do one sec and Intention disclose under "Privacy practices", and does one sec need an account?

### Takeaway
Both declare on the Chrome Web Store that they "will not collect or use your data". I found no evidence that one sec's extension needs an account. Its website has a "Log in" link whose purpose for the extension is not stated, so this is unconfirmed.

### Cited Findings
- **one sec:** "The developer has disclosed that it will not collect or use your data", plus the standard not-sold / not-unrelated-use / no-creditworthiness certifications, the "Follows recommended practices" badge, and an EU trader declaration. — [CWS one sec](https://chromewebstore.google.com/detail/femnahohginddofgekknfmaklcbpinkn)
- **Intention:** the same "will not collect or use your data" disclosure and certifications; the developer has not identified as a trader. — [CWS Intention](https://chromewebstore.google.com/detail/dladanhaondcgpahgiflodhckhoeohoe)
- **one sec's own pages** call the extension "free" and do not mention an account. — [one sec browser extension](https://one-sec.app/browser-extension); [help center](https://feedback.one-sec.app/help/articles/6444884-one-sec-for-desktop-browsers-chrome-firefox-edge)
- **Freedom's Pause:** Freedom says user data "remains secure on your own device". — [Freedom blog](https://freedom.to/blog/introducing-pause-a-chrome-extension-for-intentional-browsing/)

### Inferences
- Since both main rivals already say "no data collected", Steer Clear's privacy pitch has to rest on its narrow permissions and its open-source code, not on "we don't collect data".
- one sec's privacy claim is a self-declaration. Its manifest still grants all-sites access and injects a script into every page.

### Gaps
- one sec account requirement: unconfirmed. One way to check is a fresh install, or grepping its bundle for login or sign-in flows; my first grep was inconclusive.
- I did not read one sec's or Intention's full privacy policies.
