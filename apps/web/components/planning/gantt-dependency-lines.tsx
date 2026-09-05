"use client";

import { useMemo } from "react";
import type { GanttTask } from "./gantt-types";
import { getBarWidth, toX } from "./gantt-utils";

interface GanttDependencyLinesProps {
  tasks: GanttTask[];
  taskMap: Map<string, GanttTask>;
  rangeMin: Date;
  dayWidth: number;
  rowHeight: number;
  rowOffsetMap: Map<string, number>;
  containerWidth: number;
  /** Only links touching one of these task ids are drawn (keeps the chart clean) */
  highlightIds: Set<string>;
  /** Draw every link regardless of `highlightIds` */
  showAll?: boolean;
  /** Open the relation editor for successor `succId`, dependency array slot `index` */
  onEditLink: (succId: string, index: number) => void;
}

const STROKE = "#334155"; // slate-700
const BADGE_FILL = "#1e293b"; // slate-800

/** Clearance kept between a bar edge and the first/last turn of the line. */
const STUB = 12;
/** Fan-out spacing so several arrows off the same bar don't sit on top of each other. */
const LANE = 7;

type LinkType = "FS" | "SS" | "FF" | "SF";

interface Bar {
  left: number;
  right: number;
  cy: number;
  milestone: boolean;
}

/**
 * MS-Project-style orthogonal routing. `exitDir` is +1 when the line leaves the
 * predecessor heading right (FS/FF) and -1 heading left (SS/SF). `entryDir` is
 * +1 when the arrowhead enters the successor from its left (FS/SS) and -1 from
 * its right (FF/SF). The route keeps `STUB` of clearance from every bar edge and
 * turns the corner in the row gutter, so tight / negative lag can't make the
 * line run along or through a bar.
 */
function routePath(
  sx: number,
  sy: number,
  exitDir: 1 | -1,
  tx: number,
  ty: number,
  entryDir: 1 | -1,
  sStub: number,
  dStub: number,
  rowHeight: number,
  containerWidth: number,
  type: LinkType,
  crossesBar: (a: number, b: number) => boolean,
): { d: string; bx: number; by: number } {
  // Keep every turn on-canvas — a bar sitting at the timeline's left edge must
  // not push the route off the left of the SVG.
  const clamp = (x: number) => Math.max(2, Math.min(containerWidth - 2, x));
  const p1 = clamp(sx + exitDir * sStub); // end of the leaving stub
  const p2 = clamp(tx - entryDir * dStub); // start of the arrowhead approach
  const dir = ty >= sy ? 1 : -1;
  const gutterY = sy + dir * (rowHeight / 2 - 2); // just inside the predecessor's row

  // Same-side links: SS brackets on the left of both bars, FF on the right.
  if (type === "SS") {
    const bx = clamp(Math.min(sx, tx) - sStub);
    return { d: `M${sx},${sy} H${bx} V${ty} H${tx}`, bx, by: (sy + ty) / 2 };
  }
  if (type === "FF") {
    const bx = clamp(Math.max(sx, tx) + sStub);
    return { d: `M${sx},${sy} H${bx} V${ty} H${tx}`, bx, by: (sy + ty) / 2 };
  }
  // SF always wraps: out of the predecessor's start, around, into the
  // successor's finish from the right.
  if (type === "SF") {
    return {
      d: `M${sx},${sy} H${p1} V${gutterY} H${p2} V${ty} H${tx}`,
      bx: p1,
      by: (sy + gutterY) / 2,
    };
  }

  // FS: a plain staircase when there's room and the mid-row run is clear;
  // otherwise wrap through the gutter so the line never touches a bar.
  const hasRoom = p2 >= p1 + 1;
  if (hasRoom && !crossesBar(Math.min(p1, tx), Math.max(p1, tx))) {
    return { d: `M${sx},${sy} H${p1} V${ty} H${tx}`, bx: p1, by: (sy + ty) / 2 };
  }
  return {
    d: `M${sx},${sy} H${p1} V${gutterY} H${p2} V${ty} H${tx}`,
    bx: p1,
    by: (sy + gutterY) / 2,
  };
}

