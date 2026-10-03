import { NextRequest, NextResponse } from "next/server";
import { requireHrAdmin } from "@/lib/hr/auth";
import { applyProvision, buildProvisionPreview } from "@/lib/hr/provisioning";

// GET  → dry-run: what the assignment rules would create for each active employee (writes nothing).
// POST → apply it. Body { employee_ids?: string[] }; omit to apply to every active employee.

export async function GET() {
  const auth = await requireHrAdmin();
  if (auth.error || !auth.supabase) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    return NextResponse.json({ rows: await buildProvisionPreview(auth.supabase) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Preview failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireHrAdmin();
  if (auth.error || !auth.supabase || !auth.userId) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const requested: string[] | undefined = Array.isArray(body.employee_ids)
    ? body.employee_ids.filter((id: unknown): id is string => typeof id === "string")
    : undefined;

  try {
    const ids = requested ?? (await buildProvisionPreview(auth.supabase)).map((row) => row.employeeId);
    return NextResponse.json(await applyProvision(auth.supabase, ids, auth.userId));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Provisioning failed" }, { status: 500 });
  }
}
