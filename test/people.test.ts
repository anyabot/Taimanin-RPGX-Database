import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { credits, gatherPeople, personKey } from "../src/people";

const data = (f: string) => JSON.parse(readFileSync(path.resolve(__dirname, "../public/data", f), "utf8"));

describe("credits", () => {
  it("splits voice duos and original-design credits", () => {
    expect(credits("有賀桃＆三十三七", "cv").map((c) => c.name)).toEqual(["有賀桃", "三十三七"]);
    expect(credits("キリンＰ（原案：葵渚）", "artist")).toEqual([
      { name: "キリンP", key: "キリンp" }, { name: "葵渚", key: "葵渚", note: "original design" }]);
    expect(credits("sage・ジョー", "artist").map((c) => c.name)).toEqual(["sage・ジョー"]);
    expect(credits("カガミ＆旭", "artist").map((c) => c.name)).toEqual(["カガミ", "旭"]);
    expect(credits("葵渚(原案 : 羽倉ぼう)", "artist").map((c) => c.name)).toEqual(["葵渚", "羽倉ぼう"]);
    expect(credits("なまにくＡＴＫ（ニトロプラス）", "artist")).toEqual([{ name: "なまにくATK", key: "なまにくatk", aside: "ニトロプラス" }]);
  });
  it("matches one person written several ways", () => {
    expect(personKey("ＺＯＬ")).toBe(personKey("ZOL"));
    expect(personKey("柊 奈々")).toBe(personKey("柊奈々"));
    expect(personKey("Sian")).toBe(personKey("sian"));
  });
  it("credits every unit and card with a credit to someone", () => {
    const units = data("units/index.json"), cards = data("cards.json");
    const people = gatherPeople(units, cards);
    const credited = (role: "artist" | "cv", n: number) => [...people.values()].filter((p) => p.role === role)
      .reduce((s, p) => s + (n ? p.cards.length : p.units.length), 0);
    expect(credited("artist", 0)).toBeGreaterThanOrEqual(units.filter((u: any) => u.illustrator).length);
    expect(credited("cv", 1)).toBeGreaterThanOrEqual(cards.filter((c: any) => c.voiceActor).length);
    // a name left over with odd punctuation would mean a credit format the parser does not know
    for (const p of people.values()) expect(p.name, p.name).not.toMatch(/[()（）&＆/／、,]/);
  });
});
