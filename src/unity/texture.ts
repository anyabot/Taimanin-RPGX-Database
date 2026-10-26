// Texture2D pixel decoding to top-down RGBA8. Block decoders are line-for-line
// ports of K0lb3/texture2ddecoder (bcn.cpp, etc.cpp; MIT), which UnityPy uses,
// so output is pixel-identical to the Python extraction pipeline.

export const TextureFormat = {
  Alpha8: 1, RGB24: 3, RGBA32: 4, ARGB32: 5, DXT1: 10, DXT5: 12,
  BC7: 25, ETC2_RGB: 45, ETC2_RGBA8: 47,
} as const;

export interface RGBAImage { width: number; height: number; data: Uint8ClampedArray }

const clamp = (n: number) => (n < 0 ? 0 : n > 255 ? 255 : n);

// A block buffer is 16 pixels x RGBA, row-major, like texture2ddecoder's uint32 buffer[16].
type Block = Uint8Array;
function put(b: Block, i: number, r: number, g: number, bl: number, a: number) {
  const o = i * 4;
  b[o] = r; b[o + 1] = g; b[o + 2] = bl; b[o + 3] = a;
}

// ---- BC1 / BC3 ---------------------------------------------------------------

function rgb565(d: number): [number, number, number] {
  return [(d >> 8 & 0xf8) | (d >> 13), (d >> 3 & 0xfc) | (d >> 9 & 3), ((d << 3) | (d >> 2 & 7)) & 0xff];
}

function bc1Block(s: Uint8Array, o: number, out: Block) {
  const q0 = s[o] | s[o + 1] << 8;
  const q1 = s[o + 2] | s[o + 3] << 8;
  const [r0, g0, b0] = rgb565(q0);
  const [r1, g1, b1] = rgb565(q1);
  const c = [[r0, g0, b0], [r1, g1, b1], [0, 0, 0], [0, 0, 0]];
  if (q0 > q1) {
    c[2] = [((r0 * 2 + r1) / 3) | 0, ((g0 * 2 + g1) / 3) | 0, ((b0 * 2 + b1) / 3) | 0];
    c[3] = [((r0 + r1 * 2) / 3) | 0, ((g0 + g1 * 2) / 3) | 0, ((b0 + b1 * 2) / 3) | 0];
  } else {
    c[2] = [(r0 + r1) >> 1, (g0 + g1) >> 1, (b0 + b1) >> 1];
    c[3] = [0, 0, 0];
  }
  let d = (s[o + 4] | s[o + 5] << 8 | s[o + 6] << 16 | s[o + 7] << 24) >>> 0;
  for (let i = 0; i < 16; i++, d >>>= 2) {
    const k = c[d & 3];
    put(out, i, k[0], k[1], k[2], 255);
  }
}

function bc3Alpha(s: Uint8Array, o: number, out: Block) {
  const a = [s[o], s[o + 1], 0, 0, 0, 0, 0, 0];
  if (a[0] > a[1]) {
    for (let i = 1; i <= 6; i++) a[i + 1] = ((a[0] * (7 - i) + a[1] * i) / 7) | 0;
  } else {
    for (let i = 1; i <= 4; i++) a[i + 1] = ((a[0] * (5 - i) + a[1] * i) / 5) | 0;
    a[6] = 0;
    a[7] = 255;
  }
  // 48 index bits in bytes 2..7, little-endian; split to stay within 32-bit ops
  let lo = s[o + 2] | s[o + 3] << 8 | s[o + 4] << 16;
  let hi = s[o + 5] | s[o + 6] << 8 | s[o + 7] << 16;
  for (let i = 0; i < 16; i++) {
    const src = i < 8 ? lo : hi;
    out[i * 4 + 3] = a[(src >> ((i & 7) * 3)) & 7];
  }
}

function bc3Block(s: Uint8Array, o: number, out: Block) {
  bc1Block(s, o + 8, out);
  bc3Alpha(s, o, out);
}

// ---- BC7 ---------------------------------------------------------------------

