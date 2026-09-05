"use client";

import { PlanScheduleView } from "./plan-schedule-view";

/**
 * Planning ▸ Sheet — the same MS-Project window as Planning ▸ Gantt Chart, but
 * with a task detail/assignment panel on the right instead of the Gantt bars
 * (Planning ▸ Gantt Chart already owns the timeline view).
 */
export function PlanSheet() {
  return <PlanScheduleView variant="sheet" />;
}
