import { createClient } from "@/lib/supabase/client";
import { getProgressSnapshots, type ProgressSnapshotRow } from "@/lib/schedule-service";
import { getProjectCostAnalytics, type ProjectCostAnalytics } from "@/lib/evm-service";

export interface ControlRoomTask {
  id: string;
  task_code: string;
  task_name: string;
  status: string;
  progress: number;
  priority: string;
  discipline: string | null;
  owner_name: string | null;
  start_date: string | null;
  end_date: string | null;
  delay_status: string;
  updated_at: string;
}

export interface ControlRoomDocument {
  id: string;
  document_number: string;
  title: string;
  status: string;
  current_revision: number;
  created_at: string;
  updated_at: string;
}

export interface ControlRoomPr {
  id: string;
  pr_number: string;
  approval_status: string;
  priority: string;
  total_estimated_cost: number | null;
  updated_at: string;
  profiles?: { full_name: string }[] | null;
}

export interface ControlRoomPo {
  id: string;
  po_number: string;
  status: string;
  grand_total: number | null;
  delivery_date_expected: string | null;
  updated_at: string;
}

export interface ControlRoomClaim {
  id: string;
  claim_number: number;
  status: string;
  current_payment_due: number;
  submitted_at: string | null;
  period_end: string;
}

export interface ControlRoomData {
  tasks: ControlRoomTask[];
  documents: ControlRoomDocument[];
  prs: ControlRoomPr[];
  pos: ControlRoomPo[];
  claims: ControlRoomClaim[];
  snapshots: ProgressSnapshotRow[];
  costAnalytics: ProjectCostAnalytics | null;
}

export interface PortfolioKpis {
  preContractProjects: number;
  postContractProjects: number;
  totalTasks: number;
  totalDocuments: number;
  hseIncidents: number;
  pendingPRs: number;
  pendingPOs: number;
}

export async function getControlRoomData(projectId: string): Promise<ControlRoomData> {
  const supabase = createClient();

  const [tasksRes, docsRes, prsRes, posRes, claimsRes, snapshots, costAnalytics] = await Promise.all([
    supabase
      .from("wbs_tasks")
      .select(
        "id, task_code, task_name, status, progress, priority, discipline, owner_name, start_date, end_date, delay_status, updated_at"
      )
      .eq("project_id", projectId),
    supabase
      .from("documents")
      .select("id, document_number, title, status, current_revision, created_at, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false })
      .limit(200),
    supabase
      .from("procurement_prs")
      .select("id, pr_number, approval_status, priority, total_estimated_cost, updated_at, profiles!procurement_prs_requested_by_fkey(full_name)")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("procurement_pos")
      .select("id, po_number, status, grand_total, delivery_date_expected, updated_at")
      .eq("project_id", projectId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("qs_progress_claims")
      .select("id, claim_number, status, current_payment_due, submitted_at, period_end")
      .eq("project_id", projectId)
      .order("submitted_at", { ascending: false }),
    getProgressSnapshots(projectId).catch(() => [] as ProgressSnapshotRow[]),
    getProjectCostAnalytics(projectId)
      .then((rows) => rows.find((p) => p.projectId === projectId) ?? null)
      .catch(() => null as ProjectCostAnalytics | null),
  ]);

  if (tasksRes.error) throw new Error(tasksRes.error.message);
  if (docsRes.error) throw new Error(docsRes.error.message);
  if (prsRes.error) throw new Error(prsRes.error.message);
  if (posRes.error) throw new Error(posRes.error.message);
  if (claimsRes.error) throw new Error(claimsRes.error.message);

  return {
    tasks: (tasksRes.data ?? []) as ControlRoomTask[],
    documents: (docsRes.data ?? []) as ControlRoomDocument[],
    prs: (prsRes.data ?? []) as ControlRoomPr[],
    pos: (posRes.data ?? []) as ControlRoomPo[],
    claims: (claimsRes.data ?? []) as ControlRoomClaim[],
    snapshots,
    costAnalytics,
  };
}

export async function getPortfolioKpis(): Promise<PortfolioKpis> {
  const supabase = createClient();

  const [preRes, postRes, taskRes, docRes, hseRes, prRes, poRes] = await Promise.all([
    supabase.from("projects").select("id", { count: "exact", head: true }).eq("project_type", "tender"),
    supabase.from("projects").select("id", { count: "exact", head: true }).neq("project_type", "tender"),
    supabase.from("wbs_tasks").select("id"),
    supabase.from("documents").select("id"),
    supabase.from("hse_incidents").select("id", { count: "exact", head: true }),
    supabase.from("procurement_prs").select("approval_status"),
    supabase.from("procurement_pos").select("status"),
  ]);

  const prs = prRes.data ?? [];
  const pos = (poRes.data ?? []) as { status: string }[];

  return {
    preContractProjects: preRes.count ?? 0,
    postContractProjects: postRes.count ?? 0,
    totalTasks: (taskRes.data ?? []).length,
    totalDocuments: (docRes.data ?? []).length,
    hseIncidents: hseRes.count ?? 0,
    pendingPRs: prs.filter((p) => ["submitted", "under_budget_review"].includes((p as { approval_status: string }).approval_status)).length,
    pendingPOs: pos.filter((p) => p.status === "submitted" || p.status === "approved").length,
  };
}
