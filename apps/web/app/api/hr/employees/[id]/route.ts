import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { getActorContext } from "@/lib/admin-users/actor-context";
import { writeAuditLog, USR_EVENT_TYPES } from "@/lib/admin-users/audit-log";

type Params = { params: Promise<{ id: string }> };

// HR_ROLE_CODES and getActorContext now live in apps/web/lib/admin-users/actor-context.ts —
// extracted per 02-USR Phase 3 so the new /api/admin/users/* and /api/auth/* routes can reuse
// the identical actor-check scaffolding without duplicating it.

const SENSITIVE_FIELDS = new Set([
  "status",
  "email",
  "role",
  "department",
  "department_id",
  "job_title",
  "level",
  "grade",
  "report_to",
  "employment_type",
  "work_location",
  "join_date",
  "probation_status",
  "probation_end_date",
  "contract_start_date",
  "contract_end_date",
  "seniority_start_date",
  "leave_group",
  "payroll_group",
  "attendance_site",
  "shift_group",
  "cost_center",
  "national_id_number",
  "passport_number",
  "visa_number",
  "work_permit_number",
  "tax_identification_number",
]);

const PROFILE_UPDATE_FIELDS = [
  "full_name",
  "khmer_name",
  "english_name",
  "gender",
  "date_of_birth",
  "nationality",
  "phone",
  "address",
  "current_address",
  "permanent_address",
  "emergency_contact_name",
  "emergency_contact_relationship",
  "emergency_contact_phone",
  "emergency_contact_address",
  "department",
  "department_id",
  "job_title",
  "level",
  "employment_type",
  "employment_category",
  "grade",
  "email",
  "join_date",
  "work_location",
  "company",
  "division",
  "section",
  "cost_center",
  "report_to",
  "probation_status",
  "probation_start_date",
  "probation_end_date",
  "contract_start_date",
  "contract_end_date",
  "seniority_start_date",
  "labor_category",
  "leave_group",
  "payroll_group",
  "attendance_site",
  "shift_group",
  "national_id_number",
  "national_id_expiry",
  "passport_number",
  "passport_expiry",
  "visa_number",
  "visa_expiry",
  "work_permit_number",
  "work_permit_expiry",
  "tax_identification_number",
  "employment_contract_number",
  "rfid_card",
  "fingerprint_id",
  "face_recognition_id",
  "door_access_group",
  "parking_access",
  "shirt_size",
  "pant_size",
  "safety_shoe_size",
  "helmet_size",
  "vest_size",
] as const;

const LIFECYCLE_ACTIONS: Record<string, { status: string; label: string; revoke?: boolean }> = {
  submit: { status: "pending_approval", label: "Submitted for Approval" },
  approve: { status: "approved", label: "Approved" },
  activate: { status: "active", label: "Activated" },
  start_probation: { status: "probation", label: "Started Probation" },
  suspend: { status: "suspended", label: "Suspended", revoke: true },
  // revoke: true added per 00-Master.md §4 / 02-Functional-Specification.md BR4.01 — long_leave
  // backfills to account_status=SUSPENDED (04-Database-Schema.md §2), so the live transition
  // must match: a newly-placed-on-leave employee must not keep a live session while HR believes
  // the account is suspended.
  long_leave: { status: "long_leave", label: "Marked Long Leave", revoke: true },
  resign: { status: "resigned", label: "Resigned", revoke: true },
  terminate: { status: "terminated", label: "Terminated", revoke: true },
  retire: { status: "retired", label: "Retired", revoke: true },
  deceased: { status: "deceased", label: "Marked Deceased", revoke: true },
  archive: { status: "archived", label: "Archived", revoke: true },
};

/**
 * F4 — HR Lifecycle → `account_status` Side Effects (BR4.01–BR4.05).
 *
 * Applied inside the same `profiles` UPDATE as the existing `status` change (same statement,
 * same transaction) whenever an HR `LIFECYCLE_ACTIONS` key below fires. `restoreOnly: true`
 * (the `activate` row) means: only apply if the account's CURRENT `account_status` is
 * `SUSPENDED` or `DISABLED` — never if `LOCKED` (BR4.03, a System Admin security hold that HR
 * reactivation must never silently clear). Event-type strings are the canonical vocabulary from
 * `04-Database-Schema.md` §9 — `account_suspended`/`account_disabled` are shared between the
 * Admin-triggered (F3) and HR-triggered (F4) paths by design. The vocabulary has no distinct
 * event type for an HR-triggered SUSPENDED/DISABLED → ACTIVE restore, so `account_unlocked` is
 * reused for that case (closest semantic fit, avoids introducing an ad-hoc string — BR10.01).
 */
const ACCOUNT_STATUS_SIDE_EFFECTS: Record<
  string,
  { to: "SUSPENDED" | "DISABLED" | "ACTIVE"; eventType: string; restoreOnly?: boolean }
