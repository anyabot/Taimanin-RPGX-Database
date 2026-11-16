import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CopyButton, FallbackImage, LoadState, PageHeader, Panel, SearchBox, ShareButton } from "@altterisk/game-hub";
import { packJson, unpackJson } from "@altterisk/game-hub/codec";
import { createPersisted, saveBlob } from "@altterisk/game-hub/persist";
import { textMatch } from "@altterisk/game-hub/filters";
import { RarityIcon } from "../components";
import { BundleImage } from "../bundleImage";
import { RARITY, RUNE_ICONS, familyLabel, iconUrl, isUpcoming, tr, unitName, useData, useLang,
  type RuneSet, type Text, type Unit, type UnitIndexEntry } from "../data";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";
import { renderTeamImage, type ImageColumn } from "./teamImage";
import "./team.css";

// ---- public/data/macro.json (tools/web_export/macro.py): the game's auto-skill editor lists
interface MacroOption { id: number; ja: string; en: string }
interface MacroCondition {
  id: number; group: number; any: boolean; ja: string; en: string;
  kind?: "marker" | "abnormal" | "state_effect" | "buff_debuff"; options?: MacroOption[];
  min: number; max: number; step: number; order: number;
}
interface Macro {
  actions: { id: number; ja: string; en: string }[];
  targets: { id: string; category: number; ja: string; en: string; groups: number[] }[];
  groups: Record<string, Text & { en: string }>;
  conditions: MacroCondition[];
  /** units with a transformation skill: only they get the MC actions */
  mcUnits: string[];
}

// ---- the build
/** One auto-skill line: use `action` when `target`'s `cond` holds (no target: always). */
interface MacroLine { action: number; target?: string; cond?: number; opt?: number; value?: number }
interface RuneLine { count: 2 | 4; set: number; note?: string }
interface Slot { unit?: string; runes: RuneLine[]; note?: string; hl?: boolean; macro: MacroLine[] }
interface Team { title?: string; slots: Slot[] }

const SLOTS = ["Leader", "2", "3", "4", "5", "Support"];
const emptySlot = (): Slot => ({ runes: [], macro: [] });
const emptyTeam = (): Team => ({ slots: SLOTS.map(emptySlot) });

/** Anything read back (storage, a shared link) is checked field by field. */
function sanitize(raw: unknown): Team {
  const t = (raw && typeof raw === "object" ? raw : {}) as Partial<Team>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  const str = (v: unknown, max = 200) => (typeof v === "string" && v ? v.slice(0, max) : undefined);
  const slots = SLOTS.map((_, i) => {
    const s = (Array.isArray(t.slots) && t.slots[i] && typeof t.slots[i] === "object" ? t.slots[i] : {}) as Partial<Slot>;
    return {
      unit: str(s.unit, 10), note: str(s.note), hl: s.hl === true || undefined,
      runes: (Array.isArray(s.runes) ? s.runes : []).slice(0, 6).flatMap((r: Partial<RuneLine>) =>
        num(r?.set) ? [{ count: r.count === 2 ? 2 : 4, set: r.set!, note: str(r.note, 80) } as RuneLine] : []),
      macro: (Array.isArray(s.macro) ? s.macro : []).slice(0, 20).flatMap((m: Partial<MacroLine>) =>
        num(m?.action) ? [{ action: m.action!, target: str(m.target, 10), cond: num(m.cond), opt: num(m.opt), value: num(m.value) }] : []),
    };
  });
  return { title: str(t.title, 120), slots };
}

const draft = createPersisted<Team>({ key: "taimanin.team", version: 1, empty: emptyTeam, sanitize });

const ACTION_SHORT: Record<number, string> = { 1: "Attack", 2: "S1", 3: "S2", 4: "Ougi", 5: "MC attack", 6: "MC S1", 7: "MC S2", 8: "MC Ougi" };
const ACTION_SLOT: Record<number, string> = { 1: "attack", 2: "skill1", 3: "skill2", 4: "ultimate" };
/** The editor's skill list (UIAutoSkillCustomizePopup.SetSkillInfos): the four
 *  skills, plus MC Skill 1 / Skill 2 / Ougi for transforming units; never MC normal attack. */