const P2 = [
  0xcccc, 0x8888, 0xeeee, 0xecc8, 0xc880, 0xfeec, 0xfec8, 0xec80, 0xc800, 0xffec, 0xfe80, 0xe800, 0xffe8, 0xff00, 0xfff0, 0xf000,
  0xf710, 0x008e, 0x7100, 0x08ce, 0x008c, 0x7310, 0x3100, 0x8cce, 0x088c, 0x3110, 0x6666, 0x366c, 0x17e8, 0x0ff0, 0x718e, 0x399c,
  0xaaaa, 0xf0f0, 0x5a5a, 0x33cc, 0x3c3c, 0x55aa, 0x9696, 0xa55a, 0x73ce, 0x13c8, 0x324c, 0x3bdc, 0x6996, 0xc33c, 0x9966, 0x0660,
  0x0272, 0x04e4, 0x4e40, 0x2720, 0xc936, 0x936c, 0x39c6, 0x639c, 0x9336, 0x9cc6, 0x817e, 0xe718, 0xccf0, 0x0fcc, 0x7744, 0xee22,
];
const A2 = [
  15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15,
  15, 2, 8, 2, 2, 8, 8, 15, 2, 8, 2, 2, 8, 8, 2, 2,
  15, 15, 6, 8, 2, 8, 15, 15, 2, 8, 2, 2, 2, 15, 15, 6,
  6, 2, 6, 8, 15, 15, 2, 2, 15, 15, 15, 15, 15, 2, 2, 15,
];
const P3 = [
  0xaa685050, 0x6a5a5040, 0x5a5a4200, 0x5450a0a8, 0xa5a50000, 0xa0a05050, 0x5555a0a0, 0x5a5a5050,
  0xaa550000, 0xaa555500, 0xaaaa5500, 0x90909090, 0x94949494, 0xa4a4a4a4, 0xa9a59450, 0x2a0a4250,
  0xa5945040, 0x0a425054, 0xa5a5a500, 0x55a0a0a0, 0xa8a85454, 0x6a6a4040, 0xa4a45000, 0x1a1a0500,
  0x0050a4a4, 0xaaa59090, 0x14696914, 0x69691400, 0xa08585a0, 0xaa821414, 0x50a4a450, 0x6a5a0200,
  0xa9a58000, 0x5090a0a8, 0xa8a09050, 0x24242424, 0x00aa5500, 0x24924924, 0x24499224, 0x50a50a50,
  0x500aa550, 0xaaaa4444, 0x66660000, 0xa5a0a5a0, 0x50a050a0, 0x69286928, 0x44aaaa44, 0x66666600,
  0xaa444444, 0x54a854a8, 0x95809580, 0x96969600, 0xa85454a8, 0x80959580, 0xaa141414, 0x96960000,
  0xaaaa1414, 0xa05050a0, 0xa0a5a5a0, 0x96000000, 0x40804080, 0xa9a8a9a8, 0xaaaaaa44, 0x2a4a5254,
];
const A3 = [
  [
    3, 3, 15, 15, 8, 3, 15, 15, 8, 8, 6, 6, 6, 5, 3, 3,
    3, 3, 8, 15, 3, 3, 6, 10, 5, 8, 8, 6, 8, 5, 15, 15,
    8, 15, 3, 5, 6, 10, 8, 15, 15, 3, 15, 5, 15, 15, 15, 15,
    3, 15, 5, 5, 5, 8, 5, 10, 5, 10, 8, 13, 15, 12, 3, 3,
  ],
  [
    15, 8, 8, 3, 15, 15, 3, 8, 15, 15, 15, 15, 15, 15, 15, 8,
    15, 8, 15, 3, 15, 8, 15, 8, 3, 15, 6, 10, 15, 15, 10, 8,
    15, 3, 15, 10, 10, 8, 9, 10, 6, 15, 8, 15, 3, 6, 6, 8,
    15, 3, 15, 15, 15, 15, 15, 15, 15, 15, 15, 15, 3, 15, 15, 8,
  ],
];
const FACTORS = [
  [0, 21, 43, 64],
  [0, 9, 18, 27, 37, 46, 55, 64],
  [0, 4, 9, 13, 17, 21, 26, 30, 34, 38, 43, 47, 51, 55, 60, 64],
];
// numSubsets, partitionBits, rotationBits, indexSelectionBits, colorBits,
// alphaBits, endpointPBits, sharedPBits, indexBits[0], indexBits[1]
const BC7_MODES = [
  [3, 4, 0, 0, 4, 0, 1, 0, 3, 0],
  [2, 6, 0, 0, 6, 0, 0, 1, 3, 0],
  [3, 6, 0, 0, 5, 0, 0, 0, 2, 0],
  [2, 6, 0, 0, 7, 0, 1, 0, 2, 0],
  [1, 0, 2, 1, 5, 6, 0, 0, 2, 3],
  [1, 0, 2, 0, 7, 8, 0, 0, 2, 2],
  [1, 0, 0, 0, 7, 7, 1, 0, 4, 0],
  [2, 6, 0, 0, 5, 5, 1, 0, 2, 0],
];

