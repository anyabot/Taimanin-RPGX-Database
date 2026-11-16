// The units a player owns, kept in this browser. The Collection page edits it
// (by hand or from screenshots); the Team builder's picker can filter by it.
import { useMemo } from "react";
import { createSetting } from "@altterisk/game-hub/persist";

const ID = /^\d{5}$/;

/** A list read back from storage or a backup file: unit ids only, once each. */
export const sanitizeOwned = (raw: unknown): string[] =>
  Array.isArray(raw) ? [...new Set(raw.filter((v): v is string => typeof v === "string" && ID.test(v)))].sort() : [];

export const ownedSetting = createSetting<string[]>({ key: "taimanin.collection", version: 1, initial: [], sanitize: sanitizeOwned });

/** Team builder: show only owned units in the picker. */
export const ownedOnlySetting = createSetting<boolean>({
  key: "taimanin.team.ownedOnly", version: 1, initial: false, sanitize: (v) => v === true,
});

export interface Owned {
  ids: Set<string>;
  has: (id: string) => boolean;
  add: (ids: Iterable<string>) => void;
  remove: (ids: Iterable<string>) => void;
  toggle: (id: string) => void;
  replace: (ids: string[]) => void;
}

export function useOwned(): Owned {
  const [list, setList] = ownedSetting.use();
  return useMemo(() => {
    const ids = new Set(list);
    return {
      ids,
      has: (id) => ids.has(id),
      add: (more) => setList((cur) => sanitizeOwned([...cur, ...more])),
      remove: (less) => { const drop = new Set(less); setList((cur) => cur.filter((x) => !drop.has(x))); },
      toggle: (id) => setList((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : sanitizeOwned([...cur, id]))),
      replace: (next) => setList(sanitizeOwned(next)),
    };
  }, [list, setList]);
}
