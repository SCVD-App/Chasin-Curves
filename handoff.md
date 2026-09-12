# Chasin' Curves — Project Handoff

**Session:** 17 (points ledger rebuild, road/logbook features, rinlojM) + Session 18 (Stripe Pro membership) + Session 18 reconciliation (9 Sept, after Scott checked Cloudflare directly) + Worker deploy confirmed (11 Sept) + frontend push + Stripe live-mode checkout confirmed (11 Sept)
**Date:** Session 17 undated in prior notes (email log only, never previously committed here) — capturing it now for the record. Session 18: 9 Sept 2026. Worker deploy, frontend push, Stripe go-live: all 11 Sept 2026.
**Status — updated 11 Sept 2026 (evening):** Chasin' Curves Pro membership is genuinely live in production, end to end. Worker deployed (version `13eee811`, confirmed via Deployments tab). Frontend (app.js/index.html) committed and pushed via GitHub Desktop, GitHub Pages rebuilt. Stripe webhook endpoint added (`/webhook`, subscribed to `checkout.session.completed`) and all four Cloudflare secrets set (`CURVES_ADMIN_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) — confirmed present in the dashboard (names only; Cloudflare never shows values back, so the real proof is the test below).
Scott then ran the checkout test **in Stripe live mode, with his own real card, on purpose** — his stated method for validating a real integration is to actually pay and cross-check the charge against his card, not trust a test-mode green tick. Result: full loop worked — checkout completed via Stripe Link, webhook fired, `grantPro()` ran, and the app immediately showed "You're Pro! Trip Postcards, Logbook and TGM are all unlocked" with Logbook/Postcards genuinely accessible afterward. Since this ran on live keys already, Step 6 (flip to live keys) is done as a side effect — there was never a separate test-mode pass.
**Not yet explicitly re-verified this session:** points-earning (server-side award landing correctly) and Pit Pass activation (server-side requirement re-check) — the checkout test only exercised the Stripe path. Worth a real pass before calling the whole backend proven, even though nothing in tonight's testing suggests either is broken.

Older sessions (12–16, 23–27 Aug 2026) are archived at `archive/handoff_session16.md`.

## Start here (picking this up in a new chat)

