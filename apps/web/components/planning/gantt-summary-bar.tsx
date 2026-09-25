"use client";

import { memo } from "react";

// Compact bar representing an aggregated WBS summary row.
// Shared by the standalone chart (gantt-view.tsx) and the split schedule view
// (schedule-timeline.tsx).

interface GanttSummaryBarProps {
  label: string;
  progress: number;
  taskCount: number;
  left: number;
  width: number;
  dayWidth: number;
  height?: number;
  /** WBS outline depth (0 = project root, 1 = phase, 2 = sub-phase, …) — drives the P6-style per-level bar color. */
  depth: number;
}

// P6-style per-level bar colors: darkest at the project root, a distinct hue
// per level down to sub-packages, then a neutral fallback for anything deeper.
const LEVEL_BAR_COLORS = [
  "bg-slate-900", // level 0 — project
  "bg-[#1e3a5f]", // level 1 — phase (DCOS navy)
  "bg-teal-700", // level 2 — sub-phase
  "bg-amber-700", // level 3 — package
  "bg-violet-700", // level 4 — sub-package
  "bg-slate-600", // level 5+ — fallback
];

function levelBarColor(depth: number): string {
  return LEVEL_BAR_COLORS[Math.min(Math.max(depth, 0), LEVEL_BAR_COLORS.length - 1)];
}

// Every prop here is a primitive, so React.memo's default shallow comparison
// already skips a row untouched by whatever caused the parent to re-render —
// no custom comparator needed (unlike GanttBar/GanttMilestone, which also
// take callback props that ScheduleTimeline recreates on every render).
export const GanttSummaryBar = memo(function GanttSummaryBar({
  label,
  progress,
  taskCount,
  left,
  width,
  dayWidth,
  height = 20,
  depth,
}: GanttSummaryBarProps) {
  const minWidth = Math.max(dayWidth, width);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-default"
      style={{ left, width: minWidth, height }}
    >
      <div className={`relative h-full w-full overflow-hidden rounded-md shadow-sm ${levelBarColor(depth)}`}>
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-black/25 transition-all"
          style={{ width: `${progress}%`, minWidth: progress > 0 ? 4 : 0 }}
        />
        <span className="absolute inset-0 flex items-center truncate px-2 text-[10px] font-semibold leading-none text-white/90">
          {label} · {progress}% · {taskCount} task{taskCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
});
