import { SupabaseClient } from "@supabase/supabase-js";
import { getBotToken } from "@/lib/hr/telegram/bot";
import { verifyTelegramInitData } from "@/lib/hr/telegram/init-data";
import { findProfileByTelegramUserId } from "@/lib/hr/telegram/webhook-handlers";
import { AttendanceEmployeeProfile } from "@/lib/hr/attendance";

const DEFAULT_MAX_AGE_SECONDS = 3600;
const AUTH_SCHEME_PREFIX = "tma ";

export type RequireMiniAppProfileResult =
  | { ok: true; profile: AttendanceEmployeeProfile }
  | { ok: false; status: 401; error: "missing_auth" }
  | { ok: false; status: 401; error: "invalid_init_data" }
  | { ok: false; status: 403; error: "not_linked" };

function getMaxAgeSeconds(): number {
  const raw = process.env.TELEGRAM_MINIAPP_INITDATA_MAX_AGE_SECONDS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? DEFAULT_MAX_AGE_SECONDS : parsed;
}

/**
 * Authenticates a Telegram Mini App request by validating the `initData`
 * payload carried in `Authorization: tma <initData>` (Telegram's documented
 * scheme for Mini App backend calls — distinct from the bot webhook's
 * `X-Telegram-Bot-Api-Secret-Token` header) and resolving it to a linked
 * DCOS profile.
 */
export async function requireMiniAppProfile(
  request: Request,
  admin: SupabaseClient,
): Promise<RequireMiniAppProfileResult> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith(AUTH_SCHEME_PREFIX)) {
    return { ok: false, status: 401, error: "missing_auth" };
  }

  const initDataRaw = authHeader.slice(AUTH_SCHEME_PREFIX.length);
  const result = verifyTelegramInitData(initDataRaw, getBotToken(), getMaxAgeSeconds());
  if (!result.ok) {
    return { ok: false, status: 401, error: "invalid_init_data" };
  }

  const profile = await findProfileByTelegramUserId(admin, result.userId);
  if (!profile) {
    return { ok: false, status: 403, error: "not_linked" };
  }

  return { ok: true, profile };
}
