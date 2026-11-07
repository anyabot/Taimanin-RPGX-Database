// One texture out of a game bundle, as an <img>: chapter / event banners, rune
// and enemy icons. Decoded when the element first scrolls into view, then
// cached as a blob URL for the page's lifetime (many share one atlas bundle:
// image_banner_t holds 322 event banners, image_rune_s 876 rune icons).

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GAME_CDN, getAssets } from "./data";
import { toImageData } from "./unity/client";
import { ClassID } from "./unity/serialized";
import { HOSTED } from "./unity/catalog";

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

type BundleImageProps = {
  stem: string | string[]; name?: string; alt?: string; className?: string; width?: number; height?: number; style?: CSSProperties;
};

/** Bundles the deployed build serves itself, next to the unit art (upload_b2.py). */
const HOSTED_STEMS = new Set(["image_customize_skin_assets_all"]);

export function BundleImage(props: BundleImageProps) {
  const own = HOSTED && [props.stem].flat().every((s) => HOSTED_STEMS.has(s));
  return GAME_CDN || own ? <CdnImage {...props} /> : <AtlasImage {...props} />;
}

// ---- the deployed build: icon sheets it serves itself (tools/web_export/atlases.py)
const ATLASES = new Set(["image_item_s_assets_all", "image_rune_s_assets_all", "image_ene_s_assets_all", "image_bos_s_assets_all"]);
interface Atlas { sheets: [number, number][]; icons: Record<string, [number, number, number, number, number]> }
interface AtlasIcon { url: string; sheet: [number, number]; rect: [number, number, number, number] }
const atlases = new Map<string, Promise<Atlas>>();
const atlasBase = `${import.meta.env.BASE_URL}atlas/`;

async function atlasIcon(stem: string | string[], name?: string): Promise<AtlasIcon | null> {
  for (const s of Array.isArray(stem) ? stem : [stem]) {
    if (!ATLASES.has(s) || !name) continue;
    let a = atlases.get(s);
    if (!a) {
      a = fetch(`${atlasBase}${s}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${s}.json: ${r.status}`))));
      a.catch(() => atlases.delete(s));
      atlases.set(s, a);
    }
    const r = (await a).icons[name];
    if (r) return { url: `${atlasBase}${s}_${r[0]}.webp`, sheet: (await a).sheets[r[0]], rect: [r[1], r[2], r[3], r[4]] };
  }
  return null;
}

// Gacha and story banners, one WebP each (tools/web_export/banner_art.py): "<stem>|<name>" -> file.
const artBase = `${import.meta.env.BASE_URL}art/`;
let artIndex: Promise<Record<string, string>> | null = null;

async function artUrl(stem: string | string[], name?: string): Promise<string | null> {
  artIndex ??= fetch(`${artBase}index.json`).then((r) => (r.ok ? r.json() : {}), () => ({}));
  const index = await artIndex;
  for (const s of Array.isArray(stem) ? stem : [stem]) {
    const file = index[`${s}|${name ?? ""}`];
    if (file) return `${artBase}${file}`;
  }
  return null;
}

/** An icon cut from a sheet by CSS, or a banner picture; nothing else (stills, art) is served here. */
function AtlasImage({ stem, name, alt = "", className, width, height, style }: BundleImageProps) {
  const [icon, setIcon] = useState<AtlasIcon | null>(null);
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    atlasIcon(stem, name).then((i) => i ? live && setIcon(i) : artUrl(stem, name).then((u) => live && setArt(u)), () => {});
    return () => { live = false; };
  }, [String(stem), name]);
  if (art) {
    return (
      <span className={`bundle-image ready${className ? ` ${className}` : ""}`}
        style={{ ...style, ...(width ? { width } : {}), ...(height ? { height } : {}) }}>
        <img src={art} alt={alt} loading="lazy" />
      </span>
    );
  }
  if (!icon) return null;
  const [x, y, w, h] = icon.rect;
  const sx = (width ?? w) / w, sy = (height ?? h) / h;
  return (
    <span role={alt ? "img" : undefined} aria-label={alt || undefined}
      className={`bundle-image ready${className ? ` ${className}` : ""}`}
      style={{
        ...style, width: width ?? w, height: height ?? h,
        backgroundImage: `url(${icon.url})`, backgroundRepeat: "no-repeat",
        backgroundSize: `${icon.sheet[0] * sx}px ${icon.sheet[1] * sy}px`,
        backgroundPosition: `${-x * sx}px ${-y * sy}px`,
      }} />
  );
}

// ---- dev and `npm run preview`: decoded from the game CDN
function CdnImage({ stem, name, alt = "", className, width, height, style }: BundleImageProps) {
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
