import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, LoadState } from "@altterisk/game-hub";
import { tr, unitName, useAssets, useData, useLang, type StorySection, type Unit } from "../data";
import { beats as toBeats, parseScript, type Actor, type Beat, type SceneDoc } from "../adv";
import { SceneArt, loadScript, type SeIndex } from "../sceneArt";
import { SpineStage, spineRuntime } from "../spine";

const MUTE_KEY = "taimanin.scene.muted";
const SPINE_KEY = "taimanin.scene.spine";

/** A scene played in the browser: a unit H-scene (#/scenes/:id) or a story
 *  part (#/story/:id). Script, CGs, actors, BGM, SE and voice all come from
 *  the game CDN when it is opened. */
export default function ScenePlayer({ source = "unit" }: { source?: "unit" | "story" }) {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const unitId = source === "unit" ? params.get("unit") : null;
  const { data: doc, loading, error } = useData<SceneDoc>(`${source === "story" ? "stories" : "scenes"}/${id}`);
  const { data: se } = useData<SeIndex>("adv_se");
  const { data: unit } = useData<Unit>(unitId ? `units/${unitId}` : null);
  const { data: stories } = useData<StorySection[]>(source === "story" ? "stories/index" : null);
  const story = useMemo(() => {
    for (const sec of stories ?? []) for (const g of sec.groups) {
      const part = g.parts.find((p) => p.id === id);
      if (part) return { sec, g, part };
    }
    return null;
  }, [stories, id]);
  const { assets, error: assetsError } = useAssets();
  const lang = useLang();
  const [script, setScript] = useState<{ id: string; beats: Beat[] } | null>(null);
  const [scriptError, setScriptError] = useState<unknown>(null);

  useEffect(() => {
    if (!assets || !doc) return;
    let live = true;
    setScript(null);
    setScriptError(null);
    loadScript(assets, doc).then(
      (text) => live && setScript({ id: doc.id, beats: toBeats(parseScript(text)) }),
      (e) => live && setScriptError(e));
    return () => { live = false; };
  }, [assets, doc]);

  const art = useMemo(() => (assets && doc ? new SceneArt(assets, doc, se ?? null) : null), [assets, doc, se]);
  const siblings = useMemo(() => (story ? story.g.parts.map((p) => p.id) : unit?.scenes.flat() ?? []), [unit, story]);
  const at = siblings.indexOf(id);
  const sceneLink = (sid: string) => source === "story" ? `/story/${sid}` : `/scenes/${sid}${unitId ? `?unit=${unitId}` : ""}`;
  const heading = story ? [story.part.section, story.part.title].filter(Boolean).join(" · ") || id : doc?.title || id;
  const groupTitle = story ? tr(story.g.title, lang) || story.g.id : "";

  return (
    <div className="scene-page">
      <Breadcrumbs items={story ? [
        { label: "Story", href: `#/story?section=${story.sec.key}` },
        { label: groupTitle, href: `#/story?section=${story.sec.key}&open=${story.g.id}` },
        { label: heading },
      ] : [
        { label: "Units", href: "#/units" },
        ...(unit ? [{ label: unitName(unit, lang), href: `#/units/${unit.id}?tab=scenes` }] : []),
        { label: doc?.title || id },
      ]} />
      <div className="scene-head">
        <h1 lang="ja">{story ? <>{groupTitle} <span className="muted scene-sub">{heading}</span></> : heading}</h1>
        {siblings.length > 1 && (
          <div className="scene-siblings">
            {at > 0 && <Link className="hub-btn" to={sceneLink(siblings[at - 1])}>‹ Previous {story ? "part" : "scene"}</Link>}
            <span className="muted">{story ? "Part" : "Scene"} {at + 1} of {siblings.length}{unit && ` · ${tr(unit.title, lang)}`}</span>
            {at >= 0 && at < siblings.length - 1 && <Link className="hub-btn" to={sceneLink(siblings[at + 1])}>Next {story ? "part" : "scene"} ›</Link>}
            {story?.g.battles && <Link className="hub-btn" to={`/story/battles/${story.g.id}`}>Battles</Link>}
          </div>
        )}
      </div>
      {(!doc || !script) && (
        <LoadState loading={(loading || !assets || !script) && !error && !scriptError && !assetsError}
          error={error || scriptError || assetsError} />
      )}
      {doc && art && script?.id === doc.id && (
        <Stage key={doc.id} doc={doc} art={art} beats={script.beats}
          next={at >= 0 && at < siblings.length - 1 ? sceneLink(siblings[at + 1]) : null} />
      )}
    </div>
  );
}

interface Shown { bg: string | null; ev: string | null; actors: { slot: string; x: Actor["x"]; url: string }[] }

