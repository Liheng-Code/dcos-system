import { NextRequest, NextResponse } from "next/server";
import { requireActor } from "@/lib/construction/daily-reporting/server";
import { handleSubmission } from "@/lib/construction/daily-reporting/submission";

/** Amends an approved report (reason required) as a new version awaiting approval. Header: Idempotency-Key. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const { data: report } = await actor.admin.from("dr_reports").select("id, unit_id, report_date").eq("id", id).maybeSingle();
  if (!report) return NextResponse.json({ error: "Report not found", code: "DR_NOT_FOUND" }, { status: 404 });

  return handleSubmission("amend", actor, request, {
    unitId: report.unit_id as string,
    reportDate: report.report_date as string,
    reportId: report.id as string,
  });
}
