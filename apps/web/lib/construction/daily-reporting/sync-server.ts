// Module 10-01 Daily Reporting — Phase 1B, server side of offline sync.
// Server-only. The Field App pulls a bundle while online (form definitions,
// rules, an offline grant) and later pushes what it queued. A pushed report
// that a grant covered is never dropped: at worst it is stored for the
// approver's review, held as a conflict, or quarantined with its payload.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { blockingErrors } from "./rules";
import {
  drErrorResponse,
  drainOutboxQuietly,
  EvidenceError,
  loadFormContext,
  photoReuseResults,
  runRules,
  verifyEvidence,
  type Actor,
  type VerifiedEvidence,
} from "./server";
import { evidenceRefSchema, payloadSchema, type DrPayload, type FormContext, type RuleResult } from "./types";

export interface OfflineGrant {
  grant_id: string;
  issued_at: string;
  expires_at: string;
  unit_ids: string[];
}

export interface RecentReport {
  report_date: string;
  report_no: string;
  report_kind: string;
  review_state: string;
  submission_state: string;
}

export interface SyncBundle {
  user: { id: string; name: string };
  device_id: string;
  grant: OfflineGrant;
  pulled_at: string;
  units: { context: FormContext; recent: RecentReport[] }[];
}

/** Issues an offline grant for the device and returns everything the Field App needs to work without a connection. */
export async function buildSyncBundle(
  actor: Actor,
  device: { id: string; label?: string | null; userAgent?: string | null },
): Promise<SyncBundle | NextResponse> {
  const { data: grant, error } = await actor.admin.rpc("dr_issue_offline_grant", {
    p_actor: actor.userId,
    p_device_id: device.id,
    p_label: device.label ?? null,
    p_user_agent: device.userAgent ?? null,
  });
  if (error) return drErrorResponse(error);
  const g = grant as OfflineGrant;

  const { data: profile } = await actor.admin.from("profiles").select("full_name, email").eq("id", actor.userId).maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const units: SyncBundle["units"] = [];
  for (const unitId of g.unit_ids) {
    let context = await loadFormContext(actor, unitId, today);
    // The project's "today" may differ from UTC's; reload for the local date.
    if (context && context.today_local !== today) context = await loadFormContext(actor, unitId, context.today_local);
    if (!context) continue;
    const { data: recent } = await actor.admin
      .from("dr_reports")
      .select("report_date, report_no, report_kind, review_state, submission_state")
      .eq("unit_id", unitId)
      .gte("report_date", since)
      .order("report_date", { ascending: false });
    units.push({ context, recent: (recent as RecentReport[] | null) ?? [] });
  }

  return {
    user: { id: actor.userId, name: (profile?.full_name as string) ?? (profile?.email as string) ?? "" },
    device_id: device.id,
    grant: g,
    pulled_at: new Date().toISOString(),
    units,
  };
}

const pushSchema = z.object({
  unit_id: z.string().uuid(),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  report_kind: z.enum(["WORK", "NO_WORK"]),
  // Deliberately loose: a report written offline must be storable even when it
  // no longer matches today's form. It is validated below, not refused here.
  payload: z.record(z.string(), z.unknown()),
  evidence: z.array(evidenceRefSchema).max(200).default([]),
  expected_evidence: z.number().int().min(0).max(200).default(0),
  client_created_at: z.string(),
  grant_id: z.string().uuid(),
  device_id: z.string().uuid(),
});

export type PushOutcome =
  | {
      outcome: "ACCEPTED";
      report_id: string;
      report_no: string;
      version_no: number;
      sync_state: string;
      review_flags: string[];
      replayed: boolean;
      evidence_rejected?: string[];
    }
  | { outcome: "CONFLICT" | "QUARANTINE"; conflict_id: string; existing_report_id?: string; report_no?: string; error?: string; replayed: boolean };

