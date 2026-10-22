// Turns verified claims plus the current time into what the app may do
// (design sections 5 and 7.1). Pure: no I/O, so the same rules can be unit tested
// with an injected clock. supabase/migrations/20261019000001_licensing.sql mirrors the
// lifecycle part for the database checks; keep the two in step.

import type { LicenseClaims } from "./claims";
import { ALWAYS_ON_MODULES, ALL_FEATURES, LICENSABLE_MODULES } from "./catalogue";

// off: licensing disabled (local dev, CI, deployments without a license yet).
// report: evaluate and log denials but allow everything.
// enforce: deny.
export type LicenseMode = "off" | "report" | "enforce";

export type LicenseState =
  | "off"
  | "unlicensed"
  | "active"
  | "expiring"
  | "grace"
  | "readonly"
  | "locked"
  | "suspended"
  | "revoked";

// What the app allows overall, before per-module checks.
export type AccessMode = "full" | "readonly" | "locked";

export interface Usage {
  users: number;
  viewers: number;
  projects: number;
}

export interface LimitStatus {
  used: number;
  limit: number | null;
  over: boolean;
  atLimit: boolean;
}

export interface EffectiveLicense {
  mode: LicenseMode;
  state: LicenseState;
  access: AccessMode;
  // True when denials are applied (mode enforce); false in off and report.
  enforced: boolean;
  modules: string[];
  features: string[];
  limits: { users: LimitStatus; viewers: LimitStatus; projects: LimitStatus };
  // Last day of the term (YYYY-MM-DD) and the last day of each later phase.
  until: string | null;
  graceUntil: string | null; // last full-access day
  readonlyUntil: string | null; // last read-only day
  daysToExpiry: number | null;
  notice: string | null;
  claims: LicenseClaims | null;
  // Why the token was rejected, when there is one but it is not valid.
  tokenError: string | null;
}

const DAY_MS = 86_400_000;
export const EXPIRING_DAYS = 60;
export const EXPIRING_ALL_USERS_DAYS = 14;

// The term ends at the end of `until` (UTC).
function termEnd(until: string): number {
  return Date.parse(until + "T00:00:00Z") + DAY_MS;
}

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function limitStatus(used: number, limit: number | null | undefined): LimitStatus {
  const l = limit ?? null;
  return { used, limit: l, over: l !== null && used > l, atLimit: l !== null && used >= l };
}

const ALL_MODULES = [...ALWAYS_ON_MODULES, ...LICENSABLE_MODULES];

export function computeEffective(
  mode: LicenseMode,
  claims: LicenseClaims | null,
  now: number,
  usage: Usage,
  tokenError: string | null = null,
): EffectiveLicense {
  const unlimited = {
    users: limitStatus(usage.users, null),
    viewers: limitStatus(usage.viewers, null),
    projects: limitStatus(usage.projects, null),
  };
  const base = {
    mode,
    enforced: mode === "enforce",
    until: null,
    graceUntil: null,
    readonlyUntil: null,
    daysToExpiry: null,
    notice: null,
    claims,
    tokenError,
  };

  if (mode === "off") {
    if (!claims) {
      return { ...base, state: "off", access: "full", modules: ALL_MODULES, features: ALL_FEATURES, limits: unlimited };
    }
    // Nothing is enforced, but an installed license is still described as it
    // stands (dates, limits, what it includes) for the License page. Every check
    // short-circuits on mode "off", so these lists grant or remove nothing.
    const described = computeEffective("report", claims, now, usage, tokenError);
    return { ...described, mode, enforced: false, state: "off", access: "full" };
  }
  if (!claims) {
    return { ...base, state: "unlicensed", access: "locked", modules: ALWAYS_ON_MODULES, features: [], limits: unlimited };
  }

  const end = termEnd(claims.lic.until);
  const graceEnd = end + claims.lic.grace_days * DAY_MS;
  const readonlyEnd = graceEnd + claims.lic.readonly_days * DAY_MS;
  const daysToExpiry = Math.ceil((end - now) / DAY_MS);

  let state: LicenseState;
  let access: AccessMode;
  if (claims.lic.hq_state === "revoked" || claims.lic.hq_state === "terminated") {
    state = "revoked";
    access = "locked";
  } else if (claims.lic.hq_state === "suspended") {
    state = "suspended";
    access = claims.lic.suspend_mode === "readonly" ? "readonly" : "locked";
  } else if (now < Date.parse(claims.lic.from + "T00:00:00Z")) {
    // Issued ahead of its start date: not valid yet.
    state = "unlicensed";
    access = "locked";
  } else if (now < end) {
    state = daysToExpiry <= EXPIRING_DAYS ? "expiring" : "active";
    access = "full";
  } else if (now < graceEnd) {
    state = "grace";
    access = "full";
  } else if (now < readonlyEnd) {
    state = "readonly";
    access = "readonly";
  } else {
    state = "locked";
    access = "locked";
  }

  const modules = [...new Set([...ALWAYS_ON_MODULES, ...claims.ent.modules])];
  const limits = claims.ent.limits;
  return {
    ...base,
    state,
    access,
    modules: access === "locked" ? ALWAYS_ON_MODULES : modules,
    features: access === "full" ? claims.ent.features : [],
    limits: {
      users: limitStatus(usage.users, limits.users),
      viewers: limitStatus(usage.viewers, limits.viewers),
      projects: limitStatus(usage.projects, limits.projects),
    },
    until: claims.lic.until,
    graceUntil: isoDay(graceEnd - DAY_MS),
    readonlyUntil: isoDay(readonlyEnd - DAY_MS),
    daysToExpiry,
    notice: claims.lic.notice ?? null,
  };
}
