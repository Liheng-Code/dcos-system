"use client";

import type { GanttTask } from "./gantt-types";
import { getDelayBarColor } from "./gantt-utils";
import { cn } from "@/lib/utils";

interface GanttBarProps {
  task: GanttTask;
  left: number;
  width: number;
  dayWidth: number;
  onClick?: () => void;
}

export function GanttBar({ task, left, width, dayWidth, onClick }: GanttBarProps) {
  const barColor = getDelayBarColor(task);
  const minWidth = Math.max(dayWidth, width);

  return (
    <div
      className="absolute top-1/2 -translate-y-1/2 cursor-pointer group/bar"
      style={{ left, width: minWidth, height: 22 }}
      onClick={onClick}
    >
      <div
        className={cn(
          "relative h-full w-full rounded-full shadow-sm transition-all duration-150",
          "group-hover/bar:shadow-md group-hover/bar:brightness-110",
          barColor,
          task.is_critical && "ring-2 ring-red-300 ring-offset-1",
        )}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-white/20"
          style={{ width: `${task.progress}%`, minWidth: task.progress > 0 ? 4 : 0 }}
        />
        <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white leading-none truncate">
          {task.progress > 0 && (
            <span className="mr-1 shrink-0">{task.progress}%</span>
          )}
          {width > 60 && (
            <span className="truncate opacity-80">{task.task_name}</span>
          )}
        </span>
      </div>

      {task.total_float !== null && (
        <span
          className={cn(
            "absolute top-0 -translate-y-full px-1 text-[9px] font-semibold leading-none pt-0.5",
            task.total_float <= 0 ? "text-red-600" : "text-slate-400",
          )}
        >
          F:{task.total_float}d
        </span>
      )}
    </div>
  );
}
