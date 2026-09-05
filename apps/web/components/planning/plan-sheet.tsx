"use client";

import { PlanScheduleView } from "./plan-schedule-view";

/**
 * Planning ▸ Sheet — the same MS-Project window as Planning ▸ Gantt Chart with
 * the timeline pane collapsed. One implementation, two entry points.
 */
export function PlanSheet() {
  return <PlanScheduleView showTimeline={false} />;
}
