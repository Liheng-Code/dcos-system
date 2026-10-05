// Module 10-01 Daily Reporting — Telegram codes, launch tokens and the Mini App
// session token. Pure functions (node:crypto only) so they can be unit tested.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** Prefix of the Mini App start parameter that carries a launch token. */
export const LAUNCH_PARAM_PREFIX = "dr_";
export const SESSION_TOKEN_PREFIX = "drm.";
/** A Mini App session lasts long enough to fill one report, then must be re-launched from the group. */
export const SESSION_TTL_SECONDS = 2 * 60 * 60;

// No 0/O, 1/I/L: the code is read off a screen and typed into a group chat.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Only hashes of codes and tokens are stored. */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** One-time code an admin posts in the group to bind it (e.g. `/bind K7QM2XPA`). */
export function newBindingCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

export function normalizeBindingCode(raw: string): string | null {
  const code = raw.trim().toUpperCase();
  return /^[A-Z2-9]{8}$/.test(code) ? code : null;
}

/**
 * Opaque launch token. Telegram allows 64 characters of [A-Za-z0-9_-] in a
 * start parameter, so the link carries a random id and the claims (binding,
 * unit, expiry) stay in the database.
 */
export function newLaunchToken(): string {
  return randomBytes(24).toString("base64url");
}

export function launchStartParam(token: string): string {
  return `${LAUNCH_PARAM_PREFIX}${token}`;
}

/** Extracts the launch token from a Mini App start parameter, or null if it is not one of ours. */
export function parseLaunchStartParam(startParam: string | null | undefined): string | null {
  if (!startParam || !startParam.startsWith(LAUNCH_PARAM_PREFIX)) return null;
  const token = startParam.slice(LAUNCH_PARAM_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,61}$/.test(token) ? token : null;
}

/** Prefix of the bot start parameter that carries a reporter invite. */
export const INVITE_PARAM_PREFIX = "inv_";

/** Opaque invite token; like a launch token it must fit Telegram's 64-character start parameter. */
export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function parseInviteStartParam(startParam: string | null | undefined): string | null {
  if (!startParam || !startParam.startsWith(INVITE_PARAM_PREFIX)) return null;
  const token = startParam.slice(INVITE_PARAM_PREFIX.length);
  return /^[A-Za-z0-9_-]{16,60}$/.test(token) ? token : null;
}

export interface MiniAppSessionClaims {
  /** DCOS user id. */
  uid: string;
  /** The one reporting unit this session may report for. */
  unit: string;
  binding: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

function sign(body: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(body).digest();
}

export function signMiniAppSession(claims: MiniAppSessionClaims, secret: string): string {
  const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${SESSION_TOKEN_PREFIX}${body}.${sign(body, secret).toString("base64url")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function verifyMiniAppSession(token: string, secret: string, nowSeconds = Date.now() / 1000): MiniAppSessionClaims | null {
  if (!token.startsWith(SESSION_TOKEN_PREFIX)) return null;
  const [body, mac, ...rest] = token.slice(SESSION_TOKEN_PREFIX.length).split(".");
  if (!body || !mac || rest.length > 0) return null;

  const expected = sign(body, secret);
  let provided: Buffer;
  try {
    provided = Buffer.from(mac, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;

  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MiniAppSessionClaims;
    if (!UUID.test(claims.uid) || !UUID.test(claims.unit) || !UUID.test(claims.binding)) return null;
    if (typeof claims.exp !== "number" || claims.exp < nowSeconds) return null;
    return claims;
  } catch {
    return null;
  }
}
