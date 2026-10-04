import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";

const bodySchema = z.object({
  unit_id: z.string().uuid(),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // A draft is work in progress, so it is stored as typed, not validated.
  payload: z.record(z.string(), z.unknown()),
});

/** Saves the server-side draft for a unit and date. */
export async function PUT(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid draft" }, { status: 400 });

  const { error } = await actor.admin.rpc("dr_save_draft", {
    p_actor: actor.userId,
    p_unit_id: parsed.data.unit_id,
    p_report_date: parsed.data.report_date,
    p_payload: parsed.data.payload,
  });
  if (error) return drErrorResponse(error);
  return NextResponse.json({ saved: true });
}