> = {
  suspend: { to: "SUSPENDED", eventType: USR_EVENT_TYPES.ACCOUNT_SUSPENDED },
  long_leave: { to: "SUSPENDED", eventType: USR_EVENT_TYPES.ACCOUNT_SUSPENDED },
  resign: { to: "DISABLED", eventType: USR_EVENT_TYPES.ACCOUNT_DISABLED },
  terminate: { to: "DISABLED", eventType: USR_EVENT_TYPES.ACCOUNT_DISABLED },
  retire: { to: "DISABLED", eventType: USR_EVENT_TYPES.ACCOUNT_DISABLED },
  deceased: { to: "DISABLED", eventType: USR_EVENT_TYPES.ACCOUNT_DISABLED },
  archive: { to: "DISABLED", eventType: USR_EVENT_TYPES.ACCOUNT_DISABLED },
  activate: { to: "ACTIVE", eventType: USR_EVENT_TYPES.ACCOUNT_UNLOCKED, restoreOnly: true },
};

async function writeHrHistory(
  supabase: ReturnType<typeof createAdminClient>,
  payload: {
    employee_id: string;
    change_type: string;
    field_name?: string | null;
    old_value?: unknown;
    new_value?: unknown;
    reason?: string | null;
    effective_date?: string | null;
    approval_reference?: string | null;
    changed_by?: string | null;
  },
) {
  await supabase.from("employee_master_history").insert({
    employee_id: payload.employee_id,
    change_type: payload.change_type,
    field_name: payload.field_name ?? null,
    old_value: payload.old_value === undefined ? null : payload.old_value,
    new_value: payload.new_value === undefined ? null : payload.new_value,
    reason: payload.reason ?? null,
    effective_date: payload.effective_date || null,
    approval_reference: payload.approval_reference ?? null,
    changed_by: payload.changed_by ?? null,
  });
}

