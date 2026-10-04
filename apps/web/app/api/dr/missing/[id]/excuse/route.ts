import { NextRequest, NextResponse } from "next/server";
import { drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";

/** Excuses an open missing-report record with a reason (project approver only). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { reason?: string } | null;
  const { error } = await actor.admin.rpc("dr_excuse_missing", {
    p_actor: actor.userId,
    p_missing_id: id,
    p_reason: body?.reason ?? "",
  });
  if (error) return drErrorResponse(error);
  return NextResponse.json({ excused: true });
}
