const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    // ── ROADS ──────────────────────────────────────────
    if (path === "/roads" && request.method === "GET") {
      const data = await env.CURVES_KV.get("roads");
      return json(data ? JSON.parse(data) : []);
    }

    if (path === "/roads" && request.method === "POST") {
      const road = await request.json();
      const existing = await env.CURVES_KV.get("roads");
      const roads = existing ? JSON.parse(existing) : [];
      road.id = Date.now();
      road.verified = false;
      road.addedDate = new Date().toISOString().slice(0, 10);
      roads.push(road);
      await env.CURVES_KV.put("roads", JSON.stringify(roads));
      return json({ success: true, road });
    }

    if (path.startsWith("/roads/") && request.method === "PUT") {
      const id = parseInt(path.split("/")[2]);
      const updates = await request.json();
      const existing = await env.CURVES_KV.get("roads");
      const roads = existing ? JSON.parse(existing) : [];
      const idx = roads.findIndex(r => r.id === id);
      if (idx === -1) return json({ error: "Road not found" }, 404);
      roads[idx] = { ...roads[idx], ...updates };
      await env.CURVES_KV.put("roads", JSON.stringify(roads));
      return json({ success: true, road: roads[idx] });
    }

    // ── MEMBERS ────────────────────────────────────────
    if (path.startsWith("/member/") && request.method === "GET") {
      const id = path.split("/")[2];
      const data = await env.CURVES_KV.get(`member:${id}`);
      if (!data) return json({ error: "Member not found" }, 404);
      return json(JSON.parse(data));
    }

    if (path === "/member" && request.method === "POST") {
      const member = await request.json();
      if (!member.id) member.id = `m_${Date.now()}`;
      member.joinDate = member.joinDate || new Date().toISOString().slice(0, 10);
      member.points = member.points || 0;
      await env.CURVES_KV.put(`member:${member.id}`, JSON.stringify(member));
      return json({ success: true, member });
    }

    if (path.startsWith("/member/") && request.method === "PUT") {
      const id = path.split("/")[2];
      const updates = await request.json();
      const existing = await env.CURVES_KV.get(`member:${id}`);
      const member = existing ? JSON.parse(existing) : {};
      const updated = { ...member, ...updates };
      await env.CURVES_KV.put(`member:${id}`, JSON.stringify(updated));
      return json({ success: true, member: updated });
    }

    // ── GARAGE ─────────────────────────────────────────
    if (path.startsWith("/garage/") && request.method === "GET") {
      const id = path.split("/")[2];
      const data = await env.CURVES_KV.get(`garage:${id}`);
      return json(data ? JSON.parse(data) : []);
    }

    if (path.startsWith("/garage/") && request.method === "PUT") {
      const id = path.split("/")[2];
      const { garage } = await request.json();
      await env.CURVES_KV.put(`garage:${id}`, JSON.stringify(garage));
      return json({ success: true, garage });
    }

    // ── TRIPS ──────────────────────────────────────────
    if (path === "/trips" && request.method === "GET") {
      const data = await env.CURVES_KV.get("trips");
      return json(data ? JSON.parse(data) : []);
    }

    if (path === "/trips" && request.method === "POST") {
      const trip = await request.json();
      const existing = await env.CURVES_KV.get("trips");
      const trips = existing ? JSON.parse(existing) : [];
      trip.id = Date.now();
      trip.createdAt = new Date().toISOString();
      trips.push(trip);
      await env.CURVES_KV.put("trips", JSON.stringify(trips));
      return json({ success: true, trip });
    }

    if (path.startsWith("/trips/") && request.method === "PUT") {
      const id = parseInt(path.split("/")[2]);
      const updates = await request.json();
      const existing = await env.CURVES_KV.get("trips");
      const trips = existing ? JSON.parse(existing) : [];
      const idx = trips.findIndex(t => t.id === id);
      if (idx === -1) return json({ error: "Trip not found" }, 404);
      trips[idx] = { ...trips[idx], ...updates };
      await env.CURVES_KV.put("trips", JSON.stringify(trips));
      return json({ success: true, trip: trips[idx] });
    }

    // ── REVIEWS ────────────────────────────────────────
    if (path === "/reviews" && request.method === "POST") {
      const review = await request.json();
      const key = `reviews:${review.roadId}`;
      const existing = await env.CURVES_KV.get(key);
      const reviews = existing ? JSON.parse(existing) : [];
      review.id = Date.now();
      review.date = new Date().toISOString().slice(0, 10);
      reviews.push(review);
      await env.CURVES_KV.put(key, JSON.stringify(reviews));
      return json({ success: true, review });
    }

    if (path.startsWith("/reviews/") && request.method === "GET") {
      const roadId = path.split("/")[2];
      const data = await env.CURVES_KV.get(`reviews:${roadId}`);
      return json(data ? JSON.parse(data) : []);
    }

    // ── ALERTS ─────────────────────────────────────────
    if (path === "/alerts" && request.method === "POST") {
      const alert = await request.json();
      const roadsData = await env.CURVES_KV.get("roads");
      const roads = roadsData ? JSON.parse(roadsData) : [];
      const idx = roads.findIndex(r => r.id === alert.roadId);
      if (idx === -1) return json({ error: "Road not found" }, 404);
      roads[idx].alerts = roads[idx].alerts || [];
      roads[idx].alerts.push({ type: alert.type, text: alert.text });
      await env.CURVES_KV.put("roads", JSON.stringify(roads));
      return json({ success: true });
    }

    // ── HEALTH CHECK ───────────────────────────────────
    if (path === "/" || path === "") {
      return json({
        app: "Chasin' Curves API",
        status: "Worker alive",
        version: "1.1",
        endpoints: [
          "GET  /roads",
          "POST /roads",
          "PUT  /roads/:id",
          "GET  /member/:id",
          "POST /member",
          "PUT  /member/:id",
          "GET  /garage/:memberId",
          "PUT  /garage/:memberId",
          "GET  /trips",
          "POST /trips",
          "PUT  /trips/:id",
          "POST /reviews",
          "GET  /reviews/:roadId",
          "POST /alerts",
        ],
        timestamp: new Date().toISOString(),
      });
    }

    return json({ error: "Not found" }, 404);
  },
};
