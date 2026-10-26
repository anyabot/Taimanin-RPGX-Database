// Screenshots the data pages in headless Chrome into test/e2e/out/pages/.
//   npx vite --port 5173   (in another shell)
//   node test/e2e/pages.mjs [unitId]
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launch, waitFor } from "./cdp.mjs";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "out", "pages");
const SITE = process.env.SITE || "http://localhost:5173";
const UNIT = process.argv[2] || "00778";

const cdp = await launch();
const report = [];
const step = async (name, fn, fullPage = true) => {
  const t0 = Date.now();
  try {
    const info = await fn();
    await cdp.shot(path.join(OUT, `${name}.png`), fullPage);
    report.push(`ok   ${name} (${Date.now() - t0} ms)${info ? " " + JSON.stringify(info) : ""}`);
  } catch (e) {
    report.push(`FAIL ${name}: ${e.message}`);
  }
  console.log(report[report.length - 1]);
};
const noHScroll = () => cdp.eval(`return document.documentElement.scrollWidth <= window.innerWidth + 1`);

await cdp.viewport(1300, 900);
// pass the age gate once (it remembers the answer in localStorage)
await cdp.goto(`${SITE}/`, `!!document.querySelector(".age-gate, .app")`);
await cdp.eval(`localStorage.setItem("taimanin.adult", "1")`);
await cdp.send("Page.reload");
await waitFor(() => cdp.eval(`return !!document.querySelector(".app")`), 30000, "app after age gate");
await step("units", async () => {
  await cdp.goto(`${SITE}/#/units`, `document.querySelectorAll(".unit-card").length > 0`);
  await waitFor(() => cdp.eval(`return [...document.querySelectorAll(".unit-card img")].slice(0, 12).every(i => i.complete && i.naturalWidth > 0)`), 20000, "icons");
  return { cards: await cdp.eval(`return document.querySelectorAll(".unit-card").length`), count: await cdp.eval(`return document.body.innerText.match(/\\d+ \\/ \\d+/)?.[0]`) };
});
await step("units-filtered", async () => {
  await cdp.goto(`${SITE}/#/units?rarity=6&element=Superhuman&q=akiyama&f=1`, `document.querySelectorAll(".unit-card").length > 0 || /No units match/.test(document.body.innerText)`);
  return { cards: await cdp.eval(`return document.querySelectorAll(".unit-card").length`) };
});
for (const tab of ["stats", "skills", "leader", "voices", "obtain", "profile", "scenes"]) {
  await step(`unit-${UNIT}-${tab}`, async () => {
    await cdp.goto(`${SITE}/#/units/${UNIT}?tab=${tab}`, `!!document.querySelector(".unit-page [role=tabpanel], .unit-page .hub-panel, .unit-page section")`);
    await waitFor(() => cdp.eval(`return document.querySelector(".unit-page").innerText.length > 200`), 10000, "content");
  });
}
await step(`unit-${UNIT}-related`, async () => {
  await cdp.goto(`${SITE}/#/units/${UNIT}`, `document.querySelectorAll(".related-unit").length > 0`, 15000);
  const first = await cdp.eval(`const a = document.querySelector(".related-unit"); const href = a.getAttribute("href"); a.click(); return href`);
  await waitFor(() => cdp.eval(`return location.hash === ${JSON.stringify(first)} && !!document.querySelector(".unit-page h1")`), 10000, "related navigation");
  await cdp.goto(`${SITE}/#/units/${UNIT}`, `document.querySelectorAll(".related-unit").length > 0`, 15000);
  return { related: await cdp.eval(`return document.querySelectorAll(".related-unit").length`), first };
});
await step(`unit-${UNIT}-voice-play`, async () => {
  await cdp.goto(`${SITE}/#/units/${UNIT}?tab=voices`, `!!document.querySelector(".voice-play:not([disabled])")`);
  // fetch the first clip the way the button does and confirm it decodes as audio
  return cdp.eval(`
    const btn = document.querySelector(".voice-play:not([disabled])");
    btn.click();
    await new Promise(r => setTimeout(r, 2500));
    const a = [...document.querySelectorAll("audio")];
    return { label: btn.getAttribute("aria-label"), stillPlayingIcon: btn.textContent };`);
});
await step(`unit-${UNIT}-art`, async () => {
  await cdp.goto(`${SITE}/#/units/${UNIT}?tab=art`, `document.querySelectorAll(".art-canvas").length > 0`);
  await waitFor(() => cdp.eval(`return [...document.querySelectorAll(".art-item")].every(f => !f.querySelector("figcaption:not(.art-actions)"))`), 120000, "art decode");
  return cdp.eval(`return [...document.querySelectorAll(".art-canvas")].map(c => c.width + "x" + c.height)`);
});
await step(`unit-${UNIT}-gallery`, async () => {
  await cdp.goto(`${SITE}/#/units/${UNIT}?tab=art`, `document.querySelectorAll(".art-canvas.art-ready").length > 0`, 120000);
  await cdp.eval(`document.querySelector(".art-canvas.art-ready").click()`);
  const opened = await waitFor(() => cdp.eval(`const img = document.querySelector(".hub-lightbox .hub-lightbox__img"); return img && img.complete && img.naturalWidth ? img.naturalWidth + "x" + img.naturalHeight : ""`), 15000, "lightbox");
  const next = await cdp.eval(`const b = [...document.querySelectorAll(".hub-lightbox button")].find(b => /next/i.test(b.getAttribute("aria-label") || b.textContent)); if (b) b.click(); await new Promise(r => setTimeout(r, 500)); return document.querySelector(".hub-lightbox .hub-lightbox__img")?.naturalWidth || 0`);
  return { opened, nextWidth: next };
});
await step("buffs", async () => {
  await cdp.goto(`${SITE}/#/buffs`, `document.querySelectorAll(".buff-table tbody tr").length > 0`);
  return { rows: await cdp.eval(`return document.querySelectorAll(".buff-table tbody tr").length`), first: await cdp.eval(`return document.querySelector(".buff-table tbody tr")?.innerText.replace(/\s+/g, " ").slice(0, 80)`) };
}, false);
await step("buffs-receiver-faction", async () => {
  await cdp.goto(`${SITE}/#/buffs?cat=stat&k=Crit%20rate&to=tr:Taimanin`, `document.querySelectorAll(".buff-table tbody tr").length > 0`);
  const targets = await cdp.eval(`return [...new Set([...document.querySelectorAll(".buff-target")].map(td => td.firstChild.textContent))]`);
  if (targets.join() !== "Taimanin allies") throw new Error("receiver filter leaked: " + targets.join());
  return { rows: await cdp.eval(`return document.querySelectorAll(".buff-table tbody tr").length`), noHScroll: await noHScroll() };
}, false);
await step("buffs-split-and-upcoming", async () => {
  // "All allies: ATK +75% (Spiritual allies: +105%)" must rank under Spiritual with its faction value
  await cdp.goto(`${SITE}/#/buffs?cat=stat&k=ATK&to=el:Spiritual`, `document.querySelectorAll(".buff-table tbody tr").length > 0`);
  const split = await cdp.eval(`return [...document.querySelectorAll(".buff-target")].some(td => /all allies \+/.test(td.innerText))`);
  if (!split) throw new Error("no split all-allies/faction row under Spiritual");
  const count = () => cdp.eval(`return [...document.querySelectorAll(".hub-filter-chip, button")].find(b => /Include upcoming/.test(b.textContent))?.getAttribute("aria-pressed") ?? "missing"`);
  const before = await count();
  await cdp.goto(`${SITE}/#/buffs?upcoming=1`, `document.querySelectorAll(".buff-table tbody tr").length > 0`);
  return { split, upcomingChipPressed: [before, await count()] };
}, false);
await step("story", async () => {
  await cdp.goto(`${SITE}/#/story?section=event`, `document.querySelectorAll(".story-card").length > 0`);
  return { cards: await cdp.eval(`return document.querySelectorAll(".story-card").length`), noHScroll: await noHScroll() };
}, false);
await step("story-battles", async () => {
  await cdp.goto(`${SITE}/#/story/battles/er004`, `document.querySelectorAll(".enemy-card").length > 0`);
  await waitFor(() => cdp.eval(`return document.querySelectorAll(".enemy-icon img").length > 0`), 30000, "enemy icons");
  return { bosses: await cdp.eval(`return document.querySelectorAll(".enemy-card").length`), noHScroll: await noHScroll() };
}, false);
await step("runes", async () => {
  await cdp.goto(`${SITE}/#/runes`, `document.querySelectorAll(".rune-sets > *").length > 0`);
  await cdp.eval(`document.querySelectorAll(".rune-sets details").forEach((d, i) => { if (i < 2) d.open = true })`);
  return { sets: await cdp.eval(`return document.querySelectorAll(".rune-sets > *").length`) };
}, false);

