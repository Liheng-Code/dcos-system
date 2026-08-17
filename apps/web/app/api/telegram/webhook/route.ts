"use server";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import {
  handleCheckinCommand,
  handleCheckoutCommand,
  handleHelp,
  handleLinkCommand,
  handleLocationMessage,
  handlePhotoMessage,
  type TelegramMessage,
} from "@/lib/telegram/webhook-handlers";

interface TelegramUpdate {
  message?: TelegramMessage;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-telegram-bot-api-secret-token");
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
    const message = update?.message;

    if (message) {
      const admin = createAdminClient();
      const text = message.text?.trim() ?? "";

      if (/^\/start\s+link_\d{6}/.test(text)) {
        await handleLinkCommand(admin, message, true);
      } else if (/^\/link\s+\d{6}/.test(text)) {
        await handleLinkCommand(admin, message, false);
      } else if (text === "/checkin") {
        await handleCheckinCommand(admin, message);
      } else if (text === "/checkout") {
        await handleCheckoutCommand(admin, message);
      } else if (text === "/start" || text === "/help") {
        await handleHelp(admin, message);
      } else if (message.location) {
        await handleLocationMessage(admin, message);
      } else if (message.photo && message.photo.length > 0) {
        await handlePhotoMessage(admin, message);
      }
    }
  } catch (err) {
    console.error("Telegram webhook error:", err);
  }

  // Always return 200 — Telegram retry-storms and eventually disables the
  // webhook on non-2xx responses, so internal errors are logged and swallowed.
  return NextResponse.json({ ok: true });
}