**Everything is deployed and Stripe is confirmed live (11 Sept).** Worker `13eee811` active, frontend pushed and GitHub Pages rebuilt, Stripe webhook + all four Cloudflare secrets set, and a real live-mode checkout (Scott's own card) completed successfully — Pro granted, features unlocked. What's left is a straightforward verification pass, not a build or deploy step: confirm points-earning and Pit Pass activation both still work correctly now that they're live on the same deploy as everything else (nothing suggests they're broken, they just haven't been individually exercised this session the way checkout was). After that, this integration can be considered fully proven.

**Frontend/backend split, confirmed via GitHub the same night:** checked github.com/SCVD-App/Chasin-Curves directly — worker.js's last commit is "Points system upgrade", 5 days ago; app.js's last commit is "Update app.js", also 5 days ago; GitHub Pages redeployed successfully off that same commit 5 days ago (green check in the Deployments panel). So **GitHub Pages is currently serving Session 17's points/Pit Pass frontend code already** — ahead of the Cloudflare Worker, not behind it as originally worried. That means right now, live, the frontend already shows Pit Pass and points UI talking to a backend (Cloudflare, still on Session 16) that has no `awardPoints`, no `MEMBER_PROTECTED_FIELDS` beyond none at all, and no dedicated Pit Pass endpoint — so Pit Pass activation on the live site today still works (Session 16's generic `PUT /member` doesn't block the field) but via the old unvalidated client-PUT path, i.e. the exploit described above is open on production right now, not just a future risk. Low stakes (worst case: free 7-day Pit Pass access, no money involved) but worth knowing it's real, not hypothetical, until tomorrow's Worker deploy closes it.

Also worth noting for tomorrow: that 5-day-old "Points system upgrade" git commit is presumably what Session 17 pushed — but Pit Pass, the Pit Pass exploit fix, and all of Session 18 (Stripe/redemption) are NOT in GitHub's history at all yet. Tonight's local-folder sync means the working directory now has all of that as uncommitted changes on top of the 5-day-old commit — expect a real diff in `git status` tomorrow, and remember to `git add`/`commit`/`push` (not just `wrangler deploy`) so GitHub Pages actually picks up the frontend changes too.

## Session 17 — points ledger, road features, rinlojM (backfilled into this doc)

This session's own summary was only ever sent as an email log, never committed here — folding the key facts in now so this file stays the single source of truth.

- **Points system rebuilt server-side.** It was entirely client-side and unvalidated before this (a client could PUT its own points, no check at all). Real values: add_road 100, write_review 30, rate_road 10, plan_trip 20, upload_photo 15, add_vehicle 50, report_alert 25, daily_login 5, log_trip 5. `awardPoints()` in worker.js is now the only writer; `PUT /member` strips any client-supplied `points` field.
- 5 of 9 actions migrated to real server-side awards: add_vehicle, upload_photo, log_trip, add_road, plan_trip. Two vehicle/photo-upload `fetch()` calls had no auth header at all — fixed to use `authedFetch`. `log_trip` was awarding at the wrong moment (completion instead of trip start) — corrected.
- `write_review`/`report_alert`: confirmed as a live, no-cost points exploit (buttons awarded points without calling any real API). Disabled honestly in the UI ("coming soon") rather than left live. `rate_road` and `daily_login` have no feature/endpoint built yet — not awarded.
- TGM guide-generation (100 + 40×spannerRating, one-time) and positive-debrief (20 + 10×spannerRating, repeatable) formulas locked in and live in worker.js, not wired to any endpoint yet since TGM itself is still held back pre-launch.
- **Add a Road**: manual form gets a localStorage draft autosave + resume banner (OS popup/reload no longer loses in-progress work). New "Add as Road" flow lets a completed trip's GPS trail be trimmed to a road via draggable start/end pins snapped to real recorded points only (can't bypass the home-location privacy fence). A from-scratch "drop pins on an empty map" tool was scoped but not built — needs multiple waypoints, not just start/end, or a routing engine draws the fastest path instead of the actual road.
- **rinlojM** (cross-portfolio admin comp tool) built as its own Cloudflare Worker — see `rinlojm-handoff.md` if this repo has one; not detailed further here since it's not Chasin' Curves-specific.
- Mic Drop and Cult Connections also got bug fixes this session (lifetime token generation, missing email delivery) — not repeated here, see their own handoff docs.

## Session 18 — Stripe Pro membership (this session)

### Pricing — locked in with Scott, deliberately no lifetime tier

Chasin' Curves is meant to be a longer-term-subscription-shaped app given its opt-in process, not a one-and-done purchase — so unlike Mic Drop/Cult Connections, the public checkout has **no lifetime option**.

| Plan | Price | Days |
|---|---|---|
| 1 Month | $2.99 | 30 |
| 6 Months | $11.99 | 180 |
| 12 Months | $19.99 | 365 |

12 months is priced to visibly undercut buying two 6-month blocks ($19.99 vs $23.98) on purpose — the ladder is built to pull people toward the year, not to protect the 6-month tier's per-period rate. Scott confirmed this is intentional given he expects a lot of users to buy a year at a time.

A **lifetime option still exists**, but only as an admin comp via `/admin/grant-pro` (`planId: "lifetime"`, `ADMIN_PLANS` in worker.js) — for Scott himself or beta testers, never purchasable.

### What's Pro vs Free

- **Pro-gated:** Trip Postcards, Logbook (Postcards are generated from logged trips, so gating Logbook covers Postcards too — no separate endpoint needed). TGM has no live endpoint yet, so nothing to gate there — it'll need the same treatment once it ships.
- **Free, deliberately not gated:** Add Roads. This was briefly Pro-gated earlier in this session, then corrected — Scott flagged that he'd never actually confirmed the original question of whether Add Roads should be gated, and the real intent behind the Session 17 points rebuild was the opposite: add_road pays the most points of any action (100) specifically so free users have a real path toward earning free Pro months.
- **Free but capped:** Garage — 1 vehicle. Vehicles already saved past the cap (e.g. a lapsed Pro member) are never removed, they just can't add a new one while free.
- **Pit Pass** (existing 7-day free-Pro-for-completing-your-profile mechanic) now counts as genuine Pro access via `isMemberPro()`, not just a UI badge.

### Points → Pro redemption — built this session, once Scott confirmed the number

