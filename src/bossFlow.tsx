import { useMemo } from "react";
import ReactFlow, {
  Background, Controls, Handle, MarkerType, Position,
  type Edge, type Node, type NodeProps,
} from "reactflow";
import "reactflow/dist/style.css";
import { tokens } from "@altterisk/game-hub";
import type { BossRule } from "./data";

/* A raid boss's behaviour as a flowchart, in the style of lomapr's enemy AI
   graph: phase checks, then each phase's rules as yes/no questions ending in
   the game's default choice. Laid out on a grid: one column per phase, the
   "no" chain straight down, each "yes" action beside its question. */

type Kind = "start" | "cond" | "action" | "phase";
interface FlowNode { id: string; kind: Kind; text: string; col: number; row: number; right?: boolean }
interface FlowEdge { from: string; to: string; label: "" | "yes" | "no"; side?: boolean }

const W = 210;          // node width
const GAP = 36;         // between a question and its action
const COL = 2 * W + GAP + 60;
const ROW = 74;
const YES = "#7bc47f";
const NO = "#e0707a";
const PLAIN = "#6b7280";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const PHASE_CHANGE = /^enters phase (\d+)$/;
// rules that change numbers rather than pick a skill
const passive = (r: BossRule) => r.skill === null && !PHASE_CHANGE.test(r.do);

export function buildFlow(rules: BossRule[], skillName: (i: number) => string) {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const node = (kind: Kind, text: string, col: number, row: number, right = false) => {
    const id = `n${nodes.length}`;
    nodes.push({ id, kind, text, col, row, right });
    return id;
  };
  const edge = (from: string, to: string, label: FlowEdge["label"] = "", side = false) => edges.push({ from, to, label, side });

  const changes = rules.filter((r) => PHASE_CHANGE.test(r.do));
  const target = (r: BossRule) => Number(PHASE_CHANGE.exec(r.do)![1]);
  const startPhase = Math.max(1, ...changes.filter((r) => r.when === "from the start").map(target));
  const phases = [...new Set([startPhase, ...changes.map(target), ...rules.map((r) => r.phase ?? startPhase)])]
    .filter((p) => p >= startPhase).sort((a, b) => a - b);
  const multi = phases.length > 1;
  // phases only go up, so the highest one is checked first
  const ups = changes.filter((r) => r.when !== "from the start").sort((a, b) => target(b) - target(a));

  let row = 0;
  let at = node("start", "Its turn", 0, row++);
  const entry = new Map<number, { from: string; label: FlowEdge["label"] }>();
  let label: FlowEdge["label"] = "";
  for (const r of ups) {
    const c = node("cond", `${cap(r.when)}${r.phase !== null ? ` in phase ${r.phase}` : ""} (reached)?`, 0, row++);
    edge(at, c, label);
    entry.set(target(r), { from: c, label: "yes" });
    at = c;
    label = "no";
  }
  if (!entry.has(startPhase)) entry.set(startPhase, { from: at, label });

  const top = row;
  phases.forEach((phase, col) => {
    let r0 = top;
    const own = rules.filter((r) => (r.phase ?? phase) === phase && !PHASE_CHANGE.test(r.do));
    const notes = own.filter(passive).map((r) => cap(`${r.when === "throughout" ? "" : `${r.when}: `}${r.do}`));
    const into = entry.get(phase);
    let from = into?.from;
    let lab = into?.label ?? "";
    if (multi || notes.length) {
      const h = node("phase", [multi ? `Phase ${phase}` : "", ...notes].filter(Boolean).join("\n"), col, r0++);
      if (from) edge(from, h, lab);
      from = h;
      lab = "";
    }
    for (const r of own.filter((x) => !passive(x))) {
      const c = node("cond", `${cap(r.when)}?`, col, r0);
      if (from) edge(from, c, lab);
      const a = node("action", `${cap(r.do)}${r.skill !== null ? ` ${skillName(r.skill)}` : ""}`, col, r0++, true);
      edge(c, a, "yes", true);
      from = c;
      lab = "no";
    }
    const d = node("action", "Last skill it has SP for", col, r0);
    if (from) edge(from, d, lab);
  });
  return { nodes, edges };
}

const STYLE: Record<Kind, { bg: string; border: string; radius: number }> = {
  start: { bg: "#3b3157", border: "#a48ad6", radius: 20 },
  phase: { bg: "#4a3a1e", border: "#e0a84a", radius: 6 },
  cond: { bg: tokens.color.border, border: "#5e81ac", radius: 14 },
  action: { bg: "#1f5c54", border: "#3fb6a5", radius: 6 },
};

/** A box with handles on top/left (in) and bottom/right (out). */
function Box({ data }: NodeProps<{ kind: Kind; text: string }>) {
  const s = STYLE[data.kind];
  const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };
  return (
    <div style={{
      width: W, minHeight: 40, fontSize: 12, lineHeight: 1.3, padding: "6px 8px", borderRadius: s.radius,
      background: s.bg, color: tokens.color.text, border: `1px solid ${s.border}`, textAlign: "center",
      display: "grid", alignContent: "center", boxSizing: "border-box",
    }}>
      <Handle type="target" position={Position.Top} id="t" style={hidden} />
      <Handle type="target" position={Position.Left} id="l" style={hidden} />
      {data.text.split("\n").map((ln, i) => (
        <div key={i} style={i === 0 && data.kind === "phase" ? { fontWeight: 700 } : undefined}>{ln}</div>
      ))}
      <Handle type="source" position={Position.Bottom} id="b" style={hidden} />
      <Handle type="source" position={Position.Right} id="r" style={hidden} />
    </div>
  );
}

const nodeTypes = { box: Box };

function layout(flow: { nodes: FlowNode[]; edges: FlowEdge[] }) {
  const nodes: Node[] = flow.nodes.map((n) => ({
    id: n.id,
    type: "box",
    position: { x: n.col * COL + (n.right ? W + GAP : 0), y: n.row * ROW },
    data: { kind: n.kind, text: n.text },
  }));
  const edges: Edge[] = flow.edges.map((e, i) => {
    const color = e.label === "yes" ? YES : e.label === "no" ? NO : PLAIN;
    return {
      id: `e${i}`, source: e.from, target: e.to, type: "smoothstep",
      sourceHandle: e.side ? "r" : "b", targetHandle: e.side ? "l" : "t",
      label: e.label || undefined, labelStyle: { fill: color, fontWeight: 700, fontSize: 10 },
      labelBgStyle: { fill: tokens.color.bg }, labelBgPadding: [3, 1] as [number, number],
      style: { stroke: color, strokeWidth: 1.6 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 14, height: 14 },
    };
  });
  const rows = Math.max(...flow.nodes.map((n) => n.row)) + 1;
  return { nodes, edges, height: rows * ROW };
}

export default function BossFlow({ rules, skillName }: { rules: BossRule[]; skillName: (i: number) => string }) {
  const { nodes, edges, height } = useMemo(() => layout(buildFlow(rules, skillName)), [rules, skillName]);
  return (
    <div className="boss-flow" style={{ height: Math.min(Math.max(height + 40, 300), 820), background: tokens.color.bg }}>
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.08, maxZoom: 1 }}
        minZoom={0.15} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        proOptions={{ hideAttribution: true }}>
        <Background color={tokens.color.border} gap={18} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
