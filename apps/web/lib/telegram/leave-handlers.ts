import { SupabaseClient } from "@supabase/supabase-js";
import { sendMessage } from "@/lib/telegram/bot";
import { findProfileByTelegramUserId, NOT_LINKED_MESSAGE, type TelegramMessage } from "@/lib/telegram/webhook-handlers";
import {
  decideLeaveRequest,
  getLeaveBalanceSummary,
  getMyLeaveRequests,
  getPendingApprovalsForApprover,
} from "@/lib/hr/leave";

const APPLY_URL = "https://dcos-system-web.vercel.app/dashboard/hr/leave/apply";

const UUID_RE = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

// Telegram's legacy Markdown mode breaks on unescaped _, *, `, [ in dynamic
// text (e.g. a rejection reason or someone's name) — escape before interpolating.
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, "\\$1");
}

export async function handleApplyLeaveCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }
  await sendMessage(chatId, `Apply for leave here:\n${APPLY_URL}`);
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

  await sendMessage(chatId, `📅 Leave Balance (${year})\n\n${lines.join("\n")}`);
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

  const blocks = pending.map((r) => {
    const code = r.employee_code ? ` (${escapeMarkdown(r.employee_code)})` : "";
    const reasonLine = r.reason ? `\nReason: ${escapeMarkdown(r.reason)}` : "";
    return (
      `${escapeMarkdown(r.employee_name)}${code} — ${escapeMarkdown(r.leave_name)}, ${r.days_requested}d (${r.start_date} – ${r.end_date})` +
      reasonLine +
      `\n\n\`/approve ${r.id}\`\n\`/reject ${r.id} <reason>\``
    );
  });

  await sendMessage(chatId, `🗂 Leave requests awaiting your approval\n\n${blocks.join("\n\n———\n\n")}`, {
    parseMode: "Markdown",
  });
}

function decisionErrorMessage(error: string | undefined): string {
  switch (error) {
    case "not_found":
      return "Leave request not found.";
    case "not_pending":
      return "This request has already been decided, or isn't currently awaiting a fresh approval.";
    case "not_your_turn":
      return "This request isn't awaiting your decision right now.";
    case "reason_required":
      return "Please include a reason: /reject <id> <reason>";
    default:
      return "Something went wrong processing that request.";
  }
}

export async function handleApproveCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const match = (message.text ?? "").trim().match(new RegExp(`^/approve\\s+(${UUID_RE})\\s*$`, "i"));
  const requestId = match?.[1];
  if (!requestId) {
    await sendMessage(chatId, "Usage: /approve <id>");
    return;
  }

  const result = await decideLeaveRequest(admin, { requestId, approverId: profile.id, decision: "approved" });

  if (!result.ok) {
    await sendMessage(chatId, decisionErrorMessage(result.error));
    return;
  }

  if (result.isFinalApproval) {
    await sendMessage(
      chatId,
      `✅ Approved. ${result.employeeName}'s ${result.leaveName} request (${result.daysRequested}d, ${result.startDate} – ${result.endDate}) is now fully approved.`,
    );
  } else {
    await sendMessage(
      chatId,
      `✅ Approved your step. Forwarded to ${result.nextApproverName ?? "the next approver"} for final approval.`,
    );
  }
}

export async function handleRejectCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);
  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const match = (message.text ?? "").match(new RegExp(`^/reject\\s+(${UUID_RE})\\s+([\\s\\S]+)$`, "i"));
  const requestId = match?.[1];
  const reason = match?.[2]?.trim();
  if (!requestId || !reason) {
    await sendMessage(chatId, "Usage: /reject <id> <reason>");
    return;
  }

  const result = await decideLeaveRequest(admin, {
    requestId,
    approverId: profile.id,
    decision: "rejected",
    notes: reason,
  });

  if (!result.ok) {
    await sendMessage(chatId, decisionErrorMessage(result.error));
    return;
  }

  await sendMessage(chatId, `❌ Rejected ${result.employeeName}'s ${result.leaveName} request.`);
}
