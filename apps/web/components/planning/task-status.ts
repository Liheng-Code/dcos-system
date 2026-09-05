// Shared task-status derivation for Planning views (schedule reports'
// Milestones report and the Task Calendar's bar colouring both need the same
// label/status logic — extracted here so they can never drift apart).

export interface TaskStatusInput {
  status: string;
  end_date: string | null;
  delay_status: string | null;
}

export interface TaskStatusResult {
  label: string;
  /** Soft `bg-*-100 text-*-700` classes for a table badge. */
  badgeClass: string;
  /** Solid-fill classes (plus text color) for a calendar bar. */
  barClass: string;
}

const BADGE_CLASS: Record<string, string> = {
  Complete: "bg-green-100 text-green-700",
  Overdue: "bg-red-100 text-red-700",
  "At Risk": "bg-yellow-100 text-yellow-700",
  "On Track": "bg-blue-100 text-blue-700",
  "No Date": "bg-gray-100 text-gray-600",
};

const BAR_CLASS: Record<string, string> = {
  Complete: "bg-green-500 text-white",
  Overdue: "bg-red-500 text-white",
  "At Risk": "bg-yellow-500 text-white",
  "On Track": "bg-blue-500 text-white",
  "No Date": "bg-gray-400 text-white",
};

/** Fixed status label order + swatch, for legends (e.g. the Task Calendar). */
export const TASK_STATUS_LEGEND: { label: string; barClass: string }[] = [
  { label: "On Track", barClass: BAR_CLASS["On Track"] },
  { label: "At Risk", barClass: BAR_CLASS["At Risk"] },
  { label: "Overdue", barClass: BAR_CLASS["Overdue"] },
  { label: "Complete", barClass: BAR_CLASS["Complete"] },
  { label: "No Date", barClass: BAR_CLASS["No Date"] },
];

/** Days before `end_date` that a task starts showing the "due soon" row icon. */
const DUE_SOON_DAYS = 3;

export type DeadlineFlag = "overdue" | "due_soon" | null;

/**
 * Pure date-proximity flag for the Sheet grid's row icon — deliberately
 * separate from `getTaskStatus`'s "At Risk" (which is the hand-set
 * `delay_status` field, not a date computation). "Overdue" here matches
 * `getTaskStatus`'s definition exactly so the two never disagree.
 */
export function getDeadlineFlag(task: { status: string; end_date: string | null }): DeadlineFlag {
  const isComplete = task.status === "completed" || task.status === "closed" || task.status === "approved";
  if (isComplete || !task.end_date) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (task.end_date < today) return "overdue";
  const soon = new Date();
  soon.setDate(soon.getDate() + DUE_SOON_DAYS);
  if (task.end_date <= soon.toISOString().slice(0, 10)) return "due_soon";
  return null;
}

export function getTaskStatus(task: TaskStatusInput): TaskStatusResult {
  const today = new Date().toISOString().slice(0, 10);
  const isComplete = task.status === "completed" || task.status === "closed" || task.status === "approved";
  const label = isComplete ? "Complete"
    : !task.end_date ? "No Date"
    : task.end_date < today ? "Overdue"
    : task.delay_status === "risk" ? "At Risk"
    : "On Track";
  return {
    label,
    badgeClass: BADGE_CLASS[label] ?? "",
    barClass: BAR_CLASS[label] ?? "",
  };
}
