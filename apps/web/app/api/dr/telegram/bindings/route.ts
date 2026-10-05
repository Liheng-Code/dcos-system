import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { drErrorResponse, requireActor } from "@/lib/construction/daily-reporting/server";
import { createBinding } from "@/lib/construction/daily-reporting/telegram/telegram-server";

const bodySchema = z.object({ unit_id: z.string().uuid() });

/**
 * Starts binding a Telegram group to a reporting unit. Returns the one-time
 * code to post in the group as `/bind <code>`; the code is not stored and
 * cannot be shown again.
 */
export async function POST(request: NextRequest) {
  const actor = await requireActor();
  if (actor instanceof NextResponse) return actor;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "unit_id is required" }, { status: 400 });

  try {
    return NextResponse.json(await createBinding(actor.admin, actor.userId, parsed.data.unit_id));
  } catch (e) {
    return drErrorResponse(e as Error);
  }
}
