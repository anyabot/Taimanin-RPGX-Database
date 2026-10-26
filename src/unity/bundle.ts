// UnityFS asset-bundle container. Mirrors UnityPy files/BundleFile.py read_fs().

import { Reader } from "./reader";
import { lz4Block } from "./lz4";

export interface BlockInfo {
  uncompressedSize: number;
  compressedSize: number;
  flags: number;
  /** byte offset of the compressed block inside the bundle file */
  fileOffset: number;
  /** byte offset of the block inside the uncompressed data stream */
  dataOffset: number;
}

export interface BundleNode {
  offset: number;
  size: number;
  flags: number;
  path: string;
}

export interface BundleHeader {
  version: number;
  unityVersion: string;
  blocks: BlockInfo[];
  nodes: BundleNode[];
  /** bytes of the file needed to parse this header */
  headerEnd: number;
}

const BLOCKS_INFO_AT_END = 0x80;
const BLOCK_INFO_NEED_PADDING_AT_START = 0x200;

function decompress(data: Uint8Array, size: number, flags: number): Uint8Array {
  switch (flags & 0x3f) {
    case 0: return data;
    case 2: case 3: return lz4Block(data, size);
    case 1: throw new Error("LZMA bundles are not supported");
    default: throw new Error(`unknown compression ${flags & 0x3f}`);
  }
}

/** Parse the header + block/directory table. `head` must cover the start of
 *  the file through the block info (a few KB is always enough here). */
export function readBundleHeader(head: Uint8Array, fileSize = head.length): BundleHeader {
  const r = new Reader(head);
  const signature = r.cstring();
  if (signature !== "UnityFS") throw new Error(`not a UnityFS bundle (${signature})`);
  const version = r.u32();
  r.cstring(); // player version, "5.x.x"
  const unityVersion = r.cstring();
  r.i64(); // total size
  const compressedSize = r.u32();
  const uncompressedSize = r.u32();
  const flags = r.u32();
  // Unity 6 flags: 0x200 is block padding, not UnityCN encryption (old builds).
  if (version >= 7) r.align(16);
  let infoBytes: Uint8Array;
  if (flags & BLOCKS_INFO_AT_END) {
    if (head.length < fileSize) throw new Error("block info at end: need whole file");
    infoBytes = head.subarray(fileSize - compressedSize, fileSize);
  } else {
    infoBytes = r.take(compressedSize);
  }
  const info = new Reader(decompress(infoBytes, uncompressedSize, flags));
  info.take(16); // uncompressed data hash
  const blockCount = info.i32();
  const blocks: BlockInfo[] = [];
  for (let i = 0; i < blockCount; i++) {
    blocks.push({ uncompressedSize: info.u32(), compressedSize: info.u32(), flags: info.u16(), fileOffset: 0, dataOffset: 0 });
  }
  const nodeCount = info.i32();
  const nodes: BundleNode[] = [];
  for (let i = 0; i < nodeCount; i++) {
    nodes.push({ offset: info.i64(), size: info.i64(), flags: info.u32(), path: info.cstring() });
  }
  if (flags & BLOCK_INFO_NEED_PADDING_AT_START) r.align(16);
  let fileOff = r.pos;
  let dataOff = 0;
  for (const b of blocks) {
    b.fileOffset = fileOff;
    b.dataOffset = dataOff;
    fileOff += b.compressedSize;
    dataOff += b.uncompressedSize;
  }
  return { version, unityVersion, blocks, nodes, headerEnd: r.pos };
}

/** Decompress the data stream byte range [start, end) from whichever blocks
 *  cover it. `file` is the full bundle, or any buffer whose byte i equals file
 *  byte `fileBase + i` and covers the needed blocks (for Range reads). */
export function readDataRange(h: BundleHeader, file: Uint8Array, start: number, end: number, fileBase = 0): Uint8Array {
  const out = new Uint8Array(end - start);
  for (const b of h.blocks) {
    const bEnd = b.dataOffset + b.uncompressedSize;
    if (bEnd <= start || b.dataOffset >= end) continue;
    const raw = file.subarray(b.fileOffset - fileBase, b.fileOffset - fileBase + b.compressedSize);
    const data = decompress(raw, b.uncompressedSize, b.flags);
    const from = Math.max(start, b.dataOffset);
    const to = Math.min(end, bEnd);
    out.set(data.subarray(from - b.dataOffset, to - b.dataOffset), from - start);
  }
  return out;
}

/** Compressed-file byte range holding data stream range [start, end). */
export function fileRangeFor(h: BundleHeader, start: number, end: number): [number, number] {
  let lo = Infinity, hi = 0;
  for (const b of h.blocks) {
    if (b.dataOffset + b.uncompressedSize <= start || b.dataOffset >= end) continue;
    lo = Math.min(lo, b.fileOffset);
    hi = Math.max(hi, b.fileOffset + b.compressedSize);
  }
  return [lo, hi];
}

export interface Bundle {
  header: BundleHeader;
  /** node path -> its bytes */
  files: Map<string, Uint8Array>;
}

export function readBundle(file: Uint8Array): Bundle {
  const header = readBundleHeader(file, file.length);
  const total = header.blocks.reduce((n, b) => n + b.uncompressedSize, 0);
  const data = readDataRange(header, file, 0, total);
  const files = new Map<string, Uint8Array>();
  for (const n of header.nodes) files.set(n.path, data.subarray(n.offset, n.offset + n.size));
  return { header, files };
}
