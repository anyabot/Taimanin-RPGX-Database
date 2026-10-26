import { describe, it, expect, afterAll } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { RangeBundle } from "../src/unity/remote";
import { AssetBundle } from "../src/unity/assets";
import { ClassID } from "../src/unity/serialized";

// Range reads against a real aggregate bundle, served by a fake fetch that
// honours "Range: bytes=a-b" the way CloudFront does. Uses the exporter's
// download cache; skipped when it is not on this machine.
const DIRS = ["web_export", "adv"].map((d) => `D:/Download/Taimanin/taimanin_assets/bundles/${d}`);
const find = (stem: string) => {
  for (const dir of DIRS) {
    if (!existsSync(dir)) continue;
    const f = readdirSync(dir).find((n) => n.startsWith(stem + "_") && n.endsWith(".bundle"));
    if (f) return path.join(dir, f);
  }
  return null;
};
const scenario = find("r18_adv_assets_adv_scenario_r18");
const advAll = find("adv_assets_all");

const realFetch = globalThis.fetch;
let served = 0;
function serve(file: string) {
  const bytes = new Uint8Array(readFileSync(file));
  served = 0;
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range");
    const m = range && /^bytes=(\d+)-(\d+)$/.exec(range);
    if (!m) { served += bytes.length; return new Response(bytes, { status: 200 }); }
    const part = bytes.slice(Number(m[1]), Number(m[2]) + 1);
    served += part.length;
    return new Response(part, { status: 206 });
  }) as typeof fetch;
  return bytes;
}
afterAll(() => { globalThis.fetch = realFetch; });

describe.skipIf(!scenario)("RangeBundle", () => {
  it("reads one scenario script like the whole-file decoder, fetching a small part", async () => {
    const bytes = serve(scenario!);
    const rb = await RangeBundle.open("https://cdn.test/scenario.bundle");
    const ab = new AssetBundle(bytes);
    const e = ab.list([ClassID.TextAsset]).find((x) => x.name === "chr_0001_1_r18")!;
    expect(rb.has(e.pathId)).toBe(true);
    const text = await rb.text(e.pathId, "chr_0001_1_r18");
    expect(text).toContain("<VOICE_PLAY>chr_0001_1_0000_r18");
    expect(text).toBe(new TextDecoder().decode(ab.text(e.pathId)));
    await expect(rb.text(e.pathId, "chr_0001_2_r18")).rejects.toThrow(/not chr_0001_2_r18/);
    expect(served).toBeLessThan(bytes.length / 10);
    console.log(`script: ${served} of ${bytes.length} bytes fetched`);
  });

  it.skipIf(!advAll)("reads an ADV sound effect out of adv_assets_all", async () => {
    const bytes = serve(advAll!);
    const rb = await RangeBundle.open("https://cdn.test/adv_all.bundle");
    const ab = new AssetBundle(bytes);
    const e = ab.list([ClassID.AudioClip]).find((x) => x.name === "se066")!;
    const clip = await rb.audio(e.pathId, "se066");
    expect(clip).toEqual(ab.audio(e.pathId).bytes);
    console.log(`se066: ${clip.length} bytes, ${served} of ${bytes.length} fetched`);
  });
});
