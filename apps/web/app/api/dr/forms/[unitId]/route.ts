import { NextRequest, NextResponse } from "next/server";
import { loadFormContext, requireActor } from "@/lib/construction/daily-reporting/server";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Form definition for one unit and date: scoped activities, rules, draft, previous-day data. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ unitId: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { unitId } = await params;
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!DATE.test(date)) return NextResponse.json({ error: "date=yyyy-mm-dd is required" }, { status: 400 });

  const ctx = await loadFormContext(actor, unitId, date);
  if (!ctx) return NextResponse.json({ error: "Reporting unit not found", code: "DR_INV_UNIT" }, { status: 403 });
  return NextResponse.json(ctx);
}
