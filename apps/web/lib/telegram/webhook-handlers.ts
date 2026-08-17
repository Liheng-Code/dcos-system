import { SupabaseClient } from "@supabase/supabase-js";
import { getFileBuffer, sendMessage } from "@/lib/telegram/bot";
import {
  AttendanceEmployeeProfile,
  getAttendanceProfileMessage,
  getBusinessDate,
  getBusinessTime,
  getTodayAttendanceLog,
  performAttendanceCheckIn,
  performAttendanceCheckOut,
} from "@/lib/hr/attendance";

export interface TelegramMessage {
  message_id: number;
  from: { id: number };
  chat: { id: number };
  text?: string;
  location?: { latitude: number; longitude: number };
  photo?: Array<{ file_id: string; file_size?: number; width: number; height: number }>;
}

type PendingAction =
  | "checkin_awaiting_location"
  | "checkin_awaiting_selfie"
  | "checkout_awaiting_location"
  | "checkout_awaiting_selfie";

interface AttendanceTelegramSession {
  telegram_user_id: number;
  employee_id: string;
  pending_action: PendingAction;
  lat: number | null;
  lng: number | null;
  created_at: string;
  expires_at: string;
}

const SESSION_TTL_MS = 5 * 60 * 1000;

function toBusinessHHMM(isoTimestamp: string): string {
  return getBusinessTime(new Date(isoTimestamp)).slice(0, 5);
}

function isSessionExpired(session: AttendanceTelegramSession): boolean {
  return new Date(session.expires_at).getTime() < Date.now();
}

async function loadSession(
  admin: SupabaseClient,
  telegramUserId: number,
): Promise<AttendanceTelegramSession | null> {
  const { data } = await admin
    .from("attendance_telegram_sessions")
    .select("telegram_user_id, employee_id, pending_action, lat, lng, created_at, expires_at")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  return (data as AttendanceTelegramSession | null) ?? null;
}

async function findProfileByTelegramUserId(admin: SupabaseClient, telegramUserId: number) {
  const { data } = await admin
    .from("profiles")
    .select("id, employee_id, full_name, status")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  return (data as AttendanceEmployeeProfile | null) ?? null;
}

const START_OVER_MESSAGE = "Send /checkin (or /checkout) again to start.";
const NOT_LINKED_MESSAGE = "You're not linked yet. Go to DCOS → Attendance → Link Telegram.";

