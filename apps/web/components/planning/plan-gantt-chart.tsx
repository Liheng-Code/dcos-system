"use client";

import { PlanScheduleView } from "./plan-schedule-view";

/**
 * Planning ▸ Gantt Chart — the MS-Project window: an editable task grid on the
 * left, the bar chart on the right, one auto-scheduling engine behind both.
 * (The older read-only `GanttView` still backs the embedded WBS chart.)
 */
export function PlanGanttChart() {
  return <PlanScheduleView />;
}
