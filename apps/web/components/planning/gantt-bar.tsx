"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Link2 } from "lucide-react";
import type { GanttTask } from "./gantt-types";
import { diffDays, formatDate as defaultFormatDate } from "./gantt-utils";
import { cn } from "@/lib/utils";
import {
  barBorderRadius,
  barFieldValue,
  categoryStyleFor,
  DEFAULT_BAR_STYLE,
  type GanttBarStyleSettings,
} from "@/lib/planning/gantt-bar-style";

/** One overlay bar drawn at another schedule's dates, for visual comparison. */
export interface GanttGhostRef {
  label: string;
  startISO: string;
  endISO: string;
  /** Absolute x / width in the same coordinate space as `left` / `width`. */
  left: number;
  width: number;
  /** "a" → slate (Compare A, above the live bar), "b" → blue (Compare B, below). */
  tone: "a" | "b";
}

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
  /**
   * Absolute x / width (same coordinate space as `left`/`width`) for the
   * reference ghost bar, so it can be drawn at the reference schedule's own
   * position and length. When omitted, a faint full-width strip is drawn
   * instead — the legacy behaviour used by views that only have the per-task
   * baseline columns.
   */
  referenceLeft?: number | null;
  referenceWidth?: number | null;
  /**
   * Up to two comparison overlays (Compare A / Compare B), each drawn at its
   * own dates. When supplied this supersedes the single `referenceLeft` /
   * `task.baseline_*` ghost.
   */
  references?: GanttGhostRef[];
  /** Formats a date for the tooltip per the user's date-format preference. Defaults to gantt-utils' formatDate. */
  formatDate?: (iso: string) => string;
  /** Per-category bar color/shape + text label positions. Defaults to the shipped look. */
  barStyle?: GanttBarStyleSettings;
  /** Double-click opens the "Format Bar" dialog (MS-Project style — applies to the whole category, not just this bar). */
  onFormatBar?: () => void;
  /** Show the total-float label above the bar. Defaults to on. */
  showFloat?: boolean;
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
  referenceLeft = null,
  referenceWidth = null,
  references,
  formatDate = defaultFormatDate,
  barStyle = DEFAULT_BAR_STYLE,
  onFormatBar,
  showFloat = true,
}: GanttBarProps) {
  const category = categoryStyleFor(task, barStyle, highlightCritical);
  const textAt = (pos: keyof GanttBarStyleSettings["text"]) => barFieldValue(task, barStyle.text[pos], formatDate);
  const [isDragging, setIsDragging] = useState(false);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const dragStartX = useRef(0);
  const originalLeft = useRef(left);
  const [dragOffset, setDragOffset] = useState(0);
  const minWidth = Math.max(dayWidth, width);

  const hasRefs = !!(references && references.length > 0);
  const hasReference = !!(task.baseline_start_date && task.baseline_finish_date);
  const positionedRef = hasReference && referenceLeft != null && referenceWidth != null;
  const startSlipDays =
    task.start_date && task.baseline_start_date
      ? diffDays(task.start_date, task.baseline_start_date)
      : null;
  const finishSlipDays =
    task.end_date && task.baseline_finish_date
      ? diffDays(task.end_date, task.baseline_finish_date)
      : null;

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
      onDoubleClick={(e) => {
        if (!onFormatBar) return;
        e.stopPropagation();
        onFormatBar();
      }}
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
              {hasRefs
                ? references!.map((r) => {
                    const sSlip = task.start_date ? diffDays(task.start_date, r.startISO) : null;
                    const fSlip = task.end_date ? diffDays(task.end_date, r.endISO) : null;
                    return (
                      <div key={r.tone} className="mt-1 border-t border-border pt-1">
                        <div className="flex items-center gap-1 font-medium text-foreground">
                          <span
                            className={cn(
                              "inline-block h-1.5 w-3 rounded-full border border-dashed",
                              r.tone === "a"
                                ? "border-slate-500 bg-slate-300"
                                : "border-blue-500 bg-blue-200",
                            )}
                          />
                          {r.label}
                        </div>
                        <div>
                          Start: {formatDate(r.startISO)}
                          {sSlip ? (
                            <span className={cn("ml-1", sSlip > 0 ? "text-red-600" : "text-emerald-600")}>
                              ({sSlip > 0 ? "+" : ""}
                              {sSlip}d)
                            </span>
                          ) : null}
                        </div>
                        <div>
                          Finish: {formatDate(r.endISO)}
                          {fSlip ? (
                            <span className={cn("ml-1", fSlip > 0 ? "text-red-600" : "text-emerald-600")}>
                              ({fSlip > 0 ? "+" : ""}
                              {fSlip}d)
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })
                : hasReference && (
                    <>
                      <div className="mt-1 border-t border-border pt-1 font-medium text-foreground">
                        {referenceLabel}
                      </div>
                      <div>
                        Start: {formatDate(task.baseline_start_date!)}
                        {startSlipDays !== null && startSlipDays !== 0 && (
                          <span className={cn("ml-1", startSlipDays > 0 ? "text-red-600" : "text-emerald-600")}>
                            ({startSlipDays > 0 ? "+" : ""}
                            {startSlipDays}d)
                          </span>
                        )}
                      </div>
                      <div>
                        Finish: {formatDate(task.baseline_finish_date!)}
                        {finishSlipDays !== null && finishSlipDays !== 0 && (
                          <span className={cn("ml-1", finishSlipDays > 0 ? "text-red-600" : "text-emerald-600")}>
                            ({finishSlipDays > 0 ? "+" : ""}
                            {finishSlipDays}d)
                          </span>
                        )}
                      </div>
                      <div>
                        {finishSlipDays === null || finishSlipDays === 0
                          ? "On reference finish"
                          : finishSlipDays > 0
                            ? `Slipped ${finishSlipDays}d vs reference`
                            : `Ahead ${Math.abs(finishSlipDays)}d vs reference`}
                      </div>
                    </>
                  )}
              <div>Progress: {task.progress}%</div>
              {task.total_float !== null && <div>Float: {task.total_float}d</div>}
            </div>
          </div>
        </div>
      )}

      {/* Stacked bars container */}
      <div className="relative h-full w-full">
        {/* Layer 1: comparison / baseline ghost bars.
            - references[]: up to two overlays (Compare A above the live bar in
              slate, Compare B below in blue), each at its own start & length.
            - positioned: the single legacy reference ghost.
            - legacy strip: faint full-width, for views with only the per-task
              baseline columns. */}
        {hasRefs
          ? references!.map((r) => (
              <div
                key={r.tone}
                className={cn(
                  "pointer-events-none absolute h-1.5 rounded-full border border-dashed",
                  r.tone === "a"
                    ? "top-0 border-slate-500 bg-slate-300"
                    : "top-[20px] border-blue-500 bg-blue-200",
                )}
                style={{ left: r.left - left, width: Math.max(dayWidth, r.width) }}
              />
            ))
          : hasReference &&
            (positionedRef ? (
              <div
                className="pointer-events-none absolute top-0 h-1.5 rounded-full border border-dashed border-slate-500 bg-slate-300"
                style={{
                  left: referenceLeft! - left,
                  width: Math.max(dayWidth, referenceWidth!),
                }}
              />
            ) : (
              <div
                className="absolute top-0 left-0 h-2 rounded-full border border-dashed border-slate-400 bg-slate-300 opacity-50"
                style={{ width: "100%" }}
              />
            ))}

        {/* Layer 2: Current planned bar (color/shape per its category — Normal/Critical/Near-critical) */}
        <div
          className={cn(
            "absolute top-2 left-0 h-3 shadow-sm transition-all duration-150",
            "group-hover/bar:shadow-md group-hover/bar:brightness-110",
            isDragging && "opacity-70 shadow-lg scale-105",
            wheelActive && "ring-2 ring-green-500 ring-offset-1",
          )}
          style={{ width: "100%", background: category.color, borderRadius: barBorderRadius(category.shape) }}
        >
          {/* Layer 3: Actual progress fill (green overlay) */}
          {task.progress > 0 && (
            <div
              className="absolute inset-y-0 left-0 bg-green-500/70"
              style={{
                width: `${task.progress}%`,
                minWidth: task.progress > 0 ? 4 : 0,
                borderRadius: barBorderRadius(category.shape),
              }}
            />
          )}

          {/* Inside label */}
          {width > 60 && textAt("inside") && (
            <span className="absolute inset-0 flex items-center px-2 text-[10px] font-semibold text-white leading-none truncate">
              {barStyle.text.inside === "name_progress" && task.progress > 0 && (
                <span className="mr-1 shrink-0">{task.progress}%</span>
              )}
              <span className="truncate opacity-80">{textAt("inside")}</span>
            </span>
          )}
        </div>
      </div>

      {/* Top / bottom / left / right labels — configurable via double-click "Format Bar" */}
      {textAt("top") && (
        <span className="absolute inset-x-0 top-0 -translate-y-full truncate px-1 text-center text-[9px] leading-none text-slate-500">
          {textAt("top")}
        </span>
      )}
      {textAt("bottom") && (
        <span className="absolute inset-x-0 bottom-0 translate-y-full truncate px-1 text-center text-[9px] leading-none text-slate-500">
          {textAt("bottom")}
        </span>
      )}
      {textAt("left") && (
        <span className="absolute right-full top-1/2 mr-1.5 -translate-y-1/2 whitespace-nowrap text-[9px] leading-none text-slate-500">
          {textAt("left")}
        </span>
      )}
      {textAt("right") && (
        <span className="absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[9px] leading-none text-slate-500">
          {textAt("right")}
        </span>
      )}

      {/* Total float indicator */}
      {showFloat && task.total_float !== null && (
        <span
          className={cn(
            "absolute top-0 -translate-y-full px-1 text-[9px] font-semibold leading-none pt-0.5",
            !highlightCritical && "text-slate-400",
          )}
          style={highlightCritical ? { color: task.is_critical || task.is_near_critical ? category.color : "#94a3b8" } : undefined}
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
