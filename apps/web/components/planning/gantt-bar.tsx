"use client";

import { useState, useCallback, useRef } from "react";
import type { GanttTask } from "./gantt-types";
import { formatDate } from "./gantt-utils";
import { cn } from "@/lib/utils";

interface GanttBarProps {
  task: GanttTask;
  left: number;
  width: number;
  dayWidth: number;
  onClick?: () => void;
  onReschedule?: (taskId: string, newStart: string, newEnd: string) => void;
  zoom?: "day" | "week" | "month";
  rangeMin?: Date;
}

export function GanttBar({
  task,
  left,
  width,
  dayWidth,
  onClick,
  onReschedule,
  zoom,
  rangeMin,
}: GanttBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const dragStartX = useRef(0);
  const originalLeft = useRef(left);
  const [dragOffset, setDragOffset] = useState(0);
  const minWidth = Math.max(dayWidth, width);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!onReschedule) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    dragStartX.current = e.clientX;
    originalLeft.current = left;
  }, [onReschedule, left]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    const diff = e.clientX - dragStartX.current;
    setDragOffset(diff);
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging || !onReschedule || !rangeMin || !zoom) {
      setIsDragging(false);
      setDragOffset(0);
      return;
    }
    setIsDragging(false);
    if (Math.abs(dragOffset) < dayWidth / 2) {
      setDragOffset(0);
      return;
    }
    const snappedDays = Math.round(dragOffset / dayWidth);
    if (snappedDays === 0) {
      setDragOffset(0);
      return;
    }
    const oldStart = new Date(task.start_date || task.baseline_start_date || "");
    const oldEnd = new Date(task.end_date || task.baseline_finish_date || "");
    const newStart = new Date(oldStart);
    const newEnd = new Date(oldEnd);
    newStart.setDate(newStart.getDate() + snappedDays);
    newEnd.setDate(newEnd.getDate() + snappedDays);
    onReschedule(
      task.id,
      newStart.toISOString().slice(0, 10),
      newEnd.toISOString().slice(0, 10),
    );
    setDragOffset(0);
  }, [isDragging, onReschedule, dragOffset, dayWidth, rangeMin, zoom, task]);

  return (
    <div
      className={cn(
        "absolute top-1/2 -translate-y-1/2 group/bar",
        onReschedule && "cursor-grab active:cursor-grabbing",
      )}
      style={{
        left: left + dragOffset,
        width: minWidth,
        height: 24,
      }}
      onClick={(e) => { if (!isDragging) onClick?.(); }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => { setIsDragging(false); setDragOffset(0); setTooltipVisible(false); }}
      onMouseEnter={() => setTooltipVisible(true)}
    >
      {/* Tooltip */}
      {tooltipVisible && !isDragging && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50 pointer-events-none">
          <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md text-[11px] whitespace-nowrap">
            <div className="font-semibold">{task.task_name}</div>
            <div className="text-muted-foreground mt-0.5 space-y-0.5">
              {task.start_date && <div>Planned: {formatDate(task.start_date)}</div>}
              {task.end_date && <div>Finish: {formatDate(task.end_date)}</div>}
              {task.baseline_start_date && <div>Baseline: {formatDate(task.baseline_start_date)}</div>}
              <div>Progress: {task.progress}%</div>
              {task.total_float !== null && <div>Float: {task.total_float}d</div>}
            </div>
          </div>
        </div>
      )}

      {/* Stacked bars container */}
      <div className="relative h-full w-full">
        {/* Layer 1: Contract baseline bar (grey/faint) */}
        {task.baseline_start_date && task.baseline_finish_date && (
          <div
            className="absolute top-0 left-0 h-2 rounded-full bg-slate-300 border border-dashed border-slate-400 opacity-50"
            style={{ width: "100%" }}
          />
        )}

        {/* Layer 2: Current planned bar (blue, or red if critical) */}
        <div
          className={cn(
            "absolute top-2 left-0 h-3 rounded-full shadow-sm transition-all duration-150",
            "group-hover/bar:shadow-md group-hover/bar:brightness-110",
            task.is_critical ? "bg-red-500" : "bg-blue-500",
            isDragging && "opacity-70 shadow-lg scale-105",
          )}
          style={{ width: "100%" }}
        >
          {/* Layer 3: Actual progress fill (green overlay) */}
          {task.progress > 0 && (
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-green-500/70"
              style={{ width: `${task.progress}%`, minWidth: task.progress > 0 ? 4 : 0 }}
            />
          )}

          {/* Label */}
          <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white leading-none truncate">
            {task.progress > 0 && (
              <span className="mr-1 shrink-0">{task.progress}%</span>
            )}
            {width > 60 && (
              <span className="truncate opacity-80">{task.task_name}</span>
            )}
          </span>
        </div>
      </div>

      {/* Total float indicator */}
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
