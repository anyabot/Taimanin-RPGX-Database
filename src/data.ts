// Static game data (public/data, written by tools/web_export/tables.py) and
// small helpers shared by the pages.

import { useEffect, useState, useSyncExternalStore } from "react";
import { createJsonLoader, useJson } from "@altterisk/game-hub/data";
import { Assets } from "./unity/client";
import { DIRECT_ROOT } from "./unity/catalog";

export interface Text { ja: string; en?: string }

/** A decoded effect line (tools/web_export/effects.py); icon names a Battle_status_icon_*.
 *  `when` marks a conditional part of the skill: one of its variants ("2+ Oni
 *  allies", "25% chance") or its extra action at the end of the turn. */
export interface Effect {
  text: string; icon?: string; when?: string;
  /** battle system the effect goes through, which decides how it stacks (see STACK) */
  tag?: StackTag;
  /** for a state: its stacking group (BattleUnit.AddStateEffect) */
  stack?: string;
}
export type StackTag = "buff" | "debuff" | "trait" | "state" | "shield" | "ailment" | "marker" | "instant"
  | "mode" | "modifier" | "passive" | "other";

export interface UnitIndexEntry {
  /** other English spellings of the name (wiki redirects, older spellings), for search */
  aliases?: string[];
  id: string;
  name: Text | null;
  title: Text | null;
  displayName: Text | null;
  element: string | null;
  rarity: number;
  roles: string[];
  traits: string[];
  release: string | null;
  limited: boolean;
  /** where the unit first came from: Permanent, Gosha Fes, June Bride, Collab, Event ... (from banners and shops) */
  origin?: string;
  characterId: number;
  scenes: number;
  stats: Record<StatKey, number>;
  /** character family: other versions of the same character share it */
  family: string;
  /** acquisition tags: Standard, Pickup, Limited, Gosha / Yomihara / Collab Festival, Collab, Raid event, ... */
  obtain: string[];
  /** has a Live2D skin (UnitSkins) */
  skin?: boolean;
  illustrator?: string | null;
  voiceActor?: string | null;
}

export type StatKey = "hp" | "sp" | "atk" | "def" | "spd" | "luck";

export interface Skill {
  slot: "attack" | "skill1" | "skill2" | "ultimate";
  id: number;
  name: Text | null;
  hits: number;
  cutin: boolean;
  levels: { level: number; sp: number; detail: Text | null }[];
  effects: Effect[];
}

export interface UnitForm {
  id: string;
  rarity: number;
  rarityLabel: string;
  levelMax: number;
  stats: Record<StatKey, [number, number]>;
  spCharge: number;
  skills: string[];
  /** mode switches (SwapSkillCommand): the kit after skill `by` is used */
  modes?: { by: string; skills: string[] }[];
  /** items that evolve this form into the next (UnitEvolutionItems), where the data lists them */
  evolve?: [string, number][];
}

export interface Voice {
  type: string;
  label: string | null;
  variant: "base" | "r18";
  index: number;
  text: Text | null;
  clip: string | null;
}

/** One way to get a unit (tools/web_export/tables.py acquisition()). */
/** Unit origins in display order: pool, festivals, the seasonal lines through the year, the rest. */
export const ORIGINS = ["Permanent", "Gosha Fes", "Yomihara Fes", "Collab Fes", "New Year", "Valentine", "Bunny",
  "New Life", "Golden Week", "June Bride", "Summer", "Summer Festival", "Yukata", "Oct 10", "Halloween", "Race Queen",
  "Maid", "Soirée", "Christmas", "Limited", "Collab", "Mercenary", "Event"];

export interface ObtainEntry {
  kind: "gacha" | "spark" | "event" | "exchange" | "mission";
  type?: string;
  title: Text | null;
  start?: string | null;
  end?: string | null;
  need?: number;
  /** the game's pull type where it matters: "Pick-up select", "Guaranteed 11-pull" */
  pull?: string[];
  archive?: boolean;
  /** only in the REVIEW tree: part of the next update */
  upcoming?: boolean;
}

