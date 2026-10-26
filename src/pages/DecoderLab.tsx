import { useEffect, useMemo, useRef, useState } from "react";
import { toImageData, type Assets } from "../unity/client";
import { getAssets } from "../data";
import type { AssetEntry } from "../unity/assets";
import type { CatalogEvent } from "../unity/catalog";
import type { RGBAImage } from "../unity/texture";

// Developer page: pick any live bundle, decode it in the browser, look at it.
const CLASS_NAMES: Record<number, string> = { 28: "Texture2D", 213: "Sprite", 49: "TextAsset", 83: "AudioClip", 114: "MonoBehaviour" };


export default function DecoderLab() {
  const [assets, setAssets] = useState<Assets | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("spine_assets_chr_1028");
  const [stem, setStem] = useState("");
  const [entries, setEntries] = useState<AssetEntry[] | null>(null);
  const [progress, setProgress] = useState("");
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [view, setView] = useState<{ kind: "image"; img: RGBAImage; note: string } | { kind: "text"; text: string; note: string } | { kind: "audio"; url: string; note: string } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    getAssets().then((a) => {
      a.catalog.onEvent = (e) => setEvents((prev) => [...prev, e]);
      setAssets(a);
    }, (e) => setError(String(e)));
  }, []);

  const matches = useMemo(() => {
    if (!assets || query.length < 3) return [];
    const q = query.toLowerCase();
    return assets.catalog.allStems().filter((s) => s.includes(q)).slice(0, 40);
  }, [assets, query]);

  useEffect(() => {
    if (view?.kind !== "image" || !canvas.current) return;
    const c = canvas.current;
    c.width = view.img.width;
    c.height = view.img.height;
    c.getContext("2d")!.putImageData(toImageData(view.img), 0, 0);
  }, [view]);

  async function pick(s: string) {
    if (!assets) return;
    setStem(s);
    setEntries(null);
    setView(null);
    setError("");
    const t0 = performance.now();
    try {
      await assets.open(s, (l, t) => setProgress(`${(l / 1048576).toFixed(1)} / ${(t / 1048576).toFixed(1)} MB`));
      const list = await assets.list(s);
      setProgress(`opened in ${Math.round(performance.now() - t0)} ms`);
      setEntries(list);
    } catch (e) {
      setError(String(e));
    }
  }

  async function show(e: AssetEntry) {
    if (!assets) return;
    const t0 = performance.now();
    try {
      if (e.classId === 28) {
        const img = await assets.texture(stem, e.pathId);
        setView({ kind: "image", img, note: `${e.name} ${img.width}×${img.height}, decoded in ${Math.round(performance.now() - t0)} ms` });
      } else if (e.classId === 213) {
        const sp = await assets.sprite(stem, e.pathId);
        setView({ kind: "image", img: sp.image, note: `${e.name} rect ${sp.rect.width}×${sp.rect.height}, textureRect ${sp.textureRect.width}×${sp.textureRect.height}` });
      } else if (e.classId === 49) {
        const b = await assets.text(stem, e.pathId);
        const text = new TextDecoder().decode(b.subarray(0, 4000));
        setView({ kind: "text", text, note: `${e.name}: ${b.length.toLocaleString()} bytes` });
      } else if (e.classId === 83) {
        const a = await assets.audio(stem, e.pathId);
        const url = URL.createObjectURL(new Blob([a.bytes as Uint8Array<ArrayBuffer>], { type: "audio/mp4" }));
        setView({ kind: "audio", url, note: `${e.name}: ${a.bytes.length.toLocaleString()} bytes, format ${a.format}` });
      }
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="lab">
      <h1>Decoder lab</h1>
      <p>
        {assets ? `${assets.catalog.size.toLocaleString()} live bundles known.` : "Loading catalog snapshot…"}{" "}
        <button className="hub-btn" disabled={!assets} onClick={() => { setEvents([]); assets?.catalog.refresh(true); }}>
          Check for game update
        </button>
      </p>
      {events.length > 0 && (
        <ul className="lab-events">{events.map((e, i) => <li key={i}>{e.catalog}: {e.state} {e.detail ?? ""}</li>)}</ul>
      )}
      <input className="hub-input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="bundle stem, e.g. adv_ev_assets" />
      <ul className="lab-list">
        {matches.map((s) => (
          <li key={s}><button className={s === stem ? "active" : ""} onClick={() => pick(s)}>{s}</button></li>
        ))}
      </ul>
      {progress && <p>{stem}: {progress}</p>}
      {error && <p className="lab-error">{error}</p>}
      {entries && (
        <ul className="lab-list">
          {entries.map((e) => (
            <li key={e.pathId}>
              <button disabled={e.classId === 114} onClick={() => show(e)}>{CLASS_NAMES[e.classId]} · {e.name || "(unnamed)"}</button>
            </li>
          ))}
        </ul>
      )}
      {view && <p>{view.note}</p>}
      {view?.kind === "image" && <canvas ref={canvas} className="lab-canvas" />}
      {view?.kind === "text" && <pre className="lab-pre">{view.text}</pre>}
      {view?.kind === "audio" && <audio controls autoPlay src={view.url} />}
    </div>
  );
}
