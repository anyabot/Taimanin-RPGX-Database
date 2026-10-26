// A bundle read in pieces over HTTP Range, for the big aggregate bundles
// where a page needs one asset out of thousands: the scenario scripts
// (r18_adv_assets_adv_scenario_r18, ~24 MB, 2000 scripts of ~30 KB) and the
// ADV sound effects (adv_assets_all, ~14 MB).
//
// UnityFS keeps its block table at the front and compresses the data stream
// in independent LZ4 blocks, so one asset costs the header, the serialized
// file's metadata, the AssetBundle container (to find the asset by name) and
// the block(s) holding the asset itself: a few hundred KB the first time,
// ~50 KB per further asset. Fetched blocks are kept in Cache Storage keyed by
// the hashed URL plus block index, so they never go stale.
//
// Assets are addressed by path id: these bundles' m_Container keys are hashes,
// not names, so finding a name would mean reading every object. The exporter
// (tools/web_export/scenes.py) records the ids; callers check m_Name.
//
// A single "bytes=a-b" Range is a CORS-safelisted header, so no preflight
// (the CDN 403s OPTIONS). Anything that answers with the whole file instead of
// a 206 (a proxy, an old browser) is handled by keeping that whole file.

import { readBundleHeader, type BundleHeader, type BundleNode } from "./bundle";
import { lz4Block } from "./lz4";
import { readSerializedFile, readObjectBytes, type ObjectInfo, type SerializedFile } from "./serialized";

const CACHE = "taimanin-blocks-v1";

function decompress(data: Uint8Array, size: number, flags: number): Uint8Array {
  switch (flags & 0x3f) {
    case 0: return data;
    case 2: case 3: return lz4Block(data, size);
    default: throw new Error(`unsupported block compression ${flags & 0x3f}`);
  }
}

export class RangeMissing extends Error {}

export class RangeBundle {
  private blocks = new Map<number, Promise<Uint8Array>>();
  private whole: Uint8Array | null;
  private sf!: SerializedFile;
  private node!: BundleNode;

  private constructor(readonly url: string, readonly header: BundleHeader, whole: Uint8Array | null) {
    this.whole = whole;
  }

  static async open(url: string): Promise<RangeBundle> {
    let header: BundleHeader | null = null;
    let whole: Uint8Array | null = null;
    for (const size of [65536, 1 << 20]) {
      const got = await getRange(url, 0, size);
      if (got.whole) whole = got.bytes;
      try {
        header = readBundleHeader(got.bytes, whole ? whole.length : Infinity);
        break;
      } catch (err) {
        if (whole || size === 1 << 20) throw err;
      }
    }
    const b = new RangeBundle(url, header!, whole);
    await b.init();
    return b;
  }

  private async init() {
    const node = this.header.nodes.find((n) => !n.path.endsWith(".resS") && !n.path.endsWith(".resource"));
    if (!node) throw new Error(`${this.url}: no serialized file`);
    this.node = node;
    // Serialized header: v22 keeps the real metadata size at byte 20 (u32 BE).
    const head = await this.data(node.offset, node.offset + 64);
    const v = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const version = v.getUint32(8);
    const metaSize = version >= 22 ? v.getUint32(20) : v.getUint32(0);
    const headerSize = version >= 22 ? 48 : 20;
    this.sf = readSerializedFile(await this.data(node.offset, node.offset + headerSize + metaSize));
  }

  has(pathId: string) { return this.sf.byId.has(pathId); }

  /** Bytes [start, end) of the uncompressed data stream. */
  async data(start: number, end: number): Promise<Uint8Array> {
    const want = this.header.blocks.map((b, i) => [b, i] as const)
      .filter(([b]) => b.dataOffset < end && b.dataOffset + b.uncompressedSize > start);
    // Fetch each run of not-yet-requested blocks with one request.
    const missing = want.filter(([, i]) => !this.blocks.has(i));
    for (let k = 0; k < missing.length;) {
      let j = k;
      while (j + 1 < missing.length && missing[j + 1][1] === missing[j][1] + 1) j++;
      const run = missing.slice(k, j + 1);
      const p = this.fetchRun(run.map(([b, i]) => ({ b, i })));
      run.forEach(([, i], n) => {
        const one = p.then((parts) => parts[n]);
        one.catch(() => this.blocks.delete(i));
        this.blocks.set(i, one);
      });
      k = j + 1;
    }
    const out = new Uint8Array(end - start);
    for (const [b, i] of want) {
      const data = await this.blocks.get(i)!;
      const from = Math.max(start, b.dataOffset);
      const to = Math.min(end, b.dataOffset + b.uncompressedSize);
      out.set(data.subarray(from - b.dataOffset, to - b.dataOffset), from - start);
    }
    return out;
  }

