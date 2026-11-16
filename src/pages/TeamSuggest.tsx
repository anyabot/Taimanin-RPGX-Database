// Team builder, "Suggest" tab: a team from the units the player owns, by the
// simple rules in src/teamSuggest.ts.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { FallbackImage, LoadState, Panel } from "@altterisk/game-hub";
import { useOwned } from "../collection";
import { iconUrl, isUpcoming, tr, unitName, useData, useLang, type UnitIndexEntry } from "../data";
import { ElementIcon, RarityIcon } from "../components";
import { RULES, suggestTeam, type BuffRow, type Member, type Role } from "../teamSuggest";

const ROLE: Record<Role, string> = { sp: "SP", buffer: "Buffer", healer: "Healer", dps: "DPS" };
const SKILL: Record<BuffRow["s"], string> = { attack: "Attack", skill1: "S1", skill2: "S2", ultimate: "Ougi", leader: "Leader" };
/** the team builder's auto-skill action for a skill slot */
const ACTION: Record<BuffRow["s"], number> = { attack: 1, skill1: 2, skill2: 3, ultimate: 4, leader: 0 };

/** What the builder gets: one entry per slot (leader first). */
export interface SuggestedSlot { unit: string; note: string; macro: { action: number }[] }

const fx = (r: BuffRow) => `${SKILL[r.s]}: ${r.x}`;

function roleLabel(m: Member) {
  if (m.role === "sp") return m.firstSp ? "SP 1 (moves first)" : "SP";
  return ROLE[m.role];
}

/** The slot note: what to cast (rule 6). */
function scriptNote(m: Member) {
  if (m.only) return `Only cast ${SKILL[m.only.s]} (SP restore)`;
  const casts = [...m.why, ...m.extra].filter((r, i, l) => l.findIndex((x) => x.s === r.s) === i).map((r) => SKILL[r.s]);
  return casts.length ? `${ROLE[m.role]}. Cast ${casts.join(", ")}` : ROLE[m.role];
}

export function suggestedSlots(members: Member[]): SuggestedSlot[] {
  return members.map((m) => ({ unit: m.id, note: scriptNote(m), macro: m.only ? [{ action: ACTION[m.only.s] }] : [] }));
}

export default function TeamSuggest({ index, onUse }: { index: UnitIndexEntry[]; onUse: (slots: SuggestedSlot[]) => void }) {
  const lang = useLang();
  const owned = useOwned();
  const { data: rows, loading, error } = useData<BuffRow[]>("buffs");
  const units = useMemo(() => new Map(index.map((u) => [u.id, u])), [index]);
  const result = useMemo(() => {
    if (!rows || !owned.ids.size) return null;
    const mine = index.filter((u) => owned.has(u.id) && !isUpcoming(u))
      .map((u) => ({ id: u.id, element: u.element, traits: u.traits, atk: u.stats.atk, spd: u.stats.spd }));
    return suggestTeam(mine, rows);
  }, [rows, owned, index]);

  const rules = (
    <details className="team-rules">
      <summary>The rules this tab follows</summary>
      <pre>{RULES}</pre>
      <p className="small muted">Values are each unit's top form at max level and max skill level. "Moves first" = highest SPD.</p>
    </details>
  );

  if (!owned.ids.size) {
    return <>
      <p>Add the units you own on the <Link to="/collection">Collection</Link> page (by hand or from screenshots), then come back for a suggested team.</p>
      {rules}
    </>;
  }
  if (!rows) return <LoadState loading={loading} error={error} />;
  return (
    <div className="team-suggest">
      <p className="small muted">From your {owned.ids.size} owned units. A starting point by simple rules, not the best team for every fight.</p>
      {result && !result.ok && <Panel title="Not enough units yet"><p>{result.reason}</p></Panel>}
      {result?.ok && <>
        <div className="team-suggest-list">
          {result.members.map((m) => {
            const u = units.get(m.id);
            return (
              <div key={m.id} className={`team-suggest-row role-${m.role}`}>
                <FallbackImage srcs={[iconUrl(m.id)]} alt="" width={64} height={64} />
                <div className="team-suggest-body">
                  <div className="team-suggest-head">
                    <span className="team-suggest-role">{roleLabel(m)}</span>
                    <Link to={`/units/${m.id}?tab=skills`}>{u ? unitName(u, lang) : m.id}</Link>
                    {u && <span className="muted small">{tr(u.title, lang)}</span>}
                    {u && <RarityIcon rarity={u.rarity} height={12} />}
                    {u && <ElementIcon element={u.element} size={14} />}
                    {m.role === "dps" && u && <span className="small muted">ATK {u.stats.atk}</span>}
                  </div>
                  <ul className="team-suggest-fx small">
                    {m.why.map((r, i) => <li key={`w${i}`}>{fx(r)}{r.n && <span className="muted"> ({r.n})</span>}</li>)}
                    {m.only && <li className="team-suggest-script">Script: only cast {SKILL[m.only.s]}</li>}
                    {m.extra.length > 0 && <li className="team-suggest-script">Script: also cast {m.extra.map(fx).join("; ")}</li>}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
        <p className="small">
          Team ATK buff: <strong>{fx(result.atk)}</strong> ({units.get(result.atk.u) ? unitName(units.get(result.atk.u)!, lang) : result.atk.u})<br />
          Team DEF buff: <strong>{fx(result.def)}</strong> ({units.get(result.def.u) ? unitName(units.get(result.def.u)!, lang) : result.def.u})<br />
          Team heal: <strong>{fx(result.heal)}</strong> ({units.get(result.heal.u) ? unitName(units.get(result.heal.u)!, lang) : result.heal.u})
        </p>
        <div className="team-bar">
          <button type="button" className="hub-btn" onClick={() => onUse(suggestedSlots(result.members))}>Open in the builder</button>
          <span className="small muted">Replaces the team in the Build tab. The leader isn't chosen by the rules; swap as you like.</span>
        </div>
      </>}
      {rules}
    </div>
  );
}