function bits32(s: Uint8Array, o: number, pos: number) {
  // little-endian 32-bit window at byte pos, never reading past the 16-byte block
  let v = 0;
  for (let i = 0; i < 4 && pos + i < 16; i++) v |= s[o + pos + i] << (8 * i);
  return v >>> 0;
}

function bc7Block(s: Uint8Array, o: number, out: Block) {
  let bitPos = 0;
  const read = (n: number) => {
    const v = (bits32(s, o, bitPos >> 3) >>> (bitPos & 7)) & ((1 << n) - 1);
    bitPos += n;
    return v;
  };
  const peek = (off: number, n: number) => {
    const p = bitPos + off;
    return ((bits32(s, o, p >> 3) >>> (p & 7)) & ((1 << n) - 1)) & 0xff;
  };
  let mode = 0;
  while (mode < 8 && read(1) === 0) mode++;
  if (mode === 8) { out.fill(0); return; }
  const [numSubsets, partitionBits, rotationBits, indexSelectionBits, colorBitsM, alphaBitsM, endpointPBits, sharedPBits, ib0, ib1] = BC7_MODES[mode];
  const modePBits = endpointPBits || sharedPBits;
  const partition = read(partitionBits);
  const rotation = read(rotationBits);
  const indexSel = read(indexSelectionBits);
  const ep = [new Array(6), new Array(6), new Array(6), new Array(6)];
  for (let ch = 0; ch < 3; ch++) {
    for (let ii = 0; ii < numSubsets; ii++) {
      ep[ch][ii * 2] = (read(colorBitsM) << modePBits) & 0xff;
      ep[ch][ii * 2 + 1] = (read(colorBitsM) << modePBits) & 0xff;
    }
  }
  if (alphaBitsM) {
    for (let ii = 0; ii < numSubsets; ii++) {
      ep[3][ii * 2] = (read(alphaBitsM) << modePBits) & 0xff;
      ep[3][ii * 2 + 1] = (read(alphaBitsM) << modePBits) & 0xff;
    }
  } else {
    ep[3].fill(0xff);
  }
  if (modePBits) {
    for (let ii = 0; ii < numSubsets; ii++) {
      const pda = read(modePBits);
      const pdb = sharedPBits === 0 ? read(modePBits) : pda;
      for (let ch = 0; ch < 4; ch++) {
        ep[ch][ii * 2] |= pda;
        ep[ch][ii * 2 + 1] |= pdb;
      }
    }
  }
  const expand = (v: number, bits: number) => {
    v = (v << (8 - bits)) & 0xff;
    return (v | (v >> bits)) & 0xff;
  };
  const colorBits = colorBitsM + modePBits;
  for (let ch = 0; ch < 3; ch++) for (let i = 0; i < numSubsets * 2; i++) ep[ch][i] = expand(ep[ch][i], colorBits);
  if (alphaBitsM) {
    const alphaBits = alphaBitsM + modePBits;
    for (let i = 0; i < numSubsets * 2; i++) ep[3][i] = expand(ep[3][i], alphaBits);
  }
  const has1 = ib1 !== 0;
  const factors = [FACTORS[ib0 - 2], has1 ? FACTORS[ib1 - 2] : FACTORS[ib0 - 2]];
  const offset = [0, numSubsets * (16 * ib0 - 1)];
  for (let idx = 0; idx < 16; idx++) {
    let subset = 0;
    let anchorIdx = 0;
    if (numSubsets === 2) {
      subset = (P2[partition] >> idx) & 1;
      anchorIdx = subset ? A2[partition] : 0;
    } else if (numSubsets === 3) {
      subset = (P3[partition] >>> (2 * idx)) & 3;
      anchorIdx = subset ? A3[subset - 1][partition] : 0;
    }
    const anchor = idx === anchorIdx ? 1 : 0;
    const n0 = ib0 - anchor;
    const n1 = has1 ? ib1 - anchor : 0;
    const i0 = peek(offset[0], n0);
    const i1 = has1 ? peek(offset[1], n1) : i0;
    offset[0] += n0;
    offset[1] += n1;
    const index = [i0, i1];
    const fc = factors[indexSel][index[indexSel]];
    const fa = factors[indexSel ? 0 : 1][index[indexSel ? 0 : 1]];
    const si = subset * 2;
    let r = ((ep[0][si] * (64 - fc) + ep[0][si + 1] * fc + 32) & 0xffff) >> 6;
    let g = ((ep[1][si] * (64 - fc) + ep[1][si + 1] * fc + 32) & 0xffff) >> 6;
    let b = ((ep[2][si] * (64 - fc) + ep[2][si + 1] * fc + 32) & 0xffff) >> 6;
    let a = ((ep[3][si] * (64 - fa) + ep[3][si + 1] * fa + 32) & 0xffff) >> 6;
    r &= 0xff; g &= 0xff; b &= 0xff; a &= 0xff;
    if (rotation === 1) [a, r] = [r, a];
    else if (rotation === 2) [a, g] = [g, a];
    else if (rotation === 3) [a, b] = [b, a];
    put(out, idx, r, g, b, a);
  }
}

