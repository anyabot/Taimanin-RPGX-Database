// SerializedFile (the CAB-* inside a bundle) plus a generic type-tree reader.
// Mirrors UnityPy files/SerializedFile.py, files/ObjectReader.py and
// helpers/TypeTreeHelper.py read_value(); only what format 22 (Unity 6) uses.

import { Reader, decodeUtf8 } from "./reader";
import { COMMON_STRINGS } from "./commonStrings";

export interface TypeNode {
  type: string;
  name: string;
  byteSize: number;
  level: number;
  metaFlag: number;
  children: TypeNode[];
}

export interface SerializedType {
  classId: number;
  node?: TypeNode;
}

export interface ObjectInfo {
  /** 64-bit path id as a decimal string (ids are random and exceed 2^53) */
  pathId: string;
  byteStart: number;
  byteSize: number;
  classId: number;
  type: SerializedType;
}

export interface SerializedFile {
  version: number;
  unityVersion: string;
  little: boolean;
  types: SerializedType[];
  objects: ObjectInfo[];
  byId: Map<string, ObjectInfo>;
  externals: string[];
  bytes: Uint8Array;
}

const ALIGN = 0x4000;

export const ClassID = {
  GameObject: 1,
  Transform: 4,
  Texture2D: 28,
  TextAsset: 49,
  AudioClip: 83,
  MonoBehaviour: 114,
  MonoScript: 115,
  AssetBundle: 142,
  Sprite: 213,
  SpriteAtlas: 687078895,
} as const;

function parseBlob(r: Reader, version: number): TypeNode {
  const count = r.i32();
  const strSize = r.i32();
  const nodeSize = version >= 19 ? 32 : 24;
  const nodes = r.take(count * nodeSize);
  const strings = r.take(strSize);
  const str = (v: number) => {
    if (v & 0x80000000) {
      const off = v & 0x7fffffff;
      return COMMON_STRINGS[off] ?? String(off);
    }
    let end = v;
    while (strings[end] !== 0) end++;
    return decodeUtf8(strings.subarray(v, end));
  };
  const nr = new Reader(nodes, r.little);
  const root: TypeNode = { type: "", name: "", byteSize: 0, level: -1, metaFlag: 0, children: [] };
  const stack: TypeNode[] = [root];
  let parent = root;
  let prev = root;
  for (let i = 0; i < count; i++) {
    nr.pos = i * nodeSize;
    nr.u16(); // version
    const level = nr.u8();
    nr.u8(); // type flags
    const typeOff = nr.u32();
    const nameOff = nr.u32();
    const byteSize = nr.i32();
    nr.i32(); // index
    const metaFlag = nr.u32();
    const node: TypeNode = { type: str(typeOff), name: str(nameOff), byteSize, level, metaFlag, children: [] };
    if (level > prev.level) {
      stack.push(parent);
      parent = prev;
    } else if (level < prev.level) {
      while (level <= parent.level) parent = stack.pop()!;
    }
    parent.children.push(node);
    prev = node;
  }
  return root.children[0];
}

function readType(r: Reader, version: number, typeTree: boolean, isRef: boolean): SerializedType {
  const classId = r.i32();
  if (version >= 16) r.bool(); // stripped
  let scriptTypeIndex = -1;
  if (version >= 17) scriptTypeIndex = r.i16();
  if (version >= 13) {
    if ((isRef && scriptTypeIndex >= 0) || (version < 16 && classId < 0) || (version >= 16 && classId === 114)) r.take(16);
    r.take(16);
  }
  let node: TypeNode | undefined;
  if (typeTree) {
    node = parseBlob(r, version);
    if (version >= 21) {
      if (isRef) { r.cstring(); r.cstring(); r.cstring(); }
      else { const n = r.i32(); r.take(n * 4); }
    }
  }
  return { classId, node };
}

export function readSerializedFile(bytes: Uint8Array): SerializedFile {
  const r = new Reader(bytes, false);
  r.u32(); // metadata size
  r.u32(); // file size
  const version = r.u32();
  let dataOffset = r.u32();
  if (version < 9) throw new Error(`serialized format ${version} unsupported`);
  const bigEndian = r.bool();
  r.take(3);
  if (version >= 22) {
    r.u32();
    r.i64();
    dataOffset = r.i64();
    r.i64();
  }
  r.little = !bigEndian;
  const unityVersion = version >= 7 ? r.cstring() : "";
  if (version >= 8) r.i32(); // target platform
  const typeTree = version >= 13 ? r.bool() : true;
  const typeCount = r.i32();
  const types: SerializedType[] = [];
  for (let i = 0; i < typeCount; i++) types.push(readType(r, version, typeTree, false));
  let bigIds = 0;
  if (version >= 7 && version < 14) bigIds = r.i32();
  const objectCount = r.i32();
  const objects: ObjectInfo[] = [];
  for (let i = 0; i < objectCount; i++) {
    let pathId: string;
    if (bigIds) pathId = r.i64big().toString();
    else if (version < 14) pathId = String(r.i32());
    else { r.align(4); pathId = r.i64big().toString(); }
    const byteStart = (version >= 22 ? r.i64() : r.u32()) + dataOffset;
    const byteSize = r.u32();
    const typeId = r.i32();
    let type: SerializedType;
    if (version < 16) {
      const classId = r.u16();
      type = types.find((t) => t.classId === typeId) ?? { classId };
    } else {
      type = types[typeId];
    }
    if (version >= 11 && version < 17) r.i16();
    if (version === 15 || version === 16) r.u8();
    objects.push({ pathId, byteStart, byteSize, classId: type.classId, type });
  }
  if (version >= 11) {
    const n = r.i32();
    for (let i = 0; i < n; i++) {
      r.i32();
      if (version < 14) r.i32(); else { r.align(4); r.i64(); }
    }
  }
  const externals: string[] = [];
  const extCount = r.i32();
  for (let i = 0; i < extCount; i++) {
    if (version >= 6) r.cstring();
    if (version >= 5) { r.take(16); r.i32(); }
    externals.push(r.cstring());
  }
  const byId = new Map(objects.map((o) => [o.pathId, o]));
  return { version, unityVersion, little: r.little, types, objects, byId, externals, bytes };
}

