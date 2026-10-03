import { NextRequest, NextResponse } from "next/server";
import { requireHrAdmin } from "@/lib/hr/auth";

// Bulk-fill of the two fields the HR assignment rules match on.
// GET  → active employees with their department, position and current classification, plus the allowed values.
// POST → { updates: [{ id, employment_category?, labor_category? }] }; values must come from employee_master_lists.

const FIELDS = ["employment_category", "labor_category"] as const;
type Field = (typeof FIELDS)[number];

async function allowedValues(supabase: NonNullable<Awaited<ReturnType<typeof requireHrAdmin>>["supabase"]>) {
  const { data } = await supabase
    .from("employee_master_lists")
    .select("list_type, code, name")
    .in("list_type", [...FIELDS])
    .eq("is_active", true)
    .order("sort_order");
  const rows = (data ?? []) as { list_type: Field; code: string; name: string }[];
  return {
    options: Object.fromEntries(FIELDS.map((f) => [f, rows.filter((r) => r.list_type === f).map((r) => ({ value: r.code, label: r.name }))])),
    codes: Object.fromEntries(FIELDS.map((f) => [f, new Set(rows.filter((r) => r.list_type === f).map((r) => r.code))])) as Record<Field, Set<string>>,
  };
}

export async function GET() {
  const auth = await requireHrAdmin();
  if (auth.error || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: employees, error }, { options }] = await Promise.all([
    auth.supabase
      .from("profiles")
      .select("id, employee_id, full_name, department, job_title, position_id, employment_category, labor_category")
      .eq("status", "active")
      .order("full_name"),
    allowedValues(auth.supabase),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ employees, options });
}

export async function POST(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (auth.error || !auth.supabase || !auth.userId) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => null);
  const updates = (body?.updates ?? []) as { id?: string; employment_category?: string | null; labor_category?: string | null }[];
  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: "updates array is required" }, { status: 400 });
  }

  const supabase = auth.supabase;
  const { codes } = await allowedValues(supabase);

  for (const u of updates) {
    if (typeof u.id !== "string") return NextResponse.json({ error: "Every update needs an id" }, { status: 400 });
    for (const f of FIELDS) {
      const v = u[f];
      if (v != null && !codes[f].has(v)) {
        return NextResponse.json({ error: `"${v}" is not a valid ${f.replace("_", " ")}` }, { status: 400 });
      }
    }
  }

  const ids = updates.map((u) => u.id as string);
  const { data: before, error: readError } = await supabase
    .from("profiles")
    .select("id, employment_category, labor_category")
    .in("id", ids);
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  const current = new Map((before ?? []).map((p: { id: string; employment_category: string | null; labor_category: string | null }) => [p.id, p]));

  let changed = 0;
  const errors: { id: string; message: string }[] = [];
  for (const u of updates) {
    const old = current.get(u.id as string);
    if (!old) { errors.push({ id: u.id as string, message: "Employee not found" }); continue; }

    const patch: Partial<Record<Field, string | null>> = {};
    for (const f of FIELDS) {
      if (u[f] !== undefined && (u[f] ?? null) !== old[f]) patch[f] = u[f] ?? null;
    }
    if (Object.keys(patch).length === 0) continue;

    const { error } = await supabase.from("profiles").update(patch).eq("id", u.id as string);
    if (error) { errors.push({ id: u.id as string, message: error.message }); continue; }
    changed++;

    await supabase.from("employee_master_history").insert(
      (Object.keys(patch) as Field[]).map((f) => ({
        employee_id: u.id,
        change_type: "classification",
        field_name: f,
        old_value: old[f],
        new_value: patch[f] ?? null,
        reason: "Bulk classification",
        changed_by: auth.userId,
      })),
    );
  }

  return NextResponse.json({ changed, errors });
}