// ---- ETC2 --------------------------------------------------------------------

const WRITE_ORDER = [0, 4, 8, 12, 1, 5, 9, 13, 2, 6, 10, 14, 3, 7, 11, 15];
const WRITE_ORDER_REV = [15, 11, 7, 3, 14, 10, 6, 2, 13, 9, 5, 1, 12, 8, 4, 0];
const ETC1_MOD = [[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]];
const ETC1_SUBBLOCK = [
  [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
];
const ETC2_DIST = [3, 6, 11, 16, 23, 32, 41, 64];
const ETC2_ALPHA_MOD = [
  [-3, -6, -9, -15, 2, 5, 8, 14], [-3, -7, -10, -13, 2, 6, 9, 12], [-2, -5, -8, -13, 1, 4, 7, 12],
  [-2, -4, -6, -13, 1, 3, 5, 12], [-3, -6, -8, -12, 2, 5, 7, 11], [-3, -7, -9, -11, 2, 6, 8, 10],
  [-4, -7, -8, -11, 3, 6, 7, 10], [-3, -5, -8, -11, 2, 4, 7, 10], [-2, -6, -8, -10, 1, 5, 7, 9],
  [-2, -5, -8, -10, 1, 4, 7, 9], [-2, -4, -8, -10, 1, 3, 7, 9], [-2, -5, -7, -10, 1, 4, 6, 9],
  [-3, -4, -7, -10, 2, 3, 6, 9], [-1, -2, -3, -10, 0, 1, 2, 9], [-4, -6, -8, -9, 3, 5, 7, 8],
  [-3, -5, -7, -9, 2, 4, 6, 8],
];

const u8 = (v: number) => v & 0xff;

function etcSubblocks(d: Uint8Array, o: number, c: number[][], out: Block) {
  const code = [d[o + 3] >> 5, d[o + 3] >> 2 & 7];
  const table = ETC1_SUBBLOCK[d[o + 3] & 1];
  let j = d[o + 6] << 8 | d[o + 7];
  let k = d[o + 4] << 8 | d[o + 5];
  for (let i = 0; i < 16; i++, j >>= 1, k >>= 1) {
    const s = table[i];
    const m = ETC1_MOD[code[s]][j & 1];
    const mm = k & 1 ? -m : m;
    const cc = c[s];
    put(out, WRITE_ORDER[i], clamp(cc[0] + mm), clamp(cc[1] + mm), clamp(cc[2] + mm), 255);
  }
}

function etc2Block(d: Uint8Array, o: number, out: Block) {
  const d0 = d[o], d1 = d[o + 1], d2 = d[o + 2], d3 = d[o + 3];
  if (d3 & 2) {
    const r = d0 & 0xf8, dr = (d0 << 3 & 0x18) - (d0 << 3 & 0x20);
    const g = d1 & 0xf8, dg = (d1 << 3 & 0x18) - (d1 << 3 & 0x20);
    const b = d2 & 0xf8, db = (d2 << 3 & 0x18) - (d2 << 3 & 0x20);
    if (r + dr < 0 || r + dr > 255) {
      // T mode
      const c0 = [u8((d0 << 3 & 0xc0) | (d0 << 4 & 0x30) | (d0 >> 1 & 0xc) | (d0 & 3)), u8((d1 & 0xf0) | d1 >> 4), u8((d1 & 0x0f) | d1 << 4)];
      const c1 = [u8((d2 & 0xf0) | d2 >> 4), u8((d2 & 0x0f) | d2 << 4), u8((d3 & 0xf0) | d3 >> 4)];
      const dist = ETC2_DIST[(d3 >> 1 & 6) | (d3 & 1)];
      const set = [c0, c1.map((v) => clamp(v + dist)), c1, c1.map((v) => clamp(v - dist))];
      paintSet(d, o, set, out);
    } else if (g + dg < 0 || g + dg > 255) {
      // H mode
      const c0 = [u8((d0 << 1 & 0xf0) | (d0 >> 3 & 0xf)), 0, 0];
      c0[1] = u8((d0 << 5 & 0xe0) | (d1 & 0x10)); c0[1] = u8(c0[1] | c0[1] >> 4);
      c0[2] = u8((d1 & 8) | (d1 << 1 & 6) | d2 >> 7); c0[2] = u8(c0[2] | c0[2] << 4);
      const c1 = [u8((d2 << 1 & 0xf0) | (d2 >> 3 & 0xf)), 0, u8((d3 << 1 & 0xf0) | (d3 >> 3 & 0xf))];
      c1[1] = u8((d2 << 5 & 0xe0) | (d3 >> 3 & 0x10)); c1[1] = u8(c1[1] | c1[1] >> 4);
      let di = (d3 & 4) | (d3 << 1 & 2);
      if (c0[0] > c1[0] || (c0[0] === c1[0] && (c0[1] > c1[1] || (c0[1] === c1[1] && c0[2] >= c1[2])))) di++;
      const dist = ETC2_DIST[di];
      const set = [c0.map((v) => clamp(v + dist)), c0.map((v) => clamp(v - dist)), c1.map((v) => clamp(v + dist)), c1.map((v) => clamp(v - dist))];
      paintSet(d, o, set, out);
    } else if (b + db < 0 || b + db > 255) {
      // planar mode
      const d4 = d[o + 4], d5 = d[o + 5], d6 = d[o + 6], d7 = d[o + 7];
      const c0 = [u8((d0 << 1 & 0xfc) | (d0 >> 5 & 3)), u8((d0 << 7 & 0x80) | (d1 & 0x7e) | (d0 & 1)), 0];
      c0[2] = u8((d1 << 7 & 0x80) | (d2 << 2 & 0x60) | (d2 << 3 & 0x18) | (d3 >> 5 & 4)); c0[2] = u8(c0[2] | c0[2] >> 6);
      const c1 = [u8((d3 << 1 & 0xf8) | (d3 << 2 & 4) | (d3 >> 5 & 3)), u8((d4 & 0xfe) | d4 >> 7), 0];
      c1[2] = u8((d4 << 7 & 0x80) | (d5 >> 1 & 0x7c)); c1[2] = u8(c1[2] | c1[2] >> 6);
      const c2 = [u8((d5 << 5 & 0xe0) | (d6 >> 3 & 0x1c) | (d5 >> 1 & 3)), u8((d6 << 3 & 0xf8) | (d7 >> 5 & 0x6) | (d6 >> 4 & 1)), u8(d7 << 2 | (d7 >> 4 & 3))];
      for (let y = 0, i = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++, i++) {
          const ch = (n: number) => clamp((x * (c1[n] - c0[n]) + y * (c2[n] - c0[n]) + 4 * c0[n] + 2) >> 2);
          put(out, i, ch(0), ch(1), ch(2), 255);
        }
      }
    } else {
      // differential mode
      const c0 = [u8(r | r >> 5), u8(g | g >> 5), u8(b | b >> 5)];
      const c1 = [r + dr, g + dg, b + db].map((v) => u8(v | v >> 5));
      etcSubblocks(d, o, [c0, c1], out);
    }
  } else {
    // individual mode
    const c0 = [u8((d0 & 0xf0) | d0 >> 4), u8((d1 & 0xf0) | d1 >> 4), u8((d2 & 0xf0) | d2 >> 4)];
    const c1 = [u8((d0 & 0x0f) | d0 << 4), u8((d1 & 0x0f) | d1 << 4), u8((d2 & 0x0f) | d2 << 4)];
    etcSubblocks(d, o, [c0, c1], out);
  }
}

