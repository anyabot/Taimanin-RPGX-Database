// Screenshot unit-icon recognition for the Collection page (after the
// matcher on the Aigis site).
//
// data/icon_hashes.json holds a 264-bit gradient-sign hash (dHash over a
// 12x12 luma grid, horizontal + vertical) of the crop-inset region of every
// unit icon (public/icons/<id>.webp). Scanning a screenshot:
//   1. edge-energy profiles per axis -> peaks; peak-spacing vote clusters
//      that appear on BOTH axes are icon-size candidates,
//   2. candidate cell corners per axis = union of arithmetic peak chains
//      (junk corners merely fail to match later),
//   3. a probe phase sweeps (dx, dy, size) on the cells with the best
//      icon-frame evidence; probe match quality picks the size,
//   4. every cell runs a coarse-then-refined position sweep against the
//      full hash set; Hamming distance decides, NMS dedupes rectangles.
// The crop inset skips the in-game overlays (lock and rarity along the top,
// element triangle bottom-left, level along the bottom, badges on the right).

export interface IconHashDb {
  crop: [number, number, number, number];
  grid: number;
  count: number;
  ids: string[];
  words: Uint32Array; // WORDS_PER_HASH per icon
}

export interface IconMatchRect {
  x: number;
  y: number;
  size: number;
}

export interface IconMatch {
  unitId: string;
  dist: number;
  rect: IconMatchRect;
}

export interface ScanResult {
  matches: IconMatch[];
  canvas: HTMLCanvasElement; // the (possibly downscaled) scanned image
}

export interface IconHashJson {
  meta: { crop: [number, number, number, number]; grid: number; bits: number };
  icons: [string, string][];
}

const WORDS_PER_HASH = 9;
// distances are out of 264 bits
export const HASH_BITS = 264;
export const AUTO_ACCEPT_DIST = 45;
export const SUGGEST_DIST = 64;
const PREFIX_CUTOFF = 30; // first 64 bits; correct matches stay well below
const MAX_SCAN_WIDTH = 2600;

export function unpackIconHashes(json: IconHashJson): IconHashDb {
  const count = json.icons.length;
  const ids: string[] = new Array(count);
  const words = new Uint32Array(count * WORDS_PER_HASH);
  json.icons.forEach(([id, b64], i) => {
    ids[i] = id;
    const raw = atob(b64);
    const base = i * WORDS_PER_HASH;
    for (let bi = 0; bi < raw.length; bi += 1) {
      words[base + (bi >> 2)] |= raw.charCodeAt(bi) << ((bi & 3) * 8);
    }
  });
  return { crop: json.meta.crop, grid: json.meta.grid, count, ids, words };
}

function popcount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

export interface Luma {
  w: number;
  h: number;
  px: Uint8Array;
  integral: Float64Array; // (w+1)*(h+1) luma summed-area table
  gradX: Float64Array; // (w+1)*(h+1) summed |horizontal luma gradient|
  gradY: Float64Array; // (w+1)*(h+1) summed |vertical luma gradient|
}

export function lumaFromRgba(rgba: ArrayLike<number>, w: number, h: number): Luma {
  const px = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < px.length; i += 1, p += 4) {
    px[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114 + 500) / 1000;
  }
  const iw = w + 1;
  const integral = new Float64Array(iw * (h + 1));
  const gradX = new Float64Array(iw * (h + 1));
  const gradY = new Float64Array(iw * (h + 1));
  for (let y = 0; y < h; y += 1) {
    let rowSum = 0;
    let rowGx = 0;
    let rowGy = 0;
    for (let x = 0; x < w; x += 1) {
      const v = px[y * w + x];
      rowSum += v;
      rowGx += x + 1 < w ? Math.abs(px[y * w + x + 1] - v) : 0;
      rowGy += y + 1 < h ? Math.abs(px[(y + 1) * w + x] - v) : 0;
      integral[(y + 1) * iw + x + 1] = integral[y * iw + x + 1] + rowSum;
      gradX[(y + 1) * iw + x + 1] = gradX[y * iw + x + 1] + rowGx;
      gradY[(y + 1) * iw + x + 1] = gradY[y * iw + x + 1] + rowGy;
    }
  }
  return { w, h, px, integral, gradX, gradY };
}

