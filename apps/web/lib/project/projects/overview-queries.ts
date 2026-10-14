// Read model for a project's Overview and its commercial tabs: open dated items across modules,
// the setup facts behind the activation checklist, and variation / progress-claim figures.
// Read-only and cross-module, like lib/dashboard; each module still owns writes to its tables.

import { createClient } from "@/lib/supabase/client";
import { rfiHref, type AttentionItem } from "@/lib/project/projects/attention";
import type { SetupFacts } from "@/lib/project/projects/setup-checklist";
import type { ClaimRow, VariationRow } from "@/lib/project/projects/commercial-summary";
import { countBy, type TenderSignalInput } from "@/lib/project/projects/list-signals";

const db = () => createClient();

// Statuses that still need someone to act, per table (from each table's status check constraint).
const OPEN = {
  tasks: ["open", "assigned", "in_progress", "paused", "blocked", "review", "submitted"],
  rfis: ["open"],
  technicalQueries: ["open"],
  coordination: ["open", "in_progress"],
  ncrs: ["open", "corrective_action", "reinspection"],
  inspections: ["submitted", "scheduled"],
  submittals: ["submitted", "under_review"],
  documents: ["submitted", "under_review"],
  permits: ["approved", "active"],
};

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (v == null || v === "" ? null : String(v));

/** Open items with a due date for one project. A module whose query fails is left out. */
export async function loadAttentionItems(projectId: string): Promise<AttentionItem[]> {
  const q = (table: string, columns: string, dateColumn: string, statusColumn: string, statuses: string[]) =>
    db().from(table).select(columns).eq("project_id", projectId).in(statusColumn, statuses)
      .not(dateColumn, "is", null).order(dateColumn, { ascending: true }).limit(200);

  const [tasks, rfis, tqs, coord, ncrs, irs, subs, docs, permits] = await Promise.all([
    q("wbs_tasks", "id, task_code, task_name, end_date", "end_date", "status", OPEN.tasks),
    q("design_rfi", "id, rfi_no, title, due_date, discipline", "due_date", "status", OPEN.rfis),
    q("design_str_technical_queries", "id, tq_no, title, due_date", "due_date", "status", OPEN.technicalQueries),
    q("design_coordination_log", "id, subject, due_date", "due_date", "status", OPEN.coordination),
    q("ncrs", "id, ncr_number, description, due_date", "due_date", "status", OPEN.ncrs),
    q("inspection_requests", "id, ir_number, location, inspection_date", "inspection_date", "status", OPEN.inspections),
    q("submittal_packages", "id, submittal_number, title, consultant_due_date", "consultant_due_date", "consultant_status", OPEN.submittals),
    q("documents", "id, document_number, title, consultant_due_date", "consultant_due_date", "status", OPEN.documents),
    q("hse_permits", "id, permit_number, title, end_date", "end_date", "status", OPEN.permits),
  ]);

  const rows = (res: { data: unknown }) => (res.data ?? []) as Row[];
  const items: AttentionItem[] = [];
  const push = (source: AttentionItem["source"], r: Row, ref: unknown, title: unknown, due: unknown, href?: string) =>
    items.push({ source, id: String(r.id), ref: str(ref), title: str(title) ?? "Untitled", due: String(due), href });

  for (const r of rows(tasks)) push("tasks", r, r.task_code, r.task_name, r.end_date);
  for (const r of rows(rfis)) push("rfis", r, r.rfi_no, r.title, r.due_date, rfiHref(str(r.discipline)));
  for (const r of rows(tqs)) push("technical_queries", r, r.tq_no, r.title, r.due_date);
  for (const r of rows(coord)) push("coordination", r, null, r.subject, r.due_date);
  for (const r of rows(ncrs)) push("ncrs", r, r.ncr_number, r.description, r.due_date);
  for (const r of rows(irs)) push("inspections", r, r.ir_number, r.location ?? "Inspection", r.inspection_date);
  for (const r of rows(subs)) push("submittals", r, r.submittal_number, r.title, r.consultant_due_date);
  for (const r of rows(docs)) push("documents", r, r.document_number, r.title, r.consultant_due_date);
  for (const r of rows(permits)) push("permits", r, r.permit_number, r.title, r.end_date);
  return items;
}

/** Counts and rows behind the activation checklist (the project's own fields come from the project). */
export async function loadSetupFacts(projectId: string): Promise<Omit<SetupFacts, "category" | "clientId" | "projectManagerId">> {
  const [stakeholders, teams, calendar, numbering, wbs] = await Promise.all([
    db().from("project_stakeholders").select("id", { count: "exact", head: true }).eq("project_id", projectId),
    db().from("project_stakeholder_teams").select("id").eq("project_id", projectId),
    db().from("project_calendars").select("working_days").eq("project_id", projectId).maybeSingle(),
    db().from("project_numbering_rules").select("format_mask").eq("project_id", projectId).maybeSingle(),
    db().from("project_wbs_setups").select("setup_method").eq("project_id", projectId).maybeSingle(),
  ]);
  const teamIds = ((teams.data ?? []) as { id: string }[]).map((t) => t.id);
  const members = teamIds.length
    ? await db().from("project_team_members").select("id", { count: "exact", head: true }).in("project_stakeholder_team_id", teamIds)
    : { count: 0 };
  return {
    stakeholderCount: stakeholders.count ?? 0,
    teamMemberCount: members.count ?? 0,
    hasCalendar: !!(calendar.data as { working_days?: string } | null)?.working_days,
    hasNumbering: !!(numbering.data as { format_mask?: string } | null)?.format_mask,
    hasWbsSetup: !!(wbs.data as { setup_method?: string } | null)?.setup_method,
  };
}

export async function listProjectVariations(projectId: string): Promise<VariationRow[]> {
  const { data } = await db()
    .from("qs_variation_orders")
    .select("id, vo_number, title, status, total_amount, submitted_at, approved_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as VariationRow[];
}

export async function listProjectClaims(projectId: string): Promise<ClaimRow[]> {
  const { data } = await db()
    .from("qs_progress_claims")
    .select("id, claim_number, status, period_start, period_end, current_payment_due, certified_amount, certified_at, paid_at")
    .eq("project_id", projectId)
    .order("period_end", { ascending: false, nullsFirst: false })
    .order("claim_number", { ascending: false });
  return (data ?? []) as ClaimRow[];
}

/** For the Projects table: each tender's stage and deadline, and overdue open tasks per project. Two queries for the whole list. */
export async function loadListSignalInputs(today: string): Promise<{
  tenders: Record<string, TenderSignalInput>;
  overdueTasks: Record<string, number>;
}> {
  const [pc, overdue] = await Promise.all([
    db().from("project_precontract_details").select("project_id, tender_stage, submission_deadline"),
    db().from("wbs_tasks").select("project_id").in("status", OPEN.tasks).lt("end_date", today).not("project_id", "is", null),
  ]);
  const tenders: Record<string, TenderSignalInput> = {};
  for (const r of (pc.data ?? []) as (TenderSignalInput & { project_id: string })[]) {
    tenders[r.project_id] = { tender_stage: r.tender_stage, submission_deadline: r.submission_deadline };
  }
  return { tenders, overdueTasks: countBy((overdue.data ?? []) as { project_id: string }[]) };
}
