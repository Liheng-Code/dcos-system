"use client";

import { useMemo } from "react";
import type { VisibleRow } from "./sheet-utils";
import { toX, getBarWidth } from "./gantt-utils";

export type ProgressLinePointShape = "diamond" | "circle" | "square";
export type ProgressLineDateSource = "data_date" | "today" | "custom";

export interface ProgressLineStyle {
  dateSource: ProgressLineDateSource;
  customDate: string | null;
  color: string;
  pointShape: ProgressLinePointShape;
  pointColor: string;
  showDate: boolean;
}

export const DEFAULT_PROGRESS_LINE_STYLE: ProgressLineStyle = {
  dateSource: "data_date",
  customDate: null,
  color: "#dc2626",
  pointShape: "diamond",
  pointColor: "#dc2626",
  showDate: false,
};

/** Resolves the style's chosen date source into a concrete ISO date to draw the line at. */
export function resolveProgressLineDate(
  style: ProgressLineStyle,
  dataDate: string | null,
): string {
  if (style.dateSource === "custom" && style.customDate) return style.customDate;
  if (style.dateSource === "today") return new Date().toISOString().slice(0, 10);
  return dataDate ?? new Date().toISOString().slice(0, 10);
}

interface GanttProgressLineProps {
  visibleRows: VisibleRow[];
  lineDate: string;
  rangeMin: Date;
  dayWidth: number;
  rowHeight: number;
  containerWidth: number;
  containerHeight: number;
  style: ProgressLineStyle;
  onEdit: () => void;
}

/**
 * MS-Project-style progress line: one point per visible row, sitting on the
 * line's own date for a task that hasn't started yet or is already 100%
 * complete, and jogging left/right of the line to the point on its bar that
 * matches its actual % complete otherwise — the zigzag reads at a glance as
 * "which tasks are behind (peak left) / ahead (peak right) of schedule".
 */
function progressPointX(
  start: string | null,
  end: string | null,
  progress: number,
  lineDate: string,
  rangeMin: Date,
  dayWidth: number,
  lineX: number,
): number {
  if (!start || start > lineDate || progress >= 100) return lineX;
  const width = getBarWidth(start, end ?? start, dayWidth);
  const left = toX(start, rangeMin, dayWidth);
  return left + width * (Math.max(0, progress) / 100);
}

export function GanttProgressLine({
  visibleRows,
  lineDate,
  rangeMin,
  dayWidth,
  rowHeight,
  containerWidth,
  containerHeight,
  style,
  onEdit,
}: GanttProgressLineProps) {
  const { points, lineX } = useMemo(() => {
    const lineX = toX(lineDate, rangeMin, dayWidth);
    const pts = visibleRows.map((v, i) => {
      const cy = i * rowHeight + rowHeight / 2;
      const [start, end, progress] =
        v.row.kind === "task"
          ? [v.row.task.start_date, v.row.task.end_date, v.row.task.progress ?? 0]
          : [v.row.rollup.start, v.row.rollup.end, v.row.rollup.progress ?? 0];
      return { x: progressPointX(start, end, progress, lineDate, rangeMin, dayWidth, lineX), y: cy };
    });
    return { points: pts, lineX };
  }, [visibleRows, lineDate, rangeMin, dayWidth, rowHeight]);

  if (points.length === 0 || lineX < 0 || lineX > containerWidth) return null;

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");

  return (
    <svg
      className="absolute inset-0 z-[16]"
      style={{ width: containerWidth, height: containerHeight, overflow: "visible" }}
    >
      <g
        className="cursor-pointer"
        style={{ pointerEvents: "auto" }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        <path d={d} fill="none" stroke="transparent" strokeWidth={14} />
        <path d={d} fill="none" stroke={style.color} strokeWidth={1.75} />
        {points.map((p, i) => (
          <ProgressMarker key={i} x={p.x} y={p.y} shape={style.pointShape} color={style.pointColor} />
        ))}
      </g>
      {style.showDate && (
        <text x={lineX + 4} y={12} fontSize={10} fontWeight={600} fill={style.color}>
          {lineDate}
        </text>
      )}
    </svg>
  );
}

function ProgressMarker({
  x,
  y,
  shape,
  color,
}: {
  x: number;
  y: number;
  shape: ProgressLinePointShape;
  color: string;
}) {
  if (shape === "circle") {
    return <circle cx={x} cy={y} r={4} fill={color} stroke="#fff" strokeWidth={1} />;
  }
  if (shape === "square") {
    return <rect x={x - 4} y={y - 4} width={8} height={8} fill={color} stroke="#fff" strokeWidth={1} />;
  }
  return (
    <rect
      x={x - 4}
      y={y - 4}
      width={8}
      height={8}
      fill={color}
      stroke="#fff"
      strokeWidth={1}
      transform={`rotate(45 ${x} ${y})`}
    />
  );
}
