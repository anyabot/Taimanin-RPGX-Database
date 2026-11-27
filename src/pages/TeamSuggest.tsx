// Team builder, "Suggest" tab: a team from the units the player owns, by the
// simple rules in src/teamSuggest.ts.
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FallbackImage, LoadState, Panel } from "@altterisk/game-hub";
import { useOwned } from "../collection";
import { iconUrl, isUpcoming, loader, tr, unitName, useData, useLang, type Unit, type UnitIndexEntry } from "../data";
import { ElementIcon, RarityIcon } from "../components";
import { FREE_BUFFER, RULES, boostedSpRows, suggestTeam, type BuffRow, type Candidate, type Member, type Plan, type Role } from "../teamSuggest";

const ROLE: Record<Role, string> = { sp: "SP", spot: "SP over time", buffer: "Buffer", healer: "Healer", dps: "DPS", exp: "Rank EXP" };
const SKILL: Record<BuffRow["s"], string> = { attack: "Attack", skill1: "S1", skill2: "S2", ultimate: "Ougi", leader: "Leader" };
/** the team builder's auto-skill action for a skill slot */
const ACTION: Record<BuffRow["s"], number> = { attack: 1, skill1: 2, skill2: 3, ultimate: 4, leader: 0 };

/** What the builder gets: one entry per slot (leader first). */
export interface SuggestedSlot { unit: string; note: string; macro: { action: number }[] }

const fx = (r: BuffRow) => `${SKILL[r.s]}: ${r.x}`;

function roleLabel(m: Member) {
  const role = m.role === "sp" ? (m.firstSp ? "SP 1 (moves first)" : "SP") : ROLE[m.role];
  return m.leader ? `Leader · ${role}` : role;
}

type Content = "ap" | "bp";
const CONTENT: Record<Content, { label: string; about: string; support: string }> = {
  ap: { label: "AP content team", about: "Story and other quests that cost AP: the only content that gives Rank EXP, and the support unit fights with all her skills.",
    support: "Borrow her from the support list (filter by Superhuman to find her quickly). She fights with all her skills and equipment." },
  bp: { label: "BP content team", about: "Raids and other content that costs BP: no Rank EXP, and only the support unit's leader skill works.",
    support: "Often on the support list. In BP content only her leader skill works." },
};

/** The slot note: what to cast (rule 6). */
function scriptNote(m: Member) {
  if (m.only) return `Only cast ${SKILL[m.only.s]} (SP restore)`;
  const casts = [...m.why, ...m.extra].filter((r, i, l) => l.findIndex((x) => x.s === r.s) === i).map((r) => SKILL[r.s]);
  return casts.length ? `${ROLE[m.role]}. Cast ${casts.join(", ")}` : ROLE[m.role];
}

/** Leader first, then the members, the support last (the builder's 6 slots). */
export function suggestedSlots(plan: Plan, content: Content): SuggestedSlot[] {
  const slots: SuggestedSlot[] = plan.members.map((m) => ({ unit: m.id, note: scriptNote(m), macro: m.only ? [{ action: ACTION[m.only.s] }] : [] }));
  while (slots.length < 5) slots.push({ unit: "", note: "", macro: [] });
  return [...slots, { unit: plan.support, note: content === "ap" ? "Support: fights with all her skills" : "Support: only her leader skill works", macro: [] }];
}

/** How to get the free Yukikaze 【Lightning Taimanin】 (00068), from the event,
 *  unit and item data: she drops as SR in Story event #1 (Event Archive), and her
 *  ATK/DEF ougi only comes with the LR form, so she needs two awakenings. */
function FreeUnitGuide() {
  return (
    <div className="team-suggest-get small">
      <p><strong>You don't own her yet.</strong> She's free. Get her, she's every team's fallback buffer:</p>
      <ol>
        <li>Open the <strong>Event Archive</strong> and play Story event #1{" "}
          <Link to="/events/es001" lang="ja">「雷撃の対魔忍」</Link>. Every quest in it (5 sections × 3 difficulties) can drop her;
          later sections and higher difficulties drop her more often. <Link to="/story/battles/es001">Quests and drops</Link></li>
        <li>She drops as <strong>SR</strong>. Her ATK/DEF +60% ougi only unlocks at <strong>LR</strong>, so awaken her twice:
          <ul>
            <li>SR → UR: 5 Natural Shard, 15 Natural Drop, 5 Natural Orb, 1 Mystic Treasure</li>
            <li>UR → LR: 10 Natural Drop, 15 Natural Orb, 4 Primordial Treasure, 2 Mystic Treasure</li>
          </ul>
        </li>
        <li>Natural materials and Primordial Treasure: the daily awakening quests{" "}
          (<Link to="/quests/daily-1">Science/Natural</Link> Mon &amp; Sat, <Link to="/quests/daily-4">Natural/Spiritual</Link> Thu &amp; Sun,{" "}
          <Link to="/quests/daily-11">Natural</Link> Fri). Mystic Treasure: <Link to="/items/evo00017">map event shops</Link>.</li>
      </ol>
      <p className="muted">Then mark her owned on the <Link to="/collection?q=00068">Collection</Link> page. <Link to="/units/00068">Unit page</Link></p>
    </div>
  );
}

