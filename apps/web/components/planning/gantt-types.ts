export type ScheduleLevel = 1 | 2 | 3 | 4 | 5;

export type GanttZoom = "day" | "week" | "month";

export interface GanttTask {
  id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  wbs_node_id: string;
  wbs_name: string;
  wbs_depth: number;
  parent_wbs_node_id: string | null;
  start_date: string | null;
  end_date: string | null;
  progress: number;
  status: string;
  delay_status: string;
  priority: string;
  owner_name: string | null;
  dependency_task_ids: string[];
  dependency_types: string[];
  dependency_lag_days: number[];
  is_milestone: boolean;
  constraint_type: string | null;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
  is_critical: boolean;
  total_float: number | null;
}

export interface GanttGroupRow {
  id: string;
  type: "wbs_group";
  wbs_code: string;
  wbs_name: string;
  wbs_depth: number;
  is_expanded: boolean;
  children: string[];
  start_date: string | null;
  end_date: string | null;
  progress: number;
  task_count: number;
}

export type GanttDisplayRow =
  | { kind: "task"; data: GanttTask; depth: number }
  | { kind: "group"; data: GanttGroupRow; depth: number };

export const ZOOM_LABELS: Record<GanttZoom, string> = {
  day: "Day",
  week: "Week",
  month: "Month",
};

export const DAY_W: Record<GanttZoom, number> = {
  day: 36,
  week: 80,
  month: 200,
};

export const BAR_HEIGHT = 24;
export const ROW_HEIGHT = 36;
export const HEADER_H = 48;
export const LABEL_W = 300;
export const GROUP_HEADER_H = 28;

export const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  open: { variant: "outline", label: "Open" },
  assigned: { variant: "secondary", label: "Assigned" },
  in_progress: { variant: "default", label: "In Progress" },
  on_hold: { variant: "secondary", label: "On Hold" },
  completed: { variant: "outline", label: "Completed" },
  submitted_for_approval: { variant: "default", label: "Submitted" },
  approved: { variant: "default", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  closed: { variant: "secondary", label: "Closed" },
  cancelled: { variant: "outline", label: "Cancelled" },
};

export const DELAY_STATUS_COLORS: Record<string, string> = {
  on_track: "bg-green-500",
  risk: "bg-amber-500",
  delayed: "bg-red-500",
  blocked: "bg-slate-400",
};

export const DELAY_STATUS_BG: Record<string, string> = {
  on_track: "bg-green-50 text-green-700 border-green-200",
  risk: "bg-amber-50 text-amber-700 border-amber-200",
  delayed: "bg-red-50 text-red-700 border-red-200",
  blocked: "bg-slate-50 text-slate-600 border-slate-200",
};

export const DEPENDENCY_COLORS: Record<string, string> = {
  FS: "#3b82f6",
  SS: "#22c55e",
  FF: "#a855f7",
  SF: "#f97316",
};
