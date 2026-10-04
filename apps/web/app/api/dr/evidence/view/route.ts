import { NextRequest, NextResponse } from "next/server";
import { createUserClient } from "@/lib/supabase/server";
import { EVIDENCE_BUCKET, requireActor } from "@/lib/construction/daily-reporting/server";

/**
 * Returns short-lived view URLs for evidence the caller is allowed to see.
 * The lookup runs under the caller's own session, so row-level security
 * decides what is visible; files that have not passed the content check are
 * never served.
 */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const body = (await request.json().catch(() => null)) as { evidence_ids?: string[] } | null;
  const ids = (body?.evidence_ids ?? []).slice(0, 100);
  if (ids.length === 0) return NextResponse.json({ urls: {} });

  const userClient = await createUserClient();
  const { data: rows } = await userClient
    .from("dr_evidence")
    .select("id, project_id, report_id, storage_key")
    .in("id", ids)
    .eq("scan_status", "Available");

  const urls: Record<string, string> = {};
  for (const row of rows ?? []) {
    const { data } = await actor.admin.storage.from(EVIDENCE_BUCKET).createSignedUrl(row.storage_key as string, 600);
    if (data?.signedUrl) urls[row.id as string] = data.signedUrl;
  }

  // One audit row per report whose evidence was opened.
  const byReport = new Map<string, { projectId: string; ids: string[] }>();
  for (const row of rows ?? []) {
    const entry = byReport.get(row.report_id as string) ?? { projectId: row.project_id as string, ids: [] };
    entry.ids.push(row.id as string);
    byReport.set(row.report_id as string, entry);
  }
  for (const [reportId, entry] of byReport) {
    await actor.admin.rpc("dr_audit", {
      p_project_id: entry.projectId,
      p_unit_id: null,
      p_report_id: reportId,
      p_version_no: null,
      p_event: "DR.EVIDENCE_VIEWED",
      p_actor: actor.userId,
      p_channel: "WEB",
      p_details: { evidence_ids: entry.ids },
    });
  }
  return NextResponse.json({ urls });
}
