"use client";

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
}

export function GanttSummaryBar({
  label,
  progress,
  taskCount,
  left,
  width,
  dayWidth,
  height = 20,
}: GanttSummaryBarProps) {
  const minWidth = Math.max(dayWidth, width);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-default"
      style={{ left, width: minWidth, height }}
    >
      <div className="relative h-full w-full overflow-hidden rounded-md bg-slate-700/60 shadow-sm">
        <div
          className="absolute inset-y-0 left-0 rounded-md bg-slate-500/40 transition-all"
          style={{ width: `${progress}%`, minWidth: progress > 0 ? 4 : 0 }}
        />
        <span className="absolute inset-0 flex items-center truncate px-2 text-[10px] font-semibold leading-none text-white/90">
          {label} · {progress}% · {taskCount} task{taskCount === 1 ? "" : "s"}
        </span>
      </div>
    </div>
  );
}