function Stage({ doc, art, beats, next }: { doc: SceneDoc; art: SceneArt; beats: Beat[]; next: string | null }) {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const prev = useRef(-1);
  const [shown, setShown] = useState<Shown>({ bg: null, ev: null, actors: [] });
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [hideText, setHideText] = useState(false);
  const [animate, setAnimate] = useState(() => { try { return localStorage.getItem(SPINE_KEY) !== "0"; } catch { return true; } });
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === "1"; } catch { return false; } });
  const [fx, setFx] = useState({ flash: 0, quake: 0 });
  const voice = useRef<HTMLAudioElement | null>(null);
  const bgm = useRef<{ name: string; el: HTMLAudioElement } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  // Theater: the browser's fullscreen where an element can have it, else a
  // fixed full-window overlay (iPhone Safari has no element fullscreen).
  const [theater, setTheater] = useState(false);
  const toggleTheater = () => {
    const el = playerRef.current;
    if (!el) return;
    if (theater) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setTheater(false);
      return;
    }
    setTheater(true);
    if (el.requestFullscreen) {
      el.requestFullscreen({ navigationUI: "hide" }).then(() => {
        // Phones: prefer landscape while fullscreen (Android allows it, iOS ignores it).
        (screen.orientation as any)?.lock?.("landscape").catch(() => {});
      }, () => {});
    }
  };
  useEffect(() => {
    const onChange = () => { if (!document.fullscreenElement) setTheater(false); };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    if (!theater) return;
    document.documentElement.classList.add("scn-theater-open");
    return () => document.documentElement.classList.remove("scn-theater-open");
  }, [theater]);
  const b = beats[Math.min(i, beats.length - 1)];

  const go = (n: number) => setI(Math.max(0, Math.min(beats.length - 1, n)));
  const forward = () => {
    if (i < beats.length - 1) go(i + 1);
    else if (next) navigate(next);
  };

  // Layers: keep the previous picture until the new one has decoded.
  useEffect(() => {
    let live = true;
    setBusy(true);
    const lost: string[] = [];
    const soft = <T,>(p: Promise<T>, what: string) => p.catch((e) => { console.warn(what, e); lost.push(what); return null; });
    Promise.all([
      b.bg ? soft(art.bg(b.bg), `background ${b.bg}`) : null,
      b.ev && doc.ev[b.ev] ? soft(art.ev(b.ev), `CG ${b.ev}`) : null,
      Promise.all(b.actors.map(async (a) => {
        if (!doc.actors[a.name]) { lost.push(`actor ${a.name}`); return null; }
        const url = await soft(art.actor(a.name), `actor ${a.name}`);
        return url ? { slot: a.slot, x: a.x, url } : null;
      })),
    ]).then(([bg, ev, actors]) => {
      if (!live) return;
      if (b.ev && !doc.ev[b.ev]) lost.push(`CG ${b.ev}`);
      setShown({ bg, ev, actors: actors.filter((a): a is Shown["actors"][number] => !!a) });
      setMissing(lost);
      setBusy(false);
    });
    for (const n of beats.slice(i + 1, i + 4)) art.prefetch(n);
    return () => { live = false; };
  }, [b, art, doc]);

  // One-shot cues only when stepping forward onto a beat, never when jumping.
  useEffect(() => {
    const stepped = i === prev.current + 1;
    prev.current = i;
    voice.current?.pause();
    voice.current = null;
    if (!stepped) return;
    if (b.voice && !muted) {
      const a = new Audio(art.voiceUrl(b.voice));
      voice.current = a;
      a.play().catch(() => {});
    }
    if (!muted) for (const s of b.se) art.seClip(s).then((url) => { const a = new Audio(url); a.volume = 0.6; a.play().catch(() => {}); }, () => {});
    if (b.flash || b.quake) setFx((f) => ({ flash: f.flash + (b.flash ? 1 : 0), quake: f.quake + (b.quake ? 1 : 0) }));
  }, [i]);

  // Music follows the beat in either direction.
  useEffect(() => {
    const want = muted ? null : b.bgm;
    if (bgm.current?.name === want) return;
    bgm.current?.el.pause();
    bgm.current = null;
    if (!want) return;
    let live = true;
    art.bgm(want).then((url) => {
      if (!live) return;
      const el = new Audio(url);
      el.loop = true;
      el.volume = 0.4;
      bgm.current = { name: want, el };
      el.play().catch(() => {});
    }, (e) => console.warn("bgm", want, e));
    return () => { live = false; };
  }, [b.bgm, muted, art]);

  useEffect(() => () => { voice.current?.pause(); bgm.current?.el.pause(); }, []);
  useEffect(() => { try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch { /* private mode */ } }, [muted]);
  useEffect(() => { try { localStorage.setItem(SPINE_KEY, animate ? "1" : "0"); } catch { /* private mode */ } }, [animate]);

  // Auto: next beat when the voice ends, or after a pause scaled to the text.
  useEffect(() => {
    if (!auto || busy) return;
    const wait = Math.max(1800, b.text.length * 90);
    const t = setTimeout(forward, wait);
    const v = voice.current;
    const onEnd = () => { clearTimeout(t); setTimeout(forward, 700); };
    if (v && !muted) { clearTimeout(t); v.addEventListener("ended", onEnd); v.addEventListener("error", onEnd); }
    return () => { clearTimeout(t); v?.removeEventListener("ended", onEnd); v?.removeEventListener("error", onEnd); };
  }, [auto, busy, i]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); forward(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(beats.length - 1);
      else if (e.key.toLowerCase() === "h") setHideText((v) => !v);
      else if (e.key.toLowerCase() === "f") toggleTheater();
      else if (e.key === "Escape" && theater && !document.fullscreenElement) setTheater(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const textOn = b.textBox && !hideText && !!(b.text || b.name);
  return (
    <div ref={playerRef} className={`scene-player${theater ? " theater" : ""}`}>
      {/* The frame holds the stage and the dialogue: over the picture on wide
          screens, under it on narrow ones (container query on .scene-player). */}
      <div className="scn-frame" onClick={forward} role="button" tabIndex={0} aria-label="Next line">
      <div ref={stageRef} className={`scn-stage${fx.quake ? ` quake-${fx.quake % 2}` : ""}`}>
        {shown.bg && <img className="scn-bg" src={shown.bg} alt="" />}
        {shown.actors.map((a) => <img key={a.slot} className={`scn-actor x-${a.x}`} src={a.url} alt="" />)}
        {/* The 960x720 CG frame, pillarboxed over everything below it. */}
        {shown.ev && <img className="scn-ev" src={shown.ev} alt="" />}
        {fx.flash > 0 && <div key={fx.flash} className="scn-flash" />}
        {animate && <SpineLayer art={art} doc={doc} model={b.spine} animation={b.spineAnim} />}
        {busy && <div className="scn-busy" aria-live="polite" translate="no">Loading…</div>}
      </div>
        {/* The box stays mounted (an empty one holds its place under the picture);
            its content is keyed per line: page translators (Chrome, Edge) swap
            text nodes for their own elements, so React's in-place update of the
            old node would never show. A fresh element per line is translated anew. */}
        <div className={`scn-text${textOn ? "" : " off"}`} lang="ja">
          {textOn && (
            <div key={i}>
              {b.name && <div className="scn-name">{b.name}</div>}
              <div className="scn-line">{b.text}</div>
            </div>
          )}
        </div>
      </div>
      <div className="scn-controls" translate="no">
        <button className="hub-btn" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous line">‹</button>
        <input type="range" min={0} max={beats.length - 1} value={i} onChange={(e) => go(Number(e.target.value))}
          aria-label="Position in scene" />
        <button className="hub-btn" onClick={forward} disabled={i >= beats.length - 1 && !next} aria-label="Next line">›</button>
        <span className="scn-count muted">{i + 1} / {beats.length}</span>
        <button className="hub-btn" aria-pressed={auto} onClick={() => setAuto((v) => !v)}>{auto ? "Auto ■" : "Auto ▶"}</button>
        <button className="hub-btn" aria-pressed={muted} onClick={() => setMuted((v) => !v)}>{muted ? "Sound off" : "Sound on"}</button>
        <button className="hub-btn" aria-pressed={hideText} onClick={() => setHideText((v) => !v)}>{hideText ? "Show text" : "Hide text"}</button>
        <button className="hub-btn" aria-pressed={theater} onClick={toggleTheater}
          title="Fill the screen with the scene (Esc to leave)">{theater ? "Exit theater" : "Theater"}</button>
        {Object.keys(doc.spine).length > 0 && (
          <button className="hub-btn" aria-pressed={animate} onClick={() => setAnimate((v) => !v)}
            title="Play the animated CGs, or show the still images instead">{animate ? "Animation on" : "Animation off"}</button>
        )}
      </div>
      {missing.length > 0 && <p className="muted small scn-missing" translate="no">Not available for this line: {missing.join(", ")}</p>}
      <p className="muted small scn-help">Click the picture, or press → / Space, to advance; ← goes back; H hides the text; F for theater.
        Dialogue is the game's Japanese text (your browser's page translation works on it).</p>
    </div>
  );
}

