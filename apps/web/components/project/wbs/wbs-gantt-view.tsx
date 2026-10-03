"use client";

import { GanttView } from "@/components/planning/gantt-view";
import type { WbsTaskRecord } from "@/components/project/wbs/wbs-types";

interface WbsGanttViewProps {
  tasks: WbsTaskRecord[];
  projectId: string;
}

function mapWbsTaskToGanttTask(t: WbsTaskRecord): import("@/components/planning/gantt-types").GanttTask {
  return {
    id: t.id,
    task_code: t.task_code,
    task_name: t.task_name,
    discipline: t.discipline,
    wbs_node_id: t.wbs_node_id,
    wbs_name: "",
    wbs_depth: 0,
    parent_wbs_node_id: null,
    start_date: t.start_date,
    end_date: t.end_date,
    progress: t.progress,
    status: t.status,
    delay_status: t.delay_status,
    priority: t.priority,
    owner_name: t.owner_name,
    dependency_task_ids: t.dependency_task_ids ?? [],
    dependency_types: t.dependency_types ?? [],
    dependency_lag_days: t.dependency_lag_days ?? [],
    is_milestone: false,
    constraint_type: null,
    baseline_start_date: t.baseline_start_date,
    baseline_finish_date: t.baseline_finish_date,
    is_critical: false,
    is_near_critical: false,
    total_float: null,
  };
}

export function WbsGanttView({ tasks, projectId }: WbsGanttViewProps) {
  const ganttTasks = tasks.map(mapWbsTaskToGanttTask);

  return (
    <GanttView
      mode="embedded"
      projectId={projectId}
      tasks={ganttTasks}
    />
  );
}
