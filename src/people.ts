// Artists and voice actors, gathered from the credits on units and Arena cards.
// The game writes one person several ways (ＺＯＬ / ZOL, 柊 奈々 / 柊奈々, sian /
// Sian), so people are matched on a normalized key. A credit can name more than
// one person: a duo is "A&B" (or ＆), and an illustration drawn from
// someone else's design is "A（原案：B）"; any other bracket is an affiliation.
import type { ArenaCard, UnitIndexEntry } from "./data";

export type Role = "artist" | "cv";
export const ROLE_LABEL: Record<Role, string> = { artist: "Artist", cv: "Voice actor" };

export interface Credit {
  name: string;
  key: string;
  /** how they are credited, when not as the artist or voice ("original design") */
  note?: string;
  /** an affiliation the credit gives, "なまにくATK（ニトロプラス）" */
  aside?: string;
}

export const personKey = (name: string) => name.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
const clean = (name: string) => name.normalize("NFKC").replace(/\s+/g, " ").trim();

/** The people a raw credit names. */
export function credits(raw: string | null | undefined, role: Role): Credit[] {
  return clean(raw || "").split("&").map(clean).filter(Boolean).flatMap((s): Credit[] => {
    const m = /^(.*?)\((.*)\)$/.exec(s);
    if (!m) return [{ name: s, key: personKey(s) }];
    const name = clean(m[1]), design = /^\s*原案\s*:(.*)$/.exec(m[2]);
    if (!design) return [{ name, key: personKey(name), aside: clean(m[2]) }];
    return [{ name, key: personKey(name) }, { name: clean(design[1]), key: personKey(design[1]), note: "original design" }];
  });
}

export const personHref = (role: Role, name: string) => `#/people/${role}/${encodeURIComponent(name)}`;

export interface Person {
  key: string;
  role: Role;
  /** the spelling used most often */
  name: string;
  units: { unit: UnitIndexEntry; note?: string }[];
  cards: { card: ArenaCard; note?: string }[];
}

/** Everyone credited on a unit or a card, per role. */
export function gatherPeople(units: UnitIndexEntry[], cards: ArenaCard[]): Map<string, Person> {
  const people = new Map<string, Person>();
  const spellings = new Map<string, Map<string, number>>();
  const add = (role: Role, raw: string | null | undefined, put: (p: Person, note?: string) => void) => {
    for (const c of credits(raw, role)) {
      const id = `${role}:${c.key}`;
      let p = people.get(id);
      if (!p) people.set(id, (p = { key: c.key, role, name: c.name, units: [], cards: [] }));
      const sp = spellings.get(id) ?? new Map<string, number>();
      sp.set(c.name, (sp.get(c.name) ?? 0) + 1);
      spellings.set(id, sp);
      put(p, c.note);
    }
  };
  for (const u of units) {
    add("artist", u.illustrator, (p, note) => p.units.push({ unit: u, note }));
    add("cv", u.voiceActor, (p, note) => p.units.push({ unit: u, note }));
  }
  for (const c of cards) {
    add("artist", c.illustrator, (p, note) => p.cards.push({ card: c, note }));
    add("cv", c.voiceActor, (p, note) => p.cards.push({ card: c, note }));
  }
  for (const [id, p] of people) p.name = [...spellings.get(id)!].sort((a, b) => b[1] - a[1])[0][0];
  return people;
}
