import { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/telegram/bot";
import { findProfileByTelegramUserId, NOT_LINKED_MESSAGE, type TelegramMessage } from "@/lib/telegram/webhook-handlers";
import { getLeaveBalanceSummary, getMyLeaveRequests, getPendingApprovalsForApprover } from "@/lib/hr/leave";

// Retired text-command flow (/approve <id>, /reject <id> <reason>) now redirects
// here — decisions are made via the Review button's Mini App screen instead.
const APPROVE_REJECT_REDIRECT_MESSAGE =
  "Please use the Review button from /pending to approve or reject requests.";

// Cap on individual per-request review buttons in one /pending reply. Telegram
// inline keyboards technically allow more, but a long unbounded list of rows
// is unwieldy — beyond this, point people at the full list in the Mini App.
const MAX_PENDING_REVIEW_BUTTONS = 10;

export async function handleApplyLeaveCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }
  const miniAppBaseUrl = process.env.TELEGRAM_MINIAPP_BASE_URL;
  if (!miniAppBaseUrl) {
    console.warn("TELEGRAM_MINIAPP_BASE_URL is not configured — cannot send Apply Leave button");
    await sendMessage(chatId, "Leave application isn't available right now. Please contact HR.");
    return;
  }

  await sendMessage(chatId, "Apply for leave:", {
    inlineKeyboard: [[{ text: "📝 Apply for Leave", web_app: { url: `${miniAppBaseUrl}/leave/apply` } }]],
  });
}

export async function handleBalanceCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const year = new Date().getFullYear();
  const balances = await getLeaveBalanceSummary(admin, profile.id, year);

  if (balances.length === 0) {
    await sendMessage(chatId, `No leave balance records found for ${year}. Contact HR to have your balance set up.`);
    return;
  }

  const lines = balances.map((b) => {
    const carried = b.carried_over_days > 0 ? `, ${b.carried_over_days} carried over` : "";
    return `${b.leave_name}: ${b.remaining_days} remaining (${b.used_days} used of ${b.allocated_days}${carried})`;
  });

  const miniAppBaseUrl = process.env.TELEGRAM_MINIAPP_BASE_URL;
  if (!miniAppBaseUrl) {
    console.warn("TELEGRAM_MINIAPP_BASE_URL is not configured — skipping Mini App button on /balance reply");
  }

  await sendMessage(chatId, `📅 Leave Balance (${year})\n\n${lines.join("\n")}`, {
    inlineKeyboard: miniAppBaseUrl
      ? [[{ text: "📱 Open in App", web_app: { url: `${miniAppBaseUrl}/leave/balance` } }]]
      : undefined,
  });
}

export async function handleMyLeaveCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const requests = await getMyLeaveRequests(admin, profile.id, 10);

  if (requests.length === 0) {
    await sendMessage(chatId, "You have no leave requests yet. Send /apply to submit one.");
    return;
  }

  const lines = requests.map((r) => {
    const half = r.is_half_day ? " (half-day)" : "";
    const pending = r.pending_approver_name ? ` — awaiting ${r.pending_approver_name}` : "";
    return `${r.leave_name} — ${r.start_date} to ${r.end_date} (${r.days_requested}d)${half} — ${r.status.replace(/_/g, " ").toUpperCase()}${pending}`;
  });

  await sendMessage(chatId, `📋 Your Recent Leave Requests\n\n${lines.join("\n\n")}`);
}

export async function handlePendingApprovalsCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const pending = await getPendingApprovalsForApprover(admin, profile.id);

  if (pending.length === 0) {
    await sendMessage(chatId, "No leave requests are awaiting your approval.");
    return;
  }

  const miniAppBaseUrl = process.env.TELEGRAM_MINIAPP_BASE_URL;
  if (!miniAppBaseUrl) {
    console.warn("TELEGRAM_MINIAPP_BASE_URL is not configured — cannot send approval review buttons");
    await sendMessage(chatId, "Leave approvals aren't available right now. Please contact HR.");
    return;
  }

  const shown = pending.slice(0, MAX_PENDING_REVIEW_BUTTONS);
  const buttons = shown.map((r) => [
    {
      text: `Review — ${r.employee_name} (${r.days_requested}d)`,
      web_app: { url: `${miniAppBaseUrl}/leave/approvals/${r.id}` },
    },
  ]);

  const truncated = pending.length > MAX_PENDING_REVIEW_BUTTONS;
  if (truncated) {
    buttons.push([
      { text: `📂 Open Approvals (see all ${pending.length})`, web_app: { url: `${miniAppBaseUrl}/leave/approvals` } },
    ]);
  }

  const header = truncated
    ? `🗂 You have ${pending.length} leave requests awaiting your approval. Showing the first ${MAX_PENDING_REVIEW_BUTTONS}:`
    : `🗂 Leave requests awaiting your approval (${pending.length}):`;

  await sendMessage(chatId, header, { inlineKeyboard: buttons });
}

// Text commands are retired in favor of the Review button from /pending, which
// opens the Mini App's approval screen. decideLeaveRequest is still exercised
// by app/api/telegram/miniapp/leave/{approve,reject}/route.ts — only the bot's
// raw-UUID command entry point goes away here.
export async function handleApproveCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  await sendMessage(message.chat.id, APPROVE_REJECT_REDIRECT_MESSAGE);
}

export async function handleRejectCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  await sendMessage(message.chat.id, APPROVE_REJECT_REDIRECT_MESSAGE);
}
