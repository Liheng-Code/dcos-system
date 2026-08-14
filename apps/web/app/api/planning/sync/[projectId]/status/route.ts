import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, project_code, project_name")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: config } = await supabase
    .from("wbs_projects_sync")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const { data: lastSession } = await supabase
    .from("wbs_sync_sessions")
    .select("id, direction, status, summary, file_name, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { count } = await supabase
    .from("wbs_tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("sync_source", "ms_project");

  return NextResponse.json({
    project,
    config,
    lastSession,
    linkedTaskCount: count ?? 0,
  });
}
