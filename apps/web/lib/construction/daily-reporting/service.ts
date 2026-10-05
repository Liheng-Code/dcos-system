// Module 10-01 Daily Reporting — client-side service.
// Reads go straight to Supabase and are filtered by row-level security.
// Every record write goes through /api/dr/*; nothing here inserts or updates a
// report table. Configuration (units, members, schedules, approvers) is
// written under RLS.

import { createClient } from "@/lib/supabase/client";
import type {
  CorrectionItem,
  CorrectionRequest,
  DailySummary,
  DelayType,
  DrEvidence,
  DrPayload,
  DrReport,
  DrReportVersion,
  EvidenceRef,
  FormContext,
  ReportKind,
  ReportingUnit,
  ReviewDecision,
  RuleResult,
} from "./types";

const EVIDENCE_BUCKET = "dr-evidence";

export class DrApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
    public results: RuleResult[] = [],
    public existingReportId?: string,
  ) {
    super(message);
  }
}

let apiAuthorization: string | null = null;

/**
 * Telegram Mini App only: there is no dashboard cookie inside Telegram, so the
 * gateway calls carry the Mini App session instead (`Bearer drm.…`).
 */
export function setApiAuthorization(value: string | null): void {
  apiAuthorization = value;
}

async function api<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;
  if (apiAuthorization) headers.Authorization = apiAuthorization;
  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new DrApiError(body.error ?? "Request failed", body.code ?? "DR_INTERNAL", res.status, body.results ?? [], body.existing_report_id);
  }
  return body as T;
}

export const newIdempotencyKey = () => crypto.randomUUID();

// ── Capabilities ────────────────────────────────────────────────────────────
export interface DrCapabilities {
  userId: string | null;
  canReview: boolean;
  canAdmin: boolean;
  isSystemAdmin: boolean;
}

export async function getCapabilities(projectId: string): Promise<DrCapabilities> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id ?? null;
  if (!userId) return { userId, canReview: false, canAdmin: false, isSystemAdmin: false };
  const [review, admin, sys] = await Promise.all([
    supabase.rpc("dr_can_review", { p_project_id: projectId, p_user: userId }),
    supabase.rpc("dr_can_admin", { p_project_id: projectId }),
    supabase.rpc("is_admin", { uid: userId }),
  ]);
  return { userId, canReview: review.data === true, canAdmin: admin.data === true, isSystemAdmin: sys.data === true };
}

// ── Units ───────────────────────────────────────────────────────────────────
export async function listUnits(projectId: string): Promise<ReportingUnit[]> {
  const { data, error } = await createClient()
    .from("dr_reporting_units")
    .select("*")
    .eq("project_id", projectId)
    .order("unit_code");
  if (error) throw new Error(error.message);
  return (data as ReportingUnit[]) ?? [];
}

/** Units the signed-in user may submit for. */
export async function listMyReportingUnits(projectId: string, userId: string): Promise<ReportingUnit[]> {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: memberships, error } = await supabase
    .from("dr_reporting_unit_members")
    .select("unit_id, valid_to")
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("member_role", "REPORTER")
    .lte("valid_from", today);
  if (error) throw new Error(error.message);
  const ids = (memberships ?? []).filter((m) => !m.valid_to || m.valid_to >= today).map((m) => m.unit_id as string);
  if (ids.length === 0) return [];
  const { data: units } = await supabase
    .from("dr_reporting_units")
    .select("*")
    .eq("project_id", projectId)
    .in("id", ids)
    .order("unit_code");
  return (units as ReportingUnit[]) ?? [];
}

export interface UnitMember {
  id: string;
  unit_id: string;
  user_id: string;
  member_role: "REPORTER" | "VIEWER";
  is_lead: boolean;
  valid_from: string;
  valid_to: string | null;
  status: "active" | "suspended" | "revoked";
  profile?: { full_name: string | null; email: string | null } | null;
}

