// Module 10-01 Daily Reporting — Telegram channel adapter (server-only).
//
// Daily Reporting has its own bot (TELEGRAM_DR_BOT_TOKEN), separate from the
// attendance bot and the task-alert bot: its own webhook, its own Mini App,
// its own direct messages. A Telegram user id is the same for every bot, so
// the account link (profiles.telegram_user_id) is shared.
//
// Telegram is an interface, never a record: the group tells the bot where to
// post status lines and which unit a launch link belongs to. Group membership
// grants nothing. A Mini App session is issued only when all of these hold:
//   signed initData → linked DCOS account → valid launch token for an Active
//   binding → current REPORTER of that unit → current member of that group.

import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyTelegramInitData } from "@/lib/hr/telegram/init-data";
import {
  SESSION_TTL_SECONDS,
  hashToken,
  launchStartParam,
  newBindingCode,
  newLaunchToken,
  parseLaunchStartParam,
  signMiniAppSession,
} from "./tokens";

const TELEGRAM_API_BASE = "https://api.telegram.org";
/** Launch links are re-issued when the current one has less than this left. */
const LAUNCH_REFRESH_MARGIN_MS = 6 * 60 * 60 * 1000;

export class TelegramApiError extends Error {
  constructor(
    public method: string,
    public status: number,
    description: string,
  ) {
    super(`Telegram ${method} failed: ${status} ${description}`);
  }
}

/** Token of the Daily Reporting bot. There is deliberately no fallback to another bot's token. */
export function drBotToken(): string {
  const token = process.env.TELEGRAM_DR_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_DR_BOT_TOKEN is not configured");
  return token;
}

export const drBotConfigured = () => !!process.env.TELEGRAM_DR_BOT_TOKEN;

async function botCall<T>(method: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${TELEGRAM_API_BASE}/bot${drBotToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: T; description?: string } | null;
  if (!res.ok || !body?.ok) throw new TelegramApiError(method, res.status, body?.description ?? "");
  return body.result as T;
}

/** Secret for Mini App session tokens: its own variable, or derived from the bot token. */
export function miniAppSessionSecret(): string {
  return (
    process.env.DR_MINIAPP_SESSION_SECRET ||
    createHmac("sha256", "dcos-dr-miniapp-session").update(drBotToken()).digest("hex")
  );
}

/**
 * Direct link that opens the Daily Report Mini App with a launch token, e.g.
 * https://t.me/<bot>/<app>?startapp=dr_<token>. TELEGRAM_DR_MINIAPP_LINK is
 * the part before the query string, as registered with BotFather.
 */
export function launchUrl(token: string): string {
  const base = process.env.TELEGRAM_DR_MINIAPP_LINK;
  if (!base) throw new Error("TELEGRAM_DR_MINIAPP_LINK is not configured");
  return `${base.replace(/[?#].*$/, "")}?startapp=${launchStartParam(token)}`;
}

// ── Session exchange ────────────────────────────────────────────────────────
export type SessionFailure =
  | "DR_TG_INIT_DATA"
  | "DR_TG_LAUNCH"
  | "DR_TG_NOT_LINKED"
  | "DR_TG_NOT_REPORTER"
  | "DR_TG_NOT_IN_GROUP"
  | "DR_TG_UNAVAILABLE";

export type SessionExchangeResult =
  | {
      ok: true;
      token: string;
      expires_at: string;
      user_id: string;
      unit: { id: string; code: string; name: string; project_id: string };
      report_date: string;
    }
  | { ok: false; status: 401 | 403 | 503; code: SessionFailure; error: string };

const MEMBER_STATUSES = new Set(["creator", "administrator", "member"]);

/** True only when Telegram confirms the user is in the chat right now. */
export async function isChatMember(chatId: number, telegramUserId: number): Promise<boolean> {
  const member = await botCall<{ status: string; is_member?: boolean }>("getChatMember", {
    chat_id: chatId,
    user_id: telegramUserId,
  });
  return MEMBER_STATUSES.has(member.status) || (member.status === "restricted" && member.is_member === true);
}

