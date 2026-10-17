import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createUserClient } from "@/lib/supabase/server";
import { runAiTool } from "@/lib/planning/activity-library/ai/ai-run";
import { aiDefaultModel, aiKeyConfigured, callClaude } from "@/lib/planning/activity-library/ai/ai-anthropic";

// Activity Library assistant. Advisory only: this route reads data as the caller (row-level security), asks the model to
// choose among options the engine produced, validates the answer and stores SUGGESTIONS. It never changes project data.
// Only codes, names and numbers are sent to the model; no people, rates or photos.

export const maxDuration = 120;

const id = z.string().uuid();
const body = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("find_activity_master"), query: z.string().min(1).max(200) }),
  z.object({ tool: z.literal("suggest_quantity_mapping"), runId: id, itemId: id }),
  z.object({ tool: z.literal("suggest_productivity"), standardId: id }),
  z.object({ tool: z.literal("detect_schedule_conflict"), runId: id }),
  z.object({ tool: z.literal("explain_generation"), runId: id }),
  z.object({
    tool: z.literal("suggest_recovery_plan"), projectId: id,
    target: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("baseline") }),
      z.object({ mode: z.literal("earlier"), days: z.number().int().min(1).max(2000) }),
      z.object({ mode: z.literal("date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    ]),
  }),
]);

export async function POST(request: NextRequest) {
  const user = await createUserClient();
  const { data: { user: me } } = await user.auth.getUser();
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", issues: parsed.error.issues }, { status: 400 });

  try {
    const result = await runAiTool(
      { admin: createAdminClient(), user, userId: me.id, keyConfigured: aiKeyConfigured(), model: callClaude, defaultModel: aiDefaultModel() },
      parsed.data,
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "AI request failed" }, { status: 500 });
  }
}
