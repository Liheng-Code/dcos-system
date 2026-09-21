import type { GanttTask } from "@/components/planning/gantt-types";
import { formatDate as defaultFormatDate } from "@/components/planning/gantt-utils";

export type BarShape = "pill" | "rounded" | "square";
export type BarTextField =
  | "none"
  | "name"
  | "name_progress"
  | "code"
  | "start"
  | "finish"
  | "duration"
  | "progress"
  | "float"
  | "owner";

export interface BarCategoryStyle {
  color: string;
  shape: BarShape;
}

export interface BarTextConfig {
  left: BarTextField;
  right: BarTextField;
  top: BarTextField;
  bottom: BarTextField;
  inside: BarTextField;
}

export interface GanttBarStyleSettings {
  normal: BarCategoryStyle;
  critical: BarCategoryStyle;
  nearCritical: BarCategoryStyle;
  text: BarTextConfig;
}

export const DEFAULT_BAR_STYLE: GanttBarStyleSettings = {
  normal: { color: "#3b82f6", shape: "pill" },
  critical: { color: "#ef4444", shape: "pill" },
  nearCritical: { color: "#f59e0b", shape: "pill" },
  text: { left: "none", right: "none", top: "none", bottom: "none", inside: "name_progress" },
};

export const BAR_TEXT_FIELD_OPTIONS: { value: BarTextField; label: string }[] = [
  { value: "none", label: "(none)" },
  { value: "name_progress", label: "% + Name" },
  { value: "name", label: "Task Name" },
  { value: "code", label: "Code" },
  { value: "start", label: "Start" },
  { value: "finish", label: "Finish" },
  { value: "duration", label: "Duration" },
  { value: "progress", label: "% Complete" },
  { value: "float", label: "Total Float" },
  { value: "owner", label: "Owner" },
];

const RADIUS_BY_SHAPE: Record<BarShape, string> = {
  pill: "9999px",
  rounded: "4px",
  square: "0px",
};

export function barBorderRadius(shape: BarShape): string {
  return RADIUS_BY_SHAPE[shape] ?? RADIUS_BY_SHAPE.pill;
}

export function categoryStyleFor(
  task: Pick<GanttTask, "is_critical" | "is_near_critical">,
  style: GanttBarStyleSettings,
  highlightCritical: boolean,
): BarCategoryStyle {
  if (highlightCritical && task.is_critical) return style.critical;
  if (highlightCritical && task.is_near_critical) return style.nearCritical;
  return style.normal;
}

/** Resolves one bar-text field to its display string for a task, or "" when not applicable. */
export function barFieldValue(
  task: GanttTask,
  field: BarTextField,
  formatDate: (iso: string) => string = defaultFormatDate,
): string {
  switch (field) {
    case "none":
      return "";
    case "name":
      return task.task_name;
    case "name_progress":
      return task.task_name;
    case "code":
      return task.task_code;
    case "start":
      return task.start_date ? formatDate(task.start_date) : "";
    case "finish":
      return task.end_date ? formatDate(task.end_date) : "";
    case "duration":
      return task.start_date && task.end_date
        ? `${Math.max(1, Math.round((new Date(task.end_date).getTime() - new Date(task.start_date).getTime()) / 86400000) + 1)}d`
        : "";
    case "progress":
      return `${task.progress}%`;
    case "float":
      return task.total_float != null ? `F:${task.total_float}d` : "";
    case "owner":
      return task.owner_name ?? "";
  }
}
