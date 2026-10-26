import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, LoadState, PageHeader, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { tr, useData, useLang, type Battles, type QuestGroup, type QuestSection } from "../data";
import { BattleBody } from "../battles";
import { DispatchView } from "./Dispatch";

const today = new Date().toISOString().slice(0, 10);

/** Battle content with no story: Arena towers, daily quests, mini events (tools/web_export/quests.py). */
export default function QuestList() {
  const { data: index, loading, error } = useData<QuestSection[]>("quests/index");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") || "tower";
  const q = params.get("q") || "";
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const dispatch = section === "dispatch";
  const sec = dispatch ? undefined : index?.find((s) => s.key === section) ?? index?.[0];
  const groups = useMemo(() => (sec?.groups ?? []).filter((g) =>
    !q || textMatch(q, [g.id, g.title?.ja, g.title?.en, g.label?.ja, g.note])), [sec, q]);

  if (!index) return <LoadState loading={loading} error={error} />;
  return (
    <div className="story-page">
      <PageHeader title="Quests"
        subtitle="Arena towers, daily quests, mini events and dispatch: stages, enemies, rules and drops from the game's own data." />
      <SegmentedButtons label="Section" selected={[dispatch ? "dispatch" : sec?.key ?? ""]}
        options={[...index.map((s) => ({ value: s.key, label: `${s.label} (${s.groups.length})` })), { value: "dispatch", label: "Dispatch" }]}
        onToggle={(v) => { const next = new URLSearchParams(params); next.set("section", v); setParams(next, { replace: true }); }} />
      {dispatch ? <DispatchView /> : (
        <>
          <SearchBox value={q} onChange={(v) => set("q", v || null)} placeholder="Search titles" />
          <div className="quest-groups">
            {groups.map((g) => <QuestCard key={g.id} g={g} lang={lang} />)}
            {!groups.length && <p className="muted">No titles match.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function dates(g: QuestGroup): string | null {
  if (!g.start) return null;
  const end = g.end && g.end < "2090" ? g.end : null;
  const s = end ? `${g.start} – ${end}` : `from ${g.start}`;
  return g.runs && g.runs > 1 ? `${s} (${g.runs} runs)` : s;
}

function QuestCard({ g, lang }: { g: QuestGroup; lang: "en" | "ja" }) {
  const when = dates(g);
  const upcoming = !!g.start && g.start > today;
  return (
    <Link className="quest-card" to={`/quests/${g.id}`}>
      <span className="quest-card-title" lang="ja">{tr(g.title, lang) || g.id}{g.kind ? ` · ${g.kind}` : ""}</span>
      {g.label && <span className="muted" lang="ja">{tr(g.label, lang)}</span>}
      <span className="muted">{[g.note, `${g.quests} quest${g.quests === 1 ? "" : "s"}`, when, upcoming && "upcoming"]
        .filter(Boolean).join(" · ")}</span>
    </Link>
  );
}

/** One tower / daily section / mini event. */
export function QuestBattles() {
  const { id = "" } = useParams();
  const { data: index } = useData<QuestSection[]>("quests/index");
  const { data, loading, error } = useData<Battles>(`quests/${id}`);
  const lang = useLang();
  const found = useMemo(() => {
    for (const sec of index ?? []) for (const g of sec.groups) if (g.id === id) return { sec, g };
    return null;
  }, [index, id]);
  const title = found ? tr(found.g.title, lang) || id : id;
  return (
    <div className="battles-page">
      <Breadcrumbs items={[
        { label: "Quests", href: `#/quests${found ? `?section=${found.sec.key}` : ""}` },
        { label: found?.sec.label ?? "…", href: found ? `#/quests?section=${found.sec.key}` : undefined },
        { label: title },
      ]} />
      <div className="battles-head">
        <div>
          <h1 lang="ja">{title}</h1>
          {found && <p className="muted">{[found.g.note, dates(found.g)].filter(Boolean).join(" · ")}</p>}
        </div>
      </div>
      <LoadState loading={loading && !data} error={error} />
      {data && <BattleBody data={data} />}
    </div>
  );
}