// ---- value reader -----------------------------------------------------------

type Prim = (r: Reader) => unknown;
const PRIM: Record<string, Prim> = {
  SInt8: (r) => r.i8(), UInt8: (r) => r.u8(), char: (r) => r.u8(),
  short: (r) => r.i16(), SInt16: (r) => r.i16(),
  "unsigned short": (r) => r.u16(), UInt16: (r) => r.u16(),
  int: (r) => r.i32(), SInt32: (r) => r.i32(),
  "unsigned int": (r) => r.u32(), UInt32: (r) => r.u32(), "Type*": (r) => r.u32(),
  "long long": (r) => r.i64big().toString(), SInt64: (r) => r.i64big().toString(),
  "unsigned long long": (r) => r.u64(), UInt64: (r) => r.u64(), FileSize: (r) => r.u64(),
  float: (r) => r.f32(), double: (r) => r.f64(), bool: (r) => r.bool(),
};
const PRIM_SIZE: Record<string, number> = {
  SInt8: 1, UInt8: 1, char: 1, bool: 1,
  short: 2, SInt16: 2, "unsigned short": 2, UInt16: 2,
  int: 4, SInt32: 4, "unsigned int": 4, UInt32: 4, "Type*": 4, float: 4,
};

/** Strings decode to JS strings, except fields whose payload is binary
 *  (TextAsset.m_Script holds .skel bytes); those stay Uint8Array. */
const BYTE_STRINGS = new Set(["m_Script"]);

function readValue(node: TypeNode, r: Reader): unknown {
  let align = (node.metaFlag & ALIGN) !== 0;
  let value: unknown;
  const prim = PRIM[node.type];
  if (prim) {
    value = prim(r);
  } else if (node.type === "string") {
    const n = r.i32();
    const b = r.take(n);
    value = BYTE_STRINGS.has(node.name) ? b : decodeUtf8(b);
    r.align(4);
  } else if (node.type === "TypelessData") {
    const n = r.i32();
    value = r.take(n);
  } else if (node.type === "pair") {
    value = [readValue(node.children[0], r), readValue(node.children[1], r)];
  } else if (node.children.length && node.children[0].type === "Array") {
    const arr = node.children[0];
    if (arr.metaFlag & ALIGN) align = true;
    const size = r.i32();
    if (size < 0) throw new Error("negative array length");
    const sub = arr.children[1];
    const bytes = PRIM_SIZE[sub.type];
    if (bytes === 1 && sub.type !== "bool") {
      value = r.take(size);
      if (sub.metaFlag & ALIGN) r.align(4);
    } else if (bytes) {
      const out = new Array(size);
      for (let i = 0; i < size; i++) out[i] = PRIM[sub.type](r);
      if (sub.metaFlag & ALIGN) r.align(4);
      value = out;
    } else {
      const out = new Array(size);
      for (let i = 0; i < size; i++) out[i] = readValue(sub, r);
      value = out;
    }
  } else {
    const obj: Record<string, unknown> = {};
    for (const c of node.children) obj[c.name] = readValue(c, r);
    value = obj;
  }
  if (align) r.align(4);
  return value;
}

/** Read an object through its embedded type tree. */
export function readObject<T = Record<string, any>>(sf: SerializedFile, obj: ObjectInfo): T {
  return readObjectBytes<T>(sf, obj, sf.bytes.subarray(obj.byteStart, obj.byteStart + obj.byteSize));
}

/** Same, from the object's own bytes (a file read in pieces, remote.ts). */
export function readObjectBytes<T = Record<string, any>>(sf: SerializedFile, obj: ObjectInfo, bytes: Uint8Array): T {
  const node = obj.type.node;
  if (!node) throw new Error("bundle has no type tree");
  return readValue(node, new Reader(bytes, sf.little)) as T;
}

/** Cheap m_Name peek: every named asset starts with an aligned string. */
export function peekName(sf: SerializedFile, obj: ObjectInfo): string | null {
  const first = obj.type.node?.children[0];
  if (!first || first.name !== "m_Name" || first.type !== "string") return null;
  const r = new Reader(sf.bytes.subarray(obj.byteStart, obj.byteStart + obj.byteSize), sf.little);
  const n = r.i32();
  return decodeUtf8(r.take(n));
}
