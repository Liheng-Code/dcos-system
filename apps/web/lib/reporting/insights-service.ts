import { createClient } from "@/lib/supabase/client";

export interface TaskSummaryRow {
  discipline: string;
  status: string;
  delay_status: string;
  task_count: number;
  avg_progress: number;
  total_budget: number;
  total_actual: number;
  overdue_count: number;
}

export interface ApprovalSummaryRow {
  discipline: string;
  pending_review: number;
  pending_approval: number;
  approved: number;
  rejected: number;
}

export interface DisciplineSummary {
  discipline: string;
  statusCounts: Record<string, number>;
  delayedCount: number;
  blockedCount: number;
  avgProgress: number;
  totalTasks: number;
  overdueCount: number;
  totalBudget: number;
  totalActual: number;
  costVariancePct: number;
}

export async function getModuleTaskSummary(projectId: string): Promise<TaskSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_module_task_summary", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data ?? []) as TaskSummaryRow[];
}

export async function getModuleApprovalSummary(projectId: string): Promise<ApprovalSummaryRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_module_approval_summary", {
    p_project_id: projectId,
  });
  if (error) throw error;
  return (data ?? []) as ApprovalSummaryRow[];
}

/** Pivot raw RPC rows into one summary object per discipline. */
export function pivotTaskSummary(rows: TaskSummaryRow[]): DisciplineSummary[] {
  const map = new Map<string, DisciplineSummary>();

  for (const row of rows) {
    if (!map.has(row.discipline)) {
      map.set(row.discipline, {
        discipline: row.discipline,
        statusCounts: {},
        delayedCount: 0,
        blockedCount: 0,
        avgProgress: 0,
        totalTasks: 0,
        overdueCount: 0,
        totalBudget: 0,
        totalActual: 0,
        costVariancePct: 0,
      });
    }
    const d = map.get(row.discipline)!;
    const count = Number(row.task_count);
    d.statusCounts[row.status] = (d.statusCounts[row.status] ?? 0) + count;
    d.totalTasks += count;
    d.overdueCount += Number(row.overdue_count);
    d.totalBudget += Number(row.total_budget);
    d.totalActual += Number(row.total_actual);
    if (row.delay_status === "delayed") d.delayedCount += count;
    if (row.status === "blocked" || row.delay_status === "blocked") d.blockedCount += count;
    // weighted progress accumulation (resolved after loop)
    d.avgProgress += Number(row.avg_progress) * count;
  }

  for (const d of map.values()) {
    d.avgProgress = d.totalTasks > 0 ? Math.round(d.avgProgress / d.totalTasks) : 0;
    d.costVariancePct =
      d.totalBudget > 0
        ? Math.round(((d.totalActual - d.totalBudget) / d.totalBudget) * 100)
        : 0;
  }

  return Array.from(map.values()).sort((a, b) => a.discipline.localeCompare(b.discipline));
}