  private async fetchRun(run: { b: BundleHeader["blocks"][number]; i: number }[]): Promise<Uint8Array[]> {
    const cache = await openCache();
    const key = (i: number) => `${this.url}#block${i}`;
    const cached = await Promise.all(run.map(async ({ i }) => {
      const hit = await cache?.match(key(i)).catch(() => undefined);
      return hit ? new Uint8Array(await hit.arrayBuffer()) : null;
    }));
    let raw: Uint8Array | null = null;
    let base = 0;
    if (cached.some((c) => !c)) {
      const lo = run[0].b.fileOffset;
      const last = run[run.length - 1].b;
      const hi = last.fileOffset + last.compressedSize;
      if (this.whole) {
        raw = this.whole.subarray(lo, hi);
      } else {
        const got = await getRange(this.url, lo, hi);
        if (got.whole) { this.whole = got.bytes; raw = got.bytes.subarray(lo, hi); } else raw = got.bytes;
      }
      base = lo;
    }
    return Promise.all(run.map(async ({ b, i }, n) => {
      let comp = cached[n];
      if (!comp) {
        comp = raw!.slice(b.fileOffset - base, b.fileOffset - base + b.compressedSize);
        try { await cache?.put(key(i), new Response(comp as Uint8Array<ArrayBuffer>)); } catch { /* quota */ }
      }
      return decompress(comp, b.uncompressedSize, b.flags);
    }));
  }

  private async read<T>(o: ObjectInfo): Promise<T> {
    const bytes = await this.data(this.node.offset + o.byteStart, this.node.offset + o.byteStart + o.byteSize);
    return readObjectBytes<T>(this.sf, o, bytes);
  }

  async object<T = Record<string, any>>(pathId: string): Promise<T> {
    const o = this.sf.byId.get(pathId);
    if (!o) throw new RangeMissing(`${pathId} not in ${this.url}`);
    return this.read<T>(o);
  }

  /** A TextAsset, checked to be the one expected (ids can move between builds). */
  async text(pathId: string, name: string): Promise<string> {
    const t = await this.object<{ m_Name: string; m_Script: Uint8Array }>(pathId);
    if (t.m_Name.toLowerCase() !== name.toLowerCase()) throw new RangeMissing(`${pathId} is ${t.m_Name}, not ${name}`);
    return new TextDecoder().decode(t.m_Script);
  }

  /** An AudioClip's payload (Unity WebGL: AAC in MP4). */
  async audio(pathId: string, name: string): Promise<Uint8Array> {
    const a = await this.object<{ m_Name: string; m_Resource: { m_Source: string; m_Offset: number; m_Size: number } }>(pathId);
    if (a.m_Name.toLowerCase() !== name.toLowerCase()) throw new RangeMissing(`${pathId} is ${a.m_Name}, not ${name}`);
    const base = a.m_Resource.m_Source.split("/").pop()!;
    const n = this.header.nodes.find((x) => x.path === base || x.path.endsWith("/" + base));
    if (!n) throw new Error(`stream ${base} not in bundle`);
    return this.data(n.offset + a.m_Resource.m_Offset, n.offset + a.m_Resource.m_Offset + a.m_Resource.m_Size);
  }
}

async function openCache(): Promise<Cache | null> {
  try { return await caches.open(CACHE); } catch { return null; }
}

/** [start, end) of a file. `whole` when the server sent the entire file. */
async function getRange(url: string, start: number, end: number): Promise<{ bytes: Uint8Array; whole: boolean }> {
  let r: Response | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      r = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
      if (r.status < 500) break;
    } catch (err) {
      if (attempt === 3) throw err;
    }
    await new Promise((ok) => setTimeout(ok, 600 * attempt));
  }
  if (!r) throw new Error(`${url}: no response`);
  if (r.status === 403 || r.status === 404) throw new RangeMissing(url);
  if (r.status === 206) return { bytes: new Uint8Array(await r.arrayBuffer()), whole: false };
  if (r.ok) return { bytes: new Uint8Array(await r.arrayBuffer()), whole: true };
  throw new Error(`${r.status} ${url}`);
}