export default function TeamSuggest({ index, onUse }: { index: UnitIndexEntry[]; onUse: (slots: SuggestedSlot[]) => void }) {
  const lang = useLang();
  const owned = useOwned();
  const { data: rows, loading, error } = useData<BuffRow[]>("buffs");
  const units = useMemo(() => new Map(index.map((u) => [u.id, u])), [index]);
  // SP restores under 70 that a modifier may raise (e.g. by the allies' SPD): read those units' skills
  const [boosted, setBoosted] = useState<BuffRow[]>([]);
  useEffect(() => {
    if (!rows) return;
    const ids = [...new Set(rows.filter((r) => owned.has(r.u) && r.k === "SP restore" && r.sc === "all" && !r.p && r.v < 70 && r.s !== "leader").map((r) => r.u))];
    let live = true;
    Promise.all(ids.map(async (id) => {
      const u = units.get(id);
      const unit = await loader.load<Unit>(`units/${id}`).catch(() => null);
      if (!u || !unit) return [];
      const top = unit.forms[unit.forms.length - 1];
      const skills = (top?.skills ?? Object.keys(unit.skills)).map((k) => unit.skills[k]).filter(Boolean)
        .map((sk) => ({ slot: sk.slot, effects: sk.effects }));
      return boostedSpRows(id, skills, { element: u.element, spd: u.stats.spd, def: u.stats.def });
    })).then((l) => { if (live) setBoosted(l.flat()); });
    return () => { live = false; };
  }, [rows, owned, units]);
  const [content, setContent] = useState<Content>("ap");
  const result = useMemo(() => {
    if (!rows || !owned.ids.size) return null;
    const cand = (u: UnitIndexEntry, free?: boolean): Candidate =>
      ({ id: u.id, element: u.element, traits: u.traits, atk: u.stats.atk, spd: u.stats.spd, def: u.stats.def, free });
    const mine = index.filter((u) => owned.has(u.id) && !isUpcoming(u)).map((u) => cand(u));
    const yuki = units.get(FREE_BUFFER);
    if (yuki && !owned.has(FREE_BUFFER)) mine.push(cand(yuki, true));
    return suggestTeam(mine, [...rows, ...boosted]);
  }, [rows, boosted, owned, index, units]);

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
      {result?.ok && (() => {
        const plan = result[content];
        const name = (id: string) => (units.get(id) ? unitName(units.get(id)!, lang) : id);
        const sup = units.get(plan.support);
        return <>
          <div className="hub-tabs team-content-tabs" role="tablist" aria-label="Content">
            {(["ap", "bp"] as Content[]).map((c) => (
              <button key={c} type="button" role="tab" id={`team-content-${c}`} aria-controls="team-content-panel" aria-selected={content === c}
                className="hub-tab" onClick={() => setContent(c)}>{CONTENT[c].label}</button>
            ))}
          </div>
          <div role="tabpanel" id="team-content-panel" aria-labelledby={`team-content-${content}`}>
          <Panel title={CONTENT[content].label} className={`team-content team-content--${content}`} note={CONTENT[content].about}>
          {plan.note && <p className="small muted">{plan.note}</p>}
          {plan.replaced && <p className="small">Takes the place of the BP team's {ROLE[plan.replaced.role]} <strong>{name(plan.replaced.id)}</strong> to lead.</p>}
          <div className="team-suggest-list">
            {plan.members.map((m) => {
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
                      {(m.role === "dps" || m.role === "exp") && u && <span className="small muted">ATK {u.stats.atk}</span>}
                    </div>
                    {!owned.has(m.id) && <FreeUnitGuide />}
                    <ul className="team-suggest-fx small">
                      {m.leader && plan.leaderWhy.map((r, i) => <li key={`l${i}`}>{fx(r)}</li>)}
                      {m.why.map((r, i) => <li key={`w${i}`}>{fx(r)}{r.n && <span className="muted"> ({r.n})</span>}</li>)}
                      {m.only && <li className="team-suggest-script">Script: only cast {SKILL[m.only.s]}</li>}
                      {m.extra.length > 0 && <li className="team-suggest-script">Script: also cast {m.extra.map(fx).join("; ")}</li>}
                    </ul>
                  </div>
                </div>
              );
            })}
            <div className="team-suggest-row role-support">
              <FallbackImage srcs={[iconUrl(plan.support)]} alt="" width={64} height={64} />
              <div className="team-suggest-body">
                <div className="team-suggest-head">
                  <span className="team-suggest-role">Support</span>
                  <Link to={`/units/${plan.support}?tab=skills`}>{sup ? unitName(sup, lang) : plan.support}</Link>
                  {sup && <span className="muted small">{tr(sup.title, lang)}</span>}
                  {sup && <RarityIcon rarity={sup.rarity} height={12} />}
                  {sup && <ElementIcon element={sup.element} size={14} />}
                </div>
                <p className="small muted">{CONTENT[content].support}</p>
                <ul className="team-suggest-fx small">
                  {plan.supportWhy.map((r, i) => <li key={i}>{fx(r)}</li>)}
                </ul>
              </div>
            </div>
          </div>
          <p className="small">
            Team ATK buff: <strong>{fx(plan.atk)}</strong> ({name(plan.atk.u)})<br />
            Team DEF buff: <strong>{fx(plan.def)}</strong> ({name(plan.def.u)})<br />
            Team heal: <strong>{fx(plan.heal)}</strong> ({name(plan.heal.u)})
          </p>
          <div className="team-bar">
            <button type="button" className="hub-btn" onClick={() => onUse(suggestedSlots(plan, content))}>Open in the builder</button>
            <span className="small muted">Replaces the team in the Build tab, leader and support included.</span>
          </div>
          </Panel>
          </div>
        </>;
      })()}
      {rules}
    </div>
  );
}
