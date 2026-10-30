// Page titles, descriptions and canonical URLs. Plain functions over the
// exported JSON (no React, no fetch, no import.meta.env): the pages set them at
// runtime through usePageMeta, and the build (prerender.ts) writes the same text
// into each page's static HTML, so the two never disagree.
import type { ArenaCard, Item, QuestGroup, QuestSection, StoryGroup, StoryPart, StorySection, Text, UnitIndexEntry } from "./data";
import { ROLE_LABEL, type Person } from "./people";

/** Where the site is served; canonical URLs, the sitemap and og:url use it. */
export const SITE_URL = "https://taimanin.altterisk.cc";
export const SITE_NAME = "Taimanin RPGX Database";

export const RARITY = ["", "N", "R", "HR", "SR", "UR", "LR"];
/** Story-index sections that are events; specials only when the client dates them. */
export const EVENT_KINDS: Record<string, string> = { event: "Story event", raid: "Raid event", map: "Map event", special: "Special event" };

export interface PageMeta {
  /** without the site name: fullTitle adds it */
  title: string;
  description: string;
  /** a site path (/icons/00001.webp) for og:image */
  image?: string;
  /** keep out of search results (an unknown URL, which the SPA fallback answers with 200) */
  noindex?: boolean;
}

export const DEFAULT_META: PageMeta = {
  title: "",
  description: "Units, events, gacha banners, story, quests, items and runes of Taimanin RPGX, read from the game's own data.",
};

export const fullTitle = (title: string) => (title ? `${title} | ${SITE_NAME}` : SITE_NAME);
/** Each path segment encoded once (people pages carry Japanese names). */
export const sitePath = (path: string) => path.split("/").map((s) => encodeURIComponent(decodeURIComponent(s))).join("/");
export const canonicalUrl = (path: string) => SITE_URL + sitePath(path);

const en = (t: Text | null | undefined) => t?.en || t?.ja || "";
const clip = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
const sentence = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/** Index pages, keyed by path. */
export const LIST_META: Record<string, PageMeta> = {
  "/": DEFAULT_META,
  "/units": { title: "Units", description: "Every Taimanin RPGX unit: rarity, element, traits, stats, skills, abilities, bloom, voices, art and scenes. Filter by rarity, element, role, trait and origin." },
  "/events": { title: "Events", description: "Taimanin RPGX story, raid and map events: periods, story parts, battles, rewards and exchange shops." },
  "/banners": { title: "Gacha banners", description: "Taimanin RPGX limited gacha banners with their dates, pull types and featured units." },
  "/gacha": { title: "Gacha simulator", description: "Pull on any Taimanin RPGX gacha banner with the game's own rates and pick-ups." },
  "/story": { title: "Story", description: "Taimanin RPGX main, event, raid and map story, played in the browser with the game's art, voice and music, with English text where translated." },
  "/quests": { title: "Quests", description: "Taimanin RPGX arena towers, daily quests, mini events and dispatch: stages, enemies, rules and drops." },
  "/cards": { title: "Arena cards", description: "Every Taimanin RPGX Arena card: rarity, art, credits and scenes." },
  "/items": { title: "Items", description: "Every Taimanin RPGX item: what it does, where it drops or is sold, and what uses it." },
  "/runes": { title: "Runes", description: "Taimanin RPGX rune sets: set bonuses, main and sub stats, and evolution costs." },
  "/buffs": { title: "Buff ranking", description: "Taimanin RPGX units ranked by the buffs and debuffs their skills give, by type and target." },
  "/statuses": { title: "Statuses", description: "Taimanin RPGX ailments, states and markers, and the units that apply them." },
  "/people": { title: "Artists & voice actors", description: "Every illustrator and voice actor credited on a Taimanin RPGX unit or Arena card." },
};

export const unitDisplayName = (u: Pick<UnitIndexEntry, "id" | "name" | "displayName">) => en(u.name) || en(u.displayName) || u.id;

export function unitMeta(u: Pick<UnitIndexEntry, "id" | "name" | "displayName" | "title" | "rarity" | "element" | "traits"
  | "release" | "illustrator" | "voiceActor">): PageMeta {
  const kind = [RARITY[u.rarity], u.element].filter(Boolean).join(" ");
  return {
    title: sentence(unitDisplayName(u), en(u.title)) + (kind ? ` – ${kind}` : ""),
    description: clip(sentence(
      `${kind || "Taimanin RPGX"} unit${u.traits.length ? ` (${u.traits.join(", ")})` : ""}.`,
      "Stats, skills, leader skill, abilities, bloom, voices, art and scenes.",
      u.release && `Released ${u.release}.`,
      u.illustrator && `Art: ${u.illustrator}.`,
      u.voiceActor && `CV: ${u.voiceActor}.`,
    )),
    image: `/icons/${u.id}.webp`,
  };
}

