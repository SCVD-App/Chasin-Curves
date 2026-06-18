// ============================================================
// CHASIN' CURVES — app.js
// Scott Claude Van Dam — v2.2 — Login flow
// Fix 1: saveGarage sends raw array (not {garage:[]} wrapper)
// Fix 2: heroPhoto stored/compared as photoId string everywhere
// Fix 3: points loaded from KV only — seed member removed from init path
// v2.2: Username login screen — Option A (join or sign in, one flow)
//       Username persisted to localStorage so returning users skip login
//       No hardcoded scott_cc in init path
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

const api = {
  getRoads: () => fetch(`${API}/roads`).then(r => r.json()),
  postRoad: (road) => fetch(`${API}/roads`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(road) }).then(r => r.json()),
  updateRoad: (id, updates) => fetch(`${API}/roads/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }).then(r => r.json()),
  getMember: (id) => fetch(`${API}/member/${id}`).then(r => r.json()),
  postMember: (member) => fetch(`${API}/member`, { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(member) }).then(r => r.json()),
  updateMember: (id, updates) => fetch(`${API}/member/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(updates) }).then(r => r.json()),
  // FIX 1: send raw array, not {garage:[...]} wrapper
  getGarage: (id) => fetch(`${API}/garage/${id}`).then(r => r.json()),
  saveGarage: (id, garage) => fetch(`${API}/garage/${id}`, { method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(garage) }).then(r => r.json()),
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
};

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
const MapView = ({ roads, selected, onSelect, trips, currentUser }) => {
  const toX = lng => Math.max(3, Math.min(95, ((lng - 136) / 20) * 100));
  const toY = lat => Math.max(3, Math.min(95, ((lat + 45) / 25) * 100));

  return (
    <div style={{ position: "relative", height: 220, background: "#0a0f14", borderBottom: `1px solid ${C.border}`, overflow: "hidden" }}>
      <svg style={{ position: "absolute", inset: 0, opacity: 0.05 }} viewBox="0 0 800 220" preserveAspectRatio="none">
        <path d="M0,110 Q100,60 200,100 Q300,140 400,80 Q500,30 600,90 Q700,140 800,70" stroke={C.champagne} strokeWidth="1" fill="none"/>
        <path d="M0,130 Q150,70 300,120 Q450,170 600,100 Q700,60 800,110" stroke={C.champagne} strokeWidth="1" fill="none"/>
        <path d="M0,150 Q200,90 350,140 Q500,190 650,120 Q750,80 800,130" stroke={C.champagne} strokeWidth="0.8" fill="none"/>
        <path d="M0,80 Q180,30 360,70 Q540,110 720,50 Q780,30 800,60" stroke={C.blue} strokeWidth="0.7" fill="none" opacity="0.7"/>
      </svg>
      {[...Array(10)].map((_,i) => <div key={i} style={{ position:"absolute", left:`${(i+1)*9}%`, top:0, bottom:0, borderLeft:`1px solid #ffffff06` }}/>)}
      {[...Array(6)].map((_,i) => <div key={i} style={{ position:"absolute", top:`${(i+1)*14}%`, left:0, right:0, borderTop:`1px solid #ffffff06` }}/>)}
      <div style={{ position: "absolute", top: 10, left: 14, fontSize: 9, color: "#333", textTransform: "uppercase", letterSpacing: "0.16em" }}>Eastern Australia</div>
      {roads.map(r => {
        const x = toX(r.startCoords.lng), y = toY(r.startCoords.lat);
        const isSelected = selected?.id === r.id;
        return (
          <div key={r.id} onClick={() => onSelect(r)} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, transform: "translate(-50%,-100%)", cursor: "pointer", zIndex: isSelected ? 10 : 5, transition: "all 0.2s" }}>
            <div style={{ width: isSelected ? 16 : 11, height: isSelected ? 16 : 11, background: r.alerts?.length ? C.red : isSelected ? C.champagne : `${C.champagne}77`, border: `2px solid ${isSelected ? "#fff" : C.champagne}`, borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", boxShadow: isSelected ? `0 0 12px ${C.champagne}88` : "none", transition: "all 0.2s" }} />
          </div>
        );
      })}
      {trips.map(t => t.routes.map(rid => {
        const road = roads.find(r => r.id === rid);
        if (!road) return null;
        const x = toX(road.startCoords.lng), y = toY(road.startCoords.lat);
        const member = SEED_MEMBERS.find(m => m.id === t.createdBy);
        const vehicle = member?.garage.find(v => v.id === t.vehicleId);
        return (
          <div key={`${t.id}-${rid}`} style={{ position: "absolute", left: `${x + 2}%`, top: `${y - 2}%`, transform: "translate(-50%,-50%)", zIndex: 8 }}>
            {vehicle && <VehicleAvatar vehicle={vehicle} size={24} />}
          </div>
        );
      }))}
      <div style={{ position: "absolute", bottom: 8, right: 14, display: "flex", gap: 10 }}>
        {[["QLD",C.champagne],["NSW",C.blue],["TAS","#888"],["VIC","#666"]].map(([s,c]) => (
          <span key={s} style={{ fontSize: 9, color: c, letterSpacing: "0.12em", textTransform: "uppercase" }}>{s}</span>
        ))}
      </div>
    </div>
  );
};

