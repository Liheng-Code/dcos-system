import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drErrorResponse, drainOutboxQuietly, requireActor } from "@/lib/construction/daily-reporting/server";

const bodySchema = z.object({
  project_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  narrative: z.string().nullable().optional(),
});

/** Publishes the Project Daily Summary as the next Official revision. */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "project_id and date are required" }, { status: 400 });

  const { data, error } = await actor.admin.rpc("dr_publish_summary", {
    p_actor: actor.userId,
    p_project_id: parsed.data.project_id,
    p_date: parsed.data.date,
    p_narrative: parsed.data.narrative ?? null,
  });
  if (error) return drErrorResponse(error);
  await drainOutboxQuietly(actor.admin);
  return NextResponse.json(data);
}
