// `vite build` only: writes a static HTML file per page (dist/units/00001.html is
// served at /units/00001) with its own title, description, canonical, Open
// Graph tags and a plain-HTML summary inside #root, which React replaces on
// load. Crawlers and link previews that don't run JavaScript see the page, not
// an empty shell. Also writes sitemap.xml and robots.txt.
//
// Scenes, story parts and their transcripts get no file: Cloudflare Pages caps
// a deployment at 20,000 files and there are ~8,000 of them. They are served
// by the SPA fallback (index.html), set their meta at runtime and are listed
// in the sitemap.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { countFiles, renderStatic, writeRobots, writeSitemap } from "@altterisk/game-hub/build";
import { escapeHtml as esc } from "@altterisk/game-hub/meta";
import type { ArenaCard, Item, ItemIndexEntry, QuestSection, StorySection, Text, Unit, UnitIndexEntry } from "./src/data";
import {
  DEFAULT_META, EVENT_KINDS, LIST_META, SITE_NAME, SITE_URL, canonicalUrl, cardMeta, eventMeta, eventName,
  itemMeta, partName, personMeta, questMeta, site, sitePath, storyBattlesMeta, storyGroupName, unitDisplayName, unitMeta, type PageMeta,
} from "./src/meta";
import { ROLE_LABEL, gatherPeople, personHref } from "./src/people";

/** Cloudflare Pages' limit is 20,000; warn while there is still room. */
const FILE_BUDGET = 19_000;

type Crumb = [label: string, path: string];
interface Page {
  path: string;
  meta: PageMeta;
  crumbs?: Crumb[];
  /** HTML after the description */
  body?: string;
}