export interface Unit extends Omit<UnitIndexEntry, "scenes" | "stats" | "obtain" | "skin"> {
  obtain: ObtainEntry[];
  standardPool: boolean;
  root: string;
  rarityLabel: string;
  profile: Text | null;
  illustrator: string | null;
  voiceActor: string | null;
  forms: UnitForm[];
  skills: Record<string, Skill>;
  leader: { name: Text | null; detail: Text | null; effects: Effect[] } | null;
  /** Both slots are active in battle; each has Lv1..9 (single-level ones come unlocked). */
  abilities: {
    slot: number; name: Text | null; icon: number;
    release: { type: number; exp: number; items: [string, number][] };
    levels: { level: number; description: Text | null; effects: Effect[] }[];
  }[];
  /** Bloom table ids (growth.json) plus this unit's materials per Bloom level. */
  bloom: { points: number; gold: number; status: number; bonus: number; items: [number, string, number][] } | null;
  voices: Voice[];
  trust: number[];
  scenes: string[][];
  /** per scene, its CG stills (textures in the character's advstill bundle) */
  stills?: string[][];
  /** a Live2D skin, sold as an item */
  skin?: { item: string; name: Text | null; resource: string };
  art: { graphicId: string; graphicNum: number; r18GraphicId: string; r18GraphicNum: number; spineId: string };
}

/** public/data/growth.json (tables.py export_growth): tables all units share. */
export interface Growth {
  /** by rarity: EXP for each level (per level, not cumulative) and gold for each level-up */
  levels: Record<string, { exp: Record<string, number>; gold: Record<string, number> }>;
  /** rune enhance gold (rarity -> next level -> gold), refine costs, evolution items (list -> items) */
  rune: {
    enhance: Record<string, Record<string, number>>;
    refine: { rarity: number; category: number; refine_chip_id: string; main_chip_cost: number; sub_chip_cost: number;
      main_refine_cost: number; sub_refine_cost: number }[];
    evolve: Record<string, [string, number][]>;
  };
  abilityExp: Record<string, number>;
  bloom: {
    points: Record<string, number[]>; gold: Record<string, number[]>;
    status: { table: number; stat: number; from: number; to: number; cost: number; gain: number }[];
    bonus: { table: number; stat: number; level: number; bonus: number; value: number }[];
  };
  items: Record<string, { name: Text | null; icon: string }>;
}

/** public/data/stories/index.json (tools/web_export/stories.py). */
export interface StoryPart { id: string; section: string | null; title: string | null }
/** A texture in a game bundle: a bundle of its own, or a named one in an atlas bundle. */
export interface BundleRef { bundle: string; name?: string }
export interface StoryGroup {
  id: string; num: number; title: Text | null; parts: StoryPart[];
  banner?: BundleRef;
  battles?: { quests: number; enemies: number; bosses: number };
  /** events in the current client: their period (tools/web_export/stories.py) */
  period?: EventPeriod;
}
export interface EventPeriod { kind: string; start?: string; end?: string; exchangeEnd?: string }

/** public/data/banners.json: limited gacha banners, newest first (tables.py export_banners). */
export interface GachaBanner {
  id: number; title: Text | null; type: string; start: string | null; end: string | null;
  /** Gachas.image_id: gacha_img_<n> (key art) in image_gacha2020 */
  image: number; pull?: string[]; units: string[];
}
export const gachaArt = (image: number) => `image_gacha2020_assets_image_gacha2020_gacha_img_${image}.png`;