export function cardMeta(c: ArenaCard): PageMeta {
  return {
    title: sentence(en(c.name) || c.id, en(c.title)) + " – Arena card",
    description: clip(sentence(
      `${RARITY[c.rarity] ?? ""} Arena card${c.union ? ` (${c.union})` : ""} in Taimanin RPGX.`.trimStart(),
      c.scenes.length > 0 && `Art and ${plural(c.scenes.length, "scene")}.`,
      c.illustrator && `Art: ${c.illustrator}.`,
      c.voiceActor && `CV: ${c.voiceActor}.`,
    )),
    image: `/icons/cards/${c.id}.webp`,
  };
}

export function itemMeta(i: Pick<Item, "id" | "name" | "description">): PageMeta {
  const what = en(i.description).replace(/\s+/g, " ").trim();
  return {
    title: `${en(i.name) || i.id} – Item`,
    description: clip(sentence(what && (/[.!?。]$/.test(what) ? what : `${what}.`), "Where it drops or is sold, and what uses it.")),
  };
}

export const eventName = (g: StoryGroup, kind: string) => en(g.title) || `${EVENT_KINDS[kind]} ${g.num}`;

export function eventMeta(g: StoryGroup, kind: string): PageMeta {
  const p = g.period;
  return {
    title: `${eventName(g, kind)} – ${EVENT_KINDS[kind]}`,
    description: clip(sentence(
      `${EVENT_KINDS[kind]} ${g.num} in Taimanin RPGX${p?.start ? `, ${p.start}${p.end ? ` to ${p.end}` : ""}` : ""}.`,
      `Story (${plural(g.parts.length, "part")})${g.battles ? ", battles, enemies and bosses" : ""}, rewards and shops.`,
    )),
  };
}

export function questMeta(sec: QuestSection, g: QuestGroup): PageMeta {
  const name = en(g.title) || g.id;
  return {
    title: `${name} – ${sec.label}`,
    description: clip(sentence(
      `${sec.label} in Taimanin RPGX${g.note ? ` (${g.note})` : ""}: ${plural(g.quests, "quest")}.`,
      "Stages, enemies, bosses, rules and drops.",
    )),
  };
}

export const storyGroupName = (g: StoryGroup) => en(g.title) || g.id;

export function storyBattlesMeta(sec: StorySection, g: StoryGroup): PageMeta {
  return {
    title: `${storyGroupName(g)} – Battles`,
    description: clip(`Quests, enemies and bosses of ${storyGroupName(g)} (${sec.label}, Taimanin RPGX): waves, skills, boss patterns and drops.`),
  };
}

export const partName = (p: StoryPart) => [p.section, p.title].filter(Boolean).join(" · ") || p.id;

export function storyPartMeta(sec: StorySection, g: StoryGroup, p: StoryPart, transcript = false): PageMeta {
  const where = `${storyGroupName(g)}, ${partName(p)}`;
  return {
    title: `${storyGroupName(g)} ${partName(p)} – ${transcript ? "Transcript" : "Story"}`,
    description: clip(transcript
      ? `The full text of ${where} (${sec.label}, Taimanin RPGX), with English where translated.`
      : `${sec.label} of Taimanin RPGX: ${where}. Played in the browser with the game's art, voice and music, with English text where translated.`),
  };
}

/** A unit or card scene; `owner` is the unit's name when the page knows it. */
export function sceneMeta(id: string, title: string | null | undefined, owner?: string, transcript = false): PageMeta {
  const name = title || id;
  return {
    title: `${name} – ${transcript ? "Transcript" : "Scene"}`,
    description: clip(transcript
      ? `The full text of ${name}${owner ? ` (${owner})` : ""}, a Taimanin RPGX scene, with English where translated.`
      : `${name}${owner ? ` (${owner})` : ""}: a Taimanin RPGX scene played in the browser with the game's art, voice and music.`),
  };
}

export function personMeta(p: Person): PageMeta {
  const label = ROLE_LABEL[p.role];
  const names = [...new Set(p.units.map((x) => unitDisplayName(x.unit)))].slice(0, 6);
  return {
    title: `${p.name} – ${label}`,
    description: clip(sentence(
      `${label} credited on ${[p.units.length && plural(p.units.length, "unit"), p.cards.length && plural(p.cards.length, "Arena card")]
        .filter(Boolean).join(" and ")} in Taimanin RPGX.`,
      names.length > 0 && `${names.join(", ")}${p.units.length > names.length ? " and more" : ""}.`,
    )),
  };
}
