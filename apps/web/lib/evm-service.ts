import { createClient } from "@/lib/supabase/client";
import { type WbsTaskRecord } from "@/components/project/wbs/wbs-types";
import { type ProgressSnapshotRow } from "@/lib/planning/schedule-service";
import { evmFrom, scurveMetrics, scurveTrusted } from "@/lib/project-scurve";
import { getProjectScurve } from "@/lib/project-scurve-service";

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
  /** BAC when the project has a trusted baseline, else the BOQ total. */
  budget: number;
  boqTotal: number;
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

/** The shared EVM formulas (lib/project-scurve.ts), so every screen computes CPI, SPI, EAC... the same way. */
export function completeEvm(input: { bac: number; ev: number; pv: number; ac: number }): EvmMetrics {
  const { etc: _etc, ...m } = evmFrom(input);
  void _etc;
  return m;
}

/**
 * Cost and EVM per project, from the project S-curve RPC (doc 33): BAC and PV from the active baseline's frozen cost
 * spread over working days, EV from budget x progress, AC from QS cost records other than purchase orders, all at
 * the project's data date. `budget` stays the BOQ total and `actual` the actual cost.
 */
export async function getProjectCostAnalytics(projectId?: string): Promise<ProjectCostAnalytics[]> {
  const supabase = createClient();
  const [projectsRes, tasksRes] = await Promise.all([
    supabase.from("projects").select("id, project_code, project_name, project_status, data_date").order("project_name"),
    (projectId
      ? supabase.from("wbs_tasks").select("project_id, delay_status").eq("project_id", projectId)
      : supabase.from("wbs_tasks").select("project_id, delay_status")),
  ]);
  if (projectsRes.error) throw new Error(projectsRes.error.message);
  if (tasksRes.error) throw new Error(tasksRes.error.message);

  const projects = ((projectsRes.data ?? []) as ProjectRow[])
    .filter((project) => !projectId || project.id === projectId);
  const tasks = (tasksRes.data ?? []) as { project_id: string; delay_status: string | null }[];
  // one failing project must not empty the portfolio screens
  const curves = await Promise.allSettled(projects.map((p) => getProjectScurve(supabase, p.id, "month")));

  return projects.map((project, i) => {
    const res = curves[i];
    const projectTasks = tasks.filter((task) => task.project_id === project.id);
    const base = {
      projectId: project.id,
      projectCode: project.project_code,
      projectName: project.project_name,
      projectStatus: project.project_status ?? "active",
      tasks: projectTasks.length,
      delayedTasks: projectTasks.filter((task) => task.delay_status === "delayed" || task.delay_status === "blocked").length,
    };
    if (res.status === "rejected") return { ...base, budget: 0, boqTotal: 0, actual: 0, progress: 0, evm: null };
    const curve = res.value;
    const m = scurveMetrics(curve);
    const budgetTotal = toNumber(curve.meta.budget_total);
    const boqTotal = toNumber(curve.meta.boq_total);
    // EVM only when PV, EV and BAC share one basis (the baseline carries the whole budget)
    const trusted = m.bac > 0 && scurveTrusted(curve);
    const evTotal = toNumber(curve.at_data_date.ev_total ?? curve.at_data_date.ev);
    return {
      ...base,
      budget: trusted ? m.bac : boqTotal,
      boqTotal,
      actual: m.ac,
      progress: budgetTotal > 0 ? (evTotal / budgetTotal) * 100 : 0,
      evm: trusted ? completeEvm({ bac: m.bac, ev: m.ev, pv: m.pv, ac: m.ac }) : null,
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
