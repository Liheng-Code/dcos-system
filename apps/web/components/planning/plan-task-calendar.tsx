"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { useSheetData } from "./use-sheet-data";
import type { SheetTask } from "./sheet-types";
import { getTaskStatus, TASK_STATUS_LEGEND } from "./task-status";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Lanes rendered before a day column collapses to a "+N more" indicator. */
const MAX_VISIBLE_LANES = 5;

/** A task with confirmed, non-null start/end dates — the only kind this view can place. */
type DatedTask = SheetTask & { start_date: string; end_date: string };

function dateOnly(iso: string): Date {
  return parseISO(iso.slice(0, 10));
}

interface PositionedBar {
  task: DatedTask;
  /** 1-indexed day-of-week column this segment starts in. */
  colStart: number;
  colSpan: number;
  lane: number;
}

/**
 * Greedy lane-packing for one week row: every task overlapping
 * [rowStart, rowEnd] is clipped to the row's bounds, then walked in start-date
 * order and dropped into the lowest-numbered lane whose last-assigned bar
 * doesn't date-overlap it. A task spanning several weeks is packed
 * independently per row, so its lane can (correctly) differ week to week.
 */
function packWeek(rowStart: Date, rowEnd: Date, tasks: DatedTask[]): PositionedBar[] {
  const segments = tasks
    .map((task) => {
      const taskStart = dateOnly(task.start_date);
      const taskEnd = dateOnly(task.end_date);
      if (taskEnd < rowStart || taskStart > rowEnd) return null;
      const segStart = taskStart > rowStart ? taskStart : rowStart;
      const segEnd = taskEnd < rowEnd ? taskEnd : rowEnd;
      return { task, segStart, segEnd };
    })
    .filter((v): v is { task: DatedTask; segStart: Date; segEnd: Date } => v !== null)
    .sort(
      (a, b) =>
        a.segStart.getTime() - b.segStart.getTime() ||
        a.task.task_code.localeCompare(b.task.task_code),
    );

  const laneEnds: Date[] = [];
  const bars: PositionedBar[] = [];
  for (const { task, segStart, segEnd } of segments) {
    let lane = laneEnds.findIndex((end) => end.getTime() < segStart.getTime());
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(segEnd);
    } else {
      laneEnds[lane] = segEnd;
    }
    bars.push({
      task,
      colStart: differenceInCalendarDays(segStart, rowStart) + 1,
      colSpan: differenceInCalendarDays(segEnd, segStart) + 1,
      lane,
    });
  }
  return bars;
}

/** Per day-of-week column, how many bars sit beyond the visible-lane cap. */
function overflowByColumn(bars: PositionedBar[]): { count: number; codes: string[] }[] {
  const cols = Array.from({ length: 7 }, () => ({ count: 0, codes: [] as string[] }));
  for (const bar of bars) {
    if (bar.lane < MAX_VISIBLE_LANES) continue;
    for (let c = bar.colStart; c < bar.colStart + bar.colSpan; c++) {
      if (c < 1 || c > 7) continue;
      cols[c - 1].count += 1;
      cols[c - 1].codes.push(bar.task.task_code);
    }
  }
  return cols;
}

function TaskBar({ bar }: { bar: PositionedBar }) {
  const task = bar.task;
  const statusInfo = getTaskStatus(task);
  return (
    <Popover>
      <PopoverTrigger
        style={{ gridColumn: `${bar.colStart} / span ${bar.colSpan}`, gridRow: bar.lane + 2 }}
        className={cn(
          "z-10 mx-0.5 my-0.5 flex min-w-0 items-center truncate rounded px-1.5 text-left text-[10px] font-medium leading-4",
          statusInfo.barClass,
        )}
      >
        <span className="truncate">
          {task.task_code} {task.task_name}
        </span>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 space-y-2">
        <PopoverTitle className="text-sm">
          {task.task_code} · {task.task_name}
        </PopoverTitle>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Dates</dt>
          <dd>
            {format(dateOnly(task.start_date), "d MMM yyyy")} – {format(dateOnly(task.end_date), "d MMM yyyy")}
          </dd>
          <dt className="text-muted-foreground">Status</dt>
          <dd>
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", statusInfo.badgeClass)}>
              {statusInfo.label}
            </span>
          </dd>
          <dt className="text-muted-foreground">Progress</dt>
          <dd>{task.progress}%</dd>
          <dt className="text-muted-foreground">Owner</dt>
          <dd>{task.owner_name || "—"}</dd>
        </dl>
      </PopoverContent>
    </Popover>
  );
}

