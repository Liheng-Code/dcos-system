"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Link2 } from "lucide-react";
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
  /** Begin dragging a dependency link from this task's finish edge */
  onStartLink?: (e: React.MouseEvent) => void;
  /** Mouse-wheel over the bar nudges % complete (±5, Shift ±1). */
  onSetProgress?: (taskId: string, pct: number) => void;
  zoom?: "day" | "week" | "month";
  rangeMin?: Date;
  /** Show the critical-path red highlight (bar color + float badge). Defaults to on. */
  highlightCritical?: boolean;
  /** Tooltip label for the ghost reference bar — defaults to "Baseline". */
  referenceLabel?: string;
}

export function GanttBar({
  task,
  left,
  width,
  dayWidth,
  onClick,
  onReschedule,
  onStartLink,
  onSetProgress,
  zoom,
  rangeMin,
  highlightCritical = true,
  referenceLabel = "Baseline",
}: GanttBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const dragStartX = useRef(0);
  const originalLeft = useRef(left);
  const [dragOffset, setDragOffset] = useState(0);
  const minWidth = Math.max(dayWidth, width);

  // Mouse-wheel over the bar → % complete. React 19 registers `onWheel` as
  // passive, so `preventDefault` (to stop the chart pane from also scrolling)
  // needs a native non-passive listener.
  const barRef = useRef<HTMLDivElement>(null);
  const [wheelActive, setWheelActive] = useState(false);
  const wheelResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const el = barRef.current;
    if (!el || !onSetProgress) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const step = e.shiftKey ? 1 : 5;
      onSetProgress(task.id, (task.progress ?? 0) + (e.deltaY < 0 ? step : -step));
      setWheelActive(true);
      if (wheelResetRef.current) clearTimeout(wheelResetRef.current);
      wheelResetRef.current = setTimeout(() => setWheelActive(false), 700);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelResetRef.current) clearTimeout(wheelResetRef.current);
    };
  }, [onSetProgress, task.id, task.progress]);

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
      ref={barRef}
      className={cn(
        "absolute top-1/2 -translate-y-1/2 group/bar",
        onReschedule && "cursor-grab active:cursor-grabbing",
      )}
      style={{
        left: left + dragOffset,
        width: minWidth,
        height: 24,
      }}
      title={onSetProgress ? "Scroll to change % complete (Shift = 1%)" : undefined}
      onClick={() => { if (!isDragging) onClick?.(); }}
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
              {task.baseline_start_date && <div>{referenceLabel}: {formatDate(task.baseline_start_date)}</div>}
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
            task.is_critical && highlightCritical ? "bg-red-500" : "bg-blue-500",
            isDragging && "opacity-70 shadow-lg scale-105",
            wheelActive && "ring-2 ring-green-500 ring-offset-1",
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
            {(task.progress > 0 || wheelActive) && (
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
            task.total_float <= 0 && highlightCritical ? "text-red-600" : "text-slate-400",
          )}
        >
          F:{task.total_float}d
        </span>
      )}

      {/* Link handle — drag onto another task to create a Finish-to-Start link */}
      {onStartLink && !isDragging && (
        <button
          type="button"
          aria-label="Drag to link to another task"
          title="Drag onto another task to create a Finish-to-Start link"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onStartLink(e);
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute top-1/2 right-0 z-30 hidden h-4 w-4 -translate-y-1/2 translate-x-1/2 cursor-crosshair items-center justify-center rounded-full border border-background bg-primary text-primary-foreground shadow transition-transform hover:scale-110 group-hover/bar:flex"
        >
          <Link2 className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}
