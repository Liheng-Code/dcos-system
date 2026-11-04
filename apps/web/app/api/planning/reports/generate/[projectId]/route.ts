import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { generateReport, ReportError } from "@/lib/planning/reports/report-filing";

// Generate a Planning report (doc 35 M1-M4): master programme, weekly, monthly or recovery. Read as the caller (RLS);
// filed as a new Document Control revision and kept in plan_report_snapshots. Never replaces an earlier report.

export const maxDuration = 120;

const body = z.object({
  type: z.enum(["master_programme", "weekly", "monthly", "recovery"]),
  weekEnding: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  // doc 35 A3: the planner's commentary, possibly started from an AI draft
  commentary: z.object({
    paragraphs: z.array(z.string().max(2000)).max(8),
    aiSuggestionId: z.string().uuid().optional(),
  }).optional(),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const userDb = await createUserClient();
  const { data: { user } } = await userDb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { projectId } = await params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project" }, { status: 400 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  try {
    const r = await generateReport({ userDb, adminDb: createAdminClient(), projectId, userId: user.id, type: parsed.data.type, weekEnding: parsed.data.weekEnding, commentary: parsed.data.commentary });
    return NextResponse.json(r);
  } catch (e) {
    const status = e instanceof ReportError ? e.status : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Report failed" }, { status });
  }
}
