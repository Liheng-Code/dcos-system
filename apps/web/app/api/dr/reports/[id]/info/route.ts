import { NextRequest, NextResponse } from "next/server";
import { drErrorResponse, drainOutboxQuietly, requireActor } from "@/lib/construction/daily-reporting/server";

/** Answers an information request; the report returns to review without a new version. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as { response?: string } | null;
  const { error } = await actor.admin.rpc("dr_answer_info", {
    p_actor: actor.userId,
    p_report_id: id,
    p_response: body?.response ?? "",
  });
  if (error) return drErrorResponse(error);
  await drainOutboxQuietly(actor.admin);
  return NextResponse.json({ answered: true });
}
