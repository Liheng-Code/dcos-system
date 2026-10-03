// Links a Telegram account to an employee without a link code: the person shares their own
// phone number with the bot (Telegram verifies it belongs to that account) and it is matched to
// the phone in Employee Master. Anything that is not exactly one clear match goes to HR's inbox.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/hr/telegram/bot";
import { matchEmployeeByPhone } from "@/lib/hr/phone";

export interface ContactMessage {
  message_id: number;
  from: { id: number; first_name?: string; last_name?: string; username?: string };
  chat: { id: number };
  contact?: { phone_number: string; user_id?: number; first_name?: string; last_name?: string };
}

export type AutoLinkOutcome =
  | { kind: "linked"; fullName: string | null }
  | { kind: "already_linked"; fullName: string | null }
  | { kind: "not_own_contact" }
  | { kind: "pending"; reason: "no_match" | "multiple_match" | "already_linked" };

export const NOT_LINKED_PROMPT =
  "You're not linked to an employee yet. Tap the button below to share your phone number and I'll link you automatically.";

export async function sendNotLinked(chatId: number): Promise<void> {
  await sendMessage(chatId, NOT_LINKED_PROMPT, { requestContact: true });
}

/** Sets the Telegram id and chat on the employee. Returns an error code or null. */
export async function linkTelegramToEmployee(
  admin: SupabaseClient,
  employeeId: string,
  telegramUserId: number,
  chatId: number,
): Promise<"conflict" | "error" | null> {
  const { data: profile } = await admin.from("profiles").select("notification_preferences").eq("id", employeeId).maybeSingle();
  const prefs = (profile?.notification_preferences as Record<string, unknown> | null) ?? {};
  const { error } = await admin
    .from("profiles")
    .update({ telegram_user_id: telegramUserId, notification_preferences: { ...prefs, telegram: true, telegram_chat_id: String(chatId) } })
    .eq("id", employeeId);
  if (!error) return null;
  return error.code === "23505" ? "conflict" : "error";
}

async function recordPending(
  admin: SupabaseClient,
  message: ContactMessage,
  reason: "no_match" | "multiple_match" | "already_linked",
  candidates: string[],
): Promise<void> {
  const row = {
    chat_id: message.chat.id,
    telegram_name: [message.from.first_name, message.from.last_name].filter(Boolean).join(" ") || null,
    telegram_username: message.from.username ?? null,
    phone: message.contact?.phone_number ?? null,
    reason,
    candidate_employee_ids: candidates,
  };
  const { data: open } = await admin
    .from("telegram_link_requests")
    .select("id")
    .eq("telegram_user_id", message.from.id)
    .eq("status", "pending")
    .maybeSingle();
  if (open) await admin.from("telegram_link_requests").update(row).eq("id", open.id);
  else await admin.from("telegram_link_requests").insert({ ...row, telegram_user_id: message.from.id });
}

export async function autoLinkFromContact(admin: SupabaseClient, message: ContactMessage): Promise<AutoLinkOutcome> {
  const contact = message.contact;
  // Telegram only fills user_id with the sender's own id when the contact came from the share button.
  // A forwarded or hand-picked contact must never link someone else's number.
  if (!contact || contact.user_id !== message.from.id) return { kind: "not_own_contact" };

  const { data: existing } = await admin
    .from("profiles")
    .select("full_name")
    .eq("telegram_user_id", message.from.id)
    .maybeSingle();
  if (existing) return { kind: "already_linked", fullName: existing.full_name ?? null };

  const { data: staff } = await admin.from("profiles").select("id, full_name, phone, telegram_user_id").eq("status", "active").not("phone", "is", null);
  const people = (staff ?? []) as { id: string; full_name: string | null; phone: string | null; telegram_user_id: number | null }[];
  const match = matchEmployeeByPhone(contact.phone_number, people);

  if (match.kind === "none") { await recordPending(admin, message, "no_match", []); return { kind: "pending", reason: "no_match" }; }
  if (match.kind === "multiple") { await recordPending(admin, message, "multiple_match", match.employeeIds); return { kind: "pending", reason: "multiple_match" }; }

  const person = people.find((p) => p.id === match.employeeId)!;
  if (person.telegram_user_id !== null) {
    await recordPending(admin, message, "already_linked", [person.id]);
    return { kind: "pending", reason: "already_linked" };
  }
  const failed = await linkTelegramToEmployee(admin, person.id, message.from.id, message.chat.id);
  if (failed) {
    await recordPending(admin, message, "already_linked", [person.id]);
    return { kind: "pending", reason: "already_linked" };
  }

  await admin
    .from("telegram_link_requests")
    .update({ status: "linked", linked_employee_id: person.id, resolved_at: new Date().toISOString() })
    .eq("telegram_user_id", message.from.id)
    .eq("status", "pending");
  return { kind: "linked", fullName: person.full_name };
}

export async function handleContactMessage(admin: SupabaseClient, message: ContactMessage): Promise<void> {
  const chatId = message.chat.id;
  const outcome = await autoLinkFromContact(admin, message);
  switch (outcome.kind) {
    case "linked":
      await sendMessage(chatId, `✅ Linked to ${outcome.fullName ?? "your employee record"} using your phone number. You can now use /checkin and /checkout here.`, { removeKeyboard: true });
      break;
    case "already_linked":
      await sendMessage(chatId, `This Telegram account is already linked to ${outcome.fullName ?? "an employee"}.`, { removeKeyboard: true });
      break;
    case "not_own_contact":
      await sendMessage(chatId, "Please use the button to share your own phone number.", { requestContact: true });
      break;
    case "pending":
      await sendMessage(chatId, "Thanks. I couldn't match this number to one employee automatically, so HR has been notified and will link your account.", { removeKeyboard: true });
      break;
  }
}