/** The animated CG layer. Kept mounted across beats so stepping through a
 *  scene's poses only swaps skeleton/animation; the stills underneath show
 *  until the model has loaded, and whenever no <SPINE> is active. */
function SpineLayer({ art, doc, model, animation }: { art: SceneArt; doc: SceneDoc; model: string | null; animation: string | null }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<SpineStage | null>(null);
  const [shown, setShown] = useState<string | null>(null);
  const [state, setState] = useState<"" | "loading" | "error">("");
  useEffect(() => () => { stage.current?.dispose(); stage.current = null; }, []);
  useEffect(() => {
    if (!model || !doc.spine[model]) { stage.current?.clear(); setShown(null); setState(""); return; }
    let live = true;
    setState("loading");
    Promise.all([spineRuntime(), art.spineModel(model)]).then(([sp, m]) => {
      if (!live || !canvas.current) return;
      stage.current ??= new SpineStage(sp, canvas.current);
      stage.current.show(m, animation);
      setShown(model);
      setState("");
    }, (e) => { console.warn("spine", model, e); if (live) setState("error"); });
    return () => { live = false; };
  }, [model, animation, art, doc]);
  return (
    <>
      <canvas ref={canvas} className="scn-spine" hidden={!model || shown !== model} />
      {state === "loading" && <div className="scn-note" translate="no">Loading animation…</div>}
      {state === "error" && <div className="scn-note" translate="no">This animated CG could not be loaded; showing the stills.</div>}
    </>
  );
}
