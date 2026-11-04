import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";

// Open a generated report's PDF or HTML (doc 35 M4). The snapshot is read as the caller, so only someone who may see
// the project's reports gets the short-lived link.

export async function GET(request: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
  const userDb = await createUserClient();
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { snapshotId } = await params;
  const format = request.nextUrl.searchParams.get("format") === "html" ? "html" : "pdf";
  const { data, error } = await userDb.from("plan_report_snapshots").select("pdf_path, html_path").eq("id", snapshotId).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  const path = format === "html" ? (data as { html_path: string | null }).html_path : (data as { pdf_path: string | null }).pdf_path;
  if (!path) return NextResponse.json({ error: "This report has no file" }, { status: 404 });
  const { data: signed, error: signError } = await createAdminClient().storage.from("documents").createSignedUrl(path, 300);
  if (signError || !signed) return NextResponse.json({ error: signError?.message ?? "Could not open the file" }, { status: 500 });
  return NextResponse.redirect(signed.signedUrl);
}