`POST /member/:id/redeem-points`: **1,000 points = 1 free month (30 days) of Pro**, Scott's working number based on "a vehicle + ~5 photos + 3-4 roads ≈ 500 points" as a healthy average contribution. **Deliberately not publicised** — no promo in `UpgradeModal`, no mention in checkout copy, just a plain line in Profile → Points tab ("X points banked" / "Redeem for N free months" once eligible) — until real accrual rates validate the number.

Spends from a **new `member.proPoints` balance, not the existing `member.points`** that drives the tier badge (Explorer, etc. — `getTier()` in app.js). `awardPoints()` now credits both fields identically on every award, but only `redeem-points` ever decrements `proPoints`. Two reasons for the split rather than just spending `points` directly:
1. Spending would visibly demote someone's tier badge (e.g. Road Warrior → Explorer) purely from cashing in Pro time — a real UX gut-punch for what's meant to be a reward.
2. **`points` didn't match the 90-day expiry the Points tab UI claimed** ("Points expire after 90 days") — `awardPoints()` has always just accumulated forever, no decay logic anywhere. Scott confirmed `points` is meant to be a permanent lifetime tally (that was the original intent, the "90 days" copy was just stale/wrong) — so the copy has been fixed to say "Your lifetime tally — points never expire," not the code. `proPoints` still starts at 0 for everyone as of this session regardless of existing `points` — that's unrelated to the expiry question now that it's resolved, it's just that redemption is a brand new feature with nothing to retroactively cash in.

Resolved: `points` is a permanent lifetime tally by design — this directly supports the "Power Users" model Scott described (a submission that stays good keeps earning its author points indefinitely as long as the community engages with it, not just a one-time award at submission time). See the new open item below on quality/likes-driven ongoing points, which is the next piece of that vision and isn't built yet.

One call made without asking: redeeming converts ALL currently-eligible whole 1,000-point blocks in a single click (e.g. 2,400 `proPoints` → 2 months redeemed, 400 left over), rather than one month per click. Simpler than tracking a partial-redemption state, and almost certainly what someone holding multiple blocks wants anyway — flag if you'd rather it be metered.

### Architecture — account-based, not token-based

Unlike Mic Drop's redeemable-token model, Pro lives directly on the member record (`proLifetime` / `proExpiresAt` / `proTier` / `proPurchasedAt` / `proAppliedSessions`) because Chasin' Curves already has authenticated identity via the email+code session. No "lost token" failure mode to design around. A day-based plan **stacks** onto any still-active expiry rather than resetting it — buying more time before the old block runs out never wastes what's left.

New/changed endpoints in worker.js:
- `POST /create-checkout` — authed, builds a Stripe Checkout session (inline `price_data`, matching the SCVD convention), redirects to Stripe-hosted checkout. successUrl/cancelUrl are passed by the client (built from `window.location`), not hardcoded, so this doesn't depend on knowing the exact GitHub Pages URL.
- `POST /webhook` — Stripe webhook, `checkout.session.completed` → `grantPro()`.
- `GET /checkout-status?session_id=` — **self-heal path**. Covers the case the webhook hasn't landed yet by the time the user is redirected back — this is the exact failure mode that bit Cult Connections' original checkout (token only ever deliverable via the same browser tab/device). app.js calls this automatically on return from Checkout using the `session_id` Stripe appends to `success_url`. Idempotent — safe alongside the webhook, whichever lands first wins.
- `POST /admin/grant-pro` — comp access, same shared-secret pattern as Mic Drop/Cult Connections' admin endpoints. Secret is `CURVES_ADMIN_KEY`.
- `POST /member/:id/activate-pit-pass` — see exploit fix below.

### A real exploit closed while wiring this up

`pitPassActivated` now grants genuine Pro access, but it was previously just a raw field a client could set via `PUT /member/:id` with **zero server validation** — the six-requirement check (`PIT_PASS_REQUIREMENTS`) only ever ran client-side to decide whether to *show* the "Activate" button. Anyone could have called the API directly and set it to any date, for free, repeatedly. Same class of bug as the points exploit fixed in Session 17 — it just wasn't a monetization risk until this session made the field worth something.

