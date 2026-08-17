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
import {
  handleApplyLeaveCommand,
  handleApproveCommand,
  handleBalanceCommand,
  handleMyLeaveCommand,
  handlePendingApprovalsCommand,
  handleRejectCommand,
} from "@/lib/telegram/leave-handlers";

const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

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
      const rawText = message.text?.trim() ?? "";
      // Normalize for command matching: mobile keyboards auto-capitalize the
      // first letter after "/" (e.g. "/Checkin"), and Telegram appends
      // "@BotUsername" to commands in some contexts (groups, inline mentions).
      // Only the first token is normalized so the /start and /link deep-link
      // payloads (which are case-sensitive codes) stay untouched.
      const [firstToken, ...rest] = rawText.split(/\s+/);
      const normalizedCommand = (firstToken ?? "").toLowerCase().replace(/@\S+$/, "");
      const text = [normalizedCommand, ...rest].join(" ");

      if (/^\/start\s+link_\d{6}/.test(text)) {
        await handleLinkCommand(admin, message, true);
      } else if (/^\/link\s+\d{6}/.test(text)) {
        await handleLinkCommand(admin, message, false);
      } else if (text === "/checkin") {
        await handleCheckinCommand(admin, message);
      } else if (text === "/checkout") {
        await handleCheckoutCommand(admin, message);
      } else if (text === "/apply") {
        await handleApplyLeaveCommand(admin, message);
      } else if (text === "/balance") {
        await handleBalanceCommand(admin, message);
      } else if (text === "/myleave") {
        await handleMyLeaveCommand(admin, message);
      } else if (text === "/pending") {
        await handlePendingApprovalsCommand(admin, message);
      } else if (new RegExp(`^/approve\\s+${UUID_RE}$`, "i").test(text)) {
        await handleApproveCommand(admin, message);
      } else if (new RegExp(`^/reject\\s+${UUID_RE}\\s+.+$`, "i").test(text)) {
        await handleRejectCommand(admin, message);
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