function boxMean(lu: Luma, x0: number, y0: number, x1: number, y1: number): number {
  const iw = lu.w + 1;
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  return (
    (lu.integral[y1 * iw + x1] - lu.integral[y0 * iw + x1]
      - lu.integral[y1 * iw + x0] + lu.integral[y0 * iw + x0]) / area
  );
}

function boxMeanOf(table: Float64Array, iw: number, x0: number, y0: number, x1: number, y1: number): number {
  const area = (x1 - x0) * (y1 - y0);
  if (area <= 0) return 0;
  return (table[y1 * iw + x1] - table[y0 * iw + x1] - table[y1 * iw + x0] + table[y0 * iw + x0]) / area;
}

// icon-frame evidence for a cell: icons carry a strong rectangular border,
// UI chrome rarely has all four. Score = the weakest of the four border
// strips' edge energy, O(1) via the gradient summed-area tables.
function borderScore(lu: Luma, x: number, y: number, s: number): number {
  const iw = lu.w + 1;
  const cl = (v: number, hi: number) => Math.max(0, Math.min(hi, Math.round(v)));
  const yi0 = cl(y + 0.15 * s, lu.h);
  const yi1 = cl(y + 0.85 * s, lu.h);
  const xi0 = cl(x + 0.15 * s, lu.w);
  const xi1 = cl(x + 0.85 * s, lu.w);
  const vStrip = (bx: number) =>
    boxMeanOf(lu.gradX, iw, cl(bx - 3, lu.w), yi0, cl(bx + 3, lu.w), yi1);
  const hStrip = (by: number) =>
    boxMeanOf(lu.gradY, iw, xi0, cl(by - 3, lu.h), xi1, cl(by + 3, lu.h));
  return Math.min(vStrip(x), vStrip(x + s), hStrip(y), hStrip(y + s));
}

// 264-bit descriptor of the crop-inset region of cell (x, y, w, h),
// bit order identical to the exporter (icon_hashes.py)
function descriptor(
  lu: Luma, x: number, y: number, w: number, h: number,
  crop: [number, number, number, number], grid: number, out: Uint32Array,
): Uint32Array {
  out.fill(0);
  const bx = x + crop[0] * w;
  const by = y + crop[1] * h;
  const bw = (crop[2] - crop[0]) * w;
  const bh = (crop[3] - crop[1]) * h;
  const g = new Float64Array(grid * grid);
  for (let gy = 0; gy < grid; gy += 1) {
    const y0 = Math.max(0, Math.min(lu.h, Math.round(by + (gy * bh) / grid)));
    const y1 = Math.max(y0 + 1, Math.min(lu.h, Math.round(by + ((gy + 1) * bh) / grid)));
    for (let gx = 0; gx < grid; gx += 1) {
      const x0 = Math.max(0, Math.min(lu.w, Math.round(bx + (gx * bw) / grid)));
      const x1 = Math.max(x0 + 1, Math.min(lu.w, Math.round(bx + ((gx + 1) * bw) / grid)));
      g[gy * grid + gx] = boxMean(lu, x0, y0, x1, y1);
    }
  }
  let i = 0;
  for (let gy = 0; gy < grid; gy += 1) {
    for (let gx = 0; gx < grid - 1; gx += 1, i += 1) {
      if (g[gy * grid + gx + 1] > g[gy * grid + gx]) out[i >>> 5] |= 1 << (i & 31);
    }
  }
  for (let gy = 0; gy < grid - 1; gy += 1) {
    for (let gx = 0; gx < grid; gx += 1, i += 1) {
      if (g[(gy + 1) * grid + gx] > g[gy * grid + gx]) out[i >>> 5] |= 1 << (i & 31);
    }
  }
  return out;
}

