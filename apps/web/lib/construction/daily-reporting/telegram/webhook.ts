// Module 10-01 Daily Reporting — what the Daily Reporting bot does with an
// update from Telegram (app/api/dr/telegram/webhook). Server-only.
//
// In a group the bot runs in privacy mode, so it only receives commands and
// service messages. Ordinary chat never reaches it and is never a report.
// In a private chat it links a Telegram account to a DCOS user and explains
// where the report button is.

import type { SupabaseClient } from "@supabase/supabase-js";
import { askForReply, postLaunchMessage, reply } from "./telegram-server";
import { hashToken, normalizeBindingCode, parseInviteStartParam } from "./tokens";

interface TgChat {
  id: number;
  type?: string;
  title?: string;
}

export interface DrTelegramUpdate {
  message?: {
    message_id?: number;
    chat: TgChat;
    from?: { id: number };
    text?: string;
    migrate_to_chat_id?: number;
    reply_to_message?: { from?: { is_bot?: boolean }; text?: string };
  };
  my_chat_member?: {
    chat: TgChat;
    new_chat_member?: { status?: string };
  };
}

const isGroup = (chat: TgChat | undefined) => chat?.type === "group" || chat?.type === "supergroup";

function drMessage(error: { message?: string } | null, fallback: string): string {
  return /^DR_[A-Z_]+:\s*([\s\S]*)$/.exec(error?.message ?? "")?.[1] ?? fallback;
}

async function linkedProfile(admin: SupabaseClient, telegramUserId: number | undefined): Promise<{ id: string; full_name: string | null } | null> {
  if (!telegramUserId) return null;
  const { data } = await admin
    .from("profiles")
    .select("id, full_name, status")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  return data && data.status === "active" ? { id: data.id as string, full_name: (data.full_name as string | null) ?? null } : null;
}

async function tryPostLaunch(admin: SupabaseClient, bindingId: string, chatId: number): Promise<void> {
  try {
    await postLaunchMessage(admin, bindingId, null);
  } catch (e) {
    console.error("dr telegram launch message:", e instanceof Error ? e.message : e);
    await reply(chatId, "The group is bound, but the report button could not be posted. An administrator can re-issue it from DCOS.");
  }
}

// ── Group ───────────────────────────────────────────────────────────────────
// Telegram's command menu sends "/bind" the moment it is picked, before a code
// can be typed. The bot then asks for the code as a reply to this prompt.
const BIND_PROMPT = "Reply to this message with the 8-character binding code shown in DCOS.";

async function handleBind(
  admin: SupabaseClient,
  chat: TgChat,
  fromId: number | undefined,
  rawCode: string,
  messageId?: number,
): Promise<void> {
  const code = normalizeBindingCode(rawCode);
  if (!code) {
    const wrong = rawCode.trim() ? "That is not a binding code (8 letters and digits). " : "";
    await askForReply(chat.id, wrong + BIND_PROMPT, messageId, "8-character code");
    return;
  }
  const actor = await linkedProfile(admin, fromId);
  if (!actor) {
    await reply(chat.id, "Link your DCOS account first: open a private chat with me and send /start. Then post the code again.");
    return;
  }
  const { data, error } = await admin.rpc("dr_tg_bind_chat", {
    p_actor: actor.id,
    p_code_hash: hashToken(code),
    p_chat_id: chat.id,
    p_chat_title: chat.title ?? "",
    p_chat_type: chat.type,
  });
  if (error || !data) {
    await reply(chat.id, drMessage(error, "This group could not be bound."));
    return;
  }
  const bound = data as { binding_id: string; unit_name: string; unit_code: string };
  await reply(chat.id, `This group is now the daily reporting group for ${bound.unit_code} ${bound.unit_name}.`);
  await tryPostLaunch(admin, bound.binding_id, chat.id);
}

/** /report: re-posts the button with a fresh link. Anyone may ask; the link alone grants nothing. */
async function handleReportCommand(admin: SupabaseClient, chat: TgChat): Promise<void> {
  const { data: binding } = await admin
    .from("dr_telegram_bindings")
    .select("id")
    .eq("chat_id", chat.id)
    .eq("status", "Active")
    .maybeSingle();
  if (!binding) {
    await reply(chat.id, "This group is not bound to a reporting unit.");
    return;
  }
  // At most one new link a minute per group.
  const { data: recent } = await admin
    .from("dr_telegram_launch_tokens")
    .select("id")
    .eq("binding_id", binding.id)
    .gt("created_at", new Date(Date.now() - 60_000).toISOString())
    .limit(1);
  if ((recent ?? []).length > 0) return;
  // Drop the remembered pinned message so a new one is posted where people are reading.
  await admin.from("dr_telegram_bindings").update({ pinned_message_id: null }).eq("id", binding.id);
  await tryPostLaunch(admin, binding.id as string, chat.id);
}