function paintSet(d: Uint8Array, o: number, set: number[][], out: Block) {
  let j = d[o + 6] << 8 | d[o + 7];
  let k = (d[o + 4] << 8 | d[o + 5]) << 1;
  for (let i = 0; i < 16; i++, j >>= 1, k >>= 1) {
    const c = set[(k & 2) | (j & 1)];
    put(out, WRITE_ORDER[i], c[0], c[1], c[2], 255);
  }
}

function etc2AlphaBlock(d: Uint8Array, o: number, out: Block) {
  const base = d[o];
  if (d[o + 1] & 0xf0) {
    const mult = d[o + 1] >> 4;
    const table = ETC2_ALPHA_MOD[d[o + 1] & 0xf];
    // big-endian 64-bit; the 16 3-bit indices sit in its low 48 bits (bytes 2..7)
    const lo = d[o + 5] << 16 | d[o + 6] << 8 | d[o + 7];
    const hi = d[o + 2] << 16 | d[o + 3] << 8 | d[o + 4];
    for (let i = 0; i < 16; i++) {
      const src = i < 8 ? lo : hi;
      out[WRITE_ORDER_REV[i] * 4 + 3] = clamp(base + mult * table[(src >> ((i & 7) * 3)) & 7]);
    }
  } else {
    for (let i = 0; i < 16; i++) out[i * 4 + 3] = base;
  }
}