export async function listUnitMembers(unitId: string): Promise<UnitMember[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("dr_reporting_unit_members").select("*").eq("unit_id", unitId);
  if (error) throw new Error(error.message);
  const members = (data as UnitMember[]) ?? [];
  if (members.length === 0) return members;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", members.map((m) => m.user_id));
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return members.map((m) => ({ ...m, profile: (byId.get(m.user_id) as UnitMember["profile"]) ?? null }));
}

export async function saveUnit(unit: Partial<ReportingUnit> & { project_id: string }): Promise<ReportingUnit> {
  const supabase = createClient();
  const { id, ...fields } = unit;
  const query = id
    ? supabase.from("dr_reporting_units").update(fields).eq("id", id)
    : supabase.from("dr_reporting_units").insert(fields);
  const { data, error } = await query.select("*").single();
  if (error) throw new Error(error.message);
  return data as ReportingUnit;
}

export async function addUnitMember(input: {
  unit_id: string;
  user_id: string;
  member_role: "REPORTER" | "VIEWER";
  is_lead: boolean;
  valid_to: string | null;
}): Promise<void> {
  const { error } = await createClient()
    .from("dr_reporting_unit_members")
    .upsert({ ...input, status: "active" }, { onConflict: "unit_id,user_id" });
  if (error) throw new Error(error.message);
}

export async function setUnitMemberStatus(memberId: string, status: UnitMember["status"]): Promise<void> {
  const { error } = await createClient().from("dr_reporting_unit_members").update({ status }).eq("id", memberId);
  if (error) throw new Error(error.message);
}

export async function getUnitScope(unitId: string): Promise<string[]> {
  const { data } = await createClient().from("dr_reporting_unit_wbs_scope").select("wbs_node_id").eq("unit_id", unitId);
  return (data ?? []).map((r) => r.wbs_node_id as string);
}

export async function setUnitScope(unitId: string, nodeIds: string[]): Promise<void> {
  const supabase = createClient();
  const { error: delError } = await supabase.from("dr_reporting_unit_wbs_scope").delete().eq("unit_id", unitId);
  if (delError) throw new Error(delError.message);
  if (nodeIds.length === 0) return;
  const { error } = await supabase
    .from("dr_reporting_unit_wbs_scope")
    .insert(nodeIds.map((wbs_node_id) => ({ unit_id: unitId, wbs_node_id })));
  if (error) throw new Error(error.message);
}

export interface WbsNodeOption {
  id: string;
  parent_id: string | null;
  wbs_code: string;
  wbs_name: string;
}

export async function listWbsNodes(projectId: string): Promise<WbsNodeOption[]> {
  const { data } = await createClient()
    .from("wbs_nodes")
    .select("id, parent_id, wbs_code, wbs_name")
    .eq("project_id", projectId)
    .order("wbs_code");
  return (data as WbsNodeOption[]) ?? [];
}

export interface ProfileOption {
  id: string;
  full_name: string | null;
  email: string | null;
}

