// Chasin' Curves — Worker v3.11
// Session 12: Email + 6-digit code auth replaces open username login.
//             member/garage routes now require a valid session bound to the
//             requester's own email — closes the "type anyone's username,
//             become them" gap from v2.1.
// Session 13: Community roads — public member lookup + follow/unfollow.
//             GET /members/:id/public exposes only a minimal public slice
//             (never email/bio/garage) so road attribution can link to a
//             profile without leaking private data. Any authed member can
//             view any other member's public slice — this is deliberate,
//             it's what makes "who added this road" clickable.
//             Follows stored as a single array blob (same pattern as
//             roads/trips), one row per {followerId, followedId} pair.
// Session 14: Logbook (Murphy Report & Logbook compliance feature, phase 1
//             of the master build plan — general-use day-cap logging only,
//             club events land later once a pilot partner club exists).
//             GET/POST /logbook/:id — Use Entry records, same session-owner
//             -only pattern as /garage. `timestamp` is always server-set to
//             Date.now() and a client-supplied value is ignored outright —
//             this is what makes VIC Reg 157(6)'s forward-dating ban (and
//             backdating generally) structurally impossible rather than a
//             UI convention. PUT /logbook/:id/:entryId is the one exception
//             to "entries are immutable": it lets a later return-odometer
//             reading be attached, nothing else about a filed entry can be
//             changed after the fact.
// Session 15: GPS Snail Trail — PUT /logbook/:id/:entryId also accepts an
//             optional `trail` array (opt-in per trip, written once when
//             the trip is stopped, not streamed live). No new endpoint,
//             same immutability rule, just one more optional field.
// Session 17: Server-side points ledger. The whole app went login-gated
//             well before this session, which made the old "roads/trips/
//             reviews/alerts are public, no auth" comment stale — every
//             caller already has a session token, so auth here costs zero
//             extra friction. Added getAuthedEmail() + real awardPoints()
//             calls to /roads, /trips, /reviews, /alerts, /garage/:id,
//             /garage/:id/photo, and /logbook/:id/:entryId (on first
//             odometerEnd completion only — guards against a double-award
//             if that endpoint is ever called twice for one entry). Fixed
//             PUT /member/:id to strip a client-supplied `points` field —
//             Session 12 already stopped you setting someone ELSE'S points,
//             this stops you setting your OWN. rate_road and daily_login
//             are NOT wired: no rating-submission feature or login-tracking
//             endpoint exists yet to hook into.
// Session 18: Stripe Pro membership. Pro is granted directly on the member
//             record (proLifetime / proExpiresAt / proTier) rather than a
//             redeemable token — the app already has authenticated
//             identity, so there's no "lost token" failure mode to design
//             around. Added /create-checkout, /webhook, /checkout-status
//             (self-heal if the webhook hasn't landed by the time the user
//             is redirected back — the exact gap found in Cult
//             Connections' original checkout), and /admin/grant-pro. Pro
//             gates added to /logbook/:id and /logbook/:id/:entryId
//             (Logbook — this covers Trip Postcards too, since those are
//             generated from logged trips; TGM has no live endpoint yet so
//             there's nothing to gate there), and a new-vehicle cap on
//             PUT /garage/:id (free = 1 vehicle; vehicles already over the
//             cap are never removed, just no new ones while free).
//             POST /roads was briefly Pro-gated too, then corrected mid-
//             session: Scott confirmed Add Roads is meant to stay free —
//             it's the whole point of add_road paying 100 points, which is
//             meant to be a path to free Pro months (that redemption
//             mechanic isn't built yet — see handoff.md). Also closed a
//             real self-grant gap
//             found while wiring this up: pitPassActivated now counts as
//             Pro-equivalent (the free 7-day trial), but PUT /member/:id
//             let a client set that field directly with zero server
//             check — same class of bug as the points exploit fixed last
//             session, it just wasn't a monetization risk until this
//             session made pitPassActivated worth something. Fixed the
//             same way: moved to a dedicated
//             POST /member/:id/activate-pit-pass endpoint that re-checks
//             all 6 PIT_PASS_REQUIREMENTS server-side before setting it,
//             and added it plus the new pro fields to
//             MEMBER_PROTECTED_FIELDS so PUT /member/:id can no longer
//             set any of them directly. Also added
//             POST /member/:id/redeem-points once Scott confirmed the
//             original intent behind the points system: 1000 proPoints
//             (a new balance, separate from the tier-badge `points` field
//             — see awardPoints()) redeems 1 free month of Pro. Not
//             publicised in the UI yet — just a plain line in the Points
//             tab — until real accrual rates validate the number.
// Session 19: Planned Runs backend — foundation for a shareable "invite"
//             feature (Facebook/Instagram growth play). Discovered mid-
//             session that /trips + TripPlanner already WAS this feature
//             ("Plan a Run" / "Join this Run" in the UI) — extended rather
//             than duplicated. Two real gaps found and fixed while adding
//             this: (1) app.js's joinTrip() only updated local React state,
//             never called the server — RSVPs were never actually
//             persisted, lost on every reload; (2) the existing PUT
//             /trips/:id pattern is a full-object merge, which is a race
//             condition for concurrent RSVPs if a client ever sent a
//             locally-recomputed attendees array through it. Added a
//             dedicated POST /trips/:id/rsvp that does an atomic
//             read-modify-write of a single attendee's status server-side
//             instead. New: `status` field on trips (open/unconfirmed/
//             cancelled/closed, defaults to open), POST /trips/:id/cancel
//             (host-only, requires a `reason` from CANCEL_REASONS), and
//             GET /trips/:id/public (no-auth sanitized single-trip view —
//             foundation for the public share-link page, not built yet).
//             Nudge/auto-cancel cron, the share page itself, and RSVP/
//             cancel UI are next session — this session is backend only.
//             LIVE BUG FOUND on first real test with a second account
//             (Lorna): every trip-ID route match (PUT /trips/:id, the new
//             rsvp/cancel/public endpoints) compared `t.id === id` where
//             `t.id` is a number (client creates trips with `id: Date.now()`
//             in app.js) but `id` from the URL regex capture is always a
//             string — silent 404 on every one of these routes. This bug
//             pre-dates this session; it was never caught before because
//             the old joinTrip() never actually called the server. Fixed
//             by coercing to `String(t.id) === id` at all four trip-ID
//             comparison sites.
// Session 20: Public run invite page — GET /run/:id, server-rendered HTML
//             (not the React app) with Open Graph tags, since Facebook/
//             Instagram's link-preview crawlers generally don't execute
//             JS. Scott's call on the hero image: rather than build new
//             cover-photo upload infrastructure, reuse the organiser's
//             already-selected vehicle (trip.vehicleId, chosen at planning
//             time) and pull its existing Garage heroPhotoUrl — no new
//             upload feature needed, and it doubles as a "spot the car at
//             the meeting point" cue for anyone who's never met the host.
//             GET /trips/:id/public (added last session) also now returns
//             vehiclePhotoUrl/vehicleLabel for the same reason. All user-
//             authored text in the HTML page goes through escapeHtml() —
//             this route has no auth wall, so it's genuinely public attack
//             surface for stored XSS if a future field skips that step.
//             Cover-photo upload, the canvas-generated Instagram-postable
//             image, RSVP/cancel UI, the nudge/auto-cancel cron, and
//             reliability tracking are still not built — next session.
// Session 21: Waypoint capture (app.js TripPlanner — geocoded stops, first
//             = meeting point, last = end point) plus a run-page redesign
//             per Scott's call: no separate map block, no pins/route line.
//             Instead the vehicle hero gets a thin (opacity 0.22, screen
//             blend) faded map layered on top, with bold waypoint NAME
//             labels positioned by real Web Mercator projection — ported
//             from app.js's own trip-postcard bbox-aspect-correction code
//             rather than reinvented, since that code exists specifically
//             because of a prior alignment bug (route drifting off the
//             roads under it when the requested image's aspect ratio
//             didn't match the bbox). Requesting the map at the exact same
//             16:10 aspect as the .hero CSS box is what makes the
//             percentage-based label positions land correctly regardless
//             of the visitor's screen width.
// Session 22: /run/:id's CTA now carries run context (id/title/host) as
//             query params into the app URL, so the new magazine splash
//             page (built in app.js) can greet an arriving visitor with
//             the specific run they were invited to rather than a
//             generic pitch. No other worker.js change this session —
//             the splash page itself lives entirely in app.js.
// Session 30: Road paths. A road added from a trip's GPS trail (app.js
//             RoadSegmentPicker) can now carry the driven line of the
//             picked section, so run invites can draw the road's real
//             shape instead of a routing approximation. The line lives
//             under its own KV key (roadpath:{id}) rather than inside the
//             single `roads` array — that array is fetched whole by every
//             client on every load, and a few hundred points per road
//             would bloat it fast. The road record just gets a
//             server-set `hasPath: true`; GET /roads/:id/path (public,
//             same as GET /roads) serves the line. cleanRoadPath()
//             validates and caps whatever the client sends — a bad or
//             oversized path is dropped and the road is still saved, it
//             never blocks adding a road. `path` / `hasPath` are stripped
//             from PUT /roads/:id, so a path can only ever be attached at
//             creation, and a client can't forge hasPath.
// Endpoints: 40 total
//
// Secrets required in Cloudflare dashboard:
//   RESEND_API_KEY        ← re_... from resend.com dashboard (already in use for Mic Drop)
//   STRIPE_SECRET_KEY     ← sk_live_... (or sk_test_... while testing)
//   STRIPE_WEBHOOK_SECRET ← whsec_... — Dashboard → Developers → Webhooks → this
//                           endpoint's signing secret, once you've added the endpoint below
//   CURVES_ADMIN_KEY      ← any long random string you choose — shared secret
//                           for /admin/grant-pro (comp access)
//
// KV binding: CURVES_KV (existing — now also holds authcode:{email} and session:{token})
// R2 binding: MEDIA_BUCKET (existing)
//
// Stripe dashboard setup still needed before this goes live:
//   1. Add a webhook endpoint pointing at this worker's /webhook URL,
//      subscribed to checkout.session.completed. Copy its signing secret
//      into STRIPE_WEBHOOK_SECRET above.
//   2. Add STRIPE_SECRET_KEY and CURVES_ADMIN_KEY as encrypted env vars.
//   3. Test in Stripe test mode first (sk_test_ key, card 4242 4242 4242
//      4242 / any future date / any CVC) before flipping to sk_live_.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

