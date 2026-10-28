// Scene art and audio, decoded from the game CDN when a beat first needs it.
// Everything resolves to a blob URL and is cached for the page's lifetime.

import type { Assets } from "./unity/client";
import { toImageData } from "./unity/client";
import type { SceneDoc } from "./adv";
import { ClassID } from "./unity/serialized";
import { DIRECT_ROOT } from "./unity/catalog";
import type { SpineModel } from "./spine";

const EV_W = 960, EV_H = 720;
const ACTOR_W = 1280, ACTOR_H = 760;

export interface SeIndex { bundle: string; clips: Record<string, string> }

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

const blobUrl = (c: HTMLCanvasElement, type = "image/png") =>
  new Promise<string>((ok, fail) => c.toBlob((b) => (b ? ok(URL.createObjectURL(b)) : fail(new Error("toBlob"))), type));

export class SceneArt {
  private memo = new Map<string, Promise<any>>();

  constructor(private assets: Assets, private doc: SceneDoc, private se: SeIndex | null) {}

  private once<T>(key: string, make: () => Promise<T>): Promise<T> {
    let p = this.memo.get(key);
    if (!p) {
      p = make();
      p.catch(() => this.memo.delete(key));
      this.memo.set(key, p);
    }
    return p;
  }

  /** A sprite at its logical size (m_Rect), transparent padding included:
   *  actor pieces are placed by the padded rect, not the packed pixels. */
  sprite(stem: string, name: string): Promise<HTMLCanvasElement> {
    return this.once(`sprite:${stem}/${name}`, async () => {
      const list = await this.assets.list(stem);
      const sp = list.find((e) => e.classId === ClassID.Sprite && e.name === name);
      if (sp) {
        const s = await this.assets.sprite(stem, sp.pathId);
        const c = canvas(Math.round(s.rect.width), Math.round(s.rect.height));
        const img = canvas(s.image.width, s.image.height);
        img.getContext("2d")!.putImageData(toImageData(s.image), 0, 0);
        c.getContext("2d")!.drawImage(img, Math.round(s.textureRectOffset.x),
          Math.round(s.rect.height - s.textureRectOffset.y - s.image.height));
        return c;
      }
      const tex = list.find((e) => e.classId === ClassID.Texture2D && (e.name === name || list.length <= 3));
      if (!tex) throw new Error(`${name} not in ${stem}`);
      const t = await this.assets.texture(stem, tex.pathId);
      const c = canvas(t.width, t.height);
      c.getContext("2d")!.putImageData(toImageData(t), 0, 0);
      return c;
    });
  }

  /** Backgrounds are 1280x720, one per bundle. */
  bg(name: string): Promise<string> {
    return this.once(`bg:${name}`, async () => {
      const stem = `adv_bg_assets_adv_bg_${name}.png`;
      const list = await this.assets.list(stem);
      const one = list.find((e) => e.classId === ClassID.Sprite) ?? list.find((e) => e.classId === ClassID.Texture2D);
      if (!one) throw new Error(`no image in ${stem}`);
      return blobUrl(await this.sprite(stem, one.name), "image/jpeg");
    });
  }

  /** An <EV> group composed on its authored 960x720 frame. */
  ev(group: string): Promise<string> {
    return this.once(`ev:${group}`, async () => {
      const layers = this.doc.ev[group];
      if (!layers) throw new Error(`no layers for ${group}`);
      const pieces = await Promise.all(layers.map(([s]) => this.sprite(this.doc.sprites[s], s)));
      const c = canvas(EV_W, EV_H);
      const g = c.getContext("2d")!;
      g.fillStyle = "#000";
      g.fillRect(0, 0, EV_W, EV_H);
      layers.forEach(([, x, y, w, h, alpha], i) => {
        g.globalAlpha = alpha ?? 1;
        g.drawImage(pieces[i], EV_W / 2 + x - w / 2, EV_H / 2 - y - h / 2, w, h);
      });
      return blobUrl(c, "image/jpeg");
    });
  }