const BASE_ACTIONS = [1, 2, 3, 4];
const MC_ACTIONS = [6, 7, 8];
const pad = (n: number) => String(n).padStart(3, "0");
/** The title in the game's brackets, which tells versions of one character apart. */
const titleOf = (u: UnitIndexEntry, lang: "en" | "ja") => { const t = tr(u.title, lang); return t ? `【${t.replace(/^【|】$/g, "")}】` : ""; };
const fullName = (u: UnitIndexEntry, lang: "en" | "ja") => [unitName(u, lang), titleOf(u, lang)].filter(Boolean).join(" ");
type Lang = "en" | "ja";

/** The condition as the game words it, with its pick and value filled in. */
function conditionText(m: MacroLine, macro: Macro, lang: Lang): string {
  const target = macro.targets.find((t) => t.id === m.target);
  const cond = macro.conditions.find((c) => c.id === m.cond);
  if (!target || !cond) return "";
  const opt = cond.options?.find((o) => o.id === m.opt) ?? cond.options?.[0];
  let s = cond[lang];
  if (cond.kind) s = s.replace(`{${cond.kind}}`, opt ? opt[lang] : "?");
  s = s.replace("{value}", String(m.value ?? cond.min));
  if (lang === "ja") return `${target.ja}${target.ja.endsWith("の") ? "" : "の"}${s}`;
  return target.category === 5 ? s : `${target.en} ${s}`;
}

function macroText(m: MacroLine, i: number, macro: Macro, lang: Lang) {
  const c = conditionText(m, macro, lang);
  const action = lang === "ja" ? macro.actions.find((a) => a.id === m.action)?.ja ?? "?" : ACTION_SHORT[m.action] ?? "?";
  return `${pad(i + 1)} ${action}${c ? ` (${c})` : ""}`;
}

/** Sets by id, and each family's tiers (lowest first) for the tier picker. */
function useRunes() {
  const { data: sets } = useData<RuneSet[]>("runes");
  return useMemo(() => {
    const byId = new Map((sets || []).map((s) => [s.id, s]));
    const families = new Map<string, RuneSet[]>();
    for (const s of sets || []) families.set(s.family, [...(families.get(s.family) || []), s]);
    for (const l of families.values()) l.sort((a, b) => a.pieces[0].rarity - b.pieces[0].rarity);
    // families with no effect at all (N tiers only) are of no use in a build
    const list = [...families.entries()].filter(([, l]) => l.some((s) => Object.values(s.bonusFx ?? {}).some((x) => x.length)));
    return { byId, families: list };
  }, [sets]);
}

const tierLabel = (s: RuneSet) => RARITY[s.pieces[0].rarity] || "";
const bonusTitle = (s: RuneSet) => Object.entries(s.bonusFx ?? {})
  .map(([n, l]) => `${n}-piece: ${l.length ? l.map((x) => x.text).join("; ") : "no effect"}`).join("\n");

function RuneLabel({ r, set }: { r: RuneLine; set?: RuneSet }) {
  if (!set) return <span className="muted">{r.count}× ?</span>;
  return (
    <span className="team-rune" title={bonusTitle(set)}>
      <span className="team-rune-count">{r.count}</span>
      <BundleImage stem={RUNE_ICONS} name={`${set.pieces[0].icon}_s`} width={22} height={22} className="team-rune-icon" />
      <span title={set.family}>{familyLabel(set)}</span>
      <RarityIcon rarity={set.pieces[0].rarity} height={12} />
      {r.note && <span className="team-rune-note">{r.note}</span>}
    </span>
  );
}