function cleanEmail(raw) {
  return (raw || '').trim().toLowerCase();
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

function genCode() {
  // 6-digit numeric code, zero-padded
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
  return String(n).padStart(6, '0');
}

function genToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Resolve the requester's authenticated email from the Authorization header.
// Returns null if missing/invalid/expired — callers decide how to respond.
async function getAuthedEmail(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  const raw = await env.CURVES_KV.get(`session:${token}`);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session.expiresAt || Date.now() > session.expiresAt) {
      await env.CURVES_KV.delete(`session:${token}`);
      return null;
    }
    return session.email;
  } catch {
    return null;
  }
}

// Safely parse garage KV value — handles raw array, legacy {garage:[]} wrapper,
// and the erroneous {garage:{garage:[]}} double-wrap that could exist in KV
function parseGarage(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.garage)) return parsed.garage;
    // Double-wrap guard
    if (parsed && parsed.garage && Array.isArray(parsed.garage.garage)) return parsed.garage.garage;
    return [];
  } catch { return []; }
}

// ── ROAD PATHS — Session 30 ──────────────────────────────────────────────
// Accepts [[lat, lng], ...] (or [{lat, lng}, ...]), returns a cleaned
// [[lat, lng], ...] at 5dp (~1m) with consecutive duplicates removed and at
// most ROAD_PATH_MAX_POINTS points, or null if it isn't a usable path.
// Timestamps and any other fields are discarded on purpose — only the
// shape of the road is stored.
const ROAD_PATH_MAX_POINTS = 400;   // stored cap per road
const ROAD_PATH_MAX_INPUT = 3000;   // anything bigger than this is refused outright

function cleanRoadPath(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > ROAD_PATH_MAX_INPUT) return null;
  const pts = [];
  for (const p of raw) {
    let lat, lng;
    if (Array.isArray(p)) { lat = p[0]; lng = p[1]; }
    else if (p && typeof p === 'object') { lat = p.lat; lng = p.lng; }
    else return null;
    if (typeof lat !== 'number' || typeof lng !== 'number') return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const la = Math.round(lat * 1e5) / 1e5;
    const ln = Math.round(lng * 1e5) / 1e5;
    const last = pts[pts.length - 1];
    if (last && last[0] === la && last[1] === ln) continue;
    pts.push([la, ln]);
  }
  if (pts.length < 2) return null;
  if (pts.length <= ROAD_PATH_MAX_POINTS) return pts;
  // Too many points: thin evenly, always keeping the first and last.
  const out = [];
  const step = (pts.length - 1) / (ROAD_PATH_MAX_POINTS - 1);
  for (let i = 0; i < ROAD_PATH_MAX_POINTS; i++) out.push(pts[Math.round(i * step)]);
  return out;
}

const R2_PUBLIC_BASE = 'https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev';

// Server-side mirror of app.js's PIT_PASS_REQUIREMENTS — used only to
// validate a pitPassActivated claim before writing it (see
// POST /member/:id/activate-pit-pass below). Keep in sync with app.js if
// the requirements ever change; garage isn't part of the member KV record
// so it's passed in separately (fetched from garage:{id}).
const PIT_PASS_REQUIREMENTS_SERVER = [
  m => !!m.avatar,
  m => (m.bio || '').length > 10,
  m => (m.location || '').length > 2,
  m => Object.keys(m.fastMoney || {}).length >= 1,
  m => (m.garage || []).length >= 1,
  m => (m.garage || []).some(v => (v.photos || []).length > 0),
];
function checkPitPassServer(member, garage) {
  const m = { ...member, garage: garage || [] };
  return PIT_PASS_REQUIREMENTS_SERVER.every(fn => fn(m));
}

// ── POINTS LEDGER — Session 17 ───────────────────────────────────────────
// Server-side points, replacing the fully client-side system that let any
// user set their own points via an unvalidated PUT /member body. Real
// values migrated from app.js's old client-side POINT_ACTIONS config.
// rate_road and daily_login are NOT included below — rate_road has no
// server hook yet (no rating feature built), daily_login has no endpoint
// at all yet. Both stay client-side/unawarded until those exist.
const POINT_ACTIONS = {
  add_vehicle: 50,
  upload_photo: 15,
  log_trip: 5,
  add_road: 100,
  plan_trip: 20,
  write_review: 30,
  report_alert: 25,
};

// Session 18: extended for Pro membership — a client PUT can no longer set
// its own Pro status any more than it could set its own points. pitPassActivated
// moved here too once it started conferring real Pro access; it's now only
// ever set server-side by POST /member/:id/activate-pit-pass, which re-checks
// eligibility itself before writing it.
const MEMBER_PROTECTED_FIELDS = [
  'points', 'proPoints',
  'proLifetime', 'proExpiresAt', 'proTier', 'proPurchasedAt', 'proAppliedSessions',
  'pitPassActivated',
];
function stripProtectedFields(body) {
  const clean = { ...body };
  for (const f of MEMBER_PROTECTED_FIELDS) delete clean[f];
  return clean;
}

// Rolling 24h cap on points earned, across every award reason. Points redeem
// into free Pro months, so without a cap a script could loop POST /roads
// (100 pts each) and mint Pro time. When over the cap the action itself still
// succeeds; only the points are skipped. Raise or lower this number to taste.
const DAILY_POINT_CAP = 300;

async function awardPoints(env, email, amount, reason, meta = {}) {
  if (!email || !amount || amount <= 0) return;
  const ledgerKey = `points_ledger:${email}`;
  const ledger = JSON.parse(await env.CURVES_KV.get(ledgerKey) || '[]');
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const earnedToday = ledger
    .filter(e => e.timestamp > dayAgo && e.amount > 0)
    .reduce((sum, e) => sum + e.amount, 0);
  if (earnedToday + amount > DAILY_POINT_CAP) return; // over the daily cap: no points
  ledger.push({ amount, reason, meta, timestamp: Date.now() });
  await env.CURVES_KV.put(ledgerKey, JSON.stringify(ledger));

  const raw = await env.CURVES_KV.get(`member:${email}`);
  if (!raw) return;
  const member = JSON.parse(raw);
  member.points = (member.points || 0) + amount;
  // Session 18: separate running balance that ONLY POST
  // /member/:id/redeem-points ever spends down. Kept apart from `points`
  // on purpose — `points` drives the tier badge (Explorer, etc. — see
  // getTier() in app.js) and should only ever go up, so redeeming Pro
  // time can never visibly demote someone's badge. Starts at 0 for every
  // member regardless of their existing `points` total: this is a new
  // feature as of Session 18, not a retroactive cash-out of points
  // already earned before redemption existed.
  member.proPoints = (member.proPoints || 0) + amount;
  await env.CURVES_KV.put(`member:${email}`, JSON.stringify(member));
}

// TGM formulas — spanner-scaled, not wired to any live endpoint yet since
// TGM itself is held back pre-launch. Kept here so the module is complete
// and ready the moment /tgm/guides routes get built.
function tgmGenerationReward(spannerRating) { return 100 + 40 * spannerRating; }
function tgmDebriefReward(spannerRating) { return 20 + 10 * spannerRating; }

// ── STRIPE / PRO MEMBERSHIP — Session 18 ─────────────────────────────────
// Pro lives directly on the member record — no redeemable token, no
// "which device/tab has it" failure mode. Pricing mirrors Cult
// Connections' tier shape. Gates: Trip Postcards, Logbook, TGM (not live
// yet), Add Roads are Pro-only; Garage stays free but capped at 1 vehicle.
const PIT_PASS_DAYS_SERVER = 7; // mirrors app.js's PIT_PASS_DAYS — keep in sync
const PIT_PASS_DAYS_MS = PIT_PASS_DAYS_SERVER * 24 * 60 * 60 * 1000;

// Deliberately no lifetime tier on the public checkout — Scott wants
// Chasin' Curves on a longer-term-subscription-shaped model given the
// opt-in process, not a one-and-done. 12 months is priced to visibly
// undercut buying two 6-month blocks ($19.99 vs $23.98) — the point is
// to pull people toward the year, not to protect the 6-month tier's
// per-period rate. ADMIN_PLANS adds a lifetime option back in, but only
// for /admin/grant-pro comps (Scott himself, beta testers) — it was never
// meant to be purchasable.
const PRO_PLANS = {
  month1:  { label: '1 Month',   amount: 299,  days: 30 },
  month6:  { label: '6 Months',  amount: 1199, days: 180 },
  month12: { label: '12 Months', amount: 1999, days: 365 },
};
const ADMIN_PLANS = { ...PRO_PLANS, lifetime: { label: 'Lifetime (comp)', amount: 0, days: null } };

// Points → free Pro redemption. Scott's working number, deliberately not
// publicised anywhere yet (no promo in the checkout modal, no push copy —
// just a plain line in the Points tab) until real accrual rates validate
// it: "a healthy average contribution" (1 vehicle + ~5 photos + 3-4 roads)
// works out to roughly 500 points, so 1000 = a solid target, not a
// trivial one. Spends from member.proPoints, never member.points — see
// awardPoints() above for why those are tracked separately.
const POINTS_PER_PRO_MONTH = 1000;
const REDEEM_MONTH_DAYS = 30;

// ── PLANNED RUNS — Session 19 ────────────────────────────────────────────
// Cancellation reasons for POST /trips/:id/cancel. `low_interest` is the
// only one meant to count against a host's future reliability signal (not
// built yet — see handoff.md) once that lands; weather/hazard/personal are
// outside a host's control and shouldn't be held against them the same way.
const CANCEL_REASONS = ['weather', 'hazard', 'low_interest', 'personal'];
const TRIP_STATUSES = ['open', 'unconfirmed', 'cancelled', 'closed'];

function isMemberPro(member) {
  if (!member) return false;
  if (member.proLifetime) return true;
  if (member.proExpiresAt && Date.now() < member.proExpiresAt) return true;
  if (member.pitPassActivated) {
    const activatedMs = new Date(member.pitPassActivated).getTime();
    if (Number.isFinite(activatedMs) && Date.now() < activatedMs + PIT_PASS_DAYS_MS) return true;
  }
  return false;
}

async function stripeRequest(env, path, method, body) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
  });
  return res.json();
}

