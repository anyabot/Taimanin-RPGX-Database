// Serves the site's self-hosted game files (unit art bundles, voice clips) from
// a private Backblaze B2 bucket at https://taimanin-assets.altterisk.cc/<path>.
//
// The bucket mirrors the game CDN's layout, so <path> is the same as on the
// CDN: asset_bundles/WebGL/LIVE/<Basic|R18>/<name>.bundle and
// asset_bundles/DirectDownloadBundles/Audio/... The site only swaps the host.
//
// Every file is cached at Cloudflare's edge after its first download, so B2 is
// asked once per file per location. B2 -> Cloudflare transfer is free.
//
// Secrets (wrangler secret put): B2_KEY_ID, B2_APP_KEY, a read-only key
// limited to the bucket. Vars (wrangler.jsonc): B2_BUCKET, ALLOWED_ORIGINS.

const B2_AUTH_URL = "https://api.backblazeb2.com/b2api/v3/b2_authorize_account";
// B2 tokens last 24 h; renew well before that.
const AUTH_TTL_MS = 20 * 3600e3;
// Bundle names carry a content hash, so a URL never changes what it serves.
const HASHED_MAX_AGE = 365 * 86400;
// Voice clips keep their name across updates; still effectively static.
const PLAIN_MAX_AGE = 30 * 86400;
// A missing file is cached briefly, so probing for files cannot run up B2 calls.
const MISSING_MAX_AGE = 600;
const EXPOSE = "Content-Length, Content-Range, Accept-Ranges, ETag";

let auth = null; // { apiUrl, downloadUrl, token, until } for this isolate

async function authorize(env, force = false) {
  if (!force && auth && Date.now() < auth.until) return auth;
  const r = await fetch(B2_AUTH_URL, {
    headers: { Authorization: "Basic " + btoa(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`) },
  });
  if (!r.ok) throw new Error(`b2 authorize: HTTP ${r.status}`);
  const j = await r.json();
  auth = { downloadUrl: j.apiInfo.storageApi.downloadUrl, token: j.authorizationToken, until: Date.now() + AUTH_TTL_MS };
  return auth;
}

/** GET or HEAD one file from B2, renewing the token once if it expired. */
async function fromB2(env, method, path, range) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await authorize(env, attempt > 0);
    const headers = { Authorization: a.token };
    if (range) headers.Range = range;
    const r = await fetch(`${a.downloadUrl}/file/${env.B2_BUCKET}/${path}`, { method, headers });
    if (r.status !== 401) return r;
  }
  throw new Error("b2: token refused after renewal");
}

/** B2's response, cleaned up for storing and serving. */
function toStored(r, path) {
  const ok = r.status === 200 || r.status === 206;
  const h = new Headers();
  for (const k of ["Content-Type", "Content-Length", "Content-Range", "ETag", "Last-Modified"]) {
    const v = r.headers.get(k);
    if (v) h.set(k, v);
  }
  h.set("Accept-Ranges", "bytes");
  const age = !ok ? MISSING_MAX_AGE : /_[0-9a-f]{32}\.bundle$/.test(path) ? HASHED_MAX_AGE : PLAIN_MAX_AGE;
  h.set("Cache-Control", `public, max-age=${age}${ok && age === HASHED_MAX_AGE ? ", immutable" : ""}`);
  // B2 answers 404 with a JSON error naming the bucket; send nothing instead.
  return new Response(ok ? r.body : null, { status: ok ? r.status : r.status === 404 ? 404 : 502, headers: h });
}

function withCors(res, origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = new Response(res.body, res);
  out.headers.set("Vary", "Origin");
  if (origin && allowed.includes(origin)) {
    out.headers.set("Access-Control-Allow-Origin", origin);
    out.headers.set("Access-Control-Expose-Headers", EXPOSE);
  }
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin");
    if (request.method === "OPTIONS") {
      const res = withCors(new Response(null, { status: 204 }), origin, env);
      res.headers.set("Access-Control-Allow-Methods", "GET, HEAD");
      res.headers.set("Access-Control-Allow-Headers", "Range");
      res.headers.set("Access-Control-Max-Age", "86400");
      return res;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, "");
    if (!path || path.endsWith("/") || path.split("/").some((s) => s === ".." || s === ".")) {
      return withCors(new Response("Not found", { status: 404 }), origin, env);
    }

    if (env.RATE_LIMITER) {
      const { success } = await env.RATE_LIMITER.limit({ key: request.headers.get("cf-connecting-ip") || "unknown" });
      if (!success) return withCors(new Response("Too many requests", { status: 429, headers: { "Retry-After": "60" } }), origin, env);
    }

    // One cache entry per file: the full body, keyed by the bare URL. The Cache
    // API answers a Range request from it with a 206 by itself.
    const cache = caches.default;
    const key = new Request(`${url.origin}/${path}`, { method: "GET" });
    const range = request.headers.get("Range");
    const hit = await cache.match(range ? new Request(key, { headers: { Range: range } }) : key);
    if (hit) return withCors(request.method === "HEAD" ? new Response(null, hit) : hit, origin, env);

    try {
      if (range) {
        // Serve the slice straight from B2, and fill the cache with the whole file meanwhile.
        ctx.waitUntil(fromB2(env, "GET", path).then((r) => cache.put(key, toStored(r, path))).catch(() => {}));
        return withCors(toStored(await fromB2(env, "GET", path, range), path), origin, env);
      }
      const stored = toStored(await fromB2(env, "GET", path), path);
      ctx.waitUntil(cache.put(key, stored.clone()));
      return withCors(request.method === "HEAD" ? new Response(null, stored) : stored, origin, env);
    } catch (e) {
      console.error(String(e));
      return withCors(new Response("Upstream error", { status: 502 }), origin, env);
    }
  },
};
