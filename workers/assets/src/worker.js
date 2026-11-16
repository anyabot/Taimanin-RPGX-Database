// Serves the site's self-hosted game files (art and voice packs) from
// a private Backblaze B2 bucket at https://taimanin-assets.altterisk.cc/<path>.
//
// B2 counts every download against a small daily allowance, so each unit's or
// card's files are one pack (packs/<id>_<kind>_<md5>.pack): the first visitor at
// a location makes one B2 download, and browsers read single files out of the
// cached pack with Range requests.
//
// Two cache layers: the Cache API (one data centre) answers Range requests, and
// the B2 download itself goes through Cloudflare's cache with fetch(), which
// Tiered Cache shares between data centres (turn on Smart Tiered Cache for the
// zone). So a location that misses usually gets the file from an upper tier,
// not from B2. B2 -> Cloudflare transfer is free.
//
// Every B2 call is logged as one JSON line ({b2: ...}) in Workers Logs.
//
// Secrets (wrangler secret put): B2_KEY_ID, B2_APP_KEY, a read-only key
// limited to the bucket. Vars (wrangler.jsonc): B2_BUCKET, ALLOWED_ORIGINS.

const B2_AUTH_URL = "https://api.backblazeb2.com/b2api/v3/b2_authorize_account";
// B2 tokens last 24 h; renew well before that.
const AUTH_TTL_MS = 20 * 3600e3;
// Pack and bundle names carry a content hash, so a URL never changes what it serves.
const HASHED_MAX_AGE = 365 * 86400;
// Anything without a hash in its name.
const PLAIN_MAX_AGE = 30 * 86400;
// A missing file is cached, so probing for files cannot run up B2 calls. A hashed
// name never appears later; a plain one might after an upload.
const MISSING_MAX_AGE = 3600;
const MISSING_HASHED_MAX_AGE = 7 * 86400;
const HASHED = /_[0-9a-f]{32}\.(bundle|pack)$/;
// Where the B2 token is kept for other isolates in this data centre. Paths under
// /__ are refused below, so no visitor can read it.
const AUTH_CACHE_KEY = "https://taimanin-assets.altterisk.cc/__internal/b2auth";
const EXPOSE = "Content-Length, Content-Range, Accept-Ranges, ETag";

let auth = null; // { downloadUrl, token, until } for this isolate
const inflight = new Map(); // path -> Promise of the stored response, for this isolate

const log = (o) => console.log(JSON.stringify(o));

/** A B2 token: this isolate's, else this data centre's, else a new one (a Class C call). */
async function authorize(env, force = false) {
  if (!force && auth && Date.now() < auth.until) return auth;
  const cache = caches.default;
  if (!force) {
    const hit = await cache.match(AUTH_CACHE_KEY);
    if (hit) {
      const a = await hit.json();
      if (Date.now() < a.until) return (auth = a);
    }
  }
  const r = await fetch(B2_AUTH_URL, {
    headers: { Authorization: "Basic " + btoa(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`) },
  });
  log({ b2: "authorize", status: r.status, force });
  if (!r.ok) throw new Error(`b2 authorize: HTTP ${r.status}`);
  const j = await r.json();
  auth = { downloadUrl: j.apiInfo.storageApi.downloadUrl, token: j.authorizationToken, until: Date.now() + AUTH_TTL_MS };
  const age = Math.floor(AUTH_TTL_MS / 1000);
  await cache.put(AUTH_CACHE_KEY, new Response(JSON.stringify(auth), {
    headers: { "Content-Type": "application/json", "Cache-Control": `private, max-age=${age}` },
  })).catch(() => {});
  return auth;
}

/** How long Cloudflare's cache keeps a B2 answer, by status. */
function ttlByStatus(path) {
  const hashed = HASHED.test(path);
  return {
    "200-299": hashed ? HASHED_MAX_AGE : PLAIN_MAX_AGE,
    404: hashed ? MISSING_HASHED_MAX_AGE : MISSING_MAX_AGE,
    "400-403": 0,
    "405-599": 0,
  };
}

/** GET one file from B2 (through Cloudflare's tiered cache unless ranged), renewing the token once if it expired. */
async function fromB2(env, path, range, colo) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = await authorize(env, attempt > 0);
    const headers = { Authorization: a.token };
    if (range) headers.Range = range;
    const init = { headers };
    if (!range) init.cf = { cacheEverything: true, cacheTtlByStatus: ttlByStatus(path) };
    const r = await fetch(`${a.downloadUrl}/file/${env.B2_BUCKET}/${path}`, init);
    // HIT means an upper tier or this location answered, not B2.
    log({ b2: "get", path, range: range || undefined, status: r.status, cache: r.headers.get("cf-cache-status"), colo, bytes: Number(r.headers.get("Content-Length")) || undefined });
    if (r.status !== 401) return r;
  }
  throw new Error("b2: token refused after renewal");
}

/** One B2 download per path at a time in this isolate: concurrent misses share it. */
function storedFromB2(env, path, colo) {
  let p = inflight.get(path);
  if (!p) {
    p = fromB2(env, path, null, colo).then((r) => toStored(r, path));
    inflight.set(path, p);
    p.finally(() => inflight.delete(path)).catch(() => {});
  }
  return p.then((r) => r.clone());
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
  const hashed = HASHED.test(path);
  const age = !ok ? (hashed ? MISSING_HASHED_MAX_AGE : MISSING_MAX_AGE) : hashed ? HASHED_MAX_AGE : PLAIN_MAX_AGE;
  h.set("Cache-Control", `public, max-age=${age}${ok && age === HASHED_MAX_AGE ? ", immutable" : ""}`);
  // B2 answers 404 with a JSON error naming the bucket; send nothing instead.
  return new Response(ok ? r.body : null, { status: ok ? r.status : r.status === 404 ? 404 : 502, headers: h });
}

/** Failures are not stored: a B2 outage or spent cap must end when B2 recovers. */
const cacheable = (status) => status === 200 || status === 404;

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
    if (!path || path.startsWith("__") || path.endsWith("/") || path.split("/").some((s) => s === ".." || s === ".")) {
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

    const colo = request.cf && request.cf.colo;
    try {
      const stored = await storedFromB2(env, path, colo);
      if (range) {
        // One B2 download for the whole file, then the slice from the cache.
        // Without this every first Range request would be a download of its own.
        if (stored.status !== 200) {
          if (cacheable(stored.status)) await cache.put(key, stored.clone());
          return withCors(stored, origin, env);
        }
        await cache.put(key, stored);
        const slice = await cache.match(new Request(key, { headers: { Range: range } }));
        return withCors(slice || toStored(await fromB2(env, path, range, colo), path), origin, env);
      }
      if (cacheable(stored.status)) ctx.waitUntil(cache.put(key, stored.clone()));
      return withCors(request.method === "HEAD" ? new Response(null, stored) : stored, origin, env);
    } catch (e) {
      console.error(String(e));
      return withCors(new Response("Upstream error", { status: 502 }), origin, env);
    }
  },
};
