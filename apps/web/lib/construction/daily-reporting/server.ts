// Module 10-01 Daily Reporting — server-side gateway helpers for app/api/dr/*.
// Server-only: uses the service-role client. Every record write goes through
// the dr_* database functions, which are executable by the service role only;
// these helpers authenticate the caller and pass them on as p_actor.

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { sendMessage } from "@/lib/hr/telegram/bot";
import { sendEmail } from "@/lib/email/resend";
import { evaluateRules, resolveRules } from "./rules";
import { scanBuffer, scanRequired } from "./scanner";
import type {
  CorrectionRequest,
  DrEvidence,
  DrPayload,
  DrReport,
  EvidenceRef,
  FormActivity,
  FormContext,
  ReportKind,
  ReportingUnit,
  RuleDefinition,
  RuleResult,
} from "./types";

export const EVIDENCE_BUCKET = "dr-evidence";
const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

export interface Actor {
  userId: string;
  admin: SupabaseClient;
}

/** Authenticates the session user. Returns a 401 response when there is none. */
export async function requireActor(): Promise<Actor | NextResponse> {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  return { userId: user.id, admin: createAdminClient() };
}

const STATUS_BY_CODE: Record<string, number> = {
  DR_FORBIDDEN: 403,
  DR_INV_UNIT: 403,
  DR_NOT_FOUND: 404,
  DR_DUP_REPORT: 409,
  DR_STALE: 409,
  DR_STATE: 409,
  DR_NO_CHANGE: 409,
  DR_SOD: 403,
};

/** Maps a 'DR_<CODE>: message' database error to an HTTP response. */
export function drErrorResponse(error: { message: string; details?: string | null } | Error): NextResponse {
  const message = error.message ?? String(error);
  const match = /^(DR_[A-Z_]+):\s*([\s\S]*)$/.exec(message);
  if (match) {
    return NextResponse.json(
      { error: match[2], code: match[1], detail: "details" in error ? error.details ?? null : null },
      { status: STATUS_BY_CODE[match[1]] ?? 422 },
    );
  }
  // Table constraints (e.g. progress above 100) are the last line of defence.
  if (/violates check constraint/.test(message)) {
    return NextResponse.json({ error: "The report contains a value outside its allowed range.", code: "DR_CONSTRAINT" }, { status: 422 });
  }
  console.error("daily-reporting:", message);
  return NextResponse.json({ error: "Unexpected error", code: "DR_INTERNAL" }, { status: 500 });
}

export function localDate(timezone: string, at: Date = new Date()): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

function zonedOffsetMs(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asUtc - at.getTime();
}

/** The instant at which `date` `time` occurs in `timezone`. */
export function zonedInstant(date: string, time: string, timezone: string): Date {
  const naive = new Date(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  return new Date(naive.getTime() - zonedOffsetMs(timezone, naive));
}

export async function isUnitMember(admin: SupabaseClient, unitId: string, userId: string, reporterOnly = false): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  let q = admin
    .from("dr_reporting_unit_members")
    .select("id, valid_to")
    .eq("unit_id", unitId)
    .eq("user_id", userId)
    .eq("status", "active")
    .lte("valid_from", today);
  if (reporterOnly) q = q.eq("member_role", "REPORTER");
  const { data } = await q;
  return (data ?? []).some((m) => !m.valid_to || (m.valid_to as string) >= today);
}

export async function canReview(admin: SupabaseClient, projectId: string, userId: string): Promise<boolean> {
  const { data } = await admin.rpc("dr_can_review", { p_project_id: projectId, p_user: userId });
  return data === true;
}

