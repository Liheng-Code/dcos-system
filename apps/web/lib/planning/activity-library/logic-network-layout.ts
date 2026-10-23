// Pure layout for the predecessor / successor network diagram: three columns
// (predecessors | activity | successors), plain SVG coordinates, no graph library.

import type { Relation } from "./types";

export interface NetworkNeighbour {
  id: string;
  label: string;
  relation: Relation;
  lagDays: number;
}

export interface NetworkInput {
  center: { id: string; label: string };
  predecessors: NetworkNeighbour[];
  successors: NetworkNeighbour[];
}

export type NodeRole = "predecessor" | "center" | "successor";

export interface NetworkNode { id: string; label: string; x: number; y: number; w: number; h: number; role: NodeRole }
export interface NetworkEdge {
  from: string; to: string; relation: Relation; lag: number; label: string; path: string; labelX: number; labelY: number;
}
export interface NetworkLayout { nodes: NetworkNode[]; edges: NetworkEdge[]; width: number; height: number }

export const RELATION_COLORS: Record<Relation, string> = {
  fs: "#2563eb", // blue
  ss: "#16a34a", // green
  ff: "#d97706", // amber
  sf: "#ea580c", // red-orange
};

export const RELATION_LABELS: Record<Relation, string> = {
  fs: "Finish to Start", ss: "Start to Start", ff: "Finish to Finish", sf: "Start to Finish",
};

const NODE_W = 190;
const NODE_H = 52;
const GAP_X = 90;
const GAP_Y = 24;
const PAD = 16;

export function edgeLabel(relation: Relation, lag: number): string {
  return `${relation.toUpperCase()}(${lag})`;
}

export function layoutLogicNetwork(input: NetworkInput): NetworkLayout {
  const rows = Math.max(input.predecessors.length, input.successors.length, 1);
  const colHeight = (n: number) => (n > 0 ? n * NODE_H + (n - 1) * GAP_Y : 0);
  const innerH = colHeight(rows);
  const height = innerH + PAD * 2;
  const width = NODE_W * 3 + GAP_X * 2 + PAD * 2;
  const colX = [PAD, PAD + NODE_W + GAP_X, PAD + (NODE_W + GAP_X) * 2];

  const place = (list: NetworkNeighbour[], x: number, role: NodeRole): NetworkNode[] => {
    const top = PAD + (innerH - colHeight(list.length)) / 2;
    return list.map((n, i) => ({ id: n.id, label: n.label, x, y: top + i * (NODE_H + GAP_Y), w: NODE_W, h: NODE_H, role }));
  };

  const center: NetworkNode = {
    id: input.center.id, label: input.center.label, x: colX[1], y: PAD + (innerH - NODE_H) / 2, w: NODE_W, h: NODE_H, role: "center",
  };
  const preds = place(input.predecessors, colX[0], "predecessor");
  const succs = place(input.successors, colX[2], "successor");

  const edge = (a: NetworkNode, b: NetworkNode, n: NetworkNeighbour): NetworkEdge => {
    const x1 = a.x + a.w, y1 = a.y + a.h / 2, x2 = b.x, y2 = b.y + b.h / 2;
    const mx = (x1 + x2) / 2;
    return {
      from: a.id, to: b.id, relation: n.relation, lag: n.lagDays, label: edgeLabel(n.relation, n.lagDays),
      path: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`, labelX: mx, labelY: (y1 + y2) / 2 - 4,
    };
  };

  const edges = [
    ...preds.map((p, i) => edge(p, center, input.predecessors[i])),
    ...succs.map((s, i) => edge(center, s, input.successors[i])),
  ];
  return { nodes: [...preds, center, ...succs], edges, width, height };
}
