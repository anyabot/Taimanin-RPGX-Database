import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { boostedSpRows, suggestTeam, type BuffRow, type Candidate } from "../src/teamSuggest";

const data = (f: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../public/data", f), "utf8"));

const u = (id: string, atk = 1000, spd = 70, element = "Natural", traits: string[] = []): Candidate => ({ id, element, traits, atk, spd });
const row = (u: string, c: string, k: string, v: number, p: 0 | 1, s: BuffRow["s"] = "skill2", sc: BuffRow["sc"] = "all", more: Partial<BuffRow> = {}): BuffRow =>
  ({ u, c, k, v, p, sc, s, t: 0, x: `${u} ${k} ${v}`, ...more });

describe("suggestTeam", () => {
  const rows: BuffRow[] = [
    row("sp1", "recovery", "SP restore", 80, 0), row("sp1", "recovery", "HP restore", 20, 1, "skill1"),
    row("sp2", "recovery", "SP restore", 75, 0),
    row("sp3", "recovery", "SP restore", 20, 1, "ultimate"), row("sp3", "stat", "ATK", 40, 1, "skill1"),
    row("buf", "stat", "DEF", 60, 1), row("buf", "debuff", "DEF", 25, 1, "skill1", "enemies"),
    row("weak", "recovery", "SP restore", 60, 0), row("regen", "recovery", "SP regen", 40, 0),
  ];
  it("builds 3 SP + DEF buffer + top-ATK DPS", () => {
    const r = suggestTeam([u("sp1", 500, 90), u("sp2"), u("sp3"), u("buf"), u("dps", 2000), u("low", 100), u("weak"), u("regen")], rows);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const roles = Object.fromEntries(r.members.map((m) => [m.id, m.role]));
    expect(roles).toEqual({ sp1: "sp", sp2: "sp", sp3: "sp", buf: "buffer", dps: "dps" });
    expect(r.members.find((m) => m.id === "sp1")?.firstSp).toBe(true);
    expect(r.members.find((m) => m.id === "sp2")?.only?.k).toBe("SP restore");
    expect(r.members.find((m) => m.id === "buf")?.extra.map((x) => `${x.c}|${x.k}`)).toEqual(["debuff|DEF"]);
  });
  it("says not enough without SP units", () => {
    const r = suggestTeam([u("sp1"), u("buf"), u("dps"), u("weak"), u("regen")], rows);
    expect(r.ok).toBe(false);
  });
  it("skips buffs that don't apply to the whole team", () => {
    const scoped = [...rows.filter((x) => x.u !== "buf"), row("buf", "stat", "DEF", 60, 1, "skill2", "element", { el: "Science" })];
    const r = suggestTeam([u("sp1"), u("sp2"), u("sp3"), u("buf"), u("dps", 2000)], scoped);
    expect(r.ok).toBe(false);
  });
  it("takes 1 SP unit + an HPoT unit when that's all there is", () => {
    const more = [...rows, row("hot", "recovery", "HP regen", 25, 1, "skill1", "all", { t: 3 }), row("buf", "stat", "ATK", 50, 1)];
    const r = suggestTeam([u("sp1"), u("buf"), u("hot"), u("dps", 2000), u("low", 100)], more);
    expect(r.ok && Object.fromEntries(r.members.map((m) => [m.id, m.role]))).toEqual({ sp1: "sp", buf: "buffer", hot: "healer", dps: "dps", low: "dps" });
  });
  it("falls back to SPoT + HPoT with no SP unit", () => {
    const more = [row("regen", "recovery", "SP regen", 40, 0, "skill2", "all", { t: 3 }), row("hot", "recovery", "HP regen", 25, 1, "skill1", "all", { t: 3 }),
      row("buf", "stat", "ATK", 50, 1), row("buf", "stat", "DEF", 50, 1)];
    const r = suggestTeam([u("regen"), u("buf"), u("hot"), u("dps", 2000), u("low", 100)], more);
    expect(r.ok && r.members.find((m) => m.id === "regen")?.role).toBe("spot");
  });
  it("prefers a 3-4 turn buff over a bigger 1-turn one", () => {
    const more = [...rows, row("short", "stat", "DEF", 200, 1, "skill2", "all", { t: 1 }), row("buf", "stat", "DEF", 60, 1, "skill2", "all", { t: 4 })];
    const r = suggestTeam([u("sp1"), u("sp2"), u("sp3"), u("buf"), u("short"), u("dps", 2000)], more.filter((x) => !(x.u === "buf" && x.t === 0 && x.k === "DEF")));
    expect(r.ok && r.def.u).toBe("buf");
  });
  it("raises an SP restore by the allies' SPD modifier", () => {
    const skills = [{ slot: "skill2" as const, effects: [{ text: "All allies: restore 60 SP", tag: "instant" },
      { text: "Healing +100% per 100 of the allies' average SPD", tag: "modifier" }] }];
    expect(boostedSpRows("x", skills, { element: "Natural", spd: 75, def: 400 })[0].v).toBe(105);
    const ally = [{ slot: "skill2" as const, effects: [{ text: "All allies: restore 60 SP" }, { text: "Healing +20% with 1 Superhuman ally, +20% for each more (+100% at 5)", tag: "modifier" }] }];
    expect(boostedSpRows("x", ally, { element: "Superhuman", spd: 70, def: 0 })[0].v).toBe(72);
    expect(boostedSpRows("x", ally, { element: "Natural", spd: 70, def: 0 })).toEqual([]);
  });
  it("uses the free buffer only as the buffer, and says it isn't owned", () => {
    const more = [...rows.filter((x) => x.u !== "buf"), row("yuki", "stat", "ATK", 60, 1, "ultimate", "all", { t: 4 }), row("yuki", "stat", "DEF", 60, 1, "ultimate", "all", { t: 4 })];
    const r = suggestTeam([u("sp1"), u("sp2"), u("sp3"), u("dps", 2000), { ...u("yuki", 9999), free: true }], more);
    expect(r.ok && r.members.find((m) => m.id === "yuki")?.role).toBe("buffer");
  });
  it("runs on the real data with every unit owned", () => {
    const index = data("units/index.json") as { id: string; element: string | null; traits: string[]; stats: { atk: number; spd: number } }[];
    const all = index.map((x) => ({ id: x.id, element: x.element, traits: x.traits, atk: x.stats.atk, spd: x.stats.spd }));
    const t = Date.now();
    const r = suggestTeam(all, data("buffs.json"));
    expect(Date.now() - t).toBeLessThan(5000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.members).toHaveLength(5);
  });
});