// ---- driver ------------------------------------------------------------------

type BlockFn = (s: Uint8Array, o: number, out: Block) => void;
const BLOCK: Record<number, [BlockFn, number]> = {
  [TextureFormat.DXT1]: [bc1Block, 8],
  [TextureFormat.DXT5]: [bc3Block, 16],
  [TextureFormat.BC7]: [bc7Block, 16],
  [TextureFormat.ETC2_RGB]: [etc2Block, 8],
  [TextureFormat.ETC2_RGBA8]: [(s, o, out) => { etc2Block(s, o + 8, out); etc2AlphaBlock(s, o, out); }, 16],
};

export function canDecode(format: number) {
  return format in BLOCK || format === 1 || format === 3 || format === 4 || format === 5;
}

/** Decode raw texture bytes into a top-down RGBA image (Unity stores rows
 *  bottom-up; UnityPy flips, so do we). */
export function decodeTexture(data: Uint8Array, width: number, height: number, format: number): RGBAImage {
  const out = new Uint8ClampedArray(width * height * 4);
  // `row(y)` = destination row for source row y (vertical flip)
  const row = (y: number) => (height - 1 - y) * width * 4;
  const block = BLOCK[format];
  if (block) {
    const [fn, size] = block;
    const bx = (width + 3) >> 2;
    const by = (height + 3) >> 2;
    const buf = new Uint8Array(64);
    let p = 0;
    for (let y = 0; y < by; y++) {
      for (let x = 0; x < bx; x++, p += size) {
        fn(data, p, buf);
        const w = Math.min(4, width - x * 4);
        for (let yy = 0; yy < 4 && y * 4 + yy < height; yy++) {
          out.set(buf.subarray(yy * 16, yy * 16 + w * 4), row(y * 4 + yy) + x * 16);
        }
      }
    }
    return { width, height, data: out };
  }
  for (let y = 0; y < height; y++) {
    const dst = row(y);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = dst + x * 4;
      switch (format) {
        case TextureFormat.RGBA32:
          out[o] = data[i * 4]; out[o + 1] = data[i * 4 + 1]; out[o + 2] = data[i * 4 + 2]; out[o + 3] = data[i * 4 + 3];
          break;
        case TextureFormat.ARGB32:
          out[o] = data[i * 4 + 1]; out[o + 1] = data[i * 4 + 2]; out[o + 2] = data[i * 4 + 3]; out[o + 3] = data[i * 4];
          break;
        case TextureFormat.RGB24:
          out[o] = data[i * 3]; out[o + 1] = data[i * 3 + 1]; out[o + 2] = data[i * 3 + 2]; out[o + 3] = 255;
          break;
        case TextureFormat.Alpha8:
          out[o + 3] = data[i];
          break;
        default:
          throw new Error(`texture format ${format} not supported`);
      }
    }
  }
  return { width, height, data: out };
}
