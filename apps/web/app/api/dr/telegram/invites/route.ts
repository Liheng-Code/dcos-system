import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";
import { createInvite } from "@/lib/construction/daily-reporting/telegram/telegram-server";

const bodySchema = z.object({ unit_id: z.string().uuid(), user_id: z.string().uuid() });

/**
 * Issues a one-time Telegram invite for one reporter of a unit. The approver
 * sends the returned link to that person; opening it links their Telegram
 * account. The link is shown once and only its hash is stored.
 */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "unit_id and user_id are required" }, { status: 400 });

  try {
    return NextResponse.json(await createInvite(actor.admin, actor.userId, parsed.data.unit_id, parsed.data.user_id));
  } catch (e) {
    const message = e instanceof Error ? e.message : String((e as { message?: string }).message ?? e);
    if (/^DR_[A-Z_]+:/.test(message)) return drErrorResponse(e as Error);
    console.error("dr telegram invite:", message);
    return NextResponse.json({ error: "The invite could not be created.", code: "DR_TG_UNAVAILABLE" }, { status: 502 });
  }
}
