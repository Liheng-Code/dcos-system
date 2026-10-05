import { NextRequest, NextResponse } from "next/server";
import {
  actorMayUseUnit,
  drErrorResponse,
  drainOutboxQuietly,
  requireReporterActor,
  WRONG_UNIT,
} from "@/lib/construction/daily-reporting/server";

/** Answers an information request; the report returns to review without a new version. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireReporterActor(request);
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  if (actor.miniApp) {
    // A Telegram session is for one unit: the report must belong to it.
    const { data: report } = await actor.admin.from("dr_reports").select("unit_id").eq("id", id).maybeSingle();
    if (!report) return NextResponse.json({ error: "Report not found", code: "DR_NOT_FOUND" }, { status: 404 });
    if (!actorMayUseUnit(actor, report.unit_id as string)) return WRONG_UNIT();
  }

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
