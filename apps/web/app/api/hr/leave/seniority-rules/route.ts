import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

interface RulePayload {
  id?: string;
  leave_type_id?: string;
  min_years?: number;
  max_years?: number | null;
  days_per_year?: number;
}

const ADMIN_LEVELS = ["HR_Manager", "HR_Admin", "Super_Admin", "Admin"];
const ADMIN_ROLES = ["admin", "HR_Manager", "hr_manager"];
const ADMIN_ROLE_CODES = ["admin", "HR_Manager"];

async function requireHrAdmin() {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { error: "Unauthorized", status: 401, supabase: null };

  const supabase = createAdminClient();
  const [profileRes, rolesRes] = await Promise.all([
    supabase.from("profiles").select("role, level").eq("id", user.id).single(),
    supabase.from("user_roles").select("role_code").eq("user_id", user.id),
  ]);

  const profile = profileRes.data;
  const roleCodes = rolesRes.data?.map((role) => role.role_code) ?? [];
  const canManage =
    (profile?.role != null && ADMIN_ROLES.includes(profile.role)) ||
    (profile?.level != null && ADMIN_LEVELS.includes(profile.level)) ||
    roleCodes.some((roleCode) => ADMIN_ROLE_CODES.includes(roleCode));

  if (!canManage) {
    return { error: "Only admin or HR admin can manage seniority rules", status: 403, supabase: null };
  }

  return { error: null, status: 200, supabase };
}

function validatePayload(body: RulePayload, requireId: boolean) {
  if (requireId && !body.id) return "id is required";
  if (!body.leave_type_id) return "leave_type_id is required";
  if (!Number.isFinite(body.min_years) || body.min_years! < 0) return "min_years must be 0 or greater";
  if (body.max_years !== null && body.max_years !== undefined) {
    if (!Number.isFinite(body.max_years) || body.max_years < body.min_years!) {
      return "max_years must be empty or greater than/equal to min_years";
    }
  }
  if (!Number.isFinite(body.days_per_year) || body.days_per_year! <= 0) return "days_per_year must be greater than 0";
  return null;
}

export async function POST(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (!auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json() as RulePayload;
  const validationError = validatePayload(body, false);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("leave_seniority_rules")
    .insert({
      leave_type_id: body.leave_type_id,
      min_years: body.min_years,
      max_years: body.max_years ?? null,
      days_per_year: body.days_per_year,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (!auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json() as RulePayload;
  const validationError = validatePayload(body, true);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const { data, error } = await auth.supabase
    .from("leave_seniority_rules")
    .update({
      leave_type_id: body.leave_type_id,
      min_years: body.min_years,
      max_years: body.max_years ?? null,
      days_per_year: body.days_per_year,
    })
    .eq("id", body.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (!auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await request.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await auth.supabase
    .from("leave_seniority_rules")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
