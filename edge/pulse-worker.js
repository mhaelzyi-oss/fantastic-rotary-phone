/**
 * Optional Cloudflare Worker in front of kui.video.
 * Counts visitors/downloads, rate-limits /studio/hit, and serves /studio/stats
 * only with header X-Kui-Key matching env.STUDIO_KEY.
 *
 * wrangler.toml:
 *   name = "kui-pulse"
 *   kv_namespaces = [{ binding = "PULSE", id = "..." }]
 *   [vars]  — do not put the passphrase here; use a secret.
 */
var WINDOW_MS = 60_000;
var MAX_HITS = 60;
var buckets = new Map();

function ip(req) {
  return req.headers.get("CF-Connecting-IP") || req.headers.get("x-forwarded-for") || "0";
}

function limited(req) {
  var now = Date.now();
  var key = ip(req);
  var b = buckets.get(key);
  if (!b || now - b.start > WINDOW_MS) {
    buckets.set(key, { start: now, n: 1 });
    return false;
  }
  b.n += 1;
  return b.n > MAX_HITS;
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export default {
  async fetch(req, env) {
    var url = new URL(req.url);
    if (limited(req)) return json({ error: "rate limited" }, 429);

    if (url.pathname === "/studio/hit" && req.method === "POST") {
      var kind = (await req.text()) === "d" ? "downloads" : "visits";
      var here = Number((await env.PULSE.get("here")) || 0);
      var visits = Number((await env.PULSE.get("visits")) || 0);
      var downloads = Number((await env.PULSE.get("downloads")) || 0);
      if (kind === "downloads") downloads += 1;
      else visits += 1;
      await env.PULSE.put("visits", String(visits));
      await env.PULSE.put("downloads", String(downloads));
      await env.PULSE.put("here", String(here + 1));
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }

    if (url.pathname === "/studio/stats" && req.method === "GET") {
      var key = req.headers.get("X-Kui-Key") || "";
      if (!env.STUDIO_KEY || key !== env.STUDIO_KEY) return json({ error: "no" }, 401);
      return json({
        here: (await env.PULSE.get("here")) || "0",
        visits: (await env.PULSE.get("visits")) || "0",
        downloads: (await env.PULSE.get("downloads")) || "0",
      });
    }

    return env.ASSETS ? env.ASSETS.fetch(req) : new Response("Not found", { status: 404 });
  },
};
