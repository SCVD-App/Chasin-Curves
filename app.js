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
  addReturnOdometer: (id, entryId, odometerEnd, endCoord) => authedFetch(`${API}/logbook/${id}/${entryId}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ odometerEnd, ...(endCoord ? { endCoord } : {}) }) }),
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
const avgRating = r => {
  const vals = Object.values(r.ratings);
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
const buildBaseMapUrl = (bbox, width = CARD_W, height = CARD_H) => {
  const bboxStr = `[${bbox.minLng},${bbox.minLat},${bbox.maxLng},${bbox.maxLat}]`;
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${bboxStr}/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;
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

// Generic cross-origin image loader for canvas use — crossOrigin is
// required so a successfully-drawn image doesn't taint the canvas and
// break canvas.toBlob() later. `label` is purely diagnostic: a failed
// load degrades the card gracefully either way (this just resolves null,
// callers skip that layer), but a silent, permanent "why doesn't the
// photo ever show up" is worse than a console warning that says exactly
// which layer didn't load and why (almost always a CORS failure on the
// image host, not a bug in this code) — check devtools console after a
// share if a layer seems to be missing.
// Session 16j — Scott can't get to devtools on his phone, so a failed
// labelled image load (currently just the vehicle hero photo) now also
// runs a quick two-probe diagnostic and surfaces it as a plain alert()
// right on-device, in addition to the existing console.warn. A no-cors
// fetch tells us if the resource is reachable at all (network/DNS); a
// cors fetch on the same URL tells us whether the host is actually
// sending Access-Control-Allow-Origin. Fire-and-forget — never blocks
// or delays the graceful null-resolve below, which still happens
// immediately so the card renders without the photo layer either way.
const diagnoseImageLoadFailure = async (url) => {
  let reachable = false;
  try {
    await fetch(url, { mode: "no-cors", cache: "no-store" });
    reachable = true;
  } catch { /* genuinely unreachable: DNS, network, or the URL itself is bad */ }

  if (!reachable) return `unreachable (network/DNS issue, or the URL itself is bad)\n${url}`;

  try {
    await fetch(url, { mode: "cors", cache: "no-store" });
    return `reachable AND passed a CORS check just now — looks like a transient or caching issue, not a CORS policy problem\n${url}`;
  } catch {
    return `reachable, but blocked by CORS — the host isn't sending Access-Control-Allow-Origin\n${url}`;
  }
};

const loadImageEl = (url, label) => new Promise((resolve) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => {
    if (label) {
      console.warn(`[Chasin' Curves] ${label} failed to load for the trip card — check that its host sends CORS headers (Access-Control-Allow-Origin) for cross-origin image loads. Falling back gracefully.`, url);
      diagnoseImageLoadFailure(url).then(reason => {
        alert(`Trip Postcard: ${label} didn't load.\n${reason}`);
      });
    }
    resolve(null);
  };
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
const drawTripCard = async ({ distanceKm, dateLabel, vehicleLabel, legCount, trail, heroUrl }) => {
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
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]