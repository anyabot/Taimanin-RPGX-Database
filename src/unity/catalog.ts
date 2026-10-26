// Bundle stem -> current hashed filename, kept in step with the live game.
//
// Bundle names carry an md5 that changes with every game update, and the
// Addressables catalogs are the only list of them. The site ships a snapshot
// (public/data/bundles.json, written by tools/web_export) and at startup asks
// the CDN for each catalog's 32-byte .hash. Only a catalog whose hash moved is
// downloaded (rpgx is ~31 MB, uncompressed) and scanned for
// `<stem>_<md5>.bundle`, the same scan as taimanin_dl.py names_from_catalog().
// The result is cached in Cache Storage under that hash, so only the first
// visit after an update pays for it.

export const CDN = import.meta.env.DEV ? "/cdn" : "https://dntgnyxcho2sk.cloudfront.net";
export const LIVE_ROOT = `${CDN}/asset_bundles/WebGL/LIVE`;
export const DIRECT_ROOT = `${CDN}/asset_bundles/DirectDownloadBundles`;

export const CATALOGS = ["catalog_rpgx", "catalog_basicimage", "catalog_r18image", "catalog_table"] as const;
type CatalogName = (typeof CATALOGS)[number];

export interface CatalogSnapshot {
  /** catalog -> { hash at export time, bundle names without ".bundle" } */
  catalogs: Record<CatalogName, { hash: string; names: string[] }>;
}

const CACHE = "taimanin-catalogs-v1";
const STEM_RE = /^(.*)_([0-9a-f]{32})$/;

export function subdirOf(name: string) {
  if (name.startsWith("r18_")) return "R18";
  if (name.startsWith("table_assets_")) return "Table";
  if (name.startsWith("system_assets_")) return "System";
  return "Basic";
}

/** Same pattern as taimanin_dl.py BUNDLE_RE, over ASCII and UTF-16LE text. */
export function scanCatalog(bin: Uint8Array): string[] {
  const re = /[A-Za-z0-9_.\-]+_[0-9a-f]{32}\.bundle/g;
  const found = new Set<string>();
  const latin1 = new TextDecoder("latin1").decode(bin);
  for (const m of latin1.matchAll(re)) found.add(m[0].slice(0, -7));
  const even = bin.byteLength & ~1;
  const utf16 = new TextDecoder("utf-16le").decode(bin.subarray(0, even));
  for (const m of utf16.matchAll(re)) found.add(m[0].slice(0, -7));
  return [...found];
}

async function cachedNames(cat: string, hash: string): Promise<string[] | null> {
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(`/__catalog/${cat}/${hash}`);
    return r ? await r.json() : null;
  } catch {
    return null;
  }
}

async function storeNames(cat: string, hash: string, names: string[]) {
  try {
    const c = await caches.open(CACHE);
    for (const k of await c.keys()) if (k.url.includes(`/__catalog/${cat}/`)) await c.delete(k);
    await c.put(`/__catalog/${cat}/${hash}`, new Response(JSON.stringify(names)));
  } catch {
    /* private mode etc: rescan next visit */
  }
}

export type CatalogEvent = { catalog: string; state: "current" | "cached" | "downloading" | "scanned" | "error"; detail?: string };

export class Catalog {
  private stems = new Map<string, string>();
  private snapshot: CatalogSnapshot;
  private refreshing: Promise<void> | null = null;
  onEvent: (e: CatalogEvent) => void = () => {};

  constructor(snapshot: CatalogSnapshot) {
    this.snapshot = snapshot;
    for (const c of Object.values(snapshot.catalogs)) this.add(c.names);
  }

  private add(names: string[]) {
    for (const n of names) {
      const m = STEM_RE.exec(n);
      if (m) this.stems.set(m[1], n);
    }
  }

  get size() { return this.stems.size; }

  allStems() { return [...this.stems.keys()]; }

  /** Hashed filename for a bundle stem, e.g. "spine_assets_chr_1028". */
  name(stem: string) { return this.stems.get(stem); }

  url(stem: string) {
    const n = this.stems.get(stem);
    return n ? `${LIVE_ROOT}/${subdirOf(n)}/${n}.bundle` : undefined;
  }

  /** Compare live .hash tokens with what we hold; rescan the ones that moved. */
  refresh(force = false): Promise<void> {
    if (this.refreshing && !force) return this.refreshing;
    this.refreshing = (async () => {
      await Promise.all(CATALOGS.map(async (cat) => {
        try {
          const r = await fetch(`${LIVE_ROOT}/${cat}.hash`, { cache: "no-cache" });
          if (!r.ok) throw new Error(`${r.status}`);
          const hash = (await r.text()).trim();
          if (hash === this.snapshot.catalogs[cat]?.hash) return this.onEvent({ catalog: cat, state: "current" });
          const cached = await cachedNames(cat, hash);
          if (cached) {
            this.add(cached);
            return this.onEvent({ catalog: cat, state: "cached" });
          }
          this.onEvent({ catalog: cat, state: "downloading" });
          const bin = await fetch(`${LIVE_ROOT}/${cat}.bin`, { cache: "no-cache" });
          if (!bin.ok) throw new Error(`${bin.status}`);
          const names = scanCatalog(new Uint8Array(await bin.arrayBuffer()));
          this.add(names);
          await storeNames(cat, hash, names);
          this.onEvent({ catalog: cat, state: "scanned", detail: `${names.length} bundles` });
        } catch (err) {
          this.onEvent({ catalog: cat, state: "error", detail: String(err) });
        }
      }));
    })();
    return this.refreshing;
  }
}
