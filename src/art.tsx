// Art decoded from game bundles on demand: a grid of canvases, a full-screen
// gallery of the decoded ones, and PNG downloads.
import { useEffect, useRef, useState } from "react";
import { Lightbox } from "@altterisk/game-hub";
import { useAssets } from "./data";
import { toImageData } from "./unity/client";

/** One texture bundle per stem, decoded when shown. */
export function ArtGallery({ stems, alt, fileName = (s) => `${s}.png` }: {
  stems: string[]; alt: string; fileName?: (stem: string) => string;
}) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<number | null>(null);
  // Blob URLs of decoded art, for the full-screen gallery. Freed only when
  // the gallery unmounts: revoking on every change would kill an image still open.
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  useEffect(() => () => Object.values(urlsRef.current).forEach(URL.revokeObjectURL), []);
  const loaded = stems.filter((s) => urls[s]);
  return (
    <>
      <div className="art-grid">
        {stems.map((s) => (
          <ArtImage key={s} stem={s} openable={!!urls[s]} url={urls[s]} fileName={fileName(s)}
            onReady={(url) => setUrls((m) => ({ ...m, [s]: url }))}
            onOpen={() => { const i = loaded.indexOf(s); if (i >= 0) setOpen(i); }} />
        ))}
      </div>
      <Lightbox
        items={loaded.map((s, i) => ({
          srcs: [urls[s]], alt: `${alt} ${i + 1}`,
          label: <a className="hub-btn art-download" href={urls[s]} download={fileName(s)} onClick={(e) => e.stopPropagation()}>Download PNG</a>,
        }))}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

function ArtImage({ stem, openable, url, fileName, onReady, onOpen }: {
  stem: string; openable: boolean; url?: string; fileName: string; onReady: (url: string) => void; onOpen: () => void;
}) {
  const { assets } = useAssets();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<string>("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!assets) return;
    let live = true;
    setState("loading");
    (async () => {
      try {
        await assets.open(stem, (l, t) => live && setState(`${Math.round((l / (t || l)) * 100)}%`));
        const tex = (await assets.list(stem)).find((e) => e.classId === 28);
        if (!tex) throw new Error("no texture");
        const img = await assets.texture(stem, tex.pathId);
        if (!live || !canvas.current) return;
        canvas.current.width = img.width;
        canvas.current.height = img.height;
        canvas.current.getContext("2d")!.putImageData(toImageData(img), 0, 0);
        setState("");
        canvas.current.toBlob((b) => { if (b && live) onReady(URL.createObjectURL(b)); }, "image/png");
      } catch (e) {
        if (live) setState(String(e));
      }
    })();
    return () => { live = false; };
  }, [assets, stem, attempt]);
  const failed = state && state !== "loading" && !state.endsWith("%");
  return (
    <figure className="art-item">
      <canvas ref={canvas} className={`art-canvas${openable ? " art-ready" : ""}`} onClick={() => openable && onOpen()}
        role={openable ? "button" : undefined} aria-label={openable ? "Open full screen" : undefined} />
      {url && !state && (
        <figcaption className="art-actions">
          <a className="hub-btn art-download" href={url} download={fileName}>Download</a>
        </figcaption>
      )}
      {state && (
        <figcaption>
          {state}
          {failed && <button className="hub-btn art-retry" onClick={() => setAttempt((n) => n + 1)}>Retry</button>}
        </figcaption>
      )}
    </figure>
  );
}

