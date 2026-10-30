import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckboxGroup, FallbackImage, FilterChip, FilterRow, GroupCard, LoadState, PageHeader } from "@altterisk/game-hub";
import { listState, searchParamsAdapter } from "@altterisk/game-hub/filters";
import { ELEMENTS, iconUrl, isUpcoming, tr, unitName, useData, useLang, type UnitIndexEntry } from "../data";
import { ElementIcon, RarityIcon, StackBadge, StackRules } from "../components";
import type { StackTag } from "../data";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";

/** One row of public/data/buffs.json (tools/web_export/buffs.py). */
interface BuffRow {
  u: string;
  c: string;
  k: string;
  v: number;
  p: 0 | 1;
  sc: "self" | "all" | "some" | "element" | "trait" | "enemies" | "enemy";
  el?: string;
  tr?: string;
  t: number;
  s: "attack" | "skill1" | "skill2" | "ultimate" | "leader";
  n?: string;
  x: string;
  /** other durations of the same buff in another variant of the skill: [turns, condition] */
  alt?: [number, string][];
  /** stacking tag and state group of the effect line (see STACK) */
  g?: StackTag;
  gs?: string;
}

const CATEGORIES = [
  { k: "stat", label: "Stats" },
  { k: "damage", label: "Damage" },
  { k: "resist", label: "Resistance" },
  { k: "defense", label: "Defense" },
  { k: "recovery", label: "Recovery" },
  { k: "utility", label: "Utility" },
  { k: "debuff", label: "Enemy debuffs" },
  { k: "ailment", label: "Status ailments" },
];
const DEBUFF_COLOR = "#f7768e";
// tools/web_export/effects.py TRAIT, in game order
const TRAITS = ["Taimanin", "Oni", "Undead", "Dragon", "Magic", "Idol", "Poisoner", "School", "Nomad", "Onmyoji", "UFS", "Prison Battleship"];
const SOURCES = [
  { value: "skill", label: "Skills" },
  { value: "ultimate", label: "Ultimate" },
  { value: "leader", label: "Leader skill" },
];
const SOURCE_LABEL: Record<BuffRow["s"], string> = { attack: "Normal attack", skill1: "Skill 1", skill2: "Skill 2", ultimate: "Ultimate", leader: "Leader" };
const sourceKind = (s: BuffRow["s"]) => (s === "leader" ? "leader" : s === "ultimate" ? "ultimate" : "skill");
// lower is better: ranked by the most negative value
const LOWER_IS_BETTER = new Set(["Skill SP cost", "Ultimate SP cost", "Damage taken"]);
const PREVIEW = 10;

function target(r: BuffRow) {
  switch (r.sc) {
    case "self": return "Self";
    case "all": return "All allies";
    case "some": return "Some allies";
    case "element": return `${r.el} allies`;
    case "trait": return `${r.tr} allies`;
    case "enemies": return "All enemies";
    case "enemy": return "1 enemy";
  }
}
/** Does the buff land on this receiver? Exact: "All allies" is not "Taimanin allies". */
function receives(r: BuffRow, to: string) {
  if (to === "all" || to === "self") return r.sc === to;
  if (to.startsWith("el:")) return r.sc === "element" && r.el === to.slice(3);
  if (to.startsWith("tr:")) return r.sc === "trait" && r.tr === to.slice(3);
  return true;
}
const fmtValue = (r: BuffRow) => (r.c === "ailment" ? `${r.v}%` : `${r.v > 0 ? "+" : ""}${r.v}${r.p ? "%" : ""}`);
const fmtTurns = (r: BuffRow) => (r.t > 0 ? `${r.t} turn${r.t === 1 ? "" : "s"}` : r.t < 0 ? "Rest of battle" : r.s === "leader" ? "Always" : "Instant");

/** Who gives the biggest X to whom: one ranked list per effect, split into
 *  timed skill effects and always-on leader effects (not comparable). */