export function GanttDependencyLines({
  tasks,
  taskMap,
  rangeMin,
  dayWidth,
  rowHeight,
  rowOffsetMap,
  containerWidth,
  highlightIds,
  showAll = false,
  onEditLink,
}: GanttDependencyLinesProps) {
  const links = useMemo(() => {
    if (!showAll && highlightIds.size === 0) return [];

    // Bar geometry for every drawn task, plus bar x-intervals per row so the
    // FS staircase can dodge a bar that a lag has pushed into its path.
    const bars = new Map<string, Bar>();
    const rowBars = new Map<number, { id: string; left: number; right: number }[]>();
    for (const t of tasks) {
      const s = t.start_date || t.baseline_start_date;
      const top = rowOffsetMap.get(t.id);
      if (!s || top == null) continue;
      const e = t.end_date || t.baseline_finish_date || s;
      const x = toX(s, rangeMin, dayWidth);
      const ms = !!t.is_milestone;
      const left = ms ? x + dayWidth / 2 : x;
      const right = ms ? x + dayWidth / 2 : x + getBarWidth(s, e, dayWidth);
      bars.set(t.id, { left, right, cy: top + rowHeight / 2, milestone: ms });
      const list = rowBars.get(top) ?? [];
      list.push({ id: t.id, left: x, right: ms ? x + dayWidth : x + getBarWidth(s, e, dayWidth) });
      rowBars.set(top, list);
    }

    const outSeen = new Map<string, number>();
    const inSeen = new Map<string, number>();

    const result: {
      id: string;
      succId: string;
      index: number;
      path: string;
      type: LinkType;
      bx: number;
      by: number;
    }[] = [];

    for (const task of tasks) {
      const preds = task.dependency_task_ids ?? [];
      for (let i = 0; i < preds.length; i++) {
        const pred = taskMap.get(preds[i]);
        if (!pred) continue;
        if (!showAll && !highlightIds.has(task.id) && !highlightIds.has(pred.id)) continue;

        const pg = bars.get(pred.id);
        const sg = bars.get(task.id);
        if (!pg || !sg) continue;

        const type = (task.dependency_types?.[i] || "fs").toUpperCase() as LinkType;
        const fromFinish = type === "FS" || type === "FF";
        const toStart = type === "FS" || type === "SS";

        const sx = fromFinish ? pg.right : pg.left;
        const exitDir: 1 | -1 = fromFinish ? 1 : -1;
        const tx = toStart ? sg.left : sg.right;
        const entryDir: 1 | -1 = toStart ? 1 : -1;
        const sy = pg.cy;
        const ty = sg.cy;

        const laneOut = outSeen.get(pred.id) ?? 0;
        const laneIn = inSeen.get(task.id) ?? 0;
        outSeen.set(pred.id, laneOut + 1);
        inSeen.set(task.id, laneIn + 1);

        const succTop = rowOffsetMap.get(task.id) ?? 0;
        const crossesBar = (a: number, b: number) =>
          (rowBars.get(succTop) ?? []).some(
            (r) => r.id !== task.id && r.right > a + 1 && r.left < b - 1,
          );

        const { d, bx, by } = routePath(
          sx,
          sy,
          exitDir,
          tx,
          ty,
          entryDir,
          STUB + laneOut * LANE,
          STUB + laneIn * LANE,
          rowHeight,
          containerWidth,
          type,
          crossesBar,
        );

        result.push({
          id: `${pred.id}->${task.id}:${i}`,
          succId: task.id,
          index: i,
          path: d,
          type,
          bx,
          by,
        });
      }
    }

    return result;
  }, [
    tasks,
    taskMap,
    rangeMin,
    dayWidth,
    rowHeight,
    rowOffsetMap,
    containerWidth,
    highlightIds,
    showAll,
  ]);

  if (links.length === 0) return null;

  return (
    <svg
      className="absolute inset-0 z-[15]"
      style={{ width: containerWidth, overflow: "visible", pointerEvents: "none" }}
    >
      <defs>
        <marker
          id="gantt-dep-arrow"
          viewBox="0 0 8 8"
          refX="7"
          refY="4"
          markerWidth="7"
          markerHeight="7"
          orient="auto"
        >
          <path d="M0,0 L8,4 L0,8 Z" fill={STROKE} />
        </marker>
      </defs>

      {links.map((l) => (
        <g
          key={l.id}
          className="cursor-pointer opacity-90 transition-opacity hover:opacity-100"
          style={{ pointerEvents: "auto" }}
          onClick={() => onEditLink(l.succId, l.index)}
        >
          {/* wide invisible hit area */}
          <path d={l.path} fill="none" stroke="transparent" strokeWidth={12} />
          <path
            d={l.path}
            fill="none"
            stroke={STROKE}
            strokeWidth={1.5}
            strokeLinejoin="round"
            markerEnd="url(#gantt-dep-arrow)"
          />
          <g transform={`translate(${l.bx}, ${l.by})`}>
            <rect x={-10} y={-6.5} width={20} height={13} rx={3} fill={BADGE_FILL} />
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={8}
              fontWeight={700}
              fill="#fff"
            >
              {l.type}
            </text>
          </g>
        </g>
      ))}
    </svg>
  );
}
