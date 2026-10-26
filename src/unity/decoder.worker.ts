// Decoding runs off the main thread: LZ4 + BC7 on a 2048² page is ~100 ms.

import { AssetBundle, crop } from "./assets";
import { ClassID } from "./serialized";

export type WorkerRequest =
  | { id: number; op: "open"; key: string; bytes: Uint8Array }
  | { id: number; op: "list"; key: string }
  | { id: number; op: "texture"; key: string; pathId: string }
  | { id: number; op: "sprite"; key: string; pathId: string }
  | { id: number; op: "text"; key: string; pathId: string }
  | { id: number; op: "audio"; key: string; pathId: string }
  | { id: number; op: "close"; key: string };

const open = new Map<string, AssetBundle>();

function bundle(key: string) {
  const b = open.get(key);
  if (!b) throw new Error(`bundle ${key} not open`);
  return b;
}

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const req = ev.data;
  const reply = (result: unknown, transfer: Transferable[] = []) =>
    (self as unknown as Worker).postMessage({ id: req.id, result }, transfer);
  try {
    switch (req.op) {
      case "open": {
        open.set(req.key, new AssetBundle(req.bytes));
        return reply(true);
      }
      case "list": {
        const ab = bundle(req.key);
        return reply(ab.list([ClassID.Texture2D, ClassID.Sprite, ClassID.TextAsset, ClassID.AudioClip, ClassID.MonoBehaviour]));
      }
      case "texture": {
        const img = bundle(req.key).texture(req.pathId);
        return reply(img, [img.data.buffer]);
      }
      case "sprite": {
        const ab = bundle(req.key);
        const sp = ab.sprite(req.pathId);
        const tex = ab.texture(sp.texturePathId);
        const img = crop(tex, sp.textureRect);
        return reply({ ...sp, image: img }, [img.data.buffer]);
      }
      case "text": {
        const b = bundle(req.key).text(req.pathId);
        const copy = b.slice();
        return reply(copy, [copy.buffer]);
      }
      case "audio": {
        const a = bundle(req.key).audio(req.pathId);
        const copy = a.bytes.slice();
        return reply({ bytes: copy, format: a.format }, [copy.buffer]);
      }
      case "close": {
        open.delete(req.key);
        return reply(true);
      }
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: req.id, error: String(err) });
  }
};
