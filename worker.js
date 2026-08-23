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
        const body = await request.json();
        const roads = JSON.parse(await env.CURVES_KV.get('roads') || '[]');
        roads.push(body);
        await env.CURVES_KV.put('roads', JSON.stringify(roads));
        return json({ ok: true });
      }
    }

    // PUT /roads/:id
    const roadMatch = path.match(/^\/roads\/([^/]+)$/);
    if (roadMatch && method === 'PUT') {
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
        const existing = JSON.parse(await env.CURVES_KV.get(`member:${id}`) || '{}');
        await env.CURVES_KV.put(`member:${id}`, JSON.stringify({ ...existing, ...body, id }));
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
        await env.CURVES_KV.put(`garage:${id}`, serialised);
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
    if (logbookEntryMatch && method === 'PUT') {
      const userId = cleanEmail(logbookEntryMatch[1]);
      const entryId = logbookEntryMatch[2];
      const authedEmail = await getAuthedEmail(request, env);
      if (!authedEmail) return err('Not authenticated', 401);
      if (authedEmail !== userId) return err('Forbidden', 403);

      const body = await request.json();
      const hasOdo = typeof body.odometerEnd === 'number';
      const hasTrail = Array.isArray(body.trail);
      if (!hasOdo && !hasTrail) return err('odometerEnd (number) and/or trail (array) required');

      if (hasTrail) {
        if (body.trail.length > MAX_TRAIL_POINTS) return err(`trail exceeds ${MAX_TRAIL_POINTS} points`);
        const validShape = body.trail.every(p =>
          p && typeof p.lat === 'number' && typeof p.lng === 'number' && typeof p.t === 'number'
        );
        if (!validShape) return err('Each trail point needs numeric lat, lng, and t');
      }

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

      await env.CURVES_KV.put(`logbook:${userId}`, JSON.stringify(entries));
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
        };
        entries.push(entry);
        await env.CURVES_KV.put(`logbook:${id}`, JSON.stringify(entries));
        return json({ ok: true, entry });
      }
    }

    // ── Trips — public, no auth (organiser tagged by email client-side) ─────
    if (path === '/trips') {
      if (method === 'GET') {
        const val = await env.CURVES_KV.get('trips');
        return json(val ? JSON.parse(val) : []);
      }
      if (method === 'POST') {
        const body = await request.json();
        const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
        trips.push(body);
        await env.CURVES_KV.put('trips', JSON.stringify(trips));
        return json({ ok: true });
      }
    }

    const tripMatch = path.match(/^\/trips\/([^/]+)$/);
    if (tripMatch && method === 'PUT') {
      const id = tripMatch[1];
      const body = await request.json();
      const trips = JSON.parse(await env.CURVES_KV.get('trips') || '[]');
      const idx = trips.findIndex(t => t.id === id);
      if (idx === -1) return err('Trip not found', 404);
      trips[idx] = { ...trips[idx], ...body };
      await env.CURVES_KV.put('trips', JSON.stringify(trips));
      return json({ ok: true });
    }

    // ── Reviews & Alerts — public, no auth ───────────────────────────────────
    if (path === '/reviews' && method === 'POST') {
      const body = await request.json();
      const reviews = JSON.parse(await env.CURVES_KV.get('reviews') || '[]');
      reviews.push(body);
      await env.CURVES_KV.put('reviews', JSON.stringify(reviews));
      return json({ ok: true });
    }

    if (path === '/alerts' && method === 'POST') {
      const body = await request.json();
      const alerts = JSON.parse(await env.CURVES_KV.get('alerts') || '[]');
      alerts.push(body);
      await env.CURVES_KV.put('alerts', JSON.stringify(alerts));
      return json({ ok: true });
    }

    return err('Not found', 404);
  },
};