export async function handleSyncPush(actor: Actor, request: NextRequest): Promise<NextResponse> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Idempotency-Key header is required", code: "DR_IDEMPOTENCY" }, { status: 400 });
  }
  const parsed = pushSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "The queued item is not in the expected format.", code: "DR_REQ_FIELD" }, { status: 400 });
  }
  const body = parsed.data;
  const writtenAt = new Date(body.client_created_at);
  if (Number.isNaN(writtenAt.getTime())) {
    return NextResponse.json({ error: "client_created_at is not a date", code: "DR_REQ_FIELD" }, { status: 400 });
  }

  // Rules run for the approver's benefit. Their errors do not block: the
  // database stores the report flagged REQUIRES_REVIEW.
  const ctx = await loadFormContext(actor, body.unit_id, body.report_date, { skipAccessCheck: true });
  if (!ctx) return NextResponse.json({ error: "Reporting unit not found", code: "DR_INV_UNIT" }, { status: 404 });

  let results: RuleResult[];
  const shaped = payloadSchema.safeParse(body.payload);
  if (shaped.success) {
    results = runRules(ctx, shaped.data as DrPayload, body.report_kind, body.evidence, { duplicate: false, at: writtenAt });
    // Photos that are still on the phone will follow; do not flag them missing yet.
    if (body.expected_evidence > body.evidence.length) results = results.filter((r) => r.rule_code !== "EVIDENCE_MIN");
  } else {
    results = [
      {
        rule_code: "REQ_FIELD",
        rule_version: 1,
        status: "FAILED",
        severity: "ERROR",
        message: "The report does not match the current form: " + shaped.error.issues.slice(0, 3).map((i) => i.path.join(".") + " " + i.message).join("; "),
        params: {},
        target: { section: "header" },
      },
    ];
  }

  // A file that fails its check is left out; the report itself still goes in.
  const evidence: VerifiedEvidence[] = [];
  const rejected: string[] = [];
  for (const ref of body.evidence) {
    try {
      evidence.push(...(await verifyEvidence(actor.admin, ctx.unit, [ref], new Set(), actor.userId)));
    } catch (e) {
      if (!(e instanceof EvidenceError)) throw e;
      // Scanner down: the photo is not refused, the device will try again later.
      if (e.retry) return NextResponse.json({ error: e.message, code: "DR_EVIDENCE_RETRY" }, { status: 503 });
      rejected.push(ref.storage_key);
    }
  }
  results.push(...(await photoReuseResults(actor.admin, ctx.unit, ctx.rules, evidence, ctx.existing?.id ?? null)));

  const { data, error } = await actor.admin.rpc("dr_submit_offline_report", {
    p_actor: actor.userId,
    p_unit_id: body.unit_id,
    p_report_date: body.report_date,
    p_report_kind: body.report_kind,
    p_payload: shaped.success ? shaped.data : body.payload,
    p_idempotency_key: idempotencyKey,
    p_client_created_at: writtenAt.toISOString(),
    p_grant_id: body.grant_id,
    p_device_id: body.device_id,
    p_rule_results: results,
    p_evidence: evidence,
    p_expected_evidence: Math.max(body.expected_evidence - rejected.length, evidence.length),
  });
  if (error) return drErrorResponse(error);

  await drainOutboxQuietly(actor.admin);
  return NextResponse.json({
    ...(data as object),
    evidence_rejected: rejected,
    had_errors: blockingErrors(results).length > 0,
  });
}

const attachSchema = z.object({
  report_id: z.string().uuid(),
  version_no: z.number().int().positive(),
  evidence: z.array(evidenceRefSchema).min(1).max(50),
});

/** Registers photos that were uploaded after their report was pushed. */
export async function handleSyncEvidence(actor: Actor, request: NextRequest): Promise<NextResponse> {
  const parsed = attachSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "DR_REQ_FIELD" }, { status: 400 });
  const body = parsed.data;

  const { data: report } = await actor.admin.from("dr_reports").select("id, unit_id, project_id").eq("id", body.report_id).maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found", code: "DR_NOT_FOUND" }, { status: 404 });

  const { data: existing } = await actor.admin.from("dr_evidence").select("storage_key").eq("report_id", body.report_id);
  const registered = new Set((existing ?? []).map((e) => e.storage_key as string));

  const evidence: VerifiedEvidence[] = [];
  const rejected: string[] = [];
  for (const ref of body.evidence) {
    if (registered.has(ref.storage_key)) continue;
    try {
      evidence.push(
        ...(await verifyEvidence(actor.admin, { id: report.unit_id as string, project_id: report.project_id as string }, [ref], new Set(), actor.userId)),
      );
    } catch (e) {
      if (!(e instanceof EvidenceError)) throw e;
      // Scanner down: the photo is not refused, the device will try again later.
      if (e.retry) return NextResponse.json({ error: e.message, code: "DR_EVIDENCE_RETRY" }, { status: 503 });
      rejected.push(ref.storage_key);
    }
  }

  const { data, error } = await actor.admin.rpc("dr_attach_evidence", {
    p_actor: actor.userId,
    p_report_id: body.report_id,
    p_version_no: body.version_no,
    p_evidence: evidence,
  });
  if (error) return drErrorResponse(error);
  return NextResponse.json({ ...(data as object), evidence_rejected: rejected });
}

const resolveSchema = z.object({
  resolution: z.enum(["KEEP_EXISTING", "KEEP_BOTH", "MERGE", "DISCARD"]),
  payload: payloadSchema.optional(),
  note: z.string().max(2000).nullable().optional(),
});

export async function handleConflictResolve(actor: Actor, conflictId: string, request: NextRequest): Promise<NextResponse> {
  const parsed = resolveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid resolution", code: "DR_REQ_FIELD" }, { status: 400 });
  const { data, error } = await actor.admin.rpc("dr_resolve_conflict", {
    p_actor: actor.userId,
    p_conflict_id: conflictId,
    p_resolution: parsed.data.resolution,
    p_payload: parsed.data.payload ?? null,
    p_note: parsed.data.note ?? null,
  });
  if (error) return drErrorResponse(error);
  await drainOutboxQuietly(actor.admin);
  return NextResponse.json(data);
}