/** Descendants (inclusive) of the unit's scope nodes; null = whole project. */
async function scopeNodeIds(admin: SupabaseClient, unit: ReportingUnit): Promise<Set<string> | null> {
  const { data: scope } = await admin.from("dr_reporting_unit_wbs_scope").select("wbs_node_id").eq("unit_id", unit.id);
  if (!scope || scope.length === 0) return null;
  const { data: nodes } = await admin.from("wbs_nodes").select("id, parent_id").eq("project_id", unit.project_id);
  const children = new Map<string, string[]>();
  for (const n of nodes ?? []) {
    if (!n.parent_id) continue;
    const list = children.get(n.parent_id as string) ?? [];
    list.push(n.id as string);
    children.set(n.parent_id as string, list);
  }
  const out = new Set<string>();
  const stack = scope.map((s) => s.wbs_node_id as string);
  while (stack.length) {
    const id = stack.pop() as string;
    if (out.has(id)) continue;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

interface PlanningRow {
  task_id: string;
  task_code: string;
  task_name: string;
  discipline: string | null;
  current_progress: number;
  start_date: string | null;
  end_date: string | null;
  quantity_unit: string | null;
  suggested_trade: string | null;
  steps_json: { id: string; step_no: number; step_name: string; weight: number; progress: number }[] | null;
}

/**
 * Everything the form needs for one unit and date. Access: an active member of
 * the unit, or a project approver. Returns null when the caller has neither.
 */
export async function loadFormContext(
  actor: Actor,
  unitId: string,
  reportDate: string,
  /** Offline sync only: build the context even if the user has since lost access, so the rules can still run. */
  opts: { skipAccessCheck?: boolean } = {},
): Promise<FormContext | null> {
  const { admin, userId } = actor;

  const { data: unitRow } = await admin.from("dr_reporting_units").select("*").eq("id", unitId).maybeSingle();
  if (!unitRow) return null;
  const unit = unitRow as ReportingUnit;

  if (
    !opts.skipAccessCheck &&
    !(await isUnitMember(admin, unitId, userId)) &&
    !(await canReview(admin, unit.project_id, userId))
  ) {
    return null;
  }

  const [scheduleRes, planningRes, taskNodesRes, rulesRes, scope, existingRes, draftRes] = await Promise.all([
    admin.rpc("dr_unit_schedule", { p_unit_id: unitId }),
    admin.rpc("get_daily_report_planning_context", { p_project_id: unit.project_id, p_date: reportDate }),
    admin.from("wbs_tasks").select("id, wbs_node_id").eq("project_id", unit.project_id),
    admin.from("dr_rule_definitions").select("*").or(`project_id.is.null,project_id.eq.${unit.project_id}`),
    scopeNodeIds(admin, unit),
    admin.from("dr_reports").select("*").eq("unit_id", unitId).eq("report_date", reportDate).maybeSingle(),
    admin.from("dr_drafts").select("payload").eq("unit_id", unitId).eq("report_date", reportDate).maybeSingle(),
  ]);

  const schedule = (scheduleRes.data as FormContext["schedule"][] | null)?.[0] ?? {
    deadline_time: "18:00:00", reminder_time: "16:00:00", late_window_hours: 15, timezone: "Asia/Phnom_Penh",
  };

  const nodeOfTask = new Map((taskNodesRes.data ?? []).map((t) => [t.id as string, (t.wbs_node_id as string) ?? null]));
  const activities: FormActivity[] = ((planningRes.data as PlanningRow[] | null) ?? [])
    .filter((r) => scope === null || scope.has(nodeOfTask.get(r.task_id) ?? ""))
    .map((r) => ({
      task_id: r.task_id,
      task_code: r.task_code,
      task_name: r.task_name,
      wbs_node_id: nodeOfTask.get(r.task_id) ?? null,
      discipline: r.discipline,
      current_progress: Number(r.current_progress ?? 0),
      start_date: r.start_date,
      end_date: r.end_date,
      quantity_unit: r.quantity_unit,
      suggested_trade: r.suggested_trade,
      steps: r.steps_json ?? [],
      planned_today: !!r.start_date && !!r.end_date && r.start_date <= reportDate && r.end_date >= reportDate,
    }));

  const existing = (existingRes.data as DrReport | null) ?? null;
  let existingPayload: DrPayload | null = null;
  let existingEvidence: DrEvidence[] = [];
  let correction: CorrectionRequest | null = null;

  if (existing) {
    const { data: version } = await admin
      .from("dr_report_versions")
      .select("id, payload")
      .eq("report_id", existing.id)
      .eq("version_no", existing.current_version_no)
      .maybeSingle();
    existingPayload = (version?.payload as DrPayload) ?? null;
    if (version) {
      const { data: ev } = await admin.from("dr_evidence").select("*").eq("version_id", version.id);
      existingEvidence = (ev as DrEvidence[] | null) ?? [];
    }
    const { data: corr } = await admin
      .from("dr_correction_requests")
      .select("*, items:dr_correction_items(*)")
      .eq("report_id", existing.id)
      .in("status", ["Sent", "Acknowledged"])
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    correction = (corr as CorrectionRequest | null) ?? null;
  }

  // Previous approved day of this unit: next-day plan, approved progress, units of measure.
  const { data: history } = await admin
    .from("dr_reports")
    .select("id, report_date, approved_version_no")
    .eq("unit_id", unitId)
    .lt("report_date", reportDate)
    .not("approved_version_no", "is", null)
    .order("report_date", { ascending: false })
    .limit(30);

  let previousNextDay: DrPayload["next_day"] = [];
  const approvedProgress: Record<string, number> = {};
  const knownUom: Record<string, string> = {};

  if (history && history.length > 0) {
    const reportIds = history.map((h) => h.id as string);
    const { data: versions } = await admin
      .from("dr_report_versions")
      .select("id, report_id, version_no, payload")
      .in("report_id", reportIds);
    const approvedVersion = new Map<string, { id: string; payload: DrPayload }>();
    for (const h of history) {
      const v = (versions ?? []).find((x) => x.report_id === h.id && x.version_no === h.approved_version_no);
      if (v) approvedVersion.set(h.id as string, { id: v.id as string, payload: v.payload as DrPayload });
    }
    previousNextDay = approvedVersion.get(history[0].id as string)?.payload.next_day ?? [];
    // Newest first, so the first value seen per task is the latest approved one.
    for (const h of history) {
      for (const a of approvedVersion.get(h.id as string)?.payload.activities ?? []) {
        if (!a.task_id) continue;
        if (approvedProgress[a.task_id] === undefined && typeof a.progress_today === "number") {
          approvedProgress[a.task_id] = a.progress_today;
        }
        if (knownUom[a.task_id] === undefined && a.uom) knownUom[a.task_id] = a.uom;
      }
    }
  }

  return {
    unit,
    report_date: reportDate,
    schedule,
    activities,
    rules: [...resolveRules((rulesRes.data as RuleDefinition[] | null) ?? [], unit.project_id).values()],
    existing,
    existing_payload: existingPayload,
    existing_evidence: existingEvidence,
    correction,
    draft: (draftRes.data?.payload as DrPayload | undefined) ?? null,
    previous_next_day: previousNextDay,
    approved_progress: approvedProgress,
    known_uom: knownUom,
    today_local: localDate(schedule.timezone),
  };
}

/** Runs the full rule catalogue for a submission against a loaded context. */
export function runRules(
  ctx: FormContext,
  payload: DrPayload,
  reportKind: ReportKind,
  evidence: Pick<EvidenceRef, "target_section" | "target_line_id">[],
  /** `at`: when the report was written (offline reports are judged on device time, not sync time). */
  opts: { duplicate: boolean; at?: Date },
): RuleResult[] {
  const deadline = zonedInstant(ctx.report_date, ctx.schedule.deadline_time, ctx.schedule.timezone);
  return evaluateRules({
    payload,
    reportKind,
    reportDate: ctx.report_date,
    todayLocal: ctx.today_local,
    unit: ctx.unit,
    activities: ctx.activities,
    evidence,
    rules: ctx.rules,
    duplicate: opts.duplicate,
    late: (opts.at ?? new Date()).getTime() > deadline.getTime(),
    previousNextDay: ctx.previous_next_day,
    approvedProgress: ctx.approved_progress,
    knownUom: ctx.known_uom,
  });
}

const MAGIC: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: "image/webp", test: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
  { mime: "image/heic", test: (b) => b.subarray(4, 8).toString("ascii") === "ftyp" },
  { mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
];

export interface VerifiedEvidence extends EvidenceRef {
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
  scan_status?: "Available";
  scan_engine?: string;
}

export class EvidenceError extends Error {
  /** True when the file itself is fine as far as we know and the check should simply be tried again later. */
  retry = false;
}

/**
 * Checks each newly uploaded file server-side before it is registered:
 *   1. it must sit under this unit's storage prefix;
 *   2. it is scanned for malware (ClamAV, see scanner.ts). An infected file is
 *      deleted from storage, the event is audited, and the submission stops;
 *   3. its content must match a permitted type by signature, not by the
 *      client-supplied name;
 *   4. its SHA-256 is computed here.
 * Files already registered on the report are passed through; the database
 * carries their original hash forward. scan_engine records what checked the
 * file: "clamav", or "signature-check" when no scan was made.
 */
export async function verifyEvidence(
  admin: SupabaseClient,
  unit: Pick<ReportingUnit, "id" | "project_id">,
  refs: EvidenceRef[],
  alreadyRegistered: Set<string>,
  actorId: string | null = null,
): Promise<VerifiedEvidence[]> {
  const prefix = `${unit.project_id}/${unit.id}/`;
  const out: VerifiedEvidence[] = [];
  for (const ref of refs) {
    if (alreadyRegistered.has(ref.storage_key)) {
      out.push(ref);
      continue;
    }
    if (!ref.storage_key.startsWith(prefix) || ref.storage_key.includes("..")) {
      throw new EvidenceError("An attached file does not belong to this reporting unit.");
    }
    const { data: blob, error } = await admin.storage.from(EVIDENCE_BUCKET).download(ref.storage_key);
    if (error || !blob) throw new EvidenceError("An attached file was not uploaded completely. Attach it again.");
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_EVIDENCE_BYTES) {
      throw new EvidenceError("An attached file is empty or larger than 20 MB.");
    }
    const sha256 = createHash("sha256").update(bytes).digest("hex");

    const scan = await scanBuffer(bytes);
    if (scan.status === "infected") {
      await admin.storage.from(EVIDENCE_BUCKET).remove([ref.storage_key]);
      await admin.rpc("dr_audit", {
        p_project_id: unit.project_id,
        p_unit_id: unit.id,
        p_report_id: null,
        p_version_no: null,
        p_event: "DR.EVIDENCE_QUARANTINED",
        p_actor: actorId,
        p_channel: null,
        p_details: { storage_key: ref.storage_key, sha256, signature: scan.signature, size_bytes: bytes.length },
      });
      throw new EvidenceError("An attached file was rejected by the virus scanner and has been removed. Attach a different file.");
    }
    if (scan.status === "unavailable" && scanRequired()) {
      console.error("daily-reporting: evidence scan unavailable:", scan.reason);
      const unavailable = new EvidenceError("Attached files cannot be checked for viruses right now. Try again in a few minutes.");
      unavailable.retry = true;
      throw unavailable;
    }

    const kind = MAGIC.find((m) => m.test(bytes));
    if (!kind) throw new EvidenceError("An attached file is not a supported photo or PDF.");
    out.push({
      ...ref,
      mime_type: kind.mime,
      size_bytes: bytes.length,
      sha256,
      scan_status: "Available",
      scan_engine: scan.status === "clean" ? scan.engine : "signature-check",
    });
  }
  return out;
}

interface OutboxRow {
  id: string;
  recipient_id: string;
  priority: string;
  title: string;
  body: string;
  href: string | null;
  channels: string[];
  attempts: number;
}

interface RecipientPrefs {
  email: string | null;
  notification_preferences: { email?: boolean; telegram?: boolean; telegram_chat_id?: string | null } | null;
}

/**
 * Delivers pending Telegram DMs and emails. In-app alerts were already written
 * by the database function that raised the event, so a delivery failure here
 * never loses the notification. Detail goes to the private chat only; nothing
 * is ever posted to a group from here.
 */
export async function drainOutbox(admin: SupabaseClient, limit = 25): Promise<{ sent: number; failed: number }> {
  const { data: rows } = await admin
    .from("dr_notification_outbox")
    .select("id, recipient_id, priority, title, body, href, channels, attempts")
    .eq("status", "Pending")
    .lt("attempts", 3)
    .order("created_at")
    .limit(limit);
  const pending = (rows as OutboxRow[] | null) ?? [];
  if (pending.length === 0) return { sent: 0, failed: 0 };

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, notification_preferences")
    .in("id", [...new Set(pending.map((r) => r.recipient_id))]);
  const prefsById = new Map((profiles ?? []).map((p) => [p.id as string, p as unknown as RecipientPrefs]));
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";

  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const prefs = prefsById.get(row.recipient_id);
    const np = prefs?.notification_preferences ?? null;
    const link = row.href && base ? `${base}${row.href}` : null;
    const errors: string[] = [];

    if (row.channels.includes("telegram") && np?.telegram && np.telegram_chat_id) {
      const chatId = Number(np.telegram_chat_id);
      if (Number.isFinite(chatId)) {
        try {
          await sendMessage(chatId, `${row.title}\n${row.body}${link ? `\n${link}` : ""}`);
        } catch (e) {
          errors.push(`telegram: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    // Critical items are emailed even when the general email toggle is off.
    if (row.channels.includes("email") && prefs?.email && (np?.email || row.priority === "Critical")) {
      try {
        await sendEmail({
          to: prefs.email,
          subject: row.title,
          html: `<p>${escapeHtml(row.body)}</p>${link ? `<p><a href="${link}">Open in DCOS</a></p>` : ""}`,
        });
      } catch (e) {
        errors.push(`email: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const ok = errors.length === 0;
    await admin
      .from("dr_notification_outbox")
      .update({
        status: ok ? "Sent" : row.attempts + 1 >= 3 ? "Failed" : "Pending",
        attempts: row.attempts + 1,
        last_error: ok ? null : errors.join("; "),
        sent_at: ok ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (ok) sent++;
    else failed++;
  }
  return { sent, failed };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

/** Best-effort delivery after a write; never fails the request that triggered it. */
export async function drainOutboxQuietly(admin: SupabaseClient): Promise<void> {
  try {
    await drainOutbox(admin, 15);
  } catch (e) {
    console.error("daily-reporting: outbox drain failed:", e instanceof Error ? e.message : e);
  }
}
