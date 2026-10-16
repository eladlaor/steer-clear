# User Needs and Behavioral Evidence for Soft-Friction Website Interventions

Scope: what users of website/app blockers want and complain about, and what behavioral science says about friction-based interventions, as evidence for or against Steer Clear's bet (visible soft interruption showing the user's own written reason + one-click alternative + easy 5-minute bypass, instead of a hard block or silent redirect).

Sourcing caveat for the whole file: many review summaries below come from third-party aggregators and competitor/affiliate blogs (tooltivity, makeheadway, screenbuddyapp, digitalzen, lockinmcp). They are directional, not audited. Peer-reviewed sources are flagged explicitly.

## Q1. Top recurring complaints in reviews of BlockSite, StayFocusd, LeechBlock, Cold Turkey, Freedom, one sec, Opal

### Takeaway
Complaints split into two opposite failure modes plus a trust layer: (a) "too easy to bypass" (Freedom, browser extensions in general), (b) "too strict / annoying" (Cold Turkey, one sec's every-time pause), and (c) monetization/trust damage: paywalled basics, upsell nags, and privacy/data harvesting (BlockSite, StayFocusd, Opal). Free + open source + no data collection is a real differentiator against the market leaders on Chrome.

### Cited Findings
**BlockSite**
- Free tier limited to ~6 blocked sites; reviewer notes it used to be unlimited and free — [Firefox add-on reviews via browsertotal mirror](https://firefox.marketplace.browsertotal.com/en-US/firefox/addon/blocksite/reviews/?page=30)
- Quick enable/disable toggle replaced with an "UPGRADE" button; developer said this was to "encourage less screen time"; reviewers report constant upgrade pushes and switching to LeechBlock — [Firefox reviews mirror](https://firefox.marketplace.browsertotal.com/en-GB/firefox/addon/blocksite/reviews/?page=8)
- Users allege excessive permissions and past spyware associations (unverified user claims); subscription popups and ads cited as detracting — [firefox-stats.com](https://firefox-stats.com/d/blocksite/reviews)
- Ratings: Trustpilot 2.8/5 (27 reviews); Firefox Add-ons 3.70 (~1,232 ratings) — [Trustpilot](https://nl-be.trustpilot.com/review/blocksite.co); [firefox-stats.com](https://firefox-stats.com/d/blocksite/reviews)

**StayFocusd** (Chrome)
- ~700K Chrome downloads; 4.44 lifetime stars (~8,779 ratings), but the last 100 reviews average 3.35 stars, down 1.30 from a 4.65 peak — [tooltivity](https://tooltivity.com/extensions/stayfocusd-website-blocker-and-focus-timer)
- Negative-mention ratios in a 500-review sample: privacy/data handling 8 of 10 mentions negative; "stops working / loses state" 7 of 11; site compatibility 6 of 7; AI features 8 of 12; an update wiped block lists — [tooltivity](https://tooltivity.com/extensions/stayfocusd-website-blocker-and-focus-timer)
- Onboarding states it is "owned and operated by Sensor Tower" (a market-intelligence firm); data-sharing consent box pre-ticked, re-prompts up to 3 times after opt-out; uploads page views and query parameters when consent is on — [tooltivity](https://tooltivity.com/extensions/stayfocusd-website-blocker-and-focus-timer)

**LeechBlock NG**
- Praised as the most flexible, free, open source; criticized for an unpretty UI and configuration that "requires reading documentation" — [tooltivity LeechBlock](https://tooltivity.com/extensions/leechblock-ng); [StayFocusd alternatives roundup](https://liveintently.app/blog/stayfocusd-alternatives/)

**Cold Turkey** (desktop app)
- Described as "one of the strictest blocking tools available"; once a block starts you "genuinely cannot disable it"; downside "steep learning curve... may feel restrictive"; $39 one-time — [focusme roundup](https://focusme.com/blog/best-website-blocker-for-increasing-productivity/); [chronoid roundup](https://www.chronoid.app/blog/best-website-blocker-for-mac) (both competitor blogs)

**Freedom**
- Main theme is bypassability: "inconsistent on phone; sometimes blocks, sometimes doesn't"; "you can still go to settings and disable permissions, which defeats the whole purpose of locked mode"; sessions not locked by default; premium required for advanced features; billing complaints (charged after accidental download) — [Trustpilot](https://www.trustpilot.com/review/freedom.to); [makeheadway review](https://makeheadway.com/blog/freedom-app-review/); [tryhugo review](https://www.tryhugo.app/blog/freedom-app-review-2026)

**one sec**
- The friction itself is the top complaint: described as "annoying" by design; breathing pause "every single time"; re-entering after briefly switching away counts as a new open — [Slate, June 2024](https://slate.com/life/2024/06/one-sec-app-smartphone-blocker-instagram-tiktok.html); [screenbuddyapp](https://www.screenbuddyapp.com/blog/one-sec-app-review)
- Free-tier users report frequent upgrade prompts; setup friction (per-app iOS Shortcuts automations); no daily time limits — [justuseapp reviews](https://justuseapp.com/en/app/1532875441/one-sec-fight-the-algorithm/reviews); [makeheadway](https://makeheadway.com/blog/one-sec-app-review/)

**Opal**
- Price is the dominant complaint: Pro ~$19.99/mo, $99.99/yr, $399 lifetime; plus bugginess/inconsistency, auto-renew billing surprises, and a reported unfixed Mac bypass bug — [makeheadway](https://makeheadway.com/blog/opal-app-review/); [justuseapp](https://justuseapp.com/en/app/1497465230/opal-save-time-daily/reviews); [tryhugo](https://www.tryhugo.app/blog/opal-app-review-2026)

**Cross-tool**
- HN commenters: browser-extension "walls" fail because "in the end they just disable them when they feel bothered"; another disabled a blocker to visit a site and forgot to re-enable it — [Show HN: Intention extension (2020)](https://news.ycombinator.com/item?id=22936742); "it's pretty easy to disable Chrome extensions" — [Ask HN: Strongest way to block distracting sites?](https://news.ycombinator.com/item?id=2122697)

### Inferences
- Rough complaint weighting across tools (qualitative, not a counted sample): bypassability and strictness are opposite complaints about the same axis; monetization (paywalls/upsells) and privacy are the complaints most likely to produce 1-star reviews and switching on Chrome specifically.
- A free, open-source, no-telemetry extension directly addresses the trust/monetization complaints against the two largest Chrome incumbents (BlockSite, StayFocusd). This is a launch-message pillar with strong evidence.
- one sec's reviews show that even a soft pause draws "annoying" complaints when it fires on every open; Steer Clear's 5-minute bypass window partially addresses the "re-entry counts as a new open" complaint.

### Gaps
- No systematic, counted complaint distribution (e.g., % of 1-star reviews by theme) across all seven tools; only StayFocusd has a quantified sample. Chrome Web Store review pages were not scraped directly.
- No verified current Chrome Web Store user counts for BlockSite, LeechBlock (Chrome port), or one sec's browser extension.
- Opal/Freedom/one sec ratings from App Store were not retrieved.

## Q2. What do r/nosurf, r/digitalminimalism, r/productivity, r/ADHD, and Hacker News want? Hard blocks or mindful pauses? ADHD-specific needs?

### Takeaway
The community is split, not unanimous: a vocal "strongest possible block" camp (OS-level, unbypassable, accountability partner) coexists with a growing "pause / intention" camp that finds hard blocks shaming and ends up disabling them. A cluster of new 2024–2026 tools (ImpulsePause, Speed Bumper, FrictionBox, Pause, Focus AI) markets exactly the soft-friction + goal-reminder pattern, which validates demand but also means the niche is getting crowded. No independent outcome data compares the two camps.

### Cited Findings
- HN "Ask HN: Strongest way to block distracting sites?" thread recommends OS/network-level tools (SelfControl, hosts file) because extensions are easy to disable — [HN](https://news.ycombinator.com/item?id=2122697)
- HN has a built-in friction feature, "noprocrast" (default 20 min access then 180 min lockout) — [HN item](https://news.ycombinator.com/item?id=3438369)
- A delay-insertion Firefox extension trended on HN (2020); Humane Tech community discussion of "inserting latency into your browsing" — [Humane Tech forum](https://community.humanetech.com/t/inserting-latency-into-your-browsing/4683)
- Soft-friction competitors: Speed Bumper (Firefox; full-screen reflection pause with countdown, path-level targeting such as specific subreddits) — [AMO](https://addons.mozilla.org/de/firefox/addon/speed-bumper/); FrictionBox (Chrome; timer/math/typing challenge before load) — [chromeboard](https://chromeboard.com/extension/frictionbox-ikllnemaghihjhkfpbmipffkibmloiab); ImpulsePause (Chrome; claims most blockers are "too harsh, too easy to bypass, and create shame instead of focus") — [Chrome Web Store](https://chromewebstore.google.com/detail/impulsepause-adhd-focus-w/gocaomeiiiklamefgepgncanogddcijo?hl=en)
- Goal-reminder-on-block pattern already marketed: Focus AI shows "a reminder of your goal with a one-click way back"; ADHD Website Blocker pages "remind you why you made this choice" — [AMO Focus AI](https://addons.mozilla.org/addon/focus-ai/); [extensionauditor](https://extensionauditor.com/scan/adhd-website-blocker-ckakpblemkmgkjbklgnkkjnjkcaplifk)
- ADHD framing in vendor content: time-based locks can expire before the user notices (time blindness); vendors argue for cooldowns over easy overrides — [Digital Zen blog](https://www.digitalzen.app/blog/why-most-website-blockers-dont-work-for-adhd/) (vendor)
- Hard-lock vendors favor accountability (friend holds the unlock code) and anti-bypass guides (disable extension, incognito, switch browser are the standard escapes) — [lockinmcp blog](https://www.lockinmcp.com/blog/block-reddit-youtube-mid-task-anti-bypass-guide-2026) (vendor)
- Lyngs et al. 2020 participants asked for "flexible blocking" matching their individual definition of distraction (e.g., block the feed, not the whole site) — [arXiv 2001.04180](https://arxiv.org/abs/2001.04180)

### Inferences
- Unmet need visible across sources: users want something they will not disable in irritation but that still catches the autopilot moment. That is a narrower, testable claim than "soft beats hard": soft friction serves the "autopilot / habit" user; hard blocks serve the "binge despite intent" user. Steer Clear should position for the former and say so.
- ADHD-specific needs (from vendor framing, not research): low setup burden, no shame language, protection against impulsive disabling, and awareness of elapsed time. A 5-minute bypass that expires and re-prompts maps onto time-blindness concerns; the user's own written reason maps onto the anti-shame framing.
- Path-level targeting (a specific subreddit or feed, not the whole domain) recurs as a want in both research (Lyngs) and competitor features (Speed Bumper).

### Gaps
- Could not retrieve verbatim Reddit threads (r/nosurf, r/digitalminimalism, r/productivity, r/ADHD) via search; no counted poll of hard vs soft preference was found.
- No peer-reviewed study on blocker preferences or outcomes specific to adults with ADHD was found.
- No Product Hunt comment corpus was retrieved.

## Q3. Research evidence: one sec, friction, implementation intentions, self-nudging, HabitLab, goal reminders, habituation

### Takeaway
The evidence supports the core of the bet with important caveats. Short, visible friction reduces opening attempts (one sec: -57% openings over 6 weeks; 36% of attempts abandoned), harder interventions are more effective but drive uninstalls (HabitLab), and users drift toward easier settings over time. Two real risks: (1) habituation — attention to repeated interstitials drops sharply after the second exposure unless the display varies; (2) rebound — benefits fade quickly when users pause the tool. Goal reminders specifically work but are perceived as annoying.

### Cited Findings
**one sec (peer-reviewed)**
- Grüning, D. J., Riedel, F., & Lorenz-Spreen, P. (2023). "Directing smartphone use through the self-nudge app one sec." PNAS, 120(8). doi:10.1073/pnas.2213114120 — [PNAS](https://www.pnas.org/doi/10.1073/pnas.2213114120)
- Over six weeks, target-app openings fell 57%; in 36% of attempted openings, users closed the app after the friction; participants reported less time spent and greater satisfaction. Sample reported as 280 participants in secondary coverage — [search summary of PNAS + TIME coverage](https://time.com/6240981/social-media-addiction-app/); [one sec study page](https://one-sec.app/max-planck-study/)
- Caveat: the 57% refers to openings, not total screen time; marketing pages describe it as "app usage by 57%." Participants are opt-in users of the app who filled in surveys (self-selection) — [one sec study page](https://one-sec.app/max-planck-study/). Frederik Riedel, the app's founder, is a co-author (conflict of interest worth noting).

**one sec longitudinal (peer-reviewed)**
- Haliburton, L., Grüning, D. J., Riedel, F., Schmidt, A., & Terzimehić, N. (2024). "A Longitudinal In-the-Wild Investigation of Design Frictions to Prevent Smartphone Overuse." CHI '24. doi:10.1145/3613904.3642370. N = 1,039 users over a mean 13.4 weeks; 249 surveyed. Short frictions reduced opening attempts and made openings more intentional over time; users take periodic breaks and "quickly rebound" to overuse when returning from breaks; users overwhelmingly target social media — [LMU PDF](https://www.medien.ifi.lmu.de/pubdb/publications/pub/haliburton2024chi/haliburton2024chi.pdf); [MCML](https://mcml.ai/publications/hgr+24/)

**HabitLab (Stanford, peer-reviewed)**
- Kovacs, G., Wu, Z., & Bernstein, M. S. (2018). "Rotating Online Behavior Change Interventions Increases Effectiveness But Also Increases Attrition." CSCW 2018 (note: CSCW, not CHI). Three in-the-wild field experiments: rotating interventions reduced time on site but increased uninstalls; a just-in-time notice explaining rotation cut attrition roughly in half — [Stanford HCI](https://hci.stanford.edu/publications/paper.php?id=351)
- Kovacs, G., Wu, Z., & Bernstein, M. S. (2021). "Not Now, Ask Later: Users Weaken Their Behavior Change Regimen Over Time, But Expect To Re-Strengthen It Imminently." CHI '21. Logs from 8,000+ HabitLab users: users start with demanding interventions and shift to easier ones, while repeatedly choosing "ask me again later" rather than saving the easier preference; mismatch between preferred and shown difficulty is a commonly reported uninstall reason — [arXiv 2101.11743](https://arxiv.org/abs/2101.11743)
- Kovacs (Stanford Daily, 2019): "Blocking a page would be highly effective as an intervention, but this also leads to high attrition." — [Stanford Daily](https://stanforddaily.com/2019/03/13/habitlab-browser-extension-aims-to-help-users-regain-control-of-their-online-browsing-behavior/)

**Goal reminders (peer-reviewed)**
- Lyngs, U., et al. (2020). "'I Just Want to Hack Myself to Not Get Distracted': Evaluating Design Interventions for Self-Control on Facebook." CHI '20. doi:10.1145/3313831.3376672. N = 58 students, 6 weeks logged. Both goal reminders and newsfeed removal helped participants stay on task; goal reminders were "often annoying"; newsfeed removal caused fear of missing information. Abstract gives no effect sizes — [arXiv 2001.04180](https://arxiv.org/abs/2001.04180)

**Implementation intentions**
- Gollwitzer, P. M., & Sheeran, P. (2006). "Implementation intentions and goal achievement: A meta-analysis of effects and processes." Advances in Experimental Social Psychology, 38, 69–119. 94 independent tests; medium-to-large effect on goal attainment, d = 0.65 — [KOPS Konstanz repository](https://kops.uni-konstanz.de/entities/publication/2e749bfb-8533-437c-8203-7e788c910c5f); effect size per [secondary summary](https://goalsandprogress.com/implementation-intentions-research/)
- A 2024 follow-up meta-analysis (Sheeran, Listrom, Gollwitzer) reportedly covers 642 tests — [secondary source only](https://goalsandprogress.com/implementation-intentions-research/)

**Self-nudging**
- Reijula, S., & Hertwig, R. (2022). "Self-nudging and the citizen choice architect." Behavioural Public Policy, 6(1), 119–149. doi:10.1017/bpp.2020.5. Argues people can apply nudges to their own environments (including self-commitment), avoiding paternalism concerns; conceptual paper, no effect sizes — [Cambridge](https://cambridge.org/core/journals/behavioural-public-policy/article/selfnudging-and-the-citizen-choice-architect/F526628F7F3C7B436FA2BCBFC1FC3C76); [RePEc](https://ideas.repec.org/a/cup/bpubpo/v6y2022i1p119-149_7.html)

**Habituation to repeated interstitials**
- Vance, A., Jenkins, J. L., Anderson, B. B., Bjornn, D. K., & Kirwan, C. B. (2018). "Tuning Out Security Warnings: A Longitudinal Examination of Habituation Through fMRI, Eye Tracking, and Field Experiments." MIS Quarterly, 42(2). doi:10.25300/MISQ/2018/14124. Attention dropped sharply after the second exposure and kept declining across a workweek, partially recovering between days; "polymorphic" warnings (changing appearance) substantially reduced habituation; in a 3-week field study, adherence stayed high with polymorphic warnings — [MISQ](https://misq.org/tuning-out-security-warnings-a-longitudinal-examination-of-habituation-through-fmri-eye-tracking-and-field-experiments.html); [BYU](https://scholarsarchive.byu.edu/facpub/1955)

### Inferences
- **For the bet:** (1) one sec shows that a short, visible, bypassable pause measurably reduces opening attempts without a hard block; (2) HabitLab directly supports "friction gates drive uninstalls" (blocking = effective but high attrition; difficulty mismatch = uninstall reason); (3) showing the user's own written reason is a goal reminder (Lyngs: effective) and a light commitment device; (4) the one-click alternative destination resembles the "then" half of an if-then implementation intention (d ≈ 0.65 in general settings, not tested for websites).
- **Against / risks:** (1) Habituation: a static interstitial with the same text will likely be clicked through by reflex within days; varying the display (rotating phrasing, layout, or which reason is shown) is the evidence-backed mitigation, but HabitLab shows rotation raises attrition unless explained. (2) Goal reminders are perceived as annoying (Lyngs), so annoyance-driven uninstalls remain a risk even for soft friction. (3) Users weaken regimens over time (Kovacs 2021); a frictionless 5-minute bypass may become the default path. (4) Rebound after breaks (Haliburton 2024) means the product should make re-enabling easy and visible.
- The "silent redirect gets retyped around" assumption has no direct study; the closest support is the habituation literature and the HN anecdotes about disabling blockers. Treat it as an untested hypothesis.
- Effect sizes are from phone apps (one sec) and Facebook (Lyngs); transfer to a desktop browser extension is plausible but unproven.

### Gaps
- Could not access the PNAS full text (403) to confirm N, the presence of any control/randomized arm, and whether the effect changed week-to-week; the "280 participants" figure is from secondary coverage.
- No quantified effect sizes retrieved for HabitLab rotation (time-on-site deltas, attrition rates) or Lyngs 2020; abstracts only.
- No study found that directly compares a soft interstitial with a hard block on uninstall rate or long-term usage in the same population.
- No study found on silent redirect vs visible interstitial.
- 2024 implementation-intentions meta-analysis (642 tests) not verified against the primary paper.

## Q4. Which user segments are best served by a soft-friction tool, and how big are those communities?

### Takeaway
The best-evidenced segment is people trying to cut habitual social-media / news checking (one sec users overwhelmingly target social media). Students and knowledge workers are the populations studied (Lyngs used students). ADHD is the largest reachable community (r/ADHD ~2M+) and vendors heavily market to it, but there is no peer-reviewed evidence specific to ADHD. Digital-minimalism communities are smaller (hundreds of thousands) but highly aligned and fast-growing.

### Cited Findings
- r/ADHD: ~2.0M–2.3M members (third-party snapshots) — [GummySearch r/ADHD](https://gummysearch.com/r/ADHD)
- r/nosurf: ~251K–308K members across snapshots; Hive Index ~308K — [GummySearch r/nosurf](https://gummysearch.com/r/nosurf); [Hive Index](https://thehiveindex.com/communities/r-nosurf/)
- r/digitalminimalism: snapshots from 104K to 275K; one snapshot shows +69K members (+193.5%) in a year — [GummySearch r/digitalminimalism](https://gummysearch.com/r/digitalminimalism)
- GummySearch closed 30 Nov 2025, so all counts are frozen snapshots from different dates — [GummySearch r/nosurf](https://gummysearch.com/r/nosurf)
- one sec users "overwhelmingly" target social media apps — [Haliburton et al. CHI '24](https://www.medien.ifi.lmu.de/pubdb/publications/pub/haliburton2024chi/haliburton2024chi.pdf)
- StayFocusd alone has ~700K Chrome downloads, indicating the size of the Chrome blocker market at the incumbent level — [tooltivity](https://tooltivity.com/extensions/stayfocusd-website-blocker-and-focus-timer)

### Inferences
- Primary segment for launch messaging: knowledge workers and students who check social/news sites on autopilot and have tried and abandoned a strict blocker (either uninstalled for strictness or disabled for irritation).
- ADHD is a large, reachable secondary segment; messaging should avoid clinical claims (no ADHD-specific evidence) and instead speak to "no shame, no lockout, your own words."
- Less suited: users who want to stop deliberate bingeing despite intent; evidence (HN, Cold Turkey reviews) suggests they seek hard locks. Saying so openly may build credibility.

### Gaps
- No current (2026) verified member counts for r/productivity, r/nosurf, r/digitalminimalism, or r/ADHD directly from Reddit.
- No data on what share of those communities use Chrome desktop vs mobile, which bounds Steer Clear's addressable audience.
- No segment-level outcome data (does soft friction work better for students vs workers vs ADHD).
