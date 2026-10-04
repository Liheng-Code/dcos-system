import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/construction/daily-reporting/server";
import { handleSubmission } from "@/lib/construction/daily-reporting/submission";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Submits a daily report. Header: Idempotency-Key. Query: unit, date. */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const unitId = request.nextUrl.searchParams.get("unit") ?? "";
  const reportDate = request.nextUrl.searchParams.get("date") ?? "";
  if (!UUID.test(unitId) || !DATE.test(reportDate)) {
    return NextResponse.json({ error: "unit and date=yyyy-mm-dd are required" }, { status: 400 });
  }
  return handleSubmission("submit", actor, request, { unitId, reportDate });
}
