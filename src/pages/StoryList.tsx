import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { LoadState, PageHeader, SearchBox, SegmentedButtons } from "@altterisk/game-hub";
import { textMatch } from "@altterisk/game-hub/filters";
import { tr, useData, useLang, type StoryGroup, type StorySection } from "../data";

const KIND_NOUN: Record<string, string> = {
  main: "Chapter", event: "Event", raid: "Raid", map: "Map event", special: "Special", tutorial: "Tutorial",
};

/** Main story chapters and event stories, played in the scene player. */
export default function StoryList() {
  const { data: index, loading, error } = useData<StorySection[]>("stories/index");
  const lang = useLang();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") || "main";
  const q = params.get("q") || "";
  const open = params.get("open");
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const sec = index?.find((s) => s.key === section) ?? index?.[0];
  const groups = useMemo(() => (sec?.groups ?? []).filter((g) =>
    !q || textMatch(q, [g.id, g.title?.ja, g.title?.en, ...g.parts.map((p) => p.title)])), [sec, q]);

  if (!index) return <LoadState loading={loading} error={error} />;
  return (
    <div className="story-page">
      <PageHeader title="Story"
        subtitle="Main story chapters and event stories, played from the game's own files. Text is the game's Japanese (browser page translation works on it)." />
      <SegmentedButtons label="Section" selected={[sec?.key ?? ""]}
        options={index.map((s) => ({ value: s.key, label: `${s.label} (${s.groups.length})` }))}
        onToggle={(v) => { const next = new URLSearchParams(params); next.set("section", v); next.delete("open"); setParams(next, { replace: true }); }} />
      <SearchBox value={q} onChange={(v) => set("q", v || null)} placeholder="Search titles" />
      <div className="story-groups">
        {groups.map((g) => (
          <StoryCard key={g.id} g={g} kind={sec!.key} lang={lang} open={open === g.id || (!!q && groups.length <= 3)} />
        ))}
        {!groups.length && <p className="muted">No titles match.</p>}
      </div>
    </div>
  );
}

function StoryCard({ g, kind, lang, open }: { g: StoryGroup; kind: string; lang: "en" | "ja"; open: boolean }) {
  const title = tr(g.title, lang);
  const noun = `${KIND_NOUN[kind] ?? "Story"} ${g.num}`;
  return (
    <details className="story-card" open={open}>
      <summary>
        <span className="story-num muted">{noun}</span>
        <span className="story-title" lang={g.title?.en && lang === "en" ? "en" : "ja"}>{title || noun}</span>
        <span className="story-count muted">{g.parts.length} part{g.parts.length === 1 ? "" : "s"}</span>
      </summary>
      <ol className="story-parts">
        {g.parts.map((p) => (
          <li key={p.id}>
            <Link to={`/story/${p.id}`}>
              <span className="muted">{p.section ?? p.id}</span>
              {p.title && <span lang="ja"> · {p.title}</span>}
            </Link>
          </li>
        ))}
      </ol>
    </details>
  );
}