Fixed the same way: `pitPassActivated` (plus all the new `pro*` fields) moved into `MEMBER_PROTECTED_FIELDS` so `PUT /member/:id` can no longer set any of them, and a new `POST /member/:id/activate-pit-pass` endpoint re-checks all six requirements server-side (`checkPitPassServer()`, mirroring app.js's `PIT_PASS_REQUIREMENTS`) before writing the timestamp. app.js's `PitPassBanner` dismiss handler now calls this endpoint instead of the old raw `updateCurrentUser()` PUT.

### A second bug caught while touching AddRoadModal

`AddRoadModal`'s `onAdd` handler used to fall back to adding the road to **local-only state** on any failure — including a non-2xx API response, since `authedFetch` only throws on 401/403 and resolves normally with an `{error}` body for everything else (including the new 402 "Pro feature" response). That meant a free user hitting the new Add Roads paywall — or anyone hitting a real server error — would see the road appear to save successfully in their session, then silently vanish on next refresh, never actually persisted. Fixed to check `res.error` explicitly and show it rather than faking success. The road-draft autosave already covers the form, so nothing is lost by not closing the modal on failure.

### Session 18 reconciliation — same night, after discovering the deploy gap

Scott asked to get the live Chasin-Curves repo folder synced with this mirror. Found the local repo folder (`C:\...\GitHub\Chasin-Curves\`) was itself ahead of what's actually deployed on Cloudflare but behind this mirror — three different states, not two. Resolved by having Scott check Cloudflare's Workers & Pages → chasin-curves → **Deployments** tab directly (Quick Edit can show stale/draft content, so this was the right place to check): active deployment `eb656313`, ~13 days old, manually deployed via Dashboard — matches the pre-Session-17 v3.1/Session 16 code exactly (no `awardPoints`, no `MEMBER_PROTECTED_FIELDS`, no Pit Pass).

Confirmed via diff that this mirror is a clean superset of the local repo folder's worker.js/app.js — every local-only line was something Session 18's fixes intentionally replaced (the Pit Pass exploit fix, the stale "90 days" copy, AddRoadModal's silent-failure bug), nothing unique would be lost. Copied this mirror's worker.js and app.js into the local repo folder, then independently re-verified with a fresh pull and MD5 checksum comparison (not just trusting the write confirmation) — both files landed byte-for-byte identical to the mirror. index.html was already identical between the two, no changes needed there.

**Nothing was deployed.** No `wrangler deploy`, no git push, no Cloudflare dashboard edit, no Stripe/secrets setup. The local repo folder is now code-correct and ready — the actual deploy is Step 1 of the checklist below, deliberately left for the next session.

### Frontend (app.js)

- `PRO_PLANS`, `isMemberPro()`, `proStatusLabel()` — mirror worker.js exactly, keep in sync if pricing changes.
- `UpgradeModal` — pricing/checkout UI, redirects to Stripe-hosted checkout (`window.location.href = session.url`), no Stripe.js needed.
- `ProUpsell` — full-screen paywall swapped in for the Logbook tab when not Pro.
- `PaymentNotice` — banner shown on return from Checkout (success/cancelled/error), same visual language as the existing `TripSavedNotice`.
- Membership card added to Profile → Profile tab, above "About Me": shows current status (`proStatusLabel`) and an Upgrade/Add More Time button (hidden entirely for comped lifetime members).
- Garage's "+ Add Vehicle" button checks the cap client-side (shows 🔒 and opens `UpgradeModal` instead of the add form) as a friendlier front door to the same check worker.js enforces server-side.
- "+ Add" road button and the Logbook tab both route through the same `UpgradeModal` when not Pro.

### Still needed before this can go live — Scott, this is on you

**Corrected 9 Sept, updated 11 Sept 2026 (evening):** every deploy/setup step is now done. What's left is verification, not build work.

1. ~~**Deploy the Worker.**~~ **Done, 11 Sept 2026.** Version `13eee811` active with 100% traffic, confirmed via the Deployments tab. Points ledger, Pit Pass (with its exploit fix), and the Stripe/redemption endpoints are genuinely live.
2. ~~**Push the frontend.**~~ **Done, 11 Sept 2026.** Committed and pushed app.js/index.html via GitHub Desktop; GitHub Pages rebuilt off the new commit, matching the live Worker.
3. ~~**Stripe dashboard webhook.**~~ **Done, 11 Sept 2026.** Endpoint added at `https://chasin-curves.emblen-scott.workers.dev/webhook`, subscribed to `checkout.session.completed`, signing secret copied into Cloudflare.
4. ~~**Cloudflare secrets.**~~ **Done, 11 Sept 2026.** All four present in Settings → Variables: `CURVES_ADMIN_KEY`, `RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
5. ~~**Test checkout.**~~ **Done, 11 Sept 2026 — live mode, real card.** Scott's deliberate approach: test with his own money and cross-check the actual charge on his card, rather than trust a test-mode result. 1 Month plan, paid via Stripe Link, checkout completed, webhook fired, Pro granted, Logbook/Postcards unlocked in the app immediately after. Since this used live keys, there's no separate "flip to live" step left — it's already live.
   - **Still to verify:** points-earning (e.g. add a vehicle/road/photo, confirm the award lands server-side) and Pit Pass activation (confirm it's server-validated via `activate-pit-pass`, not a client PUT). Neither was exercised by the checkout test.
   - **Worth deciding:** whether to refund any of the live test charges via the Stripe dashboard, or just leave them — it's Scott's own account either way, no customer impact.
6. ~~Flip to live keys.~~ **N/A — already live**, see Step 5.

### Not done / explicitly out of scope this session

- TGM gating — no live TGM endpoint exists yet, nothing to gate. Whoever builds TGM's routes needs to add the same `isMemberPro()` check worker.js uses elsewhere.
- No Stripe customer billing portal / "manage subscription" — these are one-time prepaid blocks, not recurring subscriptions, so there's nothing to manage beyond buying more time (which "Add More Time" on the Membership card already covers).
- No refund/cancellation flow — matches the rest of the portfolio's "no auto-renewal, no surprises" framing; handle refunds manually via Stripe dashboard if needed.
- **Quality/likes-driven ongoing points — the "Power Users" vision, described by Scott but not built.** The idea: the community "manages quality for us" by liking/engaging with submissions (roads especially), and a submission that stays well-regarded keeps paying its author points for as long as people engage with it — not just a one-time award at submission. Scott's framing: this is what could produce 10, even 100+ "Power Users" who make quality submissions, get patronised by the rest of the community, and keep earning for a long time — the core loyalty/retention mechanic for the app. This now makes sense as "lifetime tally" points was confirmed as the intended design (see above), not a bug — an ongoing-earn model needs points that don't expire. Nothing built yet: no "like" button exists anywhere in the app today (roads have the existing 5-category star rating — driveability/accessibility/views/surface/thrill — but no like/upvote separate from that, and no mechanism connects any rating back to points for the original submitter). Real design questions before this can be built: does a like pay out every time, forever, uncapped (true "trail income") or is there some cap/decay per liker or per time period to bound it; is it a new dedicated like button or does it key off the existing star ratings; does it apply to roads only or also reviews/trip postcards/TGM guides once those exist; what's the per-like point value (for scale: add_road pays 100 once — a recurring per-like award should probably be small, more like the 5-30 point range of the smaller existing actions); and how to prevent obvious gaming (friends liking each other's own roads back and forth, sockpuppet accounts) given a real person's ongoing income is now at stake. Worth its own scoping session rather than guessing at these.

## NEXT SESSION

- **Verify points-earning and Pit Pass activation** on the live site — the one piece of the Session 17/18 rebuild not yet individually exercised (Stripe checkout was confirmed live-mode, end to end, 11 Sept).
- Decide whether to refund any of the live-mode test charges via the Stripe dashboard, or leave them.
- Decide whether/when to publicise points → Pro redemption once the 1,000-point number feels validated against real accrual — it's code-complete and now genuinely live (Points tab only, no promo anywhere else yet).
- Now that it's live: consider whether TGM's eventual launch needs its own Pro gate wired in using the same `isMemberPro()` pattern.
- Scope the quality/likes-driven ongoing-points ("Power Users") vision described above — it's a validated direction, not yet a build. Needs a real design pass on: payout model (forever/uncapped "trail income" vs capped or decaying), new like button vs keying off the existing 5-category star ratings, which content types qualify (roads only at first, or reviews/postcards/TGM later too), per-like point value, and anti-gaming safeguards. Don't start building off assumptions — this session got Add Roads gating and pricing wrong by guessing instead of asking, so nail down specifics with Scott first.
