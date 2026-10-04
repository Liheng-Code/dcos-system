import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/construction/daily-reporting/server";
import { handleSyncPush } from "@/lib/construction/daily-reporting/sync-server";

/** Field App: pushes one report written offline. Header: Idempotency-Key (the queued item's id). */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;
  return handleSyncPush(actor, request);
}
