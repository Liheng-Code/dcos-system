import { NextRequest, NextResponse } from "next/server";
import { drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";

/** Withdraws a submitted report before review has started. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const { error } = await actor.admin.rpc("dr_withdraw_report", { p_actor: actor.userId, p_report_id: id });
  if (error) return drErrorResponse(error);
  return NextResponse.json({ withdrawn: true });
}
