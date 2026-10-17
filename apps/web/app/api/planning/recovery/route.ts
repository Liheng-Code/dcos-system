import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createUserClient } from "@/lib/supabase/server";
import { runRecovery } from "@/lib/planning/activity-library/recovery-service";
import { DEFAULT_RECOVERY_SETTINGS } from "@/lib/planning/activity-library/recovery-engine";

// Recovery scenarios for a project's live programme. Read-only: the programme is loaded as the caller (row-level security),
// every option is measured with the CPM engine, and the scenarios come back for the planner to compare. Nothing is changed.
// Measuring is CPU-heavy on large programmes (about a third of a second per CPM run), so it runs here, not in the browser.

export const maxDuration = 120;

const body = z.object({
  projectId: z.string().uuid(),
  target: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("baseline") }),
    z.object({ mode: z.literal("earlier"), days: z.number().int().min(1).max(2000) }),
    z.object({ mode: z.literal("date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  ]),
  settings: z.object({
    maxCompression: z.number().min(0.01).max(0.6),
    expediteCompression: z.number().min(0.01).max(0.5),
    minDurationWd: z.number().int().min(1).max(60),
    allowFastTrack: z.boolean(),
  }).partial().optional(),
});

export async function POST(request: NextRequest) {
  const user = await createUserClient();
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  const started = Date.now();
  try {
    const settings = { ...DEFAULT_RECOVERY_SETTINGS, ...(parsed.data.settings ?? {}) };
    const r = await runRecovery(user, parsed.data.projectId, parsed.data.target, settings);
    return NextResponse.json({
      analysis: r.analysis, settings, targetFinish: r.targetFinish, baselineFinish: r.inputs.baselineFinish,
      delays: r.delays, tasks: r.inputs.tasks.length, projectStart: r.inputs.projectStart, elapsedMs: Date.now() - started,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Recovery analysis failed" }, { status: 500 });
  }
}