/** public/data/stories/battles/<group>.json and quests/<id>.json (tools/web_export/battles.py). */
export interface BattleSkill { name: Text | null; effects: Effect[] }
/** One scripted rule of an enemy (from its gimmick rows); skill = index into its skills. */
export interface BossRule { phase: number | null; when: string; do: string; skill: number | null }
export interface BattleEnemy {
  name: Text | null; element: string | null; level: number; hp: number; sp?: number; atk: number; def: number; spd: number;
  icon: string | null; skills: string[];
  /** resistances as listed (%): element + = resists, - = weak */
  res?: { element?: Record<string, number>; ailment?: Record<string, number> };
  traits?: string[];
  ai?: BossRule[];
}
/** A reward of any kind (battles.py Ctx.content / drop): type is eContentType; rate as listed (out of 10000). */
export interface QuestDrop {
  type: "jewel" | "gold" | "item" | "unit" | "rune" | string; id: string; num: number; rate?: number;
  group?: number; frame?: number; name?: Text | null; icon?: string | null; unit?: string;
  /** destroy rewards: the rank range they apply to */
  range?: [number, number];
}
export interface BattleBoss extends BattleEnemy {
  id: number; difficulty: number; stage: number; ai?: BossRule[];
  turnLimit?: number;
  rewards?: Partial<Record<"discover" | "destroy" | "mvp" | "semi", QuestDrop[]>>;
  /** main-story raid bosses: the quests they can appear in, and the raid challenge */
  appearsIn?: number[];
  challenge?: { start: string | null; ticket: QuestDrop; perDay: number };
  rules?: string[];
  /** running raid events: luck / contribution rewards, and bonus-point conditions (the game's text) */
  luckRewards?: LuckTier[];
  points?: { text: Text; points: number }[];
}
export interface BattleQuest {
  id: number; section: number; difficulty: number; scripts: string[]; waves: [string, number][][];
  ap: number; userExp: number; unitExp: number; gold: number;
  drops: Partial<Record<"enemy" | "boss" | "rare" | "luck", QuestDrop[]>>;
  title?: Text | null;
  /** stage rules (eStageGimmickType), written out by battles.py */
  rules?: string[];
  missions?: Text[];
  /** tower floors: the first-clear reward */
  reward?: QuestDrop;
  stageTitle?: Text | null;
  /** main story: chance (out of 10000) that clearing finds a raid boss */
  raidChance?: number;
  /** running events: rewards by the team's total luck */
  luckRewards?: LuckTier[];
}
/** A luck range (and for raid bosses a contribution range) and its rewards. */
export interface LuckTier { luck: [number, number]; contribution?: [number, number]; drops: QuestDrop[] }
/** A running event's extras (battles.py events()). */
export interface BattleEvent {
  kind: "story" | "raid" | "marble"; start: string | null; end: string | null; exchangeEnd?: string | null;
  /** bonus units: luckRate as listed (the unit adds luckRate % of its own Luck) */
  bonus: (QuestDrop & { luckRate: number; start: string | null; end: string | null })[];
  shop?: (QuestDrop & { cost: number; max: number })[];
  gacha?: { start: string | null; end: string | null; boxes: { box: number; items: (QuestDrop & { max: number; main?: boolean })[] }[] };
  laps?: (QuestDrop & { lap: number })[];
}
export interface Battles {
  quests: BattleQuest[]; enemies: Record<string, BattleEnemy>; bosses: BattleBoss[]; skills: Record<string, BattleSkill>;
  /** main story: per quest, the raid boss spawn chance by tier (out of 10000) */
  raidRates?: Record<string, number[]>;
  /** quests.py: the noun for one stage ("Floor") */
  stage?: string;
  event?: BattleEvent;
}
/** public/data/quests/index.json (tools/web_export/quests.py). */
export interface QuestGroup {
  id: string; title: Text | null; label?: Text | null; note?: string | null; kind?: string | null;
  start?: string | null; end?: string | null; runs?: number; quests: number;
}
export interface QuestSection { key: string; label: string; groups: QuestGroup[] }
/** Enemy and boss icons: ene_0001 / bos_0262 -> <icon>_s in image_ene_s. */
export const ENEMY_ICONS = "image_ene_s_assets_all";
export interface StorySection { key: string; label: string; groups: StoryGroup[] }

/** stat / icon / flat: decoded from the effect's param (tools/web_export/tables.py RUNE_PARAM). */
export interface RuneEffect { description: Text | null; range: [number, number]; stat?: string; icon?: string; flat?: boolean }
/** Rune piece icons: <piece.icon>_s (100x100) in image_rune_s. */
export const RUNE_ICONS = "image_rune_s_assets_all";
export interface RunePiece {
  id: string;
  name: Text | null;
  description: Text | null;
  rarity: number;
  rarityLabel: string;
  slot: number;
  slotLabel: string;
  main: RuneEffect[];
  sub: RuneEffect[];
  subCount: [number, number];
  refinable: boolean;
  icon: string;
  /** growth.json rune.evolve key, and the piece it evolves into */
  evolve?: string;
  evolvesTo?: string;
}
/** A decoded set-bonus line (eEquipComboBonus, see tables.py export_runes). */
export interface RuneBonusLine { text: string; icon?: string }
export interface RuneSet {
  id: number; family: string; name: Text | null; bonus: Record<string, Text | null>;
  bonusFx?: Record<string, RuneBonusLine[]>; pieces: RunePiece[];
}

const base = import.meta.env.BASE_URL;
export const loader = createJsonLoader({ urls: (name) => [`${base}data/${name}.json`] });
export const useData = <T,>(name: string | null) => useJson<T>(loader, name);

export const RARITY = ["", "N", "R", "HR", "SR", "UR", "LR"];
export const ELEMENTS = ["Superhuman", "Devilish", "Spiritual", "Natural", "Science"];
export const STATS: [StatKey, string][] = [["hp", "HP"], ["sp", "SP"], ["atk", "ATK"], ["def", "DEF"], ["spd", "SPD"], ["luck", "Luck"]];

export const iconUrl = (id: string) => `${base}icons/${id}.webp`;
/** an Arena card's 80x80 face (r18_image_kar_s, tools/web_export/cards.py) */
export const cardIconUrl = (id: string) => `${base}icons/cards/${id}.webp`;
export const voiceUrl = (clip: string) => `${DIRECT_ROOT}/${clip}`;