const en = (t: Text | null | undefined) => t?.en || t?.ja || "";
const a = (href: string, label: string) => `<a href="${esc(sitePath(href.split("?")[0]) + (href.includes("?") ? href.slice(href.indexOf("?")) : ""))}">${esc(label)}</a>`;
const ul = (items: string[]) => (items.length ? `<ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
const section = (title: string, html: string) => (html ? `<h2>${esc(title)}</h2>${html}` : "");

function pages(data: string): { files: Page[]; extra: string[] } {
  const read = <T,>(name: string): T => JSON.parse(fs.readFileSync(path.join(data, `${name}.json`), "utf8"));
  const units = read<UnitIndexEntry[]>("units/index");
  const cards = read<ArenaCard[]>("cards");
  const items = read<ItemIndexEntry[]>("items/index");
  const stories = read<StorySection[]>("stories/index");
  const quests = read<QuestSection[]>("quests/index");
  const people = [...gatherPeople(units, cards).values()];
  const unitLink = (u: UnitIndexEntry) => a(`/units/${u.id}`, [unitDisplayName(u), en(u.title)].filter(Boolean).join(" "));
  const files: Page[] = [];
  const list = (p: string, body: string) => files.push({ path: p, meta: LIST_META[p], crumbs: [[LIST_META[p].title, p]], body });

  files.push({ path: "/", meta: DEFAULT_META, body: ul(Object.entries(LIST_META).filter(([p]) => p !== "/").map(([p, m]) => a(p, m.title))) });
  for (const p of ["/banners", "/gacha", "/buffs", "/statuses", "/runes"]) list(p, "");

  list("/units", ul(units.map(unitLink)));
  for (const u of units) {
    const full: Unit = read(`units/${u.id}`);
    const skills = Object.values(full.skills).map((s) => en(s.name)).filter(Boolean);
    files.push({
      path: `/units/${u.id}`, meta: unitMeta(u), crumbs: [["Units", "/units"], [unitDisplayName(u), `/units/${u.id}`]],
      body: [
        full.profile && `<p>${esc(en(full.profile))}</p>`,
        section("Skills", ul(skills.map(esc))),
        full.leader?.name && section("Leader skill", `<p>${esc(en(full.leader.name))}</p>`),
        section("Scenes", ul(full.scenes.flat().map((s) => a(`/scenes/${s}?unit=${u.id}`, s)))),
        section("Credits", ul([
          ...(u.illustrator ? [`Art: ${a(personHref("artist", u.illustrator), u.illustrator)}`] : []),
          ...(u.voiceActor ? [`CV: ${a(personHref("cv", u.voiceActor), u.voiceActor)}`] : []),
        ])),
      ].filter(Boolean).join(""),
    });
  }

  list("/cards", ul(cards.map((c) => a(`/cards/${c.id}`, [en(c.name) || c.id, en(c.title)].filter(Boolean).join(" ")))));
  for (const c of cards) {
    files.push({
      path: `/cards/${c.id}`, meta: cardMeta(c), crumbs: [["Arena cards", "/cards"], [en(c.name) || c.id, `/cards/${c.id}`]],
      body: section("Scenes", ul(c.scenes.map((s) => a(`/scenes/${s}`, s)))),
    });
  }

  list("/items", ul(items.map((i) => a(`/items/${i.id}`, en(i.name) || i.id))));
  for (const i of items) {
    const full: Item = read(`items/${i.id}`);
    files.push({
      path: `/items/${i.id}`, meta: itemMeta(full), crumbs: [["Items", "/items"], [en(full.name) || i.id, `/items/${i.id}`]],
      body: section("Found in", ul((full.sources ?? []).filter((s) => s.page).map((s) => a(`/${s.page}`, en(s.title) || s.page!)))),
    });
  }

  const events = stories.filter((s) => s.key in EVENT_KINDS)
    .flatMap((s) => s.groups.filter((g) => s.key !== "special" || g.period).map((g) => ({ g, kind: s.key })));
  list("/events", ul(events.map((e) => a(`/events/${e.g.id}`, eventName(e.g, e.kind)))));
  for (const { g, kind } of events) {
    files.push({
      path: `/events/${g.id}`, meta: eventMeta(g, kind), crumbs: [["Events", "/events"], [eventName(g, kind), `/events/${g.id}`]],
      body: [
        g.battles && `<p>${a(`/story/battles/${g.id}`, "Battles, enemies and bosses")}</p>`,
        section("Story", ul(g.parts.map((p) => a(`/story/${p.id}`, partName(p))))),
      ].filter(Boolean).join(""),
    });
  }

  list("/story", stories.map((s) => section(s.label, ul(s.groups.map((g) =>
    `${esc(storyGroupName(g))}${ul(g.parts.map((p) => a(`/story/${p.id}`, partName(p))))}`)))).join(""));
  for (const sec of stories) for (const g of sec.groups) {
    if (!g.battles) continue;
    files.push({
      path: `/story/battles/${g.id}`, meta: storyBattlesMeta(sec, g),
      crumbs: [["Story", "/story"], [storyGroupName(g), `/story/battles/${g.id}`]],
      body: section("Story", ul(g.parts.map((p) => a(`/story/${p.id}`, partName(p))))),
    });
  }

  list("/quests", quests.map((s) => section(s.label, ul(s.groups.map((g) => a(`/quests/${g.id}`, en(g.title) || g.id))))).join(""));
  for (const sec of quests) for (const g of sec.groups) {
    files.push({ path: `/quests/${g.id}`, meta: questMeta(sec, g), crumbs: [["Quests", "/quests"], [en(g.title) || g.id, `/quests/${g.id}`]] });
  }

  list("/people", (["artist", "cv"] as const).map((role) => section(`${ROLE_LABEL[role]}s`,
    ul(people.filter((p) => p.role === role).map((p) => a(personHref(p.role, p.name), p.name))))).join(""));
  for (const p of people) {
    const href = personHref(p.role, p.name);
    files.push({
      path: decodeURIComponent(href), meta: personMeta(p), crumbs: [[LIST_META["/people"].title, "/people"], [p.name, href]],
      body: section("Units", ul(p.units.map((x) => unitLink(x.unit)))) +
        section("Arena cards", ul(p.cards.map((x) => a(`/cards/${x.card.id}`, en(x.card.name) || x.card.id)))),
    });
  }

  // served by the SPA fallback: in the sitemap only
  const scenes = fs.readdirSync(path.join(data, "scenes")).filter((f) => f.endsWith(".json")).map((f) => `/scenes/${f.slice(0, -5)}`);
  const parts = stories.flatMap((s) => s.groups.flatMap((g) => g.parts.map((p) => `/story/${p.id}`)));
  const extra = [...scenes, ...parts].flatMap((p) => [p, `${p}/transcript`]);
  return { files, extra };
}

function render(template: string, page: Page, publicDir: string): string {
  const { meta } = page;
  const image = meta.image && fs.existsSync(path.join(publicDir, meta.image)) ? meta.image : null;
  const ld = page.path === "/"
    ? site.websiteLd()
    : page.crumbs && site.breadcrumbLd(page.crumbs.map(([name, p]) => ({ name, path: p.split("?")[0] })));
  // index.html is also the SPA fallback for every unlisted route: no canonical
  // there, the page sets its own at runtime.
  const tags = site.headTags({ ...meta, image, jsonLd: ld || undefined }, page.path === "/" ? null : canonicalUrl(page.path));
  const crumbs = page.crumbs && page.crumbs.length > 1
    ? `<nav aria-label="Breadcrumb">${page.crumbs.slice(0, -1).map(([l, p]) => a(p, l)).join(" › ")}</nav>` : "";
  return renderStatic(template, tags,
    `<div class="prerender">${crumbs}<h1>${esc(meta.title || SITE_NAME)}</h1><p>${esc(meta.description)}</p>${page.body ?? ""}</div>`);
}

/** dist/units/00001.html for /units/00001; null for a path no file can hold. */
function fileFor(outDir: string, p: string): string | null {
  if (p === "/") return path.join(outDir, "index.html");
  const segs = p.slice(1).split("/");
  if (segs.some((s) => !s || s.startsWith(".") || /[\\:*?"<>|\x00-\x1f]/.test(s))) return null;
  return path.join(outDir, ...segs) + ".html";
}

export function prerender(): Plugin {
  let outDir = "";
  let publicDir = "";
  return {
    name: "prerender",
    apply: "build",
    configResolved(c) {
      outDir = path.resolve(c.root, c.build.outDir);
      publicDir = c.publicDir;
    },
    closeBundle() {
      const template = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      const { files, extra } = pages(path.join(publicDir, "data"));
      let written = 0;
      const listed: string[] = [];
      for (const page of files) {
        const file = fileFor(outDir, page.path);
        if (file) {
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, render(template, page, publicDir));
          written++;
        }
        listed.push(page.path);
      }
      const urls = writeSitemap(outDir, [...listed, ...extra].map(canonicalUrl));
      writeRobots(outDir, SITE_URL);
      const total = countFiles(outDir);
      console.log(`prerender: ${written} pages, ${urls} URLs in sitemap.xml, ${total} files in ${path.basename(outDir)}`);
      if (total > FILE_BUDGET) console.warn(`prerender: ${total} files is close to Cloudflare Pages' 20,000-file limit`);
    },
  };
}