export async function searchProfiles(term: string): Promise<ProfileOption[]> {
  const q = term.trim();
  if (q.length < 2) return [];
  const { data } = await createClient()
    .from("profiles")
    .select("id, full_name, email")
    .or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,email.ilike.%${q.replace(/[%,()]/g, "")}%`)
    .limit(10);
  return (data as ProfileOption[]) ?? [];
}

export interface SubcontractOption {
  id: string;
  subcontract_no: string;
  scope_of_work: string | null;
}

export async function listSubcontracts(projectId: string): Promise<SubcontractOption[]> {
  const { data } = await createClient()
    .from("subcontracts")
    .select("id, subcontract_no, scope_of_work")
    .eq("project_id", projectId)
    .order("subcontract_no");
  return (data as SubcontractOption[]) ?? [];
}

// ── Schedule and approvers ──────────────────────────────────────────────────
export interface ReportingSchedule {
  id?: string;
  project_id: string;
  name: string;
  deadline_time: string;
  reminder_time: string;
  late_window_hours: number;
  working_days: number[];
  timezone: string | null;
}

export async function getProjectSchedule(projectId: string): Promise<ReportingSchedule | null> {
  const { data } = await createClient()
    .from("dr_reporting_schedules")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return (data as ReportingSchedule | null) ?? null;
}

export async function saveProjectSchedule(schedule: ReportingSchedule): Promise<void> {
  const supabase = createClient();
  const { id, ...fields } = schedule;
  const { error } = id
    ? await supabase.from("dr_reporting_schedules").update(fields).eq("id", id)
    : await supabase.from("dr_reporting_schedules").insert(fields);
  if (error) throw new Error(error.message);
}

export interface ProjectApprover {
  id: string;
  project_id: string;
  user_id: string;
  approver_role: "PRIMARY" | "ALTERNATE";
  valid_from: string;
  valid_to: string | null;
  profile?: { full_name: string | null; email: string | null } | null;
}

export async function listApprovers(projectId: string): Promise<ProjectApprover[]> {
  const supabase = createClient();
  const { data } = await supabase.from("dr_project_approvers").select("*").eq("project_id", projectId);
  const rows = (data as ProjectApprover[]) ?? [];
  if (rows.length === 0) return rows;
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", rows.map((r) => r.user_id));
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  return rows.map((r) => ({ ...r, profile: (byId.get(r.user_id) as ProjectApprover["profile"]) ?? null }));
}

export async function addApprover(input: {
  project_id: string;
  user_id: string;
  approver_role: "PRIMARY" | "ALTERNATE";
  valid_from: string;
  valid_to: string | null;
}): Promise<void> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("dr_project_approvers")
    .upsert({ ...input, set_by: auth.user?.id ?? null }, { onConflict: "project_id,user_id,approver_role" });
  if (error) throw new Error(error.message);
}

export async function removeApprover(id: string): Promise<void> {
  const { error } = await createClient().from("dr_project_approvers").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setProjectDrEnabled(projectId: string, enabled: boolean): Promise<void> {
  const { error } = await createClient().from("projects").update({ dr_enabled: enabled }).eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function getProjectDrEnabled(projectId: string): Promise<boolean> {
  const { data } = await createClient().from("projects").select("dr_enabled").eq("id", projectId).maybeSingle();
  return data?.dr_enabled === true;
}

// ── Reports ─────────────────────────────────────────────────────────────────
export interface ReportFilter {
  unitIds?: string[];
  from?: string;
  to?: string;
  /** Reports waiting for a reviewer's decision. */
  inbox?: boolean;
}

export async function listReports(projectId: string, filter: ReportFilter = {}): Promise<DrReport[]> {
  let q = createClient()
    .from("dr_reports")
    .select("*, unit:dr_reporting_units(unit_code, display_name, unit_type)")
    .eq("project_id", projectId);
  if (filter.unitIds) q = q.in("unit_id", filter.unitIds);
  if (filter.from) q = q.gte("report_date", filter.from);
  if (filter.to) q = q.lte("report_date", filter.to);
  if (filter.inbox) {
    q = q.eq("submission_state", "SUBMITTED").in("review_state", ["AWAITING_REVIEW", "IN_REVIEW", "AMENDMENT_PENDING"]);
  }
  const { data, error } = await q.order("report_date", { ascending: false }).order("first_submitted_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  const reports = (data as DrReport[]) ?? [];
  // Exception-first: flagged reports lead the review inbox.
  if (filter.inbox) reports.sort((a, b) => Number(b.warning_count > 0) - Number(a.warning_count > 0));
  return reports;
}

export interface ReviewDecisionRow {
  id: string;
  version_id: string;
  reviewer_id: string | null;
  decision: ReviewDecision;
  comment: string | null;
  decided_at: string;
}

export interface VerifiedQuantityRow {
  version_id: string;
  line_id: string;
  reported_qty: number | null;
  verified_qty: number;
  remark: string;
}

export interface ReportDetail {
  report: DrReport;
  versions: DrReportVersion[];
  evidence: DrEvidence[];
  corrections: CorrectionRequest[];
  /** Reviewer-only; empty for the reporting unit. */
  ruleResults: (RuleResult & { version_id: string })[];
  decisions: ReviewDecisionRow[];
  verified: VerifiedQuantityRow[];
  taskNames: Record<string, { task_code: string; task_name: string }>;
  people: Record<string, string>;
  /** The signed-in user is an active reporter of this report's unit. */
  isReporter: boolean;
}

export async function getReportDetail(reportId: string): Promise<ReportDetail | null> {
  const supabase = createClient();
  const { data: report } = await supabase
    .from("dr_reports")
    .select("*, unit:dr_reporting_units(unit_code, display_name, unit_type)")
    .eq("id", reportId)
    .maybeSingle();
  if (!report) return null;

  const { data: auth } = await supabase.auth.getUser();
  const today = new Date().toISOString().slice(0, 10);
  const [versions, evidence, corrections, rules, decisions, verified, membership] = await Promise.all([
    supabase.from("dr_report_versions").select("*").eq("report_id", reportId).order("version_no", { ascending: false }),
    supabase.from("dr_evidence").select("*").eq("report_id", reportId),
    supabase.from("dr_correction_requests").select("*, items:dr_correction_items(*)").eq("report_id", reportId).order("sent_at", { ascending: false }),
    supabase.from("dr_rule_results").select("*").eq("report_id", reportId),
    supabase.from("dr_review_decisions").select("*").eq("report_id", reportId).order("decided_at", { ascending: false }),
    supabase.from("dr_verified_quantities").select("*").eq("report_id", reportId),
    supabase
      .from("dr_reporting_unit_members")
      .select("valid_from, valid_to")
      .eq("unit_id", report.unit_id)
      .eq("user_id", auth.user?.id ?? "00000000-0000-0000-0000-000000000000")
      .eq("status", "active")
      .eq("member_role", "REPORTER"),
  ]);

  const versionRows = (versions.data as DrReportVersion[]) ?? [];
  const taskIds = new Set<string>();
  const personIds = new Set<string>();
  for (const v of versionRows) {
    if (v.submitted_by) personIds.add(v.submitted_by);
    for (const a of v.payload.activities ?? []) if (a.task_id) taskIds.add(a.task_id);
    for (const n of v.payload.next_day ?? []) if (n.task_id) taskIds.add(n.task_id);
    for (const d of v.payload.delays ?? []) if (d.task_id) taskIds.add(d.task_id);
  }
  for (const d of (decisions.data as ReviewDecisionRow[]) ?? []) if (d.reviewer_id) personIds.add(d.reviewer_id);

  const [tasks, profiles] = await Promise.all([
    taskIds.size
      ? supabase.from("wbs_tasks").select("id, task_code, task_name").in("id", [...taskIds])
      : Promise.resolve({ data: [] as { id: string; task_code: string; task_name: string }[] }),
    personIds.size
      ? supabase.from("profiles").select("id, full_name, email").in("id", [...personIds])
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  return {
    report: report as DrReport,
    versions: versionRows,
    evidence: (evidence.data as DrEvidence[]) ?? [],
    corrections: (corrections.data as CorrectionRequest[]) ?? [],
    ruleResults: (rules.data as ReportDetail["ruleResults"]) ?? [],
    decisions: (decisions.data as ReviewDecisionRow[]) ?? [],
    verified: (verified.data as VerifiedQuantityRow[]) ?? [],
    taskNames: Object.fromEntries((tasks.data ?? []).map((t) => [t.id, { task_code: t.task_code, task_name: t.task_name }])),
    people: Object.fromEntries((profiles.data ?? []).map((p) => [p.id, p.full_name ?? p.email ?? "Unknown"])),
    isReporter: (membership.data ?? []).some((m) => m.valid_from <= today && (!m.valid_to || m.valid_to >= today)),
  };
}

// ── Gateway calls ───────────────────────────────────────────────────────────
export const fetchFormContext = (unitId: string, date: string) =>
  api<FormContext>(`/api/dr/forms/${unitId}?date=${date}`, { method: "GET" });

export const saveDraft = (unitId: string, date: string, payload: DrPayload) =>
  api<{ saved: boolean }>("/api/dr/drafts", {
    method: "PUT",
    body: JSON.stringify({ unit_id: unitId, report_date: date, payload }),
  });

export interface Receipt {
  receipt: { report_id: string; report_no: string; version_no: number; replayed: boolean; late?: boolean };
  warnings: RuleResult[];
}

interface SubmissionBody {
  payload: DrPayload;
  evidence: EvidenceRef[];
  reason?: string | null;
  report_kind?: ReportKind;
}

export const submitReport = (unitId: string, date: string, body: SubmissionBody, idempotencyKey: string) =>
  api<Receipt>(`/api/dr/reports?unit=${unitId}&date=${date}`, {
    method: "POST",
    idempotencyKey,
    body: JSON.stringify({ ...body, client_created_at: new Date().toISOString() }),
  });

export const resubmitReport = (reportId: string, body: SubmissionBody, idempotencyKey: string) =>
  api<Receipt>(`/api/dr/reports/${reportId}/versions`, { method: "POST", idempotencyKey, body: JSON.stringify(body) });

export const amendReport = (reportId: string, body: SubmissionBody, idempotencyKey: string) =>
  api<Receipt>(`/api/dr/reports/${reportId}/amend`, { method: "POST", idempotencyKey, body: JSON.stringify(body) });

export const withdrawReport = (reportId: string) =>
  api<{ withdrawn: boolean }>(`/api/dr/reports/${reportId}/withdraw`, { method: "POST" });

export const answerInfoRequest = (reportId: string, response: string) =>
  api<{ answered: boolean }>(`/api/dr/reports/${reportId}/info`, { method: "POST", body: JSON.stringify({ response }) });

export const openReview = (reportId: string) => api<{ opened: boolean }>(`/api/dr/review/${reportId}`, { method: "PATCH" });

export interface DecisionInput {
  version_no: number;
  decision: ReviewDecision;
  comment?: string | null;
  verified?: { line_id: string; verified_qty: number; remark: string }[];
  correction_items?: CorrectionItem[];
  delay_classes?: { line_id: string; delay_type: DelayType }[];
}

export const decideReview = (reportId: string, input: DecisionInput) =>
  api<{ decision_id: string; planning_sync: { activities_synced?: number; errors?: number; delays_logged?: number } }>(
    `/api/dr/review/${reportId}`,
    { method: "POST", body: JSON.stringify(input) },
  );

// ── Telegram group bindings ─────────────────────────────────────────────────
export type TelegramBindingStatus = "Pending" | "Active" | "Migrated" | "Suspended" | "Unbound";

export interface TelegramBinding {
  id: string;
  unit_id: string;
  chat_title: string | null;
  chat_type: string | null;
  migrated_from_chat_id: number | null;
  bot_present: boolean;
  status: TelegramBindingStatus;
  valid_from: string | null;
  created_at: string;
}

/** Current bindings of a project (history rows are left out). */
export async function listTelegramBindings(projectId: string): Promise<TelegramBinding[]> {
  const { data, error } = await createClient()
    .from("dr_telegram_bindings")
    .select("id, unit_id, chat_title, chat_type, migrated_from_chat_id, bot_present, status, valid_from, created_at")
    .eq("project_id", projectId)
    .in("status", ["Pending", "Active", "Suspended"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TelegramBinding[];
}

export interface NewTelegramBinding {
  binding_id: string;
  code: string;
  command: string;
  expires_at: string;
}

export const startTelegramBinding = (unitId: string) =>
  api<NewTelegramBinding>("/api/dr/telegram/bindings", { method: "POST", body: JSON.stringify({ unit_id: unitId }) });

export const telegramBindingAction = (bindingId: string, action: "confirm_migration" | "unbind" | "reissue_launch") =>
  api<{ launch_posted?: boolean }>(`/api/dr/telegram/bindings/${bindingId}`, { method: "PATCH", body: JSON.stringify({ action }) });

/** Whether the signed-in user has a Telegram account linked (the link is shared by every DCOS bot). */
export async function isTelegramLinked(userId: string): Promise<boolean> {
  const { data, error } = await createClient().from("profiles").select("telegram_user_id").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return !!data?.telegram_user_id;
}

/** A 6-digit, 10-minute code for the signed-in user to send to the bot as `/link <code>`. */
export async function requestTelegramLinkCode(): Promise<{ code: string; expires_at: string }> {
  const res = await fetch("/api/hr/attendance/telegram/link-code", { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Could not create a link code");
  return { code: body.code, expires_at: body.expires_at };
}

// ── Evidence ────────────────────────────────────────────────────────────────
/** Uploads one file to the unit's evidence area and returns its storage key. */
export async function uploadEvidence(unitId: string, date: string, file: File): Promise<string> {
  const { storage_key, token } = await api<{ storage_key: string; token: string }>("/api/dr/evidence/upload-url", {
    method: "POST",
    body: JSON.stringify({ unit_id: unitId, report_date: date, mime_type: file.type }),
  });
  const { error } = await createClient().storage.from(EVIDENCE_BUCKET).uploadToSignedUrl(storage_key, token, file, { contentType: file.type });
  if (error) throw new Error(error.message);
  return storage_key;
}

export const evidenceUrls = (evidenceIds: string[]) =>
  api<{ urls: Record<string, string> }>("/api/dr/evidence/view", { method: "POST", body: JSON.stringify({ evidence_ids: evidenceIds }) }).then(
    (r) => r.urls,
  );

// ── Summary ─────────────────────────────────────────────────────────────────
export async function getSummaries(projectId: string, date: string): Promise<DailySummary[]> {
  const { data, error } = await createClient()
    .from("dr_project_daily_summaries")
    .select("*")
    .eq("project_id", projectId)
    .eq("summary_date", date)
    .order("revision_no", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as DailySummary[]) ?? [];
}

export const publishSummary = (projectId: string, date: string, narrative: string | null) =>
  api<{ summary_id: string; revision_no: number }>("/api/dr/summaries/publish", {
    method: "POST",
    body: JSON.stringify({ project_id: projectId, date, narrative }),
  });

// ── Offline sync conflicts (Phase 1B) ───────────────────────────────────────
export interface SyncConflict {
  id: string;
  unit_id: string;
  report_date: string;
  kind: "CONFLICT" | "QUARANTINE";
  existing_report_id: string | null;
  incoming: { payload: DrPayload; report_kind: ReportKind; client_created_at: string; expected_evidence: number; review_flags: string[] };
  error: string | null;
  status: string;
  detected_at: string;
  unit?: { unit_code: string; display_name: string } | null;
}

export async function listSyncConflicts(projectId: string): Promise<SyncConflict[]> {
  const { data, error } = await createClient()
    .from("dr_sync_conflicts")
    .select("*, unit:dr_reporting_units(unit_code, display_name)")
    .eq("project_id", projectId)
    .eq("status", "Open")
    .order("detected_at");
  if (error) throw new Error(error.message);
  return (data as SyncConflict[]) ?? [];
}

export const resolveSyncConflict = (conflictId: string, resolution: "KEEP_EXISTING" | "KEEP_BOTH" | "DISCARD", note: string | null) =>
  api<{ status: string }>(`/api/dr/sync/conflicts/${conflictId}/resolve`, { method: "POST", body: JSON.stringify({ resolution, note }) });

// ── Missing reports ─────────────────────────────────────────────────────────
export interface MissingReport {
  id: string;
  unit_id: string;
  report_date: string;
  detected_at: string;
  status: "Open" | "Late Submitted" | "Excused" | "Closed";
  escalation_level: number;
  excuse_reason: string | null;
  linked_report_id: string | null;
  unit?: { unit_code: string; display_name: string } | null;
}

export async function listMissingReports(projectId: string, from: string): Promise<MissingReport[]> {
  const { data, error } = await createClient()
    .from("dr_missing_reports")
    .select("*, unit:dr_reporting_units(unit_code, display_name)")
    .eq("project_id", projectId)
    .gte("report_date", from)
    .order("report_date", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as MissingReport[]) ?? [];
}

export const excuseMissing = (missingId: string, reason: string) =>
  api<{ excused: boolean }>(`/api/dr/missing/${missingId}/excuse`, { method: "POST", body: JSON.stringify({ reason }) });
