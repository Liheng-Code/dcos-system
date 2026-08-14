import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; sessionId: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, sessionId } = await params;
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("wbs_sync_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // wbs_sync_events cascade on session delete.
  const { error } = await supabase
    .from("wbs_sync_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("project_id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ deleted: sessionId });
}
