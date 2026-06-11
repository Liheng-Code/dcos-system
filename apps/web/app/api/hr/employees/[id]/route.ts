import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);

const SENSITIVE_FIELDS = new Set([
  "status",
  "email",
  "role",
  "department",
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
  long_leave: { status: "long_leave", label: "Marked Long Leave" },
  resign: { status: "resigned", label: "Resigned", revoke: true },
  terminate: { status: "terminated", label: "Terminated", revoke: true },
  retire: { status: "retired", label: "Retired", revoke: true },
  deceased: { status: "deceased", label: "Marked Deceased", revoke: true },
  archive: { status: "archived", label: "Archived", revoke: true },
};

async function getActorContext(supabase: ReturnType<typeof createAdminClient>, userId: string) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role_code").eq("user_id", userId),
  ]);

  const roleCodes = new Set<string>((roles ?? []).map((row: { role_code: string }) => row.role_code));
  if (profile?.role) roleCodes.add(profile.role);

  return {
    profile,
    isHr: [...roleCodes].some((role) => HR_ROLE_CODES.has(role)),
  };
}

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
      .select("id, status")
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

    const { error: updateError } = await supabase.from("profiles").update(updatePayload).eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    if (transition.revoke) {
      await supabase.auth.admin.signOut(id);
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

    return NextResponse.json({ ok: true, status: transition.status });
  }

  if (action === "revoke_session") {
    const { error } = await supabase.auth.admin.signOut(id);
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
