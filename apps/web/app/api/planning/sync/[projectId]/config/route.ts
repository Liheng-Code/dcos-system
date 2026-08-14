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

  const { data, error } = await supabase
    .from("wbs_projects_sync")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data ?? null });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const allowed = [
    "source_identifier",
    "source_name",
    "mode",
    "sync_level",
    "sync_progress",
    "default_wbs_node_id",
  ] as const;

  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body && body[key] !== undefined) patch[key] = body[key];
  }
  if (patch.sync_level !== undefined) {
    const level = Number(patch.sync_level);
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      return NextResponse.json({ error: "sync_level must be 1-5" }, { status: 400 });
    }
    patch.sync_level = level;
  }
  if (patch.mode !== undefined && !["merge", "replace"].includes(patch.mode as string)) {
    return NextResponse.json({ error: "mode must be merge or replace" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("wbs_projects_sync")
    .upsert({ project_id: projectId, ...patch }, { onConflict: "project_id" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ config: data });
}
