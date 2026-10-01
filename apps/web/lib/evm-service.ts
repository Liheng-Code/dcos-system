import { createClient } from "@/lib/supabase/client";
import { type WbsTaskRecord } from "@/components/wbs/wbs-types";
import { type ProgressSnapshotRow } from "@/lib/planning/schedule-service";

export interface EvmMetrics {
  bac: number;
  ev: number;
  pv: number;
  ac: number;
  cpi: number | null;
  spi: number | null;
  cv: number;
  sv: number;
  eac: number | null;
  vac: number | null;
  tcpi: number | null;
}

export interface ProjectCostAnalytics {
  projectId: string;
  projectCode: string | null;
  projectName: string;
  projectStatus: string;
  budget: number;
  actual: number;
  progress: number;
  tasks: number;
  delayedTasks: number;
  evm: EvmMetrics | null;
}

interface ProjectRow {
  id: string;
  project_code: string | null;
  project_name: string;
  project_status: string | null;
  /** Completion Plan 2.7 — Planned Value is anchored on this, not wall-clock time, so EVM matches the as-of date IPC claims use. */
  data_date: string | null;
}

interface BoqItemRow {
  id: string;
  project_id: string;
  wbs_node_id: string | null;
  total_amount: number | string | null;
}

interface CostTransactionRow {
  id: string;
  project_id: string;
  boq_item_id: string | null;
  wbs_node_id: string | null;
  total_cost: number | string | null;
  cost_date: string | null;
}

const dayMs = 86_400_000;

