// Plays unit scenes in headless Chrome and screenshots beats into
// test/e2e/out/scenes/. Run against the built site so assets come straight
// from the game CDN (Range reads included), not the dev proxy:
//   npm run build && npx vite preview --port 4173
//   SITE=http://localhost:4173 node test/e2e/scene.mjs [scene unit beats...]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, waitFor } from "./cdp.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", "scenes");
const SITE = process.env.SITE || "http://localhost:4173";
const CASES = process.argv[2]
  ? [{ scene: process.argv[2], unit: process.argv[3] || "", beats: process.argv.slice(4).map(Number) }]
  : [
    { scene: "chr_0001_1_r18", unit: "00001", beats: [0, 12, 40] },     // CG stack over a base frame
    { scene: "chr_5005_2_r18", unit: "", beats: [20, 45, 70] },         // overlays kept over their base
    { scene: "chr_0006_1_r18", unit: "", beats: [0, 5, 10] },           // actors
    { scene: "chr_5006_3_r18", unit: "", beats: [40, 90, 140] },        // Spine, variants _01.._05
    { scene: "chr_1075_3_r18", unit: "", beats: [40, 90] },             // Spine on another unit's atlas
    { scene: "chr_5007_3_r18", unit: "", beats: [40, 90, 140] },        // Spine variants named like the atlas
  ];

const cdp = await launch();
await cdp.viewport(1300, 900);
await cdp.goto(`${SITE}/`, `!!document.querySelector(".age-gate, .app")`);
await cdp.eval(`localStorage.setItem("taimanin.adult", "1")`);
await cdp.send("Page.reload");
await waitFor(() => cdp.eval(`return !!document.querySelector(".app")`), 30000, "app after age gate");
let bytes = 0, ranged = 0, full = 0;
const cdnIds = new Set();
cdp.listeners.push(({ method, params }) => {
  if (method === "Network.responseReceived" && /cloudfront/.test(params.response.url)) {
    cdnIds.add(params.requestId);
    if (params.response.status === 206) ranged++; else full++;
  }
  if (method === "Network.loadingFinished" && cdnIds.has(params.requestId)) bytes += params.encodedDataLength || 0;
});

let failed = 0;
for (const c of CASES) {
  const t0 = Date.now();
  try {
    await cdp.goto(`${SITE}/#/scenes/${c.scene}${c.unit ? `?unit=${c.unit}` : ""}`, `!!document.querySelector(".app")`);
    await waitFor(() => cdp.eval(`return !!document.querySelector(".adv-stage") || /error|not/i.test(document.querySelector(".scene-page")?.innerText || "")`), 60000, "stage");
    const loaded = Date.now() - t0;
    for (const beat of c.beats) {
      await cdp.eval(`const r = document.querySelector(".adv-controls input[type=range]");
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        set.call(r, ${beat}); r.dispatchEvent(new Event("input", { bubbles: true })); return true`);
      await waitFor(() => cdp.eval(`return !document.querySelector(".adv-busy") && !/Loading animation/.test(document.querySelector(".adv-stage")?.innerText || "")`), 90000, `beat ${beat}`);
      await new Promise((r) => setTimeout(r, 400));
      const info = await cdp.eval(`const s = document.querySelector(".adv-stage");
        const sp = s.querySelector(".adv-spine");
        return { imgs: [...s.querySelectorAll("img")].map(i => i.className + ":" + (i.naturalWidth > 0)),
          spine: sp && !sp.hidden ? "shown" : "-", note: s.querySelector(".adv-note")?.innerText || "",
          text: (document.querySelector(".adv-line")?.innerText || "").slice(0, 30), count: document.querySelector(".adv-count")?.innerText,
          missing: document.querySelector(".scene-player > p.small")?.innerText || "" }`);
      await cdp.shot(path.join(OUT, `${c.scene}_${beat}.png`), false);
      console.log(`ok   ${c.scene} beat ${beat} (script ready in ${loaded} ms)`, JSON.stringify(info));
    }
  } catch (e) {
    failed++;
    console.log(`FAIL ${c.scene}: ${e.message}`, await cdp.eval(`return document.querySelector(".scene-page")?.innerText.slice(0, 300)`).catch(() => ""));
  }
}
console.log(`CDN responses: ${ranged} ranged (206), ${full} whole; ${(bytes / 1048576).toFixed(1)} MB`);
if (cdp.problems.length) console.log("page problems:", [...new Set(cdp.problems)].slice(0, 15));
process.exit(failed ? 1 : 0);