function WeekRow({
  week,
  tasks,
  currentMonth,
}: {
  week: Date[];
  tasks: DatedTask[];
  currentMonth: Date;
}) {
  const rowStart = week[0];
  const rowEnd = week[6];
  const bars = useMemo(() => packWeek(rowStart, rowEnd, tasks), [rowStart, rowEnd, tasks]);
  const visibleBars = useMemo(() => bars.filter((b) => b.lane < MAX_VISIBLE_LANES), [bars]);
  const overflow = useMemo(() => overflowByColumn(bars), [bars]);
  const hasOverflow = overflow.some((c) => c.count > 0);
  const overflowRow = MAX_VISIBLE_LANES + 2;

  return (
    <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
      {week.map((day, i) => {
        const inMonth = isSameMonth(day, currentMonth);
        const today = isToday(day);
        return (
          <div
            key={`bg-${i}`}
            style={{ gridColumn: i + 1, gridRow: "1 / -1" }}
            className={cn(
              "min-h-24 border-b border-border",
              i < 6 && "border-r",
              !inMonth && "bg-muted/30",
              today && "bg-primary/5",
            )}
          />
        );
      })}
      {week.map((day, i) => {
        const inMonth = isSameMonth(day, currentMonth);
        const today = isToday(day);
        return (
          <div key={`num-${i}`} style={{ gridColumn: i + 1, gridRow: 1 }} className="flex justify-end p-1">
            <span
              className={cn(
                "inline-flex size-5 items-center justify-center rounded-full text-xs font-medium",
                !inMonth && "text-muted-foreground/50",
                inMonth && !today && "text-foreground",
                today && "bg-primary text-primary-foreground",
              )}
            >
              {format(day, "d")}
            </span>
          </div>
        );
      })}
      {visibleBars.map((bar) => (
        <TaskBar key={bar.task.id} bar={bar} />
      ))}
      {hasOverflow &&
        overflow.map((col, i) =>
          col.count > 0 ? (
            <div
              key={`ov-${i}`}
              style={{ gridColumn: i + 1, gridRow: overflowRow }}
              title={col.codes.join(", ")}
              className="mx-1 truncate text-[10px] font-medium text-muted-foreground"
            >
              +{col.count} more
            </div>
          ) : null,
        )}
    </div>
  );
}

export function PlanTaskCalendar() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const sheet = useSheetData(selectedProjectId);
  const [currentMonth, setCurrentMonth] = useState(() => new Date());

  const datedTasks = useMemo(
    () =>
      sheet.tasks.filter((t): t is DatedTask => !!t.start_date && !!t.end_date),
    [sheet.tasks],
  );

  const weeks = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart);
    const gridEnd = endOfWeek(monthEnd);
    const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
    const out: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [currentMonth]);

  const goToday = () => setCurrentMonth(new Date());
  const prevMonth = () => setCurrentMonth((p) => subMonths(p, 1));
  const nextMonth = () => setCurrentMonth((p) => addMonths(p, 1));

  if (projectLoading || sheet.loading) {
    return (
      <div className="flex h-60 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!selectedProjectId) {
    return (
      <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">
        Select a project to view the calendar.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{format(currentMonth, "MMMM yyyy")}</h2>
          <p className="text-sm text-muted-foreground">Tasks shown as bars across their start–end dates</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={prevMonth} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={nextMonth} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {datedTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <CalendarDays className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No tasks to display on the calendar</p>
          <p className="mt-1 text-xs text-slate-400">Tasks need a start date and end date set to appear here.</p>
        </div>
      ) : (
        <Card className="py-0">
          <CardContent className="overflow-hidden rounded-md border border-border p-0">
            <div className="grid" style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {DAY_LABELS.map((d, i) => (
                <div
                  key={d}
                  className={cn(
                    "border-b border-border bg-muted/40 py-1.5 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground",
                    i < 6 && "border-r",
                  )}
                >
                  {d}
                </div>
              ))}
            </div>
            {weeks.map((week, i) => (
              <WeekRow key={i} week={week} tasks={datedTasks} currentMonth={currentMonth} />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        {TASK_STATUS_LEGEND.map(({ label, barClass }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={cn("size-3 rounded", barClass)} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
