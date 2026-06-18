// Chasin' Curves — Worker v2.0
// Session 4: R2 photo storage added
// Endpoints: 16 total (added PUT /garage/:id/photo, DELETE /garage/:id/photo/:photoId)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

// ─── R2 public base URL ───────────────────────────────────────────────────────
// Replace this with your actual R2 public bucket URL from the dashboard
const R2_PUBLIC_BASE = 'https://pub-b314c19cc30f425aa97c85dbfee0e713.r2.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── Roads ──────────────────────────────────────────────────────────────────
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

    // ── Member ─────────────────────────────────────────────────────────────────
    const memberMatch = path.match(/^\/member\/([^/]+)$/);
    if (path === '/member' && method === 'POST') {
      const body = await request.json();
      const existing = await env.CURVES_KV.get(`member:${body.id}`);
      if (existing) return err('Username taken', 409);
      await env.CURVES_KV.put(`member:${body.id}`, JSON.stringify(body));
      // Create empty garage for new member
      await env.CURVES_KV.put(`garage:${body.id}`, JSON.stringify([]));
      return json({ ok: true });
    }

    if (memberMatch) {
      const id = memberMatch[1];
      if (method === 'GET') {
        const val = await env.CURVES_KV.get(`member:${id}`);
        if (!val) return err('Member not found', 404);
        return json(JSON.parse(val));
      }
      if (method === 'PUT') {
        const body = await request.json();
        const existing = JSON.parse(await env.CURVES_KV.get(`member:${id}`) || '{}');
        await env.CURVES_KV.put(`member:${id}`, JSON.stringify({ ...existing, ...body }));
        return json({ ok: true });
      }
    }

    // ── Garage ─────────────────────────────────────────────────────────────────
    const garageMatch = path.match(/^\/garage\/([^/]+)$/);
    const garagePhotoMatch = path.match(/^\/garage\/([^/]+)\/photo$/);
    const garagePhotoDeleteMatch = path.match(/^\/garage\/([^/]+)\/photo\/([^/]+)$/);

    // DELETE /garage/:id/photo/:photoId  ← check most-specific first
    if (garagePhotoDeleteMatch && method === 'DELETE') {
      const [, userId, photoId] = garagePhotoDeleteMatch;
      const garage = JSON.parse(await env.CURVES_KV.get(`garage:${userId}`) || '[]');

      // Find which vehicle owns this photo and remove it
      let deleted = false;
      for (const vehicle of garage) {
        const before = vehicle.photos ? vehicle.photos.length : 0;
        vehicle.photos = (vehicle.photos || []).filter(p => p.id !== photoId);
        if (vehicle.photos.length < before) {
          deleted = true;
          // If this was the heroPhoto, clear it
          if (vehicle.heroPhoto === photoId) {
            vehicle.heroPhoto = vehicle.photos.length > 0 ? vehicle.photos[0].id : null;
          }
        }
      }

      if (!deleted) return err('Photo not found', 404);

      // Delete from R2
      try {
        await env.MEDIA_BUCKET.delete(photoId);
      } catch (e) {
        // Log but don't fail — KV cleanup is more important
        console.error('R2 delete failed:', e);
      }

      await env.CURVES_KV.put(`garage:${userId}`, JSON.stringify(garage));
      return json({ ok: true });
    }

    // PUT /garage/:id/photo  — multipart upload → R2 → store URL in KV
    if (garagePhotoMatch && method === 'PUT') {
      const [, userId] = garagePhotoMatch;
      const contentType = request.headers.get('Content-Type') || '';

      if (!contentType.includes('multipart/form-data')) {
        return err('Expected multipart/form-data');
      }

      const formData = await request.formData();
      const file = formData.get('photo');
      const vehicleId = formData.get('vehicleId');
      const setAsHero = formData.get('setAsHero') === 'true';

      if (!file || !vehicleId) return err('Missing photo or vehicleId');

      const garage = JSON.parse(await env.CURVES_KV.get(`garage:${userId}`) || '[]');
      const vehicle = garage.find(v => v.id === vehicleId);
      if (!vehicle) return err('Vehicle not found', 404);

      // Check photo limit
      if ((vehicle.photos || []).length >= 10) {
        return err('Maximum 10 photos per vehicle');
      }

      // Generate unique key for R2
      const ext = file.name ? file.name.split('.').pop().toLowerCase() : 'jpg';
      const photoId = `${userId}_${vehicleId}_${Date.now()}.${ext}`;

      // Upload to R2
      await env.MEDIA_BUCKET.put(photoId, file.stream(), {
        httpMetadata: { contentType: file.type || 'image/jpeg' },
      });

      const photoUrl = `${R2_PUBLIC_BASE}/${photoId}`;

      // Add to vehicle photos array
      if (!vehicle.photos) vehicle.photos = [];
      vehicle.photos.push({ id: photoId, url: photoUrl, addedAt: Date.now() });

      // Set as hero if flagged or if it's the first photo
      if (setAsHero || vehicle.photos.length === 1) {
        vehicle.heroPhoto = photoId;
        vehicle.heroPhotoUrl = photoUrl;
      }

      await env.CURVES_KV.put(`garage:${userId}`, JSON.stringify(garage));
      return json({ ok: true, photoId, url: photoUrl });
    }

    // GET /garage/:id  and  PUT /garage/:id
    if (garageMatch) {
      const id = garageMatch[1];
      if (method === 'GET') {
        const val = await env.CURVES_KV.get(`garage:${id}`);
        return json(val ? JSON.parse(val) : []);
      }
      if (method === 'PUT') {
        const body = await request.json();
        // Safety check — never allow base64 images in KV
        const serialised = JSON.stringify(body);
        if (serialised.length > 80000) {
          return err('Payload too large — use /garage/:id/photo for images', 413);
        }
        await env.CURVES_KV.put(`garage:${id}`, serialised);
        return json({ ok: true });
      }
    }

    // ── Trips ──────────────────────────────────────────────────────────────────
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

    // ── Reviews & Alerts ───────────────────────────────────────────────────────
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
