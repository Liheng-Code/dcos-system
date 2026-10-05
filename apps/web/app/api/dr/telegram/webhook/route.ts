import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { drainGroupOutbox } from "@/lib/construction/daily-reporting/telegram/telegram-server";
import { handleDrBotUpdate, type DrTelegramUpdate } from "@/lib/construction/daily-reporting/telegram/webhook";

function secretMatches(provided: string | null): boolean {
  const expected = process.env.TELEGRAM_DR_WEBHOOK_SECRET;
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook of the Daily Reporting bot (its own bot, not the attendance bot).
 * Telegram sends the secret given to setWebhook in
 * X-Telegram-Bot-Api-Secret-Token. Register it for `message` and
 * `my_chat_member` updates.
 */
export async function POST(request: NextRequest) {
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json().catch(() => null)) as DrTelegramUpdate | null;
  const admin = createAdminClient();
  await handleDrBotUpdate(admin, update);
  // A bind or a re-added bot may have status lines waiting.
  await drainGroupOutbox(admin, 10).catch(() => undefined);

  // Always 200: Telegram retries and eventually disables a webhook that fails.
  return NextResponse.json({ ok: true });
}