export async function handleLinkCommand(
  admin: SupabaseClient,
  message: TelegramMessage,
  viaDeepLink: boolean,
): Promise<void> {
  const chatId = message.chat.id;
  const text = message.text ?? "";
  const match = viaDeepLink
    ? text.match(/^\/start\s+link_(\d{6})/)
    : text.match(/\/link\s+(\d{6})/);
  const code = match?.[1];

  const invalidReply = "❌ Invalid or expired code. Generate a new one in DCOS → Attendance.";

  if (!code) {
    await sendMessage(chatId, invalidReply);
    return;
  }

  const { data: linkCode } = await admin
    .from("telegram_link_codes")
    .select("id, employee_id, expires_at, used_at")
    .eq("code", code)
    .is("used_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!linkCode) {
    await sendMessage(chatId, invalidReply);
    return;
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, notification_preferences")
    .eq("id", linkCode.employee_id)
    .maybeSingle();

  const currentPrefs = (profile?.notification_preferences as Record<string, unknown> | null) ?? {};
  const mergedPrefs = {
    ...currentPrefs,
    telegram: true,
    telegram_chat_id: String(chatId),
  };

  const { error: updateError } = await admin
    .from("profiles")
    .update({ telegram_user_id: message.from.id, notification_preferences: mergedPrefs })
    .eq("id", linkCode.employee_id);

  if (updateError) {
    if (updateError.code === "23505") {
      await sendMessage(
        chatId,
        "❌ This Telegram account is already linked to a different employee. Contact HR if this is a mistake.",
      );
      return;
    }
    await sendMessage(chatId, "❌ Something went wrong linking your account. Please try again or contact HR.");
    return;
  }

  await admin
    .from("telegram_link_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", linkCode.id);

  await sendMessage(
    chatId,
    `✅ Telegram linked to ${profile?.full_name ?? "your account"}. You can now use /checkin and /checkout here.`,
  );
}

export async function handleCheckinCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);

  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const profileMessage = getAttendanceProfileMessage(profile);
  if (profileMessage) {
    await sendMessage(chatId, profileMessage);
    return;
  }

  const today = getBusinessDate();
  const existing = await getTodayAttendanceLog(admin, profile.id, today, "check_in");
  if (existing) {
    await sendMessage(chatId, `You already checked in today at ${toBusinessHHMM(existing.log_time)}.`);
    return;
  }

  await admin.from("attendance_telegram_sessions").upsert({
    telegram_user_id: message.from.id,
    employee_id: profile.id,
    pending_action: "checkin_awaiting_location" satisfies PendingAction,
    lat: null,
    lng: null,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  await sendMessage(chatId, "📍 Share your current location to check in.", { requestLocation: true });
}

export async function handleCheckoutCommand(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const profile = await findProfileByTelegramUserId(admin, message.from.id);

  if (!profile) {
    await sendMessage(chatId, NOT_LINKED_MESSAGE);
    return;
  }

  const profileMessage = getAttendanceProfileMessage(profile);
  if (profileMessage) {
    await sendMessage(chatId, profileMessage);
    return;
  }

  const today = getBusinessDate();
  const checkInLog = await getTodayAttendanceLog(admin, profile.id, today, "check_in");
  if (!checkInLog) {
    await sendMessage(chatId, "You haven't checked in today yet. Send /checkin first.");
    return;
  }

  const checkOutLog = await getTodayAttendanceLog(admin, profile.id, today, "check_out");
  if (checkOutLog) {
    await sendMessage(chatId, `You already checked out today at ${toBusinessHHMM(checkOutLog.log_time)}.`);
    return;
  }

  await admin.from("attendance_telegram_sessions").upsert({
    telegram_user_id: message.from.id,
    employee_id: profile.id,
    pending_action: "checkout_awaiting_location" satisfies PendingAction,
    lat: null,
    lng: null,
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });

  await sendMessage(chatId, "📍 Share your current location to check out.", { requestLocation: true });
}

export async function handleLocationMessage(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const location = message.location;
  if (!location) return;

  const session = await loadSession(admin, message.from.id);
  if (!session || isSessionExpired(session) || !session.pending_action.endsWith("_awaiting_location")) {
    await sendMessage(chatId, START_OVER_MESSAGE);
    return;
  }

  const nextAction = session.pending_action.replace("_awaiting_location", "_awaiting_selfie") as PendingAction;

  await admin
    .from("attendance_telegram_sessions")
    .update({
      lat: location.latitude,
      lng: location.longitude,
      pending_action: nextAction,
      expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    })
    .eq("telegram_user_id", message.from.id);

  await sendMessage(chatId, "📸 Now send a selfie to complete check-in/out.", { removeKeyboard: true });
}

export async function handlePhotoMessage(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  const chatId = message.chat.id;
  const photos = message.photo;
  if (!photos || photos.length === 0) return;

  const session = await loadSession(admin, message.from.id);
  if (!session || isSessionExpired(session) || !session.pending_action.endsWith("_awaiting_selfie")) {
    await sendMessage(chatId, START_OVER_MESSAGE);
    return;
  }

  try {
    const largestPhoto = photos[photos.length - 1];
    const { buffer, contentType } = await getFileBuffer(largestPhoto.file_id);

    const isCheckIn = session.pending_action === "checkin_awaiting_selfie";
    const actionInput = {
      employeeId: session.employee_id,
      method: "telegram" as const,
      lat: session.lat,
      lng: session.lng,
      selfieBuffer: buffer,
      selfieContentType: contentType,
    };

    const result = isCheckIn
      ? await performAttendanceCheckIn(admin, actionInput)
      : await performAttendanceCheckOut(admin, actionInput);

    if (result.status >= 200 && result.status < 300) {
      if (isCheckIn) {
        const checkInTime = typeof result.body.check_in_time === "string" ? result.body.check_in_time.slice(0, 5) : "";
        await sendMessage(chatId, `✅ Checked in at ${checkInTime} (${result.body.attendance_type}).`);
      } else {
        const checkOutTime = typeof result.body.check_out_time === "string" ? result.body.check_out_time.slice(0, 5) : "";
        await sendMessage(chatId, `✅ Checked out at ${checkOutTime}.`);
      }
    } else {
      const errorMessage = typeof result.body.error === "string" ? result.body.error : "Something went wrong.";
      await sendMessage(chatId, `❌ ${errorMessage}`);
    }
  } finally {
    await admin.from("attendance_telegram_sessions").delete().eq("telegram_user_id", message.from.id);
  }
}

export async function handleHelp(admin: SupabaseClient, message: TelegramMessage): Promise<void> {
  await sendMessage(
    message.chat.id,
    "DCOS Attendance Bot\n\n" +
      "/link <code> — link your Telegram account (get a code from DCOS → Attendance)\n" +
      "/checkin — check in with your location and a selfie\n" +
      "/checkout — check out with your location and a selfie\n" +
      "/help — show this message",
  );
}