async function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = sigHeader.split(',').reduce((acc, part) => {
    const [k, v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts['t'];
  const sig = parts['v1'];
  if (!timestamp || !sig) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const computed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computedHex = Array.from(new Uint8Array(computed)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (computedHex.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) diff |= computedHex.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// Applies a completed Stripe purchase to a member's account. Idempotent via
// proAppliedSessions — safe to call twice for the same Stripe session (both
// the webhook and the /checkout-status self-heal path call this; whichever
// lands first wins, the second is a no-op). A day-based plan stacks onto any
// still-active expiry instead of resetting it, so buying more time before
// the old block runs out never wastes what's left.
async function grantPro(env, email, planId, plan, stripeSessionId) {
  const raw = await env.CURVES_KV.get(`member:${email}`);
  if (!raw) return false; // shouldn't happen — checkout requires an existing session/member

  const member = JSON.parse(raw);
  member.proAppliedSessions = member.proAppliedSessions || [];
  if (member.proAppliedSessions.includes(stripeSessionId)) return true;

  if (plan.days === null) {
    member.proLifetime = true;
    member.proExpiresAt = null;
  } else {
    const base = (member.proExpiresAt && member.proExpiresAt > Date.now()) ? member.proExpiresAt : Date.now();
    member.proExpiresAt = base + plan.days * 24 * 60 * 60 * 1000;
  }
  member.proTier = planId;
  member.proPurchasedAt = Date.now();
  member.proAppliedSessions.push(stripeSessionId);
  if (member.proAppliedSessions.length > 20) member.proAppliedSessions = member.proAppliedSessions.slice(-20);

  await env.CURVES_KV.put(`member:${email}`, JSON.stringify(member));
  return true;
}

// ── RUN INVITE PAGE — Session 20 ─────────────────────────────────────────
// Server-rendered HTML for the public /run/:id share link. Deliberately
// plain string templating, not a framework — this worker has no build
// step and this is one page, not worth a templating dependency. Every
// piece of trip/member/vehicle text is user-authored, so it goes through
// escapeHtml() before landing in the markup — this endpoint has no auth
// wall, so it's the app's actual public attack surface for stored XSS if
// that step is ever skipped on a new field.
const APP_URL = 'https://scvd-app.github.io/Chasin-Curves/';
// Reused as-is from app.js's client-side constant — this is Mapbox's
// public pk. token (designed for client embedding), not a secret, so
// duplicating it server-side for the run-map overlay is safe.
const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2N2ZCIsImEiOiJjbXMzOHB1eXUwMzRjMzVvYm0ya29wYTZ1In0.FlTd5i3zPj5W7E57UaH5gw';
const MAPBOX_MAX_DIMENSION_SERVER = 1280; // mirrors app.js's MAPBOX_MAX_DIMENSION — same cap, same reason
const HERO_W = 1200, HERO_H = 750; // exact 16:10, matches the .hero CSS box below — label % positions only
                                     // line up correctly if the requested map image's aspect ratio matches
                                     // the box it's displayed in, same reasoning as app.js's correctBBoxAspect.

// ── Web Mercator projection — ported from app.js's trip-postcard code
// (mercatorY/correctBBoxAspect/projectPoint) rather than reinvented. That
// code exists because of a real bug (route lines drifting off the roads
// underneath them) caused by Mapbox silently re-padding a bbox whose aspect
// ratio didn't match the requested image — same failure mode would hit
// waypoint label positions here if skipped.
const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2));
const mercatorYInverse = (y) => toDeg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);

function computeBBox(waypoints) {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const w of waypoints) {
    if (w.lat < minLat) minLat = w.lat;
    if (w.lat > maxLat) maxLat = w.lat;
    if (w.lng < minLng) minLng = w.lng;
    if (w.lng > maxLng) maxLng = w.lng;
  }
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  const latPad = latSpan * 0.18, lngPad = lngSpan * 0.18;
  return { minLat: minLat - latPad, maxLat: maxLat + latPad, minLng: minLng - lngPad, maxLng: maxLng + lngPad };
}

function correctBBoxAspect(bbox, targetAspect) {
  const xSpan = toRad(bbox.maxLng - bbox.minLng);
  const yMercMin = mercatorY(bbox.minLat), yMercMax = mercatorY(bbox.maxLat);
  const ySpan = yMercMax - yMercMin;
  const currentAspect = xSpan / ySpan;
  if (currentAspect < targetAspect) {
    const xSpanNew = targetAspect * ySpan;
    const centerLng = (bbox.minLng + bbox.maxLng) / 2;
    const halfSpanDeg = toDeg(xSpanNew) / 2;
    return { minLat: bbox.minLat, maxLat: bbox.maxLat, minLng: centerLng - halfSpanDeg, maxLng: centerLng + halfSpanDeg };
  } else if (currentAspect > targetAspect) {
    const ySpanNew = xSpan / targetAspect;
    const yMercCenter = (yMercMin + yMercMax) / 2;
    const halfSpanMerc = ySpanNew / 2;
    return {
      minLat: mercatorYInverse(yMercCenter - halfSpanMerc),
      maxLat: mercatorYInverse(yMercCenter + halfSpanMerc),
      minLng: bbox.minLng, maxLng: bbox.maxLng,
    };
  }
  return bbox;
}

// Percentage position (0-100), not pixels — the hero renders at whatever
// width the visitor's screen gives it, so CSS % keeps a label aligned with
// its real-world point regardless of device.
function projectToPercent(lng, lat, bbox) {
  const xPct = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * 100;
  const yMerc = mercatorY(lat);
  const yMercMin = mercatorY(bbox.minLat), yMercMax = mercatorY(bbox.maxLat);
  const yPct = 100 - ((yMerc - yMercMin) / (yMercMax - yMercMin)) * 100;
  return [xPct, yPct];
}

// Plain (no markers/path — those are now hand-placed text labels instead)
// faded map backdrop, sized to exactly match the hero box's aspect ratio.
function buildFadedMapUrl(bbox) {
  const scale = Math.min(1, MAPBOX_MAX_DIMENSION_SERVER / HERO_W, MAPBOX_MAX_DIMENSION_SERVER / HERO_H);
  const reqW = Math.round(HERO_W * scale), reqH = Math.round(HERO_H * scale);
  const bboxStr = `[${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}]`;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${bboxStr}/${reqW}x${reqH}@2x?access_token=${MAPBOX_TOKEN}`;
}

// Truncates a place label to just the town/suburb — takes everything
// before the first comma. Applied at DISPLAY time (here, and again for
// the meeting/end-point lines in renderRunPageHtml) rather than only at
// capture time in app.js, so it fixes waypoints already saved with the
// full "Town, Queensland, Australia" form from before this existed —
// no need to re-add stops on any existing trip to get the short form.
function shortenPlace(label) {
  return String(label ?? '').split(',')[0].trim();
}

// Returns { mapUrl, labels: [{ text, xPct, yPct, kind }] } or null if fewer
// than 2 waypoints (nothing meaningful to show). kind is 'start'/'end'/'via'
// — drives the label's colour accent in the template.
function buildWaypointOverlay(waypoints) {
  if (!waypoints || waypoints.length < 2) return null;
  const bbox = correctBBoxAspect(computeBBox(waypoints), HERO_W / HERO_H);
  const mapUrl = buildFadedMapUrl(bbox);
  const labels = waypoints.map((w, i) => {
    const [xPct, yPct] = projectToPercent(w.lng, w.lat, bbox);
    const kind = i === 0 ? 'start' : (i === waypoints.length - 1 ? 'end' : 'via');
    return { text: shortenPlace(w.label), xPct, yPct, kind };
  });
  return { mapUrl, labels };
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmtDateLabel(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  } catch { return dateStr; }
}

const STATUS_BADGES = {
  open: { label: 'Confirmed', color: '#2E6DA4' },
  unconfirmed: { label: 'Awaiting host update', color: '#C9A84C' },
  cancelled: { label: 'Cancelled', color: '#C0392B' },
  closed: { label: 'Closed', color: '#555' },
};

const CANCEL_REASON_LABELS = {
  weather: 'Weather conditions', hazard: 'Dangerous conditions', low_interest: 'Insufficient interest', personal: "Host's personal circumstances",
};

function renderRunNotFoundHtml() {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Run not found — Chasin' Curves</title>
<style>body{background:#0d0d0d;color:#f5f3ee;font-family:Georgia,serif;text-align:center;padding:80px 24px;}</style></head>
<body><h1 style="color:#C9A84C;">Run not found</h1><p>This invite link doesn't match a run we know about — it may have been removed.</p>
<a href="${APP_URL}" style="color:#2E6DA4;">Go to Chasin' Curves</a></body></html>`;
}

