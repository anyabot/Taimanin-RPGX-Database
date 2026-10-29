// ADV scenario scripts: parsing and the stage state at every text beat.
//
// A script is a flat list of <COMMAND>args lines and plain text lines; the
// reader stops at each <PAUSE>. Every command only changes stage state (layers,
// name plate, music), so the whole scene is precomputed as one snapshot per
// PAUSE: going back or jumping is picking an index, with nothing to replay.
// The rules are the local viewer's (taimanin_viewer.html runInner and the
// HANDOFF.md notes "The ACTOR command", "CG mode and compositing").

/** What tools/web_export/scenes.py writes per scene. */
export interface SceneDoc {
  id: string;
  title: string | null;
  script: { bundle: string; pathId: string };
  /** direct-download folder of the voice clips, e.g. "Adv/Voice_r18/chr_0001_1" */
  voice?: string;
  /** <EV> group -> layers [sprite, x, y, w, h, alpha]: centre offsets on the 960x720 frame, y up */
  ev: Record<string, [string, number, number, number, number, number][]>;
  /** <ACTOR> name -> pieces [sprite, x, y, w, h]: centre offsets on the 1280x760 actor canvas, y up */
  actors: Record<string, [string, number, number, number, number][]>;
  /** sprite name -> bundle stem */
  sprites: Record<string, string>;
  /** <SPINE> model -> where its atlas and skeletons are (TextAsset names) */
  spine: Record<string, { bundle: string; atlas: string; skels: Record<string, string>; primary: string }>;
}

export interface Op { t: string; a: string[] }

export interface Actor { slot: string; name: string; x: "LEFT" | "CENTER" | "RIGHT" }

export interface Beat {
  name: string;
  text: string;
  bg: string | null;
  ev: string | null;
  actors: Actor[];
  textBox: boolean;
  bgm: string | null;
  /** an animated CG is showing: model, and the <SPINE_ANIMATOR> animation if set */
  spine: string | null;
  spineAnim: string | null;
  /** one-shot cues fired on arriving at this beat by stepping forward */
  voice: string | null;
  se: string[];
  flash: boolean;
  quake: boolean;
  /** the text is a translation's English, not the script's Japanese */
  en?: boolean;
}

export function parseScript(text: string): Op[] {
  const ops: Op[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, "").trim();
    if (!line || line.startsWith("//")) continue;
    if (/^<\/[A-Z_0-9]+>$/i.test(line)) continue; // </GROUP> is syntax, not dialogue
    const m = /^<([A-Z_0-9]+)>(.*)$/i.exec(line);
    if (m) ops.push({ t: m[1].toUpperCase(), a: m[2].split(",").map((s) => s.trim()) });
    else ops.push({ t: "TEXT", a: [line] });
  }
  return ops;
}

export function beats(ops: Op[]): Beat[] {
  const out: Beat[] = [];
  let s: Beat = {
    name: "", text: "", bg: null, ev: null, actors: [], textBox: true, bgm: null, spine: null, spineAnim: null,
    voice: null, se: [], flash: false, quake: false,
  };
  const push = () => {
    out.push({ ...s, actors: [...s.actors], se: [...s.se] });
    s = { ...s, name: "", text: "", voice: null, se: [], flash: false, quake: false };
  };
  for (const { t, a } of ops) {
    switch (t) {
      case "TEXT": s.text += (s.text ? "\n" : "") + a.join(","); break;
      case "NAME_PLATE": s.name = a.join(",").trim(); break;
      case "TXT_CLEAR": s.text = ""; s.name = ""; break;
      case "PAUSE": push(); break;
      case "BG": s.bg = a[0] || null; break;
      case "BG_OUT": s.bg = null; s.ev = null; break;
      case "EV": s.ev = a[0] || null; break;
      case "EV_OUT": s.ev = null; break;
      // <ACTOR> slot, name, posFrom, posTo, IN|OUT|NONE, easing, ms: posTo applies, OUT dismisses.
      case "ACTOR": {
        const slot = a[0] || "0";
        const rest = s.actors.filter((x) => x.slot !== slot);
        const dir = (a[4] || "IN").toUpperCase();
        const pos = (a[3] || a[2] || "CENTER").toUpperCase();
        s.actors = dir === "OUT" || !a[1] ? rest
          : [...rest, { slot, name: a[1], x: pos === "LEFT" || pos === "RIGHT" ? pos : "CENTER" }];
        break;
      }
      case "ACTOR_OUT": s.actors = s.actors.filter((x) => x.slot !== (a[0] || "0")); break;
      // <ACTOR_FRONT> slot: draw that actor over the others (actors draw in list order)
      case "ACTOR_FRONT": {
        const front = s.actors.find((x) => x.slot === (a[0] || "0"));
        if (front) s.actors = [...s.actors.filter((x) => x !== front), front];
        break;
      }
      case "VOICE_PLAY": s.voice = a[0] || null; break;
      case "SE_PLAY": if (a[0]) s.se.push(a[0]); break;
      case "BGM_PLAY": s.bgm = a[0] || null; break;
      case "BGM_STOP": s.bgm = null; break;
      case "EFFECT_FLASH": s.flash = true; break;
      case "EFFECT_QUAKE": s.quake = true; break;
      case "UI_DISP": s.textBox = (a[0] || "").toUpperCase() !== "OFF"; break;
      case "SPINE": s.spine = (a[1] || "IN").toUpperCase() === "OUT" ? null : a[0] || null; s.spineAnim = null; break;
      case "SPINE_ANIMATOR": if (s.spine) s.spineAnim = a[0] || null; break;
      case "SCENARIO_END": break;
      default: break; // WAIT, TRANSITION, GROUP, LABEL, JUMP, ...
    }
  }
  if (s.text || s.name) push();
  return out;
}

/** The beats with a translation's name and text in place of the Japanese
 *  (one line per beat, public/data/tl); beats it has no line for keep theirs. */
export function translated(beats: Beat[], lines: ([string, string] | 0)[]): Beat[] {
  return beats.map((b, k) => {
    const l = lines[k];
    return l ? { ...b, name: l[0], text: l[1], en: true } : b;
  });
}
