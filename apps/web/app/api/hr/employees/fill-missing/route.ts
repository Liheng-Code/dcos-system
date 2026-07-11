import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import crypto from "crypto";

const HR_ROLE_CODES = new Set(["HR_Manager", "admin"]);

const FIELD_GROUPS = ["payroll_profile", "tax_profile", "nssf_profile", "bank_account"] as const;
type FieldGroup = (typeof FIELD_GROUPS)[number];

function generateDeterministicId(base: string, prefix: string): string {
  const hash = crypto.createHash("md5").update(base).digest("hex");
  const num = (parseInt(hash.substring(0, 8), 16) % 900000) + 100000;
  return `${prefix}-${num}`;
}

async function getActorContext(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("id, role").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role_code").eq("user_id", userId),
  ]);

  const roleCodes = new Set<string>((roles ?? []).map((r: { role_code: string }) => r.role_code));
  if (profile?.role) roleCodes.add(profile.role);

  return {
    profile,
    isHr: [...roleCodes].some((role) => HR_ROLE_CODES.has(role)),
  };
}

export async function POST(request: NextRequest) {
  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const actor = await getActorContext(supabase, user.id);
  if (!actor.isHr) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { employee_ids, fields } = body as {
    employee_ids?: string[];
    fields: string[];
  };

  if (!Array.isArray(fields) || fields.length === 0) {
    return NextResponse.json({ error: "fields array is required" }, { status: 400 });
  }

  const validFields = fields.filter((f): f is FieldGroup =>
    FIELD_GROUPS.includes(f as FieldGroup),
  );
  if (validFields.length === 0) {
    return NextResponse.json({ error: "No valid field groups supplied" }, { status: 400 });
  }

  // Fetch employees to fill
  let profileQuery = supabase
    .from("profiles")
    .select("id, employee_id, full_name, join_date, payroll_group, labor_category")
    .in("status", ["active", "pending", "probation", "approved", "inactive"]);

  if (Array.isArray(employee_ids) && employee_ids.length > 0) {
    profileQuery = profileQuery.in("id", employee_ids);
  }

  const { data: employees, error: empError } = await profileQuery;
  if (empError) {
    return NextResponse.json({ error: empError.message }, { status: 500 });
  }
  if (!employees || employees.length === 0) {
    return NextResponse.json({ updated: 0, fields_filled: {} });
  }

  // Gather existing records to avoid duplicates
  const empIds = employees.map((e: { id: string }) => e.id);
  const today = new Date().toISOString().slice(0, 10);
  const fieldsFilled: Record<string, number> = {};

  // ── Payroll Profile ───────────────────────────────────────────
  if (validFields.includes("payroll_profile")) {
    const { data: existing } = await supabase
      .from("employee_payroll_profiles")
      .select("employee_id")
      .in("employee_id", empIds);

    const existingSet = new Set((existing ?? []).map((r: { employee_id: string }) => r.employee_id));
    const missing = employees.filter((e: { id: string }) => !existingSet.has(e.id));

    if (missing.length > 0) {
      const rows = missing.map((e: { id: string; join_date: string | null; payroll_group: string | null }) => ({
        employee_id: e.id,
        payroll_type: "monthly",
        currency: "USD",
        payroll_group: e.payroll_group ?? "staff",
        ot_eligible: true,
        tax_applicable: true,
        nssf_applicable: true,
        effective_date: e.join_date ?? today,
        created_by: user.id,
      }));

      const { error: insertError } = await supabase.from("employee_payroll_profiles").insert(rows);
      if (!insertError) fieldsFilled.payroll_profile = missing.length;
    } else {
      fieldsFilled.payroll_profile = 0;
    }
  }

  // ── Tax Profile ───────────────────────────────────────────────
  if (validFields.includes("tax_profile")) {
    const { data: existing } = await supabase
      .from("employee_tax_profiles")
      .select("employee_id")
      .in("employee_id", empIds);

    const existingSet = new Set((existing ?? []).map((r: { employee_id: string }) => r.employee_id));
    const missing = employees.filter((e: { id: string }) => !existingSet.has(e.id));

    if (missing.length > 0) {
      const rows = missing.map((e: { id: string; employee_id: string | null; join_date: string | null }) => ({
        employee_id: e.id,
        tax_residency: "resident",
        marital_status: "single",
        spouse_dependent: false,
        num_children: 0,
        tax_id: generateDeterministicId(e.id, "TIN"),
        effective_date: e.join_date ?? today,
        created_by: user.id,
      }));

      const { error: insertError } = await supabase.from("employee_tax_profiles").insert(rows);
      if (!insertError) fieldsFilled.tax_profile = missing.length;
    } else {
      fieldsFilled.tax_profile = 0;
    }
  }

  // ── NSSF Profile ──────────────────────────────────────────────
  if (validFields.includes("nssf_profile")) {
    const { data: existing } = await supabase
      .from("employee_nssf_profiles")
      .select("employee_id")
      .in("employee_id", empIds);

    const existingSet = new Set((existing ?? []).map((r: { employee_id: string }) => r.employee_id));
    const missing = employees.filter((e: { id: string }) => !existingSet.has(e.id));

    if (missing.length > 0) {
      const rows = missing.map((e: { id: string; employee_id: string | null; labor_category: string | null; join_date: string | null }) => ({
        employee_id: e.id,
        nssf_applicable: true,
        nssf_number: generateDeterministicId(e.id, "NSSF"),
        pension_applicable: true,
        healthcare_applicable: true,
        occupational_risk_applicable: e.labor_category === "site_staff",
        effective_date: e.join_date ?? today,
        created_by: user.id,
      }));

      const { error: insertError } = await supabase.from("employee_nssf_profiles").insert(rows);
      if (!insertError) fieldsFilled.nssf_profile = missing.length;
    } else {
      fieldsFilled.nssf_profile = 0;
    }
  }

  // ── Bank Account ──────────────────────────────────────────────
  if (validFields.includes("bank_account")) {
    const { data: existing } = await supabase
      .from("employee_bank_accounts")
      .select("employee_id")
      .in("employee_id", empIds);

    const existingSet = new Set((existing ?? []).map((r: { employee_id: string }) => r.employee_id));
    const missing = employees.filter((e: { id: string }) => !existingSet.has(e.id));

    if (missing.length > 0) {
      const rows = missing.map((e: { id: string; full_name: string }) => ({
        employee_id: e.id,
        bank_name: "",
        account_name: e.full_name,
        account_number: "",
        branch: "",
        is_primary: true,
      }));

      const { error: insertError } = await supabase.from("employee_bank_accounts").insert(rows);
      if (!insertError) fieldsFilled.bank_account = missing.length;
    } else {
      fieldsFilled.bank_account = 0;
    }
  }

  const totalUpdated = Object.values(fieldsFilled).reduce((a, b) => a + b, 0);

  return NextResponse.json({ updated: totalUpdated, fields_filled: fieldsFilled });
}
