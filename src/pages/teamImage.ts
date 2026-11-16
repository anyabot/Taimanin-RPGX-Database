// The team as a PNG: the same columns as the page's team strip, drawn on a
// canvas (unit icons and rune icons are same-origin or blob URLs, so the
// canvas stays exportable).
import { bundleIconForCanvas } from "../bundleImage";

export interface ImageRune { count: number; stem: string; icon: string; name: string; tier: string; note?: string }
export interface ImageColumn {
  head: string; icon?: string; name?: string; title?: string; runes: ImageRune[]; note?: string; hl?: boolean; lines: string[];
}

const COL = 210, GAP = 10, PAD = 24, ICON = 112, RUNE = 26, SCALE = 2;
const FONT = `"Segoe UI", "Hiragino Sans", "Yu Gothic UI", "Noto Sans JP", system-ui, sans-serif`;
const C = { bg: "#11141f", card: "#1a1f2e", border: "#2c3346", text: "#eef0f6", muted: "#9aa3b8", hl: "#ff5c6c", tier: "#f0c24b" };

const loadImg = (src: string) => new Promise<HTMLImageElement | null>((ok) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = src;
});

/** Greedy wrap on spaces, falling back to characters for Japanese or long words. */
function wrap(ctx: CanvasRenderingContext2D, text: string, width: number): string[] {
  const out: string[] = [];
  let line = "";
  const tokens = text.match(/\S+\s*|\s+/g) ?? [];
  for (const tok of tokens) {
    if (ctx.measureText(line + tok).width <= width) { line += tok; continue; }
    if (line.trim()) { out.push(line.trimEnd()); line = ""; }
    for (const ch of tok) {
      if (ctx.measureText(line + ch).width > width && line) { out.push(line.trimEnd()); line = ""; }
      line += ch;
    }
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

export async function renderTeamImage(title: string | undefined, cols: ImageColumn[]): Promise<Blob> {
  const icons = await Promise.all(cols.map((c) => (c.icon ? loadImg(c.icon) : Promise.resolve(null))));
  const runeIcons = await Promise.all(cols.map((c) => Promise.all(c.runes.map((r) => bundleIconForCanvas(r.stem, `${r.icon}_s`)))));

  const width = PAD * 2 + cols.length * COL + (cols.length - 1) * GAP;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const inner = COL - 12;

  // one pass to measure, one to draw
  const layout = (draw: boolean, top: number) => {
    let bottom = top;
    cols.forEach((col, i) => {
      const x0 = PAD + i * (COL + GAP), cx = x0 + COL / 2;
      let y = top;
      const text = (s: string, size: number, color: string, weight = 400, lh = size * 1.35) => {
        ctx.font = `${weight} ${size}px ${FONT}`;
        for (const l of wrap(ctx, s, inner)) {
          if (draw) { ctx.fillStyle = color; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(l, cx, y); }
          y += lh;
        }
      };
      if (col.head) text(col.head, 16, C.text, 700);
      else y += 16 * 1.35; // same row height as "Leader", so every icon lines up
      y += 6;
      if (draw) {
        const img = icons[i];
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(cx - ICON / 2, y, ICON, ICON, 10);
        ctx.clip();
        if (img) ctx.drawImage(img, cx - ICON / 2, y, ICON, ICON);
        else { ctx.fillStyle = C.card; ctx.fill(); }
        ctx.restore();
      }
      y += ICON + 6;
      if (col.name) text(col.name, 13, C.muted);
      if (col.title) text(col.title, 12, C.muted);
      y += 4;
      const accent = col.hl ? C.hl : C.text;
      col.runes.forEach((r, k) => {
        // "4 [icon] 不屈 UR", centred as one row
        ctx.font = `700 15px ${FONT}`;
        const wCount = ctx.measureText(String(r.count)).width;
        ctx.font = `700 11px ${FONT}`;
        const wTier = ctx.measureText(r.tier).width;
        // long "English 日本語" names shrink to stay inside the column
        let nameSize = 15;
        ctx.font = `400 ${nameSize}px ${FONT}`;
        const room = inner - (wCount + 4 + RUNE + 4 + 5 + wTier);
        if (ctx.measureText(r.name).width > room) {
          nameSize = Math.max(10, Math.floor(nameSize * room / ctx.measureText(r.name).width));
          ctx.font = `400 ${nameSize}px ${FONT}`;
        }
        const wName = ctx.measureText(r.name).width;
        const total = wCount + 4 + RUNE + 4 + wName + 5 + wTier;
        let x = cx - total / 2;
        if (draw) {
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const mid = y + RUNE / 2;
          ctx.font = `700 15px ${FONT}`; ctx.fillStyle = accent; ctx.fillText(String(r.count), x, mid); x += wCount + 4;
          const ic = runeIcons[i][k];
          if (ic) ctx.drawImage(ic.img, ...ic.rect, x, y, RUNE, RUNE);
          x += RUNE + 4;
          ctx.font = `400 ${nameSize}px ${FONT}`; ctx.fillStyle = accent; ctx.fillText(r.name, x, mid); x += wName + 5;
          ctx.font = `700 11px ${FONT}`; ctx.fillStyle = C.tier; ctx.fillText(r.tier, x, mid);
        }
        y += RUNE + 3;
        if (r.note) text(r.note, 12, col.hl ? C.hl : C.muted);
      });
      if (col.note) { y += 2; text(col.note, 13, col.hl ? C.hl : C.muted); }
      if (col.lines.length) y += 8;
      for (const l of col.lines) text(l, 13, C.text, 400, 18);
      bottom = Math.max(bottom, y);
    });
    return bottom;
  };

  const titleH = title ? 40 : 0;
  ctx.font = `400 13px ${FONT}`;
  const bodyBottom = layout(false, PAD + titleH);
  const height = bodyBottom + PAD + 22;
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, width, height);
  if (title) {
    ctx.font = `700 22px ${FONT}`;
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(title, width / 2, PAD - 4, width - PAD * 2);
  }
  layout(true, PAD + titleH);
  ctx.font = `400 11px ${FONT}`;
  ctx.fillStyle = C.muted;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText("Taimanin RPGX Database · Team builder", width - PAD, height - 10);

  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("toBlob"))), "image/png"));
}