function bestRef(db: IconHashDb, d: Uint32Array): { index: number; dist: number } {
  let bestIndex = -1;
  let bestDist = Infinity;
  const { words, count } = db;
  for (let r = 0, base = 0; r < count; r += 1, base += WORDS_PER_HASH) {
    const pre = popcount(d[0] ^ words[base]) + popcount(d[1] ^ words[base + 1]);
    if (pre > PREFIX_CUTOFF) continue;
    let dist = pre;
    for (let wi = 2; wi < WORDS_PER_HASH && dist < bestDist; wi += 1) {
      dist += popcount(d[wi] ^ words[base + wi]);
    }
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = r;
    }
  }
  return { index: bestIndex, dist: bestDist };
}

interface Peak {
  pos: number;
  height: number;
}

function edgeProfile(lu: Luma, axis: 0 | 1): Float64Array {
  const { w, h, px } = lu;
  if (axis === 0) {
    const prof = new Float64Array(w - 1);
    for (let y = 0; y < h; y += 1) {
      const row = y * w;
      for (let x = 0; x < w - 1; x += 1) {
        prof[x] += Math.abs(px[row + x + 1] - px[row + x]);
      }
    }
    for (let x = 0; x < prof.length; x += 1) prof[x] /= h;
    return prof;
  }
  const prof = new Float64Array(h - 1);
  for (let y = 0; y < h - 1; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      prof[y] += Math.abs(px[row + w + x] - px[row + x]);
    }
  }
  for (let y = 0; y < prof.length; y += 1) prof[y] /= w;
  return prof;
}

function findPeaks(prof: Float64Array): Peak[] {
  const n = prof.length;
  const sm = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    const lo = Math.max(0, i - 1);
    const hi = Math.min(n, i + 2);
    let sum = 0;
    for (let j = lo; j < hi; j += 1) sum += prof[j];
    sm[i] = sum / (hi - lo);
  }
  let mean = 0;
  for (let i = 0; i < n; i += 1) mean += sm[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i += 1) variance += (sm[i] - mean) ** 2;
  const thr = mean + 0.5 * Math.sqrt(variance / n);
  const peaks: Peak[] = [];
  for (let i = 2; i < n - 2; i += 1) {
    if (sm[i] >= thr && sm[i] >= sm[i - 1] && sm[i] >= sm[i + 1]
      && sm[i] >= sm[i - 2] && sm[i] >= sm[i + 2]) {
      const last = peaks[peaks.length - 1];
      if (last && i - last.pos < 8) {
        if (sm[i] > last.height) {
          last.pos = i;
          last.height = sm[i];
        }
        continue;
      }
      peaks.push({ pos: i, height: sm[i] });
    }
  }
  return peaks;
}

interface GapCluster {
  center: number;
  votes: number;
}

// non-overlapping peak-spacing vote clusters (icon edges vote the icon
// width; grid neighbours vote the pitch)
function gapClusters(peaks: Peak[], lo: number, hi: number, take: number): GapCluster[] {
  const votes = new Map<number, number>();
  for (let i = 0; i < peaks.length; i += 1) {
    for (let j = i + 1; j < peaks.length; j += 1) {
      const d = peaks[j].pos - peaks[i].pos;
      if (d > hi) break;
      if (d >= lo) votes.set(d, (votes.get(d) || 0) + 1);
    }
  }
  const windows: GapCluster[] = [];
  votes.forEach((_, d) => {
    let total = 0;
    for (let o = -3; o <= 3; o += 1) total += votes.get(d + o) || 0;
    windows.push({ center: d, votes: total });
  });
  windows.sort((a, b) => b.votes - a.votes);
  const picked: GapCluster[] = [];
  for (const w of windows) {
    if (picked.length >= take) break;
    if (picked.every((p) => Math.abs(p.center - w.center) > 6)) picked.push(w);
  }
  return picked;
}

