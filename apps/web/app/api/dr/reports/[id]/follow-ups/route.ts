import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";

const schema = z.object({
  kind: z.enum(["RFI", "INSPECTION_REQUEST", "HSE_INCIDENT"]),
  line_id: z.string().min(1).max(100).nullable().optional(),
  // Checked field by field in the database, which knows what each kind needs.
  fields: z.record(z.string(), z.string().max(4000).nullable()).default({}),
});

/**
 * Raises a record in another module (an RFI, an inspection request or an HSE
 * incident) from a line of this report, linked back to it. Approvers only;
 * the database enforces that.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request", code: "DR_REQ_FIELD" }, { status: 400 });

  const { id } = await params;
  const { data, error } = await actor.admin.rpc("dr_raise_follow_up", {
    p_actor: actor.userId,
    p_report_id: id,
    p_kind: parsed.data.kind,
    p_line_id: parsed.data.line_id ?? null,
    p_fields: parsed.data.fields,
  });
  if (error) return drErrorResponse(error);
  return NextResponse.json(data, { status: 201 });
}
