import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { AssetBundle } from "../src/unity/assets";

// Golden hashes come from UnityPy via D:\Download\Taimanin\tools\web_export\golden.py.
const dir = path.resolve(__dirname, "golden");
const golden: any[] = existsSync(path.join(dir, "golden.json"))
  ? JSON.parse(readFileSync(path.join(dir, "golden.json"), "utf8"))
  : [];
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe.skipIf(!golden.length)("decoder matches UnityPy", () => {
  for (const sample of golden) {
    describe(sample.file.slice(0, 70), () => {
      const load = () => new AssetBundle(new Uint8Array(readFileSync(path.join(dir, "bundles", sample.file))));
      let ab: AssetBundle;
      it("parses", () => { ab = load(); expect(ab.files.length).toBeGreaterThan(0); });
      for (const t of sample.textures) {
        it(`texture ${t.name} fmt ${t.format} ${t.width}x${t.height}`, () => {
          const img = ab.texture(t.pathId);
          expect([img.width, img.height]).toEqual([t.width, t.height]);
          expect(sha(new Uint8Array(img.data.buffer))).toBe(t.rgba);
        });
      }
      for (const s of sample.sprites) {
        it(`sprite ${s.name}`, () => {
          const sp = ab.sprite(s.pathId);
          expect(sp.texturePathId).toBe(s.texture);
          expect([sp.rect.x, sp.rect.y, sp.rect.width, sp.rect.height]).toEqual(s.rect);
        });
      }
      for (const t of sample.texts) {
        it(`text ${t.name}`, () => expect(sha(ab.text(t.pathId))).toBe(t.bytes));
      }
      for (const a of sample.audio) {
        it(`audio ${a.name}`, () => expect(sha(ab.audio(a.pathId).bytes)).toBe(a.bytes));
      }
    });
  }
});