export default function Buffs() {
  usePageMeta(LIST_META["/buffs"]);
  const { data: rows, loading, error } = useData<BuffRow[]>("buffs");
  const { data: index } = useData<UnitIndexEntry[]>("units/index");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const adapter = searchParamsAdapter(params, setParams);
  const url = listState(adapter);

  const cat = CATEGORIES.find((c) => c.k === url.text("cat"))?.k ?? "stat";
  const sources = url.list("source");
  const showUpcoming = url.text("upcoming") === "1";
  // receiver: "" any, "all", "self", "el:<element>", "tr:<trait>"
  const to = url.text("to");
  const enemySide = cat === "debuff" || cat === "ailment";

  const units = useMemo(() => new Map((index || []).map((u) => [u.id, u])), [index]);

  // Units already in the master data ahead of release are hidden unless asked for.
  const upcoming = useMemo(() => new Set((index || []).filter(isUpcoming).map((u) => u.id)), [index]);
  const upcomingCount = useMemo(() => new Set((rows || []).filter((r) => upcoming.has(r.u)).map((r) => r.u)).size, [rows, upcoming]);
  const bySource = useMemo(() => (rows || []).filter((r) =>
    (showUpcoming || !upcoming.has(r.u)) && (!sources.length || sources.includes(sourceKind(r.s)))),
  [rows, sources.join(), showUpcoming, upcoming]);
  // Enemy debuffs and ailments always land on enemies: the receiver filter is ally-side only.
  const filtered = useMemo(() => bySource.filter((r) => !to || r.c === "debuff" || r.c === "ailment" || receives(r, to)),
    [bySource, to]);
  const unitsIn = (list: BuffRow[]) => new Set(list.map((r) => r.u)).size;
  const byCat = useMemo(() => {
    const m = new Map<string, BuffRow[]>();
    for (const r of filtered) m.set(r.c, [...(m.get(r.c) || []), r]);
    return m;
  }, [filtered]);
  const keys = useMemo(() => {
    const m = new Map<string, BuffRow[]>();
    for (const r of byCat.get(cat) || []) m.set(r.k, [...(m.get(r.k) || []), r]);
    return [...m.entries()].sort((a, b) => unitsIn(b[1]) - unitsIn(a[1]));
  }, [byCat, cat]);
  const key = keys.find(([k]) => k === url.text("k"))?.[0] ?? keys[0]?.[0];

  const groups = useMemo(() => {
    const list = keys.find(([k]) => k === key)?.[1] || [];
    const m = new Map<string, BuffRow[]>();
    for (const r of list) {
      const g = `${r.s === "leader" ? "leader" : "skill"}|${r.p}`;
      m.set(g, [...(m.get(g) || []), r]);
    }
    const lower = LOWER_IS_BETTER.has(key || "");
    return [...m.entries()].map(([g, rs]) => {
      const seen = new Set<string>();
      const ranked = [...rs]
        .sort((a, b) => (lower ? a.v - b.v : Math.abs(b.v) - Math.abs(a.v)) || b.t - a.t)
        .filter((r) => !seen.has(r.u) && seen.add(r.u));
      const [kind, pct] = g.split("|");
      return { g, kind, pct: pct === "1", ranked };
    }).sort((a, b) => (a.kind === b.kind ? Number(b.pct) - Number(a.pct) : a.kind === "skill" ? -1 : 1));
  }, [keys, key]);

  // Receiver chips count units for the current type and effect, whatever receiver is picked.
  const receivers = useMemo(() => {
    const list = bySource.filter((r) => r.c === cat && r.k === key);
    const count = (want: string) => unitsIn(list.filter((r) => receives(r, want)));
    const factions = [
      ...ELEMENTS.map((e) => ({ value: `el:${e}`, label: <span className="chip-icon"><ElementIcon element={e} size={14} />{e}</span> })),
      ...TRAITS.map((t) => ({ value: `tr:${t}`, label: <>{t}</> })),
    ].map((f) => ({ ...f, n: count(f.value) }));
    return { any: unitsIn(list), all: count("all"), self: count("self"), factions };
  }, [bySource, cat, key]);

  if (!rows) return <LoadState loading={loading} error={error} />;
  return (
    <div className="buffs-page">
      <PageHeader title="Buff ranking"
        subtitle="Who gives the biggest effect, by type and target. Values come from each unit's top form; one row per unit (its best)." />
      <details className="stack-help">
        <summary>How effects stack</summary>
        <StackRules />
      </details>
      <FilterRow label="Type">
        {CATEGORIES.map((c) => (
          <FilterChip key={c.k} active={c.k === cat} count={unitsIn(byCat.get(c.k) || [])}
            color={c.k === "debuff" || c.k === "ailment" ? DEBUFF_COLOR : undefined}
            onClick={() => adapter.set({ cat: c.k, k: null })}>
            {c.label}
          </FilterChip>
        ))}
      </FilterRow>
      <FilterRow label="Effect">
        {keys.map(([k, list]) => (
          <FilterChip key={k} active={k === key} count={unitsIn(list)} onClick={() => url.setText("k", k)}>{k}</FilterChip>
        ))}
        {!keys.length && <span className="muted small">Nothing matches these filters.</span>}
      </FilterRow>
      {!enemySide && (
        <>
          <FilterRow label="Receiver">
            <FilterChip active={!to} count={receivers.any} onClick={() => url.setText("to", "")}>Any</FilterChip>
            <FilterChip active={to === "all"} count={receivers.all} onClick={() => url.setText("to", "all")}>All allies</FilterChip>
            <FilterChip active={to === "self"} count={receivers.self} onClick={() => url.setText("to", "self")}>Self</FilterChip>
          </FilterRow>
          <FilterRow label="Faction">
            {receivers.factions.filter((f) => f.n > 0 || f.value === to).map((f) => (
              <FilterChip key={f.value} active={to === f.value} count={f.n} onClick={() => url.setText("to", to === f.value ? "" : f.value)}>{f.label}</FilterChip>
            ))}
            {!receivers.factions.some((f) => f.n > 0) && <span className="muted small">No faction-only versions of this effect.</span>}
          </FilterRow>
        </>
      )}
      {upcomingCount > 0 && (
        <FilterRow label="Release">
          <FilterChip active={showUpcoming} count={upcomingCount} onClick={() => url.setText("upcoming", showUpcoming ? "" : "1")}
            title="Units already in the game data but not released yet">Include upcoming</FilterChip>
        </FilterRow>
      )}
      <details className="buff-filters" open={sources.length > 0}>
        <summary>Source filter{sources.length ? ` (${sources.length})` : ""}</summary>
        <div className="buff-filter-grid">
          <CheckboxGroup title="Source" options={SOURCES} selected={sources} onToggle={(v) => url.toggle("source", v)} />
          {sources.length > 0 && (
            <button className="hub-btn" onClick={() => url.clear(["source"])}>Clear filters</button>
          )}
        </div>
      </details>
      <div className="buff-groups">
        {groups.map(({ g, kind, pct, ranked }) => {
          const open = expanded.has(g);
          const shown = open ? ranked : ranked.slice(0, PREVIEW);
          return (
            <GroupCard key={g} className="buff-group"
              title={`${key} · ${kind === "leader" ? "leader skills" : "skills"}${groups.filter((x) => x.kind === kind).length > 1 ? (pct ? " (%)" : " (flat)") : ""}`}
              count={`${ranked.length} units`}
              note={kind === "leader" ? "Always on while the unit leads." : "Timed effects from normal attacks, skills and ultimates."}>
              <table className="hub-table hub-table--stack buff-table">
                <thead><tr><th>#</th><th>Value</th><th>Unit</th><th>Target</th><th>Duration</th><th>Source</th></tr></thead>
                <tbody>
                  {shown.map((r, i) => {
                    const u = units.get(r.u);
                    return (
                      <tr key={`${r.u}-${i}`}>
                        <td data-label="#" className="muted">{i + 1}</td>
                        <td data-label="Value" className="buff-val" title={r.x}><strong>{fmtValue(r)}</strong>
                          {r.g && <div><StackBadge tag={r.g} stack={r.gs} /></div>}</td>
                        <td data-label="Unit">
                          <Link className="buff-unit" to={`/units/${r.u}?tab=${r.s === "leader" ? "leader" : "skills"}`}>
                            <FallbackImage srcs={[iconUrl(r.u)]} alt="" width={36} height={36} loading="lazy" missingClassName="buff-noicon" />
                            <span>
                              <span className="buff-unit-name">{u ? unitName(u, lang) : r.u}</span>
                              {u && <span className="buff-unit-meta"><RarityIcon rarity={u.rarity} height={12} /><ElementIcon element={u.element} size={12} />{tr(u.title, lang)}</span>}
                            </span>
                          </Link>
                        </td>
                        <td data-label="Target" className="buff-target">{target(r)}{r.n && <div className="muted small">{r.n}</div>}</td>
                        <td data-label="Duration" className="muted">{fmtTurns(r)}
                          {r.alt?.map(([t, n]) => <div key={n} className="small">{fmtTurns({ ...r, t })}: {n}</div>)}</td>
                        <td data-label="Source" className="muted">{SOURCE_LABEL[r.s]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {ranked.length > PREVIEW && (
                <button className="hub-btn buff-more" onClick={() => setExpanded((s) => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; })}>
                  {open ? "Show top 10" : `Show all ${ranked.length}`}
                </button>
              )}
            </GroupCard>
          );
        })}
      </div>
      <p className="muted small">Hover a value for the full effect text. Ability (passive) effects are not included yet: they are only stored as text.</p>
    </div>
  );
}