function renderRunPageHtml({ trip, organiserDisplayName, vehiclePhotoUrl, vehicleLabel, roadNames, goingCount, maybeCount, waypointOverlay }) {
  const title = escapeHtml(trip.title || 'A Chasin\u2019 Curves run');
  const dateLabel = fmtDateLabel(trip.date);
  const timeLabel = trip.time ? escapeHtml(trip.time) : '';
  // Session 20: a run with waypoints derives its meeting/end point display
  // from them (first/last) rather than the old free-text meetingPoint field
  // — the planner form never actually collected that field, so waypoints
  // are the real source of truth whenever they exist.
  const waypoints = trip.waypoints || [];
  const meetingPoint = waypoints[0]?.label ? escapeHtml(shortenPlace(waypoints[0].label)) : (trip.meetingPoint ? escapeHtml(trip.meetingPoint) : '');
  const endPoint = waypoints.length > 1 ? escapeHtml(shortenPlace(waypoints[waypoints.length - 1].label)) : '';
  const notes = trip.notes ? escapeHtml(trip.notes) : '';
  const organiser = escapeHtml(organiserDisplayName);
  const vehicle = vehicleLabel ? escapeHtml(vehicleLabel) : '';
  const status = STATUS_BADGES[trip.status] || STATUS_BADGES.open;
  const roadsLine = (roadNames || []).map(escapeHtml).join(' \u2022 ');
  const heroUrl = vehiclePhotoUrl || null;

  const ogDescriptionParts = [dateLabel, timeLabel, meetingPoint].filter(Boolean);
  const ogDescription = escapeHtml(`${ogDescriptionParts.join(' \u00b7 ')} \u2014 hosted by ${organiserDisplayName} on Chasin' Curves`);
  // Session 22: carries run context through to the splash page so it can
  // greet an arriving visitor by the actual run they were invited to
  // ("Kenilworth Donuts Run — hosted by Scott") rather than a generic
  // pitch — the splash page itself lives in app.js, not here.
  const joinUrl = `${APP_URL}?run=${encodeURIComponent(trip.id)}&title=${encodeURIComponent(trip.title || '')}&host=${encodeURIComponent(organiserDisplayName)}`;

  const cancelBanner = trip.status === 'cancelled'
    ? `<div style="background:rgba(192,57,43,0.12);border:1px solid rgba(192,57,43,0.4);border-radius:10px;padding:14px 18px;margin-bottom:20px;color:#f5f3ee;font-family:'Josefin Sans',sans-serif;font-size:14px;">
        This run was cancelled${trip.cancelReason ? ` \u2014 ${escapeHtml(CANCEL_REASON_LABELS[trip.cancelReason] || trip.cancelReason)}` : ''}.
      </div>`
    : '';

  // Session 20: waypoint names overlaid directly on the hero — a thin,
  // low-opacity map backdrop (so it never competes with the vehicle photo)
  // plus bold text labels positioned by real Web Mercator projection, not
  // guessed. Start is champagne, end is Monza red, vias plain bone — kept
  // to text only (no pins) per Scott's call: names are legible at a
  // glance, which is the whole point, without pin clutter. Dotted line
  // added per Scott's follow-up — an SVG polyline through the same label
  // coordinates, since a viewBox="0 0 100 100" lets it use the identical
  // percentage points with zero extra projection work. NOT using
  // vector-effect="non-scaling-stroke" — that keeps stroke-width in real
  // screen pixels rather than viewBox units, which made a 0.35 value
  // render sub-pixel (i.e. invisible) once tested against a live run
  // page. Plain viewBox-scaled stroke-width instead — the 16:10 hero's
  // non-square aspect stretches x/y slightly unevenly, which is an
  // acceptable trade for a thin dotted connector, not worth the added
  // complexity of computing pixel-exact width to correct for it.
  const LABEL_COLORS = { start: '#C9A84C', end: '#C0392B', via: '#f5f3ee' };
  const mapOverlayHtml = waypointOverlay ? `
    <img class="hero-map" src="${escapeHtml(waypointOverlay.mapUrl)}" alt=""/>
    <svg class="hero-route" viewBox="0 0 100 100" preserveAspectRatio="none">
      <polyline points="${waypointOverlay.labels.map(l => `${l.xPct.toFixed(2)},${l.yPct.toFixed(2)}`).join(' ')}"
        fill="none" stroke="#C9A84C" stroke-width="0.6" stroke-dasharray="1.4,1.4" stroke-opacity="0.7"/>
    </svg>
    ${waypointOverlay.labels.map(l => `
      <div class="waypoint-label" style="left:${l.xPct.toFixed(2)}%; top:${l.yPct.toFixed(2)}%; color:${LABEL_COLORS[l.kind]};">
        ${escapeHtml(l.text)}
      </div>`).join('')}
  ` : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${title} \u2014 Chasin' Curves</title>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${ogDescription}"/>
<meta property="og:type" content="website"/>
${heroUrl ? `<meta property="og:image" content="${escapeHtml(heroUrl)}"/>` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Josefin+Sans:wght@400;600&display=swap" rel="stylesheet">
<style>
  body { margin:0; background:#0d0d0d; color:#f5f3ee; font-family:'Josefin Sans',sans-serif; }
  .wrap { max-width:560px; margin:0 auto; padding:0 0 60px; }
  .hero { width:100%; aspect-ratio:16/10; background:#0a0a0a linear-gradient(160deg,#151515,#0a0a0a); background-size:cover; background-position:center; position:relative; overflow:hidden; }
  .hero::after { content:''; position:absolute; inset:0; background:radial-gradient(ellipse at bottom, rgba(0,0,0,0.75), rgba(0,0,0,0.15) 60%); pointer-events:none; }
  .hero-map { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; opacity:0.22; mix-blend-mode:screen; }
  .hero-route { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; }
  .waypoint-label { position:absolute; transform:translate(-50%,-50%); font-family:'Josefin Sans',sans-serif; font-weight:600; font-size:13px; letter-spacing:0.03em; text-shadow:0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6); white-space:nowrap; }
  .brand { text-align:center; padding:28px 24px 8px; }
  .brand-name { font-family:'Cormorant Garamond',serif; font-weight:700; font-size:28px; color:#C9A84C; letter-spacing:0.02em; }
  .brand-tag { font-size:11px; letter-spacing:0.2em; color:#777; text-transform:uppercase; margin-top:4px; }
  .content { padding:20px 24px; }
  .badge { display:inline-block; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; padding:4px 12px; border-radius:20px; color:#fff; margin-bottom:14px; }
  h1 { font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:700; color:#f5f3ee; margin:0 0 8px; }
  .meta { font-size:15px; color:#C9A84C; margin-bottom:4px; }
  .meta.dim { color:#999; }
  .roads { font-size:13px; color:#C9A84C; margin:14px 0; }
  .notes { font-size:14px; color:#ccc; font-style:italic; margin:14px 0; line-height:1.6; }
  .organiser { font-size:13px; color:#999; margin-top:18px; }
  .going { font-size:13px; color:#2E6DA4; margin-top:4px; }
  .cta { display:block; text-align:center; background:#C9A84C; color:#0d0d0d; font-weight:600; text-decoration:none; padding:16px; border-radius:10px; margin-top:28px; font-size:15px; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="hero" ${heroUrl ? `style="background-image:url('${escapeHtml(heroUrl)}');"` : ''}>
      ${mapOverlayHtml}
    </div>
    <div class="brand">
      <div class="brand-name">Chasin<span style="color:#C0392B;">'</span> Curves</div>
      <div class="brand-tag">Roads, Rivers &amp; Riffs</div>
    </div>
    <div class="content">
      <span class="badge" style="background:${status.color};">${status.label}</span>
      ${cancelBanner}
      <h1>${title}</h1>
      ${dateLabel ? `<div class="meta">${dateLabel}${timeLabel ? ` \u00b7 ${timeLabel}` : ''}</div>` : ''}
      ${meetingPoint ? `<div class="meta dim">Meeting at ${meetingPoint}</div>` : ''}
      ${endPoint ? `<div class="meta dim">Finishing at ${endPoint}</div>` : ''}
      ${vehicle ? `<div class="meta dim">Look for: ${vehicle}</div>` : ''}
      ${roadsLine ? `<div class="roads">${roadsLine}</div>` : ''}
      ${notes ? `<div class="notes">${notes}</div>` : ''}
      <div class="organiser">Hosted by ${organiser}</div>
      <div class="going">${goingCount} going${maybeCount ? ` \u00b7 ${maybeCount} maybe` : ''}</div>
      <a class="cta" href="${joinUrl}">View &amp; Join in Chasin' Curves</a>
    </div>
  </div>
</body>
</html>`;
}

// ── RESEND EMAIL — verification code ────────────────────────────────────────
async function sendCodeEmail(resendKey, toEmail, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: "Chasin' Curves <noreply@scvd.app>",
      to: [toEmail],
      subject: `Your Chasin' Curves code: ${code}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:Georgia,serif;">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-size:26px;font-weight:700;color:#C9A84C;letter-spacing:0.02em;">
        Chasin<span style="color:#C0392B;">'</span> Curves
      </div>
      <div style="font-size:11px;letter-spacing:0.2em;color:#555;text-transform:uppercase;margin-top:6px;">Roads, Rivers &amp; Riffs</div>
    </div>
    <div style="background:rgba(201,168,76,0.08);border:1px solid rgba(201,168,76,0.3);border-radius:14px;padding:28px;margin-bottom:24px;text-align:center;">
      <div style="font-size:12px;letter-spacing:0.25em;color:#777;margin-bottom:14px;text-transform:uppercase;">Your Code</div>
      <div style="font-size:36px;font-weight:700;color:#C9A84C;font-family:'Courier New',monospace;letter-spacing:0.3em;">
        ${code}
      </div>
      <div style="margin-top:14px;font-size:12px;color:#555;">Expires in 10 minutes</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:12px;color:#333;line-height:1.9;">
        Didn't request this? You can ignore this email.<br/>
        Need help? <a href="mailto:support@scvd.app" style="color:#555;text-decoration:none;">support@scvd.app</a>
      </div>
    </div>
  </div>
</body>
</html>`,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend ${res.status}: ${errText}`);
  }
  return res.json();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Auth — request code ──────────────────────────────────────────────────
    if (path === '/auth/request' && method === 'POST') {
      const body = await request.json();
      const email = cleanEmail(body.email);
      if (!isValidEmail(email)) return err('Valid email required');

      const code = genCode();
      await env.CURVES_KV.put(
        `authcode:${email}`,
        JSON.stringify({ code, attempts: 0, expiresAt: Date.now() + 10 * 60 * 1000 }),
        { expirationTtl: 600 }
      );

      try {
        await sendCodeEmail(env.RESEND_API_KEY, email, code);
      } catch (e) {
        console.error('Code email failed:', e.message);
        return err('Could not send code — try again shortly', 502);
      }

      return json({ ok: true });
    }

    // ── Auth — verify code ───────────────────────────────────────────────────
    if (path === '/auth/verify' && method === 'POST') {
      const body = await request.json();
      const email = cleanEmail(body.email);
      const code = (body.code || '').trim();
      if (!isValidEmail(email) || !code) return err('Email and code required');

      const raw = await env.CURVES_KV.get(`authcode:${email}`);
      if (!raw) return err('Code expired or not found — request a new one', 401);

      const record = JSON.parse(raw);
      if (Date.now() > record.expiresAt) {
        await env.CURVES_KV.delete(`authcode:${email}`);
        return err('Code expired — request a new one', 401);
      }
      if (record.attempts >= 5) {
        await env.CURVES_KV.delete(`authcode:${email}`);
        return err('Too many attempts — request a new code', 429);
      }
      if (record.code !== code) {
        record.attempts += 1;
        await env.CURVES_KV.put(`authcode:${email}`, JSON.stringify(record), { expirationTtl: 600 });
        return err('Incorrect code', 401);
      }

      // Correct — burn the code, issue a session
      await env.CURVES_KV.delete(`authcode:${email}`);
      const token = genToken();
      const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      await env.CURVES_KV.put(
        `session:${token}`,
        JSON.stringify({ email, expiresAt }),
        { expirationTtl: 30 * 24 * 60 * 60 }
      );

      const existingMember = await env.CURVES_KV.get(`member:${email}`);
      return json({ ok: true, token, email, isNewMember: !existingMember });
    }

    // ── Roads — public, no auth ──────────────────────────────────────────────
    if (path === '/roads') {
      if (method === 'GET') {
        const val = await env.CURVES_KV.get('roads');
        return json(val ? JSON.parse(val) : []);
      }
      if (method === 'POST') {
        // Session 17: was public/no-auth on the theory that email login was
        // only for paid users — no longer true, the whole app is login-
        // gated now, so every caller here already has a session token.
        // Auth costs zero extra friction and closes the addedBy-spoofing gap.
        const authedEmail = await getAuthedEmail(request, env);
        if (!authedEmail) return err('Not authenticated', 401);

        // Session 18 correction: Add Roads is deliberately NOT Pro-gated —
        // it was briefly built that way this session, then corrected once
        // Scott confirmed the actual intent behind the points system: free
        // users earning points (add_road pays 100) is meant to be a path
        // toward free Pro months, so gating the exact action that earns
        // the most points would have worked against that. See handoff.md
        // for the still-unbuilt points-redemption mechanic this implies.
        const body = await request.json();
        // Session 30: the driven line (if any) is pulled out of the body
        // here — it's stored under its own key below, never inside the
        // roads array — and hasPath is server-set only, so a client can't
        // claim a path it didn't send (or that failed validation).
        const { path: rawRoadPath, hasPath: _clientHasPath, ...roadBody } = body;
        const roads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
        const road = {
          ...roadBody,
          addedBy: authedEmail, // override — never trust client value
          verified: false,      // trust badge: never client-settable
          reviews: 0,           // review count comes from real reviews only
        };
        // A client-chosen id must not shadow an existing road.
        if (roads.some(r => String(r.id) === String(road.id))) road.id = Date.now();
        const cleanPath = cleanRoadPath(rawRoadPath);
        if (cleanPath) {
          // Written before the roads array so a road can never claim a
          // path that isn't there; an orphan path key from a failed second
          // write is harmless.
          await env.CURVES_KV.put(`roadpath:${road.id}`, JSON.stringify(cleanPath));
          road.hasPath = true;
        }
        roads.push(road);
        await env.CURVES_KV.put('roads', JSON.stringify(roads));
        await awardPoints(env, authedEmail, POINT_ACTIONS.add_road, 'add_road', { roadId: road.id });
        return json({ ok: true, road });
      }
    }

    // PUT /roads/:id — auth added for correct attribution. No points award
    // here yet: this also handles road edits generally, and rate_road has
    // no dedicated rating submission built (no api.rateRoad() call exists
    // in app.js), so there's no safe way yet to tell "a new rating" apart
    // from "an unrelated edit". Add the award once that feature exists.
    // GET /roads/:id/path — Session 30. Public, like GET /roads. Returns
    // the driven line stored for a road added from a trip, if it has one.
    const roadPathMatch = path.match(/^\/roads\/([^/]+)\/path$/);
    if (roadPathMatch && method === 'GET') {
      const raw = await env.CURVES_KV.get(`roadpath:${roadPathMatch[1]}`);
      if (!raw) return err('No path stored for this road', 404);
      return json({ id: roadPathMatch[1], path: JSON.parse(raw) });
    }

    const roadMatch = path.match(/^\/roads\/([^/]+)$/);
    if (roadMatch && method === 'PUT') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const id = roadMatch[1];
      const body = await request.json();
      const roads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
      const idx = roads.findIndex(r => String(r.id) === id);
      if (idx === -1) return err('Road not found', 404);
      // Only the member who added a road may edit it, and identity/trust
      // fields can never be changed through this route.
      if (roads[idx].addedBy !== authedEmail) return err('Forbidden', 403);
      const { id: _id, addedBy: _by, verified: _v, reviews: _rv, path: _rp, hasPath: _hp, ...safeRoadEdits } = body;
      roads[idx] = { ...roads[idx], ...safeRoadEdits };
      await env.CURVES_KV.put('roads', JSON.stringify(roads));
      return json({ ok: true });
    }

    // ── Member — requires a session bound to the same email as :id ──────────
    const memberMatch = path.match(/^\/member\/([^/]+)$/);

    if (path === '/member' && method === 'POST') {
      const body = await request.json();
      const id = cleanEmail(body.id);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== id) return err('Forbidden', 403);

      const existing = await env.CURVES_KV.get(`member:${id}`);
      if (existing) return err('Member already exists', 409);
      await env.CURVES_KV.put(`member:${id}`, JSON.stringify({ ...body, id }));
      await env.CURVES_KV.put(`garage:${id}`, JSON.stringify([]));
      return json({ ok: true });
    }

    if (memberMatch) {
      const id = cleanEmail(memberMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== id) return err('Forbidden', 403);

      if (method === 'GET') {
        const val = await env.CURVES_KV.get(`member:${id}`);
        if (!val) return err('Member not found', 404);
        return json(JSON.parse(val));
      }
      if (method === 'PUT') {
        const body = await request.json();
        // Session 17: points can no longer be set via client body — the
        // only writer is awardPoints(). This closes the last self-award
        // gap (Session 12 already stopped setting SOMEONE ELSE'S points).
        const safeBody = stripProtectedFields(body);
        const existing = JSON.parse(await env.CURVES_KV.get(`member:${id}`) || '{}');
        await env.CURVES_KV.put(`member:${id}`, JSON.stringify({ ...existing, ...safeBody, id }));
        return json({ ok: true });
      }
    }

    // ── Pit Pass activation — Session 18. Was a raw PUT /member field the
    // client set itself (no server check at all); now server-validated
    // against the same 6 requirements app.js's PitPassBanner checks
    // client-side, since pitPassActivated grants real Pro access now. ─────
    const pitPassActivateMatch = path.match(/^\/member\/([^/]+)\/activate-pit-pass$/);
    if (pitPassActivateMatch && method === 'POST') {
      const id = cleanEmail(pitPassActivateMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== id) return err('Forbidden', 403);

      const raw = await env.CURVES_KV.get(`member:${id}`);
      if (!raw) return err('Member not found', 404);
      const member = JSON.parse(raw);
      if (member.pitPassActivated) return json({ ok: true, alreadyActivated: true, pitPassActivated: member.pitPassActivated });

      const garage = parseGarage(await env.CURVES_KV.get(`garage:${id}`));
      if (!checkPitPassServer(member, garage)) {
        return err('Profile requirements not met yet', 400);
      }

      member.pitPassActivated = new Date().toISOString();
      await env.CURVES_KV.put(`member:${id}`, JSON.stringify(member));
      return json({ ok: true, pitPassActivated: member.pitPassActivated });
    }

    // ── Points → Pro redemption — Session 18 ────────────────────────────
    // Redeems ALL currently-eligible whole 1000-point blocks in one call
    // (floor(proPoints / 1000) months) rather than one month per click —
    // simpler than tracking a partial-redemption state, and it's what a
    // member holding e.g. 2400 points almost certainly wants anyway.
    const redeemPointsMatch = path.match(/^\/member\/([^/]+)\/redeem-points$/);
    if (redeemPointsMatch && method === 'POST') {
      const id = cleanEmail(redeemPointsMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== id) return err('Forbidden', 403);

      const raw = await env.CURVES_KV.get(`member:${id}`);
      if (!raw) return err('Member not found', 404);
      const member = JSON.parse(raw);

      if (member.proLifetime) {
        return err("You already have lifetime Pro — no need to redeem points.", 400);
      }

      const available = member.proPoints || 0;
      const monthsToGrant = Math.floor(available / POINTS_PER_PRO_MONTH);
      if (monthsToGrant < 1) {
        return err(`Not enough points yet — you have ${available}, need ${POINTS_PER_PRO_MONTH} per free month`, 400);
      }

      const pointsSpent = monthsToGrant * POINTS_PER_PRO_MONTH;
      const daysGranted = monthsToGrant * REDEEM_MONTH_DAYS;

      member.proPoints = available - pointsSpent;
      const base = (member.proExpiresAt && member.proExpiresAt > Date.now()) ? member.proExpiresAt : Date.now();
      member.proExpiresAt = base + daysGranted * 24 * 60 * 60 * 1000;
      member.proTier = member.proTier || 'redeemed';

      // Mirrors awardPoints()'s ledger, as a negative entry, so Recent
      // Activity in the Points tab shows the spend, not just silent decay.
      const ledgerKey = `points_ledger:${id}`;
      const ledger = JSON.parse(await env.CURVES_KV.get(ledgerKey) || '[]');
      ledger.push({ amount: -pointsSpent, reason: 'redeem_pro', meta: { monthsGranted: monthsToGrant }, timestamp: Date.now() });
      await env.CURVES_KV.put(ledgerKey, JSON.stringify(ledger));

      await env.CURVES_KV.put(`member:${id}`, JSON.stringify(member));
      return json({
        ok: true,
        monthsGranted: monthsToGrant,
        pointsSpent,
        proPointsRemaining: member.proPoints,
        proExpiresAt: member.proExpiresAt,
      });
    }

    // ── Member public profile — any authed member may view, never exposes
    // email/bio/garage. This is what road attribution links to. ────────────
    const memberPublicMatch = path.match(/^\/members\/([^/]+)\/public$/);
    if (memberPublicMatch && method === 'GET') {
      const id = cleanEmail(memberPublicMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const raw = await env.CURVES_KV.get(`member:${id}`);
      if (!raw) return err('Member not found', 404);
      const m = JSON.parse(raw);

      return json({
        id: m.id,
        displayName: m.displayName || 'Member',
        avatar: m.avatar || null,
        location: m.location || null,
        joinDate: m.joinDate || null,
        points: m.points || 0,
        tripsPlanned: m.tripsPlanned || 0,
      });
    }

    // ── Follows — one-way, no acceptance required. Stored as a single
    // array blob: { followerId, followedId, createdAt }. ────────────────────
    if (path === '/follows' && method === 'GET') {
      const of = cleanEmail(url.searchParams.get('of') || '');
      if (!of) return err('?of=email required');
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const follows = JSON.parse(await env.CURVES_KV.get('follows') || '[]');
      const followerCount = follows.filter(f => f.followedId === of).length;
      const followingCount = follows.filter(f => f.followerId === of).length;
      const viewerIsFollowing = follows.some(f => f.followerId === authedEmail && f.followedId === of);

      return json({ followerCount, followingCount, viewerIsFollowing });
    }

    if (path === '/follows' && method === 'POST') {
      const body = await request.json();
      const followedId = cleanEmail(body.followedId);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (!followedId) return err('followedId required');
      if (followedId === authedEmail) return err("Can't follow yourself");

      const follows = JSON.parse(await env.CURVES_KV.get('follows') || '[]');
      const exists = follows.some(f => f.followerId === authedEmail && f.followedId === followedId);
      if (!exists) {
        follows.push({ followerId: authedEmail, followedId, createdAt: Date.now() });
        await env.CURVES_KV.put('follows', JSON.stringify(follows));
      }
      return json({ ok: true });
    }

    if (path === '/follows' && method === 'DELETE') {
      const body = await request.json();
      const followedId = cleanEmail(body.followedId);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (!followedId) return err('followedId required');

      const follows = JSON.parse(await env.CURVES_KV.get('follows') || '[]');
      const filtered = follows.filter(f => !(f.followerId === authedEmail && f.followedId === followedId));
      await env.CURVES_KV.put('follows', JSON.stringify(filtered));
      return json({ ok: true });
    }

    // ── Garage — requires a session bound to the same email as :id ──────────
    const garageMatch = path.match(/^\/garage\/([^/]+)$/);
    const garagePhotoMatch = path.match(/^\/garage\/([^/]+)\/photo$/);
    const garagePhotoDeleteMatch = path.match(/^\/garage\/([^/]+)\/photo\/([^/]+)$/);

    // DELETE /garage/:id/photo/:photoId  ← most-specific first
    if (garagePhotoDeleteMatch && method === 'DELETE') {
      const userId = cleanEmail(garagePhotoDeleteMatch[1]);
      const photoId = garagePhotoDeleteMatch[2];
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== userId) return err('Forbidden', 403);

      const garage = parseGarage(await env.CURVES_KV.get(`garage:${userId}`));

      let deleted = false;
      for (const vehicle of garage) {
        const before = vehicle.photos ? vehicle.photos.length : 0;
        vehicle.photos = (vehicle.photos || []).filter(p => p.id !== photoId);
        if (vehicle.photos.length < before) {
          deleted = true;
          if (vehicle.heroPhoto === photoId) {
            vehicle.heroPhoto = vehicle.photos.length > 0 ? vehicle.photos[0].id : null;
            vehicle.heroPhotoUrl = vehicle.photos.length > 0 ? vehicle.photos[0].url : null;
          }
        }
      }

      if (!deleted) return err('Photo not found', 404);

      try {
        await env.MEDIA_BUCKET.delete(photoId);
      } catch (e) {
        console.error('R2 delete failed:', e);
      }

      await env.CURVES_KV.put(`garage:${userId}`, JSON.stringify(garage));
      return json({ ok: true });
    }

    // PUT /garage/:id/photo  — multipart upload → R2 → store URL in KV
    if (garagePhotoMatch && method === 'PUT') {
      const userId = cleanEmail(garagePhotoMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== userId) return err('Forbidden', 403);

      const contentType = request.headers.get('Content-Type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return err('Expected multipart/form-data');
      }

      const formData = await request.formData();
      const file = formData.get('photo');
      const vehicleId = formData.get('vehicleId');
      const setAsHero = formData.get('setAsHero') === 'true';

      if (!file || !vehicleId) return err('Missing photo or vehicleId');

      const garage = parseGarage(await env.CURVES_KV.get(`garage:${userId}`));
      const vehicle = garage.find(v => v.id === vehicleId);
      if (!vehicle) return err('Vehicle not found', 404);

      if ((vehicle.photos || []).length >= 10) {
        return err('Maximum 10 photos per vehicle');
      }

      const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
      const photoId = `${userId.replace(/[^a-z0-9]/gi, '_')}_${vehicleId}_${Date.now()}.${ext}`;

      const mimeType = (file.type && file.type.startsWith('image/')) ? file.type : 'image/jpeg';
      await env.MEDIA_BUCKET.put(photoId, file.stream(), {
        httpMetadata: { contentType: mimeType },
      });

      const photoUrl = `${R2_PUBLIC_BASE}/${photoId}`;

      if (!vehicle.photos) vehicle.photos = [];
      vehicle.photos.push({ id: photoId, url: photoUrl, addedAt: Date.now() });

      if (setAsHero || vehicle.photos.length === 1) {
        vehicle.heroPhoto = photoId;
        vehicle.heroPhotoUrl = photoUrl;
      }

      await env.CURVES_KV.put(`garage:${userId}`, JSON.stringify(garage));
      await awardPoints(env, authedEmail, POINT_ACTIONS.upload_photo, 'upload_photo', { vehicleId, photoId });
      return json({ ok: true, photoId, url: photoUrl });
    }

    // GET /garage/:id  and  PUT /garage/:id
    if (garageMatch) {
      const id = cleanEmail(garageMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== id) return err('Forbidden', 403);

      if (method === 'GET') {
        const val = await env.CURVES_KV.get(`garage:${id}`);
        return json(parseGarage(val));
      }
      if (method === 'PUT') {
        const body = await request.json();
        const garage = Array.isArray(body) ? body : (Array.isArray(body.garage) ? body.garage : body);
        const serialised = JSON.stringify(garage);
        if (serialised.length > 80000) {
          return err('Payload too large — use /garage/:id/photo for images', 413);
        }

        // Session 17: award add_vehicle only for genuinely NEW vehicles —
        // this route also handles edits/reorders to an existing garage, so
        // a diff against the old state is required (can't just award on
        // every PUT, that would pay out on every edit).
        const oldGarage = parseGarage(await env.CURVES_KV.get(`garage:${id}`));
        const oldIds = new Set(oldGarage.map(v => v.id));
        const newlyAdded = garage.filter(v => !oldIds.has(v.id));

        // Session 18: free plan is capped at 1 vehicle. Only blocks adding
        // a NEW vehicle beyond the cap — a Pro member whose access lapses
        // keeps whatever they already saved and can still edit/reorder it,
        // they just can't grow past the cap while free.
        if (newlyAdded.length > 0 && garage.length > 1) {
          const memberForGarage = JSON.parse(await env.CURVES_KV.get(`member:${id}`) || 'null');
          if (!isMemberPro(memberForGarage)) {
            return err('Free plan is limited to 1 vehicle in the Garage — upgrade to Pro to add more', 402);
          }
        }

        await env.CURVES_KV.put(`garage:${id}`, serialised);

        for (const vehicle of newlyAdded) {
          await awardPoints(env, id, POINT_ACTIONS.add_vehicle, 'add_vehicle', { vehicleId: vehicle.id });
        }
        return json({ ok: true });
      }
    }

    // ── Logbook (Use Entries) — requires a session bound to the same email
    // as :id, same isolation pattern as /garage. Phase 1 of the Murphy
    // Report & Logbook feature: general_use entries only. Club-event entry
    // types (club_event / impromptu_event) and the partner_club_id field
    // land with the Murphy Report build once a pilot club is lined up —
    // see chasin-curves/murphy-report-logbook.md. ──────────────────────────
    const logbookMatch = path.match(/^\/logbook\/([^/]+)$/);
    const logbookEntryMatch = path.match(/^\/logbook\/([^/]+)\/([^/]+)$/);

    // PUT /logbook/:id/:entryId — the only mutations a filed entry ever gets:
    // attaching a return odometer reading, and/or a GPS trail, both captured
    // after the fact. Nothing else (timestamp, odometer_start, vehicleId)
    // can be changed once an entry exists — that immutability is the actual
    // compliance feature. Session 15: `trail` added — an opt-in-per-trip
    // array of {lat, lng, t} points from the GPS Snail Trail spec, written
    // once when the trip is stopped (not streamed point-by-point), so this
    // stays the same "one settle-up write" shape as the odometer case.
    const MAX_TRAIL_POINTS = 1500; // ~8+ hours at a 20s poll — generous, not unbounded
    // Session 16e — a single {lat, lng} fix (no `t`, unlike a trail point):
    // used for both the POST's startCoord below and this PUT's endCoord.
    // These are one-off fixes taken at "Log Trip Now" and "+ Return Odo"
    // respectively, not a continuous recording — that's still the separate,
    // opt-in `trail` field above. Added so a Trip Postcard has a real
    // start→finish route to draw even for trips never recorded live.
    const isValidCoord = c => c && typeof c.lat === 'number' && typeof c.lng === 'number';
    if (logbookEntryMatch && method === 'PUT') {
      const userId = cleanEmail(logbookEntryMatch[1]);
      const entryId = logbookEntryMatch[2];
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== userId) return err('Forbidden', 403);

      // Session 18: Logbook (incl. this settle-up write) is Pro-only.
      const memberForLogbookPut = JSON.parse(await env.CURVES_KV.get(`member:${userId}`) || 'null');
      if (!isMemberPro(memberForLogbookPut)) {
        return err('Logbook is a Pro feature — upgrade to keep logging trips', 402);
      }

      const body = await request.json();
      const hasOdo = typeof body.odometerEnd === 'number';
      const hasTrail = Array.isArray(body.trail);
      const hasEndCoord = body.endCoord !== undefined;
      if (!hasOdo && !hasTrail && !hasEndCoord) return err('odometerEnd (number), trail (array), and/or endCoord required');

      if (hasTrail) {
        if (body.trail.length > MAX_TRAIL_POINTS) return err(`trail exceeds ${MAX_TRAIL_POINTS} points`);
        const validShape = body.trail.every(p =>
          p && typeof p.lat === 'number' && typeof p.lng === 'number' && typeof p.t === 'number'
        );
        if (!validShape) return err('Each trail point needs numeric lat, lng, and t');
      }
      if (hasEndCoord && !isValidCoord(body.endCoord)) return err('endCoord needs numeric lat and lng');

      const entries = JSON.parse(await env.CURVES_KV.get(`logbook:${userId}`) || '[]');
      const idx = entries.findIndex(e => e.id === entryId);
      if (idx === -1) return err('Entry not found', 404);

      if (hasOdo) {
        if (body.odometerEnd < entries[idx].odometerStart) {
          return err("Return odometer can't be less than the start reading");
        }
        entries[idx].odometerEnd = body.odometerEnd;
      }
      if (hasTrail) {
        entries[idx].trail = body.trail;
      }
      if (hasEndCoord) {
        entries[idx].endCoord = { lat: body.endCoord.lat, lng: body.endCoord.lng };
      }

      await env.CURVES_KV.put(`logbook:${userId}`, JSON.stringify(entries));
      // Session 17 correction: log_trip does NOT award here. First pass
      // wrongly put it on completion — the real, established trigger
      // (confirmed by app.js's own comment: "was firing even on a failed
      // log attempt") is a successful trip START, awarded below in the
      // POST handler instead.
      return json({ ok: true });
    }

    // GET /logbook/:id  and  POST /logbook/:id
    if (logbookMatch) {
      const id = cleanEmail(logbookMatch[1]);
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== id) return err('Forbidden', 403);

      // Session 18: Logbook is Pro-only (also covers Trip Postcards, which
      // are generated from logged trips — no separate endpoint to gate).
      const memberForLogbook = JSON.parse(await env.CURVES_KV.get(`member:${id}`) || 'null');
      if (!isMemberPro(memberForLogbook)) {
        return err('Logbook is a Pro feature — upgrade to start logging trips', 402);
      }

      if (method === 'GET') {
        const val = await env.CURVES_KV.get(`logbook:${id}`);
        return json(val ? JSON.parse(val) : []);
      }
      if (method === 'POST') {
        const body = await request.json();
        if (!body.vehicleId) return err('vehicleId required');
        if (typeof body.odometerStart !== 'number') return err('odometerStart (number) required');
        // Session 16e: optional one-off GPS fix taken client-side the
        // instant "Log Trip Now" is tapped — see isValidCoord's comment above.
        const hasStartCoord = body.startCoord !== undefined;
        if (hasStartCoord && !isValidCoord(body.startCoord)) return err('startCoord needs numeric lat and lng');

        const entries = JSON.parse(await env.CURVES_KV.get(`logbook:${id}`) || '[]');
        const entry = {
          id: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
          vehicleId: body.vehicleId,
          // Only general_use exists in this build — club_event/impromptu_event
          // arrive with the Murphy Report phase (needs a partner club first).
          entryType: 'general_use',
          // Server-stamped, always "now" — a client-supplied timestamp is
          // never read, let alone trusted. This is the data-layer enforcement
          // of "no forward-dating, no backdating" from the spec.
          timestamp: Date.now(),
          odometerStart: body.odometerStart,
          odometerEnd: null,
          ...(hasStartCoord ? { startCoord: { lat: body.startCoord.lat, lng: body.startCoord.lng } } : {}),
        };
        entries.push(entry);
        await env.CURVES_KV.put(`logbook:${id}`, JSON.stringify(entries));
        // Session 17: log_trip awards here, on successful trip creation —
        // this is the real, established trigger (see the PUT handler's
        // comment above for why it's NOT on completion).
        await awardPoints(env, authedEmail, POINT_ACTIONS.log_trip, 'log_trip', { entryId: entry.id });
        return json({ ok: true, entry });
      }
    }

    // ── Trips — Session 17: auth added (see /roads comment above for why) ───
    if (path === '/trips') {
      if (method === 'GET') {
        const val = await env.CURVES_KV.get('trips');
        return json(val ? JSON.parse(val) : []);
      }
      if (method === 'POST') {
        // Session 17: same reasoning as /roads — app is fully login-gated
        // now, auth here is free (no new friction) and closes the
        // createdBy-spoofing gap.
        const authedEmail = await getAuthedEmail(request, env);
        if (!authedEmail) return err('Not authenticated', 401);

        const body = await request.json();
        // Session 19: optional planned-run fields, all backward compatible —
        // existing trips (Scott's and Sandy's) simply don't have these and
        // that's fine, every read site below treats them as optional.
        const trip = {
          ...body,
          createdBy: authedEmail, // override, matches app.js's own field name
          status: 'open',
          meetingPoint: body.meetingPoint || null,
          timezone: body.timezone || null, // IANA string e.g. "Australia/Brisbane" — used by the cron auto-cancel, not built yet
          maxAttendees: typeof body.maxAttendees === 'number' ? body.maxAttendees : null,
        };
        const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
        trips.push(trip);
        await env.CURVES_KV.put('trips', JSON.stringify(trips));
        await awardPoints(env, authedEmail, POINT_ACTIONS.plan_trip, 'plan_trip', { tripId: trip.id });
        return json({ ok: true, trip });
      }
    }

    // PUT /trips/:id — this is the "join a trip" path (attendees array),
    // not trip creation, so no points award here — joining isn't a scored
    // action. Auth added anyway so attendee identity can't be spoofed.
    const tripMatch = path.match(/^\/trips\/([^/]+)$/);
    if (tripMatch && method === 'PUT') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const id = tripMatch[1];
      const body = await request.json();
      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const idx = trips.findIndex(t => String(t.id) === id);
      if (idx === -1) return err('Trip not found', 404);
      // Host-only. Identity, status and attendees are never editable here:
      // RSVPs go through /rsvp and cancellations through /cancel.
      if (trips[idx].createdBy !== authedEmail) return err('Forbidden', 403);
      if (trips[idx].status === 'cancelled') return err('This run has been cancelled and can no longer be edited', 409);
      const { id: _id, createdBy: _cb, status: _st, attendees: _at, cancelReason: _cr, cancelledAt: _ca, ...safeTripEdits } = body;
      const updated = { ...trips[idx], ...safeTripEdits, updatedAt: Date.now() };
      // Keep the host's own attendee entry pointing at the vehicle they're actually bringing.
      if (safeTripEdits.vehicleId) {
        updated.attendees = (updated.attendees || []).map(a =>
          a.memberId === updated.createdBy ? { ...a, vehicleId: safeTripEdits.vehicleId } : a);
      }
      trips[idx] = updated;
      await env.CURVES_KV.put('trips', JSON.stringify(trips));
      return json({ ok: true, trip: updated });
    }

    // DELETE /trips/:id — host-only, and only once a run is cancelled or already
    // past, so a live invite with people joined can't just vanish. Cancel first.
    if (tripMatch && method === 'DELETE') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const id = tripMatch[1];
      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const idx = trips.findIndex(t => String(t.id) === id);
      if (idx === -1) return err('Trip not found', 404);
      const trip = trips[idx];
      if (trip.createdBy !== authedEmail) return err('Only the host can delete this run', 403);

      const dateMs = trip.date ? Date.parse(trip.date) : NaN;
      const isPast = !isNaN(dateMs) && dateMs < Date.now() - 24 * 60 * 60 * 1000;
      if (trip.status !== 'cancelled' && !isPast) {
        return err('Cancel this run first, or wait until it has finished, before deleting it', 409);
      }
      trips.splice(idx, 1);
      await env.CURVES_KV.put('trips', JSON.stringify(trips));
      return json({ ok: true });
    }

    // POST /trips/:id/rsvp — Session 19. Atomic add/update of ONE attendee's
    // status, read-modify-write entirely server-side. Deliberately separate
    // from the PUT above (which lets a client overwrite the whole trip,
    // attendees included) so two people RSVPing at the same moment can never
    // stomp each other — each request only ever touches its own entry in
    // the array before the single write-back.
    const tripRsvpMatch = path.match(/^\/trips\/([^/]+)\/rsvp$/);
    if (tripRsvpMatch && method === 'POST') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const id = tripRsvpMatch[1];
      const body = await request.json();
      const status = body.status;
      if (!['going', 'maybe', 'not_going'].includes(status)) {
        return err("status must be 'going', 'maybe', or 'not_going'");
      }

      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const idx = trips.findIndex(t => String(t.id) === id);
      if (idx === -1) return err('Trip not found', 404);
      const trip = trips[idx];

      if (trip.status === 'cancelled') return err('This run has been cancelled', 409);

      trip.attendees = trip.attendees || [];
      const attendeeIdx = trip.attendees.findIndex(a => a.memberId === authedEmail);

      if (status === 'not_going') {
        if (attendeeIdx !== -1) trip.attendees.splice(attendeeIdx, 1);
      } else {
        // maxAttendees only blocks a NEW 'going' RSVP, never 'maybe' and
        // never someone updating their own existing entry.
        const goingCount = trip.attendees.filter(a => a.status !== 'maybe').length;
        const isNewGoing = attendeeIdx === -1 && status === 'going';
        if (isNewGoing && trip.maxAttendees && goingCount >= trip.maxAttendees) {
          return err('This run is full', 409);
        }

        const entry = { memberId: authedEmail, vehicleId: body.vehicleId || null, status };
        if (attendeeIdx === -1) trip.attendees.push(entry);
        else trip.attendees[attendeeIdx] = { ...trip.attendees[attendeeIdx], ...entry };
      }

      await env.CURVES_KV.put('trips', JSON.stringify(trips));
      return json({ ok: true, trip });
    }

    // POST /trips/:id/cancel — Session 19. Host-only. Requires a reason from
    // CANCEL_REASONS so a cancelled run carries an honest, categorised
    // record rather than just vanishing or going silently unconfirmed.
    const tripCancelMatch = path.match(/^\/trips\/([^/]+)\/cancel$/);
    if (tripCancelMatch && method === 'POST') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const id = tripCancelMatch[1];
      const body = await request.json();
      if (!CANCEL_REASONS.includes(body.reason)) {
        return err(`reason must be one of: ${CANCEL_REASONS.join(', ')}`);
      }

      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const idx = trips.findIndex(t => String(t.id) === id);
      if (idx === -1) return err('Trip not found', 404);
      if (trips[idx].createdBy !== authedEmail) return err('Only the host can cancel this run', 403);
      if (trips[idx].status === 'cancelled') return json({ ok: true, trip: trips[idx] }); // idempotent

      trips[idx].status = 'cancelled';
      trips[idx].cancelReason = body.reason;
      trips[idx].cancelledAt = Date.now();
      await env.CURVES_KV.put('trips', JSON.stringify(trips));
      return json({ ok: true, trip: trips[idx] });
    }

    // GET /trips/:id/public — Session 19. No auth — this is the endpoint the
    // shareable invite/postcard link (Instagram, Facebook) will hit. Returns
    // only what's safe for an anonymous visitor: never the organiser's or
    // any attendee's email, matching the same email-hiding principle as
    // GET /members/:id/public above.
    // Session 20: pulls the organiser's chosen vehicle (trip.vehicleId, set
    // at planning time) from their Garage as the hero photo — Scott's call,
    // and a better one than a new cover-photo upload feature: no new
    // infrastructure needed, AND it doubles as a real-world "spot the car"
    // cue for anyone meeting up who's never met the organiser in person.
    const tripPublicMatch = path.match(/^\/trips\/([^/]+)\/public$/);
    if (tripPublicMatch && method === 'GET') {
      const id = tripPublicMatch[1];
      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const trip = trips.find(t => String(t.id) === id);
      if (!trip) return err('Run not found', 404);

      const organiserRaw = await env.CURVES_KV.get(`member:${trip.createdBy}`);
      const organiser = organiserRaw ? JSON.parse(organiserRaw) : null;
      const attendees = trip.attendees || [];

      let vehiclePhotoUrl = null, vehicleLabel = null;
      if (trip.vehicleId) {
        const garage = parseGarage(await env.CURVES_KV.get(`garage:${trip.createdBy}`));
        const vehicle = garage.find(v => v.id === trip.vehicleId);
        if (vehicle) {
          vehiclePhotoUrl = vehicle.heroPhotoUrl || null;
          vehicleLabel = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || null;
        }
      }

      return json({
        id: trip.id,
        title: trip.title,
        date: trip.date || null,
        time: trip.time || null,
        timezone: trip.timezone || null,
        meetingPoint: trip.meetingPoint || null,
        waypoints: trip.waypoints || [],
        routes: trip.routes || [],
        notes: trip.notes || null,
        status: trip.status || 'open',
        cancelReason: trip.cancelReason || null,
        organiserDisplayName: organiser?.displayName || 'A Chasin\u2019 Curves member',
        vehiclePhotoUrl,
        vehicleLabel,
        goingCount: attendees.filter(a => a.status !== 'maybe').length,
        maybeCount: attendees.filter(a => a.status === 'maybe').length,
        maxAttendees: trip.maxAttendees || null,
      });
    }

    // GET /run/:id — Session 20. Server-rendered HTML landing page (NOT the
    // React app) for the shareable invite link. This has to be real HTML
    // with the data already in it, not a client-rendered page the SPA fills
    // in later — Facebook/Instagram's link-preview crawlers generally don't
    // execute JS, so Open Graph tags only work if they're in the initial
    // response. Reuses the brand kit (Cormorant Garamond + Josefin Sans,
    // Midnight/Champagne/Monza/Ocean/Bone) rather than the app's React
    // components, since this is a standalone unauthenticated page.
    const runPageMatch = path.match(/^\/run\/([^/]+)$/);
    if (runPageMatch && method === 'GET') {
      const id = runPageMatch[1];
      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const trip = trips.find(t => String(t.id) === id);
      if (!trip) return new Response(renderRunNotFoundHtml(), { status: 404, headers: { 'Content-Type': 'text/html' } });

      const organiserRaw = await env.CURVES_KV.get(`member:${trip.createdBy}`);
      const organiser = organiserRaw ? JSON.parse(organiserRaw) : null;
      const attendees = trip.attendees || [];

      let vehiclePhotoUrl = null, vehicleLabel = null;
      if (trip.vehicleId) {
        const garage = parseGarage(await env.CURVES_KV.get(`garage:${trip.createdBy}`));
        const vehicle = garage.find(v => v.id === trip.vehicleId);
        if (vehicle) {
          vehiclePhotoUrl = vehicle.heroPhotoUrl || null;
          vehicleLabel = `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || null;
        }
      }

      const allRoads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
      const roadNames = (trip.routes || []).map(rid => allRoads.find(r => r.id === rid)?.name).filter(Boolean);

      const html = renderRunPageHtml({
        trip,
        organiserDisplayName: organiser?.displayName || 'A Chasin\u2019 Curves member',
        vehiclePhotoUrl,
        vehicleLabel,
        roadNames,
        goingCount: attendees.filter(a => a.status !== 'maybe').length,
        maybeCount: attendees.filter(a => a.status === 'maybe').length,
        waypointOverlay: buildWaypointOverlay(trip.waypoints),
      });
      return new Response(html, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } });
    }

    // ── Reviews & Alerts — Session 17: auth added, same reasoning as
    // roads/trips above. Field names (reviewerId / reportedBy) are a
    // best-guess convention — neither postReview nor postAlert has any
    // call site in app.js yet, so there's no real form to confirm the
    // exact shape against. Confirm/adjust once those UIs get built. ───────
    if (path === '/reviews' && method === 'POST') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const body = await request.json();
      const review = { ...body, reviewerId: authedEmail };
      const reviews = JSON.parse(await env.CURVES_KV.get('reviews') || '[]');
      reviews.push(review);
      await env.CURVES_KV.put('reviews', JSON.stringify(reviews));
      // Points paused: no UI calls this yet, and it had no validation or per-road limit.
      return json({ ok: true, review });
    }

    if (path === '/alerts' && method === 'POST') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const body = await request.json();
      const alert = { ...body, reportedBy: authedEmail };
      const alerts = JSON.parse(await env.CURVES_KV.get('alerts') || '[]');
      alerts.push(alert);
      await env.CURVES_KV.put('alerts', JSON.stringify(alerts));
      // Points paused: no UI calls this yet, and it had no validation or per-road limit.
      return json({ ok: true, alert });
    }

    // ── Stripe checkout — Session 18 ─────────────────────────────────────
    if (path === '/create-checkout' && method === 'POST') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const body = await request.json();
      const plan = PRO_PLANS[body.planId];
      if (!plan) return err('Invalid plan');
      if (!body.successUrl || !body.cancelUrl) return err('successUrl and cancelUrl required');

      try {
        const session = await stripeRequest(env, '/checkout/sessions', 'POST', {
          'payment_method_types[]': 'card',
          'mode': 'payment',
          'customer_email': authedEmail,
          'line_items[0][price_data][currency]': 'usd',
          'line_items[0][price_data][product_data][name]': `Chasin' Curves Pro — ${plan.label}`,
          'line_items[0][price_data][product_data][description]': "Trip Postcards, Logbook & unlimited vehicles. One-time payment, no auto-renewal.",
          'line_items[0][price_data][unit_amount]': plan.amount.toString(),
          'line_items[0][quantity]': '1',
          'metadata[email]': authedEmail,
          'metadata[planId]': body.planId,
          'metadata[days]': plan.days === null ? 'lifetime' : plan.days.toString(),
          'success_url': body.successUrl,
          'cancel_url': body.cancelUrl,
        });
        if (session.error) return err(session.error.message || 'Stripe error creating checkout session', 502);
        return json({ url: session.url, sessionId: session.id });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── Stripe webhook ────────────────────────────────────────────────────
    if (path === '/webhook' && method === 'POST') {
      try {
        const rawBody = await request.text();
        const sigHeader = request.headers.get('stripe-signature') || '';
        const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
        if (!valid) return new Response('Invalid signature', { status: 400 });

        const event = JSON.parse(rawBody);
        if (event.type === 'checkout.session.completed') {
          const session = event.data.object;
          const email = cleanEmail(session.metadata?.email || session.customer_details?.email || '');
          const planId = session.metadata?.planId;
          const plan = PRO_PLANS[planId];
          if (email && plan) {
            await grantPro(env, email, planId, plan, session.id);
          }
        }
        return json({ received: true });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── Checkout status / self-heal — Session 18. Covers the case the
    // webhook hasn't landed yet by the time the user is redirected back:
    // the exact failure mode found in Cult Connections' original checkout
    // (token only ever deliverable via the same browser tab). Safe to call
    // repeatedly — grantPro() is idempotent per Stripe session id. app.js
    // calls this on return from Checkout using the session_id Stripe
    // appends to success_url. ────────────────────────────────────────────
    if (path === '/checkout-status' && method === 'GET') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const sessionId = url.searchParams.get('session_id');
      if (!sessionId) return err('session_id required');

      try {
        const session = await stripeRequest(env, `/checkout/sessions/${sessionId}`, 'GET');
        if (session.error) return err(session.error.message || 'Stripe error', 502);
        if (session.payment_status !== 'paid') return json({ granted: false, status: session.payment_status });

        const sessionEmail = cleanEmail(session.metadata?.email || session.customer_details?.email || '');
        if (sessionEmail !== authedEmail) return err('Session does not belong to this account', 403);

        const planId = session.metadata?.planId;
        const plan = PRO_PLANS[planId];
        if (!plan) return err('Unknown plan on session', 500);

        await grantPro(env, authedEmail, planId, plan, session.id);

        const raw = await env.CURVES_KV.get(`member:${authedEmail}`);
        const member = JSON.parse(raw || '{}');
        return json({
          granted: true,
          pro: { lifetime: !!member.proLifetime, expiresAt: member.proExpiresAt || null, tier: member.proTier || null },
        });
      } catch (e) {
        return err(e.message, 500);
      }
    }

    // ── Admin — comp Pro access, same pattern as Mic Drop/Cult Connections'
    // admin-grant endpoints. ──────────────────────────────────────────────
    if (path === '/admin/grant-pro' && method === 'POST') {
      const body = await request.json();
      if (!env.CURVES_ADMIN_KEY || body.adminKey !== env.CURVES_ADMIN_KEY) {
        return err('Unauthorised', 403);
      }
      const email = cleanEmail(body.email);
      if (!isValidEmail(email)) return err('Valid email required');
      const planId = body.planId || 'lifetime';
      const plan = ADMIN_PLANS[planId];
      if (!plan) return err('Invalid plan');

      const ok = await grantPro(env, email, planId, plan, `comp_${Date.now()}`);
      if (!ok) return err('Member not found — they need to sign up first', 404);
      return json({ ok: true });
    }

    // ── Admin — delete trip(s) — Session 21. Same shared-adminKey pattern
    // as grant-pro above. Built for tidying up beta-test trips (accepts a
    // single tripId or a tripIds array so a whole night's test data can be
    // cleared in one call). Deliberately does NOT support a "delete
    // everything" flag — always requires the specific IDs, so a mistyped
    // request can't wipe every real trip. This is the endpoint rinlojM's
    // Chasin' Curves adapter calls — a delegate cleans up trips through
    // rinlojM's own PIN+phrase gate, never touching this admin key or
    // Chasin' Curves' own login at all.
    if (path === '/admin/delete-trip' && method === 'POST') {
      const body = await request.json();
      if (!env.CURVES_ADMIN_KEY || body.adminKey !== env.CURVES_ADMIN_KEY) {
        return err('Unauthorised', 403);
      }
      const ids = Array.isArray(body.tripIds) ? body.tripIds.map(String)
        : (body.tripId != null ? [String(body.tripId)] : []);
      if (ids.length === 0) return err('tripId or tripIds required');

      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const remaining = trips.filter(t => !ids.includes(String(t.id)));
      const deletedCount = trips.length - remaining.length;
      await env.CURVES_KV.put('trips', JSON.stringify(remaining));
      return json({ ok: true, deletedCount, remainingCount: remaining.length });
    }

    // POST /admin/update-road — admin-key gated edit of any road. Members can't
    // edit seed roads (they weren't added under a real login email), so this is
    // how seed data gets fixed, e.g. the hard-coded review counts.
    if (path === '/admin/update-road' && method === 'POST') {
      const body = await request.json();
      if (!env.CURVES_ADMIN_KEY || body.adminKey !== env.CURVES_ADMIN_KEY) {
        return err('Unauthorised', 403);
      }
      if (body.roadId == null || !body.updates || typeof body.updates !== 'object') {
        return err('roadId and updates required');
      }
      const roads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
      const idx = roads.findIndex(r => String(r.id) === String(body.roadId));
      if (idx === -1) return err('Road not found', 404);
      const { id: _id, ...updates } = body.updates; // a road's id is never changeable
      roads[idx] = { ...roads[idx], ...updates };
      await env.CURVES_KV.put('roads', JSON.stringify(roads));
      return json({ ok: true, road: roads[idx] });
    }

    return err('Not found', 404);
  },
};
