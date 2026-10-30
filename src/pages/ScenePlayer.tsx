import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Breadcrumbs, LoadState } from "@altterisk/game-hub";
import { saveBlob } from "@altterisk/game-hub/persist";
import { flagSetting, tr, unitName, useAssets, useData, useLang, type StorySection, type Unit } from "../data";
import { beats as toBeats, parseScript, type Actor, type Beat, type SceneDoc } from "../adv";
import { SceneArt, composeFrame, loadScript, type SeIndex } from "../sceneArt";
import { TranscriptView } from "./Transcript";
import { RichLine, useSceneText } from "../sceneText";
import { SpineStage, spineRuntime } from "../spine";
import { sceneMeta, storyPartMeta } from "../meta";
import { usePageMeta } from "../usePageMeta";

const MUTED = flagSetting("taimanin.scene.muted", false);
const SPINE = flagSetting("taimanin.scene.spine", true);
const PRELOAD = flagSetting("taimanin.scene.preload", true);
const PICTURES = flagSetting("taimanin.scene.pictures", false);

/** Beats with something to look at: a CG, an animation or an actor, not a
 *  blank stage or a bare background. */
const hasPicture = (b: Beat) => !!(b.ev || b.spine || b.actors.length);
/** What is on screen at a beat, to tell where the picture changes. */
const pictureKey = (b: Beat) => JSON.stringify([b.bg, b.ev, b.actors.map((a) => [a.slot, a.name, a.x]), b.spine, b.spineAnim]);

