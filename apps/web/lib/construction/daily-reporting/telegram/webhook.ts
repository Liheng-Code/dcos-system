// Module 10-01 Daily Reporting — what the Telegram bot does in project groups.
// Public API of the construction module: called by the shared bot webhook
// (app/api/telegram/webhook). Server-only.
//
// The bot runs in privacy mode, so in a group it only receives commands and
// service messages. Ordinary chat never reaches it and is never a report.

import type { SupabaseClient } from "@supabase/supabase-js";
import { postLaunchMessage, reply } from "./telegram-server";
import { hashToken, normalizeBindingCode } from "./tokens";

interface TgChat {
  id: number;
  type?: string;
  title?: string;
}

export interface DrTelegramUpdate {
  message?: {
    chat: TgChat;
    from?: { id: number };
    text?: string;
    migrate_to_chat_id?: number;
  };
  my_chat_member?: {
    chat: TgChat;
    new_chat_member?: { status?: string };
  };
}

const isGroup = (chat: TgChat | undefined) => chat?.type === "group" || chat?.type === "supergroup";

/** True for updates that belong to a group. The webhook must not pass these to the private-chat handlers. */
export function isDrGroupUpdate(update: DrTelegramUpdate | null): boolean {
  return !!update && (isGroup(update.my_chat_member?.chat) || isGroup(update.message?.chat));
}

function drMessage(error: { message?: string } | null, fallback: string): string {
  return /^DR_[A-Z_]+:\s*([\s\S]*)$/.exec(error?.message ?? "")?.[1] ?? fallback;
}

async function profileIdFor(admin: SupabaseClient, telegramUserId: number | undefined): Promise<string | null> {
  if (!telegramUserId) return null;
  const { data } = await admin.from("profiles").select("id, status").eq("telegram_user_id", telegramUserId).maybeSingle();
  return data && data.status === "active" ? (data.id as string) : null;
}

async function tryPostLaunch(admin: SupabaseClient, bindingId: string, chatId: number): Promise<void> {
  try {
    await postLaunchMessage(admin, bindingId, null);
  } catch (e) {
    console.error("dr telegram launch message:", e instanceof Error ? e.message : e);
    await reply(chatId, "The group is bound, but the report button could not be posted. An administrator can re-issue it from DCOS.");
  }
}

async function handleBind(admin: SupabaseClient, chat: TgChat, fromId: number | undefined, rawCode: string): Promise<void> {
  const code = normalizeBindingCode(rawCode);
  if (!code) {
    await reply(chat.id, "Send /bind followed by the 8-character code shown in DCOS.");
    return;
  }
  const actor = await profileIdFor(admin, fromId);
  if (!actor) {
    await reply(chat.id, "Link your DCOS account to Telegram first, then post the code again.");
    return;
  }
  const { data, error } = await admin.rpc("dr_tg_bind_chat", {
    p_actor: actor,
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

/** Handles one group update. Never throws: the webhook always answers 200. */
export async function handleDrGroupUpdate(admin: SupabaseClient, update: DrTelegramUpdate): Promise<void> {
  try {
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
    if (command === "/bind") await handleBind(admin, message.chat, message.from?.id, rest[0] ?? "");
    else if (command === "/report") await handleReportCommand(admin, message.chat);
  } catch (e) {
    console.error("dr telegram group update:", e instanceof Error ? e.message : e);
  }
}
