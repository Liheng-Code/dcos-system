import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/construction/daily-reporting/server";
import { handleConflictResolve } from "@/lib/construction/daily-reporting/sync-server";

/** Resolves a sync conflict: keep the existing report, keep both, merge, or (quarantine) discard. Online only. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  return handleConflictResolve(actor, id, request);
}
