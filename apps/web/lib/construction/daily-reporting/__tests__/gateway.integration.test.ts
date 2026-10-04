// Integration test of the Daily Reporting gateway against a real PostgREST +
// Postgres. Opt-in: skipped unless DR_IT_REST_URL and DR_IT_JWT_SECRET are set.
//
//   DR_IT_REST_URL=http://127.0.0.1:54399 DR_IT_JWT_SECRET=<PGRST_JWT_SECRET> \
//     pnpm vitest run lib/construction/daily-reporting/__tests__/gateway.integration.test.ts
//
// Point it at a DISPOSABLE database with every migration applied and at least
// five non-admin profiles. Report versions are immutable, so the rows this
// test creates cannot be cleaned up afterwards.

import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import { loadFormContext, type Actor } from "../server";
import { handleSubmission } from "../submission";
import { emptyPayload, type DrPayload } from "../types";

const REST_URL = process.env.DR_IT_REST_URL;
const SECRET = process.env.DR_IT_JWT_SECRET;

const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");
function jwt(claims: Record<string, unknown>): string {
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 })}`;
  return `${body}.${b64(createHmac("sha256", SECRET as string).update(body).digest())}`;
}

/** supabase-js client talking to a bare PostgREST (no /rest/v1 prefix). */
function client(token: string): SupabaseClient {
  return createClient("http://dr-it.local", token, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(String(input).replace("http://dr-it.local/rest/v1", REST_URL as string), init),
    },
  });
}

const dayOffset = (n: number) => {
  const d = new Date(Date.now() - n * 86_400_000);
  return d.toISOString().slice(0, 10);
};

function request(body: unknown, key: string): NextRequest {
  return new NextRequest("http://dr-it.local/api/dr/reports", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": key },
    body: JSON.stringify(body),
  });
}

describe.skipIf(!REST_URL || !SECRET)("daily reporting gateway (integration)", () => {
  let admin: SupabaseClient;
  let reporter: Actor;
  let reporterId: string;
  let pmId: string;
  let outsiderId: string;
  let projectId: string;
  let unitId: string;
  let taskIn: string;
  let taskOut: string;
  let reportId: string;
  // A date well in the past so reruns on the same database do not collide.
  const reportDate = dayOffset(2 + Math.floor(Math.random() * 300));

  const workPayload = (qty: number, taskId: string): DrPayload => ({
    ...emptyPayload(),
    weather: { condition: "Sunny", hours_lost: 0, note: null },
    manpower: [{ line_id: "m1", trade: "Carpenter", planned_count: 8, reported_count: 8, hours: 8 }],
    activities: [
      { line_id: "a1", task_id: taskId, work_status: "in_progress", progress_before: 0, progress_today: 30, reported_qty: qty, uom: "m2", headcount: 8, hours_normal: 8, hours_ot: 0 },
    ],
    safety: { toolbox_talk_held: true, observations: null, incident_count: 0, near_miss_count: 0 },
    next_day: [{ line_id: "n1", task_id: taskId, planned_manpower: 8 }],
  });

  beforeAll(async () => {
    admin = client(jwt({ role: "service_role" }));

    const { data: profiles } = await admin.from("profiles").select("id, role").neq("role", "admin").limit(20);
    const { data: adminRoles } = await admin.from("user_roles").select("user_id").eq("role_code", "admin");
    const admins = new Set((adminRoles ?? []).map((r) => r.user_id as string));
    const ids = (profiles ?? []).map((p) => p.id as string).filter((id) => !admins.has(id));
    expect(ids.length).toBeGreaterThanOrEqual(3);
    [reporterId, pmId, outsiderId] = ids;

    const { data: project, error: projectError } = await admin
      .from("projects")
      .insert({ project_code: `DRIT-${randomUUID().slice(0, 8)}`, project_name: "DR integration", project_type: "internal", project_manager_id: pmId, dr_enabled: true })
      .select("id")
      .single();
    expect(projectError).toBeNull();
    projectId = project!.id as string;

    const { data: nodes } = await admin
      .from("wbs_nodes")
      .insert([
        { project_id: projectId, node_type: "phase", wbs_code: "IN", wbs_name: "In scope" },
        { project_id: projectId, node_type: "phase", wbs_code: "OUT", wbs_name: "Out of scope" },
      ])
      .select("id, wbs_code");
    const nodeIn = nodes!.find((n) => n.wbs_code === "IN")!.id as string;
    const nodeOut = nodes!.find((n) => n.wbs_code === "OUT")!.id as string;

    const { data: tasks } = await admin
      .from("wbs_tasks")
      .insert([
        { project_id: projectId, wbs_node_id: nodeIn, task_code: "T-IN", task_name: "Formwork" },
        { project_id: projectId, wbs_node_id: nodeOut, task_code: "T-OUT", task_name: "Other trade" },
      ])
      .select("id, task_code");
    taskIn = tasks!.find((t) => t.task_code === "T-IN")!.id as string;
    taskOut = tasks!.find((t) => t.task_code === "T-OUT")!.id as string;

    const { data: unit, error: unitError } = await admin
      .from("dr_reporting_units")
      .insert({ project_id: projectId, unit_code: "SC-IT", unit_type: "SUBCONTRACTOR", display_name: "Integration Sub", status: "Active", evidence_min_policy: { per_activity: 0 } })
      .select("id")
      .single();
    expect(unitError).toBeNull();
    unitId = unit!.id as string;

    await admin.from("dr_reporting_unit_wbs_scope").insert({ unit_id: unitId, wbs_node_id: nodeIn });
    await admin.from("dr_reporting_unit_members").insert({ unit_id: unitId, user_id: reporterId, member_role: "REPORTER", is_lead: true });

    reporter = { userId: reporterId, admin };
  });

  it("builds the form context with only the unit's scoped activities", async () => {
    const ctx = await loadFormContext(reporter, unitId, reportDate);
    expect(ctx).not.toBeNull();
    expect(ctx!.activities.map((a) => a.task_code)).toEqual(["T-IN"]);
    expect(ctx!.rules.some((r) => r.rule_code === "REQ_FIELD")).toBe(true);
    expect(ctx!.schedule.timezone).toBeTruthy();
    expect(ctx!.existing).toBeNull();
  });

  it("refuses the form to someone who is neither a member nor an approver", async () => {
    expect(await loadFormContext({ userId: outsiderId, admin }, unitId, reportDate)).toBeNull();
  });

  it("rejects an invalid report, persists nothing, and audits the attempt", async () => {
    const bad = workPayload(10, taskOut); // activity outside the unit's scope
    const res = await handleSubmission("submit", reporter, request({ payload: bad, report_kind: "WORK" }, randomUUID()), { unitId, reportDate });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("DR_INTAKE_REJECTED");
    expect(body.results.map((r: { rule_code: string }) => r.rule_code)).toContain("INV_WBS");

    const { count } = await admin.from("dr_reports").select("id", { count: "exact", head: true }).eq("unit_id", unitId);
    expect(count).toBe(0);
    const { data: audit } = await admin.from("dr_audit_log").select("details").eq("unit_id", unitId).eq("event_code", "DR.INTAKE_REJECTED");
    expect(audit).toHaveLength(1);
  });

  it("submits a valid report and returns the same receipt on replay", async () => {
    const key = randomUUID();
    const body = { payload: workPayload(120, taskIn), report_kind: "WORK" };

    const first = await handleSubmission("submit", reporter, request(body, key), { unitId, reportDate });
    expect(first.status).toBe(201);
    const receipt = (await first.json()).receipt;
    expect(receipt.report_no).toMatch(/^DR-\d{4}-\d{6}$/);
    reportId = receipt.report_id;

    const replay = await handleSubmission("submit", reporter, request(body, key), { unitId, reportDate });
    expect(replay.status).toBe(200);
    expect((await replay.json()).receipt).toMatchObject({ report_id: reportId, replayed: true });

    const duplicate = await handleSubmission("submit", reporter, request(body, randomUUID()), { unitId, reportDate });
    expect(duplicate.status).toBe(422);
    const dup = await duplicate.json();
    expect(dup.results.map((r: { rule_code: string }) => r.rule_code)).toContain("DUP_REPORT");
    expect(dup.existing_report_id).toBe(reportId);

    const { count } = await admin.from("dr_report_versions").select("id", { count: "exact", head: true }).eq("report_id", reportId);
    expect(count).toBe(1);
  });

  it("applies row-level security to what each user can read", async () => {
    const asUser = (sub: string) => client(jwt({ role: "authenticated", sub }));
    const select = "*, unit:dr_reporting_units(unit_code, display_name, unit_type)";

    const mine = await asUser(reporterId).from("dr_reports").select(select).eq("id", reportId);
    expect(mine.error).toBeNull();
    expect(mine.data).toHaveLength(1);
    expect(mine.data![0].unit.unit_code).toBe("SC-IT");

    const pm = await asUser(pmId).from("dr_reports").select(select).eq("id", reportId);
    expect(pm.data).toHaveLength(1);

    const outsider = await asUser(outsiderId).from("dr_reports").select(select).eq("id", reportId);
    expect(outsider.data).toHaveLength(0);

    // A client cannot write records or call the gateway functions directly.
    const write = await asUser(reporterId).from("dr_reports").update({ review_state: "APPROVED" }).eq("id", reportId).select("id");
    expect(write.error ?? write.data).toSatisfy((v: unknown) => (Array.isArray(v) ? v.length === 0 : true));
    const rpc = await asUser(reporterId).rpc("dr_decide_review", { p_actor: reporterId, p_report_id: reportId, p_version_no: 1, p_decision: "APPROVE" });
    expect(rpc.error).not.toBeNull();

    const { data: untouched } = await admin.from("dr_reports").select("review_state").eq("id", reportId).single();
    expect(untouched!.review_state).toBe("AWAITING_REVIEW");
  });

  it("corrects only the returned line, then approves and syncs to planning", async () => {
    const ret = await admin.rpc("dr_decide_review", {
      p_actor: pmId,
      p_report_id: reportId,
      p_version_no: 1,
      p_decision: "RETURN",
      p_comment: "Quantity too high",
      p_correction_items: [{ target_section: "activities", target_line_id: "a1", reason: "Check the measured area" }],
    });
    expect(ret.error).toBeNull();

    // The reporting unit can read the correction request with its items.
    const corr = await client(jwt({ role: "authenticated", sub: reporterId }))
      .from("dr_correction_requests")
      .select("*, items:dr_correction_items(*)")
      .eq("report_id", reportId);
    expect(corr.error).toBeNull();
    expect(corr.data![0].items).toHaveLength(1);

    // The reporter fixes the returned line and also tries to change manpower, which was not returned.
    const edited = workPayload(90, taskIn);
    edited.manpower[0].reported_count = 99;
    const res = await handleSubmission("resubmit", reporter, request({ payload: edited, reason: "Re-measured" }, randomUUID()), { unitId, reportDate, reportId });
    expect(res.status).toBe(200);

    const { data: v2 } = await admin.from("dr_report_versions").select("payload, version_kind").eq("report_id", reportId).eq("version_no", 2).single();
    const payload = v2!.payload as DrPayload;
    expect(v2!.version_kind).toBe("CORRECTION");
    expect(payload.activities[0].reported_qty).toBe(90);
    expect(payload.manpower[0].reported_count).toBe(8);

    const approve = await admin.rpc("dr_decide_review", {
      p_actor: pmId,
      p_report_id: reportId,
      p_version_no: 2,
      p_decision: "APPROVE_WITH_REMARK",
      p_comment: "Verified on site",
      p_verified: [{ line_id: "a1", verified_qty: 85, remark: "Measured 85 m2" }],
    });
    expect(approve.error).toBeNull();
    expect(approve.data.planning_sync.activities_synced).toBe(1);

    const { data: task } = await admin.from("wbs_tasks").select("progress").eq("id", taskIn).single();
    expect(Number(task!.progress)).toBe(30);
    const { data: logs } = await admin.from("plan_productivity_logs").select("quantity_done").eq("task_id", taskIn);
    expect(logs!.map((l) => Number(l.quantity_done))).toEqual([85]);

    const { data: summary } = await admin
      .from("dr_project_daily_summaries")
      .select("coverage, totals")
      .eq("project_id", projectId)
      .eq("summary_date", reportDate)
      .eq("revision_no", 0)
      .single();
    expect(summary!.coverage.approved).toBe(1);
    expect(summary!.totals.manpower_total).toBe(8);
  });

  it("amends an approved report as a new version awaiting approval", async () => {
    const res = await handleSubmission("amend", reporter, request({ payload: workPayload(88, taskIn), reason: "Survey correction" }, randomUUID()), { unitId, reportDate, reportId });
    expect(res.status).toBe(200);
    const { data: report } = await admin.from("dr_reports").select("review_state, approved_version_no, current_version_no").eq("id", reportId).single();
    expect(report).toMatchObject({ review_state: "AMENDMENT_PENDING", approved_version_no: 2, current_version_no: 3 });

    const missingReason = await handleSubmission("amend", reporter, request({ payload: workPayload(88, taskIn) }, randomUUID()), { unitId, reportDate, reportId });
    expect(missingReason.status).toBeGreaterThanOrEqual(400);
  });
});