function fail(status: 401 | 403 | 503, code: SessionFailure, error: string): SessionExchangeResult {
  return { ok: false, status, code, error };
}

async function auditRejected(
  admin: SupabaseClient,
  ids: { project_id?: string | null; unit_id?: string | null; user_id?: string | null },
  reason: SessionFailure,
  telegramUserId: number,
): Promise<void> {
  await admin.rpc("dr_audit", {
    p_project_id: ids.project_id ?? null,
    p_unit_id: ids.unit_id ?? null,
    p_report_id: null,
    p_version_no: null,
    p_event: "DR.LAUNCH_TOKEN_REJECTED",
    p_actor: ids.user_id ?? null,
    p_channel: "TELEGRAM_MINIAPP",
    // The Telegram id is stored hashed: the audit trail must not become a lookup table of accounts.
    p_details: { reason, telegram_user: hashToken(String(telegramUserId)).slice(0, 16) },
  });
}

/**
 * Turns Telegram's signed initData into a DCOS Mini App session for one unit.
 * The launch token is read from the start parameter inside the signed
 * initData, never from the request body, so a token cannot be replayed by a
 * different Telegram account than the one that opened the link.
 */
export async function exchangeMiniAppSession(admin: SupabaseClient, initDataRaw: string): Promise<SessionExchangeResult> {
  const maxAge = Number(process.env.TELEGRAM_MINIAPP_INITDATA_MAX_AGE_SECONDS) || 3600;
  const verified = verifyTelegramInitData(initDataRaw, drBotToken(), maxAge);
  if (!verified.ok) return fail(401, "DR_TG_INIT_DATA", "Open the report from the Telegram group again.");

  const launch = parseLaunchStartParam(verified.startParam);
  if (!launch) return fail(403, "DR_TG_LAUNCH", "Open the report with the Submit Daily Report button in your project group.");

  const { data: profile } = await admin
    .from("profiles")
    .select("id, status")
    .eq("telegram_user_id", verified.userId)
    .maybeSingle();
  if (!profile || profile.status !== "active") {
    await auditRejected(admin, {}, "DR_TG_NOT_LINKED", verified.userId);
    return fail(403, "DR_TG_NOT_LINKED", "Link your DCOS account first: open a private chat with this bot and send /start.");
  }
  const userId = profile.id as string;

  const { data: resolved, error: launchError } = await admin.rpc("dr_tg_resolve_launch", { p_token_hash: hashToken(launch) });
  if (launchError || !resolved) {
    await auditRejected(admin, { user_id: userId }, "DR_TG_LAUNCH", verified.userId);
    const message = /^DR_[A-Z_]+:\s*([\s\S]*)$/.exec(launchError?.message ?? "")?.[1];
    return fail(403, "DR_TG_LAUNCH", message ?? "This launch link is not valid. Ask for a new one in the group.");
  }
  const binding = resolved as {
    binding_id: string;
    unit_id: string;
    project_id: string;
    chat_id: number;
    unit_name: string;
    unit_code: string;
  };
  const ids = { project_id: binding.project_id, unit_id: binding.unit_id, user_id: userId };

  const today = new Date().toISOString().slice(0, 10);
  const { data: memberships } = await admin
    .from("dr_reporting_unit_members")
    .select("valid_from, valid_to")
    .eq("unit_id", binding.unit_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .eq("member_role", "REPORTER");
  const isReporter = (memberships ?? []).some(
    (m) => (m.valid_from as string) <= today && (!m.valid_to || (m.valid_to as string) >= today),
  );
  if (!isReporter) {
    await auditRejected(admin, ids, "DR_TG_NOT_REPORTER", verified.userId);
    return fail(403, "DR_TG_NOT_REPORTER", "You are not a reporter of this reporting unit.");
  }

  let inGroup: boolean;
  try {
    inGroup = await isChatMember(Number(binding.chat_id), verified.userId);
  } catch (e) {
    // "user not found" and similar are a definite no; anything else means we could not check.
    if (e instanceof TelegramApiError && e.status === 400) inGroup = false;
    else return fail(503, "DR_TG_UNAVAILABLE", "Telegram could not be reached. Try again, or use the Field App.");
  }
  if (!inGroup) {
    await auditRejected(admin, ids, "DR_TG_NOT_IN_GROUP", verified.userId);
    return fail(403, "DR_TG_NOT_IN_GROUP", "You are no longer a member of this project group.");
  }

  const { data: schedule } = await admin.rpc("dr_unit_schedule", { p_unit_id: binding.unit_id });
  const timezone = (schedule as { timezone?: string }[] | null)?.[0]?.timezone || "UTC";
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  return {
    ok: true,
    token: signMiniAppSession({ uid: userId, unit: binding.unit_id, binding: binding.binding_id, exp }, miniAppSessionSecret()),
    expires_at: new Date(exp * 1000).toISOString(),
    user_id: userId,
    unit: { id: binding.unit_id, code: binding.unit_code, name: binding.unit_name, project_id: binding.project_id },
    report_date: new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()),
  };
}

