/** public/data/gacha.json (tools/web_export/gacha.py) and the pull logic of the gacha simulator. */
import type { Text } from "./data";

/** One draw button: n units, a rarity split (rates key) and a lineup (lineups key). */
export interface GachaDraw {
  n: number; rate: number; lineup: number;
  /** one slot is HR or better (GachaContents.is_fixed_hr) */
  hr?: 1;
  /** times it can be drawn; daily = times a day */
  limit?: number; daily?: number;
  labels?: string[];
}
export interface MileageReward { need: number; num: number; unit?: string; item?: string; name?: Text | null; icon?: string }
export interface SimBanner {
  id: number; title: Text | null; type: string; start: string | null; end: string | null; image: number;
  draws: GachaDraw[];
  steps?: GachaDraw[][];
  select?: { unit: string; draws: GachaDraw[] }[];
  mileage?: { loop: number; rewards: MileageReward[] };
  bonus?: string;
}
export interface GachaData {
  banners: SimBanner[];
  /** gacha rarity (2 R, 3 HR, 4 SR) -> % */
  rates: Record<string, Record<string, number>>;
  lineups: Record<string, { units: Record<string, string[]>; up?: Record<string, number> }>;
}

export type Pull = { unit: string; rarity: number; up: boolean };
export interface Tally {
  pulls: number;
  /** mileage points: one per unit drawn (the server keeps the real count) */
  points: number;
  got: Record<string, number>;
  /** every SR in order, with the pulls since the previous SR (or the start) */
  srs: { unit: string; gap: number; up: boolean }[];
  sinceSr: number;
  /** times each draw button was used, by drawKey */
  used: Record<string, number>;
  step: number;
}
export const emptyTally = (): Tally => ({ pulls: 0, points: 0, got: {}, srs: [], sinceSr: 0, used: {}, step: 0 });
export const drawKey = (d: GachaDraw, where: string) => `${where}:${d.n}:${d.rate}:${d.lineup}`;
export const SR = 4;

/** The rarity split of a draw; the HR-or-better slot moves R's share to HR (as the ConfirmHR gacha's split is). */
export function rarityRates(data: GachaData, d: GachaDraw, hrSlot = false): [number, number][] {
  const r = data.rates[d.rate] ?? {};
  const out: [number, number][] = [4, 3, 2].map((k) => [k, r[k] ?? 0]);
  if (!hrSlot) return out;
  const rShare = r[2] ?? 0;
  return out.filter(([k]) => k !== 2).map(([k, v]) => [k, k === 3 ? v + rShare : v]);
}

/** Each unit's % of one pull, as UIGachaDetailPopup.MakeGachaLineUpList builds the game's rate list:
 *  a rate-up unit takes prioritize_rate / 10000 of its rarity's %, the rest is split evenly. */
export function unitRates(data: GachaData, d: GachaDraw, hrSlot = false) {
  const lineup = data.lineups[d.lineup];
  const up = lineup?.up ?? {};
  return rarityRates(data, d, hrSlot).map(([rarity, share]) => {
    const units = lineup?.units[rarity] ?? [];
    const ups = units.filter((u) => up[u]);
    const left = share - ups.reduce((s, u) => s + (up[u] * 0.0001 * share), 0);
    const rest = units.length - ups.length;
    return {
      rarity, share,
      units: units.map((u): [string, number, boolean] =>
        up[u] ? [u, up[u] * 0.0001 * share, true] : [u, rest ? left / rest : 0, false]),
    };
  });
}

function pick<T>(entries: T[], weight: (e: T) => number, rng: () => number): T {
  const total = entries.reduce((s, e) => s + weight(e), 0);
  let roll = rng() * total;
  for (const e of entries) {
    roll -= weight(e);
    if (roll < 0) return e;
  }
  return entries[entries.length - 1];
}

export function draw(data: GachaData, d: GachaDraw, tally: Tally, key: string, rng: () => number = Math.random) {
  const pulls: Pull[] = [];
  const next: Tally = { ...tally, got: { ...tally.got }, srs: [...tally.srs], used: { ...tally.used, [key]: (tally.used[key] ?? 0) + 1 } };
  for (let i = 0; i < d.n; i++) {
    const hrSlot = !!d.hr && i === d.n - 1;
    const table = unitRates(data, d, hrSlot).filter((g) => g.units.length && g.share > 0);
    const g = pick(table, (x) => x.share, rng);
    const [unit, , up] = pick(g.units, ([, w]) => w, rng);
    pulls.push({ unit, rarity: g.rarity, up });
    next.pulls++;
    next.points++;
    next.sinceSr++;
    next.got[unit] = (next.got[unit] ?? 0) + 1;
    if (g.rarity >= SR) {
      next.srs.push({ unit, gap: next.sinceSr, up });
      next.sinceSr = 0;
    }
  }
  return { pulls, tally: next };
}
