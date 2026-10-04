import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drErrorResponse, drainOutboxQuietly, requireActor } from "@/lib/construction/daily-reporting/server";
import { DELAY_TYPES, SECTIONS } from "@/lib/construction/daily-reporting/types";

const decisionSchema = z.object({
  version_no: z.number().int().positive(),
  decision: z.enum(["APPROVE", "APPROVE_WITH_REMARK", "REQUEST_INFO", "RETURN"]),
  comment: z.string().nullable().optional(),
  verified: z
    .array(z.object({ line_id: z.string(), verified_qty: z.number().min(0), remark: z.string().min(1) }))
    .default([]),
  correction_items: z
    .array(
      z.object({
        target_section: z.enum(SECTIONS),
        target_line_id: z.string().nullable().optional(),
        reason: z.string().min(1),
        required_action: z.string().nullable().optional(),
      }),
    )
    .default([]),
  delay_classes: z.array(z.object({ line_id: z.string(), delay_type: z.enum(DELAY_TYPES) })).default([]),
});

/** Marks the report as being reviewed (AWAITING_REVIEW → IN_REVIEW). */
export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const { error } = await actor.admin.rpc("dr_open_review", { p_actor: actor.userId, p_report_id: id });
  if (error) return drErrorResponse(error);
  return NextResponse.json({ opened: true });
}

/** Records the reviewer's decision: approve, approve with remark, request information, or return. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const { id } = await params;
  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid decision", code: "DR_REQ_FIELD", issues: parsed.error.issues }, { status: 400 });
  }
  const d = parsed.data;

  const { data, error } = await actor.admin.rpc("dr_decide_review", {
    p_actor: actor.userId,
    p_report_id: id,
    p_version_no: d.version_no,
    p_decision: d.decision,
    p_comment: d.comment ?? null,
    p_verified: d.verified,
    p_correction_items: d.correction_items,
    p_delay_classes: d.delay_classes,
  });
  if (error) return drErrorResponse(error);
  await drainOutboxQuietly(actor.admin);
  return NextResponse.json(data);
}