// ── Bindings ────────────────────────────────────────────────────────────────
export interface NewBinding {
  binding_id: string;
  code: string;
  command: string;
  expires_at: string;
}

/** Starts a binding and returns the one-time code to post in the group. The code is shown once and stored hashed. */
export async function createBinding(admin: SupabaseClient, actorId: string, unitId: string): Promise<NewBinding> {
  const code = newBindingCode();
  const { data, error } = await admin.rpc("dr_tg_create_binding", {
    p_actor: actorId,
    p_unit_id: unitId,
    p_code_hash: hashToken(code),
  });
  if (error) throw error;
  const row = data as { binding_id: string; expires_at: string };
  return { binding_id: row.binding_id, code, command: `/bind ${code}`, expires_at: row.expires_at };
}

interface BindingRow {
  id: string;
  chat_id: number | null;
  status: string;
  pinned_message_id: number | null;
}

/**
 * Issues a fresh launch token for an Active binding and puts the button in the
 * group: the pinned message is edited in place when there is one, otherwise a
 * new message is posted and pinned. Issuing revokes the binding's earlier tokens.
 */
export async function postLaunchMessage(admin: SupabaseClient, bindingId: string, actorId: string | null): Promise<void> {
  const { data } = await admin
    .from("dr_telegram_bindings")
    .select("id, chat_id, status, pinned_message_id")
    .eq("id", bindingId)
    .maybeSingle();
  const binding = data as BindingRow | null;
  if (!binding || binding.status !== "Active" || binding.chat_id === null) {
    throw new Error("DR_STATE: the binding is not active");
  }

  const token = newLaunchToken();
  const url = launchUrl(token);
  const { error } = await admin.rpc("dr_tg_issue_launch_token", {
    p_actor: actorId,
    p_binding_id: bindingId,
    p_token_hash: hashToken(token),
  });
  if (error) throw error;

  const chatId = Number(binding.chat_id);
  const replyMarkup = { inline_keyboard: [[{ text: "Submit Daily Report", url }]] };

  if (binding.pinned_message_id) {
    try {
      await botCall("editMessageReplyMarkup", { chat_id: chatId, message_id: binding.pinned_message_id, reply_markup: replyMarkup });
      return;
    } catch {
      // The pinned message was deleted or is too old to edit: post a new one.
    }
  }
  const message = await botCall<{ message_id: number }>("sendMessage", {
    chat_id: chatId,
    text: "Daily report: tap the button to fill in today's report. Chat messages in this group are not a report.",
    reply_markup: replyMarkup,
  });
  await admin.from("dr_telegram_bindings").update({ pinned_message_id: message.message_id }).eq("id", bindingId);
  // Pinning needs the bot to be a group admin; the link works without it.
  await botCall("pinChatMessage", { chat_id: chatId, message_id: message.message_id, disable_notification: true }).catch(() => undefined);
}

