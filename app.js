// ============================================================
// CHASIN' CURVES — app.js
// Scott Claude Van Dam — v3.0 — Email + code auth
// Fix 1: saveGarage sends raw array (not {garage:[]} wrapper)
// Fix 2: heroPhoto stored/compared as photoId string everywhere
// Fix 3: points loaded from KV only — seed member removed from init path
// v2.2: Username login screen — Option A (join or sign in, one flow)
// v3.0: Username login replaced with email + 6-digit code.
//       Session token (not username) persisted to localStorage.
//       Server now checks the token's email against :id on every
//       member/garage request — closes the "type anyone's username"
//       account-isolation gap found in beta.
// ============================================================

const { useState, useEffect, useRef, useCallback, useMemo } = React;

// ─── PALETTE ────────────────────────────────────────────────
const C = {
  midnight: '#0d0d0d',
  panel: '#111',
  border: '#1e1e1e',
  border2: '#2a2a2a',
  champagne: '#C9A84C',
  champagneLight: '#e8c76a',
  champagneDim: '#C9A84C22',
  red: '#C0392B',
  redDim: '#C0392B22',
  blue: '#2E6DA4',
  blueDim: '#2E6DA422',
  bone: '#f5f3ee',
  muted: '#888',
  dim: '#555',
  faint: '#333',
};

// ─── API CONFIG ──────────────────────────────────────────────
const API = "https://chasin-curves.emblen-scott.workers.dev";

// ─── SESSION ─────────────────────────────────────────────────
// Session (token + email) lives in localStorage under cc_session.
// Every member/garage call carries the token; the server resolves
// the real identity from it and rejects anything that doesn't match.
const getSession = () => {
  try { return JSON.parse(localStorage.getItem("cc_session") || "null"); }
  catch { return null; }
};
const setSession = (session) => localStorage.setItem("cc_session", JSON.stringify(session));
const clearSession = () => localStorage.removeItem("cc_session");

const authHeaders = () => {
  const session = getSession();
  return session?.token ? { "Authorization": `Bearer ${session.token}` } : {};
};

// Throws a tagged error on 401/403 so callers can force a re-login
const authedFetch = async (url, options = {}) => {
  const res = await fetch(url, { ...options, headers: { ...options.headers, ...authHeaders() } });
  if (res.status === 401 || res.status === 403) {
    const e = new Error("Session expired or invalid");
    e.authFailed = true;
    throw e;
  }
  return res.json();
};

const api = {
  getRoads: () => fetch(`${API}/roads`).then(r => r.json()),
  // Session 17: switched to authedFetch — the app is fully login-gated
  // now, so every caller already has a session token; the worker now
  // requires it too (see worker.js Session 17 note).
  postRoad: (road) => authedFetch(`${API}/roads`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(road) }),
  updateRoad: (id, updates) => authedFetch(`${API}/roads/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }),

  // ── Auth ──
  requestCode: (email) => fetch(`${API}/auth/request`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email }) }).then(async r => {
    const data = await r.json(); if (!r.ok) { const e = new Error(data.error || "Failed to send code"); e.status = r.status; throw e; } return data;
  }),
  verifyCode: (email, code) => fetch(`${API}/auth/verify`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email, code }) }).then(async r => {
    const data = await r.json(); if (!r.ok) { const e = new Error(data.error || "Verification failed"); e.status = r.status; throw e; } return data;
  }),

  // ── Member / Garage — session-authenticated ──
  getMember: (id) => authedFetch(`${API}/member/${id}`),
  postMember: (member) => authedFetch(`${API}/member`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(member) }),
  updateMember: (id, updates) => authedFetch(`${API}/member/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }),
  // FIX 1: send raw array, not {garage:[...]} wrapper
  getGarage: (id) => authedFetch(`${API}/garage/${id}`),
  saveGarage: (id, garage) => authedFetch(`${API}/garage/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(garage) }),

  // ── Public member profile / Follows — session-authenticated (any member) ──
  getMemberPublic: (id) => authedFetch(`${API}/members/${id}/public`),
  getFollows: (id) => authedFetch(`${API}/follows?of=${encodeURIComponent(id)}`),
  follow: (followedId) => authedFetch(`${API}/follows`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ followedId }) }),
  unfollow: (followedId) => authedFetch(`${API}/follows`, { method:"DELETE", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ followedId }) }),

  // ── Logbook — session-authenticated, session-owner-only (same as garage) ──
  getLogbook: (id) => authedFetch(`${API}/logbook/${id}`),
  postLogEntry: (id, entry) => authedFetch(`${API}/logbook/${id}`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(entry) }),
  addReturnOdometer: (id, entryId, odometerEnd, endCoord) => authedFetch(`${API}/logbook/${id}/${entryId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ odometerEnd, ...(endCoord ? { endCoord } : {}) }) }),
  saveTrail: (id, entryId, trail) => authedFetch(`${API}/logbook/${id}/${entryId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ trail }) }),

  getTrips: () => fetch(`${API}/trips`).then(r => r.json()),
  postTrip: (trip) => authedFetch(`${API}/trips`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(trip) }),
  // Host controls: cancel with a reason, and delete once a run is cancelled or past.
  cancelTrip: (id, reason) => authedFetch(`${API}/trips/${id}/cancel`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ reason }) }),
  deleteTrip: (id) => authedFetch(`${API}/trips/${id}`, { method:"DELETE" }),
  updateTrip: (id, updates) => authedFetch(`${API}/trips/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }),
  // Session 19: dedicated RSVP call — hits worker.js's atomic POST /trips/:id/rsvp
  // rather than updateTrip's whole-object PUT, so concurrent RSVPs from different
  // members can never stomp each other.
  rsvpTrip: (id, status, vehicleId) => authedFetch(`${API}/trips/${id}/rsvp`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ status, vehicleId }) }),
  postReview: (review) => authedFetch(`${API}/reviews`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(review) }),
  postAlert: (alert) => authedFetch(`${API}/alerts`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(alert) }),

  // ── Pro membership — session-authenticated ──
  createCheckout: (planId, successUrl, cancelUrl) => authedFetch(`${API}/create-checkout`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ planId, successUrl, cancelUrl }) }),
  checkoutStatus: (sessionId) => authedFetch(`${API}/checkout-status?session_id=${encodeURIComponent(sessionId)}`),
  // Server re-validates all 6 Pit Pass requirements itself — see worker.js
  // Session 18 note on why this can no longer be a raw PUT /member field.
  activatePitPass: (id) => authedFetch(`${API}/member/${id}/activate-pit-pass`, { method:"POST" }),
  // Redeems ALL eligible 1000-proPoints blocks at once — see worker.js.
  redeemPoints: (id) => authedFetch(`${API}/member/${id}/redeem-points`, { method:"POST" }),
};

// ─── SEED DATA ───────────────────────────────────────────────
const SEED_ROADS = [
  {
    id: 1, name: "Kenilworth–Maleny Road", region: "Sunshine Coast Hinterland", state: "QLD",
    description: "Tight switchbacks through dairy country with sudden panoramas over the Glass House Mountains. One of the finest short drives in SE Queensland.",
    distance: "28km", duration: "35 min",
    startCoords: { lat: -26.5964, lng: 152.7398 }, endCoords: { lat: -26.7616, lng: 152.8638 },
    tags: ["Hinterland", "Twisties", "Views"],
    ratings: { driveability: 4.8, accessibility: 4.2, views: 4.9, surface: 4.0, thrill: 4.5 },
    reviews: 24, busyTimes: ["Sat 10am–2pm", "Sun 9am–1pm", "Public holidays"], alerts: [],
    fuel: ["Kenilworth township (start)", "Maleny Caltex (end)"],
    food: ["Kenilworth Bakery", "Maleny Food Co.", "Terella Farm Café"],
    meetups: ["Maleny Showgrounds", "Kenilworth Pub car park"],
    featured: true, verified: true, addedBy: "scott_cc", addedDate: "2026-03-15",
  },
  {
    id: 2, name: "Bruxner Highway — Gibraltar Range", region: "Northern NSW Ranges", state: "NSW",
    description: "Long sweeping descents through World Heritage rainforest. Cold, misty, utterly empty. Watch for wildlife at dawn and dusk.",
    distance: "186km", duration: "2h 30min",
    startCoords: { lat: -29.0577, lng: 151.9898 }, endCoords: { lat: -29.6842, lng: 152.9337 },
    tags: ["Highway", "Rainforest", "Long Haul"],
    ratings: { driveability: 4.6, accessibility: 4.5, views: 4.7, surface: 3.8, thrill: 4.2 },
    reviews: 41, busyTimes: ["Long weekends", "Easter week"],
    alerts: [{ type: "roadworks", text: "Resurfacing km 34–48, expect 10 min delays" }],
    fuel: ["Tenterfield", "Glen Innes", "Grafton"], food: ["Tenterfield Bakehouse", "Gibraltar Range NP picnic"],
    meetups: ["Gibraltar Range rest area"], featured: false, verified: true,
    addedBy: "scott_cc", addedDate: "2026-03-20",
  },
  {
    id: 3, name: "Tasmanian Highland Lakes Road", region: "Central Highlands", state: "TAS",
    description: "Desolate, otherworldly plateau driving through buttongrass moorland. Nothing else in Australia looks like this.",
    distance: "112km", duration: "1h 45min",
    startCoords: { lat: -41.9027, lng: 146.7197 }, endCoords: { lat: -41.5392, lng: 146.2308 },
    tags: ["Highland", "Remote", "Scenic"],
    ratings: { driveability: 4.1, accessibility: 3.2, views: 5.0, surface: 3.3, thrill: 4.6 },
    reviews: 67, busyTimes: ["Dec–Feb peak", "Easter"],
    alerts: [{ type: "seasonal", text: "Snow possible Jun–Sep. Check TasRoads before departure." }],
    fuel: ["Bothwell (south)", "Deloraine (north) — NO FUEL ON ROAD"],
    food: ["Bothwell General Store", "Pack your own"], meetups: ["Arthurs Lake dam wall"],
    featured: true, verified: true, addedBy: "scott_cc", addedDate: "2026-04-01",
  },
  {
    id: 4, name: "Old Pacific Highway — Peats Ridge to Calga", region: "Central Coast / Hawkesbury", state: "NSW",
    description: "The spiritual home of Sydney Sunday drivers. Ridge-top runs, valley views. Weekdays it's all yours.",
    distance: "52km", duration: "55 min",
    startCoords: { lat: -33.3094, lng: 151.1842 }, endCoords: { lat: -33.4729, lng: 151.2433 },
    tags: ["Classic", "Weekend Run", "Bikes Welcome"],
    ratings: { driveability: 4.9, accessibility: 4.7, views: 4.3, surface: 4.2, thrill: 4.8 },
    reviews: 189, busyTimes: ["Sat & Sun 8am–12pm", "School holidays"],
    alerts: [], fuel: ["Calga servo", "Peats Ridge BP"],
    food: ["Pie in the Sky (Calga)", "Peats Ridge General Store"], meetups: ["Pie in the Sky car park"],
    featured: true, verified: true, addedBy: "scott_cc", addedDate: "2026-04-10",
  },
];

// ─── PIT PASS CONFIG ─────────────────────────────────────────
const PIT_PASS_DAYS = 7;
const PIT_PASS_REQUIREMENTS = [
  { id: "avatar",   label: "Profile photo uploaded",        check: m => !!m.avatar },
  { id: "bio",      label: "Bio completed",                 check: m => m.bio?.length > 10 },
  { id: "location", label: "Location added",                check: m => m.location?.length > 2 },
  { id: "fastmoney",label: "At least one Fast Money answer",check: m => Object.keys(m.fastMoney||{}).length >= 1 },
  { id: "vehicle",  label: "Vehicle added to garage",       check: m => m.garage?.length >= 1 },
  { id: "vphoto",   label: "Vehicle photo uploaded",        check: m => m.garage?.some(v => (v.photos||[]).length > 0) },
];

const checkPitPass = member => PIT_PASS_REQUIREMENTS.every(r => r.check(member));
const pitPassProgress = member => PIT_PASS_REQUIREMENTS.filter(r => r.check(member)).length;

const PitPassBanner = ({ member, onDismiss }) => {
  const completed = checkPitPass(member);
  const progress = pitPassProgress(member);
  const total = PIT_PASS_REQUIREMENTS.length;
  const pct = Math.round((progress / total) * 100);

  if (member.pitPassActivated) {
    const expiry = new Date(member.pitPassActivated);
    expiry.setDate(expiry.getDate() + PIT_PASS_DAYS);
    const daysLeft = Math.ceil((expiry - Date.now()) / 86400000);
    if (daysLeft <= 0) return null;
    return (
      <div style={{ margin:"0 0 0 0", padding:"10px 16px", background:`linear-gradient(135deg, ${C.champagne}22, ${C.champagne}08)`, borderBottom:`1px solid ${C.champagne}44`, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:20 }}>🎟</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, color:C.champagne, fontWeight:700 }}>Pit Pass Active — {daysLeft} day{daysLeft!==1?"s":""} remaining</div>
          <div style={{ fontSize:10, color:C.dim, marginTop:1 }}>Full Pro access. Upgrade before it expires to keep everything.</div>
        </div>
      </div>
    );
  }

  if (completed && !member.pitPassActivated) {
    return (
      <div style={{ margin:"0 0 0 0", padding:"12px 16px", background:`linear-gradient(135deg, ${C.champagne}33, ${C.champagne}11)`, borderBottom:`1px solid ${C.champagne}66`, display:"flex", alignItems:"center", gap:10 }}>
        <span style={{ fontSize:24 }}>🎟</span>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, color:C.champagne, fontWeight:700 }}>Pit Pass Unlocked!</div>
          <div style={{ fontSize:11, color:"#ccc", marginTop:2 }}>Complete your profile for 7 days of full Pro access — free.</div>
        </div>
        <button onClick={onDismiss} style={{ background:`linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})`, border:"none", borderRadius:8, padding:"8px 14px", color:C.midnight, fontFamily:"'Josefin Sans', sans-serif", fontSize:11, fontWeight:700, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em", flexShrink:0 }}>
          Activate
        </button>
      </div>
    );
  }

  return null;
};

const PitPassProgress = ({ member }) => {
  const progress = pitPassProgress(member);
  const total = PIT_PASS_REQUIREMENTS.length;
  const pct = Math.round((progress / total) * 100);
  if (checkPitPass(member) || member.pitPassActivated) return null;
  return (
    <div style={{ background:`${C.champagne}0a`, border:`1px solid ${C.champagne}33`, borderRadius:12, padding:16, marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
        <div>
          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne }}>🎟 Pit Pass — {PIT_PASS_DAYS} Days Free Pro</div>
          <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>Complete your profile to unlock full access</div>
        </div>
        <div style={{ fontSize:13, color:C.champagne, fontWeight:700 }}>{progress}/{total}</div>
      </div>
      <div style={{ height:4, background:"#1e1e1e", borderRadius:2, marginBottom:12 }}>
        <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg, ${C.champagne}, ${C.champagneLight})`, borderRadius:2, transition:"width 0.4s ease" }} />
      </div>
      {PIT_PASS_REQUIREMENTS.map(req => {
        const done = req.check(member);
        return (
          <div key={req.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"5px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:done?C.champagne:"#1a1a1a", border:`2px solid ${done?C.champagne:C.border2}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              {done && <span style={{ fontSize:10, color:C.midnight }}>✓</span>}
            </div>
            <div style={{ fontSize:12, color:done?C.bone:C.dim }}>{req.label}</div>
          </div>
        );
      })}
    </div>
  );
};

// ─── PRO MEMBERSHIP ─────────────────────────────────────────
// Mirrors worker.js's PRO_PLANS / isMemberPro exactly — keep both in sync
// if pricing or the Pit Pass window ever changes. Pro gates: Trip
// Postcards, Logbook (which is where Postcards are generated from), and
// TGM (not live yet, nothing to gate). Garage stays free but capped at 1
// vehicle — that cap is enforced server-side in PUT /garage/:id, not
// here; this file only decides what UI to show. Add Roads is deliberately
// NOT gated (was briefly gated this session, then corrected) — add_road
// pays the most points of any action specifically so free users have a
// real path toward earning free Pro months; gating the action that earns
// them would defeat that. The actual points-for-Pro redemption isn't
// built yet — see handoff.md.
// Deliberately no lifetime tier on the public checkout — Scott wants this
// app on a longer-term-subscription-shaped model given the opt-in
// process, not a one-and-done. isMemberPro still checks proLifetime,
// since worker.js's /admin/grant-pro can still comp one (Scott, beta
// testers) — it's just never a purchasable option here.
const PRO_PLANS = {
  month1:  { label: "1 Month",   price: "US$2.99",  amount: 299,  days: 30 },
  month6:  { label: "6 Months",  price: "US$11.99", amount: 1199, days: 180 },
  month12: { label: "12 Months", price: "US$19.99", amount: 1999, days: 365 },
};

// Points → free Pro redemption — mirrors worker.js's POINTS_PER_PRO_MONTH.
// Spends member.proPoints (separate running balance, never member.points —
// see worker.js's awardPoints() for why). Deliberately not promoted
// anywhere except a plain line in the Points tab — see ProfileView below.
const POINTS_PER_PRO_MONTH = 1000;

const isMemberPro = member => {
  if (!member) return false;
  if (member.proLifetime) return true;
  if (member.proExpiresAt && Date.now() < member.proExpiresAt) return true;
  if (member.pitPassActivated) {
    const activatedMs = new Date(member.pitPassActivated).getTime();
    if (Number.isFinite(activatedMs) && Date.now() < activatedMs + PIT_PASS_DAYS * 86400000) return true;
  }
  return false;
};

const proStatusLabel = member => {
  if (!member) return "Free";
  if (member.proLifetime) return "Pro — Lifetime";
  if (member.proExpiresAt && Date.now() < member.proExpiresAt) {
    const daysLeft = Math.max(1, Math.ceil((member.proExpiresAt - Date.now()) / 86400000));
    return `Pro — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
  }
  if (member.pitPassActivated) {
    const activatedMs = new Date(member.pitPassActivated).getTime();
    const expiry = activatedMs + PIT_PASS_DAYS * 86400000;
    if (Number.isFinite(activatedMs) && Date.now() < expiry) {
      const daysLeft = Math.max(1, Math.ceil((expiry - Date.now()) / 86400000));
      return `Pit Pass — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`;
    }
  }
  return "Free";
};

// Full-screen prompt swapped in for a Pro-gated screen (Logbook today —
// Trip Postcards live inside it, so gating the screen covers both).
const ProUpsell = ({ feature, description, onUpgrade }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", padding:40, textAlign:"center" }}>
    <div style={{ fontSize:36, marginBottom:14 }}>🔒</div>
    <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:20, color:C.champagne, marginBottom:8 }}>{feature} is a Pro feature</div>
    <div style={{ fontSize:13, color:C.dim, maxWidth:280, lineHeight:1.6, marginBottom:20 }}>{description}</div>
    <Btn onClick={onUpgrade}>Upgrade to Pro</Btn>
  </div>
);

// Pricing / checkout modal. Hosted Stripe Checkout, same redirect pattern
// as Mic Drop and Cult Connections — no Stripe.js needed, /create-checkout
// returns a session.url and this just navigates the tab there.
const UpgradeModal = ({ onClose }) => {
  const [loadingPlan, setLoadingPlan] = useState(null);
  const [error, setError] = useState("");

  const startCheckout = async (planId) => {
    setError("");
    setLoadingPlan(planId);
    try {
      const base = `${window.location.origin}${window.location.pathname}`;
      const res = await authedFetch(`${API}/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          // Stripe substitutes {CHECKOUT_SESSION_ID} itself — app.js reads
          // it back on return to self-heal via /checkout-status in case
          // the webhook hasn't landed yet (see App's payment-return effect).
          successUrl: `${base}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${base}?payment=cancelled`,
        }),
      });
      if (res?.error || !res?.url) throw new Error(res?.error || "Could not start checkout");
      window.location.href = res.url;
    } catch (e) {
      setError(e.message || "Something went wrong — try again");
      setLoadingPlan(null);
    }
  };

  return (
    <Modal title="Chasin' Curves Pro" subtitle="Trip Postcards · Logbook · Unlimited vehicles" onClose={onClose}>
      <div style={{ fontSize:12, color:C.dim, lineHeight:1.6, marginBottom:16 }}>
        One-time payment, no auto-renewal. The Garage stays free (1 vehicle) either way.
      </div>
      {Object.entries(PRO_PLANS).map(([id, plan]) => (
        <div key={id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", border:`1px solid ${C.border}`, borderRadius:10, marginBottom:10 }}>
          <div>
            <div style={{ fontSize:14, color:C.bone, fontWeight:600 }}>{plan.label}</div>
            <div style={{ fontSize:11, color:C.dim }}>{plan.price} one-time</div>
          </div>
          <Btn size="sm" onClick={() => startCheckout(id)} disabled={loadingPlan !== null}>
            {loadingPlan === id ? "Redirecting…" : "Select"}
          </Btn>
        </div>
      ))}
      {error && <div style={{ fontSize:12, color:C.red, marginTop:6 }}>{error}</div>}
    </Modal>
  );
};

// Banner shown once on return from Stripe Checkout — same visual language
// as TripSavedNotice. See App's payment-return effect for when this fires.
const PaymentNotice = ({ notice, onDismiss }) => {
  if (!notice) return null;
  const isError = notice.type === "error";
  const isCancelled = notice.type === "cancelled";
  const color = isError ? C.red : C.champagne;
  const icon = isCancelled ? "↩️" : isError ? "⚠️" : "✅";
  return (
    <div style={{ padding: "10px 16px", background: `${color}15`, borderBottom: `1px solid ${color}44`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0, fontSize: 12, color, fontWeight: 700 }}>{notice.message}</div>
      <Btn size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Btn>
    </div>
  );
};

// SEED_MEMBERS kept only for TripPlanner display (trip organiser lookup) — never used for init
const SEED_MEMBERS = [
  {
    id: "scott_cc", username: "scott_cc", displayName: "Scott", location: "Mount Mellum, QLD",
    bio: "25 years on the rail network. Now chasing curves instead of coal trains. Roads, rivers & riffs.",
    avatar: null, joinDate: "2026-03-01",
    points: 0, pointsExpiry: [], tier: "Explorer",
    garage: [],
    roadsAdded: [], reviewsWritten: 0, tripsPlanned: 0,
  },
];

// ─── POINT SYSTEM CONFIG ─────────────────────────────────────
const POINT_ACTIONS = {
  add_road: { points: 100, label: "Road Added", icon: "🛣" },
  write_review: { points: 30, label: "Review Written", icon: "✍️" },
  rate_road: { points: 10, label: "Road Rated", icon: "⭐" },
  plan_trip: { points: 20, label: "Trip Planned", icon: "📍" },
  upload_photo: { points: 15, label: "Photo Uploaded", icon: "📸" },
  add_vehicle: { points: 50, label: "Vehicle Added", icon: "🚗" },
  report_alert: { points: 25, label: "Alert Reported", icon: "⚠️" },
  daily_login: { points: 5, label: "Daily Login", icon: "🔑" },
  log_trip: { points: 5, label: "Trip Logged", icon: "📋" },
};

// ─── LOGBOOK / DAY-CAP CONFIG ────────────────────────────────
// Murphy Report & Logbook spec, 21 Aug 2026 — phase 1 (Logbook only, per
// the master build plan): general-use day-cap tracking, no club events yet.
//
// QLD/WA run on the event-attendance model — no day cap exists at all, so
// they're deliberately absent from the cap tables below. VIC/SA/TAS are
// pure day-cap. NSW/ACT/NT are hybrid (day cap + separate unlimited club
// events) but only the day-cap half is built this phase.
// TAS/NT exact caps weren't confirmed in the research pass (open item in
// the spec) — also absent, so those vehicles just log entries with no cap
// bar shown until the real numbers are confirmed, rather than guessing.
const REGO_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"];
const NO_CAP_STATES = ["QLD", "WA"];
// NT confirmed 24 Aug via the NT Motor Vehicle Enthusiast Club Registration
// Scheme Guidelines (Section 7 / Condition 10): 90 days total, split 60 for
// approved club events + 30 for maintenance/test-driving/personal use — only
// the personal-use 30 is this app's day-cap half, since club-event entries
// aren't tracked yet (see the hybrid-state note above). TAS confirmed via
// the Special Interest Vehicle scheme guidelines (effective 1 Dec 2025,
// replacing the old separate historic/vintage/street rod schemes): 104
// days, all classes, no separate uncapped club-event carve-out — genuinely
// pure day-cap, same shape as VIC/SA.
const FIXED_DAY_CAPS = { NSW: 60, ACT: 60, SA: 90, NT: 30, TAS: 104 }; // VIC is vehicle-specific, see below
const VIC_DAY_CAP_OPTIONS = [45, 90];

// VIC registers a vehicle against 45 OR 90 days, owner's choice — stored
// per-vehicle as vicDayCap, defaulting to the more common 90 if unset.
const dayCapFor = vehicle => {
  if (!vehicle?.regoState) return null;
  if (vehicle.regoState === "VIC") return vehicle.vicDayCap || 90;
  return FIXED_DAY_CAPS[vehicle.regoState] || null;
};

// Which states anchor their day-cap "year" to the vehicle's own registration
// commencement/renewal date, rather than counting back over a rolling
// trailing window. Confirmed for NT straight from its official guidelines
// ("...in the 12 month period from commencement date of the current
// registration period"). Every other state defaults to the rolling model
// below — that's still an unconfirmed assumption for most of them
// (NSW/ACT/SA/VIC/TAS), carried over from the original spec, not a proven
// fact. TAS in particular just had its whole scheme rewritten (1 Dec 2025)
// and its guidelines never say how the 12-month period is measured, so
// rolling is the conservative default there — it can only ever be as
// permissive or stricter than a real anchored reading, never more lenient —
// not a confirmed answer. Add a state here only once its own guideline text
// is read and says so, the way NT's did.
const ANCHORED_WINDOW_STATES = ["NT"];

// Rolling 365-day trailing window — the conservative default for every
// state not listed in ANCHORED_WINDOW_STATES above.
const ROLLING_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;
const rollingDayCount = (entries, vehicleId) => {
  const cutoff = Date.now() - ROLLING_WINDOW_MS;
  const days = new Set(
    (entries || [])
      .filter(e => e.vehicleId === vehicleId && e.entryType === "general_use" && e.timestamp >= cutoff)
      .map(e => new Date(e.timestamp).toDateString())
  );
  return days.size;
};

// Anchored-window counter for states like NT: finds the most recent
// anniversary of the vehicle's own regoAnniversary date on or before today,
// then counts distinct use-days from that anniversary forward. The count
// hard-resets to zero the moment a new registration period begins, exactly
// as NT's guidelines describe it — no memory of days used before the reset.
const mostRecentAnniversary = (anchorDateStr, today = new Date()) => {
  if (!anchorDateStr) return null;
  const anchor = new Date(anchorDateStr);
  if (isNaN(anchor.getTime())) return null;
  const candidate = new Date(today.getFullYear(), anchor.getMonth(), anchor.getDate());
  if (candidate.getTime() > today.getTime()) candidate.setFullYear(candidate.getFullYear() - 1);
  return candidate;
};

const anchoredDayCount = (entries, vehicleId, anchorDateStr) => {
  const periodStart = mostRecentAnniversary(anchorDateStr);
  if (!periodStart) return null; // no rego date on file yet — can't anchor a count to nothing
  const cutoff = periodStart.getTime();
  const days = new Set(
    (entries || [])
      .filter(e => e.vehicleId === vehicleId && e.entryType === "general_use" && e.timestamp >= cutoff)
      .map(e => new Date(e.timestamp).toDateString())
  );
  return days.size;
};

// Single dispatcher every screen calls instead of picking a counter itself —
// the vehicle's own regoState is the only thing that decides which model
// runs, so there's no separate toggle that could drift out of sync with it.
// Both counters stay live in the codebase side by side; reclassifying a
// state (the way NT just moved from "unconfirmed" to "anchored") is a
// one-line change to ANCHORED_WINDOW_STATES above, not a rewrite of either
// function. Returns null (distinct from 0) when an anchored state has no
// regoAnniversary set yet — that's a "needs setup" state, not "zero days used".
const dayCountFor = (vehicle, entries) => {
  if (!vehicle?.regoState) return null;
  if (ANCHORED_WINDOW_STATES.includes(vehicle.regoState)) {
    return anchoredDayCount(entries, vehicle.id, vehicle.regoAnniversary);
  }
  return rollingDayCount(entries, vehicle.id);
};

// ─── GPS SNAIL TRAIL ─────────────────────────────────────────
// Master build plan step 2: opt-in-per-trip GPS trail, attached to the
// same Use Entry the Logbook already writes — no separate table. This is
// a browser tab, not an installed native app, so tracking only runs while
// Chasin' Curves is the open, active tab; the phone locking or the user
// switching to Waze will pause it. The in-app copy says this outright
// rather than implying background capability the app can't back.
const GPS_POLL_INTERVAL_MS = 20000; // mid-point of the spec's 10–30s range
const MAX_TRAIL_POINTS = 1500; // matches the worker's cap — generous, not unbounded
const ACTIVE_TRIP_KEY = "cc_active_trip"; // local-first: survives a reload mid-trip
const ROAD_DRAFT_KEY = "cc_road_draft"; // Session 17: same reasoning — a lost AddRoadModal form is exactly this failure mode

const getStoredRoadDraft = (userId) => {
  try {
    const raw = JSON.parse(localStorage.getItem(ROAD_DRAFT_KEY) || "null");
    // Scoped to the user who started it — a shared/borrowed device
    // shouldn't surface someone else's half-finished road.
    return raw && raw.userId === userId ? raw : null;
  } catch { return null; }
};
const setStoredRoadDraft = (userId, draft) => {
  try {
    if (draft) localStorage.setItem(ROAD_DRAFT_KEY, JSON.stringify({ userId, ...draft, savedAt: Date.now() }));
    else localStorage.removeItem(ROAD_DRAFT_KEY);
  } catch { /* storage unavailable — form still works for this session, just unprotected */ }
};

const getStoredActiveTrip = () => {
  try { return JSON.parse(localStorage.getItem(ACTIVE_TRIP_KEY) || "null"); }
  catch { return null; }
};
const setStoredActiveTrip = (trip) => {
  try {
    if (trip) localStorage.setItem(ACTIVE_TRIP_KEY, JSON.stringify(trip));
    else localStorage.removeItem(ACTIVE_TRIP_KEY);
  } catch { /* storage unavailable — recording still works for this tab session */ }
};

// One GPS fix, resolved to null (never rejected) on any failure so a
// denied permission or a timeout just means "this poll got no point",
// not a crashed trip.
//
// Session 16i: `label`, when given, logs WHY a fix failed. Added after a
// real beta day where every single trip — laptop and phone, "Log Trip
// Now" and "+ Return Odo" alike — came back with no startCoord/endCoord
// at all, and the app itself gave no clue why: this poller has always
// swallowed failures completely silently, so "it didn't work" was
// genuinely unanswerable without instrumentation. Deliberately opt-in per
// call site: the continuous GPS Trail poller below still calls this
// unlabeled and stays silent, since it already tolerates missed polls by
// design and would otherwise spam the console with the same warning
// every ~20s for an entire multi-hour drive with patchy signal. The two
// one-off fixes (trip start, trip finish) pass a label and are the ones
// actually worth seeing fail.
const pollGpsPoint = (label) => new Promise(resolve => {
  if (!navigator.geolocation) {
    if (label) console.warn(`[Chasin' Curves] ${label}: geolocation isn't available in this browser.`);
    resolve(null);
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() }),
    (err) => {
      if (label) {
        const reason = err?.code === 1 ? "permission denied — check this site's Location setting in your browser/device"
          : err?.code === 2 ? "position unavailable — check that Location/GPS is turned on for this device and browser"
          : err?.code === 3 ? "timed out waiting for a fix"
          : (err?.message || "unknown error");
        console.warn(`[Chasin' Curves] ${label}: GPS fix failed (${reason}).`, err);
      }
      resolve(null);
    },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
  );
});

const TIERS = [
  { name: "Explorer", min: 0, max: 199, color: C.muted, icon: "🗺" },
  { name: "Rover", min: 200, max: 499, color: C.blue, icon: "🚗" },
  { name: "Chaser", min: 500, max: 999, color: C.champagne, icon: "🏁" },
  { name: "Pioneer", min: 1000, max: 1999, color: "#9b59b6", icon: "⚡" },
  { name: "Legend", min: 2000, max: Infinity, color: C.red, icon: "👑" },
];

const POINT_EXPIRY_DAYS = 90;

// ─── UTILITIES ───────────────────────────────────────────────
// ─── INTERNATIONAL ROADS ─────────────────────────────────────
// Roads without a `country` are Australian (all existing roads). Overseas
// roads carry country: "CH" etc. and no state. roadPlace() is the label
// used for badges and for the filter chips (AU state code, or country name).
const COUNTRIES = {
  AU: "Australia", NZ: "New Zealand", CH: "Switzerland", IT: "Italy",
  FR: "France", DE: "Germany", AT: "Austria", ES: "Spain", PT: "Portugal",
  IE: "Ireland", GB: "United Kingdom", RO: "Romania", NO: "Norway",
  US: "United States", CA: "Canada", JP: "Japan", ZA: "South Africa",
};
const roadCountry = r => r.country || "AU";
const isAU = r => roadCountry(r) === "AU";
const roadPlace = r => isAU(r) ? r.state : (COUNTRIES[roadCountry(r)] || roadCountry(r));
// Curated roads start unrated (ratings: null) until members review them.
const hasRatings = r => !!r.ratings && Object.keys(r.ratings).length > 0;

const avgRating = r => {
  const vals = Object.values(r.ratings || {});
  if (!vals.length) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const getTier = pts => TIERS.find(t => pts >= t.min && pts <= t.max) || TIERS[0];

const fmtDate = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

// Session 16c — traced from a real Cloudflare Worker log on a beta tester's
// "trip disappeared" report: her user-agent carried Facebook's FBAN/FBIOS
// markers, meaning she was inside Facebook's in-app WebView, not standalone
// Safari. These embedded browsers are well documented to evict
// localStorage aggressively (especially once the host app backgrounds),
// don't reliably hold a geolocation permission grant for the page's whole
// life, and on iOS don't implement the Screen Wake Lock API at all — any
// one of those can silently kill a trail mid-recording. There's no
// reliable way to force an escape to the real browser from JS, so this
// only detects and warns; the fix is the tester leaving manually.
const IN_APP_BROWSER_SIGNATURES = [
  { test: /FBAN|FBAV|FBIOS|FB_IAB/i, name: "Facebook" },
  { test: /Instagram/i, name: "Instagram" },
  { test: /\bLine\//i, name: "Line" },
  { test: /MicroMessenger/i, name: "WeChat" },
];
const detectInAppBrowser = () => {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const hit = IN_APP_BROWSER_SIGNATURES.find(sig => sig.test.test(ua));
  return hit ? hit.name : null;
};

// ─── SHARED COMPONENTS ───────────────────────────────────────

const Btn = ({ children, onClick, variant = "primary", size = "md", style: sx = {}, disabled }) => {
  const base = {
    border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'Josefin Sans', sans-serif", textTransform: "uppercase",
    letterSpacing: "0.08em", fontWeight: 700, transition: "opacity 0.15s",
    opacity: disabled ? 0.4 : 1,
    padding: size === "sm" ? "5px 12px" : size === "lg" ? "12px 28px" : "8px 18px",
    fontSize: size === "sm" ? 11 : size === "lg" ? 14 : 12,
  };
  const variants = {
    primary: { background: `linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})`, color: C.midnight },
    ghost: { background: "none", border: `1px solid ${C.border2}`, color: C.muted },
    danger: { background: "none", border: `1px solid ${C.red}`, color: C.red },
    blue: { background: C.blueDim, border: `1px solid ${C.blue}`, color: C.blue },
  };
  return <button onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant], ...sx }}>{children}</button>;
};

const Input = ({ label, value, onChange, placeholder, type = "text", multiline, rows = 3, style: sx = {} }) => {
  const inputStyle = {
    width: "100%", background: "#0f0f0f", border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 12px", color: C.bone, fontSize: 13,
    fontFamily: "'Josefin Sans', sans-serif", outline: "none",
  };
  return (
    <div style={{ marginBottom: 14 }}>
      {label && <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{label}</div>}
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inputStyle, resize: "vertical", ...sx }} />
        : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, ...sx }} />
      }
    </div>
  );
};

// Registration state + (for VIC) chosen day-cap scheme — this is what lets
// the Logbook work out which cap, if any, applies to a vehicle. Shared
// between the Add Vehicle form and the VehicleDetail edit block so existing
// vehicles (added before this field existed) can be brought up to date.
const RegoStateField = ({ vehicle, onChange }) => {
  const selectStyle = {
    width: "100%", background: "#0f0f0f", border: `1px solid ${C.border}`,
    borderRadius: 6, padding: "8px 12px", color: C.bone, fontSize: 13,
    fontFamily: "'Josefin Sans', sans-serif", outline: "none",
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Registration State</div>
      <select value={vehicle.regoState || ""} onChange={e => onChange({ regoState: e.target.value })} style={selectStyle}>
        <option value="">Not set — Logbook won't track a day cap yet</option>
        {REGO_STATES.map(s => <option key={s} value={s}>{s}{NO_CAP_STATES.includes(s) ? " — event-based, no day cap" : ""}</option>)}
      </select>
      {vehicle.regoState === "VIC" && (
        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          {VIC_DAY_CAP_OPTIONS.map(days => (
            <button key={days} type="button" onClick={() => onChange({ vicDayCap: days })}
              style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: "1px solid", borderColor: (vehicle.vicDayCap || 90) === days ? C.champagne : C.border2, background: (vehicle.vicDayCap || 90) === days ? C.champagneDim : "none", color: (vehicle.vicDayCap || 90) === days ? C.champagne : C.dim, fontSize: 11, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "'Josefin Sans', sans-serif" }}>
              {days}-day scheme
            </button>
          ))}
        </div>
      )}
      {ANCHORED_WINDOW_STATES.includes(vehicle.regoState) && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Registration renewal date</div>
          <input type="date" value={vehicle.regoAnniversary || ""} onChange={e => onChange({ regoAnniversary: e.target.value })} style={selectStyle} />
          <div style={{ fontSize: 10, color: C.dim, marginTop: 5, lineHeight: 1.5 }}>
            {vehicle.regoState} resets its day count on this date each year, not on a rolling 365-day window — needed to track it correctly.
          </div>
        </div>
      )}
    </div>
  );
};

const StarRating = ({ value, size = 13 }) => {
  const full = Math.floor(value), partial = value % 1;
  return (
    <span style={{ display: "inline-flex", gap: 1 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i} style={{ position: "relative", width: size, height: size, display: "inline-block" }}>
          <svg viewBox="0 0 20 20" width={size} height={size} style={{ position: "absolute" }}>
            <polygon points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7" fill="#1a1a1a" />
          </svg>
          <svg viewBox="0 0 20 20" width={size} height={size} style={{ position: "absolute", clipPath: i < full ? "inset(0)" : i === full ? `inset(0 ${100 - partial * 100}% 0 0)` : "inset(0 100% 0 0)" }}>
            <polygon points="10,1 12.9,7 19.5,7.6 14.5,12 16.2,18.5 10,15 3.8,18.5 5.5,12 0.5,7.6 7.1,7" fill={C.champagne} />
          </svg>
        </span>
      ))}
    </span>
  );
};

const RatingBar = ({ label, value }) => (
  <div style={{ marginBottom: 8 }}>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</span>
      <span style={{ fontSize: 12, color: C.champagne, fontWeight: 600 }}>{value.toFixed(1)}</span>
    </div>
    <div style={{ height: 3, background: "#1e1e1e", borderRadius: 2 }}>
      <div style={{ height: "100%", width: `${(value / 5) * 100}%`, background: `linear-gradient(90deg, ${C.champagne}, ${C.champagneLight})`, borderRadius: 2 }} />
    </div>
  </div>
);

const Badge = ({ children, color = C.champagne }) => (
  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 20, background: `${color}22`, color, textTransform: "uppercase", letterSpacing: "0.1em", border: `1px solid ${color}40` }}>
    {children}
  </span>
);

const Modal = ({ title, subtitle, onClose, children, wide }) => (
  <div style={{ position: "fixed", inset: 0, background: "#000c", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div style={{ background: C.midnight, border: `1px solid ${C.border}`, borderRadius: 12, width: "100%", maxWidth: wide ? 700 : 520, maxHeight: "88vh", overflowY: "auto", padding: 28 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.champagne, fontWeight: 600 }}>{title}</div>
          {subtitle && <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>{subtitle}</div>}
        </div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: C.dim, fontSize: 20, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const VehicleAvatar = ({ vehicle, size = 44, selected, onClick }) => {
  const initials = `${vehicle.make[0]}${vehicle.model[0]}`;
  const colours = { "Imola Red": C.red, "Champagne": C.champagne, "Midnight Black": "#444", default: C.blue };
  const bg = colours[vehicle.colour] || colours.default;
  return (
    <div onClick={onClick} title={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
      style={{
        width: size, height: size, borderRadius: "50%", background: vehicle.avatar ? "none" : `${bg}33`,
        border: `2px solid ${selected ? C.champagne : bg}`, display: "flex", alignItems: "center",
        justifyContent: "center", cursor: onClick ? "pointer" : "default", flexShrink: 0,
        boxShadow: selected ? `0 0 12px ${C.champagne}66` : "none", transition: "all 0.2s",
        overflow: "hidden", position: "relative",
      }}>
      {vehicle.avatar
        ? <img src={vehicle.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <span style={{ fontSize: size * 0.3, color: bg, fontWeight: 700 }}>{initials}</span>
      }
      {vehicle.primary && size >= 40 && (
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 14, height: 14, background: C.champagne, borderRadius: "50%", border: `2px solid ${C.midnight}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7 }}>★</div>
      )}
    </div>
  );
};

const PointsBadge = ({ pts, style: sx }) => {
  const tier = getTier(pts);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", background: `${tier.color}18`, border: `1px solid ${tier.color}44`, borderRadius: 20, ...sx }}>
      <span style={{ fontSize: 13 }}>{tier.icon}</span>
      <span style={{ fontSize: 11, color: tier.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>{tier.name}</span>
      <span style={{ fontSize: 11, color: C.muted }}>· {pts.toLocaleString()} pts</span>
    </div>
  );
};

// ─── MAP COMPONENT ───────────────────────────────────────────
// v3.1: Mapbox foundation — real pan/zoom map replaces the hand-drawn SVG strip.
// Get a public token from mapbox.com/account and paste it below, restricted
// (Tokens → your token → URL restrictions) to your live domain before this
// goes public — e.g. https://scvd-app.github.io/*
// Brand styling is a first pass (paint-property overrides on dark-v11) —
// worth a proper Mapbox Studio style later for a tighter match to the
// Midnight/Champagne palette. Viewport-driven road list (replacing the
// state filter buttons) is deliberately NOT in this pass — foundation only.
const MAPBOX_TOKEN = "pk.eyJ1Ijoic2N2ZCIsImEiOiJjbXMzOHB1eXUwMzRjMzVvYm0ya29wYTZ1In0.FlTd5i3zPj5W7E57UaH5gw";

// Session 30: map flyover timing — see the effect in MapView that uses them.
// Flight time = FLY_MIN_MS + distance(km) × FLY_MS_PER_KM, capped at
// FLY_MAX_MS. With these numbers a 100km hop takes ~1.8s and Sunshine Coast
// → Switzerland (~16,000km) hits the 6.5s cap. Bump FLY_MAX_MS / FLY_MS_PER_KM
// for a slower flight, lower them for a snappier one.
const FLY_MIN_MS = 1800;
const FLY_MAX_MS = 6500;
const FLY_MS_PER_KM = 0.45;

const MapView = ({ roads, selected, onSelect, trips, currentUser }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const roadMarkersRef = useRef([]);
  const tripMarkersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const lastWasIntl = useRef(false);

  // Init map once
  useEffect(() => {
    if (mapRef.current) return;
    if (!window.mapboxgl || MAPBOX_TOKEN.includes("PASTE_YOUR")) {
      setMapFailed(true);
      return;
    }
    window.mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new window.mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [148, -30], // Eastern Australia
      zoom: 4,
      attributionControl: false,
    });
    map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new window.mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      // Brand-tint pass — approximate only, refine via Mapbox Studio later.
      // Layer IDs vary between style versions, so each is wrapped individually.
      const tint = (layer, prop, value) => { try { map.setPaintProperty(layer, prop, value); } catch {} };
      tint("water", "fill-color", "#0d1620");
      tint("land", "background-color", C.midnight);
      tint("national-park", "fill-color", "#12160f");

      mapRef.current = map;
      setMapReady(true);
    });

    map.on("error", () => setMapFailed(true));

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // Road pin markers — rebuilt whenever roads or the selection changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    roadMarkersRef.current.forEach(m => m.remove());
    roadMarkersRef.current = [];

    roads.forEach(r => {
      if (!r.startCoords) return;
      const isSelected = selected?.id === r.id;
      const el = document.createElement("div");
      const size = isSelected ? 18 : 12;
      el.style.cssText = `width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);cursor:pointer;transition:all .15s;background:${r.alerts?.length ? C.red : isSelected ? C.champagne : `${C.champagne}aa`};border:2px solid ${isSelected ? "#fff" : C.champagne};${isSelected ? `box-shadow:0 0 12px ${C.champagne}88;` : ""}`;
      el.addEventListener("click", () => onSelect(r));

      const marker = new window.mapboxgl.Marker({ element: el, anchor: "bottom" })
        .setLngLat([r.startCoords.lng, r.startCoords.lat])
        .addTo(map);
      roadMarkersRef.current.push(marker);
    });
  }, [roads, selected, mapReady]);

  // Overseas roads: fly the map there on select, and come home to Eastern
  // Australia when an Australian road is picked afterwards. Australian
  // selections otherwise leave the map exactly where the member put it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !selected?.startCoords) return;
    const intl = !isAU(selected);
    // Session 30: the flight used to be a flat 1.6s whether the road was
    // 100km away or on the other side of the planet, so Sunshine Coast →
    // Furka Pass flashed past. Flight time now scales with the distance to
    // fly (see the FLY_* numbers at the top of this file to tune it), and a
    // slightly bigger zoom-out curve makes a long hop read as a journey.
    const flyTo = (lng, lat, zoom) => {
      const from = map.getCenter();
      const km = haversineKm(from.lat, from.lng, lat, lng);
      const duration = Math.round(Math.min(FLY_MAX_MS, FLY_MIN_MS + km * FLY_MS_PER_KM));
      map.flyTo({ center: [lng, lat], zoom, duration, curve: 1.6 });
    };
    if (intl) {
      flyTo(selected.startCoords.lng, selected.startCoords.lat, 8);
    } else if (lastWasIntl.current) {
      flyTo(148, -30, 4);
    }
    lastWasIntl.current = intl;
  }, [selected, mapReady]);

  // Trip vehicle-avatar markers — reuses the existing VehicleAvatar component
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    tripMarkersRef.current.forEach(({ marker, root }) => { root.unmount(); marker.remove(); });
    tripMarkersRef.current = [];

    trips.forEach(t => (t.routes || []).forEach(rid => {
      const road = roads.find(r => r.id === rid);
      if (!road?.startCoords) return;
      const member = SEED_MEMBERS.find(m => m.id === t.createdBy);
      const vehicle = member?.garage.find(v => v.id === t.vehicleId);
      if (!vehicle) return;

      const el = document.createElement("div");
      const root = ReactDOM.createRoot(el);
      root.render(<VehicleAvatar vehicle={vehicle} size={26} />);

      const marker = new window.mapboxgl.Marker({ element: el, anchor: "center", offset: [14, -14] })
        .setLngLat([road.startCoords.lng, road.startCoords.lat])
        .addTo(map);
      tripMarkersRef.current.push({ marker, root });
    }));
  }, [trips, roads, mapReady]);

  return (
    <div style={{ position: "relative", height: 220, background: "#0a0f14", borderBottom: `1px solid ${C.border}`, overflow: "hidden" }}>
      <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />

      {mapFailed && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, background: "#0a0f14" }}>
          <div style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>Map unavailable</div>
          <div style={{ fontSize: 10, color: C.faint, maxWidth: 240, textAlign: "center", lineHeight: 1.6 }}>Check the Mapbox token in app.js is set and valid.</div>
        </div>
      )}

      <div style={{ position: "absolute", top: 10, left: 14, fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: "0.16em", pointerEvents: "none" }}>{selected && !isAU(selected) ? roadPlace(selected) : "Eastern Australia"}</div>

      <div style={{ position: "absolute", bottom: 8, right: 14, display: "flex", gap: 10, pointerEvents: "none" }}>
        {[["QLD",C.champagne],["NSW",C.blue],["TAS","#888"],["VIC","#666"]].map(([s,c]) => (
          <span key={s} style={{ fontSize: 9, color: c, letterSpacing: "0.12em", textTransform: "uppercase" }}>{s}</span>
        ))}
      </div>
    </div>
  );
};

// ─── ROAD DETAIL ─────────────────────────────────────────────
const RoadDetail = ({ road, onClose, currentUser, onOpenProfile }) => {
  const [tab, setTab] = useState("overview");
  const tabs = [["overview","Overview"],["ratings","Ratings"],["logistics","Logistics"],["alerts",`Alerts${road.alerts.length ? ` (${road.alerts.length})` : ""}`]];

  // Session 17: "Write a Review" and "Report an Issue" never actually
  // called api.postReview()/api.postAlert() — they just awarded points
  // client-side and showed a fake success alert, with nothing ever
  // persisted anywhere. That was a live, repeatable, no-cost points
  // exploit (tap the button as many times as you like). Disabled honestly
  // rather than left live — the server now requires a real POST /reviews
  // or POST /alerts call to award anything at all (worker.js Session 17),
  // and neither of those has a real submission form built yet. Build the
  // actual review/alert forms before re-enabling these buttons for real.
  const handleReview = () => {
    alert("Reviews aren't live yet — coming soon.");
  };

  return (
    <div>
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              {road.featured && <Badge color={C.champagne}>Featured</Badge>}
              {road.verified && <Badge color={C.blue}>✓ Verified</Badge>}
              <Badge color={C.dim}>{roadPlace(road)}</Badge>
            </div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, color: C.bone, lineHeight: 1.1 }}>{road.name}</h3>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{road.region}</div>
            {road.addedBy && <div style={{ marginTop: 5 }}><AddedByLink memberId={road.addedBy} onOpen={onOpenProfile} /></div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            {hasRatings(road) ? (
              <>
                <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond', serif", color: C.champagne, fontWeight: 600 }}>{avgRating(road).toFixed(1)}</div>
                <StarRating value={avgRating(road)} />
                <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{road.reviews} reviews</div>
              </>
            ) : (
              <div style={{ fontSize: 11, color: C.dim, maxWidth: 90, lineHeight: 1.4 }}>Not yet rated. Be the first to review.</div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
          {[["Distance", road.distance],["Drive Time", road.duration],["Thrill", hasRatings(road) ? road.ratings.thrill.toFixed(1) + " ★" : "—"]].map(([k,v]) => (
            <div key={k}>
              <div style={{ fontSize: 13, color: C.bone, fontWeight: 600 }}>{v}</div>
              <div style={{ fontSize: 10, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>{k}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, padding: "0 20px" }}>
        {tabs.map(([id,label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ padding: "9px 14px", background: "none", border: "none", borderBottom: `2px solid ${tab===id ? C.champagne : "transparent"}`, color: tab===id ? C.champagne : C.dim, fontFamily: "'Josefin Sans', sans-serif", fontSize: 11, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ padding: "16px 20px" }}>
        {tab === "overview" && (
          <>
            <p style={{ color: "#aaa", fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>{road.description}</p>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 14 }}>
              {road.tags.map(t => <span key={t} style={{ fontSize: 10, padding: "3px 10px", background: "#1a1a1a", borderRadius: 20, color: C.muted, border: `1px solid ${C.border}`, textTransform: "uppercase", letterSpacing: "0.08em" }}>{t}</span>)}
            </div>
            <div style={{ background: "#0a0a0a", borderRadius: 8, padding: 12, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.champagne, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>GPS</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 9, color: C.dim, marginBottom: 2 }}>START</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{road.startCoords.lat.toFixed(4)}, {road.startCoords.lng.toFixed(4)}</div>
                </div>
                <div>
                  <div style={{ fontSize: 9, color: C.dim, marginBottom: 2 }}>END</div>
                  <div style={{ fontSize: 11, color: C.muted, fontFamily: "monospace" }}>{road.endCoords.lat.toFixed(4)}, {road.endCoords.lng.toFixed(4)}</div>
                </div>
              </div>
            </div>
          </>
        )}
        {tab === "ratings" && (
          <>
            <div style={{ marginBottom: 20 }}>
              {[["driveability","Driveability"],["accessibility","Accessibility"],["views","Views / Scenery"],["surface","Surface Quality"],["thrill","Thrill Factor"]].map(([k,l]) => (
                <RatingBar key={k} label={l} value={road.ratings?.[k] || 0} />
              ))}
            </div>
            <div style={{ textAlign: "center", padding: 14, background: "#0a0a0a", borderRadius: 8, border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>Driven this road? Rate it and earn 30 points.</div>
              <Btn onClick={handleReview}>Write a Review</Btn>
            </div>
          </>
        )}
        {tab === "logistics" && (
          <>
            {[
              { label: "⏱ Busy Times to Avoid", color: C.red, items: road.busyTimes },
              { label: "⛽ Fuel", color: C.champagne, items: road.fuel },
              { label: "🍴 Food & Coffee", color: C.champagne, items: road.food },
              { label: "📍 Group Meetup / Parking", color: C.blue, items: road.meetups },
            ].map(({ label, color, items }) => (
              <div key={label} style={{ background: "#0a0a0a", borderRadius: 8, padding: 12, border: `1px solid ${C.border}`, marginBottom: 10 }}>
                <div style={{ fontSize: 10, color, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>{label}</div>
                {items.map((item, i) => (
                  <div key={i} style={{ fontSize: 12, color: "#aaa", padding: "4px 0", borderBottom: i < items.length-1 ? `1px solid ${C.border}` : "none" }}>• {item}</div>
                ))}
              </div>
            ))}
          </>
        )}
        {tab === "alerts" && (
          <>
            {road.alerts.length === 0
              ? <div style={{ textAlign: "center", padding: 32, color: C.dim }}><div style={{ fontSize: 28, marginBottom: 10 }}>✅</div>No active alerts</div>
              : road.alerts.map((a, i) => {
                  const clr = a.type === "roadworks" ? C.red : a.type === "seasonal" ? C.blue : C.champagne;
                  return (
                    <div key={i} style={{ padding: "10px 12px", background: `${clr}12`, border: `1px solid ${clr}40`, borderRadius: 8, marginBottom: 8 }}>
                      <div style={{ fontSize: 11, color: clr, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{a.type}</div>
                      <div style={{ fontSize: 13, color: "#ccc" }}>{a.text}</div>
                    </div>
                  );
                })
            }
            <div style={{ marginTop: 14, textAlign: "center" }}>
              <Btn variant="danger" size="sm" onClick={() => alert("Alert reporting isn't live yet — coming soon.")}>Report an Issue</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─── MEMBER PROFILE (public view — reached via "Added by" links) ─────
// Shows only what /members/:id/public exposes: no email, bio, or garage.
// Roads-added count is derived live from the roads already in app state
// rather than member.roadsAdded, which the backend never actually
// increments — see Session 13 handoff note.
const MemberProfile = ({ memberId, currentUser, roads, onClose }) => {
  const [profile, setProfile] = useState(null);
  const [follows, setFollows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = memberId === currentUser?.id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    (async () => {
      try {
        const [p, f] = await Promise.all([
          api.getMemberPublic(memberId),
          api.getFollows(memberId),
        ]);
        if (!cancelled) { setProfile(p); setFollows(f); }
      } catch (e) {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberId]);

  const toggleFollow = async () => {
    if (!follows || busy) return;
    setBusy(true);
    const wasFollowing = follows.viewerIsFollowing;
    // Optimistic update — flip immediately, reconcile with server after.
    setFollows(f => ({ ...f, viewerIsFollowing: !wasFollowing, followerCount: f.followerCount + (wasFollowing ? -1 : 1) }));
    try {
      if (wasFollowing) await api.unfollow(memberId);
      else await api.follow(memberId);
    } catch (e) {
      // Revert on failure
      setFollows(f => ({ ...f, viewerIsFollowing: wasFollowing, followerCount: f.followerCount + (wasFollowing ? 1 : -1) }));
    } finally {
      setBusy(false);
    }
  };

  const roadsAdded = roads?.filter(r => r.addedBy === memberId) || [];

  return (
    <Modal title={notFound ? "Member" : (profile?.displayName || "Member")} onClose={onClose}>
      {loading && <div style={{ textAlign:"center", padding:30, color:C.dim, fontSize:12 }}>Loading profile…</div>}

      {!loading && notFound && (
        <div style={{ textAlign:"center", padding:24, color:C.dim }}>
          <div style={{ fontSize:28, marginBottom:8 }}>👤</div>
          <div style={{ fontSize:13 }}>This member's profile isn't available.</div>
        </div>
      )}

      {!loading && profile && (
        <>
          <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:16 }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:C.champagneDim, border:`2px solid ${C.champagne}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
              {profile.avatar
                ? <img src={profile.avatar} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ fontSize:22, color:C.champagne, fontFamily:"'Cormorant Garamond', serif" }}>{profile.displayName[0]}</span>}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:19, fontWeight:600, color:C.bone, lineHeight:1.1 }}>{profile.displayName}</div>
              {profile.location && <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>📍 {profile.location}</div>}
              <div style={{ marginTop:6 }}><PointsBadge pts={profile.points} /></div>
            </div>
          </div>

          {!isSelf && follows && (
            <Btn onClick={toggleFollow} disabled={busy} variant={follows.viewerIsFollowing ? "ghost" : "primary"} style={{ width:"100%", marginBottom:16 }}>
              {follows.viewerIsFollowing ? "Following ✓" : "+ Follow"}
            </Btn>
          )}

          {follows && (
            <div style={{ display:"flex", gap:20, marginBottom:16, padding:"10px 0", borderTop:`1px solid ${C.border}`, borderBottom:`1px solid ${C.border}` }}>
              <div><span style={{ color:C.bone, fontWeight:600 }}>{follows.followerCount}</span> <span style={{ color:C.dim, fontSize:12 }}>followers</span></div>
              <div><span style={{ color:C.bone, fontWeight:600 }}>{follows.followingCount}</span> <span style={{ color:C.dim, fontSize:12 }}>following</span></div>
            </div>
          )}

          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:15, color:C.champagne, marginBottom:10 }}>
            Roads Added {roadsAdded.length > 0 && `(${roadsAdded.length})`}
          </div>
          {roadsAdded.length === 0
            ? <div style={{ fontSize:12, color:C.dim, marginBottom:6 }}>No roads added yet.</div>
            : roadsAdded.map(r => (
                <div key={r.id} style={{ padding:"8px 0", borderBottom:`1px solid ${C.border}`, fontSize:13, color:"#ccc" }}>
                  {r.name} <span style={{ color:C.dim, fontSize:11 }}>· {r.region}</span>
                </div>
              ))}
        </>
      )}
    </Modal>
  );
};

// Small clickable "Added by" line — reused wherever road attribution shows.
// Never renders the raw id (it's an email post-auth-rebuild) — resolves a
// display name first via /members/:id/public and shows a neutral
// placeholder while that's in flight, rather than the address itself.
const AddedByLink = ({ memberId, onOpen, style: sx }) => {
  const [name, setName] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!memberId) return;
    api.getMemberPublic(memberId).then(p => { if (!cancelled) setName(p.displayName); }).catch(() => {});
    return () => { cancelled = true; };
  }, [memberId]);

  if (!memberId) return null;
  return (
    <span
      onClick={(e) => { e.stopPropagation(); onOpen(memberId); }}
      style={{ fontSize: 11, color: C.champagne, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2, ...sx }}
    >
      Added by {name || "a member"}
    </span>
  );
};

// ─── GARAGE SECTION ──────────────────────────────────────────
const GarageView = ({ member, onUpdate, onRefresh, onRefreshPoints, onSelectVehicle, onUpgradeNeeded }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ make: "", model: "", year: "", variant: "", colour: "", notes: "", regoState: "", vicDayCap: 90, regoAnniversary: "" });
  const fileInputRefs = useRef({});

  const triggerFileInput = (vehicleId) => {
    if (fileInputRefs.current[vehicleId]) {
      fileInputRefs.current[vehicleId].value = "";
      fileInputRefs.current[vehicleId].click();
    }
  };

  const handleAdd = async () => {
    if (!form.make || !form.model) return;
    setSaving(true);
    const v = { id: `v${Date.now()}`, ...form, avatar: null, primary: member.garage.length === 0 };
    // Session 17: onUpdate() -> updateCurrentUser() already calls
    // api.saveGarage(), which the server now awards add_vehicle points
    // for (worker.js, diffing old vs new garage for genuinely new IDs).
    // The old onPointsEarned("add_vehicle") call that used to sit here
    // was a straight double-award — removed, replaced with a real
    // points refresh from the server instead of a client-side guess.
    await onUpdate({ ...member, garage: [...member.garage, v] });
    await onRefreshPoints?.();
    setForm({ make: "", model: "", year: "", variant: "", colour: "", notes: "", regoState: "", vicDayCap: 90, regoAnniversary: "" });
    setShowAdd(false);
    setSaving(false);
    if (onRefresh) await onRefresh();
  };

  const setPrimary = id => {
    onUpdate({ ...member, garage: member.garage.map(v => ({ ...v, primary: v.id === id })) });
  };

  const handleAvatarUpload = async (vehicleId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("photo", file);
    formData.append("vehicleId", vehicleId);
    formData.append("setAsHero", "true");
    try {
      // Session 17: was a raw fetch() with no Authorization header at all —
      // this would have started failing with 401 the moment PUT
      // /garage/:id/photo required auth. authedFetch adds the session
      // token and leaves everything else (including the FormData body)
      // untouched — Content-Type for multipart is still set by the
      // browser automatically, authHeaders() only adds Authorization.
      // Note: authedFetch only throws on 401/403 — other errors (e.g.
      // "Maximum 10 photos per vehicle") come back as a resolved
      // {error: "..."} body, same as it always has for every other
      // authedFetch call in this file, so check for that explicitly
      // rather than assuming success.
      const res = await authedFetch(`${API}/garage/${member.id}/photo`, { method: "PUT", body: formData });
      if (res?.error) throw new Error(res.error);
      // Server now awards upload_photo — old onPointsEarned() call removed.
      await onRefreshPoints?.();
      if (onRefresh) await onRefresh();
    } catch (err) {
      if (err?.authFailed) throw err; // let the caller's sign-out handling catch this
      alert(`Photo upload failed: ${err.message}`);
    }
  };

  // FIX 2: heroPhoto is now a photoId string — look up by id, not index
  const primaryVehicle = member.garage.find(v => v.primary);
  const getVehicleHeroUrl = (v) => {
    const photos = v.photos || [];
    if (v.heroPhoto) {
      const hero = photos.find(p => p.id === v.heroPhoto);
      if (hero) return hero.url;
    }
    return photos.length > 0 ? photos[0].url : (v.avatar || null);
  };
  const garageWallpaper = primaryVehicle ? getVehicleHeroUrl(primaryVehicle) : null;

  return (
    <div style={{ position: "relative", minHeight: "100%" }}>
      {garageWallpaper && (
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <img src={garageWallpaper} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "blur(18px) brightness(0.18)", transform: "scale(1.08)" }} />
        </div>
      )}
      <div style={{ position: "relative", zIndex: 1, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.champagne }}>The Garage</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Your fleet. Tap a ride to open it.</div>
        </div>
        <Btn
          size="sm"
          disabled={saving}
          onClick={() => {
            // Session 18: free plan caps the Garage at 1 vehicle — matches
            // the server-side check in PUT /garage/:id, this is just the
            // friendlier front door to it.
            if (!isMemberPro(member) && member.garage.length >= 1) { onUpgradeNeeded?.(); return; }
            setShowAdd(true);
          }}
        >
          {saving ? "Saving..." : (!isMemberPro(member) && member.garage.length >= 1) ? "🔒 + Add Vehicle" : "+ Add Vehicle"}
        </Btn>
      </div>

      {!isMemberPro(member) && member.garage.length >= 1 && (
        <div style={{ fontSize: 11, color: C.dim, marginTop: -12, marginBottom: 18 }}>Free plan is limited to 1 vehicle — upgrade to Pro for the full fleet.</div>
      )}

      {member.garage.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🚗</div>
          <div>No vehicles yet. Add your first ride.</div>
        </div>
      )}

      {member.garage.map(v => {
        const vHero = getVehicleHeroUrl(v);
        return (
          <div key={v.id} onClick={() => onSelectVehicle(v)}
            style={{ position: "relative", border: `1px solid ${v.primary ? C.champagne : C.border}`, borderRadius: 10, marginBottom: 12, overflow: "hidden", cursor: "pointer", minHeight: 90 }}>
            {vHero && (
              <div style={{ position: "absolute", inset: 0 }}>
                <img src={vHero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.25)" }} />
              </div>
            )}
            {!vHero && <div style={{ position: "absolute", inset: 0, background: "#0a0a0a" }} />}
            <div style={{ position: "relative", zIndex: 1, padding: 16, display: "flex", gap: 14, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0 }}>
                <VehicleAvatar vehicle={v} size={56} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, fontWeight: 600, color: C.bone }}>
                    {v.year} {v.make} {v.model}
                  </div>
                  {v.primary && <Badge color={C.champagne}>★ Primary</Badge>}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{v.variant} · {v.colour}</div>
                {v.notes && <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.5 }}>{v.notes}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
                {!v.primary && <Btn size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setPrimary(v.id); }}>Set Primary</Btn>}
                <span style={{ fontSize: 18, color: C.dim }}>›</span>
              </div>
            </div>
          </div>
        );
      })}

      {showAdd && (
        <Modal title="Add Vehicle" subtitle="50 points on your first upload" onClose={() => setShowAdd(false)}>
          <Input label="Make *" value={form.make} onChange={v => setForm(f => ({...f, make: v}))} placeholder="BMW" />
          <Input label="Model *" value={form.model} onChange={v => setForm(f => ({...f, model: v}))} placeholder="Z4" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Year" value={form.year} onChange={v => setForm(f => ({...f, year: v}))} placeholder="2005" />
            <Input label="Colour" value={form.colour} onChange={v => setForm(f => ({...f, colour: v}))} placeholder="Imola Red" />
          </div>
          <Input label="Variant / Spec" value={form.variant} onChange={v => setForm(f => ({...f, variant: v}))} placeholder="E85 3.0i Roadster" />
          <Input label="Notes" value={form.notes} onChange={v => setForm(f => ({...f, notes: v}))} placeholder="Any notes about this vehicle..." multiline />
          <RegoStateField vehicle={form} onChange={patch => setForm(f => ({...f, ...patch}))} />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => setShowAdd(false)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn onClick={handleAdd} disabled={saving} style={{ flex: 2 }}>{saving ? "Saving..." : "Add to Garage"}</Btn>
          </div>
        </Modal>
      )}
      </div>
    </div>
  );
};

// ─── VEHICLE DETAIL SCREEN ───────────────────────────────────
const VehicleDetail = ({ vehicle, member, onUpdate, onRefreshPoints, onBack, onRefresh }) => {
  const [tab, setTab] = useState("gallery");
  const [fullscreen, setFullscreen] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sharingCard, setSharingCard] = useState(false);
  const [cardPreview, setCardPreview] = useState(null); // { url } — fallback when Web Share can't take files
  // Season's Greetings card: xmas is null while closed, or { greeting, message } while the modal is open.
  const [xmas, setXmas] = useState(null);
  const [xmasPreview, setXmasPreview] = useState(null);   // { url, blob }
  const [xmasBuilding, setXmasBuilding] = useState(false);
  const [xmasFailed, setXmasFailed] = useState(false);
  const [xmasSharing, setXmasSharing] = useState(false);
  const xmasHeroRef = useRef({ url: null, img: null });    // hero photo cached so typing a message doesn't refetch it
  const photoInputRef = useRef(null);

  // FIX 2: heroPhoto is a photoId string — find by id, not index
  const getHeroPhoto = () => {
    const photos = vehicle.photos || [];
    if (vehicle.heroPhoto) {
      const hero = photos.find(p => p.id === vehicle.heroPhoto);
      if (hero) return hero.url;
    }
    return photos.length > 0 ? photos[0].url : (vehicle.avatar || null);
  };

  // "Share My Ride" — builds a brag card for this one vehicle and hands it
  // to the OS share sheet (same pattern as trip postcards), so it lands
  // straight in whatever social app or group chat someone taps. Desktop
  // browsers without file-sharing support fall back to a downloadable
  // preview, same as the trip card flow.
  const handleShareVehicle = async () => {
    setSharingCard(true);
    setCardPreview(null);
    try {
      const blob = await drawVehicleCard({ vehicle, member, heroUrl: getHeroPhoto() });
      if (!blob) throw new Error("card render unavailable");
      const file = new File([blob], "chasin-curves-ride.png", { type: "image/png" });
      const shareText = `${vehicle.year || ""} ${vehicle.make} ${vehicle.model} — on Chasin' Curves 🏁`.trim();
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Chasin' Curves", text: shareText });
      } else {
        setCardPreview({ url: URL.createObjectURL(blob) });
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error("[Chasin' Curves] share vehicle card build failed", e);
        alert(`Couldn't build the share card — ${e?.message || "something went wrong"}. Try again, and if it keeps happening let Scott know what the error above says.`);
      }
    } finally {
      setSharingCard(false);
    }
  };

  const openXmas = () => { setXmasFailed(false); setXmas({ greeting: defaultXmasGreeting(), message: "" }); };
  const closeXmas = () => {
    setXmas(null);
    setXmasPreview(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return null; });
  };

  // Rebuilds the preview a moment after the greeting or message changes.
  useEffect(() => {
    if (!xmas) return;
    let cancelled = false;
    setXmasBuilding(true);
    setXmasFailed(false);
    const timer = setTimeout(async () => {
      try {
        const heroUrl = getHeroPhoto();
        if (heroUrl && xmasHeroRef.current.url !== heroUrl) {
          xmasHeroRef.current = { url: heroUrl, img: await loadImageEl(heroUrl, "vehicle hero photo") };
        }
        const blob = await drawChristmasCard({
          vehicle, member, heroImg: heroUrl ? xmasHeroRef.current.img : null,
          greeting: xmas.greeting, message: xmas.message,
        });
        if (cancelled) return;
        if (!blob) throw new Error("card render unavailable");
        setXmasPreview(prev => { if (prev?.url) URL.revokeObjectURL(prev.url); return { url: URL.createObjectURL(blob), blob }; });
      } catch (e) {
        if (!cancelled) { console.error("[Chasin' Curves] greetings card build failed", e); setXmasFailed(true); }
      } finally {
        if (!cancelled) setXmasBuilding(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [xmas?.greeting, xmas?.message, !!xmas]);

  const xmasFile = xmasPreview ? new File([xmasPreview.blob], "chasin-curves-greetings.png", { type: "image/png" }) : null;
  const canShareXmas = !!(xmasFile && navigator.canShare && navigator.canShare({ files: [xmasFile] }));

  // Shares the card with the ?invite= link ("Invite a Mate" uses the same one), so every card
  // carries the app with it. Browsers that can't share files download the card instead and
  // copy the message so it can be pasted alongside it.
  const shareXmas = async () => {
    if (!xmasPreview?.blob || !xmasFile) return;
    setXmasSharing(true);
    try {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(member.displayName || "")}`;
      const rideName = `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.replace(/\s+/g, " ").trim();
      const text = `${xmas.greeting} from ${member.displayName || "a mate"} and their ${rideName} 🎄\nJoin us on Chasin' Curves: ${inviteUrl}`;
      if (canShareXmas) {
        await navigator.share({ files: [xmasFile], title: "Chasin' Curves", text });
      } else {
        const a = document.createElement("a");
        a.href = xmasPreview.url; a.download = "chasin-curves-greetings.png";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        try { await navigator.clipboard.writeText(text); alert("Card downloaded, and the message with your invite link is copied. Paste it wherever you post the card."); }
        catch { alert("Card downloaded. Add this invite link when you post it:\n" + inviteUrl); }
      }
    } catch (e) {
      if (e?.name !== "AbortError") {
        console.error("[Chasin' Curves] greetings card share failed", e);
        alert("Couldn't share the card. Try again, or download it from the preview by pressing and holding the image.");
      }
    } finally {
      setXmasSharing(false);
    }
  };

  const handleDownloadCard = () => {
    if (!cardPreview) return;
    const a = document.createElement("a");
    a.href = cardPreview.url; a.download = "chasin-curves-ride.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const updateVehicle = async (updated) => {
    const newGarage = member.garage.map(v => v.id === updated.id ? updated : v);
    await onUpdate({ ...member, garage: newGarage });
    if (onRefresh) await onRefresh();
  };

  const handleAddPhoto = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const existing = vehicle.photos || [];
    const slots = 10 - existing.length;
    if (slots <= 0) { alert("Maximum 10 photos reached."); return; }
    const toUpload = files.slice(0, slots);
    setSaving(true);
    try {
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("photo", file);
        formData.append("vehicleId", vehicle.id);
        formData.append("setAsHero", String(existing.length === 0));
        // Session 17: was a raw fetch() with no Authorization header — same
        // bug and same fix as GarageView.handleAvatarUpload above. authedFetch
        // only throws on 401/403, so a non-auth error still needs an
        // explicit check against the returned body's `.error` field.
        const res = await authedFetch(`${API}/garage/${member.id}/photo`, { method: "PUT", body: formData });
        if (res?.error) throw new Error(res.error);
        // Server now awards upload_photo — old onPointsEarned() call removed.
      }
      await onRefreshPoints?.();
      await onRefresh();
    } catch (err) {
      if (err?.authFailed) throw err;
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // FIX 2: setHero stores photoId string, not array index
  const setHero = async (photoId) => {
    const photos = vehicle.photos || [];
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;
    await updateVehicle({ ...vehicle, heroPhoto: photoId, heroPhotoUrl: photo.url });
  };

  const deletePhoto = async (photoId) => {
    if (!confirm("Delete this photo?")) return;
    setSaving(true);
    try {
      const res = await fetch(`${API}/garage/${member.id}/photo/${photoId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      await onRefresh();
    } catch (err) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const hero = getHeroPhoto();
  const photos = vehicle.photos || [];

  return (
    <div style={{ position: "absolute", inset: 0, background: C.midnight, zIndex: 20, display: "flex", flexDirection: "column", overflowY: "auto" }}>

      {/* Hero photo wallpaper */}
      <div style={{ position: "relative", width: "100%", height: 260, flexShrink: 0, background: "#0a0a0a", overflow: "hidden" }}>
        {hero
          ? <img src={hero} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10 }}>
              <span style={{ fontSize: 48, opacity: 0.15 }}>🚗</span>
              <span style={{ fontSize: 11, color: C.dim, textTransform: "uppercase", letterSpacing: "0.1em" }}>No photo yet</span>
            </div>
        }
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.1) 40%, rgba(13,13,13,0.95) 100%)" }} />
        <button onClick={onBack} style={{ position: "absolute", top: 14, left: 16, background: "rgba(0,0,0,0.5)", border: "1px solid " + C.border2, borderRadius: 20, padding: "6px 14px", color: C.champagne, fontFamily: "Josefin Sans, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Garage
        </button>
        <button onClick={handleShareVehicle} disabled={sharingCard} style={{ position: "absolute", top: 14, right: 16, background: "rgba(0,0,0,0.5)", border: "1px solid " + C.border2, borderRadius: 20, padding: "6px 14px", color: C.champagne, fontFamily: "Josefin Sans, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: sharingCard ? "default" : "pointer", opacity: sharingCard ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
          {sharingCard ? "Building…" : "📤 Share"}
        </button>
        {isXmasSeason() && (
          <button onClick={openXmas} style={{ position: "absolute", top: 52, right: 16, background: "rgba(0,0,0,0.5)", border: "1px solid " + C.red, borderRadius: 20, padding: "6px 14px", color: C.bone, fontFamily: "Josefin Sans, sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            🎄 Greetings
          </button>
        )}
        <div style={{ position: "absolute", bottom: 18, left: 20, right: 20 }}>
          <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{vehicle.variant} · {vehicle.colour}</div>
          {vehicle.primary && <span style={{ fontSize: 10, color: C.champagne, textTransform: "uppercase", letterSpacing: "0.1em" }}>★ Primary Ride</span>}
        </div>
      </div>

      {xmas && (
        <Modal title="Season’s Greetings" subtitle="A card from you and your ride" onClose={closeXmas}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {XMAS_GREETINGS.map(g => (
              <button key={g} onClick={() => setXmas(x => ({ ...x, greeting: g }))}
                style={{ padding: "6px 14px", borderRadius: 20, cursor: "pointer", fontFamily: "Josefin Sans, sans-serif", fontSize: 12,
                         border: `1px solid ${xmas.greeting === g ? C.champagne : C.border2}`,
                         background: xmas.greeting === g ? C.champagneDim : "none",
                         color: xmas.greeting === g ? C.champagne : C.muted }}>
                {g}
              </button>
            ))}
          </div>
          <Input label="Add a line (optional)" value={xmas.message} onChange={v => setXmas(x => ({ ...x, message: v.slice(0, 80) }))} placeholder="Wishing you miles of open road" />
          <div style={{ textAlign: "center", marginBottom: 14, minHeight: 120 }}>
            {xmasPreview
              ? <img src={xmasPreview.url} alt="Your Season’s Greetings card" style={{ maxWidth: "100%", maxHeight: "46vh", borderRadius: 10, border: `1px solid ${C.border}`, opacity: xmasBuilding ? 0.5 : 1, transition: "opacity 0.2s" }} />
              : <div style={{ fontSize: 12, color: xmasFailed ? C.red : C.dim, padding: "40px 0" }}>
                  {xmasFailed ? "Couldn't build the card. Check your connection and try again." : "Building your card…"}
                </div>}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={closeXmas} style={{ flex: 1 }}>Close</Btn>
            <Btn onClick={shareXmas} disabled={!xmasPreview || xmasBuilding || xmasSharing} style={{ flex: 2 }}>
              {xmasSharing ? "Sending…" : canShareXmas ? "Share card" : "Download card"}
            </Btn>
          </div>
        </Modal>
      )}

      {cardPreview && (
        <div style={{ padding: "16px 20px", textAlign: "center", borderBottom: "1px solid " + C.border }}>
          <img src={cardPreview.url} style={{ maxWidth: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
          <div style={{ fontSize: 11, color: C.dim, margin: "10px 0" }}>This browser can't share an image directly — download it and post it yourself.</div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn onClick={handleDownloadCard} style={{ flex: 1 }}>Download Image</Btn>
            <Btn variant="ghost" onClick={() => setCardPreview(null)} style={{ flex: 1 }}>Close</Btn>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid " + C.border, flexShrink: 0, background: C.midnight }}>
        <button onClick={() => setTab("gallery")}
          style={{ flex: 1, padding: "12px 0", background: "none", border: "none", cursor: "pointer", color: tab === "gallery" ? C.champagne : C.dim, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "Josefin Sans, sans-serif", borderBottom: tab === "gallery" ? "2px solid " + C.champagne : "2px solid transparent" }}>
          Gallery
        </button>
      </div>

      {/* Gallery tab */}
      {tab === "gallery" && (
        <div style={{ padding: 20, flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: C.dim }}>{photos.length}/10 photos</div>
            {photos.length < 10 && (
              <Btn size="sm" onClick={() => { photoInputRef.current.value = ""; photoInputRef.current.click(); }} disabled={saving}>
                {saving ? "Uploading..." : "+ Add Photos"}
              </Btn>
            )}
            <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handleAddPhoto} style={{ display: "none" }} />
          </div>

          {photos.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: C.dim, border: "1px dashed " + C.border2, borderRadius: 12 }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📷</div>
              <div style={{ fontSize: 13, marginBottom: 6, color: C.muted }}>No photos yet</div>
              <div style={{ fontSize: 11 }}>Add up to 10 photos of your ride</div>
            </div>
          )}

          {/* FIX 2: compare heroPhoto (string id) to photo.id — not to array index */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {photos.map((photo) => {
              const isHero = vehicle.heroPhoto === photo.id;
              return (
                <div key={photo.id} style={{ position: "relative", aspectRatio: "1", borderRadius: 8, overflow: "hidden", border: "2px solid " + (isHero ? C.champagne : "transparent") }}>
                  {/* Session 25: objectPosition:"top" — was a centered crop by
                      default, which for anything tall (a saved trip postcard,
                      for instance) chops content off both top and bottom
                      equally. Anchoring to top instead keeps the most
                      important content (a banner, a subject's face/roofline)
                      intact for tall images; makes negligible difference for
                      ordinary landscape/near-square vehicle photos. */}
                  <img src={photo.url} alt="" onClick={() => setFullscreen(photos.indexOf(photo))} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", cursor: "pointer" }} />
                  <button onClick={() => setHero(photo.id)}
                    style={{ position: "absolute", top: 4, left: 4, background: isHero ? C.champagne : "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 24, height: 24, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ★
                  </button>
                  <button onClick={() => deletePhoto(photo.id)}
                    style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 24, height: 24, fontSize: 12, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    ✕
                  </button>
                  {isHero && (
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: C.champagne + "cc", padding: "3px 0", textAlign: "center", fontSize: 9, color: C.midnight, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}>Wallpaper</div>
                  )}
                </div>
              );
            })}
          </div>

          {vehicle.notes && (
            <div style={{ marginTop: 20, padding: 14, background: "#0a0a0a", borderRadius: 8, border: "1px solid " + C.border }}>
              <div style={{ fontSize: 10, color: C.champagne, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Notes</div>
              <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6 }}>{vehicle.notes}</div>
            </div>
          )}

          <div style={{ marginTop: 20, padding: 14, background: "#0a0a0a", borderRadius: 8, border: "1px solid " + C.border }}>
            <div style={{ fontSize: 10, color: C.champagne, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>Registration (for Logbook day-cap tracking)</div>
            <RegoStateField vehicle={vehicle} onChange={patch => updateVehicle({ ...vehicle, ...patch })} />
          </div>
        </div>
      )}

      {fullscreen !== null && (
        <div onClick={() => setFullscreen(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img src={photos[fullscreen]?.url} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
          <button onClick={e => { e.stopPropagation(); setFullscreen(null); }}
            style={{ position: "absolute", top: 20, right: 20, background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "50%", width: 36, height: 36, color: "#fff", fontSize: 18, cursor: "pointer" }}>✕</button>
          <div style={{ position: "absolute", bottom: 24, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 8 }}>
            {photos.map((_, i) => (
              <div key={i} onClick={e => { e.stopPropagation(); setFullscreen(i); }}
                style={{ width: 8, height: 8, borderRadius: "50%", background: i === fullscreen ? C.champagne : "rgba(255,255,255,0.3)", cursor: "pointer" }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── LOGBOOK ─────────────────────────────────────────────────
// Phase 1 of the Murphy Report & Logbook feature (master build plan,
// 22 Aug 2026) — general-use day-cap logging only. Deliberately no
// club-event branch here: that arrives with the Murphy Report once a
// pilot partner club exists, per the recommended build sequencing.

const lastOdometerForVehicle = (entries, vehicleId) => {
  const relevant = (entries || []).filter(e => e.vehicleId === vehicleId);
  if (relevant.length === 0) return null;
  return relevant.reduce((max, e) => Math.max(max, e.odometerEnd ?? e.odometerStart), 0);
};

const LogTripModal = ({ member, logbook, onClose, onSubmit }) => {
  const garage = member.garage || [];
  const primaryVehicle = garage.find(v => v.primary) || garage[0];
  const [vehicleId, setVehicleId] = useState(primaryVehicle?.id || "");
  const [odometer, setOdometer] = useState("");
  const [trackGps, setTrackGps] = useState(false);
  const [saving, setSaving] = useState(false);
  const vehicle = garage.find(v => v.id === vehicleId);
  const lastReading = vehicle ? lastOdometerForVehicle(logbook, vehicle.id) : null;
  const gpsSupported = typeof navigator !== "undefined" && !!navigator.geolocation;

  // Smart-default the odometer to the vehicle's last logged reading —
  // re-runs whenever the selected vehicle changes, editable either way.
  useEffect(() => {
    const lr = vehicle ? lastOdometerForVehicle(logbook, vehicle.id) : null;
    setOdometer(lr != null ? String(lr) : "");
  }, [vehicleId]);

  const selectStyle = { width:"100%", background:"#0f0f0f", border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 12px", color:C.bone, fontSize:13, fontFamily:"'Josefin Sans', sans-serif", outline:"none" };

  const handleSubmit = async () => {
    if (!vehicle) { alert("Select a vehicle first."); return; }
    const reading = Number(odometer);
    if (odometer === "" || Number.isNaN(reading) || reading < 0) { alert("Enter a valid odometer reading."); return; }
    // Catches typos before they end up in a report that might be shown to
    // police — flags, doesn't block, since a genuinely lower reading
    // (odometer replaced, etc.) is rare but real.
    if (lastReading != null && reading < lastReading) {
      const proceed = confirm(`This reading (${reading}) is lower than the last logged odometer for this vehicle (${lastReading}). Log it anyway?`);
      if (!proceed) return;
    }
    setSaving(true);
    try {
      // Session 16: onClose() used to fire unconditionally here, even when
      // onSubmit had swallowed an error internally — a failed log attempt
      // closed the form with only an easily-missed alert as the only trace.
      // Now it only closes once the trip is actually confirmed logged.
      const ok = await onSubmit(vehicle.id, reading, trackGps);
      if (ok) onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Log a Trip" subtitle="Timestamp is captured now, automatically — there's no date field to fill in" onClose={onClose}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Vehicle</div>
        <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={selectStyle}>
          <option value="" disabled>Select a vehicle</option>
          {garage.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
        </select>
      </div>
      <Input label="Odometer" type="number" value={odometer} onChange={setOdometer} placeholder="e.g. 84210" />
      {lastReading != null && (
        <div style={{ fontSize: 11, color: C.champagne, marginTop: -10, marginBottom: 14, lineHeight: 1.5 }}>
          Pre-filled from the last logged reading ({lastReading}km). Update it if you've driven this vehicle since then without logging it here — once submitted, a trip's start reading can't be edited.
        </div>
      )}
      {vehicle && !vehicle.regoState && (
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 14, lineHeight: 1.5 }}>
          No registration state set for this vehicle — the entry will still be logged, but day-cap tracking won't show until you set one in the Garage.
        </div>
      )}
      {gpsSupported ? (
        <div onClick={() => setTrackGps(t => !t)} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 12, marginBottom: 14, borderRadius: 8, border: `1px solid ${trackGps ? C.champagne : C.border}`, background: trackGps ? C.champagneDim : "none", cursor: "pointer" }}>
          <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${trackGps ? C.champagne : C.border2}`, background: trackGps ? C.champagneDim : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.champagne, flexShrink: 0, marginTop: 1 }}>
            {trackGps ? "✓" : ""}
          </div>
          <div>
            <div style={{ fontSize: 13, color: C.bone }}>Track GPS trail for this trip</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 3, lineHeight: 1.5 }}>
              Opt-in, this trip only. Needs Chasin' Curves open and the screen on for the drive — locking your phone or switching apps will pause it.
            </div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: C.dim, marginBottom: 14 }}>GPS trail isn't available on this device/browser.</div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} disabled={saving || !vehicle} style={{ flex: 2 }}>{saving ? "Logging..." : "Log Trip Now"}</Btn>
      </div>
    </Modal>
  );
};

const VehicleDayCapCard = ({ vehicle, logbook }) => {
  const cap = dayCapFor(vehicle);
  const anchored = ANCHORED_WINDOW_STATES.includes(vehicle.regoState);
  const used = dayCountFor(vehicle, logbook);
  const label = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  if (!vehicle.regoState) {
    return (
      <div style={{ padding: 12, borderRadius: 8, border: `1px dashed ${C.border2}`, marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.bone, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: C.dim }}>No registration state set — open this vehicle in the Garage to enable day-cap tracking.</div>
      </div>
    );
  }
  if (NO_CAP_STATES.includes(vehicle.regoState)) {
    return (
      <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.bone, marginBottom: 2 }}>{label} · {vehicle.regoState}</div>
        <div style={{ fontSize: 11, color: C.dim }}>{vehicle.regoState} runs on club-event attendance, not a day cap — that side of the compliance feature lands with Murphy Report once a partner club is in place.</div>
      </div>
    );
  }
  if (!cap) {
    return (
      <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${C.border}`, marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.bone, marginBottom: 2 }}>{label} · {vehicle.regoState}</div>
        <div style={{ fontSize: 11, color: C.dim }}>Exact day cap for {vehicle.regoState} isn't confirmed yet — entries are still being logged in the meantime.</div>
      </div>
    );
  }
  // Anchored state, cap known, but no rego renewal date on file yet — the
  // count literally has nothing to anchor to, so ask for it instead of
  // silently falling back to a rolling guess for a state we know isn't one.
  if (anchored && used === null) {
    return (
      <div style={{ padding: 12, borderRadius: 8, border: `1px dashed ${C.border2}`, marginBottom: 10 }}>
        <div style={{ fontSize: 13, color: C.bone, marginBottom: 2 }}>{label} · {vehicle.regoState}</div>
        <div style={{ fontSize: 11, color: C.dim }}>Set this vehicle's registration renewal date in the Garage to start tracking — {vehicle.regoState} resets its {cap}-day count on that date each year, not on a rolling window.</div>
      </div>
    );
  }
  const over = used >= cap;
  const anniversary = anchored ? mostRecentAnniversary(vehicle.regoAnniversary) : null;
  const resetLabel = anniversary
    ? `Resets ${anniversary.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} each year — anchored to your rego renewal, not a rolling window`
    : "Rolling 365-day count, not a fixed calendar year — cross-check against your actual rego period";
  return (
    <div style={{ padding: 12, borderRadius: 8, border: `1px solid ${over ? C.red : C.border}`, marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 13, color: C.bone }}>{label} · {vehicle.regoState}</div>
        <div style={{ fontSize: 12, color: over ? C.red : C.champagne, fontWeight: 700 }}>{used}/{cap} days</div>
      </div>
      <div style={{ height: 3, background: "#1e1e1e", borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${Math.min(100, (used / cap) * 100)}%`, background: over ? C.red : `linear-gradient(90deg, ${C.champagne}, ${C.champagneLight})`, borderRadius: 2 }} />
      </div>
      <div style={{ fontSize: 10, color: C.dim, marginTop: 5 }}>{resetLabel}</div>
    </div>
  );
};

// ─── DAILY TRIP SHARE CARD ───────────────────────────────────
// A day's logged trips distilled into one shareable image — built the
// same way as the "Invite a Mate" share (Web Share API, generated
// client-side, no server involved), but for turning real driving into
// something worth dropping in a family group chat. Distance always comes
// from the Logbook's own odometer readings, which stay accurate even
// when the GPS trail has gaps from switching over to Waze — the route
// line and place names are a bonus when trail data exists, not a
// requirement. A day logged with no GPS trail still gets a branded card,
// just without the map.

// Standard Google/Mapbox polyline encoding, precision 5 — how Mapbox's
// Static Images API wants a route handed to it as a path overlay,
// without a server round-trip or a new dependency.
const encodePolyline = (points) => {
  let output = "", prevLat = 0, prevLng = 0;
  const encodeValue = (value) => {
    let v = value < 0 ? ~(value << 1) : (value << 1);
    let out = "";
    while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    out += String.fromCharCode(v + 63);
    return out;
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    output += encodeValue(lat - prevLat) + encodeValue(lng - prevLng);
    prevLat = lat; prevLng = lng;
  }
  return output;
};

// Mapbox's Static Images URL has a practical length ceiling, and a full
// multi-hour trail (up to 1500 points per logged trip, several trips in
// one day) would blow well past it. The map here is a cosmetic overview,
// not a survey — a few hundred points reads identically to a human eye.
const downsampleForMap = (points, maxPoints = 150) => {
  if (points.length <= maxPoints) return points;
  const stride = Math.ceil(points.length / maxPoints);
  const out = points.filter((_, i) => i % stride === 0);
  if (out[out.length - 1] !== points[points.length - 1]) out.push(points[points.length - 1]);
  return out;
};

// Session 16d — Trip Postcard v2 (vehicle photo hero + faded map + a
// hand-drawn route on top, instead of baking the route into the Mapbox
// image itself). That needs the base map and our own route line to share
// one exact bbox — Mapbox's "auto" framing picks its own padding/zoom
// internally and won't tell us what it chose, so we compute an explicit
// bbox ourselves and pass it to both the map request and the projection
// math below. A naive bbox breaks this though: Mapbox can't stretch x and
// y independently (that would visibly distort the roads), so if our bbox's
// aspect ratio doesn't match the card's 1080x1350, Mapbox silently shows
// more area on one axis to compensate — and then our hand-drawn route,
// projected against the un-adjusted bbox, drifts from the real roads
// underneath it. correctBBoxAspect grows (never shrinks) whichever axis is
// short so the bbox already matches the card's aspect ratio before it's
// sent anywhere, so there's nothing left for Mapbox to silently adjust.
const CARD_W = 1080, CARD_H = 1350;
const BBOX_PADDING_FRACTION = 0.14; // extra margin around the trail's bounding box

const toRad = (d) => (d * Math.PI) / 180;
const toDeg = (r) => (r * 180) / Math.PI;
// Standard Web Mercator y — matches how every one of Mapbox's raster
// styles projects latitude, so this is the correct transform to use, not
// an approximation of it.
const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + toRad(lat) / 2));
const mercatorYInverse = (y) => toDeg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);

const computeBBox = (trail) => {
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
  for (const p of trail) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  // A dead-straight trip (or a 2-point trail) can give zero width/height,
  // which breaks the projection below — enforce a sane minimum span.
  const latSpan = Math.max(maxLat - minLat, 0.01);
  const lngSpan = Math.max(maxLng - minLng, 0.01);
  const latPad = latSpan * BBOX_PADDING_FRACTION;
  const lngPad = lngSpan * BBOX_PADDING_FRACTION;
  return {
    minLat: minLat - latPad, maxLat: maxLat + latPad,
    minLng: minLng - lngPad, maxLng: maxLng + lngPad,
  };
};

// Grows whichever axis is "too short" in Web Mercator units (where x and y
// share the same scale, unlike raw degrees) so the bbox's projected aspect
// ratio exactly matches the target canvas. Only ever grows, never crops —
// the padded bbox from computeBBox is always still fully contained.
const correctBBoxAspect = (bbox, targetAspect) => {
  const xSpan = toRad(bbox.maxLng - bbox.minLng); // Mercator x unit = longitude in radians
  const yMercMin = mercatorY(bbox.minLat);
  const yMercMax = mercatorY(bbox.maxLat);
  const ySpan = yMercMax - yMercMin;
  const currentAspect = xSpan / ySpan;

  if (currentAspect < targetAspect) {
    // too tall/narrow (most long highway legs) -> widen longitude, keep latitude as-is
    const xSpanNew = targetAspect * ySpan;
    const centerLng = (bbox.minLng + bbox.maxLng) / 2;
    const halfSpanDeg = toDeg(xSpanNew) / 2;
    return { minLat: bbox.minLat, maxLat: bbox.maxLat, minLng: centerLng - halfSpanDeg, maxLng: centerLng + halfSpanDeg };
  } else if (currentAspect > targetAspect) {
    // too wide/short -> widen latitude, keep longitude as-is
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
};

// Projects a lat/lng into card pixel space using the SAME bbox the base
// map was requested with, so the hand-drawn route lines up with the roads
// Mapbox rendered underneath it.
const projectPoint = (lng, lat, bbox, width, height) => {
  const x = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * width;
  const yMerc = mercatorY(lat);
  const yMercMin = mercatorY(bbox.minLat);
  const yMercMax = mercatorY(bbox.maxLat);
  const y = height - ((yMerc - yMercMin) / (yMercMax - yMercMin)) * height;
  return [x, y];
};

// Plain styled map + labels only, at an explicit bbox — no path overlay,
// since the route is drawn by hand now (see drawTripCard) so it can stay
// bold and fully opaque even where the map underneath fades toward the edges.
// Session 16l — Mapbox's Static Images API caps requested width/height at
// 1280px each. CARD_H (1350) is over that, so every map request for this
// card size was likely being rejected regardless of trip/vehicle — the
// same failure for every share, not something specific to one trip.
// Scaling both dimensions down proportionally (aspect already matches
// CARD_W/CARD_H via correctBBoxAspect) keeps the request valid; drawImage
// already stretches whatever comes back to fill CARD_W x CARD_H, so the
// visual result is unchanged bar a small, unnoticeable resolution drop.
const MAPBOX_MAX_DIMENSION = 1280;
const buildBaseMapUrl = (bbox, width = CARD_W, height = CARD_H) => {
  const scale = Math.min(1, MAPBOX_MAX_DIMENSION / width, MAPBOX_MAX_DIMENSION / height);
  const reqW = Math.round(width * scale);
  const reqH = Math.round(height * scale);
  const bboxStr = `[${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}]`;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${bboxStr}/${reqW}x${reqH}@2x?access_token=${MAPBOX_TOKEN}`;
};

// Best-effort reverse geocode for a friendly "Robe, SA → Naracoorte, SA"
// line — never blocks the card on failure, just omits the place names.
const reverseGeocodePlace = async (lat, lng) => {
  try {
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&limit=1&access_token=${MAPBOX_TOKEN}`);
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    const region = feature.context?.find(c => c.id.startsWith("region"));
    const shortCode = region?.short_code?.split("-")[1]?.toUpperCase();
    return shortCode ? `${feature.text}, ${shortCode}` : feature.text;
  } catch { return null; }
};

// Forward geocode — turns a typed home address into the lat/lng the privacy
// fence is centred on. Only ever called once, when the member sets up (or
// changes) the fence in their Profile; the address itself is discarded from
// the map/postcard rendering path afterwards, only the resulting coordinate
// pair is ever used for the radius check below.
const geocodeAddress = async (address) => {
  try {
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&access_token=${MAPBOX_TOKEN}`);
    const data = await res.json();
    const feature = data?.features?.[0];
    if (!feature) return null;
    const [lng, lat] = feature.center;
    // Session 21: shortName added alongside placeName (never changed —
    // the privacy fence caller only reads lat/lng anyway, but no reason to
    // touch its shape). feature.text is Mapbox's own short form ("Landsborough"
    // vs place_name's "Landsborough, Queensland, Australia") — used for the
    // run-page waypoint labels, where the full form was both too long
    // (caused label collisions on tightly-spaced stops) and redundant
    // (every stop on one run is the same state/country anyway).
    return { lat, lng, placeName: feature.place_name, shortName: feature.text };
  } catch { return null; }
};

const haversineKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// Session 16m — the home-location privacy fence. Trims any points within
// the member's set radius off BOTH ends of a trail before it's ever drawn,
// bounded, or reverse-geocoded — a real drive starts/ends at a garage, so
// clipping the endpoints (rather than punching a gap out of the middle)
// is what actually keeps the address off the map, not just the pin. The
// underlying logged entry is never touched — this only affects what gets
// rendered, everywhere it's rendered (postcards and the GPS Trail viewer
// both call this), so the compliance record stays fully intact either way.
const clipTrailForPrivacy = (trail, member) => {
  if (!member?.obscureHomeLocation || member.privacyHomeLat == null || member.privacyHomeLng == null || !trail?.length) return trail || [];
  const radius = member.privacyRadiusKm ?? 1;
  const inZone = (p) => haversineKm(p.lat, p.lng, member.privacyHomeLat, member.privacyHomeLng) <= radius;
  let start = 0, end = trail.length - 1;
  while (start <= end && inZone(trail[start])) start++;
  while (end >= start && inZone(trail[end])) end--;
  return trail.slice(start, end + 1);
};

// Generic cross-origin image loader for canvas use — crossOrigin is
// required so a successfully-drawn image doesn't taint the canvas and
// break canvas.toBlob() later. `label` is purely diagnostic: a failed
// load degrades the card gracefully either way (this just resolves null,
// callers skip that layer), but a silent, permanent "why doesn't the
// photo ever show up" is worse than a console warning that says exactly
// which layer didn't load and why (almost always a CORS failure on the
// image host, not a bug in this code) — check devtools console after a
// share if a layer seems to be missing.
// Session 16k — three separate photos, three separate vehicles, all
// failed to load on Scott's phone via the crossOrigin Image() approach
// below, while the diagnostic's own fetch() calls kept confirming each
// URL was genuinely reachable and CORS-clean. That split points at a
// mechanism-specific gap between new Image()+crossOrigin and fetch() on
// his device, not a bad photo or a bucket problem — so this now loads
// the photo the same way the diagnostic already proved works: fetch it,
// turn the response into a blob, and point a plain <img> at that local
// blob: URL. A blob URL is same-origin by definition, so there's no
// crossOrigin attribute needed and no way for it to taint the canvas.
const loadImageEl = async (url, label) => {
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        if (label) {
          console.warn(`[Chasin' Curves] ${label} fetched fine but couldn't be decoded as an image for the trip card.`, url);
        }
        resolve(null);
      };
      img.src = objectUrl;
    });
  } catch (e) {
    if (label) {
      console.warn(`[Chasin' Curves] ${label} failed to load for the trip card — ${e.message}. Falling back gracefully.`, url);
    }
    return null;
  }
};

// Canvas text only draws in a web font once the browser has actually
// rasterized that exact weight/size — load everything this card uses,
// then wait for confirmation, rather than risk a silent fallback to a
// generic serif on the first share of the day.
const ensureFontsLoaded = async () => {
  try {
    await Promise.all([
      document.fonts.load("700 150px 'Cormorant Garamond'"),
      document.fonts.load("700 54px 'Cormorant Garamond'"),
      document.fonts.load("600 30px 'Josefin Sans'"),
      document.fonts.load("600 16px 'Josefin Sans'"),
      document.fonts.load("400 32px 'Josefin Sans'"),
      document.fonts.load("400 26px 'Josefin Sans'"),
      document.fonts.load("400 22px 'Josefin Sans'"),
    ]);
    await document.fonts.ready;
  } catch { /* Font Loading API unavailable — canvas falls back to a system font */ }
};

// The three curved road-lines from the login screen, redrawn on canvas
// for a day with no GPS trail — keeps the card branded rather than blank.
const drawRoadLines = (ctx, cx, cy) => {
  const draw = (yOffset, color, width, alpha) => {
    ctx.beginPath();
    ctx.moveTo(cx - 300, cy + yOffset);
    ctx.quadraticCurveTo(cx, cy + yOffset - 45, cx + 300, cy + yOffset);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha;
    ctx.stroke(); ctx.globalAlpha = 1;
  };
  draw(0, C.champagne, 3, 0.14);
  draw(24, C.champagne, 1.5, 0.09);
  draw(-24, C.blue, 1, 0.09);
};

// Session 16f — a single log entry's own trail: a recorded GPS Trail (many
// points) if one exists, otherwise a straight two-point line between its
// logged start + finish pins (Session 16e), otherwise nothing. Used
// per-entry now that Trip Postcards are shared one logged trip at a time —
// see the comment on ShareDayModal below for why the old calendar-day
// rollup got dropped.
const resolveEntryTrail = (e) => {
  if (e.trail?.length > 0) return e.trail;
  if (e.startCoord && e.endCoord) {
    return [
      { lat: e.startCoord.lat, lng: e.startCoord.lng, t: e.timestamp },
      { lat: e.endCoord.lat, lng: e.endCoord.lng, t: e.timestamp },
    ];
  }
  return [];
};

// Renders the actual card and resolves a PNG Blob (null only if the
// canvas itself is unavailable) — a failed map fetch, photo fetch, or
// geocode just means a plainer, still-branded card, never a thrown error.
//
// Session 16d layer order, back to front:
//   vehicle photo (sepia, full bleed)   — optional, via heroUrl
//   → dark base scrim                  — always present under a photo,
//                                         protects text/route even before
//                                         the map's own fade is applied
//   → base map, faded toward the edges — optional, needs a trail
//   → hand-drawn route, bold, on top   — optional, needs a trail
//   → text captions                    — unchanged positions/content
// heroUrl is new; everything else keeps the same call shape as before.
const drawTripCard = async ({ distanceKm, dateLabel, vehicleLabel, legCount, trail, heroUrl, member }) => {
  const preClipLength = trail?.length || 0;
  trail = clipTrailForPrivacy(trail, member);
  if (preClipLength > 0 && trail.length !== preClipLength) {
    console.warn(`[Chasin' Curves] privacy clip changed trail from ${preClipLength} to ${trail.length} points.`);
  }
  await ensureFontsLoaded();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = CARD_W / 2;

  ctx.fillStyle = C.midnight;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const hasTrail = trail && trail.length >= 2;
  let startPlace = null, endPlace = null;
  let mapDrawn = false;
  let bbox = null;

  // --- Layer 1: vehicle photo, full bleed, sepia-toned ---
  const heroImg = heroUrl ? await loadImageEl(heroUrl, "vehicle hero photo") : null;
  if (heroImg) {
    // cover-fit: scale to fill the card, crop centered — matches the
    // existing Garage hero treatment (object-fit: cover) rather than
    // stretching/distorting a differently-proportioned photo.
    const scale = Math.max(CARD_W / heroImg.width, CARD_H / heroImg.height);
    const dw = heroImg.width * scale, dh = heroImg.height * scale;
    const dx = (CARD_W - dw) / 2, dy = (CARD_H - dh) / 2;
    ctx.filter = "sepia(35%) grayscale(20%) brightness(0.55) contrast(1.1)";
    ctx.drawImage(heroImg, dx, dy, dw, dh);
    ctx.filter = "none";
    // Base scrim — present under the photo regardless of whether the map
    // layer loads, so text/route stay legible either way.
    const baseScrim = ctx.createRadialGradient(cx, CARD_H * 0.5, 200, cx, CARD_H * 0.5, 900);
    baseScrim.addColorStop(0, "rgba(13,13,13,0.35)");
    baseScrim.addColorStop(1, "rgba(13,13,13,0.82)");
    ctx.fillStyle = baseScrim;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // --- Layer 2: base map, faded toward the edges ---
  if (hasTrail) {
    // Correct the bbox's aspect ratio to match the card BEFORE requesting
    // the map or projecting any points — see the comment above
    // correctBBoxAspect for why this is the fix for the alignment bug
    // found in review (an uncorrected bbox lets Mapbox silently show more
    // area on one axis than we asked for, so our hand-drawn route would
    // drift from the real roads underneath it).
    bbox = correctBBoxAspect(computeBBox(trail), CARD_W / CARD_H);
    const mapUrl = buildBaseMapUrl(bbox);
    const [mapImg, sp, ep] = await Promise.all([
      loadImageEl(mapUrl, "base map"),
      reverseGeocodePlace(trail[0].lat, trail[0].lng),
      reverseGeocodePlace(trail[trail.length - 1].lat, trail[trail.length - 1].lng),
    ]);
    startPlace = sp; endPlace = ep;
    if (mapImg) {
      // Draw the map into an offscreen canvas so its edges can be masked
      // to transparent before compositing onto the main card — masking
      // directly on the main canvas would also cut into the photo/scrim
      // already drawn there, which isn't what we want.
      const off = document.createElement("canvas");
      off.width = CARD_W; off.height = CARD_H;
      const offCtx = off.getContext("2d");
      offCtx.drawImage(mapImg, 0, 0, CARD_W, CARD_H);
      offCtx.globalCompositeOperation = "destination-in";
      const mask = offCtx.createRadialGradient(cx, CARD_H * 0.5, 150, cx, CARD_H * 0.5, 820);
      mask.addColorStop(0, "rgba(0,0,0,1)");
      mask.addColorStop(0.55, "rgba(0,0,0,0.85)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      offCtx.fillStyle = mask;
      offCtx.fillRect(0, 0, CARD_W, CARD_H);
      offCtx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = heroImg ? 0.55 : 1; // full strength only when there's no photo underneath to protect
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
      mapDrawn = true;
    }
  }

  // Fallback when there's neither a photo nor a map (nothing recorded yet
  // for this vehicle/day) — keeps the card branded rather than blank.
  if (!heroImg && !mapDrawn) {
    drawRoadLines(ctx, cx, 330);
  }

  // --- Layer 3: the route itself, hand-drawn, always bold, never faded ---
  // Projected with the SAME bbox the base map was requested with (see
  // above), so it lines up with the roads underneath it.
  if (hasTrail && bbox) {
    const pts = downsampleForMap(trail).map(p => projectPoint(p.lng, p.lat, bbox, CARD_W, CARD_H));
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = C.champagne;
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;
    ctx.fillStyle = C.champagne;
    for (const [x, y] of [pts[0], pts[pts.length - 1]]) {
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Same soft drop-shadow the app gives text captioned on a photo
  // (VehicleDetail's hero header) — keeps it legible over whatever's
  // underneath, without needing a harder gradient that would hide the
  // route or photo entirely.
  const shadowText = (text, x, y) => {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };

  ctx.textAlign = "center";
  const photoOrMapDrawn = mapDrawn || !!heroImg;

  // Wordmark — pinned near the top, sitting directly on the photo/map when
  // there is one, the same way the app's own header sits over the map.
  // Session 16o — wordmark sized to match the distance number's visual
  // weight (150px) rather than a small fixed size, per Scott's symmetry
  // note. fitText keeps it from overflowing the card width the way a
  // flat 150px would for a 14-character phrase; the tagline and vertical
  // spacing scale with whatever size it lands on, so the block still
  // reads as one balanced unit at any width the text ends up fitting.
  const wordmarkText = "Chasin’ Curves";
  const wordmarkSize = fitText(ctx, wordmarkText, CARD_W - 120, 150, 60, s => `700 ${s}px 'Cormorant Garamond'`);
  const wordmarkY = photoOrMapDrawn ? 70 + wordmarkSize * 0.6 : 450 + wordmarkSize * 0.6;
  ctx.fillStyle = C.champagne;
  ctx.font = `700 ${wordmarkSize}px 'Cormorant Garamond'`;
  shadowText(wordmarkText, cx, wordmarkY);
  ctx.fillStyle = photoOrMapDrawn ? "rgba(245,243,238,0.75)" : C.dim;
  ctx.font = "600 16px 'Josefin Sans'";
  shadowText("R O A D S ,   R I V E R S   &   R I F F S", cx, wordmarkY + wordmarkSize * 0.22 + 12);

  // Stats — pinned toward the bottom, inside the heavily-darkened zone,
  // the same way a vehicle's name sits captioned on its hero photo.
  const midY = photoOrMapDrawn ? 1010 : 680;
  ctx.fillStyle = C.champagne;
  ctx.font = "700 150px 'Cormorant Garamond'";
  shadowText(`${Math.round(distanceKm)}`, cx, midY);
  ctx.fillStyle = C.champagneLight;
  ctx.font = "600 30px 'Josefin Sans'";
  shadowText("KILOMETRES", cx, midY + 40);

  ctx.fillStyle = C.bone;
  ctx.font = "400 32px 'Josefin Sans'";
  shadowText(dateLabel, cx, midY + 110);

  if (startPlace && endPlace) {
    ctx.fillStyle = "rgba(245,243,238,0.8)";
    ctx.font = "400 26px 'Josefin Sans'";
    shadowText(`${startPlace} → ${endPlace}`, cx, midY + 155);
  }

  ctx.fillStyle = "rgba(245,243,238,0.55)";
  ctx.font = "400 22px 'Josefin Sans'";
  shadowText(`${vehicleLabel} · ${legCount} leg${legCount !== 1 ? "s" : ""}`, cx, 1300);

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/png", 0.95));
};

// Shrinks a font size in steps until text fits within maxWidth — vehicle
// names vary wildly ("Jaguar X350" vs "Toyota LandCruiser 200 Series"),
// and a title that just clips at a fixed size isn't good enough for
// something meant to be read at a glance after being shared.
const fitText = (ctx, text, maxWidth, startSize, minSize, fontSpec) => {
  let size = startSize;
  while (size > minSize) {
    ctx.font = fontSpec(size);
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  }
  return size;
};

// Session 30: the invite poster's dashed route used to be a straight line
// through the run's typed-in stops only — the roads picked for the run
// contributed their NAMES to the poster but no geometry at all, so a run
// from Newcastle to Sydney "via the Old Pacific Highway" drew as one dead
// straight line. Now the route is built in pieces:
//  - each selected road is slotted into the stop list where it adds the
//    least detour (and is entered from whichever end is closer);
//  - a road added from a trip's GPS trail carries its real driven line
//    (`path`, fetched from GET /roads/:id/path) and that exact line is
//    drawn for it;
//  - everywhere else — the gaps between stops, and any road with no
//    stored path (the seeded roads, roads typed in by hand) — Mapbox
//    Directions draws the drivable route between the points. motorway is
//    excluded on the first attempt so a run through an old highway follows
//    the old highway instead of the freeway beside it; if that finds no
//    route it retries without the exclusion, and if Directions fails for
//    a piece that piece falls back to a straight line, so an invite never
//    fails to build because of this. The whole route step is also capped at
//    6 seconds (see drawTripInviteCard).
const INVITE_ROUTE_MAX_STOPS = 25; // Mapbox Directions' waypoint limit

// The driven line stored for a road added from a trip — [[lat, lng], ...],
// or null if the road has none (or the fetch fails; the poster just uses
// Directions for it instead).
const fetchRoadPath = async (roadId) => {
  try {
    const res = await fetch(`${API}/roads/${roadId}/path`);
    const data = await res.json();
    const pts = data?.path;
    return Array.isArray(pts) && pts.length >= 2 ? pts : null;
  } catch { return null; }
};

// Returns an ordered list of items: { pt: {lat,lng} } for a typed stop, or
// { road: { a, b, path } } for a selected road (a → b in the direction the
// run travels it; path, if any, already oriented the same way).
const planInviteRoute = (waypoints, roads) => {
  const items = waypoints.map(w => ({ pt: { lat: w.lat, lng: w.lng } }));
  const dist = (a, b) => haversineKm(a.lat, a.lng, b.lat, b.lng);
  const entry = it => it.pt || it.road.a;
  const exit = it => it.pt || it.road.b;
  for (const road of roads || []) {
    if (!road?.startCoords || !road?.endCoords) continue;
    // Roads added with the coordinate boxes left empty are saved as 0,0 — not a real place.
    if (!(road.startCoords.lat || road.startCoords.lng) || !(road.endCoords.lat || road.endCoords.lng)) continue;
    const used = items.reduce((n, it) => n + (it.pt ? 1 : 2), 0);
    if (used + 2 > INVITE_ROUTE_MAX_STOPS) break;
    const s = { lat: road.startCoords.lat, lng: road.startCoords.lng };
    const e = { lat: road.endCoords.lat, lng: road.endCoords.lng };
    let best = null;
    for (let i = 0; i < items.length - 1; i++) {
      const from = exit(items[i]), to = entry(items[i + 1]);
      for (const rev of [false, true]) {
        const a = rev ? e : s, b = rev ? s : e;
        const added = dist(from, a) + dist(a, b) + dist(b, to) - dist(from, to);
        if (!best || added < best.added) best = { i, a, b, rev, added };
      }
    }
    if (!best) continue;
    let path = Array.isArray(road.path) && road.path.length >= 2 ? road.path.map(([lat, lng]) => ({ lat, lng })) : null;
    if (path && best.rev) path = path.slice().reverse();
    items.splice(best.i + 1, 0, { road: { a: best.a, b: best.b, path } });
  }
  return items;
};

// Mapbox Directions through a run of points → [{lat,lng}...], or null.
const fetchDirectionsLeg = async (stops) => {
  if (!stops || stops.length < 2 || stops.length > INVITE_ROUTE_MAX_STOPS) return null;
  const coords = stops.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(";");
  let lastFailure = "";
  for (const exclude of ["&exclude=motorway", ""]) {
    try {
      const res = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?geometries=geojson&overview=full${exclude}&access_token=${MAPBOX_TOKEN}`);
      const data = await res.json();
      const geom = data?.routes?.[0]?.geometry?.coordinates;
      if (data?.code === "Ok" && geom?.length > 1) return geom.map(([lng, lat]) => ({ lng, lat }));
      lastFailure = data?.code ? `${data.code}${data.message ? `: ${data.message}` : ""}` : "no route returned";
    } catch (e) { lastFailure = e?.message || "request failed"; }
  }
  console.warn(`[Chasin' Curves] Directions failed for a leg of the invite route (${lastFailure}) — drawing it as a straight line.`);
  return null;
};

// Stitches the whole route: stored driven paths as-is, Directions for the
// stretches between them. Returns [{lat,lng}...] or null.
const fetchInviteRoute = async (items) => {
  if (!items || items.length < 2) return null;
  const segs = []; // { geom } (ready) or { run } (needs Directions)
  let run = [];
  const flush = () => {
    if (run.length >= 2) segs.push({ run });
    else if (run.length === 1) segs.push({ geom: run.slice() });
    run = [];
  };
  for (const it of items) {
    if (it.pt) run.push(it.pt);
    else if (it.road.path) { run.push(it.road.a); flush(); segs.push({ geom: it.road.path }); run = [it.road.b]; }
    else run.push(it.road.a, it.road.b);
  }
  flush();
  let legsFailed = 0;
  await Promise.all(segs.map(async s => {
    if (!s.run) return;
    const geom = await fetchDirectionsLeg(s.run);
    if (geom) s.geom = geom; else { s.geom = s.run; legsFailed++; }
  }));
  const out = segs.flatMap(s => s.geom);
  if (out.length < 2) return null;
  out.legsFailed = legsFailed; // read by drawTripInviteCard to tell the person when part of the route is a straight line
  out.legsTotal = segs.filter(s => s.run).length;
  return out;
};

// Session 29: "Trip Invite" poster — a shareable image for a planned run,
// sibling to drawTripCard above rather than a rebuild of anything. Reuses
// the exact same Mercator/bbox helpers (computeBBox, correctBBoxAspect,
// projectPoint, buildBaseMapUrl) that drive both drawTripCard's route line
// and the /run/:id page's waypoint overlay — same math, third use. The
// key visual difference from drawTripCard: the route here is DASHED with
// named waypoint labels (a planned run, not yet driven) rather than a
// solid GPS trail, matching what /run/:id already established as "this is
// an invite, not a record."  Data comes from GET /trips/:id/public — the
// same no-auth endpoint the /run/:id page itself calls — so this works
// whether the sharer is the trip's organiser or someone else re-sharing it.
const drawTripInviteCard = async ({ title, dateLabel, timeLabel, waypoints, vehicleLabel, vehiclePhotoUrl, roadNames, roadsForRoute, organiserDisplayName, goingCount }) => {
  await ensureFontsLoaded();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = CARD_W / 2;

  ctx.fillStyle = C.midnight;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const hasWaypoints = waypoints && waypoints.length >= 2;
  let mapDrawn = false;
  let bbox = null;

  // --- Layer 1: vehicle photo, full bleed, sepia-toned (same treatment
  // as drawTripCard, for visual consistency between "a trip you did" and
  // "a trip you're planning") ---
  const heroImg = vehiclePhotoUrl ? await loadImageEl(vehiclePhotoUrl, "vehicle hero photo") : null;
  if (heroImg) {
    const scale = Math.max(CARD_W / heroImg.width, CARD_H / heroImg.height);
    const dw = heroImg.width * scale, dh = heroImg.height * scale;
    const dx = (CARD_W - dw) / 2, dy = (CARD_H - dh) / 2;
    ctx.filter = "sepia(35%) grayscale(20%) brightness(0.55) contrast(1.1)";
    ctx.drawImage(heroImg, dx, dy, dw, dh);
    ctx.filter = "none";
    const baseScrim = ctx.createRadialGradient(cx, CARD_H * 0.5, 200, cx, CARD_H * 0.5, 900);
    baseScrim.addColorStop(0, "rgba(13,13,13,0.35)");
    baseScrim.addColorStop(1, "rgba(13,13,13,0.82)");
    ctx.fillStyle = baseScrim;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  }

  // --- Layer 2: base map, faded toward the edges — same masking approach
  // as drawTripCard, bbox computed from waypoints instead of a GPS trail ---
  // Session 30: work out the drivable route through the stops + selected
  // roads first, so the map frames the whole route, not just the stops.
  let routePts = null;
  let routeNote = ""; // "none" | "partial" — surfaced on the invite screen
  if (hasWaypoints) {
    routePts = await Promise.race([
      fetchInviteRoute(planInviteRoute(waypoints, roadsForRoute)),
      new Promise(resolve => setTimeout(() => resolve(null), 6000)),
    ]);
    if (!routePts) routeNote = "none";
    else if (routePts.legsFailed > 0) routeNote = routePts.legsFailed >= routePts.legsTotal ? "none" : "partial";
  }

  if (hasWaypoints) {
    bbox = correctBBoxAspect(computeBBox(routePts ? [...waypoints, ...routePts] : waypoints), CARD_W / CARD_H);
    const mapUrl = buildBaseMapUrl(bbox);
    const mapImg = await loadImageEl(mapUrl, "base map");
    if (mapImg) {
      const off = document.createElement("canvas");
      off.width = CARD_W; off.height = CARD_H;
      const offCtx = off.getContext("2d");
      offCtx.drawImage(mapImg, 0, 0, CARD_W, CARD_H);
      offCtx.globalCompositeOperation = "destination-in";
      const mask = offCtx.createRadialGradient(cx, CARD_H * 0.5, 150, cx, CARD_H * 0.5, 820);
      mask.addColorStop(0, "rgba(0,0,0,1)");
      mask.addColorStop(0.55, "rgba(0,0,0,0.85)");
      mask.addColorStop(1, "rgba(0,0,0,0)");
      offCtx.fillStyle = mask;
      offCtx.fillRect(0, 0, CARD_W, CARD_H);
      offCtx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = heroImg ? 0.55 : 1;
      ctx.drawImage(off, 0, 0);
      ctx.globalAlpha = 1;
      mapDrawn = true;
    }
  }

  if (!heroImg && !mapDrawn) {
    drawRoadLines(ctx, cx, 330);
  }

  const shadowText = (text, x, y) => {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };

  // --- Layer 3: the planned route, DASHED (not solid — this hasn't been
  // driven yet), with named waypoint dots and labels. Projected with the
  // SAME bbox the base map was requested with, so it lines up correctly. ---
  if (hasWaypoints && bbox) {
    const pts = waypoints.map(w => projectPoint(w.lng, w.lat, bbox, CARD_W, CARD_H));
    // The dashed line follows the drivable route when Directions found one
    // (Session 30), otherwise the old straight line between the stops.
    const linePts = routePts ? routePts.map(w => projectPoint(w.lng, w.lat, bbox, CARD_W, CARD_H)) : pts;
    ctx.beginPath();
    ctx.moveTo(linePts[0][0], linePts[0][1]);
    for (let i = 1; i < linePts.length; i++) ctx.lineTo(linePts[i][0], linePts[i][1]);
    ctx.strokeStyle = C.champagne;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.setLineDash([14, 14]);
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

    ctx.textAlign = "left";
    ctx.font = "600 24px 'Josefin Sans'";
    // Session 29 fix: suppress a waypoint's LABEL TEXT (not its dot) once
    // it falls inside the trip-info title zone reserved lower on the card.
    // A fixed downward shift of the title block (the first attempt at this
    // fix) only worked for THIS trip's specific waypoint layout — a
    // different run's waypoints could land anywhere, so the real fix is
    // making the title zone off-limits to labels generally, not guessing
    // better fixed coordinates. titleZoneTop mirrors the same
    // photoOrMapDrawn logic midY uses below, computed early since layering
    // order means labels get drawn before that section runs.
    const titleZoneTop = (mapDrawn || !!heroImg) ? 1160 - 100 : 680 - 100;
    waypoints.forEach((w, i) => {
      const [x, y] = pts[i];
      ctx.fillStyle = i === 0 ? C.champagne : (i === waypoints.length - 1 ? C.red : C.bone);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      if (y < titleZoneTop) {
        // Session 30: a stop near the right-hand edge (Caloundra, on a
        // real invite) had its label cut off by the card edge — flip those
        // labels to the left of their dot instead.
        if (x + 16 + ctx.measureText(w.label).width > CARD_W - 24) {
          ctx.textAlign = "right";
          shadowText(w.label, x - 16, y + 8);
          ctx.textAlign = "left";
        } else {
          shadowText(w.label, x + 16, y + 8);
        }
      }
    });
    ctx.textAlign = "center";
  }

  ctx.textAlign = "center";
  const photoOrMapDrawn = mapDrawn || !!heroImg;

  // Wordmark — same treatment as drawTripCard.
  const wordmarkText = "Chasin’ Curves";
  const wordmarkSize = fitText(ctx, wordmarkText, CARD_W - 120, 150, 60, s => `700 ${s}px 'Cormorant Garamond'`);
  const wordmarkY = photoOrMapDrawn ? 70 + wordmarkSize * 0.6 : 450 + wordmarkSize * 0.6;
  ctx.fillStyle = C.champagne;
  ctx.font = `700 ${wordmarkSize}px 'Cormorant Garamond'`;
  shadowText(wordmarkText, cx, wordmarkY);
  ctx.fillStyle = photoOrMapDrawn ? "rgba(245,243,238,0.75)" : C.dim;
  ctx.font = "600 16px 'Josefin Sans'";
  shadowText("R O A D S ,   R I V E R S   &   R I F F S", cx, wordmarkY + wordmarkSize * 0.22 + 12);

  // Trip info — pinned toward the bottom, same darkened zone as
  // drawTripCard's stats block. Session 29 fix: midY nudged down from
  // 1000 to 1160 — with a full waypoint set (this trip has 7), the
  // dashed route + labels spread further down the card than a typical
  // GPS trail does, so the old position overlapped the busiest part of
  // the map. Line spacing tightened slightly (55/100/145 → 42/78/114)
  // to compensate and still land comfortably above the byline at 1300.
  const midY = photoOrMapDrawn ? 1160 : 680;
  const titleSize = fitText(ctx, title, CARD_W - 140, 88, 48, s => `700 ${s}px 'Cormorant Garamond'`);
  ctx.fillStyle = C.bone;
  ctx.font = `700 ${titleSize}px 'Cormorant Garamond'`;
  shadowText(title, cx, midY);

  // Session 30: date and time are optional when a run is planned (an
  // initial invite, details to be sorted with the group) — say so on the
  // poster instead of leaving a blank line.
  const whenText = dateLabel
    ? (timeLabel ? `${dateLabel} · ${timeLabel}` : `${dateLabel} · time TBC`)
    : (timeLabel ? `${timeLabel} · date TBC` : "Date & time TBC");
  ctx.fillStyle = C.champagneLight;
  ctx.font = "600 30px 'Josefin Sans'";
  shadowText(whenText, cx, midY + 42);

  if (hasWaypoints) {
    ctx.fillStyle = "rgba(245,243,238,0.8)";
    ctx.font = "400 26px 'Josefin Sans'";
    shadowText(`Meeting at ${waypoints[0].label}`, cx, midY + 78);
  }

  if (roadNames && roadNames.length) {
    ctx.fillStyle = C.champagne;
    ctx.font = "500 24px 'Josefin Sans'";
    shadowText(roadNames.join(" • "), cx, midY + 114);
  }

  ctx.fillStyle = "rgba(245,243,238,0.55)";
  ctx.font = "400 22px 'Josefin Sans'";
  const bylineParts = [vehicleLabel, organiserDisplayName ? `Hosted by ${organiserDisplayName}` : null, goingCount ? `${goingCount} going` : null].filter(Boolean);
  shadowText(bylineParts.join(" · "), cx, 1312);

  return new Promise(resolve => canvas.toBlob(blob => { if (blob) blob.routeNote = routeNote; resolve(blob); }, "image/png", 0.95));
};

// Session 16n — "Share My Ride": a brag card for a single garage vehicle,
// built from the same visual language as the trip postcard (full-bleed
// hero photo, sepia treatment, Chasin' Curves wordmark) but showing
// vehicle details instead of a trip's distance/route. No link or handle
// on it yet — nothing worth printing on a shared card until Chasin'
// Curves has its own short domain the way scvd.app already exists for
// the portfolio; "Invite a Mate" covers the "how do I get this" question
// in the meantime.
const drawVehicleCard = async ({ vehicle, member, heroUrl }) => {
  await ensureFontsLoaded();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = CARD_W / 2;

  ctx.fillStyle = C.midnight;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const heroImg = heroUrl ? await loadImageEl(heroUrl, "vehicle hero photo") : null;
  if (heroImg) {
    const scale = Math.max(CARD_W / heroImg.width, CARD_H / heroImg.height);
    const dw = heroImg.width * scale, dh = heroImg.height * scale;
    const dx = (CARD_W - dw) / 2, dy = (CARD_H - dh) / 2;
    ctx.filter = "sepia(35%) grayscale(20%) brightness(0.55) contrast(1.1)";
    ctx.drawImage(heroImg, dx, dy, dw, dh);
    ctx.filter = "none";
    // Heavier toward the bottom than the trip card's radial scrim — this
    // card's whole text block lives in that zone, with no map layer
    // fighting for the same space, so it can afford to protect it harder.
    const scrim = ctx.createLinearGradient(0, 0, 0, CARD_H);
    scrim.addColorStop(0, "rgba(13,13,13,0.25)");
    scrim.addColorStop(0.55, "rgba(13,13,13,0.35)");
    scrim.addColorStop(1, "rgba(13,13,13,0.92)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, CARD_W, CARD_H);
  } else {
    drawRoadLines(ctx, cx, 330);
  }

  const shadowText = (text, x, y) => {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };

  ctx.textAlign = "center";

  const titleText = `${vehicle.year || ""} ${vehicle.make} ${vehicle.model}`.trim();
  const titleSize = fitText(ctx, titleText, CARD_W - 120, 76, 40, s => `700 ${s}px 'Cormorant Garamond'`);

  // Session 16t — wordmark sized to match the vehicle title's weight
  // (was a small fixed 54px against a title that could run up to 76px),
  // per Scott's note that the header/footer imbalance was really just
  // this size mismatch once the margins themselves checked out fine.
  // Starts at titleSize and only shrinks further if "Chasin' Curves"
  // itself doesn't fit that wide — same bounded-fit approach as the
  // trip postcard's wordmark.
  const wordmarkText = "Chasin’ Curves";
  const wordmarkSize = fitText(ctx, wordmarkText, CARD_W - 120, titleSize, 40, s => `700 ${s}px 'Cormorant Garamond'`);
  const wordmarkY = heroImg ? 70 + wordmarkSize * 0.6 : 450 + wordmarkSize * 0.6;
  ctx.fillStyle = C.champagne;
  ctx.font = `700 ${wordmarkSize}px 'Cormorant Garamond'`;
  shadowText(wordmarkText, cx, wordmarkY);
  ctx.fillStyle = heroImg ? "rgba(245,243,238,0.75)" : C.dim;
  ctx.font = "600 16px 'Josefin Sans'";
  shadowText("R O A D S ,   R I V E R S   &   R I F F S", cx, wordmarkY + wordmarkSize * 0.22 + 12);

  if (vehicle.primary) {
    ctx.fillStyle = C.champagneLight;
    ctx.font = "600 20px 'Josefin Sans'";
    shadowText("★  P R I M A R Y   R I D E", cx, heroImg ? 970 : 600);
  }

  const titleY = heroImg ? 1040 : 670;
  ctx.fillStyle = C.champagne;
  ctx.font = `700 ${titleSize}px 'Cormorant Garamond'`;
  shadowText(titleText, cx, titleY);

  const subtitleParts = [vehicle.variant, vehicle.colour].filter(Boolean);
  if (subtitleParts.length) {
    ctx.fillStyle = C.bone;
    ctx.font = "400 30px 'Josefin Sans'";
    shadowText(subtitleParts.join(" · "), cx, titleY + 48);
  }

  if (vehicle.notes) {
    ctx.fillStyle = "rgba(245,243,238,0.75)";
    ctx.font = "400 24px 'Josefin Sans'";
    const capped = vehicle.notes.length > 90 ? vehicle.notes.slice(0, 87) + "…" : vehicle.notes;
    shadowText(capped, cx, titleY + 95);
  }

  if (member?.displayName) {
    ctx.fillStyle = "rgba(245,243,238,0.55)";
    ctx.font = "400 22px 'Josefin Sans'";
    shadowText(`From the garage of ${member.displayName}`, cx, 1300);
  }

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/png", 0.95));
};
// ─── SEASON'S GREETINGS CARD ─────────────────────────────────
// "Merry Christmas from Scott and their 2005 BMW Z4": the vehicle's hero photo
// with the brand's gold dotted road, a tinsel garland, mistletoe and candy
// canes, all drawn by hand on canvas in the same way as drawVehicleCard and
// drawTripInviteCard. Shared through the OS share sheet with the same
// ?invite= link "Invite a Mate" uses, so every card carries the app with it.
// Everything festive is generated from a seeded random source (the vehicle's
// id), so each vehicle gets its own slightly different tinsel but the same
// vehicle always gets the same card.
const XMAS_GREETINGS = ["Merry Christmas", "Happy Holidays", "Season\u2019s Greetings", "Happy New Year"];
const XMAS_GREEN = "#2E6B3F", XMAS_GREEN_LIGHT = "#4C9A62", XMAS_GREEN_DARK = "#1E4A2B";

// After Boxing Day the default greeting flips to Happy New Year.
const defaultXmasGreeting = () => {
  const d = new Date();
  return (d.getMonth() === 11 && d.getDate() >= 27) || (d.getMonth() === 0 && d.getDate() <= 6) ? XMAS_GREETINGS[3] : XMAS_GREETINGS[0];
};

// Card shows from 1 Dec to 6 Jan. Add ?xmas=1 to the app URL to try it any time of year.
const isXmasSeason = () => {
  try {
    if (new URLSearchParams(window.location.search).get("xmas") === "1") return true;
  } catch { /* no window.location: fall through to the date check */ }
  const d = new Date();
  return d.getMonth() === 11 || (d.getMonth() === 0 && d.getDate() <= 6);
};

const seededRandom = (seedStr) => {
  let h = 1779033703 ^ String(seedStr).length;
  for (let i = 0; i < String(seedStr).length; i++) {
    h = Math.imul(h ^ String(seedStr).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// A strand of tinsel along a quadratic curve: a gold core with short glittering
// bristles either side, plus a few bright glints.
const drawTinselSwag = (ctx, ax, ay, cx, cy, bx, by, rng) => {
  const pt = t => ({ x: (1 - t) * (1 - t) * ax + 2 * (1 - t) * t * cx + t * t * bx, y: (1 - t) * (1 - t) * ay + 2 * (1 - t) * t * cy + t * t * by });
  const tan = t => ({ x: 2 * (1 - t) * (cx - ax) + 2 * t * (bx - cx), y: 2 * (1 - t) * (cy - ay) + 2 * t * (by - cy) });
  const cols = [C.champagneLight, C.champagne, "#F0E2B0", "#FFF6D6", "#B8912F", C.bone];
  ctx.save();
  ctx.lineCap = "round";
  const steps = 300;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, p = pt(t), d = tan(t), len = Math.hypot(d.x, d.y) || 1;
    const tx = d.x / len, ty = d.y / len, nx = -ty, ny = tx;
    for (let side = -1; side <= 1; side += 2) {
      const L = 14 + rng() * 22, slant = (rng() - 0.5) * 0.9;
      const ex = p.x + (nx * Math.cos(slant) + tx * Math.sin(slant)) * L * side;
      const ey = p.y + (ny * Math.cos(slant) + ty * Math.sin(slant)) * L * side;
      ctx.strokeStyle = cols[Math.floor(rng() * cols.length)];
      ctx.globalAlpha = 0.5 + rng() * 0.45;
      ctx.lineWidth = 1.4 + rng() * 1.8;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
    }
  }
  // twisted core
  ctx.globalAlpha = 1;
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  ctx.strokeStyle = C.champagne; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.stroke();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "#FFF6D6"; ctx.globalAlpha = 0.6; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ax, ay - 1); ctx.quadraticCurveTo(cx, cy - 1, bx, by - 1); ctx.stroke();
  // glints
  ctx.globalAlpha = 0.95; ctx.fillStyle = "#FFFFFF";
  for (let g = 0; g < 16; g++) {
    const p = pt(0.04 + rng() * 0.92), r = 1.6 + rng() * 2.4;
    ctx.beginPath(); ctx.arc(p.x + (rng() - 0.5) * 22, p.y + (rng() - 0.5) * 22, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
};

const drawBauble = (ctx, x, y, r) => {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 10; ctx.shadowOffsetY = 5;
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, "#E86A5B"); g.addColorStop(0.55, C.red); g.addColorStop(1, "#7E231A");
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.fillStyle = C.champagne; ctx.fillRect(x - r * 0.28, y - r - r * 0.22, r * 0.56, r * 0.3);
  ctx.strokeStyle = C.champagne; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y - r - r * 0.42, r * 0.16, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.18, r * 0.11, -0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

const drawBow = (ctx, x, y, s) => {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
  const dark = "#7E231A";
  const tail = (dir) => {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(0, 6);
    ctx.quadraticCurveTo(dir * 12, 34, dir * 28, 62); ctx.lineTo(dir * 14, 58); ctx.lineTo(dir * 8, 70);
    ctx.quadraticCurveTo(dir * 2, 34, 0, 6); ctx.closePath(); ctx.fill();
  };
  tail(-1); tail(1);
  const loop = (dir) => {
    const g = ctx.createLinearGradient(0, -30, dir * 60, 20);
    g.addColorStop(0, "#E0574A"); g.addColorStop(1, C.red);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(dir * 20, -46, dir * 66, -44, dir * 62, -6);
    ctx.bezierCurveTo(dir * 60, 26, dir * 20, 24, 0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(dir * 12, -8); ctx.bezierCurveTo(dir * 26, -26, dir * 44, -26, dir * 54, -12); ctx.stroke();
  };
  loop(-1); loop(1);
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const kg = ctx.createRadialGradient(-3, -4, 1, 0, 0, 13);
  kg.addColorStop(0, "#E0574A"); kg.addColorStop(1, dark);
  ctx.fillStyle = kg; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
};

// A mistletoe sprig, stem running along +x from the origin (where the bow sits).
// mirror flips it horizontally so a pair can frame the card.
const drawMistletoe = (ctx, x, y, angle, scale, mirror, rng) => {
  ctx.save(); ctx.translate(x, y); ctx.rotate(mirror ? -angle : angle); ctx.scale(mirror ? -scale : scale, scale);
  ctx.lineCap = "round";
  const leaf = (lx, ly, ang, len) => {
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang);
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    const g = ctx.createLinearGradient(0, -len * 0.3, len, len * 0.3);
    g.addColorStop(0, XMAS_GREEN_DARK); g.addColorStop(0.5, XMAS_GREEN); g.addColorStop(1, XMAS_GREEN_LIGHT);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.bezierCurveTo(len * 0.2, -len * 0.3, len * 0.78, -len * 0.34, len, 0);
    ctx.bezierCurveTo(len * 0.78, len * 0.34, len * 0.2, len * 0.3, 0, 0); ctx.closePath(); ctx.fill();
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(200,235,205,0.45)"; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(len * 0.06, 0); ctx.lineTo(len * 0.9, 0); ctx.stroke();
    ctx.restore();
  };
  const berry = (bx, by, r) => {
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.35, r * 0.1, bx, by, r);
    g.addColorStop(0, "#FFFFFF"); g.addColorStop(0.7, "#EDE9DD"); g.addColorStop(1, "#BDB7A2");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  };
  const stem = (x0, y0, x1, y1, w) => {
    ctx.strokeStyle = "#5C4A2A"; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  };
  const branch = (bx, by, dirAng, len, depth) => {
    const ex = bx + Math.cos(dirAng) * len, ey = by + Math.sin(dirAng) * len;
    stem(bx, by, ex, ey, depth ? 4 : 5);
    const spread = 0.62;
    leaf(ex, ey, dirAng - spread, 96 + rng() * 14);
    leaf(ex, ey, dirAng + spread, 96 + rng() * 14);
    leaf(ex, ey, dirAng + (rng() - 0.5) * 0.3, 70 + rng() * 10);
    berry(ex - 5, ey - 4, 10); berry(ex + 8, ey + 3, 10); berry(ex + 1, ey + 11, 9);
  };
  // main stem and three forks
  stem(0, 0, 210, 6, 6);
  branch(60, 1, -0.55, 74, 0);
  branch(60, 1, 0.55, 74, 0);
  branch(130, 3, -0.4, 66, 1);
  branch(130, 3, 0.62, 66, 1);
  branch(210, 6, 0, 30, 1);
  ctx.restore();
};

// Candy cane standing on the bottom edge. hook = +1 curls right, -1 curls left.
const drawCandyCane = (ctx, baseX, baseY, height, hook, tilt) => {
  const W = 34, R = 50;
  const y1 = baseY - height + R; // top of the straight section
  const pts = [];
  for (let y = baseY + 20; y >= y1; y -= 2) pts.push({ x: baseX, y });
  const cxc = baseX + hook * R;
  for (let a = 0; a <= 1.02; a += 0.01) {
    const th = hook > 0 ? Math.PI + a * Math.PI : -a * Math.PI;
    pts.push({ x: cxc + R * Math.cos(th), y: y1 + R * Math.sin(th) });
  }
  // arclength + normals
  const cum = [0], nrm = [];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    nrm.push({ x: -dy / l, y: dx / l });
  }
  const at = (s) => {
    let i = 1; while (i < pts.length - 1 && cum[i] < s) i++;
    const f = Math.max(0, Math.min(1, (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1)));
    return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f,
             nx: nrm[i - 1].x + (nrm[i].x - nrm[i - 1].x) * f, ny: nrm[i - 1].y + (nrm[i].y - nrm[i - 1].y) * f };
  };
  const total = cum[cum.length - 1];
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts) ctx.lineTo(p.x, p.y); };

  ctx.save();
  ctx.translate(baseX, baseY); ctx.rotate(tilt); ctx.translate(-baseX, -baseY);
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
  path(); ctx.strokeStyle = "#2a0d09"; ctx.lineWidth = W + 5; ctx.stroke();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  path(); ctx.strokeStyle = C.bone; ctx.lineWidth = W; ctx.stroke();
  // slanted red stripes following the curve
  const period = 46, stripe = 21, slant = W * 0.95, h = W / 2;
  ctx.fillStyle = C.red;
  for (let s0 = -period; s0 < total; s0 += period) {
    const s1 = s0 + stripe;
    const poly = [];
    for (let s = s0; s <= s1; s += 3) { const p = at(Math.max(0, Math.min(total, s))); poly.push({ x: p.x + p.nx * h, y: p.y + p.ny * h }); }
    for (let s = s1 + slant; s >= s0 + slant; s -= 3) { const p = at(Math.max(0, Math.min(total, s))); poly.push({ x: p.x - p.nx * h, y: p.y - p.ny * h }); }
    ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.fill();
  }
  // soft gloss along one edge
  ctx.strokeStyle = "rgba(255,255,255,0.28)"; ctx.lineWidth = 5;
  ctx.beginPath();
  pts.forEach((p, i) => { const q = at(cum[i]); const gx = q.x + q.nx * (-h * 0.42), gy = q.y + q.ny * (-h * 0.42); i ? ctx.lineTo(gx, gy) : ctx.moveTo(gx, gy); });
  ctx.stroke();
  ctx.restore();
};

const drawChristmasCard = async ({ vehicle, member, heroUrl, heroImg: preloaded, greeting, message }) => {
  await ensureFontsLoaded();
  const canvas = document.createElement("canvas");
  canvas.width = CARD_W; canvas.height = CARD_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = CARD_W / 2;
  const rng = seededRandom(`${vehicle.id || vehicle.make}-xmas`);

  ctx.fillStyle = C.midnight;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 1. hero photo, a touch warmer and lighter than the postcard so it feels festive
  const heroImg = preloaded || (heroUrl ? await loadImageEl(heroUrl, "vehicle hero photo") : null);
  if (heroImg) {
    const scale = Math.max(CARD_W / heroImg.width, CARD_H / heroImg.height);
    const dw = heroImg.width * scale, dh = heroImg.height * scale;
    ctx.filter = "sepia(28%) grayscale(10%) brightness(0.66) contrast(1.1)";
    ctx.drawImage(heroImg, (CARD_W - dw) / 2, (CARD_H - dh) / 2, dw, dh);
    ctx.filter = "none";
  } else {
    const glow = ctx.createRadialGradient(cx, 520, 40, cx, 520, 760);
    glow.addColorStop(0, "rgba(201,168,76,0.20)"); glow.addColorStop(1, "rgba(13,13,13,0)");
    ctx.fillStyle = glow; ctx.fillRect(0, 0, CARD_W, CARD_H);
    drawRoadLines(ctx, cx, 560);
    // no photo: a light dusting of snow so the card still feels finished
    ctx.fillStyle = C.bone;
    for (let i = 0; i < 110; i++) {
      ctx.globalAlpha = 0.12 + rng() * 0.5;
      ctx.beginPath(); ctx.arc(60 + rng() * (CARD_W - 120), 300 + rng() * 560, 1.5 + rng() * 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const scrim = ctx.createLinearGradient(0, 0, 0, CARD_H);
  scrim.addColorStop(0, "rgba(13,13,13,0.62)");
  scrim.addColorStop(0.20, "rgba(13,13,13,0.20)");
  scrim.addColorStop(0.55, "rgba(13,13,13,0.12)");
  scrim.addColorStop(0.70, "rgba(13,13,13,0.45)");
  scrim.addColorStop(0.82, "rgba(13,13,13,0.80)");
  scrim.addColorStop(1, "rgba(13,13,13,0.95)");
  ctx.fillStyle = scrim; ctx.fillRect(0, 0, CARD_W, CARD_H);

  // 2. thin gold keyline, drawn first so the garland hangs across it
  ctx.strokeStyle = "rgba(201,168,76,0.55)"; ctx.lineWidth = 2.5;
  const fr = 34;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(fr, fr, CARD_W - fr * 2, CARD_H - fr * 2, 26);
  else ctx.rect(fr, fr, CARD_W - fr * 2, CARD_H - fr * 2);
  ctx.stroke();

  const shadowText = (text, x, y) => {
    ctx.shadowColor = "rgba(0,0,0,0.85)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };
  ctx.textAlign = "center";

  // 3. wordmark under the garland
  const wordmarkText = "Chasin\u2019 Curves";
  const wmSize = fitText(ctx, wordmarkText, CARD_W - 360, 84, 44, s => `700 ${s}px 'Cormorant Garamond'`);
  ctx.fillStyle = C.champagne;
  ctx.font = `700 ${wmSize}px 'Cormorant Garamond'`;
  shadowText(wordmarkText, cx, 262);
  ctx.fillStyle = "rgba(245,243,238,0.8)";
  ctx.font = "600 16px 'Josefin Sans'";
  shadowText("R O A D S ,   R I V E R S   &   R I F F S", cx, 262 + 34);

  // 4. dotted gold road with a red pin, the brand's route motif
  const roadY = 905;
  ctx.save();
  ctx.strokeStyle = C.champagne; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.setLineDash([1, 20]);
  ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 6;
  ctx.beginPath(); ctx.moveTo(210, roadY + 26); ctx.bezierCurveTo(400, roadY - 46, 640, roadY + 74, 870, roadY);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = C.champagne; ctx.beginPath(); ctx.arc(210, roadY + 26, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(870, roadY, 11, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.bone; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(870, roadY, 11, 0, Math.PI * 2); ctx.stroke();

  // 5. the message
  const textMax = CARD_W - 420;
  const greet = greeting || XMAS_GREETINGS[0];
  const gSize = fitText(ctx, greet, textMax, 132, 64, s => `700 ${s}px 'Cormorant Garamond'`);
  ctx.fillStyle = C.champagneLight;
  ctx.font = `700 ${gSize}px 'Cormorant Garamond'`;
  shadowText(greet, cx, 1038);

  const who = member?.displayName || "a mate";
  const rideName = `${vehicle.year || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.replace(/\s+/g, " ").trim();
  const fromLine = `from ${who} and their ${rideName}`;
  const fSize = fitText(ctx, fromLine, textMax, 36, 22, s => `400 ${s}px 'Josefin Sans'`);
  ctx.fillStyle = C.bone;
  ctx.font = `400 ${fSize}px 'Josefin Sans'`;
  shadowText(fromLine, cx, 1100);

  const note = (message || "").trim();
  if (note) {
    const nSize = fitText(ctx, note, textMax, 30, 20, s => `400 ${s}px 'Josefin Sans'`);
    ctx.fillStyle = "rgba(245,243,238,0.82)";
    ctx.font = `400 ${nSize}px 'Josefin Sans'`;
    shadowText(note, cx, 1160);
  }

  // 6. tinsel garland hanging across the top, anchored by a bow and mistletoe at each corner
  drawTinselSwag(ctx, -40, 44, 275, 250, 540, 62, rng);
  drawTinselSwag(ctx, 540, 62, 805, 250, 1120, 44, rng);
  drawBauble(ctx, 540, 64, 19);
  drawMistletoe(ctx, 78, 68, 0.30, 0.72, false, rng);
  drawMistletoe(ctx, CARD_W - 78, 68, 0.30, 0.72, true, rng);
  drawBow(ctx, 78, 68, 0.85);
  drawBow(ctx, CARD_W - 78, 68, 0.85);

  // 7. candy canes standing in the bottom corners
  drawCandyCane(ctx, 92, CARD_H + 6, 250, 1, -0.07);
  drawCandyCane(ctx, CARD_W - 92, CARD_H + 6, 250, -1, 0.07);

  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), "image/png", 0.95));
};

// Mapbox instance, so a recorded trip's data is actually visible rather
// than just a point count. Deliberately not the drag-to-select Road
// extraction UI from snail-trail-road-extraction.md — that's a separate,
// later build; this is only phase 2, capture + confirm-it-worked.
const TrailViewerModal = ({ entry, vehicleName, member, onClose }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);
  const points = clipTrailForPrivacy(entry.trail || [], member);

  useEffect(() => {
    if (!window.mapboxgl || MAPBOX_TOKEN.includes("PASTE_YOUR") || points.length === 0) {
      setMapFailed(true);
      return;
    }
    window.mapboxgl.accessToken = MAPBOX_TOKEN;
    const coords = points.map(p => [p.lng, p.lat]);
    const map = new window.mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: coords[Math.floor(coords.length / 2)],
      zoom: 11,
      attributionControl: false,
    });
    map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      map.addSource("trail", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
      map.addLayer({ id: "trail-line", type: "line", source: "trail", paint: { "line-color": C.champagne, "line-width": 3 } });

      new window.mapboxgl.Marker({ color: "#2ecc71" }).setLngLat(coords[0]).addTo(map);
      new window.mapboxgl.Marker({ color: C.red }).setLngLat(coords[coords.length - 1]).addTo(map);

      const bounds = coords.reduce((b, c) => b.extend(c), new window.mapboxgl.LngLatBounds(coords[0], coords[0]));
      map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
      mapRef.current = map;
    });
    map.on("error", () => setMapFailed(true));

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  return (
    <Modal title="GPS Trail" subtitle={`${vehicleName} · ${points.length} point${points.length !== 1 ? "s" : ""} · ${new Date(entry.timestamp).toLocaleDateString('en-AU')}`} onClose={onClose} wide>
      <div style={{ position: "relative", height: 320, borderRadius: 8, overflow: "hidden", background: "#0a0f14" }}>
        <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />
        {mapFailed && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 12, textAlign: "center", padding: 20 }}>
            {points.length === 0
              ? ((entry.trail || []).length > 0 ? "Entire trip was inside your home privacy radius — nothing to show." : "No points recorded for this trip.")
              : "Map unavailable."}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
};

// Session 16f — was "Share a Day" (rolled every logged leg for a calendar
// day into one card automatically). Dropped after a real card came back a
// nonsense blob-shaped route: two unrelated trips (LandCruiser, then the
// Z4) landed on the same calendar day, and the day-rollup happily drew a
// straight line from the end of one car's route to the start of the
// other's, on top of a "Multiple vehicles" label that told nobody
// anything useful. A day is the wrong *automatic* sharing unit.
//
// Session 16g — but combining trips is still genuinely useful (a lazy
// Sunday out in the Z4, several stops, one postcard for the whole run) —
// the problem was never combining, it was combining *without being asked*.
// So: every completed log entry is its own shareable row (unchanged from
// 16f) with its own one-tap Share button, PLUS a checkbox on each row —
// tick two or more and a "Share Combined" bar appears. Combining is now
// something the person doing the sharing decides, leg by leg, instead of
// something the calendar decides for them.
// Session 30 — RoadSegmentPicker rebuilt for pulling a SHORT section out of
// a long drive (Scott's real use: a 100km trip, a 5km stretch worth adding).
// What changed from Session 17, and why:
//  - Two sliders (start / end) for the rough pick, because grabbing a small
//    section by dragging pins on a map zoomed out to the whole drive is
//    fiddly on a phone. Each slider shows how far into the drive it sits.
//  - "Zoom to section" / "Whole drive" buttons, so the pins can be fine-
//    tuned once the map is zoomed in. Pins still drag and still snap to
//    real trail points, exactly as before.
//  - Pins are always kept in driving order (start before end), and a pin
//    dropped away from the trail snaps back onto it straight away.
//  - Drive time is now worked out from the trail's own timestamps instead
//    of being left blank (skipped if the trail has a gap — a paused tab
//    or a dropped GPS fix would otherwise inflate it).
//  - Country / state / nearest-town region and (when Mapbox agrees with
//    itself along the section) the road name are looked up and prefilled.
//    All best-effort: any failure or a 5s timeout just leaves those fields
//    blank for the member to type, same as before. The member still
//    reviews everything in the Add a Road form before submitting.
const ROAD_TIME_MAX_GAP_MS = 5 * 60 * 1000; // ~15x the 20s GPS poll interval
const ROAD_PATH_MAX_POINTS = 300; // stored with the road; worker.js thins anything bigger than 400
const AU_STATE_CODES = ["QLD", "NSW", "VIC", "TAS", "SA", "WA", "NT", "ACT"];

const trailSegmentDuration = (seg) => {
  if (!seg || seg.length < 2) return "";
  let ms = 0;
  for (let i = 1; i < seg.length; i++) {
    const dt = seg[i].t - seg[i - 1].t;
    if (!Number.isFinite(dt) || dt < 0 || dt > ROAD_TIME_MAX_GAP_MS) return "";
    ms += dt;
  }
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h}h ${m}min` : `${h}h`;
};

// Nearest town + state + country for one point. Same Mapbox call the
// postcard uses (types=place, limit=1), but keeps the context too.
const reverseGeocodeDetails = async (lat, lng) => {
  try {
    const res = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?types=place&limit=1&access_token=${MAPBOX_TOKEN}`);
    const data = await res.json();
    const f = data?.features?.[0];
    if (!f) return null;
    const regionCtx = f.context?.find(c => c.id.startsWith("region"));
    const countryCtx = f.context?.find(c => c.id.startsWith("country"));
    const countryCode = countryCtx?.short_code?.toUpperCase();
    const country = countryCode && COUNTRIES[countryCode] ? countryCode : "";
    const stateCode = regionCtx?.short_code?.split("-")[1]?.toUpperCase();
    const state = country === "AU" && AU_STATE_CODES.includes(stateCode) ? stateCode : "";
    return { place: f.text || "", state, country };
  } catch { return null; }
};

// Asks Mapbox what road sits under five points spread along the section,
// and only suggests a name if the same one turns up at least 3 times —
// so a section that hops between roads gets a blank name, not a guess.
const suggestRoadName = async (seg) => {
  try {
    const n = seg.length;
    const picks = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => seg[Math.min(n - 1, Math.round((n - 1) * f))]);
    const skip = ["path", "pedestrian", "track", "service", "ferry", "golf"];
    const perPoint = await Promise.all(picks.map(async p => {
      const res = await fetch(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery/${p.lng},${p.lat}.json?layers=road&radius=30&limit=10&access_token=${MAPBOX_TOKEN}`);
      const data = await res.json();
      const names = new Set();
      (data?.features || []).forEach(f => {
        const nm = f.properties?.name;
        if (nm && !skip.includes(f.properties?.class)) names.add(nm);
      });
      return names;
    }));
    const tally = {};
    perPoint.forEach(set => set.forEach(nm => { tally[nm] = (tally[nm] || 0) + 1; }));
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] >= 3 ? best[0] : "";
  } catch { return ""; }
};

// Session 30: the driven line of the picked section, stored with the road
// (worker.js keeps it under its own key, not in the roads list) so run
// invites can draw the road's real shape. Douglas–Peucker simplification
// with a tolerance that widens until it fits ROAD_PATH_MAX_POINTS — GPS
// fixes are already ~500m apart at highway speed, so on a long section
// this mostly just thins the dead-straight stretches. Returns
// [[lat, lng], ...] at 5dp (~1m) — deliberately NO timestamps, so nothing
// about when or how fast you drove is published with the road. The trail
// this comes from is already privacy-clipped around the member's home.
const simplifyTrailPath = (seg, maxPoints = ROAD_PATH_MAX_POINTS) => {
  const n = seg.length;
  const r5 = v => Math.round(v * 1e5) / 1e5;
  if (n <= 2) return seg.map(p => [r5(p.lat), r5(p.lng)]);
  const cosLat = Math.cos(seg[0].lat * Math.PI / 180);
  const xy = seg.map(p => [p.lng * 111320 * cosLat, p.lat * 110540]); // metres, local flat projection
  const distToSeg = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  };
  const simplify = (tol) => {
    const keep = new Uint8Array(n);
    keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [i, j] = stack.pop();
      let maxD = -1, idx = -1;
      for (let k = i + 1; k < j; k++) {
        const d = distToSeg(xy[k], xy[i], xy[j]);
        if (d > maxD) { maxD = d; idx = k; }
      }
      if (maxD > tol) { keep[idx] = 1; stack.push([i, idx], [idx, j]); }
    }
    const out = [];
    for (let k = 0; k < n; k++) if (keep[k]) out.push(k);
    return out;
  };
  let tol = 8, idxs = simplify(tol);
  while (idxs.length > maxPoints && tol < 1000) { tol *= 1.5; idxs = simplify(tol); }
  if (idxs.length > maxPoints) { // still too many (pathological trail) — thin evenly
    const step = (idxs.length - 1) / (maxPoints - 1);
    idxs = Array.from({ length: maxPoints }, (_, i) => idxs[Math.round(i * step)]);
  }
  return idxs.map(k => [r5(seg[k].lat), r5(seg[k].lng)]);
};

const suggestRoadDetails = async (seg) => {
  const mid = seg[Math.floor(seg.length / 2)];
  const [geo, name] = await Promise.all([reverseGeocodeDetails(mid.lat, mid.lng), suggestRoadName(seg)]);
  return { name: name || "", region: geo?.place || "", state: geo?.state || "", country: geo?.country || "" };
};

// Pins snap to actual points in the (already privacy-clipped) trail —
// never freeform — so a pin can never land inside a member's obscured home
// zone, and every resulting road coordinate is provably a real driven point.
const RoadSegmentPicker = ({ trail, onConfirm, onCancel }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);
  const lastIdx = Math.max(1, trail.length - 1);
  const [pins, setPins] = useState({ s: 0, e: lastIdx }); // trail indices, always s < e
  const [mapReady, setMapReady] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const cumKm = useMemo(() => {
    const out = [0];
    for (let i = 1; i < trail.length; i++) {
      out.push(out[i - 1] + haversineKm(trail[i - 1].lat, trail[i - 1].lng, trail[i].lat, trail[i].lng));
    }
    return out;
  }, [trail]);

  const segment = trail.slice(pins.s, pins.e + 1);
  const segmentKm = (cumKm[pins.e] ?? 0) - (cumKm[pins.s] ?? 0);

  const nearestTrailIndex = (lngLat) => {
    let best = 0, bestDist = Infinity;
    trail.forEach((p, i) => {
      const d = haversineKm(p.lat, p.lng, lngLat.lat, lngLat.lng);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    return best;
  };

  // Keeps the two pins in driving order and never on the same point.
  const normalisePins = (a, b) => {
    let lo = Math.min(a, b), hi = Math.max(a, b);
    if (hi === lo) { if (hi < lastIdx) hi = lo + 1; else lo = hi - 1; }
    return { s: lo, e: hi };
  };

  const segmentGeoJSON = (seg) => ({
    type: "Feature",
    geometry: { type: "LineString", coordinates: seg.map(p => [p.lng, p.lat]) },
  });

  const fitTo = (pts, duration = 500) => {
    const map = mapRef.current;
    if (!map || !pts.length) return;
    const lngs = pts.map(p => p.lng), lats = pts.map(p => p.lat);
    map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, duration, maxZoom: 15 });
  };

  useEffect(() => {
    if (mapRef.current || !window.mapboxgl || trail.length < 2) return;
    window.mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new window.mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      attributionControl: false,
    });
    map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new window.mapboxgl.AttributionControl({ compact: true }));

    map.on("load", () => {
      const tint = (layer, prop, value) => { try { map.setPaintProperty(layer, prop, value); } catch {} };
      tint("water", "fill-color", "#0d1620");
      tint("land", "background-color", C.midnight);

      map.addSource("full-trail", {
        type: "geojson",
        data: { type: "Feature", geometry: { type: "LineString", coordinates: trail.map(p => [p.lng, p.lat]) } },
      });
      map.addLayer({
        id: "full-trail-line", type: "line", source: "full-trail",
        paint: { "line-color": C.dim || "#555", "line-width": 2, "line-opacity": 0.5 },
      });

      map.addSource("segment", { type: "geojson", data: segmentGeoJSON(segment) });
      map.addLayer({
        id: "segment-line", type: "line", source: "segment",
        paint: { "line-color": C.champagne, "line-width": 4 },
      });

      const lngs = trail.map(p => p.lng), lats = trail.map(p => p.lat);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 40, duration: 0 });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- trail is fixed for this modal's lifetime
  }, []);

  // Redraw the highlighted section and (re)position the pins whenever they move.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getSource("segment")?.setData(segmentGeoJSON(segment));

    const mkMarker = (ref, idx, color) => {
      const p = trail[idx];
      if (!ref.current) {
        const el = document.createElement("div");
        el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;cursor:grab;box-shadow:0 0 8px ${color}88;`;
        ref.current = new window.mapboxgl.Marker({ element: el, draggable: true }).setLngLat([p.lng, p.lat]).addTo(map);
      } else {
        ref.current.setLngLat([p.lng, p.lat]);
      }
    };
    mkMarker(startMarkerRef, pins.s, C.champagne);
    mkMarker(endMarkerRef, pins.e, C.blue || C.champagne);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins.s, pins.e, mapReady]);

  // Dragging a pin: snap to the nearest real trail point straight away,
  // then update the section (kept in driving order).
  useEffect(() => {
    const sm = startMarkerRef.current, em = endMarkerRef.current;
    if (!sm || !em) return;
    const snap = (marker, idx) => marker.setLngLat([trail[idx].lng, trail[idx].lat]);
    const onStartDragEnd = () => { const idx = nearestTrailIndex(sm.getLngLat()); snap(sm, idx); setPins(p => normalisePins(idx, p.e)); };
    const onEndDragEnd = () => { const idx = nearestTrailIndex(em.getLngLat()); snap(em, idx); setPins(p => normalisePins(p.s, idx)); };
    sm.on("dragend", onStartDragEnd);
    em.on("dragend", onEndDragEnd);
    return () => { sm.off("dragend", onStartDragEnd); em.off("dragend", onEndDragEnd); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady]);

  const handleConfirm = async () => {
    if (segment.length < 2 || lookingUp) return;
    setLookingUp(true);
    const first = segment[0], last = segment[segment.length - 1];
    const prefill = {
      startLat: String(first.lat), startLng: String(first.lng),
      endLat: String(last.lat), endLng: String(last.lng),
      distance: `${segmentKm.toFixed(1)}km`,
      path: simplifyTrailPath(segment),
      _prefilledFromTrip: true,
    };
    const duration = trailSegmentDuration(segment);
    if (duration) prefill.duration = duration;
    try {
      const details = await Promise.race([
        suggestRoadDetails(segment),
        new Promise(resolve => setTimeout(() => resolve(null), 5000)),
      ]);
      if (details) {
        if (details.name) prefill.name = details.name;
        if (details.region) prefill.region = details.region;
        if (details.country) prefill.country = details.country;
        if (details.state) prefill.state = details.state;
      }
    } catch { /* lookup is a nicety — the form just opens without it */ }
    setLookingUp(false);
    onConfirm(prefill);
  };

  if (trail.length < 2) {
    return <div style={{ padding: 20, fontSize: 13, color: C.dim, textAlign: "center" }}>
      Not enough trail data to pick a section — this drive's GPS trail was too short or fully privacy-clipped.
    </div>;
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 8, padding: "0 4px", lineHeight: 1.5 }}>
        Slide the two pins along your drive for a rough pick, tap Zoom to section, then drag the pins to fine-tune.
      </div>
      <div ref={mapContainer} style={{ height: "min(340px, 42vh)", borderRadius: 10, overflow: "hidden", border: `1px solid ${C.border}` }} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <Btn size="sm" variant="ghost" onClick={() => fitTo(segment)} style={{ flex: 1 }}>🔍 Zoom to section</Btn>
        <Btn size="sm" variant="ghost" onClick={() => fitTo(trail)} style={{ flex: 1 }}>Whole drive</Btn>
      </div>
      {[["Start", "s", C.champagne], ["End", "e", C.blue || C.champagne]].map(([label, key, color]) => (
        <div key={key} style={{ marginTop: 12, padding: "0 4px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <span style={{ color }}>{label} pin</span>
            <span style={{ color: C.muted }}>{(cumKm[pins[key]] ?? 0).toFixed(1)}km into the drive</span>
          </div>
          <input
            type="range" min={0} max={lastIdx} step={1} value={pins[key]}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              setPins(p => key === "s" ? { s: Math.min(v, p.e - 1), e: p.e } : { s: p.s, e: Math.max(v, p.s + 1) });
            }}
            style={{ width: "100%", accentColor: color }}
          />
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "0 4px" }}>
        <span style={{ fontSize: 13, color: C.champagne }}>{segmentKm.toFixed(1)}km selected</span>
        <span style={{ fontSize: 11, color: C.dim }}>{segment.length} of {trail.length} pts</span>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Btn variant="ghost" onClick={onCancel} disabled={lookingUp} style={{ flex: 1 }}>Not this one</Btn>
        <Btn onClick={handleConfirm} disabled={lookingUp} style={{ flex: 2 }}>{lookingUp ? "Looking up road details…" : "Add this section as a Road"}</Btn>
      </div>
    </div>
  );
};

const ShareDayModal = ({ logbook, garage, member, onClose, onProposeRoad }) => {
  // pickingRoadFor: the entry currently being turned into a road segment
  // pick, or null. Kept separate from the share/preview state above —
  // these are two independent actions off the same logged trip, not
  // alternatives to each other.
  const [pickingRoadFor, setPickingRoadFor] = useState(null);
  const [busy, setBusy] = useState(null); // build key currently in flight — see buildKey()
  const [preview, setPreview] = useState(null); // { url } — fallback when Web Share can't take files
  const [selected, setSelected] = useState(() => new Set()); // entry ids picked for a combined card

  const vehicleName = id => {
    const v = garage.find(veh => veh.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown vehicle";
  };

  // Only completed (odometer-closed) legs are shareable — that's what the
  // headline distance is built from.
  const shareable = (logbook || [])
    .filter(e => e.odometerEnd != null)
    .slice()
    .sort((a, b) => b.timestamp - a.timestamp);

  const buildKey = (entries) => entries.map(e => e.id).sort().join("|");

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Builds and shares a card from one or more entries, oldest to newest.
  // One entry behaves exactly as a single-trip card always has; two or
  // more concatenate their trails and sum their distance — the same math
  // the old day-rollup did, just run only over legs someone actually
  // chose, instead of everything that happened to share a calendar day.
  // Returns whether the card was actually built (so callers can decide
  // whether it's safe to clear the selection) — AbortError (the person
  // just backed out of the native share sheet) still counts as built.
  const buildAndShare = async (entries) => {
    const key = buildKey(entries);
    setBusy(key);
    setPreview(null);
    try {
      const ordered = entries.slice().sort((a, b) => a.timestamp - b.timestamp);
      const vehicleIds = Array.from(new Set(ordered.map(e => e.vehicleId)));
      // Session 16h: a combine used to leave heroUrl null for ANY
      // multi-vehicle selection — meaning a combined card fell all the way
      // back to map-only, and if the map image happened to fail too (as
      // one real card did), there was nothing left to show but a plain
      // dark background. Combined trips still tell one story even across
      // vehicles, so always resolve a real hero photo: the vehicle that
      // covered the most distance across the selected legs, not "no
      // vehicle at all." Mirrors GarageView's getVehicleHeroUrl exactly
      // (photos[heroPhoto] -> photos[0] -> avatar) — left duplicated here
      // deliberately rather than reaching into that component, since it's
      // a local helper there, not a shared one; worth promoting both to a
      // single top-level resolveVehicleHeroUrl(vehicle) if this needs a
      // third call site later, but not for one.
      const kmByVehicle = ordered.reduce((acc, e) => {
        acc[e.vehicleId] = (acc[e.vehicleId] || 0) + (e.odometerEnd - e.odometerStart);
        return acc;
      }, {});
      const heroVehicleId = Object.entries(kmByVehicle).sort((a, b) => b[1] - a[1])[0][0];
      const vehicleLabel = vehicleIds.length === 1
        ? vehicleName(heroVehicleId)
        : `${vehicleName(heroVehicleId)} + ${vehicleIds.length - 1} other${vehicleIds.length - 1 !== 1 ? "s" : ""}`;
      let heroUrl = null;
      const v = garage.find(veh => veh.id === heroVehicleId);
      if (v) {
        const photos = v.photos || [];
        const hero = v.heroPhoto ? photos.find(p => p.id === v.heroPhoto) : null;
        heroUrl = hero ? hero.url : (photos[0]?.url || v.avatar || null);
      }
      const startD = new Date(ordered[0].timestamp);
      const endD = new Date(ordered[ordered.length - 1].timestamp);
      const dateLabel = startD.toDateString() === endD.toDateString()
        ? startD.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
        : `${startD.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${endD.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}`;
      const distanceKm = ordered.reduce((sum, e) => sum + (e.odometerEnd - e.odometerStart), 0);
      const trail = ordered.flatMap(resolveEntryTrail);
      // Session 16q — 16p's diagnostic only covered one failure shape (raw
      // points present but not surviving into trail) and would stay silent
      // for the other shape (no raw points at all reaching this point,
      // which looks identical from outside — no alert either way). Rather
      // than guess a third time, this reports the real numbers every time
      // a trail-bearing share happens, so whichever shape it actually is
      // becomes visible instead of assumed.
      if (ordered.some(e => (e.trail?.length || 0) > 0) || trail.length > 0) {
        const rawCounts = ordered.map(e => `${e.id}: ${e.trail?.length || 0} raw pts`).join(", ");
        console.warn(`[Chasin' Curves] share trail check — ${rawCounts} | combined: ${trail.length} pts | member.obscureHomeLocation: ${!!member?.obscureHomeLocation}`);
      }
      const blob = await drawTripCard({ distanceKm, dateLabel, vehicleLabel, legCount: ordered.length, trail, heroUrl, member });
      if (!blob) throw new Error("card render unavailable");

      const file = new File([blob], "chasin-curves-trip.png", { type: "image/png" });
      const shareText = `${dateLabel} — ${Math.round(distanceKm)}km via Chasin' Curves 🏁`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Chasin' Curves", text: shareText });
      } else {
        // Desktop browsers and a few mobile ones support navigator.share
        // for text but not files (or neither) — either way, show the card
        // and let a manual download cover getting it into the chat.
        setPreview({ url: URL.createObjectURL(blob) });
      }
      return true;
    } catch (e) {
      if (e?.name !== "AbortError") {
        // Session 16u — the generic message told nobody, including us,
        // what actually failed. Every layer inside drawTripCard already
        // degrades gracefully on its own (missing photo, missing map,
        // missing geocode all just render a plainer card, never throw),
        // so anything that reaches this catch is a genuine, specific
        // failure — log it in full so it's diagnosable from the console,
        // and surface the real reason to whoever's looking rather than a
        // guess ("check your connection") that's often not the cause.
        console.error("[Chasin' Curves] share card build failed", e);
        alert(`Couldn't build the share card — ${e?.message || "something went wrong"}. Try again, and if it keeps happening let Scott know what the error above says.`);
        return false;
      }
      return true;
    } finally {
      setBusy(null);
    }
  };

  const handleShareSelected = async () => {
    const entries = shareable.filter(e => selected.has(e.id));
    if (entries.length < 2) return;
    const ok = await buildAndShare(entries);
    if (ok) setSelected(new Set());
  };

  const handleDownload = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url; a.download = "chasin-curves-trip.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const selectedKey = buildKey(shareable.filter(e => selected.has(e.id)));

  // Picking a road segment for one specific entry — swaps the whole modal
  // body to the picker rather than layering another modal on top.
  if (pickingRoadFor) {
    const safeTrail = clipTrailForPrivacy(resolveEntryTrail(pickingRoadFor), member);
    return (
      <Modal title="Add as a Road" subtitle={vehicleName(pickingRoadFor.vehicleId)} onClose={() => setPickingRoadFor(null)}>
        <RoadSegmentPicker
          trail={safeTrail}
          onCancel={() => setPickingRoadFor(null)}
          onConfirm={(prefill) => { setPickingRoadFor(null); onProposeRoad(prefill); onClose(); }}
        />
      </Modal>
    );
  }

  return (
    <Modal title="Share a Trip" subtitle="Turns one or more logged trips into a shareable card" onClose={onClose}>
      {shareable.length === 0 && (
        <div style={{ textAlign: "center", padding: 30, color: C.dim, fontSize: 12 }}>
          No completed trips yet — add a return odometer reading to a logged trip before it can be shared.
        </div>
      )}
      {shareable.map(entry => {
        const trail = resolveEntryTrail(entry);
        const trailNote = entry.trail?.length > 0 ? `${entry.trail.length} GPS pts` : trail.length > 0 ? "start + finish pins" : "";
        const isChecked = selected.has(entry.id);
        return (
          <div key={entry.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: `1px solid ${C.border}` }}>
            <div
              onClick={() => toggleSelected(entry.id)}
              title="Select to combine with other trips"
              style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isChecked ? C.champagne : C.border2}`, background: isChecked ? C.champagneDim : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.champagne, flexShrink: 0, cursor: "pointer" }}
            >
              {isChecked ? "✓" : ""}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, color: C.bone }}>{vehicleName(entry.vehicleId)}</div>
              <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                {new Date(entry.timestamp).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })} · {Math.round(entry.odometerEnd - entry.odometerStart)}km{trailNote ? ` · ${trailNote}` : ""}
              </div>
            </div>
            {entry.trail?.length > 1 && (
              <Btn size="sm" variant="ghost" onClick={() => setPickingRoadFor(entry)}>Add as Road</Btn>
            )}
            <Btn size="sm" onClick={() => buildAndShare([entry])} disabled={!!busy}>{busy === entry.id ? "Building…" : "Share"}</Btn>
          </div>
        );
      })}
      {selected.size >= 2 && (
        <div style={{ marginTop: 14, padding: 12, borderRadius: 8, border: `1px solid ${C.champagne}44`, background: C.champagneDim, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, color: C.bone }}>{selected.size} trips selected — combine into one card</div>
          <Btn size="sm" onClick={handleShareSelected} disabled={!!busy}>{busy === selectedKey ? "Building…" : "Share Combined"}</Btn>
        </div>
      )}
      {preview && (
        <div style={{ marginTop: 16, textAlign: "center" }}>
          <img src={preview.url} style={{ maxWidth: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
          <div style={{ fontSize: 11, color: C.dim, margin: "10px 0" }}>This browser can't share an image directly — download it and attach it to your chat.</div>
          <Btn onClick={handleDownload} style={{ width: "100%" }}>Download Image</Btn>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
};

// Persistent banner shown app-wide (not just on the Logbook screen) while
// a trail is recording — GPS polling lives in App so it survives the user
// switching screens; if this only lived inside LogbookView it would stop
// the moment they tapped away to Roads or Garage.
// Session 16s — "Live Log": a dedicated, on-the-spot screen for a trip
// still in progress (or just stopped), built specifically to be shown to
// a roadside check. The Logbook list itself is deliberately just a list —
// nothing in it is clickable into a detail view — so without this there
// was no way for anyone to actually demonstrate a log entry's start time,
// location, or odometer beyond a single summary row. Distinct from the
// Trip Postcard: this is a live compliance view for right now, not a
// finished, shareable brag card for later. Respects the same home-privacy
// fence as everything else — the start location shows as plain "Home"
// rather than the real place name when it falls inside the fence, since
// an officer checking a log doesn't need the address, just confirmation
// the trip is real.
const LiveTripView = ({ activeTrip, entry, vehicle, member, onClose }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [startPlace, setStartPlace] = useState(null);
  const [sharing, setSharing] = useState(false);
  const points = activeTrip?.points || [];

  const startIsHome = !!(member?.obscureHomeLocation && entry?.startCoord && member.privacyHomeLat != null &&
    haversineKm(entry.startCoord.lat, entry.startCoord.lng, member.privacyHomeLat, member.privacyHomeLng) <= (member.privacyRadiusKm ?? 1));

  useEffect(() => {
    if (startIsHome || !entry?.startCoord) return;
    let cancelled = false;
    reverseGeocodePlace(entry.startCoord.lat, entry.startCoord.lng).then(p => { if (!cancelled) setStartPlace(p); });
    return () => { cancelled = true; };
  }, [entry?.startCoord?.lat, entry?.startCoord?.lng, startIsHome]);

  useEffect(() => {
    if (!window.mapboxgl || MAPBOX_TOKEN.includes("PASTE_YOUR") || points.length === 0) {
      setMapFailed(true);
      return;
    }
    window.mapboxgl.accessToken = MAPBOX_TOKEN;
    const coords = points.map(p => [p.lng, p.lat]);
    const map = new window.mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: coords[coords.length - 1],
      zoom: 13,
      attributionControl: false,
    });
    map.on("load", () => {
      map.addSource("trail", { type: "geojson", data: { type: "Feature", geometry: { type: "LineString", coordinates: coords } } });
      map.addLayer({ id: "trail-line", type: "line", source: "trail", paint: { "line-color": C.champagne, "line-width": 3 } });
      markerRef.current = new window.mapboxgl.Marker({ color: C.red }).setLngLat(coords[coords.length - 1]).addTo(map);
      mapRef.current = map;
    });
    map.on("error", () => setMapFailed(true));
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const coords = points.map(p => [p.lng, p.lat]);
    const src = map.getSource?.("trail");
    if (src) src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
    if (markerRef.current) markerRef.current.setLngLat(coords[coords.length - 1]);
    map.panTo(coords[coords.length - 1]);
  }, [points.length]);

  const handleShare = async () => {
    setSharing(true);
    try {
      const lines = [
        "Chasin' Curves — Live Trip Log",
        `${[vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ")}${vehicle?.regoState ? ` · Registered ${vehicle.regoState}` : ""}`,
        `Started: ${new Date(entry.timestamp).toLocaleString("en-AU")}`,
        `Start odometer: ${entry.odometerStart}`,
        `Started from: ${startIsHome ? "Home" : (startPlace || "—")}`,
        `Generated live for on-the-spot verification, ${new Date().toLocaleString("en-AU")}.`,
      ];
      const text = lines.join("\n");
      if (navigator.share) {
        await navigator.share({ title: "Chasin' Curves — Live Trip Log", text });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        alert("Trip details copied — paste them wherever needed.");
      }
    } catch (e) {
      if (e?.name !== "AbortError") alert("Couldn't share — try again.");
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal title="Live Trip Log" subtitle="For on-the-spot verification" onClose={onClose} wide>
      <div style={{ background: "#0a0a0a", border: `1px solid ${C.border}`, borderRadius: 10, padding: 14, marginBottom: 14 }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, color: C.champagne }}>
          {[vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") || "Vehicle"}
        </div>
        {vehicle?.regoState && <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Registered {vehicle.regoState}</div>}
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.05em" }}>STARTED</div>
            <div style={{ fontSize: 13, color: C.bone, marginTop: 2 }}>{new Date(entry.timestamp).toLocaleString("en-AU")}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.05em" }}>START ODOMETER</div>
            <div style={{ fontSize: 13, color: C.bone, marginTop: 2 }}>{entry.odometerStart}</div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.05em" }}>STARTED FROM</div>
            <div style={{ fontSize: 13, color: C.bone, marginTop: 2 }}>{startIsHome ? "Home" : (startPlace || "Locating…")}</div>
          </div>
        </div>
      </div>
      <div style={{ position: "relative", height: 280, borderRadius: 8, overflow: "hidden", background: "#0a0f14" }}>
        <div ref={mapContainer} style={{ position: "absolute", inset: 0 }} />
        {mapFailed && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: C.dim, fontSize: 12, textAlign: "center", padding: 20 }}>
            Waiting for a GPS fix…
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 10, textAlign: "center" }}>
        Generated live, just now — {new Date().toLocaleTimeString("en-AU")}.
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Close</Btn>
        <Btn onClick={handleShare} disabled={sharing} style={{ flex: 1 }}>{sharing ? "Sharing…" : "Share"}</Btn>
      </div>
    </Modal>
  );
};

// Session 17 — mirrors ActiveTripBanner exactly: a lost AddRoadModal draft
// is the same "survives a reload mid-flow" failure mode as a lost trail
// recording, so it gets the same visual treatment and the same distinction
// between an ACCIDENTAL close (backdrop tap, stray click) and a DELIBERATE
// one. Only the deliberate one wipes the draft — see the Modal's own
// onClose vs. the Cancel button's onClick in AddRoadModal below.
const RoadDraftBanner = ({ draft, onResume, onDiscard }) => {
  if (!draft) return null;
  return (
    <div style={{ padding: "10px 16px", background: `${C.champagne}15`, borderBottom: `1px solid ${C.champagne}44`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 16 }}>📝</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.champagne, fontWeight: 700 }}>
          Unsaved road draft{draft.form?.name ? `: ${draft.form.name}` : ""}
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
          From {new Date(draft.savedAt).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}
        </div>
      </div>
      <Btn size="sm" variant="ghost" onClick={onDiscard}>Discard</Btn>
      <Btn size="sm" onClick={onResume}>Resume</Btn>
    </div>
  );
};

const ActiveTripBanner = ({ activeTrip, vehicleName, onStop, onDiscard, onLiveLog }) => {
  if (!activeTrip) return null;
  const elapsedMin = Math.max(0, Math.round((Date.now() - activeTrip.startedAt) / 60000));
  return (
    <div style={{ padding: "10px 16px", background: `${C.champagne}15`, borderBottom: `1px solid ${C.champagne}44`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 16 }}>{activeTrip.stopped ? "⏸" : "📍"}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.champagne, fontWeight: 700 }}>
          {activeTrip.stopped ? "Trail not saved yet" : "Recording trail"} — {vehicleName}
        </div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
          {activeTrip.points.length} point{activeTrip.points.length !== 1 ? "s" : ""}{!activeTrip.stopped ? ` · ${elapsedMin} min so far` : ""}
        </div>
      </div>
      <Btn size="sm" variant="ghost" onClick={onLiveLog}>Live Log</Btn>
      {activeTrip.stopped && <Btn size="sm" variant="ghost" onClick={onDiscard}>Discard</Btn>}
      <Btn size="sm" onClick={onStop}>{activeTrip.stopped ? "Retry Save" : "Stop Trip"}</Btn>
    </div>
  );
};

// Session 16 — the confirmation ActiveTripBanner never had. Stopping a trip
// used to just clear the banner with no signal either way, which a real
// beta tester read as the whole trip vanishing even though it had saved
// correctly. Shown once, briefly, right after a successful save; also the
// one place that tells the truth if the trail itself came back empty
// (GPS never got a fix all trip) instead of silently saving a 0-point trail.
const TripSavedNotice = ({ notice, onDismiss }) => {
  if (!notice) return null;
  return (
    <div style={{ padding: "10px 16px", background: `${C.champagne}15`, borderBottom: `1px solid ${C.champagne}44`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
      <span style={{ fontSize: 16 }}>✅</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, color: C.champagne, fontWeight: 700 }}>Trip saved to your Logbook</div>
        <div style={{ fontSize: 10, color: C.dim, marginTop: 1 }}>
          {notice.points > 0
            ? `${notice.points} GPS point${notice.points !== 1 ? "s" : ""} recorded`
            : "No GPS points recorded this trip — just the odometer reading was saved"}
        </div>
      </div>
      <Btn size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Btn>
    </div>
  );
};

// Session 16c — see detectInAppBrowser above for why this exists. Shown
// both pre-login (LoginScreen) and post-login (App shell), since the
// storage-eviction / GPS risk applies for as long as the tab stays open
// inside the host app, not just at sign-in.
const InAppBrowserWarning = ({ appName, onDismiss }) => {
  const [copied, setCopied] = useState(false);
  if (!appName) return null;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* clipboard API unavailable in this browser — button just won't confirm */ }
  };
  return (
    <div style={{ padding: "12px 16px", background: `${C.red}18`, borderBottom: `1px solid ${C.red}55`, display: "flex", flexDirection: "column", gap: 8, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontSize: 16 }}>⚠️</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: C.red, fontWeight: 700 }}>You're in {appName}'s built-in browser</div>
          <div style={{ fontSize: 10, color: C.dim, marginTop: 2, lineHeight: 1.5 }}>
            It can lose GPS trails and sign you out without warning, especially if {appName} goes to the background mid-trip. If you've already added Chasin' Curves to your Home Screen, tap that icon instead — it skips this problem entirely. Otherwise, open this link in Safari or Chrome.
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, paddingLeft: 26 }}>
        <Btn size="sm" onClick={copyLink}>{copied ? "Link copied ✓" : "Copy link to open elsewhere"}</Btn>
        <Btn size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Btn>
      </div>
    </div>
  );
};

const LogbookView = ({ member, logbook, onLogEntry, onAddReturnOdometer, onRefreshPoints, onProposeRoad }) => {
  const [showLog, setShowLog] = useState(false);
  const [viewingTrail, setViewingTrail] = useState(null);
  const [sharingTrip, setSharingTrip] = useState(false);
  const garage = member.garage || [];
  const sorted = [...(logbook || [])].sort((a, b) => b.timestamp - a.timestamp);

  const vehicleName = id => {
    const v = garage.find(veh => veh.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown vehicle";
  };

  const handleSubmit = async (vehicleId, odometerStart, trackGps) => {
    const ok = await onLogEntry(vehicleId, odometerStart, trackGps);
    // Session 17: server now awards log_trip on successful POST
    // /logbook/:id (worker.js Session 17) — matching where this has
    // always actually fired (trip START, confirmed by the Session 16
    // comment this replaces: "was firing even on a failed log attempt").
    // My first pass at the server side wrongly put this award on trip
    // COMPLETION instead — moved to match the real, established behaviour.
    if (ok) await onRefreshPoints?.();
    return ok;
  };

  const handleReturnOdo = async (entry) => {
    const val = prompt("Return odometer reading?");
    if (val === null) return;
    const n = Number(val);
    if (val.trim() === "" || Number.isNaN(n) || n < entry.odometerStart) {
      alert("Enter a number no lower than the start reading.");
      return;
    }
    // Session 16e: same one-off GPS fix as trip start, taken now at
    // hand-back — gives the Trip Postcard a real finish pin without
    // needing the full GPS Trail feature to have been running.
    const point = await pollGpsPoint("trip finish pin");
    const endCoord = point ? { lat: point.lat, lng: point.lng } : null;
    onAddReturnOdometer(entry.id, n, endCoord);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.champagne }}>Logbook</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Same-day entries only — timestamp is captured automatically.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Btn size="sm" variant="ghost" onClick={() => setSharingTrip(true)} disabled={garage.length === 0}>📤 Share a Trip</Btn>
          <Btn size="sm" onClick={() => setShowLog(true)} disabled={garage.length === 0}>+ Log a Trip</Btn>
        </div>
      </div>

      {garage.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
          <div>Add a vehicle to the Garage before logging a trip.</div>
        </div>
      )}

      {garage.length > 0 && (
        <div style={{ marginTop: 18, marginBottom: 8 }}>
          {garage.map(v => <VehicleDayCapCard key={v.id} vehicle={v} logbook={logbook} />)}
        </div>
      )}

      {sorted.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Entries</div>
          {sorted.map(e => (
            <div key={e.id} style={{ padding: "12px 14px", borderBottom: `1px solid #151515`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: C.bone }}>{vehicleName(e.vehicleId)}</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
                  {new Date(e.timestamp).toLocaleString('en-AU', { day:'numeric', month:'short', year:'numeric', hour:'numeric', minute:'2-digit' })}
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                  Odo {e.odometerStart}{e.odometerEnd != null ? ` → ${e.odometerEnd}` : ""}
                </div>
                {!(e.trail?.length > 0) && (e.startCoord || e.endCoord) && (
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                    📍 {e.startCoord && e.endCoord ? "Start + finish pins captured" : e.startCoord ? "Start pin captured" : "Finish pin captured"}
                  </div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                {e.odometerEnd == null && (
                  <Btn size="sm" variant="ghost" onClick={() => handleReturnOdo(e)}>+ Return Odo</Btn>
                )}
                {e.trail?.length > 0 && (
                  <Btn size="sm" variant="ghost" onClick={() => setViewingTrail(e)}>📍 {e.trail.length} pts</Btn>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {sorted.length === 0 && garage.length > 0 && (
        <div style={{ textAlign: "center", padding: "30px 20px", color: C.dim }}>
          <div style={{ fontSize: 12 }}>No entries yet. Log a trip before you head out.</div>
        </div>
      )}

      {showLog && (
        <LogTripModal member={member} logbook={logbook} onClose={() => setShowLog(false)} onSubmit={handleSubmit} />
      )}

      {viewingTrail && (
        <TrailViewerModal entry={viewingTrail} vehicleName={vehicleName(viewingTrail.vehicleId)} member={member} onClose={() => setViewingTrail(null)} />
      )}

      {sharingTrip && (
        <ShareDayModal logbook={logbook} garage={garage} member={member} onClose={() => setSharingTrip(false)} onProposeRoad={onProposeRoad} />
      )}
    </div>
  );
};

// ─── TRIP PLANNER ─────────────────────────────────────────────
// Host controls on a run: labels must match CANCEL_REASONS in worker.js.
const CANCEL_REASON_OPTIONS = [
  { id: "weather", label: "Weather" },
  { id: "hazard", label: "Road hazard" },
  { id: "low_interest", label: "Not enough interest" },
  { id: "personal", label: "Personal reasons" },
];
// A run counts as past a day after its date (same grace as the worker).
const isPastTrip = t => !!t.date && new Date(t.date) < new Date(Date.now() - 24 * 60 * 60 * 1000);

const TripPlanner = ({ roads, trips, setTrips, currentUser, onRefreshPoints }) => {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", time: "", selectedRoads: [], vehicleId: "", notes: "", waypoints: [] });
  const [waypointInput, setWaypointInput] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [editId, setEditId] = useState(null);           // set while the modal is editing an existing run
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelReason, setCancelReason] = useState("personal");
  const [busyTripId, setBusyTripId] = useState(null);
  // Session 30: Publish Run used to do NOTHING (no message at all) when the
  // name or roads were missing, and when the server rejected or failed the
  // save it closed the form and showed a local-only copy of the run — no
  // invite, no error, and the run vanished on the next reload. Now missing
  // details are named on screen, a failed publish keeps the form open with
  // the reason, and the button locks while publishing (a double tap used to
  // be able to create the run twice).
  const [formError, setFormError] = useState("");
  const [publishing, setPublishing] = useState(false);

  const emptyForm = { title: "", date: "", time: "", selectedRoads: [], vehicleId: "", notes: "", waypoints: [] };
  // Closing while editing discards the edit; closing while planning keeps your draft, as before.
  const closeModal = () => { setFormError(""); setShowNew(false); if (editId) { setEditId(null); setForm(emptyForm); } };

  // What a run needs before it can be published: a name and at least one
  // road. Date and time are deliberately OPTIONAL — an invite can go out
  // first as "are you in?" and the details get sorted with the group
  // afterwards (the invite says "to be confirmed"). Returns a plain-English
  // message for the first thing missing, or "" if the form is good to go.
  const runFormProblem = () => {
    if (!form.title.trim()) return "Give your run a name.";
    if (form.selectedRoads.length === 0) return "Select at least one road for the run.";
    return "";
  };

  const startEdit = (trip) => {
    setFormError("");
    setForm({ title: trip.title || "", date: trip.date || "", time: trip.time || "", selectedRoads: trip.routes || [],
              vehicleId: trip.vehicleId || "", notes: trip.notes || "", waypoints: trip.waypoints || [] });
    setEditId(trip.id);
    setShowNew(true);
  };

  const handleSave = async () => {
    const problem = runFormProblem();
    if (problem) { setFormError(problem); return; }
    setFormError("");
    const updates = { title: form.title, date: form.date, time: form.time, routes: form.selectedRoads,
                      vehicleId: form.vehicleId, notes: form.notes, waypoints: form.waypoints };
    try {
      const res = await api.updateTrip(editId, updates);
      if (res.error) { alert(res.error); return; }
      setTrips(prev => prev.map(t => t.id === editId ? (res.trip || { ...t, ...updates }) : t));
      setEditId(null); setForm(emptyForm); setShowNew(false);
    } catch { alert("Couldn't save your changes. Check your connection and try again."); }
  };

  const confirmCancel = async () => {
    const trip = cancelTarget;
    if (!trip) return;
    setBusyTripId(trip.id);
    try {
      const res = await api.cancelTrip(trip.id, cancelReason);
      if (res.error) alert(res.error);
      else setTrips(prev => prev.map(t => t.id === trip.id ? (res.trip || { ...t, status: "cancelled", cancelReason }) : t));
    } catch { alert("Couldn't cancel the run. Check your connection and try again."); }
    setBusyTripId(null);
    setCancelTarget(null);
  };

  const deleteRun = async (trip) => {
    if (!window.confirm(`Delete "${trip.title}" for good? Anyone opening its invite link will find it gone. This can't be undone.`)) return;
    setBusyTripId(trip.id);
    try {
      const res = await api.deleteTrip(trip.id);
      if (res.error) alert(res.error);
      else setTrips(prev => prev.filter(t => t.id !== trip.id));
    } catch { alert("Couldn't delete the run. Check your connection and try again."); }
    setBusyTripId(null);
  };

  const handleCreate = async () => {
    if (publishing) return;
    const problem = runFormProblem();
    if (problem) { setFormError(problem); return; }
    setFormError("");
    const trip = {
      id: Date.now(), title: form.title.trim(), date: form.date, time: form.time.trim(),
      routes: form.selectedRoads, vehicleId: form.vehicleId, notes: form.notes,
      waypoints: form.waypoints,
      createdBy: currentUser.id, attendees: [{ memberId: currentUser.id, vehicleId: form.vehicleId }],
      createdAt: new Date().toISOString(),
    };
    // Session 17: api.postTrip() hits the server-awarded POST /trips
    // (worker.js Session 17) — the old onPointsEarned("plan_trip") call
    // that used to sit here was a straight double-award, removed.
    // Session 30: the run is only added, and its invite only opened, once
    // the server has really saved it (the invite is built from the server's
    // copy, GET /trips/:id/public). A failed save no longer leaves a
    // local-only "phantom" run behind — the form stays open with the
    // reason, so nothing typed is lost. authedFetch only throws on 401/403;
    // other rejections come back as an {error} body, so check for that too.
    setPublishing(true);
    try {
      const res = await api.postTrip(trip);
      if (res?.error || !res?.trip) {
        setFormError(res?.error || "Couldn't publish your run — please try again.");
        return;
      }
      setTrips(prev => [...prev, res.trip]);
      try { await onRefreshPoints?.(); } catch { /* points refresh is a nicety */ }
      setForm({ title: "", date: "", time: "", selectedRoads: [], vehicleId: "", notes: "", waypoints: [] });
      setShowNew(false);
      openInvite(res.trip, true);
    } catch (e) {
      setFormError(e?.authFailed
        ? "Your session has expired. Sign out and back in, then publish again."
        : "Couldn't publish — check your connection and try again.");
    } finally {
      setPublishing(false);
    }
  };

  // Session 20: geocodes a typed place name (BP Landsborough, Witta, Aussie
  // World...) via the same Mapbox forward-geocode helper the privacy fence
  // uses, and appends it as the next stop. Order matters — first added is
  // the meeting point, last is the end point, everything between is a via
  // point — used by worker.js's /run/:id route-map overlay.
  const addWaypoint = async () => {
    const query = waypointInput.trim();
    if (!query) return;
    setGeocoding(true);
    const result = await geocodeAddress(query);
    setGeocoding(false);
    if (!result) { alert(`Couldn't find "${query}" — try a more specific place name.`); return; }
    // Session 21: shortName ("Landsborough") over placeName ("Landsborough,
    // Queensland, Australia") — every stop on one run shares the same
    // state/country anyway, and the full form was colliding with nearby
    // labels on the run page. Falls back to what they typed if Mapbox's
    // short form is somehow empty.
    setForm(f => ({ ...f, waypoints: [...f.waypoints, { label: result.shortName || query, lat: result.lat, lng: result.lng }] }));
    setWaypointInput("");
  };

  const removeWaypoint = (idx) => {
    setForm(f => ({ ...f, waypoints: f.waypoints.filter((_, i) => i !== idx) }));
  };

  const toggleRoad = id => {
    setForm(f => ({
      ...f,
      selectedRoads: f.selectedRoads.includes(id) ? f.selectedRoads.filter(r => r !== id) : [...f.selectedRoads, id]
    }));
  };

  // Session 19: this used to only update local React state — no server call
  // at all, so a "joined" run reverted to unjoined on every reload. Now
  // calls the atomic POST /trips/:id/rsvp and reconciles from the server's
  // returned trip, same optimistic-then-fallback shape as handleCreate above.
  const joinTrip = async (tripId) => {
    const vehicleId = currentUser.garage[0]?.id;
    setTrips(prev => prev.map(t => t.id === tripId
      ? { ...t, attendees: [...(t.attendees||[]), { memberId: currentUser.id, vehicleId, status: "going" }] }
      : t
    ));
    try {
      const res = await api.rsvpTrip(tripId, "going", vehicleId);
      if (res.trip) setTrips(prev => prev.map(t => t.id === tripId ? res.trip : t));
    } catch {
      // Optimistic update already applied above; a real failure here just
      // means the next reload will show the true (un-joined) server state.
    }
  };

  // Session 30: publishing a run (and tapping Invite on a run card) now
  // opens a full-screen in-app invite — the poster itself, with a Share
  // button pinned to the bottom — instead of jumping straight to the OS
  // share sheet, which made the end of "Publish Run" feel like an
  // anti-climax (you never saw the invite you'd just made).
  // The poster (drawTripInviteCard, see its definition for why it's a
  // sibling of drawTripCard) is built BEFORE the person taps Share, so
  // navigator.share() fires directly inside their tap — some browsers
  // refuse a share that fires after a long async build, which the old
  // build-then-share order risked. Data still comes from GET
  // /trips/:id/public (same no-auth endpoint /run/:id calls), so this
  // works for the organiser or anyone re-sharing. Share keeps the same
  // three-tier fallback: image + text, then link only, then clipboard —
  // and if the poster can't be built at all, the screen still offers the
  // plain link rather than leaving the person with nothing.
  const [invite, setInvite] = useState(null); // { trip, shareUrl, title, status: "building"|"ready"|"error", url, blob, justPublished }
  const inviteUrlRef = useRef(null);            // current blob: URL, so it can be revoked
  const inviteActiveRef = useRef(null);         // trip id the screen is showing (guards a build finishing after close)

  const revokeInviteUrl = () => {
    if (inviteUrlRef.current) { URL.revokeObjectURL(inviteUrlRef.current); inviteUrlRef.current = null; }
  };
  useEffect(() => () => revokeInviteUrl(), []); // switching tabs unmounts this screen — don't leak the image

  const closeInvite = () => {
    inviteActiveRef.current = null;
    revokeInviteUrl();
    setInvite(null);
  };

  const openInvite = async (trip, justPublished = false) => {
    const shareUrl = `${API}/run/${trip.id}`;
    revokeInviteUrl();
    inviteActiveRef.current = trip.id;
    setInvite({ trip, shareUrl, title: trip.title, status: "building", justPublished });
    try {
      const res = await fetch(`${API}/trips/${trip.id}/public`).then(r => r.json());
      if (res.error) throw new Error(res.error);
      const selectedRoads = (res.routes || []).map(id => roads.find(r => r.id === id)).filter(Boolean);
      const roadNames = selectedRoads.map(r => r.name);
      // Roads added from a trip's GPS trail have their driven line stored
      // separately (GET /roads/:id/path) — pull it so the poster can draw
      // that exact line instead of a Directions approximation.
      const roadsForRoute = await Promise.all(selectedRoads.map(async r => (r.hasPath ? { ...r, path: await fetchRoadPath(r.id) } : r)));
      const blob = await drawTripInviteCard({
        title: res.title,
        dateLabel: res.date ? fmtDate(res.date) : "",
        timeLabel: res.time,
        waypoints: res.waypoints,
        vehicleLabel: res.vehicleLabel,
        vehiclePhotoUrl: res.vehiclePhotoUrl,
        roadNames,
        roadsForRoute,
        organiserDisplayName: res.organiserDisplayName,
        goingCount: res.goingCount,
      });
      if (!blob) throw new Error("card render unavailable");
      if (inviteActiveRef.current !== trip.id) return; // closed while building
      const url = URL.createObjectURL(blob);
      inviteUrlRef.current = url;
      setInvite(prev => prev && prev.trip.id === trip.id ? { ...prev, status: "ready", url, blob, title: res.title || trip.title, routeNote: blob.routeNote || "" } : prev);
    } catch (e) {
      console.error("[Chasin' Curves] trip invite poster build failed", e);
      // A bad photo URL, a Mapbox hiccup, etc. shouldn't mean the trip
      // can't be shared at all — the screen falls back to the plain link.
      if (inviteActiveRef.current !== trip.id) return;
      // "Run not found" means the server has no record of this run — it only
      // ever existed on this device (an old failed publish), so there's no
      // link to share. Say that, rather than the generic picture error.
      const notSaved = e?.message === "Run not found";
      setInvite(prev => prev && prev.trip.id === trip.id ? { ...prev, status: notSaved ? "missing" : "error" } : prev);
    }
  };

  const copyInviteLink = async () => {
    if (!invite) return;
    try {
      await navigator.clipboard.writeText(invite.shareUrl);
      alert("Invite link copied — paste it wherever you like.");
    } catch {
      window.prompt("Copy this invite link:", invite.shareUrl);
    }
  };

  const shareInvite = async () => {
    if (!invite) return;
    const { shareUrl, title, blob } = invite;
    const text = `${title} — join us on Chasin' Curves 🏁\n${shareUrl}`;
    try {
      if (blob) {
        const file = new File([blob], "chasin-curves-invite.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "Chasin' Curves", text });
          return;
        }
      }
      if (navigator.share) {
        await navigator.share({ title: `${title} — Chasin' Curves`, url: shareUrl });
        return;
      }
      await copyInviteLink();
    } catch (e) {
      if (e?.name === "AbortError") return; // backed out of the share sheet — fine
      await copyInviteLink();
    }
  };

  const saveInviteImage = () => {
    if (!invite?.url) return;
    const a = document.createElement("a");
    a.href = invite.url; a.download = "chasin-curves-invite.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.champagne }}>Trips & Runs</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>See who's heading out. Join the convoy.</div>
        </div>
        <Btn size="sm" onClick={() => setShowNew(true)}>+ Plan a Run</Btn>
      </div>

      {trips.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: C.dim }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🏁</div>
          <div>No runs planned yet. Be the first.</div>
        </div>
      )}

      {trips.map(trip => {
        const organiser = SEED_MEMBERS.find(m => m.id === trip.createdBy);
        const vehicle = organiser?.garage.find(v => v.id === trip.vehicleId);
        const tripRoads = roads.filter(r => trip.routes.includes(r.id));
        const isJoined = trip.attendees?.some(a => a.memberId === currentUser.id);
        const isHost = trip.createdBy === currentUser.id;
        const isCancelled = trip.status === "cancelled";
        const isPast = isPastTrip(trip);
        const canManage = isHost && !isCancelled && !isPast;   // edit or cancel
        const canDelete = isHost && (isCancelled || isPast);

        return (
          <div key={trip.id} style={{ background: "#0a0a0a", border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, fontWeight: 600, color: C.bone, marginBottom: 2 }}>{trip.title}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{trip.date && `${fmtDate(trip.date)}`}{trip.time && ` · ${trip.time}`}</div>
                {trip.status === "cancelled" && (
                  <div style={{ marginTop: 6 }}>
                    <Badge color={C.red}>Cancelled{trip.cancelReason ? ` · ${CANCEL_REASON_OPTIONS.find(o => o.id === trip.cancelReason)?.label || trip.cancelReason}` : ""}</Badge>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {vehicle && <VehicleAvatar vehicle={vehicle} size={36} />}
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 11, color: C.muted }}>{organiser?.displayName}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{trip.attendees?.length || 1} going</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {tripRoads.map(r => (
                <span key={r.id} style={{ fontSize: 11, padding: "3px 10px", background: C.champagneDim, borderRadius: 20, color: C.champagne, border: `1px solid ${C.champagne}33` }}>{r.name}</span>
              ))}
            </div>
            {trip.attendees?.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: -6, marginBottom: 10 }}>
                {trip.attendees.map((a, i) => {
                  const m = SEED_MEMBERS.find(x => x.id === a.memberId);
                  const v = m?.garage.find(x => x.id === a.vehicleId) || m?.garage[0];
                  return v ? <div key={i} style={{ marginLeft: i > 0 ? -8 : 0 }}><VehicleAvatar vehicle={v} size={28} /></div> : null;
                })}
                <span style={{ marginLeft: 10, fontSize: 11, color: C.dim }}>{trip.attendees.length} vehicle{trip.attendees.length !== 1 ? "s" : ""} joining</span>
              </div>
            )}
            {trip.notes && <div style={{ fontSize: 12, color: C.dim, marginBottom: 10, fontStyle: "italic" }}>{trip.notes}</div>}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {!isJoined && !isHost && !isCancelled && (
                <Btn size="sm" variant="blue" onClick={() => joinTrip(trip.id)}>Join this Run</Btn>
              )}
              {isJoined && !isCancelled && <Badge color={C.blue}>✓ You're in</Badge>}
              {!isCancelled && (
                <Btn size="sm" variant="ghost" onClick={() => openInvite(trip)}>🎟 Invite</Btn>
              )}
              {canManage && <Btn size="sm" variant="ghost" onClick={() => startEdit(trip)}>✏️ Edit</Btn>}
              {canManage && <Btn size="sm" variant="danger" disabled={busyTripId === trip.id} onClick={() => { setCancelReason("personal"); setCancelTarget(trip); }}>Cancel run</Btn>}
              {canDelete && <Btn size="sm" variant="danger" disabled={busyTripId === trip.id} onClick={() => deleteRun(trip)}>Delete</Btn>}
            </div>
          </div>
        );
      })}

      {showNew && (
        <Modal
          title={editId ? "Edit Run" : "Plan a Run"}
          subtitle={editId
            ? ((trips.find(t => t.id === editId)?.attendees || []).filter(a => a.memberId !== currentUser.id).length > 0
                ? "Others have already joined. They won't be notified, so re-share the invite after saving."
                : "Changes update the shared invite link.")
            : "Share your route with the community · +20 pts"}
          onClose={closeModal}>
          <Input label="Run Name *" value={form.title} onChange={v => setForm(f=>({...f,title:v}))} placeholder="Sunday morning hinterland loop" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Date" value={form.date} onChange={v => setForm(f=>({...f,date:v}))} type="date" />
            <Input label="Departure Time" value={form.time} onChange={v => setForm(f=>({...f,time:v}))} placeholder="07:30" />
          </div>
          <div style={{ fontSize: 11, color: C.dim, lineHeight: 1.5, marginTop: -6, marginBottom: 14 }}>
            Date and time are optional — leave them blank to send an initial invite and sort the details out with the group.
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Select Roads *</div>
            {roads.map(r => (
              <div key={r.id} onClick={() => toggleRoad(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${form.selectedRoads.includes(r.id) ? C.champagne : C.border2}`, background: form.selectedRoads.includes(r.id) ? C.champagneDim : "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.champagne, flexShrink: 0 }}>
                  {form.selectedRoads.includes(r.id) ? "✓" : ""}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: C.bone }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.dim }}>{r.region} · {r.distance}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Your Vehicle</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {currentUser.garage.map(v => (
                <div key={v.id} onClick={() => setForm(f=>({...f,vehicleId:v.id}))} style={{ cursor: "pointer" }}>
                  <VehicleAvatar vehicle={v} size={44} selected={form.vehicleId === v.id} />
                </div>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Stops · first is the meeting point, last is where you'll finish up
            </div>
            {form.waypoints.map((wp, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, color: i === 0 ? C.blue : (i === form.waypoints.length - 1 ? C.red : C.champagne), width: 16 }}>
                  {i === 0 ? "🏁" : (i === form.waypoints.length - 1 ? "🎯" : i)}
                </span>
                <span style={{ fontSize: 13, color: C.bone, flex: 1 }}>{wp.label}</span>
                <span onClick={() => removeWaypoint(i)} style={{ cursor: "pointer", color: C.dim, fontSize: 13 }}>✕</span>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <Input value={waypointInput} onChange={setWaypointInput} placeholder="BP Landsborough, Witta, Aussie World..." />
              </div>
              <Btn size="sm" variant="ghost" onClick={addWaypoint} disabled={geocoding || !waypointInput.trim()}>
                {geocoding ? "..." : "+ Add"}
              </Btn>
            </div>
          </div>
          <Input label="Notes" value={form.notes} onChange={v => setForm(f=>({...f,notes:v}))} placeholder="Pace notes, anything else..." multiline />
          {formError && (
            <div style={{ fontSize: 12, color: C.red, background: `${C.red}15`, border: `1px solid ${C.red}44`, borderRadius: 8, padding: "9px 12px", marginTop: 8, lineHeight: 1.5 }}>
              {formError}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn variant="ghost" onClick={closeModal} style={{ flex: 1 }}>{editId ? "Discard" : "Cancel"}</Btn>
            <Btn onClick={editId ? handleSave : handleCreate} disabled={publishing} style={{ flex: 2 }}>{publishing ? "Publishing…" : (editId ? "Save Changes" : "Publish Run")}</Btn>
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <Modal title="Cancel this run?" subtitle={cancelTarget.title} onClose={() => setCancelTarget(null)}>
          <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 14 }}>
            Anyone who opens the invite link will see the run was cancelled, along with the reason you pick. This can't be undone.
            {(cancelTarget.attendees || []).filter(a => a.memberId !== currentUser.id).length > 0 && " People who joined won't be notified automatically, so let them know."}
          </div>
          <div style={{ marginBottom: 18 }}>
            {CANCEL_REASON_OPTIONS.map(o => (
              <div key={o.id} onClick={() => setCancelReason(o.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                <div style={{ width: 16, height: 16, borderRadius: "50%", border: `2px solid ${cancelReason === o.id ? C.champagne : C.border2}`, background: cancelReason === o.id ? C.champagneDim : "none" }} />
                <div style={{ fontSize: 13, color: C.bone }}>{o.label}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setCancelTarget(null)} style={{ flex: 1 }}>Keep run</Btn>
            <Btn variant="danger" disabled={busyTripId === cancelTarget.id} onClick={confirmCancel} style={{ flex: 2 }}>Cancel run</Btn>
          </div>
        </Modal>
      )}

      {invite && (
        <div style={{ position: "fixed", inset: 0, zIndex: 250, background: C.midnight, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", paddingTop: "calc(14px + env(safe-area-inset-top, 0px))", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={closeInvite} style={{ background: "none", border: "none", color: C.champagne, fontFamily: "'Josefin Sans', sans-serif", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer", padding: 0, minWidth: 80, textAlign: "left" }}>
              ‹ {invite.justPublished ? "Done" : "Back"}
            </button>
            <div style={{ fontSize: 11, color: C.champagne, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              {invite.justPublished ? "🏁 Run published" : "Trip invite"}
            </div>
            <div style={{ minWidth: 80 }} />
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
            {invite.status === "building" && (
              <div style={{ textAlign: "center", color: C.dim, fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🏁</div>
                Building your invite…
              </div>
            )}
            {invite.status === "ready" && (
              <img src={invite.url} alt={`${invite.title} — trip invite`} style={{ maxWidth: "100%", maxHeight: "100%", width: "auto", height: "auto", objectFit: "contain", borderRadius: 10, border: `1px solid ${C.border}`, boxShadow: "0 8px 40px #000a" }} />
            )}
            {invite.status === "missing" && (
              <div style={{ textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6, maxWidth: 300 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
                This run never saved to the server, so it has no invite link. It was probably created while offline or signed out. Refresh the app and it will disappear, then publish it again.
              </div>
            )}
            {invite.status === "error" && (
              <div style={{ textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6, maxWidth: 300 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
                Couldn't build the invite picture this time. Your run is still published — you can share its link below.
              </div>
            )}
          </div>

          <div style={{ flexShrink: 0, padding: "12px 16px", paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))", borderTop: `1px solid ${C.border}`, background: C.midnight }}>
            {invite.routeNote && (
              <div style={{ fontSize: 11, color: C.dim, textAlign: "center", lineHeight: 1.5, marginBottom: 10 }}>
                {invite.routeNote === "none"
                  ? "The route is drawn as straight lines between stops — the routing service didn't respond."
                  : "Part of the route is drawn as a straight line — the routing service didn't respond for it."}
              </div>
            )}
            <Btn size="lg" onClick={shareInvite} disabled={invite.status === "building" || invite.status === "missing"} style={{ width: "100%" }}>
              📤 Share invite
            </Btn>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {invite.status !== "missing" && <Btn size="sm" variant="ghost" onClick={copyInviteLink} style={{ flex: 1 }}>Copy link</Btn>}
              {invite.status === "ready" && <Btn size="sm" variant="ghost" onClick={saveInviteImage} style={{ flex: 1 }}>Save image</Btn>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PROFILE — EXTENDED ──────────────────────────────────────
const SKILLS_LIST = [
  { id: "mechanical", label: "Mechanical", icon: "🔧" },
  { id: "electrical", label: "Electrical", icon: "⚡" },
  { id: "panel", label: "Panel Work", icon: "🔨" },
  { id: "fabrication", label: "Fabrication", icon: "⚙️" },
  { id: "paint", label: "Paint & Finish", icon: "🎨" },
  { id: "upholstery", label: "Upholstery", icon: "🪡" },
  { id: "diagnostics", label: "Diagnostics", icon: "💻" },
  { id: "restoration", label: "Full Restoration", icon: "🏆" },
  { id: "navigation", label: "Navigation", icon: "🧭" },
  { id: "photography", label: "Car Photography", icon: "📸" },
];

const FAST_MONEY = [
  { id:"q1",  category:"Cars",   question:"Holden or Ford?",               optA:"Holden 🦁",              optB:"Ford 🐎" },
  { id:"q2",  category:"Cars",   question:"BMW or Mercedes?",              optA:"BMW 🔵",                 optB:"Mercedes ⭐" },
  { id:"q3",  category:"Cars",   question:"Harley or Triumph?",            optA:"Harley 🦅",              optB:"Triumph 🇬🇧" },
  { id:"q4",  category:"Cars",   question:"Manual or Automatic?",          optA:"Manual 🕹",              optB:"Automatic 🤖" },
  { id:"q5",  category:"Cars",   question:"Original or Modified?",         optA:"Keep it Stock 🏛",       optB:"Modify Everything 🔩" },
  { id:"q6",  category:"Cars",   question:"Track day or Sunday cruise?",   optA:"Track Day 🏁",           optB:"Sunday Cruise ☕" },
  { id:"q7",  category:"Cars",   question:"Dawn patrol or midnight run?",  optA:"Dawn Patrol 🌅",         optB:"Midnight Run 🌙" },
  { id:"q8",  category:"Cars",   question:"Roads or Tracks?",              optA:"Open Roads 🛣",          optB:"Race Tracks 🏎" },
  { id:"q9",  category:"Shed",   question:"Pirelli or Michelin?",          optA:"Pirelli 🇮🇹",            optB:"Michelin 🇫🇷" },
  { id:"q10", category:"Shed",   question:"NGK or Bosch?",                 optA:"NGK 🔥",                 optB:"Bosch ⚙️" },
  { id:"q11", category:"Shed",   question:"OEM or Aftermarket?",           optA:"OEM All Day 🏭",         optB:"Aftermarket Forever 🛠" },
  { id:"q12", category:"Shed",   question:"Fix it yourself or take it in?",optA:"DIY 🔧",                 optB:"Let the Pros handle it 🧑‍🔧" },
  { id:"q13", category:"Music",  question:"Strat or Les Paul?",            optA:"Stratocaster 🎸",        optB:"Les Paul 🎸" },
  { id:"q14", category:"Music",  question:"SG or Telecaster?",             optA:"Gibson SG 🤘",           optB:"Telecaster 🤠" },
  { id:"q15", category:"Music",  question:"Marshall or Vox?",              optA:"Marshall 🔊",            optB:"Vox ✅" },
  { id:"q16", category:"Music",  question:"ZZ Top or Coldplay?",           optA:"ZZ Top 🧔🧔",            optB:"Coldplay ❌", warn:"Choosing Coldplay results in immediate lifetime ban. You have been warned." },
  { id:"q17", category:"Music",  question:"Vinyl or Spotify?",             optA:"Vinyl 💿",               optB:"Spotify 🎧" },
  { id:"q18", category:"Music",  question:"Live gig or studio album?",     optA:"Live — nothing else 🎤", optB:"Studio — the pure vision 🎵" },
  { id:"q19", category:"Movies", question:"Steve McQueen or Paul Newman?", optA:"McQueen 🏎",             optB:"Newman 🧊" },
  { id:"q20", category:"Movies", question:"Bullitt or Le Mans?",           optA:"Bullitt 🚔",             optB:"Le Mans 🏁" },
  { id:"q21", category:"Movies", question:"Mad Max or Fast & Furious?",    optA:"Mad Max 🔥",             optB:"Fast & Furious 🏙" },
  { id:"q22", category:"Movies", question:"Top Gun or Days of Thunder?",   optA:"Top Gun ✈️",             optB:"Days of Thunder 🏎" },
  { id:"q23", category:"Life",   question:"Ginger or Maryanne?",           optA:"Ginger 💃",              optB:"Maryanne 🌺" },
  { id:"q24", category:"Life",   question:"Sofia Vergara or Rafael Nadal?",optA:"Sofia 🌹",               optB:"Rafa 🎾" },
  { id:"q25", category:"Life",   question:"Sunrise or sunset?",            optA:"Sunrise 🌅",             optB:"Sunset 🌇" },
  { id:"q26", category:"Life",   question:"Mountains or coast?",           optA:"Mountains ⛰",           optB:"Coast 🌊" },
  { id:"q27", category:"Life",   question:"Coffee or beer?",               optA:"Coffee ☕",              optB:"Beer 🍺" },
  { id:"q28", category:"Life",   question:"Early bird or night owl?",      optA:"Early Bird 🐦",          optB:"Night Owl 🦉" },
];

const ProfileView = ({ member, onUpdate, pointsLog, onUpgrade, onRedeemPoints }) => {
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemSuccess, setRedeemSuccess] = useState(null); // { monthsGranted }

  const handleRedeemClick = async () => {
    setRedeeming(true); setRedeemError(""); setRedeemSuccess(null);
    const res = await onRedeemPoints();
    setRedeeming(false);
    if (res?.error) setRedeemError(res.error);
    else if (res?.ok) setRedeemSuccess({ monthsGranted: res.monthsGranted });
  };

  const [tab, setTab] = useState("profile");
  const [editing, setEditing] = useState(false);
  const [privacyAddress, setPrivacyAddress] = useState(member.privacyHomeAddress || "");
  const [privacyRadiusInput, setPrivacyRadiusInput] = useState(String(member.privacyRadiusKm ?? 1));
  const [editingPrivacy, setEditingPrivacy] = useState(false);
  const [privacyStatus, setPrivacyStatus] = useState("idle"); // idle | saving | error
  const [form, setForm] = useState({
    displayName: member.displayName, location: member.location, bio: member.bio,
    occupation: member.occupation||"", yearsEnthusiast: member.yearsEnthusiast||"",
    favoriteEra: member.favoriteEra||"", instagram: member.instagram||"", website: member.website||"",
  });
  const tier = getTier(member.points);
  const nextTier = TIERS.find(t => t.min > member.points);
  const progress = nextTier ? ((member.points - tier.min) / (nextTier.min - tier.min)) * 100 : 100;
  const fileRef = useRef();
  const [inviteState, setInviteState] = useState("idle"); // "idle" | "copied"

  // A link, not an account — anyone can already sign themselves up with any
  // email. This just makes arriving feel like being asked in by name rather
  // than finding a bare URL. The inviter's name rides along client-side in
  // the query string (see LoginScreen's banner); no new backend endpoint
  // needed, and nothing private about the inviter is exposed by it.
  const handleInvite = async () => {
    const url = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(member.displayName)}`;
    const shareData = {
      title: "Chasin' Curves",
      text: `${member.displayName} invited you to join Chasin' Curves — roads, rivers & riffs.`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled the share sheet — fine */ }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        setInviteState("copied");
        setTimeout(() => setInviteState("idle"), 2500);
      } catch { /* clipboard unavailable — nothing more to do silently */ }
    }
  };

  const handleSave = () => { onUpdate({ ...member, ...form }); setEditing(false); };
  const handleAvatarUpload = e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => onUpdate({ ...member, avatar: ev.target.result });
    reader.readAsDataURL(file);
  };
  const toggleSkill = id => {
    const current = member.skills||[];
    onUpdate({ ...member, skills: current.includes(id) ? current.filter(s=>s!==id) : [...current, id] });
  };
  const setFastMoney = (qid, answer) => {
    onUpdate({ ...member, fastMoney: { ...(member.fastMoney||{}), [qid]: answer } });
  };

  // Turning the fence off clears it entirely — no address, no coordinates,
  // no radius, nothing left obscured. Changing an already-active fence
  // (different radius, moved house) goes through the same address+radius
  // form via editingPrivacy, rather than forcing an off/on round trip.
  const handleTurnOffPrivacy = () => {
    onUpdate({ ...member, obscureHomeLocation: false, privacyHomeAddress: null, privacyHomeLat: null, privacyHomeLng: null, privacyRadiusKm: null });
    setPrivacyAddress("");
    setPrivacyRadiusInput("1");
    setPrivacyStatus("idle");
    setEditingPrivacy(false);
  };

  const handleStartEditingPrivacy = () => {
    setPrivacyAddress(member.privacyHomeAddress || "");
    setPrivacyRadiusInput(String(member.privacyRadiusKm ?? 1));
    setPrivacyStatus("idle");
    setEditingPrivacy(true);
  };

  const handleSavePrivacyFence = async () => {
    if (!privacyAddress.trim()) return;
    const radius = parseFloat(privacyRadiusInput);
    if (!Number.isFinite(radius) || radius <= 0) { setPrivacyStatus("error"); return; }
    setPrivacyStatus("saving");
    const geocoded = await geocodeAddress(privacyAddress.trim());
    if (!geocoded) { setPrivacyStatus("error"); return; }
    onUpdate({
      ...member,
      obscureHomeLocation: true,
      privacyHomeAddress: privacyAddress.trim(),
      privacyHomeLat: geocoded.lat,
      privacyHomeLng: geocoded.lng,
      privacyRadiusKm: radius,
    });
    setPrivacyStatus("idle");
    setEditingPrivacy(false);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      <div style={{ padding:"16px 20px 0", background:C.midnight, flexShrink:0 }}>
        <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:14 }}>
          <div style={{ position:"relative", flexShrink:0 }}>
            <div style={{ width:66, height:66, borderRadius:"50%", background:C.champagneDim, border:`2px solid ${C.champagne}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden" }}>
              {member.avatar ? <img src={member.avatar} style={{ width:"100%", height:"100%", objectFit:"cover" }} /> : <span style={{ fontSize:26, color:C.champagne, fontFamily:"'Cormorant Garamond', serif" }}>{member.displayName[0]}</span>}
            </div>
            <label style={{ position:"absolute", bottom:-2, right:-2, width:22, height:22, background:C.champagne, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:11, border:`2px solid ${C.midnight}` }}>
              📷<input type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display:"none" }} ref={fileRef} />
            </label>
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:20, fontWeight:600, color:C.bone, lineHeight:1.1 }}>{member.displayName}</div>
            <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>📍 {member.location}</div>
            <div style={{ marginTop:6 }}><PointsBadge pts={member.points} /></div>
          </div>
        </div>
        <div style={{ display:"flex", borderBottom:`1px solid ${C.border}`, marginLeft:-20, marginRight:-20, paddingLeft:8 }}>
          {[["profile","Profile"],["skills","Skills"],["fastmoney","Fast Money"],["points","Points"]].map(([id,label]) => (
            <button key={id} onClick={()=>setTab(id)} style={{ padding:"8px 12px", background:"none", border:"none", borderBottom:`2px solid ${tab===id?C.champagne:"transparent"}`, color:tab===id?C.champagne:C.dim, fontFamily:"'Josefin Sans', sans-serif", fontSize:11, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.07em", whiteSpace:"nowrap" }}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:20 }}>

        {tab==="profile" && (
          <>
            <div style={{ background: isMemberPro(member) ? `linear-gradient(135deg, ${C.champagne}22, ${C.champagne}08)` : "#0a0a0a", border:`1px solid ${isMemberPro(member) ? C.champagne+"66" : C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <div>
                  <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne }}>🎟 Membership</div>
                  <div style={{ fontSize:12, color:C.dim, marginTop:2 }}>{proStatusLabel(member)}</div>
                </div>
                {!member.proLifetime && (
                  <Btn size="sm" onClick={onUpgrade}>{isMemberPro(member) ? "Add More Time" : "Upgrade"}</Btn>
                )}
              </div>
            </div>
            <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne }}>About Me</div>
                <Btn size="sm" variant="ghost" onClick={()=>setEditing(!editing)}>{editing?"Cancel":"Edit"}</Btn>
              </div>
              {editing ? (
                <>
                  <Input label="Display Name" value={form.displayName} onChange={v=>setForm(f=>({...f,displayName:v}))} />
                  <Input label="Location" value={form.location} onChange={v=>setForm(f=>({...f,location:v}))} placeholder="Mount Mellum, QLD" />
                  <Input label="Bio" value={form.bio} onChange={v=>setForm(f=>({...f,bio:v}))} multiline rows={3} placeholder="Tell the community about yourself..." />
                  <Input label="Occupation" value={form.occupation} onChange={v=>setForm(f=>({...f,occupation:v}))} placeholder="e.g. Rail Network Controller" />
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <Input label="Years as Enthusiast" value={form.yearsEnthusiast} onChange={v=>setForm(f=>({...f,yearsEnthusiast:v}))} placeholder="25" />
                    <Input label="Favourite Era" value={form.favoriteEra} onChange={v=>setForm(f=>({...f,favoriteEra:v}))} placeholder="1960s–70s British" />
                  </div>
                  <Input label="Instagram" value={form.instagram} onChange={v=>setForm(f=>({...f,instagram:v}))} placeholder="@yourhandle" />
                  <Input label="YouTube / Website" value={form.website} onChange={v=>setForm(f=>({...f,website:v}))} placeholder="youtube.com/yourchannel" />
                  <Btn onClick={handleSave} style={{ width:"100%" }}>Save Profile</Btn>
                </>
              ) : (
                <>
                  <div style={{ fontSize:13, color:"#aaa", lineHeight:1.7, marginBottom:12 }}>{member.bio||"No bio yet — tap Edit to add one."}</div>
                  {[["💼 Occupation",member.occupation],["⏳ Enthusiast For",member.yearsEnthusiast?`${member.yearsEnthusiast} years`:null],["🏛 Favourite Era",member.favoriteEra],["📸 Instagram",member.instagram],["🎬 YouTube / Web",member.website]].filter(([,v])=>v).map(([label,value])=>(
                    <div key={label} style={{ display:"flex", gap:10, padding:"6px 0", borderBottom:`1px solid ${C.border}` }}>
                      <span style={{ fontSize:12, color:C.dim, minWidth:130 }}>{label}</span>
                      <span style={{ fontSize:12, color:C.bone }}>{value}</span>
                    </div>
                  ))}
                  {!member.occupation && !member.favoriteEra && <div style={{ fontSize:12, color:C.dim, textAlign:"center", padding:8 }}>Tap Edit to fill in your details</div>}
                </>
              )}
            </div>
            <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne, marginBottom:8 }}>Privacy</div>
              <div style={{ fontSize:12, color:C.dim, marginBottom:12, lineHeight:1.6 }}>
                If you drive something worth a second look — a GT-HO, an E-Type, anything a thief would remember — you might not want your garage's location showing up on a shared trip. This obscures your home from every map and route Chasin' Curves shows, including your own trip postcards. You set the radius yourself — a suburban block needs a lot less than a rural property.
              </div>
              {member.obscureHomeLocation && !editingPrivacy ? (
                <div style={{ display:"flex", gap:10, alignItems:"flex-start", padding:12, borderRadius:8, border:`1px solid ${C.champagne}`, background:C.champagneDim }}>
                  <div style={{ width:18, height:18, borderRadius:4, border:`2px solid ${C.champagne}`, background:C.champagneDim, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:C.champagne, flexShrink:0, marginTop:1 }}>✓</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, color:C.bone }}>Active — {member.privacyRadiusKm}km around {member.privacyHomeAddress}</div>
                    <div style={{ fontSize:11, color:C.dim, marginTop:3, lineHeight:1.5 }}>Hidden from every map and route, including your own trip postcards. Doesn't cover numberplates or house numbers visible in your photos.</div>
                    <div style={{ display:"flex", gap:16, marginTop:8 }}>
                      <button onClick={handleStartEditingPrivacy} style={{ background:"none", border:"none", color:C.champagne, fontSize:11, cursor:"pointer", padding:0, fontFamily:"inherit" }}>Change</button>
                      <button onClick={handleTurnOffPrivacy} style={{ background:"none", border:"none", color:C.dim, fontSize:11, cursor:"pointer", padding:0, fontFamily:"inherit" }}>Turn Off</button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop:4 }}>
                  <Input label="Home Address" value={privacyAddress} onChange={setPrivacyAddress} placeholder="e.g. 12 Example St, Mount Mellum QLD" />
                  <Input label="Radius (km)" type="number" value={privacyRadiusInput} onChange={setPrivacyRadiusInput} placeholder="1" />
                  <div style={{ fontSize:11, color:C.dim, marginTop:-10, marginBottom:14, lineHeight:1.5 }}>
                    Make it bigger than your property boundary — a suburban block might only need 0.3–0.5km, but a rural property of several hundred acres could need 3–5km or more to actually clear the fence line.
                  </div>
                  <div style={{ fontSize:11, color:C.champagneLight, marginBottom:14, lineHeight:1.5, padding:10, background:"#1a1508", borderRadius:6, border:`1px solid ${C.champagneDim}` }}>
                    ⚠ This only obscures your location on the map — it can't do anything about a numberplate or house number visible in your own photos. Worth checking your vehicle photos and any trip postcards before sharing them.
                  </div>
                  {privacyStatus === "error" && <div style={{ fontSize:11, color:C.red, marginBottom:8 }}>Couldn't find that address, or the radius wasn't a valid number — check both and try again.</div>}
                  <div style={{ display:"flex", gap:10 }}>
                    {editingPrivacy && (
                      <Btn variant="ghost" onClick={() => { setEditingPrivacy(false); setPrivacyStatus("idle"); }} style={{ flex:1 }}>Cancel</Btn>
                    )}
                    <Btn onClick={handleSavePrivacyFence} disabled={privacyStatus === "saving" || !privacyAddress.trim()} style={{ flex:1 }}>
                      {privacyStatus === "saving" ? "Setting up…" : (editingPrivacy ? "Save Changes" : "Set Up Privacy Fence")}
                    </Btn>
                  </div>
                </div>
              )}
            </div>
            <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne, marginBottom:12 }}>Community Stats</div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
                {[["🛣",member.roadsAdded?.length||0,"Roads"],["✍️",member.reviewsWritten||0,"Reviews"],["🏁",member.tripsPlanned||0,"Trips"],["🚗",member.garage?.length||0,"Vehicles"],["⭐",member.points||0,"Points"],["🏆",getTier(member.points).name,"Tier"]].map(([icon,val,label])=>(
                  <div key={label} style={{ background:"#111", borderRadius:8, padding:"10px 8px", textAlign:"center", border:`1px solid ${C.border}` }}>
                    <div style={{ fontSize:18 }}>{icon}</div>
                    <div style={{ fontSize:16, fontFamily:"'Cormorant Garamond', serif", color:C.champagne, fontWeight:600, marginTop:4 }}>{val}</div>
                    <div style={{ fontSize:9, color:C.dim, textTransform:"uppercase", letterSpacing:"0.08em", marginTop:2 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne, marginBottom:8 }}>Invite a Mate</div>
              <div style={{ fontSize:12, color:C.dim, marginBottom:12, lineHeight:1.6 }}>Send a personal invite — they'll see your name on the way in, not just a bare link.</div>
              <Btn onClick={handleInvite} style={{ width:"100%" }}>{inviteState === "copied" ? "Link copied ✓" : "📤 Invite a Mate"}</Btn>
            </div>
          </>
        )}

        {tab==="skills" && (
          <>
            <div style={{ marginBottom:14 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:18, color:C.champagne, marginBottom:4 }}>Your Strengths</div>
              <div style={{ fontSize:12, color:C.dim, lineHeight:1.6 }}>Let the community know what you bring to the shed. These show on your public profile and help members find the right person to ask.</div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {SKILLS_LIST.map(skill => {
                const active = (member.skills||[]).includes(skill.id);
                return (
                  <div key={skill.id} onClick={()=>toggleSkill(skill.id)} style={{ padding:"12px 14px", borderRadius:10, border:`2px solid ${active?C.champagne:C.border}`, background:active?C.champagneDim:"#0a0a0a", cursor:"pointer", display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:22 }}>{skill.icon}</span>
                    <div style={{ flex:1, fontSize:13, color:active?C.champagne:C.bone, fontWeight:active?600:400 }}>{skill.label}</div>
                    {active && <span style={{ color:C.champagne, fontSize:13 }}>✓</span>}
                  </div>
                );
              })}
            </div>
            {(member.skills||[]).length > 0 && (
              <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
                <div style={{ fontSize:11, color:C.champagne, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:10 }}>Your Skills Badge</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {(member.skills||[]).map(id => { const s=SKILLS_LIST.find(x=>x.id===id); return s?<span key={id} style={{ fontSize:11, padding:"4px 10px", background:C.champagneDim, border:`1px solid ${C.champagne}44`, borderRadius:20, color:C.champagne }}>{s.icon} {s.label}</span>:null; })}
                </div>
              </div>
            )}
          </>
        )}

        {tab==="fastmoney" && (
          <>
            <div style={{ marginBottom:16 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:18, color:C.champagne, marginBottom:4 }}>Fast Money</div>
              <div style={{ fontSize:12, color:C.dim, lineHeight:1.6 }}>Twenty-eight questions. No wrong answers. One exception — see Q16. Tap your pick — shows on your public profile so people know who they're dealing with before they say g'day.</div>
            </div>
            {["Cars","Shed","Music","Movies","Life"].map(cat => {
              const catQ = FAST_MONEY.filter(q => q.category === cat);
              const catIcons = { Cars:"🚗", Shed:"🔧", Music:"🎸", Movies:"🎬", Life:"☀️" };
              return (
                <div key={cat} style={{ marginBottom:20 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${C.border}` }}>
                    <span style={{ fontSize:16 }}>{catIcons[cat]}</span>
                    <span style={{ fontSize:11, color:C.champagne, textTransform:"uppercase", letterSpacing:"0.12em", fontWeight:700 }}>{cat}</span>
                    <span style={{ fontSize:10, color:C.dim, marginLeft:"auto" }}>
                      {catQ.filter(q => member.fastMoney?.[q.id]).length}/{catQ.length} answered
                    </span>
                  </div>
                  {catQ.map((q) => {
                    const answer = member.fastMoney?.[q.id];
                    const isColdplay = q.id === "q16" && answer === "B";
                    return (
                      <div key={q.id} style={{ background:"#0a0a0a", border:`1px solid ${isColdplay ? C.red : C.border}`, borderRadius:10, padding:14, marginBottom:10 }}>
                        <div style={{ fontSize:12, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:8 }}>{q.question}</div>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                          {[["A",q.optA],["B",q.optB]].map(([side,label]) => {
                            const sel = answer===side;
                            const dangerChoice = q.id==="q16" && side==="B";
                            return (
                              <div key={side} onClick={()=>setFastMoney(q.id,side)}
                                style={{ padding:"10px 12px", borderRadius:8, cursor:"pointer", textAlign:"center",
                                  border:`2px solid ${sel ? (dangerChoice ? C.red : C.champagne) : C.border2}`,
                                  background: sel ? (dangerChoice ? C.redDim : C.champagneDim) : "#111" }}>
                                <div style={{ fontSize:13, lineHeight:1.3, fontWeight:sel?700:400,
                                  color: sel ? (dangerChoice ? C.red : C.champagne) : C.bone }}>
                                  {label}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {isColdplay && (
                          <div style={{ marginTop:10, padding:"8px 12px", background:C.redDim, border:`1px solid ${C.red}`, borderRadius:8, fontSize:11, color:C.red, lineHeight:1.5 }}>
                            ⚠️ {q.warn}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {Object.keys(member.fastMoney||{}).length===FAST_MONEY.length && (
              <div style={{ background:`${C.champagne}11`, border:`1px solid ${C.champagne}44`, borderRadius:10, padding:14, textAlign:"center", marginBottom:10 }}>
                <div style={{ fontSize:22, marginBottom:6 }}>🏁</div>
                <div style={{ fontSize:13, color:C.champagne, fontWeight:600 }}>Fast Money complete!</div>
                <div style={{ fontSize:11, color:C.dim, marginTop:4 }}>Your picks are on your public profile. Choose wisely. Especially Q16.</div>
              </div>
            )}
          </>
        )}

        {tab==="points" && (
          <>
            <div style={{ background:"#0a0a0a", border:`1px solid ${tier.color}44`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
                <div>
                  <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:18, color:tier.color }}>{tier.icon} {tier.name}</div>
                  <div style={{ fontSize:11, color:C.dim, marginTop:2 }}>{nextTier?`${(nextTier.min-member.points).toLocaleString()} points to ${nextTier.name}`:"Maximum tier achieved"}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:26, fontFamily:"'Cormorant Garamond', serif", color:C.champagne, fontWeight:600 }}>{member.points.toLocaleString()}</div>
                  <div style={{ fontSize:10, color:C.dim }}>total points</div>
                </div>
              </div>
              <div style={{ height:4, background:"#1e1e1e", borderRadius:2, marginBottom:14 }}>
                <div style={{ height:"100%", width:`${progress}%`, background:`linear-gradient(90deg, ${tier.color}, ${C.champagneLight})`, borderRadius:2 }} />
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:6 }}>
                {TIERS.map(t=><div key={t.name} style={{ textAlign:"center", opacity:member.points>=t.min?1:0.3 }}>
                  <div style={{ fontSize:18 }}>{t.icon}</div>
                  <div style={{ fontSize:9, color:t.color, textTransform:"uppercase", letterSpacing:"0.05em" }}>{t.name}</div>
                  <div style={{ fontSize:9, color:C.dim }}>{t.min===0?"0":t.min.toLocaleString()}</div>
                </div>)}
              </div>
              <div style={{ marginTop:12, padding:10, background:"#111", borderRadius:8, fontSize:11, color:C.dim, lineHeight:1.6 }}>
                🏆 Your lifetime tally — points never expire.
              </div>
            </div>
            {/* Session 18 — points → Pro redemption. Deliberately plain,
                not promoted: no gradient, no icon badge, tucked in the
                Points tab rather than the Membership card. Uses
                member.proPoints, not member.points — see worker.js. */}
            {!member.proLifetime && (
              <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
                <div style={{ fontSize:13, color:C.bone, marginBottom:4 }}>Points → Pro</div>
                <div style={{ fontSize:11, color:C.dim, marginBottom:10, lineHeight:1.6 }}>
                  {POINTS_PER_PRO_MONTH.toLocaleString()} points redeems 1 free month of Pro (Trip Postcards, Logbook, TGM).
                </div>
                <div style={{ fontSize:11, color:C.dim, marginBottom:10 }}>
                  {(member.proPoints || 0).toLocaleString()} points banked
                </div>
                {Math.floor((member.proPoints || 0) / POINTS_PER_PRO_MONTH) >= 1 ? (
                  <Btn size="sm" variant="ghost" onClick={handleRedeemClick} disabled={redeeming}>
                    {redeeming ? "Redeeming…" : `Redeem for ${Math.floor((member.proPoints || 0) / POINTS_PER_PRO_MONTH)} free month${Math.floor((member.proPoints || 0) / POINTS_PER_PRO_MONTH) !== 1 ? "s" : ""}`}
                  </Btn>
                ) : (
                  <div style={{ fontSize:11, color:C.dim }}>
                    {(POINTS_PER_PRO_MONTH - (member.proPoints || 0)).toLocaleString()} points to your next free month.
                  </div>
                )}
                {redeemError && <div style={{ fontSize:11, color:C.red, marginTop:8 }}>{redeemError}</div>}
                {redeemSuccess && <div style={{ fontSize:11, color:C.champagne, marginTop:8 }}>Redeemed {redeemSuccess.monthsGranted} free month{redeemSuccess.monthsGranted !== 1 ? "s" : ""} of Pro.</div>}
              </div>
            )}
            <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne, marginBottom:12 }}>How to Earn</div>
              {Object.entries(POINT_ACTIONS).map(([key,{points,label,icon}])=>(
                <div key={key} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:`1px solid ${C.border}` }}>
                  <span style={{ fontSize:16, width:24 }}>{icon}</span>
                  <div style={{ flex:1, fontSize:12, color:C.bone }}>{label}</div>
                  <div style={{ fontSize:13, color:C.champagne, fontWeight:700 }}>+{points}</div>
                </div>
              ))}
            </div>
            {pointsLog.length>0 && (
              <div style={{ background:"#0a0a0a", border:`1px solid ${C.border}`, borderRadius:12, padding:16 }}>
                <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, color:C.champagne, marginBottom:12 }}>Recent Activity</div>
                {pointsLog.slice(-10).reverse().map((entry,i)=>{
                  const action=POINT_ACTIONS[entry.action];
                  const expiry=new Date(entry.earnedAt); expiry.setDate(expiry.getDate()+POINT_EXPIRY_DAYS);
                  const daysLeft=Math.ceil((expiry-Date.now())/86400000);
                  return <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:i<pointsLog.length-1?`1px solid ${C.border}`:"none" }}>
                    <span style={{ fontSize:16 }}>{action?.icon}</span>
                    <div style={{ flex:1 }}><div style={{ fontSize:12, color:C.bone }}>{action?.label}</div><div style={{ fontSize:10, color:C.dim }}>Expires in {Math.max(0,daysLeft)} days</div></div>
                    <div style={{ fontSize:13, color:C.champagne, fontWeight:700 }}>+{action?.points}</div>
                  </div>;
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── ADD ROAD FORM ───────────────────────────────────────────
// Session 17: accepts an optional `initialValues` to prefill from a trip's
// GPS trail (see RoadSegmentPicker below) — user still reviews/names/rates
// before submitting, this only removes retyping coordinates the GPS
// already captured. Also: onPointsEarned("add_road") removed from
// handleSubmit — the server now awards add_road itself (worker.js Session
// 17, POST /roads), so calling it here too would double-award every time.
const AddRoadModal = ({ onClose, onAdd, currentUser, initialValues }) => {
  const [form, setForm] = useState({ name:"", region:"", country:"AU", state:"QLD", description:"", distance:"", duration:"", tags:"", startLat:"", startLng:"", endLat:"", endLng:"", busyTimes:"", fuel:"", food:"", meetups:"", ...initialValues });
  const [ratings, setRatings] = useState({ driveability:3, accessibility:3, views:3, surface:3, thrill:3, ...(initialValues?._ratings || {}) });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  // Session 17 — autosave every change to localStorage (cc_road_draft),
  // so an OS popup/reload mid-form loses nothing. Skips saving while a
  // prefill from the Trip Postcard flow is still settling in on first
  // render — no point writing a draft in the same tick it was populated.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!currentUser?.id) return;
    setStoredRoadDraft(currentUser.id, { form, _ratings: ratings });
  }, [form, ratings, currentUser?.id]);

  const handleSubmit = () => {
    if (!form.name || !form.region) return;
    // Session 30: a road added from a trip carries the driven line of the
    // picked section (`path`, see simplifyTrailPath). It's only kept if the
    // start/end boxes still match it — if someone has since typed different
    // coordinates, the stored line would be a different road's shape.
    const { path: formPath, ...formRest } = form;
    const sLat = parseFloat(form.startLat) || 0, sLng = parseFloat(form.startLng) || 0;
    const eLat = parseFloat(form.endLat) || 0, eLng = parseFloat(form.endLng) || 0;
    const nearPt = (pt, lat, lng) => Array.isArray(pt) && haversineKm(pt[0], pt[1], lat, lng) < 0.1;
    const pathOk = Array.isArray(formPath) && formPath.length >= 2
      && nearPt(formPath[0], sLat, sLng) && nearPt(formPath[formPath.length - 1], eLat, eLng);
    onAdd({
      id: Date.now(), ...formRest, ...(pathOk ? { path: formPath } : {}),
      country: form.country || "AU",
      state: (form.country || "AU") === "AU" ? form.state : "",
      startCoords: { lat: parseFloat(form.startLat)||0, lng: parseFloat(form.startLng)||0 },
      endCoords: { lat: parseFloat(form.endLat)||0, lng: parseFloat(form.endLng)||0 },
      tags: form.tags.split(",").map(t=>t.trim()).filter(Boolean),
      busyTimes: form.busyTimes.split("\n").filter(Boolean),
      fuel: form.fuel.split("\n").filter(Boolean),
      food: form.food.split("\n").filter(Boolean),
      meetups: form.meetups.split("\n").filter(Boolean),
      ratings, reviews: 0, alerts: [], featured: false, verified: false,
      addedBy: currentUser?.id || "unknown", addedDate: new Date().toISOString().slice(0,10),
    });
    // Server awards add_road on successful POST /roads now — no client call here.
    setStoredRoadDraft(currentUser?.id, null); // submitted — draft's job is done
    onClose();
  };

  // Deliberate abandonment only — the Modal's own close (X / backdrop tap,
  // wired below with the plain `onClose` prop) does NOT clear the draft.
  // An accidental tap outside the form shouldn't cost you the form.
  const handleCancel = () => {
    setStoredRoadDraft(currentUser?.id, null);
    onClose();
  };

  return (
    <Modal title="Add a Road" subtitle={form._prefilledFromTrip ? "Prefilled from your drive · +100 points" : "Share a road worth chasing · +100 points"} onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        {Array.isArray(form.path) && form.path.length >= 2 && (
          <div style={{ gridColumn: "1/-1", fontSize: 11, color: C.dim, lineHeight: 1.5, marginBottom: 12 }}>
            📍 The line you drove on this section is saved with the road so run invites can draw its real shape. Only the section you picked is shared — no times or speeds.
          </div>
        )}
        <div style={{ gridColumn: "1/-1" }}><Input label="Road Name *" value={form.name} onChange={v=>set("name",v)} placeholder="e.g. Kenilworth–Maleny Road" /></div>
        <Input label="Region *" value={form.region} onChange={v=>set("region",v)} placeholder="Sunshine Coast Hinterland" />
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>Country</div>
          <select value={form.country || "AU"} onChange={e=>set("country",e.target.value)} style={{ width:"100%", background:"#0f0f0f", border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 12px", color:C.bone, fontSize:13, marginBottom:14 }}>
            {Object.entries(COUNTRIES).map(([code,name])=><option key={code} value={code}>{name}</option>)}
          </select>
        </div>
        {(form.country || "AU") === "AU" && (
          <div>
            <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>State</div>
            <select value={form.state} onChange={e=>set("state",e.target.value)} style={{ width:"100%", background:"#0f0f0f", border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 12px", color:C.bone, fontSize:13, marginBottom:14 }}>
              {["QLD","NSW","VIC","TAS","SA","WA","NT","ACT"].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>
        )}
        <div style={{ gridColumn:"1/-1" }}><Input label="Description" value={form.description} onChange={v=>set("description",v)} placeholder="What makes this road worth chasing?" multiline /></div>
        <Input label="Distance" value={form.distance} onChange={v=>set("distance",v)} placeholder="28km" />
        <Input label="Drive Time" value={form.duration} onChange={v=>set("duration",v)} placeholder="35 min" />
        <Input label="Start Lat" value={form.startLat} onChange={v=>set("startLat",v)} placeholder="-26.596" />
        <Input label="Start Lng" value={form.startLng} onChange={v=>set("startLng",v)} placeholder="152.739" />
        <Input label="End Lat" value={form.endLat} onChange={v=>set("endLat",v)} placeholder="-26.761" />
        <Input label="End Lng" value={form.endLng} onChange={v=>set("endLng",v)} placeholder="152.863" />
        <div style={{ gridColumn:"1/-1" }}><Input label="Tags (comma separated)" value={form.tags} onChange={v=>set("tags",v)} placeholder="Twisties, Views, Remote" /></div>
        <div style={{ gridColumn:"1/-1" }}><Input label="Busy Times to Avoid (one per line)" value={form.busyTimes} onChange={v=>set("busyTimes",v)} multiline rows={2} placeholder="Sat 10am–2pm&#10;Public holidays" /></div>
        <Input label="Fuel (one per line)" value={form.fuel} onChange={v=>set("fuel",v)} multiline rows={2} placeholder="Town BP (start)&#10;Servo 50km in" />
        <Input label="Food & Coffee (one per line)" value={form.food} onChange={v=>set("food",v)} multiline rows={2} placeholder="Local bakery&#10;Roadhouse" />
        <div style={{ gridColumn:"1/-1" }}><Input label="Meetup / Parking Spots (one per line)" value={form.meetups} onChange={v=>set("meetups",v)} multiline rows={2} placeholder="Town hall car park&#10;Rest area at summit" /></div>
      </div>
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:16, marginTop:4 }}>
        <div style={{ fontSize:12, color:C.champagne, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14 }}>Your Ratings</div>
        {[["driveability","Driveability"],["accessibility","Accessibility"],["views","Views / Scenery"],["surface","Surface Quality"],["thrill","Thrill Factor"]].map(([k,l]) => (
          <div key={k} style={{ marginBottom:12 }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em" }}>{l}</span>
              <span style={{ fontSize:12, color:C.champagne }}>{ratings[k].toFixed(1)}</span>
            </div>
            <input type="range" min={1} max={5} step={0.5} value={ratings[k]} onChange={e=>setRatings(r=>({...r,[k]:parseFloat(e.target.value)}))} style={{ width:"100%" }} />
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:10, marginTop:20 }}>
        <Btn variant="ghost" onClick={handleCancel} style={{ flex:1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} style={{ flex:2 }}>Submit Road</Btn>
      </div>
    </Modal>
  );
};

// ─── SCREENSHOT PROMPT ────────────────────────────────────────
// ─── LOGIN SCREEN ─────────────────────────────────────────────
// v3.0: No more ScreenshotPrompt/username-suggestions — email IS the
// recovery mechanism now, so there's nothing to lose and nothing to screenshot.
// ─── SPLASH SCREEN ────────────────────────────────────────────
// Session 22: the "cold call" problem Scott flagged — a shared invite link
// used to drop straight onto the email sign-in form with zero context on
// what the app even is. This sits in front of LoginScreen for a first-time
// visitor only (gated by localStorage below, in App) — magazine-style
// per scvd.app's own editorial look, not a generic app onboarding carousel.
// runInvite (from /run/:id's CTA — see worker.js Session 22) gets a
// specific "you're invited to THIS run" treatment; the older generic
// ?invite= mate-link (see ProfileView's handleInvite) still gets its own,
// less specific banner. Either, both, or neither can be present.
const PILLARS = [
  { emoji: "🚗", title: "Cars", blurb: "Garage builds, spirited drives, and the roads worth chasing them on." },
  { emoji: "🏍️", title: "Bikes", blurb: "Two wheels welcome — the same roads, the same community." },
  { emoji: "⛵", title: "Boats", blurb: "Rivers and coastline runs, logged the same way as a road trip." },
  { emoji: "🎸", title: "Riffs", blurb: "The soundtrack for the drive — guitar content woven through it all." },
];

const SplashScreen = ({ inviterName, runInvite, onContinue }) => {
  const [showTour, setShowTour] = useState(false);
  return (
    <div style={{ height:"100dvh", overflowY:"auto", background:C.midnight, color:C.bone }}>
      {showTour && <TourModal onClose={() => setShowTour(false)} />}
      <div style={{ maxWidth:480, margin:"0 auto", padding:"0 0 40px" }}>

        {/* Hero */}
        <div style={{ padding:"48px 28px 8px", textAlign:"center" }}>
          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:46, fontWeight:700, color:C.champagne, lineHeight:1 }}>
            Chasin<span style={{ color:C.red }}>'</span> Curves
          </div>
          <div style={{ fontSize:11, color:"#555", letterSpacing:"0.22em", textTransform:"uppercase", marginTop:8, marginBottom:28 }}>Roads, Rivers &amp; Riffs</div>

          <div style={{ width:"100%", maxWidth:320, margin:"0 auto 28px", opacity:0.18 }}>
            <svg viewBox="0 0 340 40" style={{ width:"100%" }}>
              <path d="M0,20 Q85,5 170,20 Q255,35 340,20" stroke={C.champagne} strokeWidth="1.5" fill="none"/>
              <path d="M0,28 Q85,13 170,28 Q255,43 340,28" stroke={C.champagne} strokeWidth="0.8" fill="none"/>
              <path d="M0,12 Q85,-3 170,12 Q255,27 340,12" stroke={C.blue} strokeWidth="0.6" fill="none"/>
            </svg>
          </div>

          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:28, fontWeight:700, color:C.bone, lineHeight:1.25, marginBottom:14 }}>
            Your next great drive starts with the right company.
          </div>
          <div style={{ fontSize:14, color:C.muted, lineHeight:1.7, maxWidth:360, margin:"0 auto" }}>
            A community of drivers, riders and boat owners sharing the roads and rivers worth chasing — and the garages, playlists and stories that go with them.
          </div>
        </div>

        <div style={{ margin:"28px 20px 0" }}>
          <button
            onClick={() => setShowTour(true)}
            style={{ width:"100%", padding:"13px 0", background:"transparent", border:`1px solid ${C.champagne}`, borderRadius:10, color:C.champagne, fontFamily:"'Josefin Sans', sans-serif", fontSize:13, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em", cursor:"pointer" }}>
            🎬 Take a Tour
          </button>
        </div>

        {/* Invite feature — run-specific takes priority over the generic mate-invite */}
        {runInvite ? (
          <div style={{ margin:"32px 20px 0", padding:"22px 22px", background:"#131313", border:`1px solid ${C.champagne}`, borderRadius:14 }}>
            <div style={{ fontSize:10, letterSpacing:"0.18em", textTransform:"uppercase", color:C.champagne, marginBottom:10 }}>🏁 You're Invited</div>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:24, fontWeight:700, color:C.bone, marginBottom:6 }}>{runInvite.title}</div>
            {runInvite.host && <div style={{ fontSize:13, color:C.muted }}>Hosted by {runInvite.host}</div>}
            <div style={{ fontSize:12, color:C.dim, marginTop:12, lineHeight:1.6 }}>Join the Garage below to see the details and RSVP.</div>
          </div>
        ) : inviterName ? (
          <div style={{ margin:"32px 20px 0", padding:"16px 20px", background:C.champagneDim, border:`1px solid ${C.champagne}`, borderRadius:12, fontSize:13, color:C.champagneLight, textAlign:"center" }}>
            🏁 <strong>{inviterName.slice(0, 40)}</strong> invited you to join
          </div>
        ) : null}

        {/* Editorial pillars grid */}
        <div style={{ margin:"40px 20px 0", display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          {PILLARS.map(p => (
            <div key={p.title} style={{ padding:"18px 16px", background:"#111", border:`1px solid ${C.border}`, borderRadius:12 }}>
              <div style={{ fontSize:22, marginBottom:8 }}>{p.emoji}</div>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:18, fontWeight:700, color:C.champagne, marginBottom:4 }}>{p.title}</div>
              <div style={{ fontSize:12, color:C.dim, lineHeight:1.5 }}>{p.blurb}</div>
            </div>
          ))}
        </div>

        {/* What's inside — feature list, editorial style */}
        <div style={{ margin:"40px 20px 0" }}>
          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:22, fontWeight:700, color:C.bone, marginBottom:16, textAlign:"center" }}>What's inside the garage</div>
          {[
            ["Trips & Runs", "Plan a drive, invite the convoy, and see who's actually going."],
            ["GPS Logbook", "A real compliance trail for club and historic registration — logged automatically."],
            ["Your Garage", "Show off the build — photos, mods, and the story behind it."],
            ["Community Roads", "A growing, member-sourced map of the roads actually worth the drive."],
          ].map(([h, b]) => (
            <div key={h} style={{ display:"flex", gap:14, marginBottom:18, alignItems:"flex-start" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:C.champagne, marginTop:7, flexShrink:0 }} />
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:C.bone, marginBottom:2 }}>{h}</div>
                <div style={{ fontSize:13, color:C.dim, lineHeight:1.6 }}>{b}</div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ margin:"36px 20px 0" }}>
          <button
            onClick={onContinue}
            style={{ width:"100%", padding:"16px 0", background:`linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})`, border:"none", borderRadius:10, color:C.midnight, fontFamily:"'Josefin Sans', sans-serif", fontSize:14, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", cursor:"pointer" }}>
            Join the Garage — It's Free →
          </button>
          <div style={{ marginTop:16, fontSize:10, color:"#2a2a2a", textAlign:"center", letterSpacing:"0.08em" }}>NO ADS · NO AUTO-RENEWAL · NO NONSENSE</div>
        </div>
      </div>
    </div>
  );
};

// ─── SPLASH TOUR SLIDESHOW ────────────────────────────────────
// Session 23: Scott's "take a tour" ask — illustrative previews (not live
// screenshots pulled from real user data) of six core screens, each panning
// like a Ken Burns effect, alternating direction per slide as specified.
// Built from the same style tokens as the real screens (GarageView's card
// treatment, the /run/:id invite card, TripPlanner's form) rather than
// generic stock mockup chrome, so it reads as a genuine peek rather than
// marketing filler. CSS-only animation — restarted each slide via the
// `key` prop forcing a remount, rather than manual JS animation control.
// Session 23: Scott's "take a tour" ask — illustrative previews (not live
// screenshots pulled from real user data) of six core screens, each panning
// like a Ken Burns effect, alternating direction per slide as specified.
// Built from the same style tokens as the real screens (GarageView's card
// treatment, the /run/:id invite card, TripPlanner's form) rather than
// generic stock mockup chrome, so it reads as a genuine peek rather than
// marketing filler.
//
// Session 24 fixes: (1) the embedded inline box didn't fit small screens —
// replaced with a "Take a Tour" button opening a full-screen modal instead.
// (2) real bug: caption text (vehicle name, run title) used to live INSIDE
// the same layer that pans/scales, so it got swept along and clipped
// off-screen mid-animation. Fixed by splitting each slide into `bg`
// (pans/scales, purely decorative, no text) and a stationary `caption`
// overlay pinned to the bottom that never moves. (3) `photoUrl` — the
// Garage and Trip Invites slides now use a real, already-hosted photo of
// Scott's Z4 (pulled from R2 the same way /run/:id already does) instead
// of a gradient, per the "looks bare" feedback. (4) Added a 7th slide,
// "Your Music, Too", using a real photo of Scott's actual guitar garage
// entry — the Riffs pillar had no tour slide of its own before this, only
// a small icon block further down the splash page. Postcards, Plan a Run,
// GPS Logbook and Community Roads are still gradient/mockup placeholders
// pending road or trip-themed photo URLs (guitar photos don't fit those
// captions). Two more real guitar photos (SCOTT_GUITAR_PHOTO_2/3) are
// defined below but not yet used anywhere — held in reserve.
const SCOTT_Z4_PHOTO = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/scott_cc_v1781786987231_1781787046541.jpg";
// Session 24: three real photos of Scott's actual "1986 My Guitars Tele's
// and Strat's" garage entry — gives the Riffs pillar (previously covered
// only by a small icon block, no tour slide of its own) real content.
const SCOTT_GUITAR_PHOTO_1 = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/emblen_scott_gmail_com_v1789438741327_1789439007278.jpg";
const SCOTT_GUITAR_PHOTO_2 = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/emblen_scott_gmail_com_v1789438741327_1789439025769.jpg";
const SCOTT_GUITAR_PHOTO_3 = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/emblen_scott_gmail_com_v1789438741327_1789439037981.jpg";
// Session 25: Scott's own real trip postcard (Beerwah ↔ Mount Mellum,
// 10km, 2004 Jaguar X350) — replaces the gradient-only placeholder below.
const SCOTT_JAG_POSTCARD = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/emblen_scott_gmail_com_v1781787551054_1789440765319.jpg";
// Session 28: real Garage photos for the remaining vehicle rows in the
// "Your Garage" tour slide — completes what was a partial (Z4-only) fix.
const SCOTT_JAGUAR_PHOTO = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/scott_cc_v1781787551054_1781787606155.jpg";
const SCOTT_TRIUMPH_PHOTO = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/scott_cc_v1781787739483_1781790126045.jpg";
const SCOTT_MUSTANG_PHOTO = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/scott_cc_v1781788119651_1781788455137.jpg";
const SCOTT_LANDCRUISER_PHOTO = "https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev/scott_cc_v1781787929689_1781790031237.jpg";

const TOUR_SLIDES = [
  {
    // Session 27: rebuilt as a multi-vehicle list (was a single-vehicle
    // hero card) — per Scott's call, showing the real breadth of a garage
    // (six real vehicles: cars, a bike, a boat, guitars) gives a much
    // clearer sense of what a paid tier actually unlocks than one car.
    meta: "Your Garage",
    fit: true,
    photoUrl: null,
    bg: () => (
      <div style={{ position:"absolute", inset:0, background:"#0a0a0a", display:"flex", flexDirection:"column", justifyContent:"center", gap:8, padding:"0 6%" }}>
        {[
          { code:"BZ", name:"2005 BMW Z4", spec:"E85 3.0i · Imola Red", color:C.red, photo:SCOTT_Z4_PHOTO },
          { code:"JX", name:"2004 Jaguar X350", spec:"3.5l V8 · Champagne", color:C.champagne, primary:true, photo:SCOTT_JAGUAR_PHOTO },
          { code:"TT", name:"2014 Triumph Thunderbird Storm", spec:"1700cc · Marble Grey", color:C.blue, photo:SCOTT_TRIUMPH_PHOTO },
          { code:"TL", name:"2016 Toyota LandCruiser 200 Series", spec:"4.5l V8 Twin Turbo Diesel · Black", color:C.blue, photo:SCOTT_LANDCRUISER_PHOTO },
          { code:"M3", name:"1993 Mustang 3200 Widebody", spec:"Twin 5.7l MerCruiser V8's · White", color:C.blue, photo:SCOTT_MUSTANG_PHOTO },
          { code:"MT", name:"1986 My Guitars Tele's and Strat's", spec:"Telecaster, Stratocaster, Custom Build · Multiple", color:C.blue, photo:SCOTT_GUITAR_PHOTO_3 },
        ].map(v => (
          <div key={v.code} style={{ position:"relative", display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, border:`1px solid ${v.primary ? C.champagne : C.border}`, overflow:"hidden", minHeight:56 }}>
            {/* Session 28: photo-backed rows, matching the real Garage
                screen's own card treatment (dark image, low brightness,
                content overlaid) — only vehicles with a real hosted photo
                get one; the rest stay plain flat rows rather than faking
                imagery that doesn't exist yet. */}
            {v.photo
              ? <img src={v.photo} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover", filter:"brightness(0.3)" }} />
              : <div style={{ position:"absolute", inset:0, background:"#111" }} />}
            <div style={{ width:34, height:34, borderRadius:"50%", border:`1px solid ${v.color}`, color:v.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0, position:"relative", background:"rgba(0,0,0,0.4)" }}>{v.code}</div>
            <div style={{ flex:1, minWidth:0, position:"relative" }}>
              <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:14, fontWeight:600, color:C.bone, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{v.name}</div>
              <div style={{ fontSize:10, color:C.muted }}>{v.spec}</div>
            </div>
            {v.primary && <span style={{ fontSize:9, padding:"2px 7px", borderRadius:10, background:C.champagneDim, color:C.champagne, flexShrink:0, position:"relative" }}>★ Primary</span>}
          </div>
        ))}
      </div>
    ),
    caption: null,
  },
  {
    meta: "Your Music, Too",
    pan: "panTB",
    photoUrl: SCOTT_GUITAR_PHOTO_1,
    bg: () => <div style={{ position:"absolute", inset:0, background:"#0d0d0d" }} />,
    caption: { title: "1986 My Guitars Tele's and Strat's", subtitle: "Telecaster, Stratocaster, Custom Build · Multiple", eyebrow: "🎸 Riffs" },
  },
  {
    // `fit:true` — this is a fully-composed poster where every edge matters
    // (title, stats, route all baked in). The pan treatment elsewhere
    // oversizes content by ~30% specifically so a photographic background
    // can be "scanned" without ever showing a hard edge — wrong for
    // something meant to be seen in full.
    meta: "Trip Postcards",
    fit: true,
    photoUrl: SCOTT_JAG_POSTCARD,
    bg: () => <div style={{ position:"absolute", inset:0, background:"#0d0d0d" }} />,
    caption: null, // the postcard already has its own title/stats/route baked in — no need to double up
  },
  {
    // Session 29: swapped the stale, past-dated "Kenilworth Donuts Run"
    // (18 Sept — already happened by the time anyone would see this) for
    // Scott's real, upcoming, currently-hosted run. Also now shows Edit and
    // Cancel Run alongside Share, since this is genuinely Scott's own run
    // as host — a chance to put the new host controls in front of
    // visitors, not just members who happen to host a run themselves.
    meta: "Trips & Runs",
    fit: true,
    photoUrl: null,
    bg: () => (
      <div style={{ position:"absolute", inset:0, background:"#0a0a0a", padding:"6% 6% 0" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
          <div>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:18, color:C.champagne }}>Trips & Runs</div>
            <div style={{ fontSize:10, color:C.dim }}>See who's heading out. Join the convoy.</div>
          </div>
          <span style={{ fontSize:11, fontWeight:700, padding:"7px 14px", borderRadius:8, background:`linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})`, color:C.midnight }}>+ PLAN A RUN</span>
        </div>
        <div style={{ border:`1px solid ${C.border}`, borderRadius:10, padding:14 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:16, fontWeight:600, color:C.bone }}>Goodbye 2026 Cruise</div>
            <div style={{ fontSize:10, color:C.dim }}>1 going</div>
          </div>
          <div style={{ fontSize:10, color:C.dim, marginBottom:8 }}>27 Dec 2026 · 08:00</div>
          <div style={{ display:"flex", gap:6, marginBottom:10, flexWrap:"wrap" }}>
            <span style={{ fontSize:9, padding:"3px 9px", borderRadius:12, background:"#1a1608", color:C.champagne }}>Kenilworth-Maleny Road</span>
            <span style={{ fontSize:9, padding:"3px 9px", borderRadius:12, background:"#1a1608", color:C.champagne }}>Peachester Road</span>
          </div>
          <div style={{ fontSize:10, color:C.dim, fontStyle:"italic", marginBottom:12 }}>Coffee to start, then up the hill and around a few scenic curves before returning to Aussie World for some lunch and a beer</div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <span style={{ fontSize:10, padding:"5px 12px", borderRadius:6, border:`1px solid ${C.blue}`, color:C.blue }}>✓ YOU'RE IN</span>
            <span style={{ fontSize:10, padding:"5px 12px", borderRadius:6, border:`1px solid ${C.border}`, color:C.dim }}>📤 SHARE</span>
            <span style={{ fontSize:10, padding:"5px 12px", borderRadius:6, border:`1px solid ${C.border}`, color:C.dim }}>✏️ EDIT</span>
            <span style={{ fontSize:10, padding:"5px 12px", borderRadius:6, border:`1px solid ${C.red}`, color:C.red }}>CANCEL RUN</span>
          </div>
        </div>
      </div>
    ),
    caption: null,
  },
  {
    // Session 27: real vehicles + realistic odometer entries and points,
    // matching the actual Logbook screen's structure — was generic
    // invented dates/distances before.
    meta: "GPS Logbook",
    fit: true,
    photoUrl: null,
    bg: () => (
      <div style={{ position:"absolute", inset:0, background:"#0a0a0a", padding:"6%" }}>
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:18, color:C.champagne, marginBottom:2 }}>Logbook</div>
        <div style={{ fontSize:10, color:C.dim, marginBottom:18 }}>Same-day entries only — timestamp is captured automatically.</div>
        {[
          { v:"2004 Jaguar X350", d:"27 Aug 2026, 4:06 pm", o:"365046 → 365056", pts:"27 PTS" },
          { v:"2004 Jaguar X350", d:"27 Aug 2026, 2:58 pm", o:"365036 → 365046", pts:"45 PTS" },
          { v:"2005 BMW Z4", d:"25 Aug 2026, 4:22 pm", o:"135251 → 135258", pts:null },
        ].map((e, i) => (
          <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
            <div>
              <div style={{ fontSize:13, color:C.bone, marginBottom:2 }}>{e.v}</div>
              <div style={{ fontSize:10, color:C.dim }}>{e.d} · Odo {e.o}</div>
            </div>
            {e.pts && <span style={{ fontSize:10, padding:"4px 9px", borderRadius:8, border:`1px solid ${C.champagne}`, color:C.champagne, flexShrink:0 }}>📍 {e.pts}</span>}
          </div>
        ))}
      </div>
    ),
    caption: null,
  },
  {
    // Session 29: real, current screenshot (same file used on the scvd.app
    // landing page) — replaces the earlier two-road mockup, which listed
    // only Kenilworth-Maleny and Bruxner Highway and had no idea the roads
    // list now spans multiple countries. A live screenshot can't go stale
    // the way a hand-built mockup did: it shows exactly what's in the app
    // the day it's taken, chips and all (Switzerland selected, Furka Pass /
    // Bernina Pass / Stelvio Pass visible). `fit:true` because, like the
    // Postcards slide, every edge (title, chips, list) matters and the
    // image already carries its own text — no caption needed.
    meta: "Roads",
    fit: true,
    photoUrl: "https://scvd.app/images/cc-roads.jpg",
    bg: () => <div style={{ position:"absolute", inset:0, background:"#0d0d0d" }} />,
    caption: null,
  },
];

// The slide box itself — pannable background layer + stationary caption
// overlay on top, sized by the `height` prop so the same component works
// both small (unused now, kept for potential future inline use) and full
// screen inside TourModal.
// Session 26: `fit` slides render at inset:0 with no scale/animation at
// all — a self-contained composition (a poster, a form mockup, a list, a
// map) needs every edge visible, not oversized and panned like a photo
// background. `routeOverlay` (dotted line + place-name labels) is its own
// stationary layer, same reasoning as the caption fix last session —
// anything meant to stay readable can't live inside the panned/scaled div.
const TourSlideBox = ({ slide, index, height }) => (
  // Session 27 fix: explicit width:"100%" here — this div's only content
  // is absolutely positioned, so it has zero intrinsic width of its own.
  // Placed inside a flex parent (as it briefly was) with no width set, it
  // collapses to near-nothing — this is what caused every slide to render
  // blank. Setting width here directly means that failure mode can't
  // recur regardless of what kind of container wraps it later.
  <div style={{ position:"relative", width:"100%", height, borderRadius:14, overflow:"hidden", border:`1px solid ${C.border}` }}>
    <div key={index} style={{ position:"absolute", inset: slide.fit ? 0 : "-8%", animation: slide.fit ? "none" : `${slide.pan} 4.5s linear forwards` }}>
      {slide.photoUrl
        ? <img src={slide.photoUrl} alt="" style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
        : slide.bg()}
    </div>
    {slide.photoUrl && slide.caption && <div style={{ position:"absolute", inset:0, background:"linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.05) 50%)" }} />}
    {slide.routeOverlay && (
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position:"absolute", inset:0, width:"100%", height:"100%" }}>
        <polyline points={slide.routeOverlay.points} fill="none" stroke={C.champagne} strokeWidth="0.5" strokeDasharray="1.2,1.2" strokeOpacity="0.8" />
      </svg>
    )}
    {slide.routeOverlay && slide.routeOverlay.labels.map((l, i) => (
      <div key={i} style={{ position:"absolute", left:`${l.x}%`, top:`${l.y}%`, transform:"translate(-50%,-50%)", fontSize:12, fontWeight:600, color:C.bone, textShadow:"0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)", whiteSpace:"nowrap" }}>{l.text}</div>
    ))}
    {slide.caption && (
      <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:18 }}>
        {slide.caption.eyebrow && <div style={{ fontSize:10, letterSpacing:"0.15em", textTransform:"uppercase", color:C.champagne, marginBottom:8 }}>{slide.caption.eyebrow}</div>}
        {slide.caption.badge && <span style={{ display:"inline-block", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", padding:"3px 10px", borderRadius:12, background: slide.caption.badgeColor || C.champagneDim, color: slide.caption.badgeColor ? "#fff" : C.champagne, marginBottom:8 }}>{slide.caption.badge}</span>}
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:22, fontWeight:700, color:C.bone, marginBottom:4 }}>{slide.caption.title}</div>
        {slide.caption.subtitle && <div style={{ fontSize:12, color:C.muted }}>{slide.caption.subtitle}</div>}
      </div>
    )}
  </div>
);

// Full-screen tour — opened from the splash page's "Take a Tour" button
// rather than embedded inline, since a small embedded box didn't have
// enough room to show a slide clearly on narrow screens.
const TourModal = ({ onClose }) => {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIndex(i => (i + 1) % TOUR_SLIDES.length), 4500);
    return () => clearInterval(t);
  }, []);
  const slide = TOUR_SLIDES[index];
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, background:C.midnight, display:"flex", flexDirection:"column", padding:20 }}>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14, maxWidth:480, width:"100%", margin:"0 auto 14px" }}>
        <span onClick={onClose} style={{ fontSize:22, color:C.dim, cursor:"pointer", padding:4 }}>✕</span>
      </div>
      {/* Session 27: capped at maxWidth:480 (same as the rest of the splash
          page) — previously stretched edge-to-edge on desktop, producing an
          extreme wide aspect ratio that made object-fit:cover crop photos
          far more aggressively than on a phone ("blown out" per Scott).
          Keeping the box phone-shaped regardless of window width fixes it
          at the source rather than fighting object-fit per slide. */}
      <div style={{ flex:1, minHeight:0, maxWidth:480, width:"100%", margin:"0 auto" }}>
        <TourSlideBox slide={slide} index={index} height="100%" />
      </div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:16, maxWidth:480, width:"100%", margin:"16px auto 0" }}>
        <div style={{ fontSize:12, color:C.muted }}>{slide.meta}</div>
        <div style={{ display:"flex", gap:8 }}>
          {TOUR_SLIDES.map((s, i) => (
            <div key={i} onClick={() => setIndex(i)} style={{ width:7, height:7, borderRadius:"50%", background: i === index ? C.champagne : C.faint, cursor:"pointer" }} />
          ))}
        </div>
      </div>
      <style>{`
        @keyframes panLR { from { transform: translateX(0) scale(1.12); } to { transform: translateX(-6%) scale(1.12); } }
        @keyframes panRL { from { transform: translateX(-6%) scale(1.12); } to { transform: translateX(0) scale(1.12); } }
        @keyframes panBT { from { transform: translateY(0) scale(1.12); } to { transform: translateY(-6%) scale(1.12); } }
        @keyframes panTB { from { transform: translateY(-6%) scale(1.12); } to { transform: translateY(0) scale(1.12); } }
      `}</style>
    </div>
  );
};

const LoginScreen = ({ onRequestCode, onVerifyCode, onResend, step, loading, error, inviterName, inAppBrowser, onDismissInAppWarning }) => {
  // step: "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const cleanEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const cleanCode = code.replace(/\D/g, "").slice(0, 6);

  const submitEmail = () => { if (emailValid && !loading) onRequestCode(cleanEmail); };
  const submitCode = () => { if (cleanCode.length === 6 && !loading) onVerifyCode(cleanEmail, cleanCode); };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", background:C.midnight }}>
      {inAppBrowser && <InAppBrowserWarning appName={inAppBrowser} onDismiss={onDismissInAppWarning} />}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, minHeight:0, overflowY:"auto", padding:32, gap:0 }}>
      {/* Invite banner — purely cosmetic, from a ?invite= query param on a
          shared link (see ProfileView's "Invite a Mate"). Never trusted for
          anything beyond display: it's just the inviter's own display name,
          URL-encoded client-side, so it can't expose account data. */}
      {inviterName && (
        <div style={{ marginBottom:20, padding:"8px 18px", background:C.champagneDim, border:`1px solid ${C.champagne}`, borderRadius:20, fontSize:12, color:C.champagneLight, textAlign:"center", maxWidth:340 }}>
          🏁 <strong>{inviterName.slice(0, 40)}</strong> invited you to join
        </div>
      )}

      {/* Logo */}
      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:42, fontWeight:700, color:C.champagne, lineHeight:1 }}>
          Chasin<span style={{ color:C.red }}>'</span> Curves
        </div>
        <div style={{ fontSize:11, color:"#444", letterSpacing:"0.2em", textTransform:"uppercase", marginTop:8 }}>Roads, Rivers & Riffs</div>
      </div>

      {/* Road lines */}
      <div style={{ width:"100%", maxWidth:340, marginBottom:32, opacity:0.15 }}>
        <svg viewBox="0 0 340 40" style={{ width:"100%" }}>
          <path d="M0,20 Q85,5 170,20 Q255,35 340,20" stroke={C.champagne} strokeWidth="1.5" fill="none"/>
          <path d="M0,28 Q85,13 170,28 Q255,43 340,28" stroke={C.champagne} strokeWidth="0.8" fill="none"/>
          <path d="M0,12 Q85,-3 170,12 Q255,27 340,12" stroke={C.blue} strokeWidth="0.6" fill="none"/>
        </svg>
      </div>

      {/* Input card */}
      <div style={{ width:"100%", maxWidth:340, background:"#111", border:`1px solid ${C.border}`, borderRadius:14, padding:24 }}>
        {step === "email" ? (
          <>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:20, color:C.champagne, marginBottom:6 }}>Enter the Garage</div>
            <div style={{ fontSize:12, color:C.dim, marginBottom:20, lineHeight:1.6 }}>We'll email you a 6-digit code — no password to remember, no one else can get into your garage.</div>

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Email</div>
              <input
                value={email}
                type="email"
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitEmail()}
                placeholder="you@example.com"
                autoFocus
                style={{ width:"100%", background:"#0a0a0a", border:`1px solid ${error ? C.red : C.border}`, borderRadius:8, padding:"11px 14px", color:C.bone, fontSize:15, fontFamily:"'Josefin Sans', sans-serif", outline:"none", boxSizing:"border-box", letterSpacing:"0.02em" }}
              />
            </div>

            {error && <div style={{ fontSize:12, color:C.red, marginTop:8, marginBottom:8 }}>{error}</div>}

            <button
              onClick={submitEmail}
              disabled={!emailValid || loading}
              style={{ width:"100%", marginTop:16, padding:"13px 0", background: emailValid && !loading ? `linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})` : "#1a1a1a", border:"none", borderRadius:8, color: emailValid && !loading ? C.midnight : C.dim, fontFamily:"'Josefin Sans', sans-serif", fontSize:13, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", cursor: emailValid && !loading ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
              {loading ? "Sending code..." : "Send Code →"}
            </button>
          </>
        ) : (
          <>
            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:20, color:C.champagne, marginBottom:6 }}>Check your inbox</div>
            <div style={{ fontSize:12, color:C.dim, marginBottom:20, lineHeight:1.6 }}>
              We sent a 6-digit code to <span style={{ color:C.champagneLight }}>{cleanEmail}</span>. Enter it below.
            </div>

            <div style={{ marginBottom:8 }}>
              <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Code</div>
              <input
                value={cleanCode}
                inputMode="numeric"
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitCode()}
                placeholder="123456"
                autoFocus
                style={{ width:"100%", background:"#0a0a0a", border:`1px solid ${error ? C.red : C.border}`, borderRadius:8, padding:"11px 14px", color:C.bone, fontSize:22, fontFamily:"'Courier New', monospace", letterSpacing:"0.4em", textAlign:"center", outline:"none", boxSizing:"border-box" }}
              />
            </div>

            {error && <div style={{ fontSize:12, color:C.red, marginTop:8, marginBottom:8 }}>{error}</div>}

            <button
              onClick={submitCode}
              disabled={cleanCode.length !== 6 || loading}
              style={{ width:"100%", marginTop:16, padding:"13px 0", background: cleanCode.length === 6 && !loading ? `linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})` : "#1a1a1a", border:"none", borderRadius:8, color: cleanCode.length === 6 && !loading ? C.midnight : C.dim, fontFamily:"'Josefin Sans', sans-serif", fontSize:13, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", cursor: cleanCode.length === 6 && !loading ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
              {loading ? "Checking..." : "Enter the Garage →"}
            </button>

            <button
              onClick={() => onResend(cleanEmail)}
              disabled={loading}
              style={{ width:"100%", marginTop:12, padding:"8px 0", background:"transparent", border:"none", color:C.dim, fontFamily:"'Josefin Sans', sans-serif", fontSize:11, letterSpacing:"0.06em", cursor: loading ? "not-allowed" : "pointer", textDecoration:"underline" }}>
              Send a new code
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop:20, fontSize:10, color:"#2a2a2a", textAlign:"center", letterSpacing:"0.08em" }}>NO ADS · NO AUTO-RENEWAL · NO NONSENSE</div>
      </div>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────
const App = () => {
  const [roads, setRoads] = useState(SEED_ROADS);
  const [trips, setTrips] = useState([]);
  const [pointsLog, setPointsLog] = useState([]);
  const [logbook, setLogbook] = useState([]);
  // Lives here (not inside LogbookView) so GPS polling keeps running when
  // the user switches to another screen — a component-local interval
  // would get torn down the moment LogbookView unmounted.
  const [activeTrip, setActiveTrip] = useState(() => getStoredActiveTrip());
  const [roadDraft, setRoadDraft] = useState(null); // surfaced once currentUser.id is known — see the effect near loadUser
  // Session 16: a successful stop-and-save used to just clear activeTrip,
  // which meant the banner silently vanished with zero confirmation — a
  // real beta tester (Sandy, mid-trip) read that as "the trip disappeared"
  // even though the entry had in fact saved. This notice replaces silence
  // with an explicit "saved" message, and doubles as an honest signal if
  // the trail itself came back empty (permission denied throughout, etc.)
  // rather than letting a 0-point trail save invisibly.
  const [tripSavedNotice, setTripSavedNotice] = useState(null);
  const [showLiveLog, setShowLiveLog] = useState(false);
  const tripSavedTimerRef = useRef(null);
  const gpsIntervalRef = useRef(null);
  // Session 15b: a dedicated second device (e.g. Chasin' Curves mounted for
  // trail logging while turn-by-turn runs on the driver's main phone) is the
  // reliable way to capture a trail on unfamiliar roads. Wake Lock keeps
  // that device's screen from auto-locking mid-trip, which would otherwise
  // suspend polling exactly like switching apps does.
  const wakeLockRef = useRef(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [screen, setScreen] = useState("roads");
  const [showAddRoad, setShowAddRoad] = useState(false);
  const [roadPrefill, setRoadPrefill] = useState(null); // set by the Trip Postcard "Add as Road" flow
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showRoadDetail, setShowRoadDetail] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState(null);
  const [filterState, setFilterState] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(false); // true when the roads/trips API couldn't be reached at startup
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginStep, setLoginStep] = useState("email"); // "email" | "code"
  const [loginError, setLoginError] = useState("");
  // Read once at mount — a shared invite link is only ever opened fresh,
  // never navigated to mid-session, so there's no need to watch for changes.
  const [inviterName] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("invite") || null; }
    catch { return null; }
  });
  // Session 22: run-specific invite context from /run/:id's CTA link
  // (worker.js) — distinct from the generic mate-invite above. Only used
  // to personalize the splash screen; never trusted for anything (title/
  // host are just display text a URL param supplied, same trust level as
  // inviterName above).
  const [runInvite] = useState(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("run");
      if (!id) return null;
      return { id, title: params.get("title") || "A Chasin' Curves run", host: params.get("host") || null };
    } catch { return null; }
  });
  // Session 22: the splash screen is a first-impression fix, not a nag —
  // once a visitor on this device has seen it (whether they signed up or
  // not), it stays dismissed. A returning user who signed out shouldn't
  // see the pitch again.
  const [showSplash, setShowSplash] = useState(() => {
    try { return !localStorage.getItem("cc_seen_splash"); } catch { return true; }
  });
  const dismissSplash = () => {
    try { localStorage.setItem("cc_seen_splash", "1"); } catch { /* private browsing etc — fine, just re-shows next time */ }
    setShowSplash(false);
  };
  // Session 16c: static for the life of the tab (the UA doesn't change),
  // so a lazy-init read once is enough — no need to watch for changes.
  const [inAppBrowser] = useState(() => detectInAppBrowser());
  const [inAppWarningDismissed, setInAppWarningDismissed] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [paymentNotice, setPaymentNotice] = useState(null); // { type: "success"|"cancelled"|"error", message }

  // ── Sign out — clears session, forces back to login ────────
  // Stops any in-flight GPS polling too — otherwise a stale interval would
  // keep firing after sign-out and could even attach a trail to the next
  // person to log in on this device.
  const handleSignOut = useCallback(() => {
    if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
    if (tripSavedTimerRef.current) { clearTimeout(tripSavedTimerRef.current); tripSavedTimerRef.current = null; }
    setStoredActiveTrip(null);
    setActiveTrip(null);
    setTripSavedNotice(null);
    clearSession();
    setCurrentUser(null);
    setPointsLog([]);
    setLogbook([]);
    setLoginStep("email");
  }, []);

  // ── Bootstrap — roads/trips only, no user assumed ──────────
  useEffect(() => {
    const init = async () => {
      try {
        const apiRoads = await api.getRoads();
        if (Array.isArray(apiRoads) && apiRoads.length > 0) {
          setRoads(apiRoads);
          setSelected(apiRoads[0]);
        } else {
          for (const road of SEED_ROADS) await api.postRoad(road);
          setSelected(SEED_ROADS[0]);
        }
        const apiTrips = await api.getTrips();
        if (Array.isArray(apiTrips)) setTrips(apiTrips);
      } catch (err) {
        console.error("API init failed", err);
        setApiError(true);
        setSelected(SEED_ROADS[0]);
      } finally {
        setLoading(false);
      }
    };

    // Check localStorage for a valid session — skip login screen if found.
    // If the session's rejected (expired/revoked), fall back to login
    // rather than getting stuck — same pattern for any authFailed error.
    const session = getSession();
    if (session?.token && session?.email) {
      loadUser(session.email)
        .catch(e => { if (e?.authFailed) clearSession(); })
        .finally(() => init());
    } else {
      init();
    }
  }, []);

  // ── Load user from KV by email — assumes a session already exists ──
  const loadUser = async (email) => {
    const profile = await api.getMember(email);
    const garage  = await api.getGarage(email);
    const resolvedGarage = Array.isArray(garage) ? garage : [];
    setCurrentUser({ ...profile, garage: resolvedGarage });
    try {
      const entries = await api.getLogbook(email);
      if (Array.isArray(entries)) setLogbook(entries);
    } catch (e) { if (e?.authFailed) throw e; /* non-fatal otherwise — logbook just starts empty */ }
  };

  // Session 18 — return from Stripe Checkout. success_url carries Stripe's
  // own {CHECKOUT_SESSION_ID}; this calls /checkout-status to self-heal in
  // case the webhook hasn't landed yet (see worker.js's note on why —
  // matches a real gap found in Cult Connections' original checkout),
  // reloads the member so Pro unlocks immediately, then strips the query
  // params so a refresh doesn't re-trigger this.
  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const payment = params.get("payment");
    if (!payment) return;

    const cleanUrl = () => {
      const cleanedUrl = new URL(window.location.href);
      cleanedUrl.searchParams.delete("payment");
      cleanedUrl.searchParams.delete("session_id");
      window.history.replaceState({}, "", cleanedUrl.pathname + cleanedUrl.search);
    };

    if (payment === "cancelled") {
      setPaymentNotice({ type: "cancelled", message: "Checkout cancelled — you weren't charged." });
      cleanUrl();
      return;
    }

    if (payment === "success") {
      const sessionId = params.get("session_id");
      if (!sessionId) { cleanUrl(); return; }
      (async () => {
        try {
          const res = await api.checkoutStatus(sessionId);
          if (res?.granted) {
            await loadUser(currentUser.id);
            setPaymentNotice({ type: "success", message: "You're Pro! Trip Postcards, the Logbook and unlimited vehicles are unlocked." });
          } else {
            setPaymentNotice({ type: "error", message: "Payment received but not confirmed yet — check back in a minute, or email support@scvd.app." });
          }
        } catch {
          setPaymentNotice({ type: "error", message: "Couldn't confirm payment automatically — email support@scvd.app if Pro doesn't unlock shortly." });
        } finally {
          cleanUrl();
        }
      })();
    }
  }, [currentUser?.id]);

  // Session 17 — surfaces a leftover road draft once we actually know who's
  // logged in (getStoredRoadDraft is scoped per-user). Runs on fresh login
  // too, not just session restore, since the same device/browser could
  // still be holding a draft from before a sign-out.
  useEffect(() => {
    if (!currentUser?.id) return;
    const draft = getStoredRoadDraft(currentUser.id);
    if (draft) setRoadDraft(draft);
  }, [currentUser?.id]);

  // ── Step 1: request a code sent to email ────────────────────
  const handleRequestCode = async (email) => {
    setLoginLoading(true);
    setLoginError("");
    try {
      await api.requestCode(email);
      setLoginStep("code");
    } catch (err) {
      setLoginError(err.message || "Couldn't send code. Check your connection and try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Resend — same as requesting, but stays on the code screen ──
  const handleResendCode = async (email) => {
    setLoginLoading(true);
    setLoginError("");
    try {
      await api.requestCode(email);
    } catch (err) {
      setLoginError(err.message || "Couldn't resend code — try again shortly.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Step 2: verify code, establish session, load or create member ──
  const handleVerifyCode = async (email, code) => {
    setLoginLoading(true);
    setLoginError("");
    try {
      const { token, isNewMember } = await api.verifyCode(email, code);
      setSession({ token, email });

      if (isNewMember) {
        const newMember = {
          id: email, displayName: email.split("@")[0],
          location: "", bio: "", avatar: null,
          joinDate: new Date().toISOString().slice(0, 10),
          points: 0, tier: "Explorer",
          roadsAdded: [], reviewsWritten: 0, tripsPlanned: 0,
        };
        await api.postMember(newMember);
        setCurrentUser({ ...newMember, garage: [] });
      } else {
        await loadUser(email);
      }
      setLoginStep("email");
    } catch (err) {
      setLoginError(err.message || "Couldn't verify that code.");
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Earn points ────────────────────────────────────────────
  const earnPoints = useCallback(async (action) => {
    if (!currentUser) return;
    const cfg = POINT_ACTIONS[action];
    if (!cfg) return;
    const entry = { action, earnedAt: new Date().toISOString(), points: cfg.points };
    setPointsLog(prev => [...prev, entry]);
    const updated = { ...currentUser, points: (currentUser.points || 0) + cfg.points };
    setCurrentUser(updated);
    try { await api.updateMember(currentUser.id, { points: updated.points }); }
    catch (e) { if (e?.authFailed) handleSignOut(); }
  }, [currentUser, handleSignOut]);

  // ── Update user — saves member profile AND garage separately ─
  const updateCurrentUser = useCallback(async (updated) => {
    setCurrentUser(updated);
    try {
      // Strip garage from member record — garage has its own KV key
      const { garage, ...memberData } = updated;
      await api.updateMember(updated.id, memberData);
      await api.saveGarage(updated.id, garage || []);
    } catch (e) { if (e?.authFailed) handleSignOut(); }
  }, [handleSignOut]);

  // Session 18 — Pit Pass activation now goes through its own endpoint
  // (worker.js re-checks all 6 requirements server-side) instead of
  // updateCurrentUser's raw PUT /member: pitPassActivated is a protected
  // field now, so a PUT could never actually set it any more — using
  // updateCurrentUser here would look like it worked (optimistic local
  // state) and then silently revert on the next reload.
  const handleActivatePitPass = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await api.activatePitPass(currentUser.id);
      if (res?.pitPassActivated) {
        setCurrentUser(prev => prev ? { ...prev, pitPassActivated: res.pitPassActivated } : prev);
      } else if (res?.error) {
        alert(res.error);
      }
    } catch (e) {
      if (e?.authFailed) handleSignOut();
    }
  }, [currentUser, handleSignOut]);

  // Session 18 — points → Pro redemption. Returns a plain {ok/error}
  // result rather than throwing (matching every other authedFetch caller's
  // "resolve with {error}" convention) so ProfileView can show the message
  // inline without a try/catch of its own.
  const handleRedeemPoints = useCallback(async () => {
    if (!currentUser) return { error: "Not signed in" };
    try {
      const res = await api.redeemPoints(currentUser.id);
      if (res?.ok) {
        setCurrentUser(prev => prev ? {
          ...prev,
          proPoints: res.proPointsRemaining,
          proExpiresAt: res.proExpiresAt,
          proTier: prev.proTier || "redeemed",
        } : prev);
      }
      return res;
    } catch (e) {
      if (e?.authFailed) { handleSignOut(); return { error: "Session expired" }; }
      return { error: e.message || "Couldn't redeem points — try again" };
    }
  }, [currentUser, handleSignOut]);

  // ── Re-fetch garage from KV and sync into state ────────────
  const refreshGarage = useCallback(async () => {
    if (!currentUser) return;
    try {
      const garage = await api.getGarage(currentUser.id);
      if (Array.isArray(garage)) {
        setCurrentUser(prev => ({ ...prev, garage }));
      }
    } catch (e) { if (e?.authFailed) handleSignOut(); }
  }, [currentUser?.id, handleSignOut]);

  // Session 17 — replaces the old client-side earnPoints() optimistic bump
  // for every action the server now awards for real (add_road, add_vehicle,
  // upload_photo, plan_trip, log_trip). Pulls the actual post-award total
  // from the server rather than trusting a local guess, so the UI can
  // never drift from what's really in the ledger.
  const refreshPoints = useCallback(async () => {
    if (!currentUser) return;
    try {
      const m = await api.getMember(currentUser.id);
      setCurrentUser(prev => (prev ? { ...prev, points: m.points } : prev));
    } catch (e) { if (e?.authFailed) handleSignOut(); }
  }, [currentUser?.id, handleSignOut]);

  // ── GPS Snail Trail — one interval, lives at App level so it survives
  // screen switches. Local-first: every point lands in localStorage as it's
  // polled, and the server only sees the trail once, in one PUT, when the
  // trip is stopped — see the GPS_POLL_INTERVAL_MS comment above.
  const pollAndAppend = useCallback(async () => {
    const point = await pollGpsPoint();
    if (!point) return; // denied/timeout — just skip this tick, trip keeps running
    setActiveTrip(prev => {
      if (!prev || prev.stopped) return prev;
      const points = [...prev.points, point].slice(-MAX_TRAIL_POINTS);
      const next = { ...prev, points };
      setStoredActiveTrip(next);
      return next;
    });
  }, []);

  const beginPolling = useCallback(() => {
    if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
    gpsIntervalRef.current = setInterval(pollAndAppend, GPS_POLL_INTERVAL_MS);
  }, [pollAndAppend]);

  // Best-effort — an unsupported browser or a lock the OS declines to grant
  // just means the screen may dim/lock sooner, not that recording breaks;
  // the resume-on-reload path above already covers that case.
  const requestWakeLock = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try { wakeLockRef.current = await navigator.wakeLock.request("screen"); }
    catch { /* denied or unsupported in this context — not fatal */ }
  }, []);
  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
  }, []);

  const startTrailRecording = useCallback((entry, vehicleId) => {
    const trip = { entryId: entry.id, vehicleId, startedAt: Date.now(), points: [], stopped: false };
    setStoredActiveTrip(trip);
    setActiveTrip(trip);
    pollAndAppend(); // grab a first fix immediately rather than waiting a full interval
    beginPolling();
    requestWakeLock();
  }, [pollAndAppend, beginPolling, requestWakeLock]);

  // Resume polling (and the wake lock) on reload if a trip was left running
  // mid-trip — e.g. the tab was fully discarded and reopened after a long
  // stretch on Waze, rather than just suspended in the background.
  useEffect(() => {
    if (activeTrip && !activeTrip.stopped) { beginPolling(); requestWakeLock(); }
    return () => { if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The Wake Lock spec releases the lock automatically the moment the tab
  // is hidden (switching to another app, locking the phone) — that's
  // correct, it should only hold the screen open while Chasin' Curves is
  // actually the one on screen. Re-request it when the tab becomes visible
  // again mid-trip, so a brief interruption (a notification, a phone call)
  // doesn't leave the screen free to auto-lock afterwards.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const trip = getStoredActiveTrip();
      if (trip && !trip.stopped) requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [requestWakeLock]);

  const handleStopTrip = useCallback(async () => {
    if (!currentUser || !activeTrip) return;
    if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    releaseWakeLock();

    // Session 16r — ask for the return odometer right here, at hand-back,
    // instead of leaving it to a separate "+ Return Odo" step someone has
    // to remember to come back for later. Only on the actual first stop
    // (never on a subsequent "Retry Save" of an already-stopped trip,
    // which calls this same function again) — and cancelling doesn't
    // block anything, the trail still saves and "+ Return Odo" is still
    // there afterward exactly as before this change.
    const entry = logbook.find(e => e.id === activeTrip.entryId);
    let odometerEnd = null, endCoord = null;
    if (!activeTrip.stopped && entry && entry.odometerEnd == null) {
      const val = prompt("Trip complete! What's the odometer reading now?");
      if (val !== null) {
        const n = Number(val);
        if (val.trim() === "" || Number.isNaN(n) || n < entry.odometerStart) {
          alert("Enter a number no lower than the start reading — you can add it later from the Logbook instead.");
        } else {
          odometerEnd = n;
          const point = await pollGpsPoint("trip finish pin");
          endCoord = point ? { lat: point.lat, lng: point.lng } : null;
        }
      }
    }

    const stopped = { ...activeTrip, stopped: true };
    setActiveTrip(stopped);
    setStoredActiveTrip(stopped);
    try {
      await api.saveTrail(currentUser.id, activeTrip.entryId, activeTrip.points);
      setLogbook(prev => prev.map(e => e.id === activeTrip.entryId ? { ...e, trail: activeTrip.points } : e));
      if (odometerEnd != null) {
        await api.addReturnOdometer(currentUser.id, activeTrip.entryId, odometerEnd, endCoord);
        setLogbook(prev => prev.map(e => e.id === activeTrip.entryId ? { ...e, odometerEnd, ...(endCoord ? { endCoord } : {}) } : e));
      }
      setStoredActiveTrip(null);
      setActiveTrip(null);
      if (tripSavedTimerRef.current) clearTimeout(tripSavedTimerRef.current);
      setTripSavedNotice({ points: activeTrip.points.length });
      tripSavedTimerRef.current = setTimeout(() => setTripSavedNotice(null), 8000);
    } catch (e) {
      if (e?.authFailed) handleSignOut();
      // Otherwise leave it stopped-but-unsaved in localStorage — the banner's
      // "Retry Save" button calls this same function again, and nothing is
      // lost in the meantime since the points are already on disk.
    }
  }, [currentUser, activeTrip, handleSignOut, releaseWakeLock, logbook]);

  const discardTrail = useCallback(() => {
    releaseWakeLock();
    setStoredActiveTrip(null);
    setActiveTrip(null);
  }, [releaseWakeLock]);

  // ── Logbook — log a trip / attach a return odometer reading ─
  // Session 16: now reports success/failure back to the caller (previously
  // errors were swallowed here — alert-and-return — while the modal above
  // it always called onClose() regardless, so a failed log attempt closed
  // the form silently with only an easily-missed browser alert as the only
  // trace. Returning a boolean lets the modal actually stay open on failure.
  const handleLogTrip = useCallback(async (vehicleId, odometerStart, trackGps) => {
    if (!currentUser) return false;
    try {
      // Session 16e: a single, one-off GPS fix taken right now — separate
      // from the opt-in continuous GPS Trail below (trackGps). This is what
      // lets a Trip Postcard draw a real start→finish route even for a trip
      // logged with a plain odometer reading, not just one recorded live.
      // Denied/unavailable/slow location never blocks logging the trip.
      const point = await pollGpsPoint("trip start pin");
      const startCoord = point ? { lat: point.lat, lng: point.lng } : null;
      const res = await api.postLogEntry(currentUser.id, { vehicleId, odometerStart, ...(startCoord ? { startCoord } : {}) });
      if (res?.entry) {
        setLogbook(prev => [...prev, res.entry]);
        if (trackGps) startTrailRecording(res.entry, vehicleId);
        return true;
      }
      alert("Couldn't log the trip — try again.");
      return false;
    } catch (e) {
      if (e?.authFailed) handleSignOut();
      else alert(`Couldn't log the trip: ${e.message}`);
      return false;
    }
  }, [currentUser, handleSignOut, startTrailRecording]);

  const handleAddReturnOdometer = useCallback(async (entryId, odometerEnd, endCoord) => {
    if (!currentUser) return;
    try {
      await api.addReturnOdometer(currentUser.id, entryId, odometerEnd, endCoord);
      setLogbook(prev => prev.map(e => e.id === entryId ? { ...e, odometerEnd, ...(endCoord ? { endCoord } : {}) } : e));
    } catch (e) {
      if (e?.authFailed) handleSignOut();
      else alert(`Couldn't save the return odometer: ${e.message}`);
    }
  }, [currentUser, handleSignOut]);

  const states = ["All", ...Array.from(new Set(roads.map(roadPlace)))];
  const filteredRoads = roads
    .filter(r => filterState === "All" || roadPlace(r) === filterState)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.region.toLowerCase().includes(search.toLowerCase()));

  // ── Show login screen if no user ────────────────────────────
  if (!currentUser) {
    if (loading) return (
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:C.midnight, gap:16 }}>
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:32, fontWeight:700, color:C.champagne }}>
          Chasin<span style={{ color:C.red }}>'</span> Curves
        </div>
        <div style={{ fontSize:10, color:"#444", letterSpacing:"0.18em", textTransform:"uppercase" }}>Roads, Rivers & Riffs</div>
        <div style={{ marginTop:20, display:"flex", gap:6 }}>
          {[0,1,2].map(i => (
            <div key={i} style={{ width:8, height:8, borderRadius:"50%", background:C.champagne, opacity:0.3, animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:0.3} 50%{opacity:1} }`}</style>
      </div>
    );
    if (showSplash) return <SplashScreen inviterName={inviterName} runInvite={runInvite} onContinue={dismissSplash} />;
    return <LoginScreen
      onRequestCode={handleRequestCode}
      onVerifyCode={handleVerifyCode}
      onResend={handleResendCode}
      step={loginStep}
      loading={loginLoading}
      error={loginError}
      inviterName={inviterName}
      inAppBrowser={inAppWarningDismissed ? null : inAppBrowser}
      onDismissInAppWarning={() => setInAppWarningDismissed(true)}
    />;
  }

  // currentUser is guaranteed non-null from here down
  const tier = getTier(currentUser.points);

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100dvh", background:C.midnight, color:C.bone }}>

      <header style={{ background:C.midnight, borderBottom:`1px solid ${C.border}`, padding:"13px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, zIndex:50 }}>
        <div onClick={() => { setScreen("roads"); setShowRoadDetail(false); }} style={{ cursor:"pointer" }}>
          <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:22, fontWeight:700, color:C.champagne, lineHeight:1 }}>
            Chasin<span style={{ color:C.red }}>'</span> Curves
          </div>
          <div style={{ fontSize:9, color:"#444", letterSpacing:"0.18em", textTransform:"uppercase", marginTop:2 }}>Roads, Rivers & Riffs</div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <PointsBadge pts={currentUser.points} />
          <div style={{ position:"relative" }}>
            <div onClick={() => setScreen("profile")} style={{ width:36, height:36, borderRadius:"50%", background:C.champagneDim, border:`2px solid ${C.champagne}`, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", overflow:"hidden" }}>
              {currentUser.avatar
                ? <img src={currentUser.avatar} style={{ width:"100%", height:"100%", objectFit:"cover" }} />
                : <span style={{ fontSize:14, color:C.champagne, fontFamily:"'Cormorant Garamond', serif" }}>{currentUser.displayName[0]}</span>
              }
            </div>
          </div>
          <button onClick={handleSignOut} title="Sign out" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px", color:C.dim, fontSize:10, cursor:"pointer", fontFamily:"'Josefin Sans', sans-serif", textTransform:"uppercase", letterSpacing:"0.06em" }}>Exit</button>
        </div>
      </header>

      {!inAppWarningDismissed && (
        <InAppBrowserWarning appName={inAppBrowser} onDismiss={() => setInAppWarningDismissed(true)} />
      )}

      <PitPassBanner member={currentUser} onDismiss={handleActivatePitPass} />
      <PaymentNotice notice={paymentNotice} onDismiss={() => setPaymentNotice(null)} />
      {apiError && <PaymentNotice notice={{ type: "error", message: "Can't reach the server right now. Showing sample roads until it's back." }} onDismiss={() => setApiError(false)} />}

      <ActiveTripBanner
        activeTrip={activeTrip}
        vehicleName={(() => {
          const v = currentUser.garage?.find(v => v.id === activeTrip?.vehicleId);
          return v ? `${v.make || ""} ${v.model || ""}`.trim() || "Vehicle" : "Vehicle";
        })()}
        onStop={handleStopTrip}
        onDiscard={discardTrail}
        onLiveLog={() => setShowLiveLog(true)}
      />
      <RoadDraftBanner
        draft={roadDraft}
        onResume={() => {
          setRoadPrefill({ ...roadDraft.form, _ratings: roadDraft._ratings });
          setShowAddRoad(true);
          setRoadDraft(null); // banner's done its job — localStorage draft stays until submit/cancel inside the modal
        }}
        onDiscard={() => { setStoredRoadDraft(currentUser.id, null); setRoadDraft(null); }}
      />
      {showLiveLog && activeTrip && (
        <LiveTripView
          activeTrip={activeTrip}
          entry={logbook.find(e => e.id === activeTrip.entryId)}
          vehicle={currentUser.garage?.find(v => v.id === activeTrip.vehicleId)}
          member={currentUser}
          onClose={() => setShowLiveLog(false)}
        />
      )}
      <TripSavedNotice
        notice={tripSavedNotice}
        onDismiss={() => {
          if (tripSavedTimerRef.current) { clearTimeout(tripSavedTimerRef.current); tripSavedTimerRef.current = null; }
          setTripSavedNotice(null);
        }}
      />

      {screen === "roads" && !showRoadDetail && (
        <MapView roads={roads} selected={selected} onSelect={r => { setSelected(r); setShowRoadDetail(true); }} trips={trips} currentUser={currentUser} />
      )}

      {screen === "roads" && !showRoadDetail && (
        <div style={{ padding:"10px 16px", borderBottom:`1px solid ${C.border}`, display:"flex", gap:8, alignItems:"center", flexShrink:0, flexWrap:"wrap" }}>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search roads..." style={{ flex:1, minWidth:120, background:"#111", border:`1px solid ${C.border}`, borderRadius:6, padding:"6px 11px", color:C.bone, fontSize:12, outline:"none" }} />
          {states.map(s => (
            <button key={s} onClick={()=>setFilterState(s)} style={{ padding:"5px 10px", borderRadius:6, border:"1px solid", borderColor:filterState===s?C.champagne:C.border2, background:filterState===s?C.champagneDim:"none", color:filterState===s?C.champagne:C.dim, fontSize:10, cursor:"pointer", textTransform:"uppercase", letterSpacing:"0.08em" }}>{s}</button>
          ))}
          {/* Session 18 correction: Add Roads stays free for everyone — see
              the PRO_PLANS comment above. add_road is the biggest points
              payout specifically so free users have a real path to
              earning Pro (that redemption isn't built yet — see handoff). */}
          <Btn size="sm" onClick={() => setShowAddRoad(true)}>+ Add</Btn>
        </div>
      )}

      <div style={{ flex:1, overflow:"hidden", display:"flex", position:"relative" }}>

        {screen === "roads" && !showRoadDetail && (
          <div style={{ flex:1, overflowY:"auto" }}>
            {filteredRoads.length === 0 && (
              <div style={{ padding:40, textAlign:"center", color:C.dim }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🛣</div>
                <div>No roads match your search</div>
              </div>
            )}
            {filteredRoads.map(r => (
              <div key={r.id} onClick={() => { setSelected(r); setShowRoadDetail(true); }}
                style={{ padding:"14px 16px", borderBottom:`1px solid #151515`, cursor:"pointer", display:"flex", gap:12, alignItems:"flex-start" }}>
                <div style={{ flexShrink:0, marginTop:3 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background: r.alerts?.length ? C.red : r.featured ? C.champagne : C.dim }} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:15, fontFamily:"'Cormorant Garamond', serif", fontWeight:600, color:C.bone, lineHeight:1.2, marginBottom:2 }}>{r.name}</div>
                      <div style={{ fontSize:10, color:C.dim, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>{r.region} · {roadPlace(r)}</div>
                    </div>
                    {r.alerts?.length > 0 && <span style={{ color:C.red, fontSize:14, flexShrink:0 }}>⚠</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {hasRatings(r) && <StarRating value={avgRating(r)} size={12} />}
                      <span style={{ fontSize:11, color:C.dim }}>{hasRatings(r) ? `${avgRating(r).toFixed(1)} · ${r.reviews} reviews` : "Not yet rated"}</span>
                    </div>
                    <span style={{ fontSize:11, color:"#444" }}>{r.distance}</span>
                  </div>
                  <div style={{ display:"flex", gap:4, marginTop:7, flexWrap:"wrap" }}>
                    {r.tags.slice(0,3).map(t => <span key={t} style={{ fontSize:9, padding:"2px 8px", background:"#1a1a1a", borderRadius:20, color:C.dim, textTransform:"uppercase", letterSpacing:"0.06em", border:`1px solid ${C.border}` }}>{t}</span>)}
                  </div>
                </div>
                <div style={{ flexShrink:0, color:C.dim, fontSize:16, alignSelf:"center" }}>›</div>
              </div>
            ))}
          </div>
        )}

        {screen === "roads" && showRoadDetail && selected && (
          <div style={{ position:"absolute", inset:0, background:C.midnight, overflowY:"auto", zIndex:20, display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", borderBottom:`1px solid ${C.border}`, flexShrink:0, background:C.midnight, position:"sticky", top:0, zIndex:10 }}>
              <button onClick={() => setShowRoadDetail(false)}
                style={{ display:"flex", alignItems:"center", gap:6, background:"none", border:"none", cursor:"pointer", color:C.champagne, fontFamily:"'Josefin Sans', sans-serif", fontSize:12, textTransform:"uppercase", letterSpacing:"0.08em", padding:"4px 0" }}>
                <span style={{ fontSize:20, lineHeight:1 }}>‹</span> Roads
              </button>
              <div style={{ flex:1 }} />
              {selected.verified && <Badge color={C.blue}>✓ Verified</Badge>}
              {selected.alerts?.length > 0 && <span style={{ color:C.red, fontSize:14 }}>⚠</span>}
            </div>
            <RoadDetail road={selected} onClose={() => setShowRoadDetail(false)} currentUser={currentUser} onOpenProfile={setViewingMemberId} />
          </div>
        )}

        {screen === "garage" && (
          <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
            <GarageView member={currentUser} onUpdate={updateCurrentUser} onRefresh={refreshGarage} onRefreshPoints={refreshPoints} onSelectVehicle={v => setSelectedVehicle(v)} onUpgradeNeeded={() => setShowUpgrade(true)} />
            {selectedVehicle && (
              <VehicleDetail
                vehicle={currentUser.garage.find(v => v.id === selectedVehicle.id) || selectedVehicle}
                member={currentUser}
                onUpdate={updateCurrentUser}
                onRefreshPoints={refreshPoints}
                onRefresh={refreshGarage}
                onBack={() => setSelectedVehicle(null)}
              />
            )}
          </div>
        )}

        {screen === "trips" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <TripPlanner roads={roads} trips={trips} setTrips={setTrips} currentUser={currentUser} onRefreshPoints={refreshPoints} />
          </div>
        )}

        {screen === "logbook" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            {isMemberPro(currentUser) ? (
              <LogbookView member={currentUser} logbook={logbook} onLogEntry={handleLogTrip} onAddReturnOdometer={handleAddReturnOdometer} onRefreshPoints={refreshPoints} onProposeRoad={prefill => { setRoadPrefill(prefill); setShowAddRoad(true); }} />
            ) : (
              <ProUpsell
                feature="Logbook"
                description="Compliant trip logging, GPS trails, and shareable Trip Postcards — all part of Pro."
                onUpgrade={() => setShowUpgrade(true)}
              />
            )}
          </div>
        )}

        {screen === "profile" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <ProfileView member={currentUser} onUpdate={updateCurrentUser} pointsLog={pointsLog} onUpgrade={() => setShowUpgrade(true)} onRedeemPoints={handleRedeemPoints} />
          </div>
        )}
      </div>

      <nav style={{ background:C.midnight, borderTop:`1px solid ${C.border}`, display:"flex", flexShrink:0, paddingBottom:"env(safe-area-inset-bottom)" }}>
        {[
          { id:"roads", icon:"🛣", label:"Roads" },
          { id:"trips", icon:"🏁", label:"Trips" },
          { id:"garage", icon:"🚗", label:"Garage" },
          { id:"logbook", icon:"📋", label:"Logbook" },
          { id:"profile", icon:"👤", label:"Profile" },
        ].map(({ id, icon, label }) => (
          <button key={id} onClick={() => setScreen(id)} style={{ flex:1, padding:"10px 0 8px", background:"none", border:"none", cursor:"pointer", color:screen===id?C.champagne:C.dim, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
            <span style={{ fontSize:20 }}>{icon}</span>
            <span style={{ fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", fontFamily:"'Josefin Sans', sans-serif" }}>{label}</span>
            {screen===id && <div style={{ width:20, height:2, background:C.champagne, borderRadius:1 }} />}
          </button>
        ))}
      </nav>

      {showAddRoad && (
        <AddRoadModal
          onClose={() => { setShowAddRoad(false); setRoadPrefill(null); }}
          currentUser={currentUser}
          initialValues={roadPrefill}
          onAdd={async r => {
            // Session 18: this used to fall back to adding the road to
            // LOCAL state on any failure, including a rejected API call —
            // which meant a real error (or, now, the new Pro-gate on
            // POST /roads) still looked like a successful save until the
            // next refresh quietly dropped it. authedFetch only throws on
            // 401/403; every other failure (like the 402 "Pro feature"
            // response) resolves normally with an {error} body, so that
            // has to be checked explicitly rather than relying on catch.
            try {
              const res = await api.postRoad(r);
              if (res?.error) {
                alert(res.error);
                return; // draft autosave already covers the form — nothing lost
              }
              const saved = res.road || r;
              setRoads(prev => [...prev, saved]);
              setSelected(saved);
              setShowRoadDetail(true);
              await refreshPoints();
            } catch (e) {
              if (e?.authFailed) { handleSignOut(); return; }
              alert(`Couldn't add the road: ${e.message}`);
            }
          }}
        />
      )}

      {showUpgrade && <UpgradeModal onClose={() => setShowUpgrade(false)} />}

      {viewingMemberId && (
        <MemberProfile
          memberId={viewingMemberId}
          currentUser={currentUser}
          roads={roads}
          onClose={() => setViewingMemberId(null)}
        />
      )}
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
