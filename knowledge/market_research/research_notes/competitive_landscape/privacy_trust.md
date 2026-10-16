# Privacy, Data Practices and Trust Among Website-Blocker / Productivity Extensions

Research date: 2026-10-16. About 20 search/fetch calls. Coverage is uneven: BlockSite, StayFocusd, LeechBlock NG, Freedom and the ecosystem incidents are well sourced. one sec, Intention, Opal and Mindful Browsing were **not** verified (see Gaps).

## What permissions do the top blockers request, and which require all-sites access, accounts, or server-side browsing data?

### Takeaway
Every major blocker checked asks for host access to all websites ("read and change all your data on all websites"). That includes the open-source, privacy-friendly LeechBlock NG. BlockSite openly collects visited URLs and declares "Web history" in its Chrome privacy disclosure. Freedom requires an account. Steer Clear's per-site optional host permission is therefore a real technical difference, even against the open-source leader. Its no-server, no-account, no-analytics posture separates it from the commercial players (BlockSite, Freedom, StayFocusd/Sensor Tower), but not from LeechBlock NG.

### Cited Findings
**BlockSite (BlockSite LP, Wilmington DE)**
- Chrome Web Store, fetched 2026-10-16: 1,000,000 users, rated 4.5 from 32.4K ratings, version 7.1.1 updated 2026-07-26. It holds the **Featured** badge, the publisher badge ("good record with no history of violations") and "Follows recommended practices". The privacy disclosure lists **"Web history"** as data collected, with the standard "not sold / not used for unrelated purposes" declarations. Features include syncing with the developer's mobile apps — [Chrome Web Store: BlockSite](https://chromewebstore.google.com/detail/blocksite-block-websites/eiimnmioipafcokbfikbljfdeojpcgbh)
- Firefox listing: BlockSite says it "receives and analyzes" **visited URLs, IP address, OS, browser and timestamps**. It says this data is not shared with third parties "for the purposes of marketing or targeting individual users". It also requests access to data on all websites and to browser navigation activity — [AMO: BlockSite](https://addons.mozilla.org/en-US/firefox/addon/blocksite/)
- BlockSite's privacy policy (AMO copy, last modified Aug 2018) lists browsing history information, including **URLs/domains visited, HTTP referrer and a "global unique identifier"**. It says the IP is partially hashed before storage. It states "We may disclose or share this Non-Personal Information with third parties as specified below". The opt-out is a checkbox tied to the "Block Adult Sites" feature — [AMO: BlockSite privacy policy](https://addons.mozilla.org/firefox/addon/blocksite/privacy/)
- Note the mismatch: the store says "not shared ... for marketing or targeting" while the policy says it "may disclose or share" with third parties. The store wording leaves room for non-marketing sharing such as analytics or research — same sources as above.

**StayFocusd (maintained by Sensor Tower)**
- The Chrome Web Store lists Sensor Tower as maintainer. The extension requires "read and change all your data" on all sites, and the developer says it does not collect personal data from pages browsed. One listing title reads "StayFocusd - Block Distracting Websites & **Web Analytics**" — [Chrome Web Store: StayFocusd](https://chrome.google.com/webstore/detail/stayfocusd/laankejkbhbdhmipfmgcngdelahlfoji)
- Sensor Tower's StayFocusd privacy policy (effective 2024-01-05) covers the **Android** app. It says the app's accessibility service collects stats on which websites you visit, and that this data may be able to identify you. It is not confirmed whether this applies to the Chrome extension — [Sensor Tower: StayFocusd privacy](https://sensortower.com/page-stayfocusd-privacy)
- Owner context, March 2020: BuzzFeed News found that Sensor Tower secretly owned at least 20 VPN and ad-blocking apps (Luna VPN, Free and Unlimited VPN, Adblock Focus, Mobile Data). These apps had more than 35M downloads and got users to install root certificates, giving access to device traffic. None of them disclosed the link to Sensor Tower. Apple and Google removed some of the apps — [BuzzFeed News](https://www.buzzfeednews.com/craigsilverman/vpn-and-ad-blocking-apps-sensor-tower); [Sophos](https://www.sophos.com/en-us/blog/analytics-firms-vpn-and-ad-blocking-apps-are-secretly-grabbing-user-data); [iMore](https://imore.com/analytics-firm-sensor-tower-secretly-harvested-user-data-through-vpn-and-ad-blocking-apps)

**LeechBlock NG (open source, proginosko)**
- Chrome manifest (MV3, v1.8): permissions are `alarms, contextMenus, offscreen, storage, tabs, unlimitedStorage, webNavigation`, with optional `history` and **`host_permissions: <all_urls>`** — [GitHub manifest.json](https://raw.githubusercontent.com/proginosko/LeechBlockNG-chrome/master/manifest.json)
- It is free and open source on GitHub, supports up to 30 block sets, and AlternativeTo tags it "privacy-focused" (a directory label, not an audit) — [Korben](https://korben.info/en/leechblock-extension-fight-procrastination.html); [AlternativeTo](https://alternativeto.net/software/leechblock/about)

**Freedom (Eighty Percent Solutions)**
- On Mac and Windows, the extension only extends the desktop app and has no standalone blocking. Setup starts with a **Freedom account**. On ChromeOS and Linux it works standalone, but you must sign in or create a trial account — [Freedom support](https://support.freedom.to/en/articles/1347519-freedom-browser-extensions)
- The Chrome listing carries the standard non-sale declarations. The specific data categories were not retrieved — [Chrome Web Store: Freedom](https://chromewebstore.google.com/detail/abdkjmofmjelgafcdffaimhgdgpagmop)
- A Firefox reviewer complained that the add-on used to work standalone "with no account-forcing necessary" — [AMO reviews: Freedom](https://smartvless.duckdns.org/en-US/firefox/addon/freedom-website-blocker/reviews/?score=1) (mirror site; low confidence)

### Inferences
- `<all_urls>` is the industry default for blockers, including the open-source benchmark (LeechBlock NG). A blocker that asks for host access only per added site is uncommon. This is the most defensible "first/only" claim for Steer Clear, but it needs verifying against one sec, Intention and Mindful Browsing before being stated publicly.
- BlockSite is the clearest contrast: Featured badge, 1M users, and an openly declared web-history collection with a URL plus unique-ID policy.
- StayFocusd's owner is a mobile-analytics company with a documented 2020 history of covert data collection through utility apps. That is a legitimate reason for distrust, though there is no evidence the extension itself leaks data.

### Gaps
- **one sec, Intention, Opal, Mindful Browsing:** permissions, account requirements and data disclosures were not checked because of the call budget. Their Chrome Web Store "Privacy practices" tabs and manifests need a check.
- StayFocusd's actual manifest permissions and the Chrome extension's own privacy policy were not retrieved (the Chrome Web Store fetch failed on a redirect loop).
- **StayFocusd ownership change:** no source found for when or how Sensor Tower took over the extension from its original developer. The "acquired" framing is unverified.
- BlockSite's current full privacy policy (blocksite.co) returned 404 at the guessed URL, so it was not reviewed. The AMO copy dates from 2018.
- Freedom's Chrome data-type disclosure was not retrieved.

## Known incidents: BlockSite controversies, blockers sold and turned malicious, Chrome Web Store malicious-extension waves 2024–2026, StayFocusd ownership

### Takeaway
No source found a BlockSite removal or formal scandal. Its "controversy" is that it collects URL data openly, plus user complaints about prompts asking them to help "study internet use". The strongest trust evidence is ecosystem-wide. Legitimate extensions turn malicious through hijacked developer accounts (Cyberhaven, Dec 2024) or through updates to long-trusted listings that held Featured/Verified badges (RedDirection, mid-2025). Trust signals on the store do not protect users. No incident specific to a website blocker was found.

### Cited Findings
- **BlockSite user complaints (dates unclear, older Mozilla forum threads):** a BlockSite pop-up asked users whether they would "help study internet use". Other users report it blocking all sites or taking over the browser. A reviewer says "it collects data", and the developer replies that users control their sharing in Options. No removal by Mozilla or Google was found — [Mozilla support thread](https://support.mozilla.com/no/questions/967602); [AMO reviews mirror](https://firefox.marketplace.browsertotal.com/en-US/firefox/addon/blocksite/reviews/?page=8)
- **Cyberhaven compromise (2024-12-24/25 to 12-26):** a phishing email posing as Chrome Web Store developer support led to a malicious OAuth app named "Privacy Policy Extension". The attacker used it to push a malicious version (24.10.4) that stole cookies and session tokens for social-media and AI sites. Cyberhaven pulled it within 60 minutes of detection. The wider campaign hijacked reportedly at least 16 extensions (Internxt VPN, VPNCity, Uvoice, ParrotTalks and others), affecting about 600K users (an estimate; sources vary) — [CyberInsider](https://cyberinsider.com/multiple-chrome-vpn-extensions-compromised-in-coordinated-attack/); [Cybersecurity News](https://cybersecuritynews.com/hackers-hijacked-16-chrome-extensions/amp/); [SOCRadar](https://socradar.io/blog/phishing-attack-cyberhaven-chrome-extension/); [BGR](https://www.bgr.com/tech/hackers-are-hijacking-chrome-extensions-in-an-attempt-to-steal-your-data)
- **RedDirection (disclosed July 2025, Koi Security):** 18 Chrome and Edge extensions with about 2.3M users. Many had **Verified badges, high ratings and Featured placement**. The flagship, the Geco color picker, was legitimate for years and was turned malicious by an update on 2025-06-27, while its privacy policy claimed it "does not collect any data". Microsoft removed the Edge listings — [The Register, 2025-07-08](https://www.theregister.com/2025/07/08/browser_hijacking_campaign/); [CSO Online](https://www.csoonline.com/article/4019477/verified-featured-and-malicious-reddirection-campaign-reveals-browser-marketplace-failures.html); [Dark Reading](https://www.darkreading.com/endpoint-security/chrome-store-features-extension-poisoned-sophisticated-spyware)
- **Avast/AVG (Dec 2019, Wladimir Palant):** security and shopping extensions collected detailed browsing history tied to a unique ID. Mozilla and Google removed them — [The Hacker News](https://thehackernews.com/2019/12/avast-and-avg-browser-plugins.html); [9to5Google](https://9to5google.com/2019/12/17/chrome-avast-extensions-removed/)
- **VPN extensions (Palant; date not confirmed in sources):** 32 VPN extensions used obfuscated code to queue browsing history and send it to operator servers, with anti-debugging defenses — [CyberInsider](https://cyberinsider.com/malicious-vpn-extensions-found-spying-on-chrome-users/)
- **Sensor Tower covert apps (March 2020):** see the previous section — [BuzzFeed News](https://www.buzzfeednews.com/craigsilverman/vpn-and-ad-blocking-apps-sensor-tower)
- **Enterprise exposure (LayerX report, 2025-04-15):** 99% of enterprise users have at least one extension, and 53% have extensions with "high" or "critical" permission scopes (cookies, passwords, browsing data) — [The Hacker News](https://thehackernews.com/2025/04/majority-of-browser-extensions-can.html); [LayerX PDF](https://go.layerxsecurity.com/hubfs/LayerX_Enterprise_Browser_Extension_Security_Report_2025.pdf)

### Inferences
- The pattern that matters for marketing: an `<all_urls>` extension that is benign today can turn hostile through an acquisition, an account takeover or an update. Steer Clear's per-site host permissions limit how much damage a future compromise could do. That is a concrete, explainable benefit, and it holds even though Steer Clear itself is honest.
- Featured and Verified badges demonstrably sat on malicious extensions in 2025, so "privacy by architecture" is a stronger trust argument than "trust our badge".

### Gaps
- No documented case found of a **website blocker specifically** being sold and turned into adware. The "popular extension acquired, then monetized" pattern is documented generally (Geco), but not for this category in these searches.
- Malicious-extension waves after mid-2025 (late 2025 to 2026) were not covered by these searches.
- Secure Annex and Malwarebytes reports were not reached.

## Manifest V3: how did the MV2-to-MV3 transition affect blockers, and is it over by 2026?

### Takeaway
Yes, it is over. MV2 was disabled for all users with no re-enable option from Chrome 138 (2025-07-24). The enterprise escape hatch ended with Chrome 139, and the Chrome Web Store removed all remaining MV2 extensions on **2026-08-31**. For simple domain blockers the declarativeNetRequest limits are generous. The casualties were mainly advanced content and ad blockers (uBlock Origin, which has a reduced "Lite" version).

### Cited Findings
- Official timeline: no new public MV2 extensions after Jan 2022. Phase-out began on Beta/Dev/Canary on 2024-06-03, when Featured MV2 extensions lost their badge. Disabling in Stable began 2024-10-09. MV2 was disabled by default on all channels on 2025-03-31, still re-enableable. On **2025-07-24, Chrome 138** disabled MV2 for all users with no re-enable. **Chrome 139** removed the ExtensionManifestV2Availability enterprise policy. On **2026-08-31** all remaining MV2 extensions were removed from the store; existing installs on Chrome 138 or earlier keep running but get no updates — [Chrome for Developers: MV2 deprecation timeline](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)
- Google reports that more than 85% of actively maintained extensions run MV3. DNR rulesets allow up to 330,000 static rules plus 30,000 dynamic rules — [Google blog: MV2 phase-out begins](https://blog.google/chromium/manifest-v2-phase-out-begins/)
- uBlock Origin has no MV3 version. uBlock Origin Lite (built on DNR) implements only part of the functionality, losing dynamic filtering, for example — [heise](https://heise.de/-9985310)

### Inferences
- MV3 is no longer a differentiator. Every surviving Chrome blocker is MV3 by necessity, LeechBlock NG included. Steer Clear's MV3 status is table stakes, not a selling point.
- The 30K dynamic-rule ceiling is far above any personal blocklist, so DNR is not a practical constraint for this category.

### Gaps
- No source found listing specific website blockers (as opposed to ad blockers) removed or abandoned in the MV2 purge.

## Do users choose extensions on privacy or open source? How do Chrome Web Store privacy disclosures and Featured/Established-publisher badges factor in?

### Takeaway
Academic evidence says most users trust developers by default, rarely read privacy policies and misunderstand permission prompts. Privacy is a niche purchase driver, not a mass one. Badges are Google-assigned: Featured comes from manual review, and Established Publisher is automatic and covers about 75% of extensions. They cannot be bought, and Steer Clear (live since Oct 2026) will not qualify for Established Publisher for "at least a few months". The 2025 malicious-badge incidents show badges are a weak trust guarantee.

### Cited Findings
- SOUPS 2021 survey (n=353): users "trust the developers but do little to protect their data", have limited knowledge of what extensions can technically do, and prefer permission statements that evoke a clear mental model. Permission prompts give very limited information about data access — [USENIX SOUPS 2021 (Kariryaa et al.)](https://usenix.org/system/files/soups2021-kariryaa.pdf)
- An IEEE study found that most users trust developers, many don't read extension privacy policies, and permission dialogs are "ineffective" — [IEEE Xplore](https://ieeexplore.ieee.org/document/10796625)
- NYU 2024 study of more than 40,000 reviews of privacy extensions: "a disconnect between what users want and what these extensions are actually providing". Trust in default configurations was a recurring concern — [NYU Engineering](https://engineering.nyu.edu/news/privacy-enhancing-browser-extensions-fail-meet-user-needs-new-study-finds); [TechXplore, 2024-06](https://techxplore.com/news/2024-06-privacy-browser-extensions-user.html)
- Badges: **Featured** is granted after manual review by Chrome team staff, covering best practices, current APIs, user privacy and listing quality; developers can nominate via One Stop Support. **Established Publisher** is automatic once a publisher has verified identity and a consistent positive policy track record, taking "at least a few months" for new developers and covering about 75% of extensions. Neither can be bought — [Chrome for Developers: discovery](https://developer.chrome.com/docs/webstore/discovery); [Google blog, 2022-04](https://blog.google/products/chrome/find-great-extensions-new-chrome-web-store-badges/)
- BlockSite holds Featured despite declaring web-history collection, which shows that Featured does not mean "collects nothing" — [Chrome Web Store: BlockSite](https://chromewebstore.google.com/detail/blocksite-block-websites/eiimnmioipafcokbfikbljfdeojpcgbh)
- Niche demand signals: Firefox reviewers call BlockSite "a privacy concern". A Reddit-blocker reviewer read the extension's GitHub code to check its permission scope. Freedom users complain about forced accounts — [AMO BlockSite reviews mirror](https://firefox.marketplace.browsertotal.com/en-US/firefox/addon/blocksite/reviews/?page=21); [Reddit Blocker listing](https://chromewebstore.google.com/detail/edcfjcohonkcaigpdlhoeooocbmndehm); [Freedom reviews mirror](https://smartvless.duckdns.org/en-US/firefox/addon/freedom-website-blocker/reviews/?score=1)

### Inferences
- Privacy is a **secondary differentiator**. It converts a technically literate minority (Reddit, Hacker News, r/privacy, open-source users) and supports word of mouth, but the academic evidence suggests it won't drive mass installs on its own. Lead with the user benefit; use privacy as the reason to trust it.
- The per-site permission prompt is also a UX advantage. A narrow, site-specific prompt matches the "clear mental model" users said they prefer (SOUPS 2021).
- Getting the Featured badge is plausible by nomination (MV3, no remote code, minimal permissions are exactly the reviewed criteria). Established Publisher will arrive automatically after a few clean months.

### Gaps
- No quantitative survey found on what share of website-blocker users pick an extension for privacy or open-source reasons.
- No Reddit threads were successfully retrieved. The search returned directories rather than threads, so Reddit sentiment is unsourced.
- The share of store extensions requesting `<all_urls>` was not found (the LayerX PDF was not opened).
