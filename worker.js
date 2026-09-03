// Chasin' Curves — Worker v3.1
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
// Endpoints: 27 total
//
// Secrets required in Cloudflare dashboard:
//   RESEND_API_KEY   ← re_... from resend.com dashboard (already in use for Mic Drop)
//
// KV binding: CURVES_KV (existing — now also holds authcode:{email} and session:{token})
// R2 binding: MEDIA_BUCKET (existing)

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

const R2_PUBLIC_BASE = 'https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev';

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

const MEMBER_PROTECTED_FIELDS = ['points'];
function stripProtectedFields(body) {
  const clean = { ...body };
  for (const f of MEMBER_PROTECTED_FIELDS) delete clean[f];
  return clean;
}

async function awardPoints(env, email, amount, reason, meta = {}) {
  if (!email || !amount || amount <= 0) return;
  const ledgerKey = `points_ledger:${email}`;
  const ledger = JSON.parse(await env.CURVES_KV.get(ledgerKey) || '[]');
  ledger.push({ amount, reason, meta, timestamp: Date.now() });
  await env.CURVES_KV.put(ledgerKey, JSON.stringify(ledger));

  const raw = await env.CURVES_KV.get(`member:${email}`);
  if (!raw) return;
  const member = JSON.parse(raw);
  member.points = (member.points || 0) + amount;
  await env.CURVES_KV.put(`member:${email}`, JSON.stringify(member));
}

// TGM formulas — spanner-scaled, not wired to any live endpoint yet since
// TGM itself is held back pre-launch. Kept here so the module is complete
// and ready the moment /tgm/guides routes get built.
function tgmGenerationReward(spannerRating) { return 100 + 40 * spannerRating; }
function tgmDebriefReward(spannerRating) { return 20 + 10 * spannerRating; }

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

        const body = await request.json();
        const road = { ...body, addedBy: authedEmail }; // override — never trust client value
        const roads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
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
    const roadMatch = path.match(/^\/roads\/([^/]+)$/);
    if (roadMatch && method === 'PUT') {
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);

      const id = roadMatch[1];
      const body = await request.json();
      const roads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
      const idx = roads.findIndex(r => r.id === id);
      if (idx === -1) return err('Road not found', 404);
      roads[idx] = { ...roads[idx], ...body };
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
        const trip = { ...body, createdBy: authedEmail }; // override, matches app.js's own field name
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
      const idx = trips.findIndex(t => t.id === id);
      if (idx === -1) return err('Trip not found', 404);
      trips[idx] = { ...trips[idx], ...body };
      await env.CURVES_KV.put('trips', JSON.stringify(trips));
      return json({ ok: true });
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
      await awardPoints(env, authedEmail, POINT_ACTIONS.write_review, 'write_review', { roadId: review.roadId });
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
      await awardPoints(env, authedEmail, POINT_ACTIONS.report_alert, 'report_alert', { roadId: alert.roadId });
      return json({ ok: true, alert });
    }

    return err('Not found', 404);
  },
};
