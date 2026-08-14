import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { runImportPreview } from "@/lib/planning/sync/engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userClient = await createUserClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await request.json().catch(() => null);
  const schedule = body?.schedule;

  if (!schedule || schedule.source !== "mspdi" || !Array.isArray(schedule.level3Tasks)) {
    return NextResponse.json(
      { error: "schedule must be a parsed MSPDI payload" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  const result = await runImportPreview(supabase, projectId, schedule, user.id);

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ sessionId: result.sessionId, plan: result.plan });
}
