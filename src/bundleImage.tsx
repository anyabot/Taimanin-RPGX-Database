// One texture out of a game bundle, as an <img>: chapter / event banners, rune
// and enemy icons. Decoded when the element first scrolls into view, then
// cached as a blob URL for the page's lifetime (many share one atlas bundle:
// image_banner_t holds 322 event banners, image_rune_s 876 rune icons).

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getAssets } from "./data";
import { toImageData } from "./unity/client";
import { ClassID } from "./unity/serialized";

const cache = new Map<string, Promise<string>>();

/** Blob URL of texture `name` in bundle `stem` (its only texture if no name);
 *  several stems are tried in order (boss icons: image_ene_s, then image_bos_s). */
export function bundleImageUrl(stem: string | string[], name?: string): Promise<string> {
  if (Array.isArray(stem)) {
    const [first, ...rest] = stem;
    return rest.length ? bundleImageUrl(first, name).catch(() => bundleImageUrl(rest, name)) : bundleImageUrl(first, name);
  }
  const key = `${stem}/${name ?? ""}`;
  let p = cache.get(key);
  if (!p) {
    p = (async () => {
      const assets = await getAssets();
      const list = await assets.list(stem);
      const tex = list.find((e) => e.classId === ClassID.Texture2D && (!name || e.name === name));
      if (!tex) throw new Error(`${name ?? "texture"} not in ${stem}`);
      const img = await assets.texture(stem, tex.pathId);
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d")!.putImageData(toImageData(img), 0, 0);
      return new Promise<string>((ok, fail) => c.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : fail(new Error("toBlob"))), "image/webp", 0.92));
    })();
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

export function BundleImage({ stem, name, alt = "", className, width, height, style }: {
  stem: string | string[]; name?: string; alt?: string; className?: string; width?: number; height?: number; style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    const load = () => bundleImageUrl(stem, name).then((u) => live && setUrl(u), () => live && setFailed(true));
    if (!("IntersectionObserver" in window)) { load(); return () => { live = false; }; }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => { live = false; io.disconnect(); };
  }, [String(stem), name]);
  return (
    <span ref={ref} className={`bundle-image${url ? " ready" : ""}${failed ? " failed" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...style, ...(width ? { width } : {}), ...(height ? { height } : {}) }}>
      {url && <img src={url} alt={alt} />}
    </span>
  );
}
