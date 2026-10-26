// Static game data (public/data, written by tools/web_export/tables.py) and
// small helpers shared by the pages.

import { useEffect, useState, useSyncExternalStore } from "react";
import { createJsonLoader, useJson } from "@altterisk/game-hub/data";
import { Assets } from "./unity/client";
import { DIRECT_ROOT } from "./unity/catalog";

export interface Text { ja: string; en?: string }

/** A decoded effect line (tools/web_export/effects.py); icon names a Battle_status_icon_*. */
export interface Effect { text: string; icon?: string }

export interface UnitIndexEntry {
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
  characterId: number;
  scenes: number;
  stats: Record<StatKey, number>;
  /** character family: other versions of the same character share it */
  family: string;
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
}

export interface Voice {
  type: string;
  label: string | null;
  variant: "base" | "r18";
  index: number;
  text: Text | null;
  clip: string | null;
}

export interface Unit extends Omit<UnitIndexEntry, "scenes" | "stats"> {
  root: string;
  rarityLabel: string;
  profile: Text | null;
  illustrator: string | null;
  voiceActor: string | null;
  forms: UnitForm[];
  skills: Record<string, Skill>;
  leader: { name: Text | null; detail: Text | null; effects: Effect[] } | null;
  abilities: { slot: number; name: Text | null; level: number; description: Text | null }[];
  voices: Voice[];
  trust: number[];
  scenes: string[][];
  art: { graphicId: string; graphicNum: number; r18GraphicId: string; r18GraphicNum: number; spineId: string };
}

export interface RuneEffect { description: Text | null; range: [number, number] }
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
}
export interface RuneSet { id: number; family: string; name: Text | null; bonus: Record<string, Text | null>; pieces: RunePiece[] }

const base = import.meta.env.BASE_URL;
export const loader = createJsonLoader({ urls: (name) => [`${base}data/${name}.json`] });
export const useData = <T,>(name: string | null) => useJson<T>(loader, name);

export const RARITY = ["", "N", "R", "HR", "SR", "UR", "LR"];
export const ELEMENTS = ["Superhuman", "Devilish", "Spiritual", "Natural", "Science"];
export const STATS: [StatKey, string][] = [["hp", "HP"], ["sp", "SP"], ["atk", "ATK"], ["def", "DEF"], ["spd", "SPD"], ["luck", "Luck"]];

export const iconUrl = (id: string) => `${base}icons/${id}.webp`;
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
const today = new Date().toISOString().slice(0, 10);
export const isUpcoming = (u: { release: string | null }) => !!u.release && u.release > today;

// ---- the bundle decoder, created once
let assets: Promise<Assets> | null = null;
export const getAssets = () => (assets ??= Assets.load());
export function useAssets() {
  const [a, setA] = useState<Assets | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { getAssets().then(setA, setError); }, []);
  return { assets: a, error };
}
