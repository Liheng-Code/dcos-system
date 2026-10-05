import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { actorMayUseUnit, EVIDENCE_BUCKET, isUnitMember, requireReporterActor, WRONG_UNIT } from "@/lib/construction/daily-reporting/server";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

const bodySchema = z.object({
  unit_id: z.string().uuid(),
  report_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mime_type: z.string(),
});

/**
 * Issues a signed upload URL under the unit's storage prefix. The file is only
 * registered as evidence when the report is submitted, after the server has
 * checked its content and computed its hash.
 */
export async function POST(request: NextRequest) {
  const actor = await requireReporterActor(request);
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { unit_id, report_date, mime_type } = parsed.data;
  if (!actorMayUseUnit(actor, unit_id)) return WRONG_UNIT();

  const ext = EXT[mime_type];
  if (!ext) {
    return NextResponse.json(
      { error: "Only photos (JPEG, PNG, WebP, HEIC) and PDF are accepted.", code: "DR_EVIDENCE" },
      { status: 422 },
    );
  }

  const { data: unit } = await actor.admin.from("dr_reporting_units").select("id, project_id").eq("id", unit_id).maybeSingle();
  // Only someone who can submit for the unit may put files in its evidence
  // area: a current reporter, or (for photos of a report written offline)
  // someone who held an offline grant for the unit in the last 14 days.
  let allowed = !!unit && (await isUnitMember(actor.admin, unit_id, actor.userId, true));
  if (unit && !allowed) {
    const { data: grants } = await actor.admin
      .from("dr_offline_grants")
      .select("id")
      .eq("user_id", actor.userId)
      .contains("unit_ids", [unit_id])
      .gte("issued_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .limit(1);
    allowed = (grants ?? []).length > 0;
  }
  if (!unit || !allowed) {
    return NextResponse.json({ error: "Not a reporter of this reporting unit", code: "DR_INV_UNIT" }, { status: 403 });
  }

  const storageKey = `${unit.project_id}/${unit.id}/${report_date}/${randomUUID()}.${ext}`;
  const { data, error } = await actor.admin.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(storageKey);
  if (error || !data) {
    return NextResponse.json({ error: "Could not prepare the upload", code: "DR_EVIDENCE" }, { status: 500 });
  }
  return NextResponse.json({ storage_key: storageKey, token: data.token });
}
