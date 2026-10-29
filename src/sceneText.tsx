import { useEffect, useMemo, useState } from "react";
import { translated, type Beat } from "./adv";
import { creditOf, isAi, useData, useSceneEnglish, type SceneTranslation, type TranslationIndex } from "./data";

/** A line with the translations' <i>...</i> emphasis as italics; any other
 *  text, unbalanced tags included, stays plain text. */
export function RichLine({ text }: { text: string }) {
  if (!text.includes("<i>") && !text.includes("</i>")) return <>{text}</>;
  let italic = false;
  return <>{text.split(/(<\/?i>)/).map((part, k) => {
    if (part === "<i>") { italic = true; return null; }
    if (part === "</i>") { italic = false; return null; }
    return part && (italic ? <em key={k}>{part}</em> : part);
  })}</>;
}

/** "EN" next to a scene that has an English translation, naming who made it. */
export function EnglishBadge({ sid }: { sid: string }) {
  const { data: index } = useData<TranslationIndex>("tl/index");
  const by = index?.scenes[sid];
  if (!by) return null;
  return by.every(isAi)
    ? <span className="tl-badge ai" title={`English: ${by.join(", ")}. Machine-made, expect mistakes`}>AI</span>
    : <span className="tl-badge" title={`English: ${by.map(creditOf).join(", ")}`}>EN</span>;
}

/** A scene's beats in English where a translation exists and English is on
 *  (public/data/tl, tools/web_export/translations.py), and the bar crediting
 *  it. `beats` is null until the scene's own text is ready; the hook's beats
 *  stay null until it knows whether there is an English version, so the
 *  Japanese does not flash first. */
export function useSceneText(id: string, beats: Beat[] | null) {
  const { data: index, error: indexError } = useData<TranslationIndex>("tl/index");
  const has = !!index?.scenes[id];
  const { data: tl, error } = useData<SceneTranslation>(has ? `tl/${id}` : null);
  const [english, setEnglish] = useSceneEnglish();
  const [version, setVersion] = useState(0);
  useEffect(() => setVersion(0), [id]);

  // no index, or no file, leaves the Japanese
  const ready = !!indexError || (!!index && (!has || !!error || tl?.id === id));
  // a translation made for another cut of the script would put lines on the wrong beats
  const stale = !!(tl && tl.id === id && beats && tl.n !== beats.length);
  const usable = tl && tl.id === id && beats && !stale ? tl : null;
  const v = usable ? usable.versions[Math.min(version, usable.versions.length - 1)] : null;
  const out = useMemo(() => (beats && v && english ? translated(beats, v.lines) : beats), [beats, v, english]);
  const untranslated = v && beats ? beats.filter((b, k) => b.text && !v.lines[k]).length : 0;

  const bar = stale ? (
    <p className="scn-tl muted small" translate="no">
      This scene has an English translation, but it was made for a different version of the script, so the Japanese is shown.
    </p>
  ) : usable && v ? (
    <div className="scn-tl" translate="no">
      <label className="scn-tl-toggle">
        <input type="checkbox" checked={english} onChange={(e) => setEnglish(e.target.checked)} /> English text
      </label>
      <span className="muted small">
        Translation:{" "}
        {usable.versions.length > 1 ? (
          <select className="hub-select" value={version} onChange={(e) => setVersion(Number(e.target.value))} aria-label="Translation">
            {usable.versions.map((x, k) => <option key={k} value={k}>{creditOf(x.by)}</option>)}
          </select>
        ) : creditOf(v.by)}
        {isAi(v.by) ? <>{" "}· <span className="tl-badge ai">AI</span> machine-made, expect mistakes</> : <>{" "}· via the {index?.source}</>}
        {english && untranslated > 0 && ` · ${untranslated} line${untranslated === 1 ? "" : "s"} without English show the Japanese`}
      </span>
    </div>
  ) : null;
  return { beats: ready ? out : null, bar };
}
