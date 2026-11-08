// Fetching bundles from the game CDN, with Cache Storage keyed by the hashed
// URL (a hashed name never changes content, so entries never go stale).

import { CDN, HOSTED, type Catalog } from "./catalog";

const CACHE = "taimanin-bundles-v1";

export class BundleMissing extends Error {}

/** Network errors and 5xx are retried with backoff; 403/404 are final. */
async function fetchRetry(url: string, tries = 3, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, init);
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

// ---- the deployed build's packs: all of a unit's or card's files of one kind
// as one file on the asset host, so a page costs one download there. A pack is
// b"TMPK", uint32 LE header length, JSON {file: [offset, length]}, then the
// files; the browser reads the header and then only the files it shows.
// (tools/web_export/upload_b2.py, public/data/packs.json)
type PackKind = "art" | "r18" | "card" | "voice";
type PackTable = { url: string; base: number; files: Record<string, [number, number]> };
const HEAD_BYTES = 16384;
let packIndex: Promise<Record<string, Partial<Record<PackKind, string>>>> | null = null;
const packTables = new Map<string, Promise<PackTable>>();

async function readRange(url: string, from: number, length: number): Promise<Uint8Array> {
  const r = await fetchRetry(url, 3, { headers: { Range: `bytes=${from}-${from + length - 1}` } });
  if (r.status === 403 || r.status === 404) throw new BundleMissing(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const bytes = new Uint8Array(await r.arrayBuffer());
  return r.status === 206 ? bytes : bytes.subarray(from, from + length);
}

function packTable(id: string, kind: PackKind): Promise<PackTable> {
  const key = `${id}/${kind}`;
  let p = packTables.get(key);
  if (!p) {
    p = (async () => {
      packIndex ??= fetch(`${import.meta.env.BASE_URL}data/packs.json`).then((r) => {
        if (!r.ok) throw new Error(`packs.json: ${r.status}`);
        return r.json();
      });
      packIndex.catch(() => { packIndex = null; });
      const md5 = (await packIndex)[id]?.[kind];
      if (!md5) throw new BundleMissing(`no ${kind} pack for ${id}`);
      const url = `${CDN}/packs/${id}_${kind}_${md5}.pack`;
      const head = await readRange(url, 0, HEAD_BYTES);
      const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      if (view.getUint32(0, false) !== 0x544d504b) throw new Error(`not a pack: ${url}`);
      const size = view.getUint32(4, true);
      const json = 8 + size <= head.length ? head.subarray(8, 8 + size) : await readRange(url, 8, size);
      return { url, base: 8 + size, files: JSON.parse(new TextDecoder().decode(json)) };
    })();
    p.catch(() => packTables.delete(key));
    packTables.set(key, p);
  }
  return p;
}

/** One file out of a pack, kept in Cache Storage (a pack's name is its hash). */
export async function packFile(id: string, kind: PackKind, file: string): Promise<Uint8Array> {
  const t = await packTable(id, kind);
  const at = t.files[file];
  if (!at) throw new BundleMissing(`${file} not in ${t.url}`);
  const key = `${t.url}?file=${encodeURIComponent(file)}`;
  let cache: Cache | null = null;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(key);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  } catch {
    cache = null;
  }
  const bytes = await readRange(t.url, t.base + at[0], at[1]);
  try { await cache?.put(key, new Response(bytes as Uint8Array<ArrayBuffer>)); } catch { /* quota */ }
  return bytes;
}

/** Which pack holds a bundle, if any: the art tabs' bundles do (upload_b2.py). */
function packOf(stem: string): { id: string; kind: PackKind } | null {
  const art = /^(r18_)?image_chr_(?:l|xl|ldiff)_assets_image_chr_(?:l|xl|ldiff)_uni_(\d+)(?:_r18)?_l_\d+\.png$/.exec(stem);
  if (art) return { id: art[2], kind: art[1] ? "r18" : "art" };
  const card = /^r18_image_kar_l_assets_image_kar_r18_l_kar_(c\d+)_r18_l_\d+\.png$/.exec(stem);
  return card ? { id: card[1], kind: "card" } : null;
}

/** Bytes of a bundle by stem. A 403 means the hash went stale (game update):
 *  re-check the catalogs once and retry before giving up. */
export async function fetchBundle(catalog: Catalog, stem: string, onProgress?: (loaded: number, total: number) => void): Promise<Uint8Array> {
  const pack = HOSTED ? packOf(stem) : null;
  if (pack) {
    const bytes = await packFile(pack.id, pack.kind, stem);
    onProgress?.(bytes.length, bytes.length);
    return bytes;
  }
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
