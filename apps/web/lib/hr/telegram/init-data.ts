import crypto from "crypto";

/**
 * Telegram Mini App `initData` validation.
 *
 * Implements the official algorithm documented at
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Pure function — no Supabase/Next.js imports — so it can be unit tested in
 * isolation from the rest of the request pipeline.
 */

export interface TelegramInitDataUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  [key: string]: unknown;
}

export type VerifyInitDataResult =
  | { ok: true; userId: number; user: TelegramInitDataUser; startParam?: string }
  | { ok: false; reason: "missing_hash" | "bad_signature" | "expired" | "malformed" };

export function verifyTelegramInitData(
  raw: string,
  botToken: string,
  maxAgeSeconds = 3600,
): VerifyInitDataResult {
  try {
    const params = new URLSearchParams(raw);

    const hash = params.get("hash");
    if (!hash) {
      return { ok: false, reason: "missing_hash" };
    }
    params.delete("hash");

    const pairs: string[] = [];
    for (const [key, value] of params.entries()) {
      pairs.push(`${key}=${value}`);
    }
    pairs.sort();
    const dataCheckString = pairs.join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const computedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

    const computedBuf = Buffer.from(computedHash, "hex");
    const providedBuf = Buffer.from(hash, "hex");

    if (
      computedBuf.length !== providedBuf.length ||
      !crypto.timingSafeEqual(computedBuf, providedBuf)
    ) {
      return { ok: false, reason: "bad_signature" };
    }

    const authDateRaw = params.get("auth_date");
    const authDate = authDateRaw ? parseInt(authDateRaw, 10) : NaN;
    if (!authDateRaw || Number.isNaN(authDate)) {
      return { ok: false, reason: "malformed" };
    }

    const ageSeconds = Date.now() / 1000 - authDate;
    if (ageSeconds > maxAgeSeconds) {
      return { ok: false, reason: "expired" };
    }

    const userRaw = params.get("user");
    if (!userRaw) {
      return { ok: false, reason: "malformed" };
    }

    let user: TelegramInitDataUser;
    try {
      user = JSON.parse(userRaw) as TelegramInitDataUser;
    } catch {
      return { ok: false, reason: "malformed" };
    }

    if (typeof user?.id !== "number") {
      return { ok: false, reason: "malformed" };
    }

    const startParam = params.get("start_param") ?? undefined;

    return { ok: true, userId: user.id, user, startParam };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}
