import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LoadState, PageHeader, Panel, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { StackBadge, stackRule } from "../components";
import { iconUrl, unitName, useData, useLang, type UnitIndexEntry } from "../data";
import "./statuses.css";
import { LIST_META } from "../meta";
import { usePageMeta } from "../usePageMeta";

interface StatusEntry {
  key: string;
  name: string;
  ja?: string | null;
  icon?: string | null;
  effect?: string;
  stack?: string;
  block?: string;
  help?: string | null;
  definition?: string[];
  units: [string, string][];
}
interface Statuses { ailments: StatusEntry[]; states: StatusEntry[]; markers: StatusEntry[] }

const KINDS = [
  { value: "ailments", label: "Ailments" },
  { value: "states", label: "States" },
  { value: "markers", label: "Markers" },
] as const;
type Kind = (typeof KINDS)[number]["value"];
const SLOT: Record<string, string> = { attack: "Attack", skill1: "Skill 1", skill2: "Skill 2", ultimate: "Ultimate", ability: "Ability" };
const ui = (name: string) => `${import.meta.env.BASE_URL}ui/${name}.webp`;

/** Every status ailment, state and marker: what it does, how it stacks, who applies it. */
export default function Statuses() {
  usePageMeta(LIST_META["/statuses"]);
  const { data, loading, error } = useData<Statuses>("statuses");
  const { data: index } = useData<UnitIndexEntry[]>("units/index");
  const [params, setParams] = useSearchParams();
  const kind = (params.get("kind") as Kind) || "ailments";
  const q = params.get("q") || "";
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const units = useMemo(() => new Map((index ?? []).map((u) => [u.id, u])), [index]);
  const byKey = useMemo(() => new Map(data ? [...data.ailments, ...data.states, ...data.markers].map((e) => [e.key, e]) : []), [data]);
  if (!data) return <LoadState loading={loading} error={error} />;
  const list = data[kind].filter((e) => !q || textMatch(q, [e.name, e.ja, e.effect, ...(e.definition ?? [])]));
  return (
    <div className="statuses-page">
      <PageHeader title="Status effects"
        subtitle="Ailments, states and markers: what each does in battle, how it stacks, and which units apply it." />
      <SegmentedButtons label="Kind" selected={[kind]} onToggle={(v) => set("kind", v === "ailments" ? null : v)}
        options={KINDS.map((k) => ({ value: k.value, label: `${k.label} (${data[k.value].length})` }))} />
      <SearchBox value={q} onChange={(v) => set("q", v || null)} placeholder="Search" />
      <div className="status-list">
        {list.map((e) => <StatusCard key={e.key} e={e} kind={kind} units={units} block={e.block ? byKey.get(e.block) : undefined} />)}
        {!list.length && <p className="muted">Nothing matches.</p>}
      </div>
    </div>
  );
}

function StatusCard({ e, kind, units, block }: {
  e: StatusEntry; kind: Kind; units: Map<string, UnitIndexEntry>; block?: StatusEntry;
}) {
  const lang = useLang();
  const [all, setAll] = useState(false);
  const tag = kind === "ailments" ? "ailment" : kind === "markers" ? "marker" : e.stack === "shield" ? "shield" : "state";
  const shown = all ? e.units : e.units.slice(0, 24);
  return (
    <Panel title={<span className="status-title">
      {e.icon && <img src={ui(`Battle_status_icon_${e.icon}`)} alt="" width={24} height={24} />}
      {e.name}{e.ja && <span className="muted small" lang="ja"> {e.ja}</span>}
    </span>}>
      {e.effect && <p className="status-effect">{e.effect}</p>}
      {e.definition?.map((d) => <p key={d} className="status-effect">{d}</p>)}
      <p className="status-rule"><StackBadge tag={tag} stack={e.stack} />{stackRule(tag, e.stack)}</p>
      {block && <p className="muted small">Blocked by {block.name.toLowerCase()} ({block.units.length} unit{block.units.length === 1 ? "" : "s"}).</p>}
      {e.help && (
        <details className="status-help">
          <summary>In-game help</summary>
          <p lang="ja">{e.help}</p>
        </details>
      )}
      <h4 className="status-units-head">Applied by {e.units.length} unit{e.units.length === 1 ? "" : "s"}</h4>
      <ul className="status-units">
        {shown.map(([id, slot]) => {
          const u = units.get(id);
          return (
            <li key={`${id}-${slot}`}>
              <Link to={`/units/${id}?tab=${slot === "ability" ? "leader" : "skills"}`} title={u ? unitName(u, lang) : id}>
                <img src={iconUrl(id)} alt="" width={36} height={36} loading="lazy" />
                <span><span lang="ja">{u ? unitName(u, lang) : id}</span><span className="muted small">{SLOT[slot] ?? slot}</span></span>
              </Link>
            </li>
          );
        })}
      </ul>
      {e.units.length > 24 && (
        <button className="hub-btn hub-btn--sm" onClick={() => setAll(!all)}>{all ? "Show fewer" : `Show all ${e.units.length}`}</button>
      )}
    </Panel>
  );
}
