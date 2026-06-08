import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

// POST /api/hr/employees/[id]
// Actions:
//   { action: "revoke_session" }              — sign out all active sessions
//   { event_type, old_value, new_value, note } — write an audit log entry
//   Both can be combined in one call.
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
  };

  const supabase = createAdminClient();

  // Revoke all active sessions for the target user
  if (action === "revoke_session") {
    const { error } = await supabase.auth.admin.signOut(id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  // Write audit log entry
  if (event_type) {
    const { error } = await supabase.from("user_audit_logs").insert({
      user_id: id,
      actor_id: user.id,
      event_type,
      old_value: old_value ?? null,
      new_value: new_value ?? null,
      note: note ?? null,
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}

// GET /api/hr/employees/[id]
// Returns last 50 audit log entries for the employee.
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;

  const userClient = await createUserClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("user_audit_logs")
    .select("id, event_type, old_value, new_value, note, created_at, actor:actor_id(full_name)")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data ?? [] });
}
