import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/construction/daily-reporting/server";
import { handleSyncEvidence } from "@/lib/construction/daily-reporting/sync-server";

/** Field App: registers photos uploaded after their report was pushed. */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;
  return handleSyncEvidence(actor, request);
}
