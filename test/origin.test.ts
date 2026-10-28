import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ORIGINS } from "../src/data";

const units = JSON.parse(readFileSync(path.resolve(__dirname, "../public/data/units/index.json"), "utf8"));

describe("unit origins", () => {
  it("uses only labels the unit filter lists", () => {
    // a new banner theme in the exporter needs a place in ORIGINS
    for (const u of units) if (u.origin) expect(ORIGINS, `${u.id} ${u.origin}`).toContain(u.origin);
  });
  it("labels released units from their first banner", () => {
    const of = (id: string) => units.find((u: any) => u.id === id)?.origin;
    expect(of("00905")).toBe("June Bride");
    expect(of("00673")).toBe("Gosha Fes");
    expect(of("04001")).toBe("Yomihara Fes");
    expect(of("04009")).toBe("Collab Fes");
    expect(of("00001")).toBe("Permanent");
  });
});