// ---- language: English where the translation pipeline has it, else Japanese.
type Lang = "en" | "ja";
const LANG_KEY = "taimanin.lang";
let lang: Lang = (() => {
  try { return (localStorage.getItem(LANG_KEY) as Lang) || "en"; } catch { return "en"; }
})();
const listeners = new Set<() => void>();
export function setLang(next: Lang) {
  lang = next;
  try { localStorage.setItem(LANG_KEY, next); } catch { /* private mode */ }
  listeners.forEach((l) => l());
}
export function useLang(): Lang {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lang);
}
export function tr(t: Text | null | undefined, l: Lang = lang): string {
  if (!t) return "";
  return (l === "en" && t.en) || t.ja;
}
/** The bare name; the title is shown separately (displayName = 【title】 name). */
export const unitName = (u: { name: Text | null; displayName?: Text | null }, l: Lang) =>
  tr(u.name, l) || tr(u.displayName, l) || "?";

/** Units already in the master data ahead of their release date. */
export const today = new Date().toISOString().slice(0, 10);
export const isUpcoming = (u: { release: string | null }) => !!u.release && u.release > today;

const DAY = 86400000;
/** The client's event and banner rows often open a year before they close
 *  (er064: 2025-10-21 – 2026-11-04, its featured unit released 2026-10-21), so
 *  only the close date is trusted; an opening more than 60 days before it is dropped. */
export function windowOf(start?: string | null, end?: string | null): { start?: string; end?: string } {
  if (!end) return { start: start ?? undefined };
  const long = !!start && Date.parse(end) - Date.parse(start) > 60 * DAY;
  return { start: start && !long ? start : undefined, end };
}
export type Phase = "upcoming" | "running" | "ended";
export function phaseOf(start?: string | null, end?: string | null): Phase {
  const w = windowOf(start, end);
  if (w.start && w.start > today) return "upcoming";
  return !w.end || w.end >= today ? "running" : "ended";
}
/** "ends in 5 days" / "starts in 2 days" / "ended 2026-10-21" */
export function phaseText(start?: string | null, end?: string | null): string {
  const w = windowOf(start, end);
  const days = (d: string) => Math.max(0, Math.round((Date.parse(d) - Date.parse(today)) / DAY));
  const n = (d: number) => (d === 0 ? "today" : d === 1 ? "in 1 day" : `in ${d} days`);
  switch (phaseOf(start, end)) {
    case "upcoming": return `starts ${n(days(w.start!))}`;
    case "running": return w.end ? `ends ${n(days(w.end))}` : "running";
    default: return `ended ${w.end}`;
  }
}

// ---- the bundle decoder, created once
let assets: Promise<Assets> | null = null;
export const getAssets = () => (assets ??= Assets.load());
export function useAssets() {
  const [a, setA] = useState<Assets | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { getAssets().then(setA, setError); }, []);
  return { assets: a, error };
}

/** public/data/dispatch.json (tools/web_export/quests.py export_dispatch). */
export interface DispatchMission {
  id: number; time: string; unitExp: number; gold: number; trust: number;
  /** great-success chance, out of 10000 */
  great: number;
  /** base rewards; luck bonus rows (each with the total luck it needs); the great-success table */
  drops: Partial<Record<"base" | "luck" | "great", (QuestDrop & { luck?: number; featured?: boolean })[]>>;
}
export interface DispatchSection {
  section: number; title: Text | null; kind: string; days: string[] | null; missions: DispatchMission[];
}

/** public/data/cards.json (tools/web_export/cards.py): Arena cards. */
export interface ArenaCard {
  id: string; name: Text | null; title: Text | null; union: string | null; rarity: number;
  illustrator: string | null; voiceActor: string | null; scenes: string[]; sale: string | null;
  /** per scene, its CG stills (textures in the card's advstill bundle) */
  stills?: string[][];
}

/** public/data/items/index.json and items/<id>.json (tools/web_export/items.py). */
export interface ItemIndexEntry { id: string; name: Text | null; type: string; icon: string; sources: number; used: boolean }
export interface ItemSource {
  page: string | null; title: Text | null; kinds: string[];
  /** exchange shops: period and what they pay with ([item, num]) */
  start?: string | null; end?: string | null; costs?: [string, number][];
}
export interface Item {
  id: string; name: Text | null; description: Text | null; type: string; icon: string; sellGold: number;
  effect?: { category: string; value: number };
  battleLimit?: number;
  /** exchange tickets: the units they can become */
  units?: string[];
  statusCost?: number;
  sources?: ItemSource[];
  uses?: { evolve?: string[]; bloom?: string[]; ability?: string[]; runeEvolve?: number; refine?: boolean };
}
/** Item icons: <icon>_s in image_item_s. */
export const ITEM_ICONS = "image_item_s_assets_all";
