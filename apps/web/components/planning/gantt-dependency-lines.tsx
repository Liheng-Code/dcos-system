"use client";

import { useMemo } from "react";
import type { GanttTask } from "./gantt-types";
import { toX, getDependencyColor } from "./gantt-utils";

interface GanttDependencyLinesProps {
  tasks: GanttTask[];
  taskMap: Map<string, GanttTask>;
  rangeMin: Date;
  dayWidth: number;
  rowHeight: number;
  rowOffsetMap: Map<string, number>;
  containerWidth: number;
}

export function GanttDependencyLines({
  tasks,
  taskMap,
  rangeMin,
  dayWidth,
  rowHeight,
  rowOffsetMap,
  containerWidth,
}: GanttDependencyLinesProps) {
  const paths = useMemo(() => {
    const result: { id: string; path: string; color: string; type: string }[] = [];

    for (const task of tasks) {
      if (!task.dependency_task_ids?.length) continue;
      const taskEnd = task.end_date || task.baseline_finish_date;
      if (!taskEnd) continue;

      for (let i = 0; i < task.dependency_task_ids.length; i++) {
        const predId = task.dependency_task_ids[i];
        const pred = taskMap.get(predId);
        if (!pred) continue;

        const predEnd = pred.end_date || pred.baseline_finish_date;
        if (!predEnd) continue;

        const depType = task.dependency_types?.[i] || "FS";
        const lagDays = task.dependency_lag_days?.[i] || 0;

        const predRowTop = rowOffsetMap.get(pred.id) ?? 0;
        const taskRowTop = rowOffsetMap.get(task.id) ?? 0;
        if (predRowTop === 0 && taskRowTop === 0) continue;

        const x1 = toX(predEnd, rangeMin, dayWidth) + dayWidth;
        const x2 = toX(task.start_date || task.baseline_start_date || taskEnd, rangeMin, dayWidth);

        const y1 = predRowTop + rowHeight / 2;
        const y2 = taskRowTop + rowHeight / 2;

        const dx = Math.abs(x2 - x1);
        const cp = Math.min(dx * 0.4, 40);

        const d = `M${x1},${y1} C${x1 + cp},${y1} ${x2 - cp},${y2} ${x2},${y2}`;

        result.push({
          id: `${pred.id}->${task.id}`,
          path: d,
          color: getDependencyColor(depType),
          type: depType,
        });
      }
    }

    return result;
  }, [tasks, taskMap, rangeMin, dayWidth, rowHeight, rowOffsetMap]);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerWidth, overflow: "visible" }}
    >
      <defs>
        {["#3b82f6", "#22c55e", "#a855f7", "#f97316", "#94a3b8"].map((color) => (
          <marker
            key={color}
            id={`arrow-${color.replace("#", "")}`}
            viewBox="0 0 8 8"
            refX="6"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 8 4 L 0 8 Z" fill={color} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <path
          key={p.id}
          d={p.path}
          fill="none"
          stroke={p.color}
          strokeWidth="1.5"
          markerEnd={`url(#arrow-${p.color.replace("#", "")})`}
          className="transition-opacity duration-150 opacity-40 hover:opacity-100"
          style={{ pointerEvents: "stroke" }}
        />
      ))}
    </svg>
  );
}
