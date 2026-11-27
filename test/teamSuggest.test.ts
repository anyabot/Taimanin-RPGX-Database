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
    const roles = Object.fromEntries(r.bp.members.map((m) => [m.id, m.role]));
    expect(roles).toEqual({ sp1: "sp", sp2: "sp", sp3: "sp", buf: "buffer", dps: "dps" });
    expect(r.bp.members.find((m) => m.id === "sp1")?.firstSp).toBe(true);
    expect(r.bp.members.find((m) => m.id === "sp2")?.only?.k).toBe("SP restore");
    expect(r.bp.members.find((m) => m.id === "buf")?.extra.map((x) => `${x.c}|${x.k}`)).toEqual(["debuff|DEF"]);
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
    expect(r.ok && Object.fromEntries(r.bp.members.map((m) => [m.id, m.role]))).toEqual({ sp1: "sp", buf: "buffer", hot: "healer", dps: "dps", low: "dps" });
  });
  it("falls back to SPoT + HPoT with no SP unit", () => {
    const more = [row("regen", "recovery", "SP regen", 40, 0, "skill2", "all", { t: 3 }), row("hot", "recovery", "HP regen", 25, 1, "skill1", "all", { t: 3 }),
      row("buf", "stat", "ATK", 50, 1), row("buf", "stat", "DEF", 50, 1)];
    const r = suggestTeam([u("regen"), u("buf"), u("hot"), u("dps", 2000), u("low", 100)], more);
    expect(r.ok && r.bp.members.find((m) => m.id === "regen")?.role).toBe("spot");
  });
  it("prefers a 3-4 turn buff over a bigger 1-turn one", () => {
    const more = [...rows, row("short", "stat", "DEF", 200, 1, "skill2", "all", { t: 1 }), row("buf", "stat", "DEF", 60, 1, "skill2", "all", { t: 4 })];
    const r = suggestTeam([u("sp1"), u("sp2"), u("sp3"), u("buf"), u("short"), u("dps", 2000)], more.filter((x) => !(x.u === "buf" && x.t === 0 && x.k === "DEF")));
    expect(r.ok && r.bp.def.u).toBe("buf");
  });
  it("raises an SP restore by the allies' SPD modifier", () => {
    const skills = [{ slot: "skill2" as const, effects: [{ text: "All allies: restore 60 SP", tag: "instant" },
      { text: "Healing +100% per 100 of the allies' average SPD", tag: "modifier" }] }];
    expect(boostedSpRows("x", skills, { element: "Natural", spd: 75, def: 400 })[0].v).toBe(105);
    const ally = [{ slot: "skill2" as const, effects: [{ text: "All allies: restore 60 SP" }, { text: "Healing +20% with 1 Superhuman ally, +20% for each more (+100% at 5)", tag: "modifier" }] }];
    expect(boostedSpRows("x", ally, { element: "Superhuman", spd: 70, def: 0 })[0].v).toBe(72);
    expect(boostedSpRows("x", ally, { element: "Natural", spd: 70, def: 0 })).toEqual([]);
    // the Healing modifier can come after another one (Young Tokiko: Power, then Healing)
    const block = [{ slot: "skill2" as const, effects: [{ text: "All allies: restore 13% HP" }, { text: "All allies: restore 60 SP" },
      { text: "Power +10% with 1 Spiritual ally, +5% for each more (+30% at 5)", tag: "modifier" },
      { text: "Healing +20% with 1 Spiritual ally, +20% for each more (+100% at 5)", tag: "modifier" }] }];
    expect(boostedSpRows("x", block, { element: "Spiritual", spd: 70, def: 0 })[0].v).toBe(72);
  });
  it("uses the free buffer only as the buffer, and says it isn't owned", () => {
    const more = [...rows.filter((x) => x.u !== "buf"), row("yuki", "stat", "ATK", 60, 1, "ultimate", "all", { t: 4 }), row("yuki", "stat", "DEF", 60, 1, "ultimate", "all", { t: 4 })];
    const r = suggestTeam([u("sp1"), u("sp2"), u("sp3"), u("dps", 2000), { ...u("yuki", 9999), free: true }], more);
    expect(r.ok && r.bp.members.find((m) => m.id === "yuki")?.role).toBe("buffer");
  });
  it("uses an element-only SP restore only for a 3-SP team of that element", () => {
    const dev = (id: string, atk = 1000) => u(id, atk, 70, "Devilish");
    const more = [row("a", "recovery", "SP restore", 80, 0), row("a", "recovery", "HP restore", 20, 1, "skill1"),
      row("b", "recovery", "SP restore", 80, 0), row("c", "recovery", "SP restore", 95, 0, "skill2", "element", { el: "Devilish" }),
      row("buf", "stat", "ATK", 50, 1), row("buf", "stat", "DEF", 50, 1)];
    const ok = suggestTeam([dev("a"), dev("b"), dev("c"), dev("buf"), dev("dps", 2000), u("nat", 5000)], more);
    expect(ok.ok && ok.bp.members.map((m) => m.id).sort()).toEqual(["a", "b", "buf", "c", "dps"]);
    // only 2 other SP units: the element-only one is never used for a 2-SP team
    const two = suggestTeam([dev("a"), dev("c"), dev("buf"), dev("dps"), u("hot")], [...more, row("hot", "recovery", "HP regen", 25, 1, "skill1", "all", { t: 3 })]);
    expect(two.ok && two.bp.members.some((m) => m.id === "c" && m.role === "sp")).toBe(false);
  });
  it("counts a 4+ Taimanin SP restore only when the team has 4+ Taimanin", () => {
    const tai = (id: string, atk = 1000) => u(id, atk, 70, "Natural", ["Taimanin"]);
    const more = [row("a", "recovery", "SP restore", 80, 0), row("a", "recovery", "HP restore", 20, 1, "skill1"),
      row("b", "recovery", "SP restore", 80, 0), row("c", "recovery", "SP restore", 100, 0, "skill2", "all", { n: "4+ Taimanin allies" }),
      row("buf", "stat", "ATK", 50, 1), row("buf", "stat", "DEF", 50, 1)];
    const ok = suggestTeam([tai("a"), tai("b"), tai("c"), tai("buf"), u("dps", 2000)], more);
    expect(ok.ok && ok.bp.members.find((m) => m.id === "c")?.role).toBe("sp");
    const no = suggestTeam([u("a"), tai("b"), tai("c"), tai("buf"), u("dps", 2000)], more);
    expect(no.ok).toBe(false);
  });
  it("runs on the real data with every unit owned", () => {
    const index = data("units/index.json") as { id: string; element: string | null; traits: string[]; stats: { atk: number; spd: number } }[];
    const all = index.map((x) => ({ id: x.id, element: x.element, traits: x.traits, atk: x.stats.atk, spd: x.stats.spd }));
    const t = Date.now();
    const r = suggestTeam(all, data("buffs.json"));
    expect(Date.now() - t).toBeLessThan(5000);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.bp.members).toHaveLength(5);
    // everyone owned: the AP leader has the highest Rank EXP leader skill (Bride Rinko, +35%)
    if (r.ok) expect(r.ap.members[0].leader && r.ap.leaderWhy[0].v).toBe(35);
  });
  describe("leader and support (rule 5)", () => {
    const base = [...rows, row("sp1", "stat", "Max HP", 10, 1, "leader"), row("buf", "stat", "DEF", 25, 1, "leader"), row("buf", "stat", "Max HP", 5, 1, "leader"),
      row("dps", "stat", "ATK", 30, 1, "leader")];
    const box = [u("sp1", 500, 90), u("sp2"), u("sp3"), u("buf"), u("dps", 2000), u("dps2", 1500)];
    it("BP: the member with the most Max HP + DEF leads; the support is Ragnarok", () => {
      const r = suggestTeam(box, base);
      expect(r.ok && r.bp.members[0]).toMatchObject({ id: "buf", leader: true });
      expect(r.ok && r.bp.leaderWhy.map((x) => x.k).sort()).toEqual(["DEF", "Max HP"]);
      expect(r.ok && r.bp.support).toBe("00745");
    });
    it("BP: falls back to the best ATK leader", () => {
      const r = suggestTeam(box, [...rows, row("dps", "stat", "ATK", 30, 1, "leader")]);
      expect(r.ok && r.bp.members[0].id).toBe("dps");
      expect(r.ok && r.bp.note).toMatch(/ATK/);
    });
    it("AP: the top Rank EXP unit leads, in place of the weakest DPS; the support is Bride Rinko", () => {
      const more = [...base, row("exp", "utility", "Player EXP", 25, 1, "leader"), row("exp2", "utility", "Player EXP", 10, 1, "leader")];
      const r = suggestTeam([...box, u("exp", 100), u("exp2", 3000)], more);
      expect(r.ok && r.ap.members[0]).toMatchObject({ id: "exp", leader: true, role: "exp" });
      expect(r.ok && r.ap.replaced?.role).toBe("dps");
      expect(r.ok && r.ap.members.map((m) => m.id)).not.toContain(r.ok && r.ap.replaced?.id);
      expect(r.ok && r.ap.support).toBe("01051");
      // the BP team is unchanged
      expect(r.ok && r.bp.members.some((m) => m.id === "exp")).toBe(false);
    });
    it("AP: a member with the Rank EXP leader skill just leads", () => {
      const r = suggestTeam(box, [...base, row("sp2", "utility", "Player EXP", 15, 1, "leader")]);
      expect(r.ok && r.ap.members[0].id).toBe("sp2");
      expect(r.ok && r.ap.replaced).toBeUndefined();
    });
    it("AP: doesn't swap out the only buffer when that loses the team's buff", () => {
      // 3 SP + buffer + 1 DPS slot: the EXP unit (Science) breaks nothing in the DPS slot,
      // but a Natural-only DEF buff would stop applying, so it can't join
      const nat = [...rows.filter((x) => x.u !== "buf"), row("buf", "stat", "DEF", 60, 1, "skill2", "element", { el: "Natural" }),
        row("exp", "utility", "Player EXP", 25, 1, "leader")];
      const r = suggestTeam([...box, u("exp", 100, 70, "Science")], nat);
      expect(r.ok && r.ap.members.some((m) => m.id === "exp")).toBe(false);
      expect(r.ok && r.ap.note).toMatch(/can't join/);
    });
  });
});