// candidate icon sizes: gap clusters present in BOTH axes. The icon's own
// left/right and top/bottom edges vote its width on each axis, while grid
// pitch can differ per axis (gacha results: columns 145 apart, rows 194,
// icons still ~104) so pitch clusters usually appear in only one.
function sizeCandidates(cx: GapCluster[], cy: GapCluster[], take: number): number[] {
  const both: GapCluster[] = [];
  cx.forEach((a) => {
    const b = cy.find((c) => Math.abs(c.center - a.center) <= 8);
    if (b) both.push({ center: Math.round((a.center + b.center) / 2), votes: a.votes + b.votes });
  });
  both.sort((a, b) => b.votes - a.votes);
  const picked = both.slice(0, take).map((c) => c.center);
  // degenerate screenshots (one row of icons) may vote too thinly on one
  // axis; fall back to the strongest single-axis clusters
  cx.forEach((a) => {
    if (picked.length < take && picked.every((p) => Math.abs(p - a.center) > 6)) {
      picked.push(a.center);
    }
  });
  return picked;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

interface Geometry {
  dx: number;
  dy: number;
  ds: number;
}

function bestCellMatch(
  db: IconHashDb, lu: Luma, cx: number, cy: number, pitch: number,
  geoms: Geometry[], scratch: Uint32Array,
): { dist: number; index: number; geom: Geometry } | null {
  let best: { dist: number; index: number; geom: Geometry } | null = null;
  for (const geom of geoms) {
    const s = pitch + geom.ds;
    const d = descriptor(lu, cx + geom.dx, cy + geom.dy, s, s, db.crop, db.grid, scratch);
    const m = bestRef(db, d);
    if (m.index >= 0 && (!best || m.dist < best.dist)) {
      best = { dist: m.dist, index: m.index, geom: { ...geom } };
    }
  }
  return best;
}

// two-stage: coarse geometry sweep, then a +-2 refinement around its best
function bestCellMatch2(
  db: IconHashDb, lu: Luma, cx: number, cy: number, pitch: number,
  coarse: Geometry[], scratch: Uint32Array,
): { dist: number; index: number; geom: Geometry } | null {
  const rough = bestCellMatch(db, lu, cx, cy, pitch, coarse, scratch);
  if (!rough) return null;
  const refine: Geometry[] = [];
  for (const ds of [-2, 0, 2]) {
    for (const dx of [-2, 0, 2]) {
      for (const dy of [-2, 0, 2]) {
        refine.push({
          dx: rough.geom.dx + dx,
          dy: rough.geom.dy + dy,
          ds: rough.geom.ds + ds,
        });
      }
    }
  }
  return bestCellMatch(db, lu, cx, cy, pitch, refine, scratch) || rough;
}

const yieldToUi = () => new Promise<void>((resolve) => { setTimeout(resolve, 0); });

export async function scanImage(
  source: CanvasImageSource & { width: number; height: number },
  db: IconHashDb,
  onProgress?: (fraction: number) => void,
): Promise<ScanResult> {
  const scale = Math.min(1, MAX_SCAN_WIDTH / source.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("canvas 2d context unavailable");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const matches = await scanLuma(lumaFromRgba(data.data, data.width, data.height), db, onProgress);
  return { matches, canvas };
}

// canvas-free scan core (also exercised by the Node test harness)
export async function scanLuma(
  lu: Luma,
  db: IconHashDb,
  onProgress?: (fraction: number) => void,
  debug?: (msg: string) => void,
): Promise<IconMatch[]> {
  const peaksX = findPeaks(edgeProfile(lu, 0));
  const peaksY = findPeaks(edgeProfile(lu, 1));
  debug?.(`peaksX: ${peaksX.map((p) => p.pos).join(",")}`);
  debug?.(`peaksY: ${peaksY.map((p) => p.pos).join(",")}`);
  const scratch = new Uint32Array(WORDS_PER_HASH);

  // cell corners along one axis, for one pitch candidate: real grid
  // corners form arithmetic chains spaced one pitch apart, UI chrome
  // peaks do not. Chains of >=3 win; extrapolate one corner past each
  // chain end (edge rows/columns cut by the image border lack their own
  // peak but still match -- the descriptor only samples the crop-inset
  // interior of the cell). Falls back to peaks with any partner one pitch
  // or one icon width away when nothing chains (single icon rows).
  const cornersFor = (peaks: Peak[], pitch: number, limit: number) => {
    // chains may overlap (no peak consumption): a junk chain grabbing a
    // shared peak must not break the real lattice's chain
    const chains: Peak[][] = [];
    peaks.forEach((start) => {
      const chain = [start];
      for (;;) {
        const want = chain[chain.length - 1].pos + pitch;
        let next: Peak | null = null;
        peaks.forEach((p) => {
          if (Math.abs(p.pos - want) <= 10
            && (!next || Math.abs(p.pos - want) < Math.abs(next.pos - want))) next = p;
        });
        if (!next) break;
        chain.push(next);
      }
      chains.push(chain);
    });
    const longest = Math.max(...chains.map((c) => c.length));
    let found: Peak[];
    if (longest >= 3) {
      const members = new Map<number, Peak>();
      chains.filter((c) => c.length >= 3).flat().forEach((p) => members.set(p.pos, p));
      found = [...members.values()].sort((a, b) => a.pos - b.pos);
    } else {
      found = peaks.filter((a) => peaks.some((b) => {
        const gap = Math.abs(b.pos - a.pos);
        return gap >= 0.72 * pitch && gap <= 1.12 * pitch;
      }));
    }
    const extra: Peak[] = [];
    if (found.length) {
      [found[0].pos - pitch, found[found.length - 1].pos + pitch].forEach((pos) => {
        if (pos >= -0.1 * pitch && pos + 0.7 * pitch <= limit
          && found.every((f) => Math.abs(f.pos - pos) > 6)) {
          extra.push({ pos: Math.round(pos), height: 0 });
        }
      });
    }
    return { longest, corners: [...found, ...extra] };
  };

  // per-axis corners for a given icon size: union the chain corners of
  // every eligible cluster -- clusters below 0.9 x size are sub-lattices
  // of inner frame edges (icons cannot overlap), and no single cluster is
  // authoritative (gacha results: the true 145px column lattice and a
  // zigzag mixed-edge lattice both chain; only the union holds every real
  // corner). Junk corners just fail to match. The partner fallback only
  // applies when nothing chains at all (single icon rows).
  const unionCorners = (peaks: Peak[], clusters: GapCluster[], s: number, limit: number) => {
    const eligible = clusters.filter((c) => c.center >= 0.9 * s && c.center <= 3 * s);
    const members = new Map<number, Peak>();
    eligible.forEach((c) => {
      const r = cornersFor(peaks, c.center, limit);
      if (r.longest >= 3) r.corners.forEach((p) => members.set(p.pos, p));
    });
    if (!members.size && eligible.length) {
      cornersFor(peaks, eligible[0].center, limit).corners.forEach((p) => members.set(p.pos, p));
    }
    return [...members.values()].sort((a, b) => a.pos - b.pos);
  };

  const clustersX = gapClusters(peaksX, 48, 300, 10);
  const clustersY = gapClusters(peaksY, 48, 300, 10);
  if (!clustersX.length || !clustersY.length) return [];

  const cellsFor = (s: number) => {
    const cols = unionCorners(peaksX, clustersX, s, lu.w);
    const rows = unionCorners(peaksY, clustersY, s, lu.h);
    debug?.(`s=${s} cols ${cols.map((p) => p.pos).join(",")}`);
    debug?.(`s=${s} rows ${rows.map((p) => p.pos).join(",")}`);
    const cells: { cx: number; cy: number; strength: number }[] = [];
    rows.forEach((row) => {
      cols.forEach((col) => {
        // the sampled crop-inset region must stay (nearly) inside the image
        if (col.pos >= -0.12 * s && col.pos + 0.95 * s <= lu.w + 4
          && row.pos >= -0.12 * s && row.pos + 0.75 * s <= lu.h + 4) {
          cells.push({ cx: col.pos, cy: row.pos, strength: col.height + row.height });
        }
      });
    });
    return cells;
  };

  // probe phase, run per size candidate: exhaustive geometry sweep on the
  // strongest-edged cells; actual match quality picks the winning size
  const probe = async (s: number, maxProbes: number, stopGood: number) => {
    const geoms: Geometry[] = [];
    for (let ds = -Math.round(s * 0.15); ds <= Math.round(s * 0.15); ds += 4) {
      for (let dx = -8; dx <= 8; dx += 4) {
        for (let dy = -8; dy <= 8; dy += 4) geoms.push({ dx, dy, ds });
      }
    }
    const cells = cellsFor(s);
    // probe the cells with the strongest icon-frame evidence first: the
    // weakest-border score demotes UI chrome, whose cells almost never
    // show a full rectangle of edges
    const ranked = cells
      .map((c) => ({ ...c, frame: borderScore(lu, c.cx, c.cy, s) }))
      .sort((a, b) => b.frame - a.frame)
      .slice(0, maxProbes);
    const hits: { dist: number; geom: Geometry }[] = [];
    for (let i = 0; i < ranked.length; i += 1) {
      const hit = bestCellMatch2(db, lu, ranked[i].cx, ranked[i].cy, s, geoms, scratch);
      if (hit) hits.push({ dist: hit.dist, geom: hit.geom });
      if (hits.filter((p) => p.dist <= AUTO_ACCEPT_DIST).length >= stopGood) break;
      if (i % 2 === 1) await yieldToUi();
    }
    hits.sort((a, b) => a.dist - b.dist);
    return { s, cells, hits };
  };

  // size candidates: dual-axis width clusters. Actual match quality picks
  // the winner (a decisive <=25 probe hit ends the search early).
  const candidates = sizeCandidates(clustersX, clustersY, 3);
  debug?.(`size candidates: ${candidates.join(",")}`);
  let bestProbe: Awaited<ReturnType<typeof probe>> | null = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const result = await probe(candidates[i], 60, 4);
    debug?.(`size ${result.s}: probe hits `
      + result.hits.slice(0, 6).map((h) => `${h.dist}@(${h.geom.dx},${h.geom.dy},${h.geom.ds})`).join(" "));
    onProgress?.((0.5 * (i + 1)) / candidates.length);
    if (result.hits.length && (!bestProbe || result.hits[0].dist < bestProbe.hits[0].dist)) {
      bestProbe = result;
    }
    if (bestProbe && bestProbe.hits[0].dist <= 25) break;
  }
  if (!bestProbe || !bestProbe.hits.length) return [];
  const { s, cells, hits: probeHits } = bestProbe;
  const good = probeHits.filter((p) => p.dist <= AUTO_ACCEPT_DIST);
  const consensusFrom = good.length ? good : probeHits.slice(0, 1);
  const gds = median(consensusFrom.map((p) => p.geom.ds));

  // final phase: full position sweep per cell (only the size comes from
  // the probe consensus) -- per-cell alignment is immune to lattices that
  // mix outer- and inner-frame edges, whose offsets differ per column
  const fineGeoms: Geometry[] = [];
  for (const js of [-2, 0, 2]) {
    for (let jx = -10; jx <= 10; jx += 4) {
      for (let jy = -10; jy <= 10; jy += 4) {
        fineGeoms.push({ dx: jx, dy: jy, ds: gds + js });
      }
    }
  }
  const raw: IconMatch[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    const { cx, cy } = cells[i];
    const hit = bestCellMatch2(db, lu, cx, cy, s, fineGeoms, scratch);
    if (hit && hit.dist <= SUGGEST_DIST) {
      raw.push({
        unitId: db.ids[hit.index],
        dist: hit.dist,
        rect: {
          x: cx + hit.geom.dx,
          y: cy + hit.geom.dy,
          size: s + hit.geom.ds,
        },
      });
    }
    onProgress?.(0.5 + (0.5 * (i + 1)) / cells.length);
    if (i % 8 === 7) await yieldToUi();
  }

  // non-maximum suppression on matched rectangles: neighbouring lattice
  // cells can align onto the same icon, the best match wins it
  raw.sort((a, b) => a.dist - b.dist);
  const kept: IconMatch[] = [];
  raw.forEach((m) => {
    if (!kept.some((k) => Math.abs(k.rect.x - m.rect.x) < s * 0.5 && Math.abs(k.rect.y - m.rect.y) < s * 0.5)) {
      kept.push(m);
    }
  });

  // grow from the confident matches: their spacing is the real grid pitch,
  // so try every empty neighbour cell. Rows and columns cut by the edge of
  // a cropped screenshot rarely give the peak chains phase 2 needs.
  const near = (x: number, y: number) =>
    kept.some((k) => Math.abs(k.rect.x - x) < s * 0.5 && Math.abs(k.rect.y - y) < s * 0.5);
  const pitchOf = (axis: "x" | "y") => {
    const other = axis === "x" ? "y" : "x";
    const gaps: number[] = [];
    kept.forEach((a) => {
      let best = Infinity;
      kept.forEach((b) => {
        const d = b.rect[axis] - a.rect[axis];
        if (Math.abs(b.rect[other] - a.rect[other]) < s * 0.5 && d > s * 0.8 && d < best) best = d;
      });
      if (best < s * 2) gaps.push(best);
    });
    return gaps.length ? median(gaps) : 0;
  };
  const px = pitchOf("x");
  const py = pitchOf("y") || px;
  const pxx = px || py;
  if (pxx) {
    const growGeoms: Geometry[] = [];
    for (let jx = -6; jx <= 6; jx += 3) {
      for (let jy = -6; jy <= 6; jy += 3) growGeoms.push({ dx: jx, dy: jy, ds: 0 });
    }
    const queue = kept.filter((m) => m.dist <= AUTO_ACCEPT_DIST);
    while (queue.length) {
      const m = queue.shift()!;
      const ms = m.rect.size;
      for (const [ox, oy] of [[pxx, 0], [-pxx, 0], [0, py], [0, -py]]) {
        const x = Math.round(m.rect.x + ox);
        const y = Math.round(m.rect.y + oy);
        if (near(x, y)) continue;
        // the sampled crop-inset region must stay (nearly) inside the image
        if (x < -0.12 * ms || x + 0.95 * ms > lu.w + 4 || y < -0.12 * ms || y + 0.75 * ms > lu.h + 4) continue;
        const hit = bestCellMatch(db, lu, x, y, ms, growGeoms, scratch);
        if (!hit || hit.dist > SUGGEST_DIST) continue;
        const grown: IconMatch = {
          unitId: db.ids[hit.index],
          dist: hit.dist,
          rect: { x: x + hit.geom.dx, y: y + hit.geom.dy, size: ms },
        };
        kept.push(grown);
        if (grown.dist <= AUTO_ACCEPT_DIST) queue.push(grown);
      }
    }
  }
  kept.sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x);
  return kept;
}

export async function scanScreenshotFile(
  file: File,
  db: IconHashDb,
  onProgress?: (fraction: number) => void,
): Promise<ScanResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return await scanImage(bitmap, db, onProgress);
  } finally {
    bitmap.close();
  }
}

export function cropDataUrl(canvas: HTMLCanvasElement, rect: IconMatchRect, out = 64): string {
  const c = document.createElement("canvas");
  c.width = out;
  c.height = out;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(canvas, rect.x, rect.y, rect.size, rect.size, 0, 0, out, out);
  return c.toDataURL();
}