export function toNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function currency(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function ratio(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

export function percent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value.toFixed(1)}%`;
}

export function calculateEvmFromTasks(tasks: WbsTaskRecord[], nowMs = Date.now()): EvmMetrics | null {
  let bac = 0;
  let ev = 0;
  let pv = 0;
  let ac = 0;

  for (const task of tasks) {
    const budget = toNumber(task.budget_cost);
    const actual = toNumber(task.actual_cost);
    bac += budget;
    ev += budget * ((task.progress ?? 0) / 100);
    ac += actual;

    if (task.baseline_start_date && task.baseline_finish_date && budget > 0) {
      const start = new Date(task.baseline_start_date).getTime();
      const finish = new Date(task.baseline_finish_date).getTime();
      if (Number.isFinite(start) && Number.isFinite(finish)) {
        if (nowMs >= finish) {
          pv += budget;
        } else if (nowMs > start && finish > start) {
          pv += budget * ((nowMs - start) / (finish - start));
        }
      }
    }
  }

  if (bac <= 0) return null;
  return completeEvm({ bac, ev, pv, ac });
}

export function completeEvm(input: { bac: number; ev: number; pv: number; ac: number }): EvmMetrics {
  const { bac, ev, pv, ac } = input;
  const cpi = ac > 0 ? ev / ac : null;
  const spi = pv > 0 ? ev / pv : null;
  const cv = ev - ac;
  const sv = ev - pv;
  const eac = cpi && cpi > 0 ? bac / cpi : null;
  const vac = eac != null ? bac - eac : null;
  const remainingBudget = bac - ev;
  const remainingCost = bac - ac;
  const tcpi = remainingCost > 0 ? remainingBudget / remainingCost : null;
  return { bac, ev, pv, ac, cpi, spi, cv, sv, eac, vac, tcpi };
}

export async function getProjectCostAnalytics(projectId?: string): Promise<ProjectCostAnalytics[]> {
  const supabase = createClient();
  const [projectsRes, tasksRes, boqRes, txRes] = await Promise.all([
    supabase.from("projects").select("id, project_code, project_name, project_status, data_date").order("project_name"),
    (projectId
      ? supabase.from("wbs_tasks").select("*").eq("project_id", projectId)
      : supabase.from("wbs_tasks").select("*")),
    (projectId
      ? supabase.from("qs_boq_items").select("id, project_id, wbs_node_id, total_amount").eq("project_id", projectId)
      : supabase.from("qs_boq_items").select("id, project_id, wbs_node_id, total_amount")),
    (projectId
      ? supabase.from("qs_cost_transactions").select("id, project_id, boq_item_id, wbs_node_id, total_cost, cost_date").eq("project_id", projectId)
      : supabase.from("qs_cost_transactions").select("id, project_id, boq_item_id, wbs_node_id, total_cost, cost_date")),
  ]);

  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (boqRes.error) throw new Error(boqRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);

  const projects = ((projectsRes.data ?? []) as ProjectRow[])
    .filter((project) => !projectId || project.id === projectId);
  const tasks = (tasksRes.data ?? []) as WbsTaskRecord[];
  const boqItems = (boqRes.data ?? []) as BoqItemRow[];
  const transactions = (txRes.data ?? []) as CostTransactionRow[];

  return projects.map((project) => {
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const projectBoq = boqItems.filter((item) => item.project_id === project.id);
    const projectTx = transactions.filter((tx) => tx.project_id === project.id);
    const budget = projectBoq.reduce((sum, item) => sum + toNumber(item.total_amount), 0);
    const actual = projectTx.reduce((sum, tx) => sum + toNumber(tx.total_cost), 0);
    const taskBudget = projectTasks.reduce((sum, task) => sum + toNumber(task.budget_cost), 0);
    const weightedProgress = taskBudget > 0
      ? projectTasks.reduce((sum, task) => sum + toNumber(task.budget_cost) * ((task.progress ?? 0) / 100), 0) / taskBudget * 100
      : average(projectTasks.map((task) => task.progress ?? 0));

    // Anchor Planned Value on the project's schedule data date (falls back to
    // now if unset) so EVM reads as-of the same date Planning's progress
    // snapshots and IPC claims use — not today's wall-clock time.
    const dataDateMs = project.data_date ? new Date(project.data_date).getTime() : Date.now();
    const nowMs = Number.isFinite(dataDateMs) ? dataDateMs : Date.now();

    const taskEvm = calculateEvmFromTasks(projectTasks, nowMs);
    const evm = budget > 0
      ? completeEvm({
          bac: budget,
          ev: budget * (weightedProgress / 100),
          pv: taskEvm?.pv ?? getTimeLinearPlannedValue(projectTasks, budget, nowMs),
          ac: actual,
        })
      : taskEvm;

    return {
      projectId: project.id,
      projectCode: project.project_code,
      projectName: project.project_name,
      projectStatus: project.project_status ?? "active",
      budget,
      actual,
      progress: weightedProgress,
      tasks: projectTasks.length,
      delayedTasks: projectTasks.filter((task) => task.delay_status === "delayed" || task.delay_status === "blocked").length,
      evm,
    };
  });
}

export async function getCostSnapshots(projectId: string): Promise<ProgressSnapshotRow[]> {
  const { data, error } = await createClient()
    .from("progress_snapshots")
    .select("id, project_id, snapshot_date, planned_progress, actual_progress, planned_cost, actual_cost")
    .eq("project_id", projectId)
    .is("wbs_node_id", null)
    .order("snapshot_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as ProgressSnapshotRow[];
}

export async function getWbsNodeCostBreakdown(projectId: string, wbsNodeId: string) {
  const supabase = createClient();
  const [boqRes, txRes] = await Promise.all([
    supabase
      .from("qs_boq_items")
      .select("id, description, unit, quantity, unit_rate, total_amount, wbs_node_id, qs_boq_sections(title)")
      .eq("project_id", projectId)
      .eq("wbs_node_id", wbsNodeId)
      .order("seq"),
    supabase
      .from("qs_cost_transactions")
      .select("id, boq_item_id, wbs_node_id, transaction_type, cost_category, description, total_cost, cost_date, vendor_name, payment_status")
      .eq("project_id", projectId)
      .order("cost_date", { ascending: false }),
  ]);
  if (boqRes.error) throw new Error(boqRes.error.message);
  if (txRes.error) throw new Error(txRes.error.message);
  const boqIds = new Set((boqRes.data ?? []).map((item) => item.id));
  return {
    boqItems: boqRes.data ?? [],
    transactions: (txRes.data ?? []).filter((tx) => tx.wbs_node_id === wbsNodeId || (tx.boq_item_id && boqIds.has(tx.boq_item_id))),
  };
}

function getTimeLinearPlannedValue(tasks: WbsTaskRecord[], fallbackBudget: number, now = Date.now()): number {
  const baselined = tasks.filter((task) => task.baseline_start_date && task.baseline_finish_date);
  if (baselined.length === 0) return 0;
  let plannedWeight = 0;

  for (const task of baselined) {
    const start = new Date(task.baseline_start_date!).getTime();
    const finish = new Date(task.baseline_finish_date!).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(finish)) continue;
    if (now >= finish) plannedWeight += 1;
    else if (now > start && finish > start) plannedWeight += (now - start) / Math.max(dayMs, finish - start);
  }

  return fallbackBudget * (plannedWeight / baselined.length);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
