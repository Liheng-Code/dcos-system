import { DAY_W, type GanttZoom, type GanttTask, DELAY_STATUS_COLORS, DEPENDENCY_COLORS } from "./gantt-types";

export function daysBetween(a: string, b: string): number {
  return Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export function daysBetweenDates(a: Date, b: Date): number {
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

export function diffDays(a: string, b: string): number {
  return Math.round((new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24));
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function toDate(iso: string): Date {
  return new Date(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function isWeekend(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

export function getDelayBarColor(task: GanttTask): string {
  if (task.is_critical) return "bg-red-500";
  return DELAY_STATUS_COLORS[task.delay_status] || "bg-blue-400";
}

export function getDependencyColor(type: string): string {
  return DEPENDENCY_COLORS[type] || "#94a3b8";
}

export function getDependencyLabel(type: string): string {
  return (type || "FS").toUpperCase();
}

/** True if linking `predId` as a predecessor of `taskId` would form a cycle. */
export function wouldCreateCycle(predId: string, taskId: string, tasks: GanttTask[]): boolean {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [predId];
  while (stack.length) {
    const cur = stack.pop() as string;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const p of byId.get(cur)?.dependency_task_ids ?? []) stack.push(p);
  }
  return false;
}

export function computeDateRange(tasks: GanttTask[]): { min: Date; max: Date } {
  const allDates = tasks.flatMap((t) =>
    [t.start_date, t.end_date, t.baseline_start_date, t.baseline_finish_date].filter(Boolean) as string[]
  );
  if (!allDates.length) return { min: new Date(), max: addDays(new Date(), 30) };
  const min = new Date(Math.min(...allDates.map((d) => new Date(d).getTime())));
  const max = new Date(Math.max(...allDates.map((d) => new Date(d).getTime())));
  return { min, max };
}

export function getTotalDays(min: Date, max: Date): number {
  return daysBetweenDates(min, max);
}

export function toX(dateIso: string, rangeMin: Date, dayW: number): number {
  const diff = Math.round((new Date(dateIso).getTime() - rangeMin.getTime()) / (1000 * 60 * 60 * 24));
  return diff * dayW;
}

export function getBarWidth(startIso: string, endIso: string, dayW: number): number {
  return Math.max(dayW, daysBetween(startIso, endIso) * dayW);
}

export function getZoomDayWidth(zoom: GanttZoom): number {
  return DAY_W[zoom];
}

// Adaptive spacing (in days) between header date ticks / body gridlines,
// aiming for ~90px between marks and snapping to a "nice" day count.
const NICE_TICK_DAYS = [1, 2, 3, 7, 14, 28, 42, 56, 84, 112, 168];
export function getHeaderTickDays(dayW: number): number {
  const target = 90 / Math.max(dayW, 0.01);
  return NICE_TICK_DAYS.find((n) => n >= target) ?? 224;
}

export function getStatusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const map: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
    open: "outline",
    assigned: "secondary",
    in_progress: "default",
    on_hold: "secondary",
    completed: "outline",
    submitted_for_approval: "default",
    approved: "default",
    rejected: "destructive",
    closed: "secondary",
    cancelled: "outline",
  };
  return map[status] || "outline";
}

export function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    open: "Open",
    assigned: "Assigned",
    in_progress: "In Progress",
    on_hold: "On Hold",
    completed: "Completed",
    submitted_for_approval: "Submitted",
    approved: "Approved",
    rejected: "Rejected",
    closed: "Closed",
    cancelled: "Cancelled",
  };
  return map[status] || status.replace(/_/g, " ");
}

export function getPriorityColor(priority: string): string {
  const map: Record<string, string> = {
    critical: "text-red-600",
    high: "text-orange-600",
    medium: "text-amber-600",
    low: "text-slate-400",
  };
  return map[priority] || "text-slate-400";
}

export function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - startOfYear.getTime();
  return Math.ceil((diff / 86400000 + startOfYear.getDay() + 1) / 7);
}

export function getMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}
