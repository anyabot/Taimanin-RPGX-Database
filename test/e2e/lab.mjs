// Drives the decoder lab in real headless Chrome (fresh profile = cold cache)
// over CDP and screenshots each decoded asset into test/e2e/out/.
//   npx vite --port 5173   (in another shell)
//   node test/e2e/lab.mjs [stem=entryRegex ...]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const SITE = process.env.SITE || "http://localhost:5173";
const CDP_PORT = 9334;
const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => fs.existsSync(p));

const CASES = process.argv.slice(2).length
  ? process.argv.slice(2).map((a) => a.split("="))
  : [
      ["spine_assets_chr_0010", "^Texture2D · Cut_Chr_0010$"], // BC7 2048²
      ["adv_ev_assets_adv_ev_kgk_ev018a.png", "^Texture2D"], // DXT1
      ["r18_image_chr_ldiff_assets_image_chr_ldiff_uni_00067_r18_l_2.png", "^Texture2D"], // ETC2 RGB
      ["adv_chr_assets_adv_chr_ts_m445", "^Sprite"], // ETC2 RGBA8 sprite
      ["spine_assets_chr_0010", "^TextAsset · .*\\.atlas"],
      ["adv_bgm_assets_adv_bgm_bgm098.ogg", "^AudioClip"],
    ];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms, label) {
  const end = Date.now() + ms;
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch { /* retry */ }
    if (Date.now() > end) throw new Error("timed out waiting for " + label);
    await sleep(250);
  }
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) for (const fn of this.listeners) fn(msg);
    });
  }
  static async connect(url) {
    const ws = new WebSocket(url);
    await new Promise((res, rej) => { ws.addEventListener("open", res, { once: true }); ws.addEventListener("error", rej, { once: true }); });
    return new CDP(ws);
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("page: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
}

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tmlab-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--disable-extensions", "--mute-audio",
  "--window-size=1400,1000", "about:blank",
], { stdio: "ignore" });
process.on("exit", () => { try { chrome.kill("SIGKILL"); } catch {} });

fs.mkdirSync(OUT, { recursive: true });
const targets = await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json(), 30000, "chrome");
const cdp = await CDP.connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
const problems = [];
cdp.listeners.push((m) => {
  if (m.method === "Runtime.exceptionThrown") problems.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") problems.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
});
await cdp.send("Runtime.enable");
await cdp.send("Page.enable");
await cdp.send("Page.navigate", { url: `${SITE}/lab` });
await waitFor(() => cdp.eval(`return document.body.innerText.includes("live bundles known")`), 60000, "catalog snapshot");

// The built site talks to CloudFront directly; prove CORS from a page origin.
const direct = await cdp.eval(`const r = await fetch("https://dntgnyxcho2sk.cloudfront.net/asset_bundles/WebGL/LIVE/catalog_rpgx.hash"); return r.status + " " + (await r.text()).trim()`);
console.log("direct CDN fetch from page:", direct);

await cdp.eval(`[...document.querySelectorAll("button")].find(b => b.textContent.includes("Check for game update")).click()`);
const events = await waitFor(() => cdp.eval(`const t = document.querySelector(".lab-events")?.innerText || ""; const lines = t.split("\\n").filter(Boolean); return lines.filter(l => !/downloading/.test(l)).length >= 4 ? t : ""`), 180000, "catalog check");
console.log("catalog check:\n  " + events.split("\n").join("\n  "));

const setQuery = (q) => cdp.eval(`
  const el = document.querySelector(".lab .hub-input");
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(q)});
  el.dispatchEvent(new Event("input", { bubbles: true }));`);

let n = 0;
for (const [stem, entryRe] of CASES) {
  n++;
  const t0 = Date.now();
  await setQuery(stem);
  await waitFor(() => cdp.eval(`const b = [...document.querySelectorAll(".lab-list button")].find(b => b.textContent === ${JSON.stringify(stem)}); if (b) { b.click(); return true }`), 10000, `stem ${stem}`);
  await waitFor(() => cdp.eval(`return (/opened in/.test(document.body.innerText) && document.querySelectorAll(".lab-list")[1]?.children.length > 0) || document.querySelector(".lab-error")?.innerText`), 180000, `open ${stem}`);
  const err = await cdp.eval(`return document.querySelector(".lab-error")?.innerText || ""`);
  if (err) { console.log(`FAIL ${stem}: ${err}`); problems.push(err); continue; }
  const picked = await cdp.eval(`const re = new RegExp(${JSON.stringify(entryRe)}); const b = [...document.querySelectorAll(".lab-list")[1].querySelectorAll("button")].find(b => re.test(b.textContent)); if (!b) return ""; b.click(); return b.textContent`);
  if (!picked) { console.log(`FAIL ${stem}: no entry ${entryRe}`); problems.push(`no entry ${entryRe}`); continue; }
  const note = await waitFor(() => cdp.eval(`const p = [...document.querySelectorAll(".lab > p")].find(p => / decoded in |rect |bytes/.test(p.innerText)); return p?.innerText || document.querySelector(".lab-error")?.innerText`), 120000, `decode ${picked}`);
  const stats = await cdp.eval(`
    const c = document.querySelector(".lab-canvas");
    if (!c) return { kind: document.querySelector("audio") ? "audio" : "text" };
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let opaque = 0, sum = 0;
    for (let i = 3; i < d.length; i += 4) { if (d[i]) { opaque++; sum += d[i-3] + d[i-2] + d[i-1]; } }
    return { kind: "image", w: c.width, h: c.height, opaquePct: +(100 * opaque / (d.length / 4)).toFixed(1), meanRGB: opaque ? Math.round(sum / opaque / 3) : 0 };`);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = path.join(OUT, `${String(n).padStart(2, "0")}_${stem.slice(0, 60)}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
  console.log(`ok ${picked} | ${note} | ${JSON.stringify(stats)} | ${Date.now() - t0} ms -> ${path.basename(file)}`);
}
console.log(problems.length ? "page errors:\n  " + problems.join("\n  ") : "no page errors");
process.exit(problems.length ? 1 : 0);
