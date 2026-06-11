import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { cost_code } = body;

  if (!cost_code) {
    return NextResponse.json({ error: "cost_code is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("level")
    .eq("id", user.id)
    .single();

  const canAllocate = profile?.level && [
    "HR_Manager", "HR_Admin", "Super_Admin", "Admin",
  ].includes(profile.level);

  if (!canAllocate) {
    return NextResponse.json({ error: "Only HR admin can allocate costs" }, { status: 403 });
  }

  const { data: ot } = await supabase
    .from("overtime_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (!ot) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (ot.cost_allocated) {
    return NextResponse.json({ error: "Cost already allocated" }, { status: 400 });
  }

  const now = new Date().toISOString();

  await supabase
    .from("overtime_requests")
    .update({
      cost_code,
      cost_allocated: true,
      cost_allocated_at: now,
      cost_allocated_by: user.id,
    })
    .eq("id", id);

  await supabase.from("overtime_audit_log").insert({
    ot_request_id: id,
    action: "cost_allocated",
    performed_by: user.id,
    details: { cost_code },
  });

  return NextResponse.json({ success: true, cost_code });
}
