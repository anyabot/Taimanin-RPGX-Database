import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, CopyButton, LoadState } from "@altterisk/game-hub";
import { downloadText } from "@altterisk/game-hub/persist";
import { tr, unitName, useAssets, useData, useLang, type StorySection, type Unit } from "../data";
import { beats as toBeats, parseScript, type Beat, type SceneDoc } from "../adv";
import { loadScript } from "../sceneArt";
import { RichLine, useSceneText } from "../sceneText";
import { sceneMeta, storyPartMeta } from "../meta";
import { usePageMeta } from "../usePageMeta";

/** Every line of a scene, to read, copy or save as a text file. In the player
 *  (`at` and `go` given) the current line is marked and a line jumps to it. */
export function TranscriptView({ title, file, beats, at, go }: {
  title: string; file: string; beats: Beat[]; at?: number; go?: (n: number) => void;
}) {
  const list = useRef<HTMLOListElement>(null);
  const lines = beats.flatMap((x, k) => (x.text ? [{ k, name: x.name, text: x.text, en: x.en }] : []));
  // keep the current line in view inside the list, without scrolling the page
  useEffect(() => {
    const ol = list.current;
    const li = at == null ? null : ol?.querySelector<HTMLElement>(`[data-k="${at}"]`);
    if (!ol || !li || !ol.clientHeight) return;
    if (li.offsetTop < ol.scrollTop || li.offsetTop + li.offsetHeight > ol.scrollTop + ol.clientHeight)
      ol.scrollTop = li.offsetTop - ol.clientHeight / 3;
  }, [at]);
  // The whole transcript, read from the page, so a page translation is what
  // gets copied or saved.
  const text = () => {
    const rows = [...(list.current?.querySelectorAll("li") ?? [])].map((li) => {
      const name = li.querySelector(".scn-tr-name")?.textContent?.trim();
      const line = li.querySelector(".scn-tr-line")?.textContent?.trim() ?? "";
      return name ? `${name}: ${line}` : line;
    });
    return [title, "", ...rows].join("\n");
  };
  const download = () => downloadText(text().replace(/\n/g, "\r\n"), `${file}.txt`, "text/plain;charset=utf-8");
  return (
    <div className="scn-tr">
      <div className="scn-tr-tools" translate="no">
        <CopyButton value={text} label="Copy all" />
        <button className="hub-btn hub-btn--sm" onClick={download}>Download .txt</button>
        <span className="muted small">{lines.length} lines. Copies and saves the text as shown, so a page translation is included.</span>
      </div>
      <ol ref={list} className={`scn-tr-list${go ? " jump" : ""}`} lang="ja">
        {lines.map((l) => (
          <li key={l.k} data-k={l.k} className={l.k === at ? "on" : ""} onClick={go && (() => go(l.k))} lang={l.en ? "en" : undefined}>
            {l.name && <span className="scn-tr-name">{l.name}</span>}
            <span className="scn-tr-line"><RichLine text={l.text} /></span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** A scene's text on its own page: /scenes/:id/transcript, /story/:id/transcript. */
export default function TranscriptPage({ source = "unit" }: { source?: "unit" | "story" }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const unitId = source === "unit" ? params.get("unit") : null;
  const { data: doc, error } = useData<SceneDoc>(`${source === "story" ? "stories" : "scenes"}/${id}`);
  const { data: unit } = useData<Unit>(unitId ? `units/${unitId}` : null);
  const { data: stories } = useData<StorySection[]>(source === "story" ? "stories/index" : null);
  const { assets, error: assetsError } = useAssets();
  const lang = useLang();
  const [beats, setBeats] = useState<Beat[] | null>(null);
  const [scriptError, setScriptError] = useState<unknown>(null);
  useEffect(() => {
    if (!assets || !doc) return;
    let live = true;
    setBeats(null);
    loadScript(assets, doc).then((t) => live && setBeats(toBeats(parseScript(t))), (e) => live && setScriptError(e));
    return () => { live = false; };
  }, [assets, doc]);
  const story = useMemo(() => {
    for (const sec of stories ?? []) for (const g of sec.groups) {
      const part = g.parts.find((p) => p.id === id);
      if (part) return { sec, g, part };
    }
    return null;
  }, [stories, id]);
  const text = useSceneText(id, beats);

  const player = source === "story" ? `/story/${id}` : `/scenes/${id}${unitId ? `?unit=${unitId}` : ""}`;
  const groupTitle = story ? tr(story.g.title, lang) || story.g.id : "";
  const partTitle = story ? [story.part.section, story.part.title].filter(Boolean).join(" · ") || id : "";
  const title = story ? `${groupTitle} ${partTitle}` : doc?.title || id;
  usePageMeta(source === "story" ? story && storyPartMeta(story.sec, story.g, story.part, true)
    : doc && sceneMeta(id, doc.title, unit ? unitName(unit, "en") : undefined, true));
  return (
    <div className="scene-page transcript-page">
      <Breadcrumbs items={story ? [
        { label: "Story", href: `/story?section=${story.sec.key}` },
        { label: groupTitle, href: `/story?section=${story.sec.key}&open=${story.g.id}` },
        { label: partTitle, href: `${player}` },
        { label: "Transcript" },
      ] : [
        { label: "Units", href: "/units" },
        ...(unit ? [{ label: unitName(unit, lang), href: `/units/${unit.id}?tab=scenes` }] : []),
        { label: doc?.title || id, href: `${player}` },
        { label: "Transcript" },
      ]} />
      <div className="scene-head">
        <h1 lang="ja">{title} <span className="muted scene-sub">transcript</span></h1>
        <div className="scene-siblings"><Link className="hub-btn" to={player}>Open in the scene player</Link></div>
      </div>
      {!text.beats && <LoadState loading={!error && !scriptError && !assetsError} error={error || scriptError || assetsError} />}
      {text.bar}
      {text.beats && <TranscriptView title={title} file={id} beats={text.beats} />}
      {text.beats && !text.beats.some((b) => b.en) && <p className="muted small">The game's Japanese text; your browser's page translation works on it.</p>}
    </div>
  );
}
