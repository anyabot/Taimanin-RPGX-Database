// Minimal endian-aware cursor over a byte buffer, shaped after UnityPy's
// EndianBinaryReader so the parsers read like their Python counterparts.

const utf8 = new TextDecoder("utf-8");

export class Reader {
  view: DataView;
  bytes: Uint8Array;
  pos = 0;
  little: boolean;

  constructor(bytes: Uint8Array, little = false) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.little = little;
  }

  get length() { return this.bytes.byteLength; }

  align(n = 4) {
    const r = this.pos % n;
    if (r) this.pos += n - r;
  }

  u8() { return this.bytes[this.pos++]; }
  i8() { const v = this.view.getInt8(this.pos); this.pos += 1; return v; }
  bool() { return this.bytes[this.pos++] !== 0; }
  u16() { const v = this.view.getUint16(this.pos, this.little); this.pos += 2; return v; }
  i16() { const v = this.view.getInt16(this.pos, this.little); this.pos += 2; return v; }
  u32() { const v = this.view.getUint32(this.pos, this.little); this.pos += 4; return v; }
  i32() { const v = this.view.getInt32(this.pos, this.little); this.pos += 4; return v; }
  f32() { const v = this.view.getFloat32(this.pos, this.little); this.pos += 4; return v; }
  f64() { const v = this.view.getFloat64(this.pos, this.little); this.pos += 8; return v; }
  i64big() { const v = this.view.getBigInt64(this.pos, this.little); this.pos += 8; return v; }
  u64big() { const v = this.view.getBigUint64(this.pos, this.little); this.pos += 8; return v; }
  /** 64-bit offsets and sizes; every one this code meets is far below 2^53. */
  i64() { return Number(this.i64big()); }
  u64() { return Number(this.u64big()); }

  take(n: number) {
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  cstring() {
    let end = this.pos;
    while (end < this.bytes.length && this.bytes[end] !== 0) end++;
    const s = utf8.decode(this.bytes.subarray(this.pos, end));
    this.pos = end + 1;
    return s;
  }
}

export const decodeUtf8 = (b: Uint8Array) => utf8.decode(b);
