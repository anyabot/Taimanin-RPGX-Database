// LZ4 raw block decompression (Unity's LZ4 and LZ4HC share this format).

export function lz4Block(src: Uint8Array, outSize: number): Uint8Array {
  const dst = new Uint8Array(outSize);
  let s = 0;
  let d = 0;
  const end = src.length;
  while (s < end) {
    const token = src[s++];
    let lit = token >>> 4;
    if (lit === 15) {
      let b;
      do { b = src[s++]; lit += b; } while (b === 255);
    }
    dst.set(src.subarray(s, s + lit), d);
    s += lit;
    d += lit;
    if (s >= end) break;
    const offset = src[s] | (src[s + 1] << 8);
    s += 2;
    let len = token & 15;
    if (len === 15) {
      let b;
      do { b = src[s++]; len += b; } while (b === 255);
    }
    len += 4;
    let from = d - offset;
    if (offset >= len) {
      dst.copyWithin(d, from, from + len);
      d += len;
    } else {
      // overlapping match: byte-wise copy repeats the window
      for (let i = 0; i < len; i++) dst[d++] = dst[from++];
    }
  }
  if (d !== outSize) throw new Error(`lz4: produced ${d} of ${outSize} bytes`);
  return dst;
}