// ─── ROAD DETAIL ─────────────────────────────────────────────
const RoadDetail = ({ road, onClose, currentUser, onPointsEarned }) => {
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

// ─── GARAGE SECTION ──────────────────────────────────────────
const GarageView = ({ member, onUpdate, onPointsEarned, onRefresh, onSelectVehicle }) => {
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ make: "", model: "", year: "", variant: "", colour: "", notes: "" });
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
    setForm({ make: "", model: "", year: "", variant: "", colour: "", notes: "" });
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
const AddRoadModal = ({ onClose, onAdd, onPointsEarned }) => {
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
      addedBy: "scott_cc", addedDate: new Date().toISOString().slice(0,10),
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
const ScreenshotPrompt = ({ username, onContinue }) => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:C.midnight, padding:32 }}>
    <div style={{ width:"100%", maxWidth:340, textAlign:"center" }}>
      {/* Big tick */}
      <div style={{ width:72, height:72, borderRadius:"50%", background:`${C.champagne}22`, border:`2px solid ${C.champagne}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 24px", fontSize:32 }}>🎉</div>

      <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:26, color:C.champagne, marginBottom:8 }}>You're in the garage.</div>
      <div style={{ fontSize:13, color:C.dim, marginBottom:36, lineHeight:1.7 }}>Before you go any further — screenshot this screen. Your username is how you get back in. There's no password reset.</div>

      {/* Username display — big and clear */}
      <div style={{ background:"#0a0a0a", border:`2px solid ${C.champagne}`, borderRadius:12, padding:"20px 28px", marginBottom:36 }}>
        <div style={{ fontSize:11, color:C.dim, textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:8 }}>Your Username</div>
        <div style={{ fontFamily:"'Josefin Sans', sans-serif", fontSize:28, color:C.champagne, fontWeight:700, letterSpacing:"0.06em" }}>{username}</div>
        <div style={{ fontSize:11, color:C.dim, marginTop:8 }}>📸 Screenshot this screen now</div>
      </div>

      <button
        onClick={onContinue}
        style={{ width:"100%", padding:"14px 0", background:`linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})`, border:"none", borderRadius:8, color:C.midnight, fontFamily:"'Josefin Sans', sans-serif", fontSize:13, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", cursor:"pointer" }}>
        I've got it — Let's Go →
      </button>

      <div style={{ marginTop:16, fontSize:10, color:C.faint }}>You can also find your username in your profile settings anytime.</div>
    </div>
  </div>
);

// ─── LOGIN SCREEN ─────────────────────────────────────────────
// Generates username suggestions when a name is taken
const getSuggestions = (base) => {
  const suffixes = ["_cc", "_au", `_${new Date().getFullYear().toString().slice(2)}`, "_driver", "_garage"];
  const numbers = [Math.floor(Math.random() * 90 + 10), Math.floor(Math.random() * 900 + 100)];
  return [
    ...suffixes.slice(0, 3).map(s => `${base}${s}`),
    `${base}${numbers[0]}`,
    `${base}${numbers[1]}`,
  ].slice(0, 4);
};

const LoginScreen = ({ onLogin, loading, error, takenUsername }) => {
  const [username, setUsername] = useState("");
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
  const suggestions = takenUsername ? getSuggestions(takenUsername) : [];

  const handleSubmit = (name = clean) => {
    if (name.length < 3) return;
    onLogin(name);
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100dvh", background:C.midnight, padding:32, gap:0 }}>
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
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:20, color:C.champagne, marginBottom:6 }}>Enter the Garage</div>
        <div style={{ fontSize:12, color:C.dim, marginBottom:20, lineHeight:1.6 }}>New here? Pick a username and you're in. Been before? Just type yours and we'll find you.</div>

        <div style={{ marginBottom:8 }}>
          <div style={{ fontSize:11, color:C.muted, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:6 }}>Username</div>
          <input
            value={username}
            onChange={e => { setUsername(e.target.value); }}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="e.g. scotty_cc"
            autoFocus
            style={{ width:"100%", background:"#0a0a0a", border:`1px solid ${error ? C.red : C.border}`, borderRadius:8, padding:"11px 14px", color:C.bone, fontSize:15, fontFamily:"'Josefin Sans', sans-serif", outline:"none", boxSizing:"border-box", letterSpacing:"0.04em" }}
          />
          {clean && clean !== username.trim().toLowerCase() && (
            <div style={{ fontSize:10, color:C.dim, marginTop:5 }}>Will be saved as: <span style={{ color:C.champagne }}>{clean}</span></div>
          )}
        </div>

        <div style={{ fontSize:10, color:C.faint, marginBottom:16 }}>3–20 characters · letters, numbers, underscores only</div>

        {/* Username taken — show error + suggestions */}
        {error && (
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:12, color:C.red, marginBottom:12 }}>{error}</div>
            {suggestions.length > 0 && (
              <>
                <div style={{ fontSize:11, color:C.dim, marginBottom:8 }}>Try one of these:</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { setUsername(s); handleSubmit(s); }}
                      style={{ padding:"6px 12px", background:C.champagneDim, border:`1px solid ${C.champagne}44`, borderRadius:20, color:C.champagne, fontFamily:"'Josefin Sans', sans-serif", fontSize:11, cursor:"pointer", letterSpacing:"0.04em" }}>
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          onClick={() => handleSubmit()}
          disabled={clean.length < 3 || loading}
          style={{ width:"100%", padding:"13px 0", background: clean.length >= 3 && !loading ? `linear-gradient(135deg, ${C.champagne}, ${C.champagneLight})` : "#1a1a1a", border:"none", borderRadius:8, color: clean.length >= 3 && !loading ? C.midnight : C.dim, fontFamily:"'Josefin Sans', sans-serif", fontSize:13, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", cursor: clean.length >= 3 && !loading ? "pointer" : "not-allowed", transition:"all 0.2s" }}>
          {loading ? "Finding your garage..." : "Enter the Garage →"}
        </button>
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
  const [currentUser, setCurrentUser] = useState(null);
  const [selected, setSelected] = useState(null);
  const [screen, setScreen] = useState("roads");
  const [showAddRoad, setShowAddRoad] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showRoadDetail, setShowRoadDetail] = useState(false);
  const [filterState, setFilterState] = useState("All");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginTaken, setLoginTaken] = useState("");
  const [newUsername, setNewUsername] = useState("");

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

    // Check localStorage for returning user — skip login screen if found
    const savedUsername = localStorage.getItem("cc_username");
    if (savedUsername) {
      loadUser(savedUsername).then(() => init());
    } else {
      init();
    }
  }, []);

  // ── Load user from KV — returns true if new user created ───
  const loadUser = async (username) => {
    const profile = await api.getMember(username);
    const garage  = await api.getGarage(username);
    if (profile && !profile.error) {
      const resolvedGarage = Array.isArray(garage) ? garage : [];
      setCurrentUser({ ...profile, garage: resolvedGarage });
      return false; // returning user
    } else {
      const newMember = {
        id: username, username, displayName: username,
        location: "", bio: "", avatar: null,
        joinDate: new Date().toISOString().slice(0, 10),
        points: 0, tier: "Explorer", garage: [],
        roadsAdded: [], reviewsWritten: 0, tripsPlanned: 0,
      };
      await api.postMember(newMember);
      return true; // new user
    }
  };

  // ── Handle login form submit ────────────────────────────────
  const handleLogin = async (username) => {
    setLoginLoading(true);
    setLoginError("");
    setLoginTaken("");
    try {
      const isNew = await loadUser(username);
      localStorage.setItem("cc_username", username);
      if (isNew) {
        // Show screenshot prompt before entering app
        setNewUsername(username);
      }
      // If returning user, currentUser is now set — renders app directly
    } catch (err) {
      // 409 = username taken (shouldn't happen with Option A flow, but guard it)
      if (err?.status === 409) {
        setLoginTaken(username);
        setLoginError(`"${username}" is already taken — try one of these:`);
      } else {
        setLoginError("Couldn't reach the garage. Check your connection and try again.");
      }
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Sign out ────────────────────────────────────────────────
  const handleSignOut = () => {
    localStorage.removeItem("cc_username");
    setCurrentUser(null);
    setPointsLog([]);
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
    try { await api.updateMember(currentUser.id, { points: updated.points }); } catch {}
  }, [currentUser]);

  // ── Update user — saves member profile AND garage separately ─
  const updateCurrentUser = useCallback(async (updated) => {
    setCurrentUser(updated);
    try {
      // Strip garage from member record — garage has its own KV key
      const { garage, ...memberData } = updated;
      await api.updateMember(updated.id, memberData);
      await api.saveGarage(updated.id, garage || []);
    } catch {}
  }, []);

  // ── Re-fetch garage from KV and sync into state ────────────
  const refreshGarage = useCallback(async () => {
    if (!currentUser) return;
    try {
      const garage = await api.getGarage(currentUser.id);
      if (Array.isArray(garage)) {
        setCurrentUser(prev => ({ ...prev, garage }));
      }
    } catch {}
  }, [currentUser?.id]);

  const states = ["All", ...Array.from(new Set(roads.map(r => r.state)))];
  const filteredRoads = roads
    .filter(r => filterState === "All" || r.state === filterState)
    .filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.region.toLowerCase().includes(search.toLowerCase()));

  // ── Show login/screenshot screens if no user ───────────────
  if (!currentUser) {
    // New user just created — show screenshot prompt first
    if (newUsername) {
      return <ScreenshotPrompt username={newUsername} onContinue={async () => {
        // Now actually load the new user into state and enter the app
        const profile = await api.getMember(newUsername);
        const garage  = await api.getGarage(newUsername);
        const resolvedGarage = Array.isArray(garage) ? garage : [];
        setCurrentUser(profile && !profile.error ? { ...profile, garage: resolvedGarage } : {
          id: newUsername, username: newUsername, displayName: newUsername,
          location: "", bio: "", avatar: null, joinDate: new Date().toISOString().slice(0,10),
          points: 0, tier: "Explorer", garage: [],
        });
        setNewUsername("");
      }} />;
    }

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
    return <LoginScreen onLogin={handleLogin} loading={loginLoading} error={loginError} takenUsername={loginTaken} />;
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
          <button onClick={handleSignOut} title="Sign out" style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:6, padding:"4px 8px", color:C.dim, fontSize:10, cursor:"pointer", fontFamily:"'Josefin Sans', sans-serif", textTransform:"uppercase", letterSpacing:"0.06em" }}>Out</button>
        </div>
      </header>

      <PitPassBanner member={currentUser} onDismiss={() => {
        const activated = new Date().toISOString();
        updateCurrentUser({ ...currentUser, pitPassActivated: activated });
      }} />

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
            <RoadDetail road={selected} onClose={() => setShowRoadDetail(false)} currentUser={currentUser} onPointsEarned={earnPoints} />
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
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
