// Main-thread facade over the decoder worker plus the CDN catalog.

import type { AssetEntry, Rect } from "./assets";
import type { RGBAImage } from "./texture";
import { Catalog, type CatalogSnapshot } from "./catalog";
import { fetchBundle } from "./fetch";
import type { WorkerRequest } from "./decoder.worker";
import { RangeBundle, RangeMissing } from "./remote";

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };
type DistributiveOmit<T, K extends keyof any> = T extends unknown ? Omit<T, K> : never;

export interface SpriteResult {
  name: string;
  rect: Rect;
  textureRect: Rect;
  textureRectOffset: { x: number; y: number };
  pivot: { x: number; y: number };
  image: RGBAImage;
}

class Decoder {
  private worker = new Worker(new URL("./decoder.worker.ts", import.meta.url), { type: "module" });
  private seq = 0;
  private pending = new Map<number, Pending>();

  constructor() {
    this.worker.onmessage = (ev) => {
      const { id, result, error } = ev.data;
      const p = this.pending.get(id);
      if (!p) return;
      this.pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve(result);
    };
  }

  call<T>(req: DistributiveOmit<WorkerRequest, "id">, transfer: Transferable[] = []): Promise<T> {
    const id = ++this.seq;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...req, id }, transfer);
    });
  }
}

export class Assets {
  readonly catalog: Catalog;
  private decoder = new Decoder();
  private opening = new Map<string, Promise<void>>();
  private remotes = new Map<string, Promise<RangeBundle>>();

  constructor(snapshot: CatalogSnapshot) {
    this.catalog = new Catalog(snapshot);
  }

  static async load(base = import.meta.env.BASE_URL): Promise<Assets> {
    const r = await fetch(`${base}data/bundles.json`);
    if (!r.ok) throw new Error(`bundles.json: ${r.status}`);
    return new Assets(await r.json());
  }

  /** Download (or take from cache) and parse a bundle in the worker. */
  open(stem: string, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    let p = this.opening.get(stem);
    if (!p) {
      p = fetchBundle(this.catalog, stem, onProgress).then((bytes) =>
        this.decoder.call<boolean>({ op: "open", key: stem, bytes }, [bytes.buffer]).then(() => undefined));
      p.catch(() => this.opening.delete(stem));
      this.opening.set(stem, p);
    }
    return p;
  }

  /** A big bundle read in pieces (remote.ts). Same stale-hash recovery as
   *  fetchBundle: a 403 re-checks the catalogs once. */
  remote(stem: string): Promise<RangeBundle> {
    let p = this.remotes.get(stem);
    if (!p) {
      p = (async () => {
        const url = this.catalog.url(stem);
        if (url) {
          try { return await RangeBundle.open(url); } catch (err) { if (!(err instanceof RangeMissing)) throw err; }
        }
        await this.catalog.refresh(true);
        const fresh = this.catalog.url(stem);
        if (!fresh || fresh === url) throw new RangeMissing(`bundle ${stem} is not on the CDN`);
        return RangeBundle.open(fresh);
      })();
      p.catch(() => this.remotes.delete(stem));
      this.remotes.set(stem, p);
    }
    return p;
  }

  async list(stem: string) {
    await this.open(stem);
    return this.decoder.call<AssetEntry[]>({ op: "list", key: stem });
  }

  async texture(stem: string, pathId: string) {
    await this.open(stem);
    return this.decoder.call<RGBAImage>({ op: "texture", key: stem, pathId });
  }

  async sprite(stem: string, pathId: string) {
    await this.open(stem);
    return this.decoder.call<SpriteResult>({ op: "sprite", key: stem, pathId });
  }

  async text(stem: string, pathId: string) {
    await this.open(stem);
    return this.decoder.call<Uint8Array>({ op: "text", key: stem, pathId });
  }

  async audio(stem: string, pathId: string) {
    await this.open(stem);
    return this.decoder.call<{ bytes: Uint8Array; format: number }>({ op: "audio", key: stem, pathId });
  }

  close(stem: string) {
    this.opening.delete(stem);
    return this.decoder.call<boolean>({ op: "close", key: stem });
  }
}

export function toImageData(img: RGBAImage) {
  return new ImageData(new Uint8ClampedArray(img.data.buffer as ArrayBuffer, img.data.byteOffset, img.data.length), img.width, img.height);
}