async function handleGroup(admin: SupabaseClient, update: DrTelegramUpdate): Promise<void> {
  const membership = update.my_chat_member;
  if (membership && isGroup(membership.chat)) {
    const status = membership.new_chat_member?.status;
    if (status === "left" || status === "kicked") {
      await admin.rpc("dr_tg_set_bot_presence", { p_chat_id: membership.chat.id, p_present: false });
    } else if (status === "member" || status === "administrator") {
      const { data } = await admin.rpc("dr_tg_set_bot_presence", { p_chat_id: membership.chat.id, p_present: true });
      const restored = data as { changed?: boolean; binding_id?: string } | null;
      if (restored?.changed && restored.binding_id) await tryPostLaunch(admin, restored.binding_id, membership.chat.id);
    }
    return;
  }

  const message = update.message;
  if (!message || !isGroup(message.chat)) return;

  if (message.migrate_to_chat_id) {
    await admin.rpc("dr_tg_migrate_chat", { p_old_chat_id: message.chat.id, p_new_chat_id: message.migrate_to_chat_id });
    return;
  }

  const [first = "", ...rest] = (message.text ?? "").trim().split(/\s+/);
  const command = first.toLowerCase().replace(/@\S+$/, "");
  if (command === "/bind") await handleBind(admin, message.chat, message.from?.id, rest[0] ?? "", message.message_id);
  else if (command === "/report") await handleReportCommand(admin, message.chat);
  else if (message.reply_to_message?.from?.is_bot && message.reply_to_message.text?.endsWith(BIND_PROMPT)) {
    // The answer to the prompt above: the code on its own.
    await handleBind(admin, message.chat, message.from?.id, first, message.message_id);
  }
}

// ── Private chat ────────────────────────────────────────────────────────────
const HOW_TO_LINK =
  "To link your DCOS account: sign in to DCOS, open Daily Reporting, choose Link Telegram and send me the 6-digit code like this: /link 123456";

/**
 * Links this Telegram account to the DCOS user who generated the code. The
 * code table is the one the attendance bot uses; a Telegram user id is the
 * same for every bot, so one link serves both.
 */
async function handleLink(admin: SupabaseClient, chatId: number, fromId: number, code: string | undefined): Promise<void> {
  const invalid = "That code is not valid or has expired. Generate a new one in DCOS and send it within 10 minutes.";
  if (!code || !/^\d{6}$/.test(code)) {
    await reply(chatId, HOW_TO_LINK);
    return;
  }
  const { data: linkCode } = await admin
    .from("telegram_link_codes")
    .select("id, employee_id")
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!linkCode) {
    await reply(chatId, invalid);
    return;
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .update({ telegram_user_id: fromId })
    .eq("id", linkCode.employee_id)
    .select("full_name")
    .maybeSingle();
  if (error) {
    await reply(
      chatId,
      error.code === "23505"
        ? "This Telegram account is already linked to another DCOS user. Ask an administrator to unlink it first."
        : "Your account could not be linked. Try again, or contact an administrator.",
    );
    return;
  }
  await admin.from("telegram_link_codes").update({ used_at: new Date().toISOString() }).eq("id", linkCode.id);
  await admin.rpc("dr_audit", {
    p_project_id: null,
    p_unit_id: null,
    p_report_id: null,
    p_version_no: null,
    p_event: "DR.TELEGRAM_LINKED",
    p_actor: linkCode.employee_id,
    p_channel: "TELEGRAM",
    p_details: { telegram_user: hashToken(String(fromId)).slice(0, 16) },
  });
  await reply(
    chatId,
    `Linked to ${(profile?.full_name as string | null) ?? "your DCOS account"}. To report, use the Submit Daily Report button in your project group. I will message you here when a report needs your attention.`,
  );
}

/** /start inv_<token>: the reporter opened the invite an approver sent them. */
async function handleInvite(admin: SupabaseClient, chatId: number, fromId: number, token: string): Promise<void> {
  const { data, error } = await admin.rpc("dr_tg_redeem_invite", { p_token_hash: hashToken(token), p_telegram_user_id: fromId });
  if (error || !data) {
    await reply(chatId, drMessage(error, "This invite could not be used. Ask for a new one."));
    return;
  }
  const linked = data as { full_name: string | null; unit_code: string; unit_name: string };
  await reply(
    chatId,
    `Welcome${linked.full_name ? `, ${linked.full_name}` : ""}. You are now the reporter for ${linked.unit_code} ${linked.unit_name}. To send the daily report, tap Submit Daily Report in your project group. I will message you here when a report needs your attention.`,
  );
}

async function handlePrivate(admin: SupabaseClient, message: NonNullable<DrTelegramUpdate["message"]>): Promise<void> {
  const fromId = message.from?.id;
  if (!fromId) return;
  const [first = "", ...rest] = (message.text ?? "").trim().split(/\s+/);
  const command = first.toLowerCase().replace(/@\S+$/, "");

  const invite = command === "/start" ? parseInviteStartParam(rest[0]) : null;
  if (invite) {
    await handleInvite(admin, message.chat.id, fromId, invite);
  } else if (command === "/link") {
    await handleLink(admin, message.chat.id, fromId, rest[0]);
  } else if (command === "/start" && rest[0]?.startsWith("link_")) {
    await handleLink(admin, message.chat.id, fromId, rest[0].slice("link_".length));
  } else if (command === "/start" || command === "/help") {
    const profile = await linkedProfile(admin, fromId);
    await reply(
      message.chat.id,
      profile
        ? `You are linked as ${profile.full_name ?? "a DCOS user"}. To report, use the Submit Daily Report button in your project group. Messages typed in a chat are not a report.`
        : `This is the DCOS daily site report bot. ${HOW_TO_LINK}`,
    );
  }
}

/** Handles one update. Never throws: the webhook always answers 200. */
export async function handleDrBotUpdate(admin: SupabaseClient, update: DrTelegramUpdate | null): Promise<void> {
  try {
    if (!update) return;
    if (update.my_chat_member || isGroup(update.message?.chat)) await handleGroup(admin, update);
    else if (update.message?.chat?.type === "private") await handlePrivate(admin, update.message);
  } catch (e) {
    console.error("dr telegram update:", e instanceof Error ? e.message : e);
  }
}