  /** An actor pose composed on the 1280x760 actor canvas. */
  actor(name: string): Promise<string> {
    return this.once(`actor:${name}`, async () => {
      const parts = this.doc.actors[name];
      if (!parts) throw new Error(`no source for actor ${name}`);
      const pieces = await Promise.all(parts.map(([s]) => this.sprite(this.doc.sprites[s], s)));
      const c = canvas(ACTOR_W, ACTOR_H);
      const g = c.getContext("2d")!;
      parts.forEach(([, x, y, w, h], i) => g.drawImage(pieces[i], ACTOR_W / 2 + x - w / 2, ACTOR_H / 2 - y - h / 2, w, h));
      return blobUrl(c);
    });
  }

  bgm(name: string): Promise<string> {
    return this.once(`bgm:${name}`, async () => {
      const stem = `adv_bgm_assets_adv_bgm_${name}.ogg`;
      const clip = (await this.assets.list(stem)).find((e) => e.classId === ClassID.AudioClip);
      if (!clip) throw new Error(`no clip in ${stem}`);
      const a = await this.assets.audio(stem, clip.pathId);
      return URL.createObjectURL(new Blob([a.bytes as Uint8Array<ArrayBuffer>], { type: "audio/mp4" }));
    });
  }

  /** Sound effects all live in adv_assets_all (14 MB), read by range. */
  seClip(name: string): Promise<string> {
    return this.once(`se:${name}`, async () => {
      const id = this.se?.clips[name];
      if (!id) throw new Error(`unknown sound effect ${name}`);
      const rb = await this.assets.remote(this.se!.bundle);
      const bytes = await rb.audio(id, name);
      return URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "audio/mp4" }));
    });
  }

  /** An event Spine model: atlas text, every skeleton variant, and the atlas
   *  pages it names (the "_mosaic" mask pages are never named, so never decoded). */
  spineModel(name: string): Promise<SpineModel> {
    return this.once(`spine:${name}`, async () => {
      const ref = this.doc.spine[name];
      if (!ref) throw new Error(`no bundle for Spine model ${name}`);
      const stem = ref.bundle;
      const list = await this.assets.list(stem);
      // TextAsset names keep their file extension (".atlas", ".skel").
      const textNamed = async (file: string) => {
        const e = list.find((x) => x.classId === ClassID.TextAsset && x.name.toLowerCase() === file.toLowerCase());
        if (!e) throw new Error(`${file} not in ${stem}`);
        return this.assets.text(stem, e.pathId);
      };
      const atlas = new TextDecoder().decode(await textNamed(ref.atlas));
      const skels: Record<string, Uint8Array> = { "": await textNamed(ref.primary) };
      for (const [v, file] of Object.entries(ref.skels)) skels[v] = file === ref.primary ? skels[""] : await textNamed(file);
      const pages: Record<string, ImageData> = {};
      for (const page of atlas.split(/\r?\n/).map((l) => l.trim()).filter((l) => /\.png$/i.test(l))) {
        const base = page.replace(/\.png$/i, "");
        const tex = list.find((e) => e.classId === ClassID.Texture2D && e.name === base);
        if (!tex) throw new Error(`atlas page ${page} not in ${stem}`);
        pages[page] = toImageData(await this.assets.texture(stem, tex.pathId));
      }
      return { name, atlas, skels, pages };
    });
  }

  /** Scene voices are direct downloads, one folder per scene (the exporter
   *  names it: Adv/Voice_r18/<scene> for R18 scripts, Adv/Voice/<scene> else). */
  voiceUrl(name: string) {
    let folder = this.doc.voice ?? `Adv/Voice_r18/${this.doc.id.replace(/_r18$/, "")}`;
    // A script can reuse another scene's lines (chr_5008_3 plays
    // chr_5008_2_0000_r18): those live in that scene's folder, named by the
    // line itself.
    const owner = name.match(/^(.+?)_\d{4}(?:_r18)?$/)?.[1];
    if (owner && !folder.endsWith(`/${owner}`)) folder = `${folder.slice(0, folder.lastIndexOf("/"))}/${owner}`;
    return `${DIRECT_ROOT}/${folder}/${name}.ogg`;
  }

  /** A voice line downloaded in full, as a blob URL, so a beat can wait for
   *  it and start it together with its picture. */
  voice(name: string): Promise<string> {
    return this.once(`voice:${name}`, async () => {
      const res = await fetch(this.voiceUrl(name));
      if (!res.ok) throw new Error(`voice ${name}: HTTP ${res.status}`);
      return URL.createObjectURL(await res.blob());
    });
  }

  /** Everything a beat shows or plays, for prefetching. Errors are left to the beat. */
  prefetch(b: { bg: string | null; ev: string | null; actors: { name: string }[]; spine: string | null; voice?: string | null }) {
    if (b.voice) this.voice(b.voice).catch(() => {});
    if (b.bg) this.bg(b.bg).catch(() => {});
    if (b.ev) this.ev(b.ev).catch(() => {});
    for (const a of b.actors) if (this.doc.actors[a.name]) this.actor(a.name).catch(() => {});
    if (b.spine && this.doc.spine[b.spine]) this.spineModel(b.spine).catch(() => {});
  }
}