await cdp.viewport(390, 844, true);
for (const [name, url, ready] of [
  ["phone-units", `/#/units`, `document.querySelectorAll(".unit-card").length > 0`],
  [`phone-unit-${UNIT}-skills`, `/#/units/${UNIT}?tab=skills`, `document.querySelector(".unit-page")?.innerText.length > 200`],
  [`phone-unit-${UNIT}-voices`, `/#/units/${UNIT}?tab=voices`, `document.querySelector(".unit-page")?.innerText.length > 200`],
  ["phone-buffs", `/#/buffs?cat=debuff`, `document.querySelectorAll(".buff-table tbody tr").length > 0`],
  ["phone-battles", `/#/story/battles/es001`, `document.querySelectorAll(".enemy-chip").length > 0`],
  ["phone-story", `/#/story`, `document.querySelectorAll(".story-card").length > 0`],
  ["phone-runes", `/#/runes`, `document.querySelectorAll(".rune-sets > *").length > 0`],
]) {
  await step(name, async () => {
    await cdp.goto(SITE + url, ready);
    if (!(await noHScroll())) throw new Error("horizontal page scroll at 390px");
  }, !name.includes("runes"));
}

const problems = [...new Set(cdp.problems)];
console.log(problems.length ? "page errors:\n  " + problems.join("\n  ") : "no page errors");
process.exit(report.some((r) => r.startsWith("FAIL")) || problems.length ? 1 : 0);
