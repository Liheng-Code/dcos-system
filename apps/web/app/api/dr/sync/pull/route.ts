import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireActor } from "@/lib/construction/daily-reporting/server";
import { buildSyncBundle } from "@/lib/construction/daily-reporting/sync-server";

const bodySchema = z.object({ device_id: z.string().uuid(), label: z.string().max(200).nullable().optional() });

/** Field App, while online: issues an offline grant and returns the forms, rules and plan for the user's units. */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "device_id is required", code: "DR_REQ_FIELD" }, { status: 400 });

  const bundle = await buildSyncBundle(actor, {
    id: parsed.data.device_id,
    label: parsed.data.label,
    userAgent: request.headers.get("user-agent"),
  });
  return bundle instanceof NextResponse ? bundle : NextResponse.json(bundle);
}