/** Cron: keeps every active group's launch button valid (tokens last at most 24 hours). */
export async function refreshLaunchMessages(admin: SupabaseClient): Promise<{ refreshed: number; failed: number }> {
  if (!process.env.TELEGRAM_DR_MINIAPP_LINK || !drBotConfigured()) return { refreshed: 0, failed: 0 };

  const { data: bindings } = await admin.from("dr_telegram_bindings").select("id").eq("status", "Active").eq("bot_present", true);
  const ids = (bindings ?? []).map((b) => b.id as string);
  if (ids.length === 0) return { refreshed: 0, failed: 0 };

  const cutoff = new Date(Date.now() + LAUNCH_REFRESH_MARGIN_MS).toISOString();
  const { data: tokens } = await admin
    .from("dr_telegram_launch_tokens")
    .select("binding_id")
    .in("binding_id", ids)
    .is("revoked_at", null)
    .gt("expires_at", cutoff);
  const fresh = new Set((tokens ?? []).map((t) => t.binding_id as string));

  let refreshed = 0;
  let failed = 0;
  for (const id of ids) {
    if (fresh.has(id)) continue;
    try {
      await postLaunchMessage(admin, id, null);
      refreshed++;
    } catch (e) {
      failed++;
      console.error("dr telegram launch refresh:", e instanceof Error ? e.message : e);
    }
  }
  return { refreshed, failed };
}

// ── Status lines ────────────────────────────────────────────────────────────
interface GroupOutboxRow {
  id: string;
  chat_id: number;
  text: string;
  attempts: number;
}

/**
 * Posts queued status lines ("DR-2026-000148 submitted") to their groups. The
 * text is written by the database from the audit trail and never contains
 * report content, findings or review comments.
 */
export async function drainGroupOutbox(admin: SupabaseClient, limit = 25): Promise<{ sent: number; failed: number }> {
  if (!drBotConfigured()) return { sent: 0, failed: 0 };
  const { data } = await admin
    .from("dr_telegram_group_outbox")
    .select("id, chat_id, text, attempts")
    .eq("status", "pending")
    .lt("attempts", 3)
    .order("created_at")
    .limit(limit);
  const rows = (data as GroupOutboxRow[] | null) ?? [];

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    let error: string | null = null;
    try {
      await botCall("sendMessage", { chat_id: Number(row.chat_id), text: row.text, disable_notification: true });
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    await admin
      .from("dr_telegram_group_outbox")
      .update({
        status: error === null ? "sent" : row.attempts + 1 >= 3 ? "failed" : "pending",
        attempts: row.attempts + 1,
        last_error: error,
        sent_at: error === null ? new Date().toISOString() : null,
      })
      .eq("id", row.id);
    if (error === null) sent++;
    else failed++;
  }
  return { sent, failed };
}

/**
 * Direct message from the Daily Reporting bot. A private chat's id is the
 * user's Telegram id. Telegram refuses (403) when the user has never started
 * this bot or has blocked it; that is reported as "unreachable", not an error.
 */
export async function sendDirectMessage(telegramUserId: number, text: string): Promise<"sent" | "unreachable"> {
  try {
    await botCall("sendMessage", { chat_id: telegramUserId, text });
    return "sent";
  } catch (e) {
    if (e instanceof TelegramApiError && (e.status === 403 || e.status === 400)) return "unreachable";
    throw e;
  }
}

/** Replies in a chat; failures are swallowed because the webhook must always answer 200. */
export async function reply(chatId: number, text: string): Promise<void> {
  await botCall("sendMessage", { chat_id: chatId, text }).catch((e) => {
    console.error("dr telegram reply:", e instanceof Error ? e.message : e);
  });
}
