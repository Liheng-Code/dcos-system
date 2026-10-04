// Module 10-01 Daily Reporting — the one submission pipeline behind
// POST /api/dr/reports, /reports/:id/versions and /reports/:id/amend:
//   authenticate → resolve context server-side → intake rules
//     → ERROR: nothing persisted, the attempt is audited
//     → OK:    version + projections + evidence + rule results, one transaction
// Server-only.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { applyCorrection } from "./merge";
import { blockingErrors, warnings } from "./rules";
import {
  drErrorResponse,
  drainOutboxQuietly,
  EvidenceError,
  loadFormContext,
  runRules,
  verifyEvidence,
  type Actor,
} from "./server";
import { evidenceRefSchema, payloadSchema, type DrPayload, type EvidenceRef } from "./types";

export type SubmissionMode = "submit" | "resubmit" | "amend";

const bodySchema = z.object({
  payload: payloadSchema,
  evidence: z.array(evidenceRefSchema).max(200).default([]),
  report_kind: z.enum(["WORK", "NO_WORK"]).optional(),
  channel: z.enum(["WEB", "FIELD_APP", "TELEGRAM_MINIAPP"]).default("WEB"),
  client_created_at: z.string().nullable().optional(),
  /** submit: reason for replacing a No Work report. resubmit: reply to the PM. amend: reason (required). */
  reason: z.string().nullable().optional(),
});