/** The scene's script text: one object range-read out of the 24 MB scenario
 *  bundle; the whole bundle only if the exported path id no longer matches. */
export async function loadScript(assets: Assets, doc: SceneDoc): Promise<string> {
  const { bundle, pathId } = doc.script;
  try {
    const rb = await assets.remote(bundle);
    return await rb.text(pathId, doc.id);
  } catch (err) {
    console.warn("range read failed, fetching the whole scenario bundle", err);
    // A scene's script and its pairList share the name: skip the JSON one.
    const list = await assets.list(bundle);
    for (const e of list.filter((x) => x.classId === ClassID.TextAsset && x.name === doc.id)) {
      const text = new TextDecoder().decode(await assets.text(bundle, e.pathId));
      if (!text.trimStart().startsWith("{")) return text;
    }
    throw new Error(`script ${doc.id} not in ${bundle}`);
  }
}

const loadImage = (url: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => fail(new Error(`image ${url}`));
  img.src = url;
});

/** What the stage shows, flattened to a 1280x720 PNG laid out as the stage CSS
 *  lays it out: background, actors (760 high, bottom-aligned, centred at a
 *  quarter, half or three quarters across), the 960x720 CG pillarboxed on
 *  black, and an animated CG frame over everything. */
export async function composeFrame(shown: { bg: string | null; ev: string | null; actors: { x: "LEFT" | "CENTER" | "RIGHT"; url: string }[] },
  spine: HTMLCanvasElement | null): Promise<Blob> {
  const W = 1280, H = 720;
  const c = canvas(W, H);
  const g = c.getContext("2d")!;
  g.fillStyle = "#000";
  g.fillRect(0, 0, W, H);
  if (spine) g.drawImage(spine, 0, 0, W, H);
  else {
    if (shown.bg) g.drawImage(await loadImage(shown.bg), 0, 0, W, H);
    for (const a of shown.actors) {
      const cx = a.x === "LEFT" ? W / 4 : a.x === "RIGHT" ? W * 3 / 4 : W / 2;
      g.drawImage(await loadImage(a.url), cx - ACTOR_W / 2, H - ACTOR_H, ACTOR_W, ACTOR_H);
    }
    if (shown.ev) {
      g.fillRect(0, 0, W, H);
      g.drawImage(await loadImage(shown.ev), (W - EV_W) / 2, 0, EV_W, EV_H);
    }
  }
  return new Promise((ok, fail) => c.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob"))), "image/png"));
}

/** Hands the browser a file to save. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
