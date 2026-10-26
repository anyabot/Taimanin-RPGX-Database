// Asset-level reads over a decoded bundle: textures, sprites, text, audio.

import { readBundle, type Bundle } from "./bundle";
import { readSerializedFile, readObject, peekName, ClassID, type SerializedFile, type ObjectInfo } from "./serialized";
import { decodeTexture, type RGBAImage } from "./texture";

export interface Rect { x: number; y: number; width: number; height: number }
interface PPtr { m_FileID: number; m_PathID: string }

export interface AssetEntry {
  name: string;
  classId: number;
  pathId: string;
}

export class AssetBundle {
  bundle: Bundle;
  files: SerializedFile[] = [];

  constructor(bytes: Uint8Array) {
    this.bundle = readBundle(bytes);
    for (const [path, data] of this.bundle.files) {
      if (path.endsWith(".resS") || path.endsWith(".resource")) continue;
      this.files.push(readSerializedFile(data));
    }
  }

  private find(pathId: string): [SerializedFile, ObjectInfo] {
    for (const sf of this.files) {
      const o = sf.byId.get(pathId);
      if (o) return [sf, o];
    }
    throw new Error(`object ${pathId} not in bundle`);
  }

  read<T = Record<string, any>>(pathId: string): T {
    const [sf, o] = this.find(pathId);
    return readObject<T>(sf, o);
  }

  /** Named assets of the given classes, without reading their bodies. */
  list(classes: number[] = [ClassID.Texture2D, ClassID.Sprite, ClassID.TextAsset, ClassID.AudioClip]): AssetEntry[] {
    const out: AssetEntry[] = [];
    for (const sf of this.files) {
      for (const o of sf.objects) {
        if (!classes.includes(o.classId)) continue;
        out.push({ name: peekName(sf, o) ?? "", classId: o.classId, pathId: o.pathId });
      }
    }
    return out;
  }

  byName(name: string, classId?: number): AssetEntry | undefined {
    return this.list(classId ? [classId] : undefined).find((e) => e.name === name);
  }

  /** Bytes from a .resS/.resource stream ("archive:/CAB-x/CAB-x.resS"). */
  private stream(path: string, offset: number, size: number): Uint8Array {
    const base = path.split("/").pop()!;
    for (const [p, data] of this.bundle.files) {
      if (p === base || p.endsWith("/" + base)) return data.subarray(offset, offset + size);
    }
    throw new Error(`stream ${path} not in bundle`);
  }

  texture(pathId: string): RGBAImage {
    const t = this.read(pathId);
    let data: Uint8Array = t["image data"];
    const sd = t.m_StreamData;
    if ((!data || data.length === 0) && sd?.path) data = this.stream(sd.path, sd.offset, sd.size);
    return decodeTexture(data, t.m_Width, t.m_Height, t.m_TextureFormat);
  }

  /** A sprite's texture, its logical rect (m_Rect) and its packed rect in the
   *  texture (m_RD.textureRect). Rects are Unity bottom-left based. */
  sprite(pathId: string) {
    const s = this.read(pathId);
    const tex: PPtr = s.m_RD.texture;
    return {
      name: s.m_Name as string,
      texturePathId: tex.m_PathID,
      rect: s.m_Rect as Rect,
      textureRect: s.m_RD.textureRect as Rect,
      textureRectOffset: s.m_RD.textureRectOffset as { x: number; y: number },
      pivot: s.m_Pivot as { x: number; y: number },
    };
  }

  text(pathId: string): Uint8Array {
    return this.read(pathId).m_Script;
  }

  /** AudioClip payload; Unity's AAC clips are a plain MP4 container. */
  audio(pathId: string): { bytes: Uint8Array; format: number } {
    const a = this.read(pathId);
    const r = a.m_Resource;
    return { bytes: this.stream(r.m_Source, r.m_Offset, r.m_Size), format: a.m_CompressionFormat };
  }
}

/** Cut a rect (Unity bottom-left origin) out of a top-down RGBA image. */
export function crop(img: RGBAImage, r: Rect): RGBAImage {
  const x0 = Math.round(r.x);
  const w = Math.round(r.width);
  const h = Math.round(r.height);
  const yTop = img.height - Math.round(r.y) - h;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((yTop + y) * img.width + x0) * 4;
    out.set(img.data.subarray(src, src + w * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}
