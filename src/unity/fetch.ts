// Fetching bundles from the game CDN, with Cache Storage keyed by the hashed
// URL (a hashed name never changes content, so entries never go stale).

import type { Catalog } from "./catalog";

const CACHE = "taimanin-bundles-v1";

export class BundleMissing extends Error {}

/** Network errors and 5xx are retried with backoff; 403/404 are final. */
async function fetchRetry(url: string, tries = 3): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url);
      if (r.status < 500 || attempt >= tries) return r;
    } catch (err) {
      if (attempt >= tries) throw err;
    }
    await new Promise((ok) => setTimeout(ok, 600 * attempt));
  }
}

async function cachedFetch(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null;
  }
  const r = await fetchRetry(url);
  if (r.status === 403 || r.status === 404) throw new BundleMissing(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const total = Number(r.headers.get("content-length") || 0);
  let bytes: Uint8Array;
  if (onProgress && r.body) {
    const reader = r.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      loaded += value.length;
      onProgress(loaded, total);
    }
    bytes = new Uint8Array(loaded);
    let o = 0;
    for (const p of parts) { bytes.set(p, o); o += p.length; }
  } else {
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  try { await cache?.put(url, new Response(bytes as Uint8Array<ArrayBuffer>)); } catch { /* quota */ }
  return bytes;
}

/** Bytes of a bundle by stem. A 403 means the hash went stale (game update):
 *  re-check the catalogs once and retry before giving up. */
export async function fetchBundle(catalog: Catalog, stem: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  let url = catalog.url(stem);
  if (url) {
    try {
      return await cachedFetch(url, onProgress);
    } catch (err) {
      if (!(err instanceof BundleMissing)) throw err;
    }
  }
  await catalog.refresh(true);
  const fresh = catalog.url(stem);
  if (!fresh || fresh === url) throw new BundleMissing(`bundle ${stem} is not on the CDN (game updated? re-run the exporter)`);
  url = fresh;
  return cachedFetch(url, onProgress);
}