/** A scene played in the browser: a unit H-scene (/scenes/:id) or a story
 *  part (/story/:id). Script, CGs, actors, BGM, SE and voice all come from
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

  const text = useSceneText(id, script && doc && script.id === doc.id ? script.beats : null);
  const art = useMemo(() => (assets && doc ? new SceneArt(assets, doc, se ?? null) : null), [assets, doc, se]);
  const siblings = useMemo(() => (story ? story.g.parts.map((p) => p.id) : unit?.scenes.flat() ?? []), [unit, story]);
  const at = siblings.indexOf(id);
  const sceneLink = (sid: string) => source === "story" ? `/story/${sid}` : `/scenes/${sid}${unitId ? `?unit=${unitId}` : ""}`;
  const heading = story ? [story.part.section, story.part.title].filter(Boolean).join(" · ") || id : doc?.title || id;
  const groupTitle = story ? tr(story.g.title, lang) || story.g.id : "";
  usePageMeta(source === "story" ? story && storyPartMeta(story.sec, story.g, story.part)
    : doc && sceneMeta(id, doc.title, unit ? unitName(unit, "en") : undefined));

  return (
    <div className="scene-page">
      <Breadcrumbs items={story ? [
        { label: "Story", href: `/story?section=${story.sec.key}` },
        { label: groupTitle, href: `/story?section=${story.sec.key}&open=${story.g.id}` },
        { label: heading },
      ] : [
        { label: "Units", href: "/units" },
        ...(unit ? [{ label: unitName(unit, lang), href: `/units/${unit.id}?tab=scenes` }] : []),
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
      {(!doc || !script || !text.beats) && (
        <LoadState loading={(loading || !assets || !script || !text.beats) && !error && !scriptError && !assetsError}
          error={error || scriptError || assetsError} />
      )}
      {text.bar}
      {doc && art && script?.id === doc.id && text.beats && (
        <Stage key={doc.id} doc={doc} art={art} beats={text.beats}
          next={at >= 0 && at < siblings.length - 1 ? sceneLink(siblings[at + 1]) : null}
          transcript={`${source === "story" ? `/story/${id}` : `/scenes/${id}`}/transcript${unitId ? `?unit=${unitId}` : ""}`} />
      )}
    </div>
  );
}

interface Shown { bg: string | null; ev: string | null; actors: { slot: string; x: Actor["x"]; url: string }[] }

function Stage({ doc, art, beats, next, transcript }: { doc: SceneDoc; art: SceneArt; beats: Beat[]; next: string | null; transcript: string }) {
  const navigate = useNavigate();
  const [i, setI] = useState(0);
  const prev = useRef(-1);
  const [shown, setShown] = useState<Shown>({ bg: null, ev: null, actors: [] });
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState<string[]>([]);
  const [hideText, setHideText] = useState(false);
  const [animate, setAnimate] = SPINE.use();
  // Text mode: every line in the page up front (page translators reach them all),
  // or only the current line (for translators that handle new text themselves).
  const [preload, setPreload] = PRELOAD.use();
  // Picture mode: no text or voice, and stepping goes from picture to picture.
  const [pictures, setPictures] = PICTURES.use();
  const [auto, setAuto] = useState(false);
  const [muted, setMuted] = MUTED.use();
  const [fx, setFx] = useState({ flash: 0, quake: 0 });
  // the animated CG's current frame, while one is showing
  const spineSnap = useRef<(() => HTMLCanvasElement) | null>(null);
  const [saving, setSaving] = useState(false);
  const savePicture = () => {
    setSaving(true);
    let spine: HTMLCanvasElement | null = null;
    try { spine = animate ? spineSnap.current?.() ?? null : null; } catch (e) { console.warn("spine snapshot", e); }
    composeFrame(shown, spine)
      .then((blob) => saveBlob(blob, `${doc.id}_${String(i + 1).padStart(3, "0")}.png`), (e) => console.warn("save picture", e))
      .finally(() => setSaving(false));
  };
  // the beat whose picture and voice are on screen, and that voice, downloaded;
  // cues wait for it (busy alone is stale in the render that steps)
  const [loaded, setLoaded] = useState<{ i: number; voiceUrl: string | null }>({ i: -1, voiceUrl: null });
  const stepped = useRef(false);
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
  // the first beat of every picture (all of them if the scene has none)
  const shots = useMemo(() => {
    const all = beats.flatMap((x, k) => (k === 0 || pictureKey(x) !== pictureKey(beats[k - 1]) ? [k] : []));
    const some = all.filter((k) => hasPicture(beats[k]));
    return some.length ? some : all;
  }, [beats]);
  let shot = 0;
  while (shot < shots.length - 1 && shots[shot + 1] <= i) shot++;
  // entering picture mode on a blank or bare-background beat: on to the next picture
  useEffect(() => {
    if (pictures && !hasPicture(b) && hasPicture(beats[shots[0]])) go(shots.find((k) => k > i) ?? shots[shots.length - 1]);
  }, [pictures]);

  const go = (n: number) => setI(Math.max(0, Math.min(beats.length - 1, n)));
  const forward = () => {
    if (pictures) {
      if (shot < shots.length - 1) go(shots[shot + 1]);
      else if (next) navigate(next);
    } else if (i < beats.length - 1) go(i + 1);
    else if (next) navigate(next);
  };
  const back = () => go(pictures ? shots[Math.max(0, shot - 1)] : i - 1);
  const atEnd = pictures ? shot >= shots.length - 1 : i >= beats.length - 1;

  // Layers: keep the previous picture until the new one has decoded.
  useEffect(() => {
    let live = true;
    setBusy(true);
    const lost: string[] = [];
    const soft = <T,>(p: Promise<T>, what: string) => p.catch((e) => { console.warn(what, e); lost.push(what); return null; });
    // the voice is downloaded before the beat is shown, so both start together
    const line = b.voice && !muted && !pictures ? soft(art.voice(b.voice), `voice ${b.voice}`) : Promise.resolve(null);
    Promise.all([
      b.bg ? soft(art.bg(b.bg), `background ${b.bg}`) : null,
      b.ev && doc.ev[b.ev] ? soft(art.ev(b.ev), `CG ${b.ev}`) : null,
      Promise.all(b.actors.map(async (a) => {
        if (!doc.actors[a.name]) { lost.push(`actor ${a.name}`); return null; }
        const url = await soft(art.actor(a.name), `actor ${a.name}`);
        return url ? { slot: a.slot, x: a.x, url } : null;
      })),
      line,
    ]).then(([bg, ev, actors, voiceUrl]) => {
      if (!live) return;
      setLoaded({ i, voiceUrl });
      if (b.ev && !doc.ev[b.ev]) lost.push(`CG ${b.ev}`);
      setShown({ bg, ev, actors: actors.filter((a): a is Shown["actors"][number] => !!a) });
      setMissing(lost);
      setBusy(false);
    });
    for (const n of beats.slice(i + 1, i + 4)) art.prefetch(n);
    return () => { live = false; };
  }, [b, art, doc]);

  // One-shot cues only when stepping forward onto a beat, never when jumping,
  // and only once the beat is on screen (its picture and voice loaded).
  useEffect(() => {
    stepped.current = i === prev.current + 1;
    prev.current = i;
    voice.current?.pause();
    voice.current = null;
  }, [i]);
  useEffect(() => {
    if (loaded.i !== i || !stepped.current) return;
    stepped.current = false;
    if (b.voice && !muted && !pictures && loaded.voiceUrl) {
      const a = new Audio(loaded.voiceUrl);
      voice.current = a;
      a.play().catch(() => {});
    }
    if (!muted) for (const s of b.se) art.seClip(s).then((url) => { const a = new Audio(url); a.volume = 0.6; a.play().catch(() => {}); }, () => {});
    if (b.flash || b.quake) setFx((f) => ({ flash: f.flash + (b.flash ? 1 : 0), quake: f.quake + (b.quake ? 1 : 0) }));
  }, [loaded, i]);

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
  useEffect(() => {
    if (pictures) { voice.current?.pause(); voice.current = null; }
  }, [pictures]);

  // Auto: next beat when the voice ends, or after a pause scaled to the text
  // (a fixed pause per picture in picture mode).
  useEffect(() => {
    if (!auto || loaded.i !== i) return;
    // English runs about twice the characters of the Japanese for the same line
    const wait = pictures ? 3500 : Math.max(1800, b.text.length * (b.en ? 45 : 90));
    const t = setTimeout(forward, wait);
    const v = voice.current;
    const onEnd = () => { clearTimeout(t); setTimeout(forward, 700); };
    if (v && !muted) { clearTimeout(t); v.addEventListener("ended", onEnd); v.addEventListener("error", onEnd); }
    return () => { clearTimeout(t); v?.removeEventListener("ended", onEnd); v?.removeEventListener("error", onEnd); };
  }, [auto, loaded, i, pictures]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") { e.preventDefault(); forward(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(beats.length - 1);
      else if (e.key.toLowerCase() === "h") setHideText((v) => !v);
      else if (e.key.toLowerCase() === "p") setPictures((v) => !v);
      else if (e.key.toLowerCase() === "f") toggleTheater();
      else if (e.key === "Escape" && theater && !document.fullscreenElement) setTheater(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const textOn = b.textBox && !hideText && !pictures && !!(b.text || b.name);
  // switching languages swaps every line, so the box is rebuilt (see below)
  const english = beats.some((x) => x.en);
  return (
    <div ref={playerRef} className={`scene-player${theater ? " theater" : ""}`}>
      {/* The frame holds the stage and the dialogue: over the picture on wide
          screens, under it on narrow ones (container query on .scene-player). */}
      <div className="scn-frame" onClick={forward} role="button" tabIndex={0} aria-label={pictures ? "Next picture" : "Next line"}>
      <div ref={stageRef} className={`scn-stage${fx.quake ? ` quake-${fx.quake % 2}` : ""}`}>
        {shown.bg && <img className="scn-bg" src={shown.bg} alt="" />}
        {shown.actors.map((a) => <img key={a.slot} className={`scn-actor x-${a.x}`} src={a.url} alt="" />)}
        {/* The 960x720 CG frame, pillarboxed over everything below it. */}
        {shown.ev && <img className="scn-ev" src={shown.ev} alt="" />}
        {fx.flash > 0 && <div key={fx.flash} className="scn-flash" />}
        {animate && <SpineLayer art={art} doc={doc} model={b.spine} animation={b.spineAnim} snap={spineSnap} />}
        {busy && <div className="scn-busy" aria-live="polite" translate="no">Loading…</div>}
      </div>
        {/* Preloaded: every line of the scene is in the box from the start,
            stacked and transparent but for the current one, and never
            re-rendered: page translators (Chrome, Edge) translate them all up
            front and swap the text nodes for their own, so stepping only changes
            which line shows. Lines inserted one at a time were often left
            untranslated by Chrome.
            Per line: only the current line, keyed so each is a fresh element
            (an in-place update of a node a translator replaced would never show). */}
        <div key={`${preload ? "all" : "one"}-${english ? "en" : "ja"}`} className={`scn-text${textOn ? "" : " off"}`} lang="ja">
          {preload ? beats.map((x, k) => (x.text || x.name) && (
            <div key={k} className={`scn-say${k === i ? " on" : ""}`} aria-hidden={k !== i} lang={x.en ? "en" : undefined}>
              {x.name && <div className="scn-name">{x.name}</div>}
              <div className="scn-line"><RichLine text={x.text} /></div>
            </div>
          )) : textOn && (
            <div key={i} className="scn-say on" lang={b.en ? "en" : undefined}>
              {b.name && <div className="scn-name">{b.name}</div>}
              <div className="scn-line"><RichLine text={b.text} /></div>
            </div>
          )}
        </div>
      </div>
      <div className="scn-controls" translate="no">
        <button className="hub-btn" onClick={back} disabled={pictures ? shot <= 0 : i === 0}
          aria-label={pictures ? "Previous picture" : "Previous line"}>‹</button>
        {pictures
          ? <input type="range" min={0} max={shots.length - 1} value={shot} onChange={(e) => go(shots[Number(e.target.value)])}
            aria-label="Picture in scene" />
          : <input type="range" min={0} max={beats.length - 1} value={i} onChange={(e) => go(Number(e.target.value))}
            aria-label="Position in scene" />}
        <button className="hub-btn" onClick={forward} disabled={atEnd && !next} aria-label={pictures ? "Next picture" : "Next line"}>›</button>
        <span className="scn-count muted">{pictures ? `Picture ${shot + 1} / ${shots.length}` : `${i + 1} / ${beats.length}`}</span>
        <button className="hub-btn" aria-pressed={auto} onClick={() => setAuto((v) => !v)}>{auto ? "Auto ■" : "Auto ▶"}</button>
        <button className="hub-btn" aria-pressed={muted} onClick={() => setMuted((v) => !v)}>{muted ? "Sound off" : "Sound on"}</button>
        <button className="hub-btn" aria-pressed={pictures} onClick={() => setPictures((v) => !v)}
          title="Pictures only: no text or voice, and each step goes to the next picture (P)">Picture mode</button>
        {!pictures && <button className="hub-btn" aria-pressed={hideText} onClick={() => setHideText((v) => !v)}>{hideText ? "Show text" : "Hide text"}</button>}
        <button className="hub-btn" aria-pressed={theater} onClick={toggleTheater}
          title="Fill the screen with the scene (Esc to leave)">{theater ? "Exit theater" : "Theater"}</button>
        <button className="hub-btn" aria-pressed={preload} onClick={() => setPreload((v) => !v)}
          title="Which works best depends on the translator. All lines: the whole scene's text is in the page up front (Chrome's built-in translation). Per line: only the current line (some translator extensions)">
          {preload ? "Text: all lines" : "Text: per line"}</button>
        <button className="hub-btn" onClick={savePicture} disabled={busy || saving}
          title="Save the picture on screen as a PNG (the CG with its overlays, or the animation's current frame)">{saving ? "Saving…" : "Save picture"}</button>
        {Object.keys(doc.spine).length > 0 && (
          <button className="hub-btn" aria-pressed={animate} onClick={() => setAnimate((v) => !v)}
            title="Play the animated CGs, or show the still images instead">{animate ? "Animation on" : "Animation off"}</button>
        )}
      </div>
      {missing.length > 0 && <p className="muted small scn-missing" translate="no">Not available for this line: {missing.join(", ")}</p>}
      <p className="muted small scn-help">Click the picture, or press → / Space, to advance; ← goes back; H hides the text; P for picture mode; F for theater.
        {english ? " Dialogue is the English translation credited above the player." : <> Dialogue is the game's Japanese text (your browser's page translation works on it; if lines stay untranslated,
        switch the Text button between "all lines" and "per line").</>}</p>
      <details className="scn-transcript">
        <summary translate="no">Transcript</summary>
        <p className="small"><Link to={transcript}>Open the transcript as its own page</Link></p>
        <TranscriptView title={doc.title || doc.id} file={doc.id} beats={beats} at={i} go={go} />
      </details>
    </div>
  );
}

/** The animated CG layer. Kept mounted across beats so stepping through a
 *  scene's poses only swaps skeleton/animation; the stills underneath show
 *  until the model has loaded, and whenever no <SPINE> is active. */
function SpineLayer({ art, doc, model, animation, snap }: {
  art: SceneArt; doc: SceneDoc; model: string | null; animation: string | null; snap: { current: (() => HTMLCanvasElement) | null };
}) {
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
  useEffect(() => {
    snap.current = model && shown === model && stage.current ? () => stage.current!.snapshot() : null;
    return () => { snap.current = null; };
  }, [model, shown]);
  return (
    <>
      <canvas ref={canvas} className="scn-spine" hidden={!model || shown !== model} />
      {state === "loading" && <div className="scn-note" translate="no">Loading animation…</div>}
      {state === "error" && <div className="scn-note" translate="no">This animated CG could not be loaded; showing the stills.</div>}
    </>
  );
}