export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { action, event_type, old_value, new_value, note } = body as {
    action?: string;
    event_type?: string;
    old_value?: Record<string, unknown>;
    new_value?: Record<string, unknown>;
    note?: string;
    reason?: string;
    effective_date?: string;
    approval_reference?: string;
  };

  const supabase = createAdminClient();
  const actor = await getActorContext(supabase, user.id);
  if (!actor.isHr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (action && LIFECYCLE_ACTIONS[action]) {
    const transition = LIFECYCLE_ACTIONS[action];
    const reason = typeof body.reason === "string" ? body.reason : null;
    const effectiveDate = typeof body.effective_date === "string" ? body.effective_date : new Date().toISOString().slice(0, 10);
    const approvalReference = typeof body.approval_reference === "string" ? body.approval_reference : null;

    const { data: current, error: fetchError } = await supabase
      .from("profiles")
      .select("id, status, account_status")
      .eq("id", id)
      .single();

    if (fetchError || !current) {
      return NextResponse.json({ error: fetchError?.message ?? "Employee not found" }, { status: 404 });
    }
    if (current.status === "archived" && action !== "archive") {
      return NextResponse.json({ error: "Archived employee records are read-only" }, { status: 409 });
    }

    const updatePayload: Record<string, unknown> = {
      status: transition.status,
      last_status_change_at: new Date().toISOString(),
      last_status_change_by: user.id,
    };
    if (transition.status === "suspended" && reason) updatePayload.suspended_reason = reason;
    if (["resigned", "terminated", "retired", "deceased"].includes(transition.status)) {
      updatePayload.end_date = effectiveDate;
    }

    // F4 — HR Lifecycle → account_status side effects (BR4.01–BR4.05). Merged into the same
    // update statement as the `status` change above, so this is the same transaction.
    const sideEffect = ACCOUNT_STATUS_SIDE_EFFECTS[action];
    const currentAccountStatus = current.account_status as string | null;
    let accountStatusChanged = false;
    if (sideEffect) {
      if (sideEffect.restoreOnly) {
        // BR4.02/BR4.03 — activate only restores from SUSPENDED/DISABLED, never from LOCKED.
        if (currentAccountStatus === "SUSPENDED" || currentAccountStatus === "DISABLED") {
          updatePayload.account_status = sideEffect.to;
          accountStatusChanged = true;
        }
      } else if (currentAccountStatus !== sideEffect.to) {
        updatePayload.account_status = sideEffect.to;
        accountStatusChanged = true;
      }
    }

    const { error: updateError } = await supabase.from("profiles").update(updatePayload).eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (transition.revoke) {
      // See migration 20260824050000_usr_revoke_user_sessions_function.sql — the previous
      // auth.admin.signOut(id) call here was passing a user id where the SDK expects a JWT
      // and was silently failing. This RPC deletes the user's auth.sessions rows instead.
      const { error: revokeError } = await supabase.rpc("revoke_user_sessions", {
        target_user_id: id,
      });
      if (revokeError) {
        console.error("[hr/employees] revoke_user_sessions failed:", revokeError.message);
      }
    }

    await writeHrHistory(supabase, {
      employee_id: id,
      change_type: "status_change",
      field_name: "status",
      old_value: { status: current.status },
      new_value: { status: transition.status },
      reason,
      effective_date: effectiveDate,
      approval_reference: approvalReference,
      changed_by: user.id,
    });

    await supabase.from("user_audit_logs").insert({
      user_id: id,
      actor_id: user.id,
      event_type: "employment_status_changed",
      old_value: { status: current.status },
      new_value: { status: transition.status },
      note: reason ?? transition.label,
    });

    // BR4.04 — the account_status side effect writes its own, additional audit entry.
    if (sideEffect && accountStatusChanged) {
      await writeAuditLog(supabase, {
        user_id: id,
        actor_id: user.id,
        event_type: sideEffect.eventType,
        old_value: { account_status: currentAccountStatus },
        new_value: { account_status: sideEffect.to },
        note: `account_status side effect of HR action "${action}" (${transition.label}).`,
      });
    }

    return NextResponse.json({
      ok: true,
      status: transition.status,
      account_status: accountStatusChanged ? sideEffect!.to : currentAccountStatus,
    });
  }

  if (action === "revoke_session") {
    // See migration 20260824050000_usr_revoke_user_sessions_function.sql for why this uses
    // the revoke_user_sessions RPC instead of the previously-broken auth.admin.signOut(id).
    const { error } = await supabase.rpc("revoke_user_sessions", { target_user_id: id });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (event_type) {
    const { error } = await supabase.from("user_audit_logs").insert({
      user_id: id,
      actor_id: user.id,
      event_type,
      old_value: old_value ?? null,
      new_value: new_value ?? null,
      note: note ?? null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const [{ data, error }, { data: history, error: historyError }] = await Promise.all([
    supabase
      .from("user_audit_logs")
      .select("id, event_type, old_value, new_value, note, created_at, actor:actor_id(full_name)")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("employee_master_history")
      .select("id, change_type, field_name, old_value, new_value, reason, effective_date, approval_reference, created_at, actor:changed_by(full_name)")
      .eq("employee_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [], history: history ?? [] });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { updates, reason, effective_date, approval_reference, change_type } = body as {
    updates?: Record<string, unknown>;
    reason?: string;
    effective_date?: string;
    approval_reference?: string;
    change_type?: string;
  };

  if (!updates || typeof updates !== "object") {
    return NextResponse.json({ error: "updates object is required" }, { status: 400 });
  }
  if (Object.prototype.hasOwnProperty.call(updates, "employee_id")) {
    return NextResponse.json({ error: "employee_id is read-only" }, { status: 400 });
  }

  const updateKeys = Object.keys(updates).filter((key) =>
    PROFILE_UPDATE_FIELDS.includes(key as (typeof PROFILE_UPDATE_FIELDS)[number]),
  );
  if (updateKeys.length === 0) {
    return NextResponse.json({ error: "No allowed profile fields supplied" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const actor = await getActorContext(supabase, user.id);
  if (!actor.isHr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: current, error: fetchError } = await supabase.from("profiles").select("*").eq("id", id).single();
  if (fetchError || !current) {
    return NextResponse.json({ error: fetchError?.message ?? "Employee not found" }, { status: 404 });
  }
  if (current.status === "archived") {
    return NextResponse.json({ error: "Archived employee records are read-only" }, { status: 409 });
  }

  const touchesSensitive = updateKeys.some((key) => SENSITIVE_FIELDS.has(key));
  if (touchesSensitive && !reason?.trim()) {
    return NextResponse.json({ error: "Reason is required for controlled or sensitive updates" }, { status: 400 });
  }

  const payload: Record<string, unknown> = {};
  for (const key of updateKeys) {
    payload[key] = updates[key] === "" ? null : updates[key];
  }

  const { error: updateError } = await supabase.from("profiles").update(payload).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  const changedFields = updateKeys.filter((key) => current[key] !== payload[key]);
  await Promise.all(changedFields.map((key) => writeHrHistory(supabase, {
    employee_id: id,
    change_type: change_type ?? (SENSITIVE_FIELDS.has(key) ? "controlled_update" : "normal_update"),
    field_name: key,
    old_value: { [key]: current[key] ?? null },
    new_value: { [key]: payload[key] ?? null },
    reason: reason ?? null,
    effective_date: effective_date ?? null,
    approval_reference: approval_reference ?? null,
    changed_by: user.id,
  })));

  return NextResponse.json({ ok: true, updated_fields: changedFields });
}
