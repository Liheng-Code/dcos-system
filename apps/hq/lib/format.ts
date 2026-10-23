import type { DisplayState } from "@/lib/license-claims";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T00:00:00Z") : new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}

export function fmtLimit(n: number | null): string {
  return n === null ? "Unlimited" : String(n);
}

export const STATE_LABEL: Record<DisplayState, string> = {
  off: "Not enforced",
  unlicensed: "Not started",
  active: "Active",
  expiring: "Expiring",
  grace: "Grace",
  readonly: "Read-only",
  locked: "Locked",
  suspended: "Suspended",
  revoked: "Revoked",
  draft: "Draft",
  superseded: "Superseded",
  discarded: "Discarded",
  terminated: "Terminated",
};

// Text plus colour, never colour only (design 9.1.2). Status hues are reserved for
// state and never used as chart series.
const NEUTRAL = "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300";
const GOOD = "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/50 dark:text-emerald-300";
const WARN = "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/50 dark:text-amber-300";
const BAD = "border-red-200 bg-red-50 text-red-700 dark:border-red-800/70 dark:bg-red-950/50 dark:text-red-300";
const INFO = "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800/70 dark:bg-sky-950/50 dark:text-sky-300";

export const STATE_TONE: Record<DisplayState, string> = {
  off: NEUTRAL,
  unlicensed: NEUTRAL,
  active: GOOD,
  expiring: WARN,
  grace: WARN,
  readonly: BAD,
  locked: BAD,
  suspended: BAD,
  revoked: BAD,
  draft: INFO,
  superseded: NEUTRAL,
  discarded: NEUTRAL,
  terminated: NEUTRAL,
};

export function fmtMoney(amount: number | null | undefined, currency = "USD", compact = false): string {
  if (amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? "compact" : "standard",
  }).format(amount);
}

export const TYPE_LABEL = { trial: "Trial", subscription: "Subscription", enterprise: "Enterprise" } as const;