export async function handleSubmission(
  mode: SubmissionMode,
  actor: Actor,
  request: NextRequest,
  target: { unitId: string; reportDate: string; reportId?: string },
): Promise<NextResponse> {
  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey) {
    return NextResponse.json({ error: "Idempotency-Key header is required", code: "DR_IDEMPOTENCY" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "The report is not in the expected format.", code: "DR_REQ_FIELD", issues: parsed.error.issues.slice(0, 20) },
      { status: 400 },
    );
  }
  const body = parsed.data;

  const ctx = await loadFormContext(actor, target.unitId, target.reportDate);
  if (!ctx) return NextResponse.json({ error: "Reporting unit not found", code: "DR_INV_UNIT" }, { status: 403 });

  // A retry of a submission that already succeeded returns the original
  // receipt, before the duplicate rule can reject it.
  const { data: replay } = await actor.admin
    .from("dr_report_versions")
    .select("report_id, unit_id, version_no, report:dr_reports(report_no)")
    .eq("project_id", ctx.unit.project_id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (replay && replay.unit_id !== target.unitId) {
    // Never hand one unit another unit's receipt.
    return NextResponse.json({ error: "This Idempotency-Key was already used.", code: "DR_IDEMPOTENCY" }, { status: 409 });
  }
  if (replay) {
    const report = replay.report as unknown as { report_no: string } | null;
    return NextResponse.json({
      receipt: { report_id: replay.report_id, report_no: report?.report_no, version_no: replay.version_no, replayed: true },
      warnings: [],
    });
  }

  let payload: DrPayload = body.payload;
  const reportKind = mode === "submit" ? body.report_kind ?? "WORK" : ctx.existing?.report_kind ?? "WORK";

  if (mode !== "submit" && (!ctx.existing || ctx.existing.id !== target.reportId || !ctx.existing_payload)) {
    return NextResponse.json({ error: "Report not found", code: "DR_NOT_FOUND" }, { status: 404 });
  }

  if (mode === "resubmit") {
    if (!ctx.correction || ctx.correction.request_kind !== "RETURN") {
      return NextResponse.json({ error: "This report is not returned for correction.", code: "DR_STATE" }, { status: 409 });
    }
    // Only the items the PM returned may change; everything else is taken
    // from the version that was reviewed.
    payload = applyCorrection(ctx.existing_payload as DrPayload, body.payload, ctx.correction.items);
  }

  // Evidence already on the report is always carried forward: a correction or
  // an amendment can add files but cannot make recorded evidence disappear.
  const registered = new Map(ctx.existing_evidence.map((e) => [e.storage_key, e]));
  const refs: EvidenceRef[] = [];
  const seen = new Set<string>();
  if (mode !== "submit") {
    for (const e of ctx.existing_evidence) {
      seen.add(e.storage_key);
      refs.push({
        storage_key: e.storage_key,
        target_section: e.target_section as EvidenceRef["target_section"],
        target_line_id: e.target_line_id,
        caption: e.caption,
      });
    }
  }
  for (const e of body.evidence) {
    if (seen.has(e.storage_key)) continue;
    seen.add(e.storage_key);
    refs.push(e);
  }

  // Activities already on the reviewed version stay reportable even if the
  // task has since been closed or moved out of scope.
  if (mode !== "submit") {
    const known = new Set(ctx.activities.map((a) => a.task_id));
    for (const a of ctx.existing_payload?.activities ?? []) {
      if (a.task_id && !known.has(a.task_id)) {
        known.add(a.task_id);
        ctx.activities.push({
          task_id: a.task_id, task_code: "", task_name: "", wbs_node_id: a.wbs_node_id ?? null, discipline: null,
          current_progress: 0, start_date: null, end_date: null, quantity_unit: null, suggested_trade: null,
          steps: [], planned_today: false,
        });
      }
    }
  }

  const replacesNoWork = ctx.existing?.report_kind === "NO_WORK" && reportKind === "WORK";
  const duplicate =
    mode === "submit" && !!ctx.existing && ctx.existing.submission_state !== "WITHDRAWN" && !replacesNoWork;

  const results = runRules(ctx, payload, reportKind, refs, { duplicate });
  const errors = blockingErrors(results);
  if (errors.length > 0) {
    await actor.admin.rpc("dr_audit_intake_rejected", {
      p_actor: actor.userId,
      p_unit_id: target.unitId,
      p_report_date: target.reportDate,
      p_channel: body.channel,
      p_rule_codes: [...new Set(errors.map((e) => e.rule_code))],
    });
    return NextResponse.json(
      {
        error: "The report has errors that must be fixed before it can be submitted.",
        code: "DR_INTAKE_REJECTED",
        results,
        existing_report_id: duplicate ? ctx.existing?.id : undefined,
      },
      { status: 422 },
    );
  }

  let evidence;
  try {
    evidence = await verifyEvidence(actor.admin, ctx.unit, refs, new Set(registered.keys()), actor.userId);
  } catch (e) {
    if (e instanceof EvidenceError) {
      return NextResponse.json({ error: e.message, code: e.retry ? "DR_EVIDENCE_RETRY" : "DR_EVIDENCE" }, { status: e.retry ? 503 : 422 });
    }
    throw e;
  }

  const common = {
    p_actor: actor.userId,
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
    p_channel: body.channel,
    p_rule_results: warnings(results),
    p_evidence: evidence,
  };

  const { data, error } =
    mode === "submit"
      ? await actor.admin.rpc("dr_submit_report", {
          ...common,
          p_unit_id: target.unitId,
          p_report_date: target.reportDate,
          p_report_kind: reportKind,
          p_client_created_at: body.client_created_at ?? null,
          p_change_reason: body.reason ?? null,
        })
      : mode === "resubmit"
        ? await actor.admin.rpc("dr_resubmit_report", {
            ...common,
            p_report_id: target.reportId,
            p_client_created_at: body.client_created_at ?? null,
            p_response: body.reason ?? null,
          })
        : await actor.admin.rpc("dr_submit_amendment", {
            ...common,
            p_report_id: target.reportId,
            p_reason: body.reason ?? "",
          });

  if (error) return drErrorResponse(error);

  await drainOutboxQuietly(actor.admin);
  return NextResponse.json({ receipt: data, warnings: warnings(results) }, { status: mode === "submit" ? 201 : 200 });
}