// ---- the output: one column per slot, the way people post teams
function TeamCard({ team, units, runes, macro, selected, onSelect }: {
  team: Team; units: Map<string, UnitIndexEntry>; runes: ReturnType<typeof useRunes>; macro: Macro | null;
  selected: number; onSelect: (i: number) => void;
}) {
  const lang = useLang();
  return (
    <div className="team-card">
      {team.title && <h2 className="team-title">{team.title}</h2>}
      <div className="team-strip">
        {team.slots.map((s, i) => {
          const u = s.unit ? units.get(s.unit) : undefined;
          return (
            <button key={i} type="button" className={`team-col${i === selected ? " is-selected" : ""}${s.hl ? " is-hl" : ""}`}
              onClick={() => onSelect(i)} aria-pressed={i === selected} aria-label={`Edit ${SLOTS[i] === "Leader" || SLOTS[i] === "Support" ? SLOTS[i] : `slot ${SLOTS[i]}`}`}>
              <span className="team-col-head">{i === 0 || i === SLOTS.length - 1 ? SLOTS[i] : " "}</span>
              {u ? (
                <FallbackImage className="team-icon" srcs={[iconUrl(u.id)]} alt={fullName(u, lang)} width={88} height={88} />
              ) : <span className="team-icon team-icon-empty">+</span>}
              {u && <span className="team-name">{unitName(u, lang)}{titleOf(u, lang) && <span className="team-unit-title">{titleOf(u, lang)}</span>}</span>}
              {s.runes.length > 0 && <span className="team-runes">{s.runes.map((r, k) => <RuneLabel key={k} r={r} set={runes.byId.get(r.set)} />)}</span>}
              {s.note && <span className="team-note">{s.note}</span>}
              {macro && s.macro.length > 0 && (
                <span className="team-macro">{s.macro.map((m, k) => <span key={k}>{macroText(m, k, macro, lang)}</span>)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function teamAsText(team: Team, units: Map<string, UnitIndexEntry>, runes: ReturnType<typeof useRunes>, macro: Macro | null, lang: Lang) {
  const out: string[] = team.title ? [team.title, ""] : [];
  team.slots.forEach((s, i) => {
    const u = s.unit ? units.get(s.unit) : undefined;
    if (!u && !s.runes.length && !s.macro.length) return;
    const head = i === 0 ? "Leader" : i === SLOTS.length - 1 ? "Support" : `Slot ${SLOTS[i]}`;
    out.push(`${head}: ${u ? fullName(u, lang) : "—"}${s.hl ? " (!)" : ""}`);
    for (const r of s.runes) {
      const set = runes.byId.get(r.set);
      out.push(`  ${r.count}× ${set ? `${familyLabel(set, lang)} ${tierLabel(set)}` : "?"}${r.note ? ` (${r.note})` : ""}`);
    }
    if (s.note) out.push(`  ${s.note}`);
    if (macro) s.macro.forEach((m, k) => out.push(`  ${macroText(m, k, macro, lang)}`));
    out.push("");
  });
  return out.join("\n").trim();
}

function imageColumns(team: Team, units: Map<string, UnitIndexEntry>, runes: ReturnType<typeof useRunes>, macro: Macro | null, lang: Lang): ImageColumn[] {
  return team.slots.map((s, i) => {
    const u = s.unit ? units.get(s.unit) : undefined;
    return {
      head: i === 0 ? "Leader" : i === SLOTS.length - 1 ? "Support" : "",
      icon: u ? iconUrl(u.id) : undefined, name: u ? unitName(u, lang) : undefined, title: u ? titleOf(u, lang) || undefined : undefined, note: s.note, hl: s.hl,
      runes: s.runes.flatMap((r) => {
        const set = runes.byId.get(r.set);
        return set ? [{ count: r.count, stem: RUNE_ICONS, icon: set.pieces[0].icon, name: familyLabel(set, lang), tier: tierLabel(set), note: r.note }] : [];
      }),
      lines: macro ? s.macro.map((m, k) => macroText(m, k, macro, lang)) : [],
    };
  });
}

// ---- the editor for one slot
function UnitPicker({ index, onPick }: { index: UnitIndexEntry[]; onPick: (id: string | undefined) => void }) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const hits = useMemo(() => {
    if (!q.trim()) return [];
    return index.filter((u) => !isUpcoming(u) && textMatch(q, [u.id, u.name?.ja, u.name?.en, u.title?.ja, u.title?.en,
      u.displayName?.ja, u.displayName?.en, ...(u.aliases ?? [])])).slice(0, 48);
  }, [q, index]);
  return (
    <div className="team-picker">
      <SearchBox value={q} onChange={setQ} placeholder="Search units by name or title" label="Find a unit" />
      {hits.length > 0 && (
        <div className="team-picker-grid">
          {hits.map((u) => (
            <button key={u.id} type="button" className="team-pick" onClick={() => { onPick(u.id); setQ(""); }}
              title={fullName(u, lang)}>
              <FallbackImage srcs={[iconUrl(u.id)]} alt="" width={56} height={56} />
              <span>{unitName(u, lang)}</span>
              {u.title && <span className="muted small">{titleOf(u, lang)}</span>}
            </button>
          ))}
        </div>
      )}
      {q.trim() && !hits.length && <p className="muted small">No unit matches.</p>}
    </div>
  );
}

function RuneEditor({ line, runes, onChange, onRemove }: {
  line: RuneLine; runes: ReturnType<typeof useRunes>; onChange: (r: RuneLine) => void; onRemove: () => void;
}) {
  const set = runes.byId.get(line.set);
  const tiers = runes.families.find(([f]) => f === set?.family)?.[1] ?? [];
  return (
    <div className="team-row">
      <select className="hub-select team-count" value={line.count} aria-label="Pieces"
        onChange={(e) => onChange({ ...line, count: e.target.value === "2" ? 2 : 4 })}>
        <option value={4}>4×</option><option value={2}>2×</option>
      </select>
      <select className="hub-select" value={set?.family ?? ""} aria-label="Rune set"
        onChange={(e) => { const l = runes.families.find(([f]) => f === e.target.value)?.[1]; if (l) onChange({ ...line, set: l[l.length - 1].id }); }}>
        {runes.families.map(([f, l]) => <option key={f} value={f} title={`${f}
${bonusTitle(l[l.length - 1])}`}>{familyLabel(l[0])}</option>)}
      </select>
      <select className="hub-select team-tier" value={line.set} aria-label="Tier"
        onChange={(e) => onChange({ ...line, set: Number(e.target.value) })}>
        {tiers.map((s) => <option key={s.id} value={s.id}>{tierLabel(s)}</option>)}
      </select>
      <input className="hub-input team-grow" value={line.note ?? ""} placeholder="Note (main stats, refine…)" maxLength={80}
        aria-label="Rune note" onChange={(e) => onChange({ ...line, note: e.target.value || undefined })} />
      <button type="button" className="hub-btn hub-btn--sm" onClick={onRemove} aria-label="Remove rune line">✕</button>
      {set && <p className="team-hint small muted">{bonusTitle(set).split("\n").map((l, i) => <span key={i}>{l}</span>)}</p>}
    </div>
  );
}

const BLANK: Record<string, [string, string]> = {
  marker: ["[marker]", "［マーカー］"], abnormal: ["[ailment]", "［状態異常］"],
  state_effect: ["[effect]", "［特殊効果］"], buff_debuff: ["[stat]", "［ステータス］"],
};
/** A condition in the picker: its blanks named, the value as N. */
const blankLabel = (c: MacroCondition, lang: Lang) =>
  c[lang].replace(/\{(marker|abnormal|state_effect|buff_debuff)\}/, (_, k: string) => BLANK[k][lang === "ja" ? 1 : 0]).replace("{value}", "N");

function MacroEditor({ prio, line, macro, skills, mcSkills, actions, onChange, onRemove, onMove, first, last }: {
  prio: string; line: MacroLine; macro: Macro; skills: Record<string, string>; mcSkills: Record<string, string>; actions: number[]; onChange: (m: MacroLine) => void;
  onRemove: () => void; onMove: (d: -1 | 1) => void; first: boolean; last: boolean;
}) {
  const lang = useLang();
  const target = macro.targets.find((t) => t.id === line.target);
  const cond = macro.conditions.find((c) => c.id === line.cond);
  const groups = target ? target.groups.filter((g) => macro.conditions.some((c) => c.group === g)) : [];
  const unit = cond?.ja.includes("%") ? "%" : cond?.ja.includes("ターン") ? "turns" : "";
  const pickCond = (id: number) => {
    const c = macro.conditions.find((x) => x.id === id);
    onChange({ ...line, cond: id, opt: c?.options?.[0]?.id, value: c ? Math.max(c.min, Math.min(c.max, line.value ?? c.min)) : undefined });
  };
  return (
    <div className="team-row team-macro-row">
      <span className="team-prio">{prio}</span>
      <select className="hub-select" value={line.action} aria-label="Skill"
        onChange={(e) => onChange({ ...line, action: Number(e.target.value) })}>
        {macro.actions.filter((a) => actions.includes(a.id) || a.id === line.action).map((a) => {
          const name = a.id > 4 ? mcSkills[ACTION_SLOT[a.id - 4]] : skills[ACTION_SLOT[a.id]];
          return <option key={a.id} value={a.id}>{lang === "ja" ? a.ja : a.en}{name ? ` · ${name}` : ""}</option>;
        })}
      </select>
      <select className="hub-select" value={line.target ?? ""} aria-label="Target"
        onChange={(e) => {
          const t = macro.targets.find((x) => x.id === e.target.value);
          if (!t) return onChange({ action: line.action });
          const keep = cond && t.groups.includes(cond.group);
          const first = macro.conditions.find((c) => t.groups.includes(c.group));
          if (keep) onChange({ ...line, target: t.id });
          else onChange({ action: line.action, target: t.id, cond: first?.id, opt: first?.options?.[0]?.id, value: first?.min });
        }}>
        <option value="">Always</option>
        {macro.targets.map((t) => <option key={t.id} value={t.id}>{lang === "ja" ? t.ja : t.en}</option>)}
      </select>
      {target && (
        <select className="hub-select team-grow" value={line.cond ?? ""} aria-label="Condition" onChange={(e) => pickCond(Number(e.target.value))}>
          {groups.map((g) => (
            <optgroup key={g} label={lang === "ja" ? macro.groups[g]?.ja : macro.groups[g]?.en}>
              {macro.conditions.filter((c) => c.group === g).map((c) => (
                <option key={c.id} value={c.id}>{blankLabel(c, lang)}</option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {cond?.options && (
        <select className="hub-select" value={line.opt ?? cond.options[0]?.id} aria-label="Which"
          onChange={(e) => onChange({ ...line, opt: Number(e.target.value) })}>
          {cond.options.map((o) => <option key={o.id} value={o.id}>{o[lang]}</option>)}
        </select>
      )}
      {cond && (
        <span className="team-value">
          <input className="hub-input" type="number" inputMode="numeric" min={cond.min} max={cond.max} step={cond.step}
            value={line.value ?? cond.min} aria-label="Value"
            onChange={(e) => onChange({ ...line, value: Math.max(cond.min, Math.min(cond.max, Number(e.target.value) || cond.min)) })} />
          {unit && <span className="muted small">{unit}</span>}
        </span>
      )}
      <span className="team-row-tools">
        <button type="button" className="hub-btn hub-btn--sm" disabled={first} onClick={() => onMove(-1)} aria-label="Move up">↑</button>
        <button type="button" className="hub-btn hub-btn--sm" disabled={last} onClick={() => onMove(1)} aria-label="Move down">↓</button>
        <button type="button" className="hub-btn hub-btn--sm" onClick={onRemove} aria-label="Remove line">✕</button>
      </span>
    </div>
  );
}

function SlotEditor({ slot, i, index, runes, macro, onChange }: {
  slot: Slot; i: number; index: UnitIndexEntry[]; runes: ReturnType<typeof useRunes>; macro: Macro | null; onChange: (s: Slot) => void;
}) {
  const lang = useLang();
  const { data: unit } = useData<Unit>(slot.unit ? `units/${slot.unit}` : null);
  const skills = useMemo(() => {
    const out: Record<string, string> = {};
    for (const sk of Object.values(unit?.skills ?? {})) { const n = tr(sk.name, lang); if (n) out[sk.slot] = n; }
    return out;
  }, [unit, lang]);
  // the transformed kit: the last form's mode skills, by slot
  const mcSkills = useMemo(() => {
    const out: Record<string, string> = {};
    const mode = unit?.forms[unit.forms.length - 1]?.modes?.[0];
    for (const key of mode?.skills ?? []) {
      const sk = unit?.skills[key];
      const n = sk && tr(sk.name, lang);
      if (sk && n) out[sk.slot] = n;
    }
    return out;
  }, [unit, lang]);
  const actions = slot.unit && macro?.mcUnits.includes(slot.unit) ? [...BASE_ACTIONS, ...MC_ACTIONS] : BASE_ACTIONS;
  const u = slot.unit ? index.find((x) => x.id === slot.unit) : undefined;
  const firstSet = runes.families[0]?.[1];
  const setRune = (k: number, r: RuneLine | null) =>
    onChange({ ...slot, runes: r ? slot.runes.map((x, j) => (j === k ? r : x)) : slot.runes.filter((_, j) => j !== k) });
  const setMacro = (k: number, m: MacroLine | null) =>
    onChange({ ...slot, macro: m ? slot.macro.map((x, j) => (j === k ? m : x)) : slot.macro.filter((_, j) => j !== k) });
  const move = (k: number, d: -1 | 1) => {
    const l = [...slot.macro];
    [l[k], l[k + d]] = [l[k + d], l[k]];
    onChange({ ...slot, macro: l });
  };
  const name = i === 0 ? "Leader" : i === SLOTS.length - 1 ? "Support" : `Slot ${SLOTS[i]}`;

  return (
    <Panel title={<>{name}{u && <>: <Link to={`/units/${u.id}`}>{fullName(u, lang)}</Link></>}</>} className="team-editor">
      <section>
        <h3>Unit</h3>
        <div className="team-row">
          {u && <FallbackImage srcs={[iconUrl(u.id)]} alt="" width={40} height={40} />}
          <span className="team-grow">{u ? <>{unitName(u, lang)} <span className="muted small">{titleOf(u, lang)}</span></> : <span className="muted">Empty</span>}</span>
          {u && <button type="button" className="hub-btn hub-btn--sm" onClick={() => onChange({ ...slot, unit: undefined })}>Clear</button>}
        </div>
        <UnitPicker index={index} onPick={(id) => onChange({ ...slot, unit: id })} />
      </section>

      <section>
        <h3>Runes</h3>
        {slot.runes.map((r, k) => <RuneEditor key={k} line={r} runes={runes} onChange={(x) => setRune(k, x)} onRemove={() => setRune(k, null)} />)}
        {firstSet && slot.runes.length < 6 && (
          <button type="button" className="hub-btn hub-btn--sm"
            onClick={() => onChange({ ...slot, runes: [...slot.runes, { count: slot.runes.some((r) => r.count === 4) ? 2 : 4, set: firstSet[firstSet.length - 1].id }] })}>
            + Rune set
          </button>
        )}
      </section>

      <section>
        <h3>Note</h3>
        <div className="team-row">
          <input className="hub-input team-grow" value={slot.note ?? ""} maxLength={200} placeholder="Bloom, priority, alternatives…"
            aria-label="Note" onChange={(e) => onChange({ ...slot, note: e.target.value || undefined })} />
          <label className="team-check">
            <input type="checkbox" checked={!!slot.hl} onChange={(e) => onChange({ ...slot, hl: e.target.checked || undefined })} />
            Highlight
          </label>
        </div>
      </section>

      <section>
        <h3>Auto skill</h3>
        <p className="small muted">The game's auto-skill macro: lines are tried top to bottom; the first whose condition holds is used.</p>
        {macro ? (
          <>
            {slot.macro.map((m, k) => (
              <MacroEditor key={k} prio={pad(k + 1)} line={m} macro={macro} skills={skills} mcSkills={mcSkills} actions={actions} onChange={(x) => setMacro(k, x)}
                onRemove={() => setMacro(k, null)} onMove={(d) => move(k, d)} first={k === 0} last={k === slot.macro.length - 1} />
            ))}
            {slot.macro.length < 20 && (
              <button type="button" className="hub-btn hub-btn--sm" onClick={() => onChange({ ...slot, macro: [...slot.macro, { action: 3 }] })}>+ Line</button>
            )}
          </>
        ) : <p className="muted small">Loading…</p>}
      </section>
    </Panel>
  );
}

export default function TeamBuilder() {
  usePageMeta(LIST_META["/team"]);
  const lang = useLang();
  const { data: index, loading, error } = useData<UnitIndexEntry[]>("units/index");
  const macro = useData<Macro>("macro").data ?? null;
  const runes = useRunes();
  const [params, setParams] = useSearchParams();
  const [team, setTeamState] = useState<Team>(() => draft.load());
  const [selected, setSelected] = useState(0);
  const [shareError, setShareError] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<"" | "ok" | "fail">("");
  const loaded = useRef<string | null>(null);

  // A shared link (?b=...) replaces the draft once it is read.
  useEffect(() => {
    const code = params.get("b");
    if (!code || loaded.current === code) return;
    loaded.current = code;
    unpackJson(code).then((raw) => { const t = sanitize(raw); setTeamState(t); draft.save(t); setShareError(""); })
      .catch(() => setShareError("This team link is damaged or incomplete."));
  }, [params]);

  const setTeam = (t: Team) => {
    setTeamState(t);
    draft.save(t);
    if (params.has("b")) { const p = new URLSearchParams(params); p.delete("b"); setParams(p, { replace: true }); }
  };
  // unreleased units are never shown, even from a saved team or a shared link
  const units = useMemo(() => new Map((index || []).filter((u) => !isUpcoming(u)).map((u) => [u.id, u])), [index]);
  const drawImage = () => renderTeamImage(team.title, imageColumns(team, units, runes, macro, lang));
  const copyImage = async () => {
    setSaving(true);
    try {
      // a promise in the ClipboardItem keeps the click's permission while the picture is drawn (Safari needs that)
      await navigator.clipboard.write([new ClipboardItem({ "image/png": drawImage() })]);
      setCopied("ok");
    } catch {
      setCopied("fail");
    } finally {
      setSaving(false);
      window.setTimeout(() => setCopied(""), 2000);
    }
  };
  const saveImage = async () => {
    setSaving(true);
    try {
      const blob = await drawImage();
      const name = (team.title || "team").replace(/[\/:*?"<>|]+/g, "").trim().slice(0, 60) || "team";
      saveBlob(blob, `${name}.png`);
    } catch {
      setShareError("Could not make the picture (an icon failed to load). Try again.");
    } finally {
      setSaving(false);
    }
  };
  const shareUrl = async () => `${window.location.origin}${window.location.pathname}?b=${await packJson(team)}`;

  return (
    <div className="team-page">
      <PageHeader title="Team builder"
        subtitle="Units, rune sets and the game's auto-skill macro for each slot, ready to share. Click a column to edit it." />
      <LoadState loading={loading} error={error} />
      {index && <>
        {shareError && <p className="team-error">{shareError}</p>}
        <div className="team-bar">
          <input className="hub-input team-grow" value={team.title ?? ""} placeholder="Team name (optional)" maxLength={120}
            aria-label="Team name" onChange={(e) => setTeam({ ...team, title: e.target.value || undefined })} />
          <ShareButton value={shareUrl} label="Copy link" />
          <CopyButton value={() => teamAsText(team, units, runes, macro, lang)} label="Copy as text" />
          <button type="button" className="hub-btn" onClick={copyImage} disabled={saving}
            title="Copy the team picture to the clipboard, to paste into Discord or a chat">
            {copied === "ok" ? "Image copied" : copied === "fail" ? "Copy failed" : "Copy image"}
          </button>
          <button type="button" className="hub-btn" onClick={saveImage} disabled={saving}>{saving ? "Drawing…" : "Save image"}</button>
          <button type="button" className="hub-btn" onClick={() => { if (window.confirm("Clear the whole team?")) { setTeam(emptyTeam()); setSelected(0); } }}>
            Clear
          </button>
        </div>
        <TeamCard team={team} units={units} runes={runes} macro={macro} selected={selected} onSelect={setSelected} />
        <SlotEditor key={selected} slot={team.slots[selected]} i={selected} index={index || []} runes={runes} macro={macro}
          onChange={(s) => setTeam({ ...team, slots: team.slots.map((x, j) => (j === selected ? s : x)) })} />
        <p className="small muted team-foot">
          Skill, target and condition lists are the game's own (SkillMacro tables of the client). The team is kept in this browser;
          "Copy link" makes a link that opens it anywhere; "Copy image" puts the picture on the clipboard and "Save image" downloads it as a PNG.
        </p>
      </>}
    </div>
  );
}
