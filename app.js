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

const { useState, useEffect, useRef, useCallback } = React;

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
  postRoad: (road) => fetch(`${API}/roads`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(road) }).then(r => r.json()),
  updateRoad: (id, updates) => fetch(`${API}/roads/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }).then(r => r.json()),

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
  addReturnOdometer: (id, entryId, odometerEnd) => authedFetch(`${API}/logbook/${id}/${entryId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ odometerEnd }) }),
  saveTrail: (id, entryId, trail) => authedFetch(`${API}/logbook/${id}/${entryId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ trail }) }),

  getTrips: () => fetch(`${API}/trips`).then(r => r.json()),
  postTrip: (trip) => fetch(`${API}/trips`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(trip) }).then(r => r.json()),
  updateTrip: (id, updates) => fetch(`${API}/trips/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }).then(r => r.json()),
  postReview: (review) => fetch(`${API}/reviews`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(review) }).then(r => r.json()),
  postAlert: (alert) => fetch(`${API}/alerts`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(alert) }).then(r => r.json()),
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
const pollGpsPoint = () => new Promise(resolve => {
  if (!navigator.geolocation) { resolve(null); return; }
  navigator.geolocation.getCurrentPosition(
    pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() }),
    () => resolve(null),
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
const avgRating = r => {
  const vals = Object.values(r.ratings);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
};

const getTier = pts => TIERS.find(t => pts >= t.min && pts <= t.max) || TIERS[0];

const fmtDate = d => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

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

const MapView = ({ roads, selected, onSelect, trips, currentUser }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const roadMarkersRef = useRef([]);
  const tripMarkersRef = useRef([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);

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

      <div style={{ position: "absolute", top: 10, left: 14, fontSize: 9, color: "#666", textTransform: "uppercase", letterSpacing: "0.16em", pointerEvents: "none" }}>Eastern Australia</div>

      <div style={{ position: "absolute", bottom: 8, right: 14, display: "flex", gap: 10, pointerEvents: "none" }}>
        {[["QLD",C.champagne],["NSW",C.blue],["TAS","#888"],["VIC","#666"]].map(([s,c]) => (
          <span key={s} style={{ fontSize: 9, color: c, letterSpacing: "0.12em", textTransform: "uppercase" }}>{s}</span>
        ))}
      </div>
    </div>
  );
};

// ─── ROAD DETAIL ─────────────────────────────────────────────
const RoadDetail = ({ road, onClose, currentUser, onPointsEarned, onOpenProfile }) => {
  const [tab, setTab] = useState("overview");
  const tabs = [["overview","Overview"],["ratings","Ratings"],["logistics","Logistics"],["alerts",`Alerts${road.alerts.length ? ` (${road.alerts.length})` : ""}`]];

  const handleReview = () => {
    onPointsEarned("write_review");
    alert("Review submitted! +30 points");
  };

  return (
    <div>
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
              {road.featured && <Badge color={C.champagne}>Featured</Badge>}
              {road.verified && <Badge color={C.blue}>✓ Verified</Badge>}
              <Badge color={C.dim}>{road.state}</Badge>
            </div>
            <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, fontWeight: 700, color: C.bone, lineHeight: 1.1 }}>{road.name}</h3>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 3, textTransform: "uppercase", letterSpacing: "0.1em" }}>{road.region}</div>
            {road.addedBy && <div style={{ marginTop: 5 }}><AddedByLink memberId={road.addedBy} onOpen={onOpenProfile} /></div>}
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontFamily: "'Cormorant Garamond', serif", color: C.champagne, fontWeight: 600 }}>{avgRating(road).toFixed(1)}</div>
            <StarRating value={avgRating(road)} />
            <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{road.reviews} reviews</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 12 }}>
          {[["Distance", road.distance],["Drive Time", road.duration],["Thrill", road.ratings.thrill.toFixed(1) + " ★"]].map(([k,v]) => (
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
                <RatingBar key={k} label={l} value={road.ratings[k]} />
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
              <Btn variant="danger" size="sm" onClick={() => { onPointsEarned("report_alert"); alert("Alert reported! +25 points"); }}>Report an Issue</Btn>
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
const GarageView = ({ member, onUpdate, onPointsEarned, onRefresh, onSelectVehicle }) => {
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
    await onUpdate({ ...member, garage: [...member.garage, v] });
    onPointsEarned("add_vehicle");
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
      const res = await fetch(`${API}/garage/${member.id}/photo`, { method: "PUT", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      onPointsEarned("upload_photo");
      if (onRefresh) await onRefresh();
    } catch (err) {
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
        <Btn size="sm" onClick={() => setShowAdd(true)} disabled={saving}>{saving ? "Saving..." : "+ Add Vehicle"}</Btn>
      </div>

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
const VehicleDetail = ({ vehicle, member, onUpdate, onPointsEarned, onBack, onRefresh }) => {
  const [tab, setTab] = useState("gallery");
  const [fullscreen, setFullscreen] = useState(null);
  const [saving, setSaving] = useState(false);
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
        const res = await fetch(`${API}/garage/${member.id}/photo`, {
          method: "PUT",
          body: formData,
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || `Upload failed (${res.status})`);
        }
        onPointsEarned("upload_photo");
      }
      await onRefresh();
    } catch (err) {
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
        <div style={{ position: "absolute", bottom: 18, left: 20, right: 20 }}>
          <div style={{ fontFamily: "Cormorant Garamond, serif", fontSize: 26, fontWeight: 700, color: "#fff", lineHeight: 1.1, textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
            {vehicle.year} {vehicle.make} {vehicle.model}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>{vehicle.variant} · {vehicle.colour}</div>
          {vehicle.primary && <span style={{ fontSize: 10, color: C.champagne, textTransform: "uppercase", letterSpacing: "0.1em" }}>★ Primary Ride</span>}
        </div>
      </div>

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
                  <img src={photo.url} alt="" onClick={() => setFullscreen(photos.indexOf(photo))} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "pointer" }} />
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
      await onSubmit(vehicle.id, reading, trackGps);
      onClose();
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

const buildStaticMapUrl = (points, width = 864, height = 1080) => {
  const encoded = encodePolyline(downsampleForMap(points));
  const overlay = `path-4+C9A84C-0.9(${encodeURIComponent(encoded)})`;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay}/auto/${width}x${height}@2x?padding=50&access_token=${MAPBOX_TOKEN}`;
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

const loadMapImage = (url) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = url;
});

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

// Groups the Logbook's flat entry list into one row per calendar day,
// most recent first — a family updating a group chat shares by day, not
// by individual logged leg, and a day may have several legs (fuel stop,
// lunch stop, campground) that should roll into one distance and route.
const groupEntriesByDay = (entries) => {
  const groups = new Map();
  for (const e of entries) {
    const key = new Date(e.timestamp).toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  return Array.from(groups.entries())
    .map(([key, dayEntries]) => {
      const completed = dayEntries.filter(e => e.odometerEnd != null);
      const distanceKm = completed.reduce((sum, e) => sum + (e.odometerEnd - e.odometerStart), 0);
      const trail = dayEntries
        .slice().sort((a, b) => a.timestamp - b.timestamp)
        .flatMap(e => e.trail || []);
      const vehicleIds = Array.from(new Set(dayEntries.map(e => e.vehicleId)));
      return { key, date: new Date(dayEntries[0].timestamp), entries: dayEntries, completed, distanceKm, trail, vehicleIds };
    })
    .sort((a, b) => b.date - a.date);
};

// Renders the actual card and resolves a PNG Blob (null only if the
// canvas itself is unavailable) — a failed map fetch or geocode just
// means a plainer, still-branded card, never a thrown error.
const drawTripCard = async ({ distanceKm, dateLabel, vehicleLabel, legCount, trail }) => {
  await ensureFontsLoaded();
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const cx = 540;

  ctx.fillStyle = C.midnight;
  ctx.fillRect(0, 0, 1080, 1350);

  let startPlace = null, endPlace = null;
  const hasTrail = trail && trail.length >= 2;
  let mapDrawn = false;

  if (hasTrail) {
    const mapUrl = buildStaticMapUrl(trail);
    const [mapImg, sp, ep] = await Promise.all([
      loadMapImage(mapUrl),
      reverseGeocodePlace(trail[0].lat, trail[0].lng),
      reverseGeocodePlace(trail[trail.length - 1].lat, trail[trail.length - 1].lng),
    ]);
    startPlace = sp; endPlace = ep;
    if (mapImg) {
      // Full-bleed map, same "photo wallpaper + caption" treatment as the
      // Garage vehicle header: the image fills the whole card, a top-to-
      // bottom gradient dips lighter through the middle so the route stays
      // visible, then darkens hard toward the bottom so the stats read as
      // a caption sitting on the photo rather than a separate panel below it.
      ctx.drawImage(mapImg, 0, 0, 1080, 1350);
      const grad = ctx.createLinearGradient(0, 0, 0, 1350);
      grad.addColorStop(0, "rgba(0,0,0,0.45)");
      grad.addColorStop(0.38, "rgba(0,0,0,0.12)");
      grad.addColorStop(0.68, "rgba(13,13,13,0.55)");
      grad.addColorStop(1, "rgba(13,13,13,0.97)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 1080, 1350);
      mapDrawn = true;
    } else {
      drawRoadLines(ctx, cx, 330);
    }
  } else {
    drawRoadLines(ctx, cx, 330);
  }

  // Same soft drop-shadow the app gives text captioned on a photo
  // (VehicleDetail's hero header) — keeps it legible over whatever the
  // map happens to look like underneath, without needing a harder gradient
  // that would hide the route entirely.
  const shadowText = (text, x, y) => {
    ctx.shadowColor = "rgba(0,0,0,0.8)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.fillText(text, x, y);
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  };

  ctx.textAlign = "center";

  // Wordmark — pinned near the top, sitting directly on the photo when
  // there is one, the same way the app's own header sits over the map.
  const wordmarkY = mapDrawn ? 90 : 470;
  ctx.fillStyle = C.champagne;
  ctx.font = "700 54px 'Cormorant Garamond'";
  shadowText("Chasin’ Curves", cx, wordmarkY);
  ctx.fillStyle = mapDrawn ? "rgba(245,243,238,0.75)" : C.dim;
  ctx.font = "600 16px 'Josefin Sans'";
  shadowText("R O A D S ,   R I V E R S   &   R I F F S", cx, wordmarkY + 30);

  // Stats — pinned toward the bottom, inside the heavily-darkened zone,
  // the same way a vehicle's name sits captioned on its hero photo.
  const midY = mapDrawn ? 1010 : 680;
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

// Read-only trail preview — a polyline + start/end pins on the existing
// Mapbox instance, so a recorded trip's data is actually visible rather
// than just a point count. Deliberately not the drag-to-select Road
// extraction UI from snail-trail-road-extraction.md — that's a separate,
// later build; this is only phase 2, capture + confirm-it-worked.
const TrailViewerModal = ({ entry, vehicleName, onClose }) => {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const [mapFailed, setMapFailed] = useState(false);
  const points = entry.trail || [];

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
            {points.length === 0 ? "No points recorded for this trip." : "Map unavailable."}
          </div>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
};

// Lists every day that has at least one completed (odometer-closed) trip,
// most recent first, and builds/shares the card for whichever one is
// picked — a day is only "shareable" once at least one leg has a return
// odometer, since that's what the headline distance is built from.
const ShareDayModal = ({ logbook, garage, onClose }) => {
  const [busy, setBusy] = useState(null); // day.key currently being built
  const [preview, setPreview] = useState(null); // { url } — fallback when Web Share can't take files

  const vehicleName = id => {
    const v = garage.find(veh => veh.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown vehicle";
  };

  const days = groupEntriesByDay(logbook || []).filter(d => d.completed.length > 0);

  const handleShare = async (day) => {
    setBusy(day.key);
    setPreview(null);
    try {
      const vehicleLabel = day.vehicleIds.length === 1 ? vehicleName(day.vehicleIds[0]) : "Multiple vehicles";
      const dateLabel = day.date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
      const blob = await drawTripCard({ distanceKm: day.distanceKm, dateLabel, vehicleLabel, legCount: day.entries.length, trail: day.trail });
      if (!blob) throw new Error("card render unavailable");

      const file = new File([blob], "chasin-curves-trip.png", { type: "image/png" });
      const shareText = `${dateLabel} — ${Math.round(day.distanceKm)}km via Chasin' Curves 🏁`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Chasin' Curves", text: shareText });
      } else {
        // Desktop browsers and a few mobile ones support navigator.share
        // for text but not files (or neither) — either way, show the card
        // and let a manual download cover getting it into the chat.
        setPreview({ url: URL.createObjectURL(blob) });
      }
    } catch (e) {
      if (e?.name !== "AbortError") alert("Couldn't build the share card — check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = () => {
    if (!preview) return;
    const a = document.createElement("a");
    a.href = preview.url; a.download = "chasin-curves-trip.png";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  return (
    <Modal title="Share a Day" subtitle="Turns a day's logged trips into one shareable card" onClose={onClose}>
      {days.length === 0 && (
        <div style={{ textAlign: "center", padding: 30, color: C.dim, fontSize: 12 }}>
          No completed trips yet — add a return odometer reading to a logged trip before it can be shared.
        </div>
      )}
      {days.map(day => (
        <div key={day.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.border}`, gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: C.bone }}>{day.date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
            <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>
              {Math.round(day.distanceKm)}km · {day.entries.length} leg{day.entries.length !== 1 ? "s" : ""}{day.trail.length > 0 ? ` · ${day.trail.length} GPS pts` : ""}
            </div>
          </div>
          <Btn size="sm" onClick={() => handleShare(day)} disabled={busy === day.key}>{busy === day.key ? "Building…" : "Share"}</Btn>
        </div>
      ))}
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
const ActiveTripBanner = ({ activeTrip, vehicleName, onStop, onDiscard }) => {
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
      {activeTrip.stopped && <Btn size="sm" variant="ghost" onClick={onDiscard}>Discard</Btn>}
      <Btn size="sm" onClick={onStop}>{activeTrip.stopped ? "Retry Save" : "Stop Trip"}</Btn>
    </div>
  );
};

const LogbookView = ({ member, logbook, onLogEntry, onAddReturnOdometer, onPointsEarned }) => {
  const [showLog, setShowLog] = useState(false);
  const [viewingTrail, setViewingTrail] = useState(null);
  const [sharingDay, setSharingDay] = useState(false);
  const garage = member.garage || [];
  const sorted = [...(logbook || [])].sort((a, b) => b.timestamp - a.timestamp);

  const vehicleName = id => {
    const v = garage.find(veh => veh.id === id);
    return v ? `${v.year} ${v.make} ${v.model}` : "Unknown vehicle";
  };

  const handleSubmit = async (vehicleId, odometerStart, trackGps) => {
    await onLogEntry(vehicleId, odometerStart, trackGps);
    onPointsEarned("log_trip");
  };

  const handleReturnOdo = (entry) => {
    const val = prompt("Return odometer reading?");
    if (val === null) return;
    const n = Number(val);
    if (val.trim() === "" || Number.isNaN(n) || n < entry.odometerStart) {
      alert("Enter a number no lower than the start reading.");
      return;
    }
    onAddReturnOdometer(entry.id, n);
  };

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: C.champagne }}>Logbook</div>
          <div style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>Same-day entries only — timestamp is captured automatically.</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Btn size="sm" variant="ghost" onClick={() => setSharingDay(true)} disabled={garage.length === 0}>📤 Share a Day</Btn>
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
        <TrailViewerModal entry={viewingTrail} vehicleName={vehicleName(viewingTrail.vehicleId)} onClose={() => setViewingTrail(null)} />
      )}

      {sharingDay && (
        <ShareDayModal logbook={logbook} garage={garage} onClose={() => setSharingDay(false)} />
      )}
    </div>
  );
};

// ─── TRIP PLANNER ─────────────────────────────────────────────
const TripPlanner = ({ roads, trips, setTrips, currentUser, onPointsEarned }) => {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", date: "", time: "", selectedRoads: [], vehicleId: "", notes: "" });

  const handleCreate = async () => {
    if (!form.title || form.selectedRoads.length === 0) return;
    const trip = {
      id: Date.now(), title: form.title, date: form.date, time: form.time,
      routes: form.selectedRoads, vehicleId: form.vehicleId, notes: form.notes,
      createdBy: currentUser.id, attendees: [{ memberId: currentUser.id, vehicleId: form.vehicleId }],
      createdAt: new Date().toISOString(),
    };
    try { const res = await api.postTrip(trip); setTrips(prev => [...prev, res.trip || trip]); } catch { setTrips(prev => [...prev, trip]); }
    onPointsEarned("plan_trip");
    setForm({ title: "", date: "", time: "", selectedRoads: [], vehicleId: "", notes: "" });
    setShowNew(false);
  };

  const toggleRoad = id => {
    setForm(f => ({
      ...f,
      selectedRoads: f.selectedRoads.includes(id) ? f.selectedRoads.filter(r => r !== id) : [...f.selectedRoads, id]
    }));
  };

  const joinTrip = async (tripId) => {
    setTrips(prev => prev.map(t => t.id === tripId
      ? { ...t, attendees: [...(t.attendees||[]), { memberId: currentUser.id, vehicleId: currentUser.garage[0]?.id }] }
      : t
    ));
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

        return (
          <div key={trip.id} style={{ background: "#0a0a0a", border: `1px solid ${C.border}`, borderRadius: 10, padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, fontWeight: 600, color: C.bone, marginBottom: 2 }}>{trip.title}</div>
                <div style={{ fontSize: 11, color: C.dim }}>{trip.date && `${fmtDate(trip.date)}`}{trip.time && ` · ${trip.time}`}</div>
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
            {!isJoined && trip.createdBy !== currentUser.id && (
              <Btn size="sm" variant="blue" onClick={() => joinTrip(trip.id)}>Join this Run</Btn>
            )}
            {isJoined && <Badge color={C.blue}>✓ You're in</Badge>}
          </div>
        );
      })}

      {showNew && (
        <Modal title="Plan a Run" subtitle="Share your route with the community · +20 pts" onClose={() => setShowNew(false)}>
          <Input label="Run Name *" value={form.title} onChange={v => setForm(f=>({...f,title:v}))} placeholder="Sunday morning hinterland loop" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Input label="Date" value={form.date} onChange={v => setForm(f=>({...f,date:v}))} type="date" />
            <Input label="Departure Time" value={form.time} onChange={v => setForm(f=>({...f,time:v}))} placeholder="07:30" />
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
          <Input label="Notes" value={form.notes} onChange={v => setForm(f=>({...f,notes:v}))} placeholder="Meeting point, pace notes, anything else..." multiline />
          <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => setShowNew(false)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn onClick={handleCreate} style={{ flex: 2 }}>Publish Run</Btn>
          </div>
        </Modal>
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

const ProfileView = ({ member, onUpdate, pointsLog }) => {
  const [tab, setTab] = useState("profile");
  const [editing, setEditing] = useState(false);
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
                ⏱ Points expire after <span style={{ color:C.champagne }}>90 days</span> — generous enough for an overseas trip.
              </div>
            </div>
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
const AddRoadModal = ({ onClose, onAdd, onPointsEarned, currentUser }) => {
  const [form, setForm] = useState({ name:"", region:"", state:"QLD", description:"", distance:"", duration:"", tags:"", startLat:"", startLng:"", endLat:"", endLng:"", busyTimes:"", fuel:"", food:"", meetups:"" });
  const [ratings, setRatings] = useState({ driveability:3, accessibility:3, views:3, surface:3, thrill:3 });
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleSubmit = () => {
    if (!form.name || !form.region) return;
    onAdd({
      id: Date.now(), ...form,
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
    onPointsEarned("add_road");
    onClose();
  };

  return (
    <Modal title="Add a Road" subtitle="Share a road worth chasing · +100 points" onClose={onClose} wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
        <div style={{ gridColumn: "1/-1" }}><Input label="Road Name *" value={form.name} onChange={v=>set("name",v)} placeholder="e.g. Kenilworth–Maleny Road" /></div>
        <Input label="Region *" value={form.region} onChange={v=>set("region",v)} placeholder="Sunshine Coast Hinterland" />
        <div>
          <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>State</div>
          <select value={form.state} onChange={e=>set("state",e.target.value)} style={{ width:"100%", background:"#0f0f0f", border:`1px solid ${C.border}`, borderRadius:6, padding:"8px 12px", color:C.bone, fontSize:13, marginBottom:14 }}>
            {["QLD","NSW","VIC","TAS","SA","WA","NT","ACT"].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
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
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} style={{ flex:2 }}>Submit Road</Btn>
      </div>
    </Modal>
  );
};

// ─── SCREENSHOT PROMPT ────────────────────────────────────────
// ─── LOGIN SCREEN ─────────────────────────────────────────────
// v3.0: No more ScreenshotPrompt/username-suggestions — email IS the
// recovery mechanism now, so there's nothing to lose and nothing to screenshot.
const LoginScreen = ({ onRequestCode, onVerifyCode, onResend, step, loading, error, inviterName }) => {
  // step: "email" | "code"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const cleanEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail);
  const cleanCode = code.replace(/\D/g, "").slice(0, 6);

  const submitEmail = () => { if (emailValid && !loading) onRequestCode(cleanEmail); };
  const submitCode = () => { if (cleanCode.length === 6 && !loading) onVerifyCode(cleanEmail, cleanCode); };

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:C.midnight, padding:32, gap:0 }}>
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
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showRoadDetail, setShowRoadDetail] = useState(false);
  const [viewingMemberId, setViewingMemberId] = useState(null);
  const [filterState, setFilterState] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginStep, setLoginStep] = useState("email"); // "email" | "code"
  const [loginError, setLoginError] = useState("");
  // Read once at mount — a shared invite link is only ever opened fresh,
  // never navigated to mid-session, so there's no need to watch for changes.
  const [inviterName] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("invite") || null; }
    catch { return null; }
  });

  // ── Sign out — clears session, forces back to login ────────
  // Stops any in-flight GPS polling too — otherwise a stale interval would
  // keep firing after sign-out and could even attach a trail to the next
  // person to log in on this device.
  const handleSignOut = useCallback(() => {
    if (gpsIntervalRef.current) { clearInterval(gpsIntervalRef.current); gpsIntervalRef.current = null; }
    if (wakeLockRef.current) { wakeLockRef.current.release().catch(() => {}); wakeLockRef.current = null; }
    setStoredActiveTrip(null);
    setActiveTrip(null);
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
    const stopped = { ...activeTrip, stopped: true };
    setActiveTrip(stopped);
    setStoredActiveTrip(stopped);
    try {
      await api.saveTrail(currentUser.id, activeTrip.entryId, activeTrip.points);
      setLogbook(prev => prev.map(e => e.id === activeTrip.entryId ? { ...e, trail: activeTrip.points } : e));
      setStoredActiveTrip(null);
      setActiveTrip(null);
    } catch (e) {
      if (e?.authFailed) handleSignOut();
      // Otherwise leave it stopped-but-unsaved in localStorage — the banner's
      // "Retry Save" button calls this same function again, and nothing is
      // lost in the meantime since the points are already on disk.
    }
  }, [currentUser, activeTrip, handleSignOut, releaseWakeLock]);

  const discardTrail = useCallback(() => {
    releaseWakeLock();
    setStoredActiveTrip(null);
    setActiveTrip(null);
  }, [releaseWakeLock]);

  // ── Logbook — log a trip / attach a return odometer reading ─
  const handleLogTrip = useCallback(async (vehicleId, odometerStart, trackGps) => {
    if (!currentUser) return;
    try {
      const res = await api.postLogEntry(currentUser.id, { vehicleId, odometerStart });
      if (res?.entry) {
        setLogbook(prev => [...prev, res.entry]);
        if (trackGps) startTrailRecording(res.entry, vehicleId);
      }
    } catch (e) {
      if (e?.authFailed) handleSignOut();
      else alert(`Couldn't log the trip: ${e.message}`);
    }
  }, [currentUser, handleSignOut, startTrailRecording]);

  const handleAddReturnOdometer = useCallback(async (entryId, odometerEnd) => {
    if (!currentUser) return;
    try {
      await api.addReturnOdometer(currentUser.id, entryId, odometerEnd);
      setLogbook(prev => prev.map(e => e.id === entryId ? { ...e, odometerEnd } : e));
    } catch (e) {
      if (e?.authFailed) handleSignOut();
      else alert(`Couldn't save the return odometer: ${e.message}`);
    }
  }, [currentUser, handleSignOut]);

  const states = ["All", ...Array.from(new Set(roads.map(r => r.state)))];
  const filteredRoads = roads
    .filter(r => filterState === "All" || r.state === filterState)
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
    return <LoginScreen
      onRequestCode={handleRequestCode}
      onVerifyCode={handleVerifyCode}
      onResend={handleResendCode}
      step={loginStep}
      loading={loginLoading}
      error={loginError}
      inviterName={inviterName}
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

      <PitPassBanner member={currentUser} onDismiss={() => {
        const activated = new Date().toISOString();
        updateCurrentUser({ ...currentUser, pitPassActivated: activated });
      }} />

      <ActiveTripBanner
        activeTrip={activeTrip}
        vehicleName={(() => {
          const v = currentUser.garage?.find(v => v.id === activeTrip?.vehicleId);
          return v ? `${v.make || ""} ${v.model || ""}`.trim() || "Vehicle" : "Vehicle";
        })()}
        onStop={handleStopTrip}
        onDiscard={discardTrail}
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
                      <div style={{ fontSize:10, color:C.dim, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>{r.region} · {r.state}</div>
                    </div>
                    {r.alerts?.length > 0 && <span style={{ color:C.red, fontSize:14, flexShrink:0 }}>⚠</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <StarRating value={avgRating(r)} size={12} />
                      <span style={{ fontSize:11, color:C.dim }}>{avgRating(r).toFixed(1)} · {r.reviews} reviews</span>
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
            <RoadDetail road={selected} onClose={() => setShowRoadDetail(false)} currentUser={currentUser} onPointsEarned={earnPoints} onOpenProfile={setViewingMemberId} />
          </div>
        )}

        {screen === "garage" && (
          <div style={{ flex:1, overflowY:"auto", position:"relative" }}>
            <GarageView member={currentUser} onUpdate={updateCurrentUser} onPointsEarned={earnPoints} onRefresh={refreshGarage} onSelectVehicle={v => setSelectedVehicle(v)} />
            {selectedVehicle && (
              <VehicleDetail
                vehicle={currentUser.garage.find(v => v.id === selectedVehicle.id) || selectedVehicle}
                member={currentUser}
                onUpdate={updateCurrentUser}
                onPointsEarned={earnPoints}
                onRefresh={refreshGarage}
                onBack={() => setSelectedVehicle(null)}
              />
            )}
          </div>
        )}

        {screen === "trips" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <TripPlanner roads={roads} trips={trips} setTrips={setTrips} currentUser={currentUser} onPointsEarned={earnPoints} />
          </div>
        )}

        {screen === "logbook" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <LogbookView member={currentUser} logbook={logbook} onLogEntry={handleLogTrip} onAddReturnOdometer={handleAddReturnOdometer} onPointsEarned={earnPoints} />
          </div>
        )}

        {screen === "profile" && (
          <div style={{ flex:1, overflowY:"auto" }}>
            <ProfileView member={currentUser} onUpdate={updateCurrentUser} pointsLog={pointsLog} />
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
          onClose={() => setShowAddRoad(false)}
          currentUser={currentUser}
          onAdd={async r => {
            try {
              const res = await api.postRoad(r);
              const saved = res.road || r;
              setRoads(prev => [...prev, saved]);
              setSelected(saved);
              setShowRoadDetail(true);
            } catch {
              setRoads(prev => [...prev, r]);
              setSelected(r);
              setShowRoadDetail(true);
            }
          }}
          onPointsEarned={earnPoints}
        />
      )}

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
