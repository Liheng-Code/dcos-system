// Dashboard figures from the current license revisions. Pure, so tested.
// Only real data: seat and project *usage* needs heartbeats (Phase 3) and is
// not estimated here.

import type { DisplayState } from "@/lib/license-claims";

export interface MetricLicense {
  id: string;
  number: string;
  type: "trial" | "subscription" | "enterprise";
  status: string;
  state: DisplayState;
  valid_until: string;
  limit_users: number | null;
  limit_viewers: number | null;
  daysToExpiry: number | null;
  tenant: { id: string; display_name: string };
  plan: { code: string; display_name: string } | null;
  subscription: { net_amount: number | null; currency: string } | null;
}

// Revisions that are in force (issued, not revoked).
export function inForce(l: MetricLicense): boolean {
  return ["active", "suspended"].includes(l.status) && l.state !== "revoked";
}

export interface MonthBucket {
  key: string; // YYYY-MM
  label: string; // "Oct 26"
  value: number;
  count: number;
}

// Contract value coming up for renewal per month, this month and the next 11.
export function renewalsByMonth(licenses: MetricLicense[], now: number, months = 12): MonthBucket[] {
  const start = new Date(now);
  const buckets: MonthBucket[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    buckets.push({
      key: d.toISOString().slice(0, 7),
      label: d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" }),
      value: 0,
      count: 0,
    });
  }
  for (const l of licenses.filter(inForce)) {
    const bucket = buckets.find((b) => b.key === l.valid_until.slice(0, 7));
    if (!bucket) continue;
    bucket.value += l.subscription?.net_amount ?? 0;
    bucket.count += 1;
  }
  return buckets;
}

export interface PlanValue {
  plan: string;
  value: number;
  count: number;
}

export function valueByPlan(licenses: MetricLicense[]): PlanValue[] {
  const map = new Map<string, PlanValue>();
  for (const l of licenses.filter(inForce)) {
    const plan = l.plan?.display_name ?? "Custom";
    const row = map.get(plan) ?? { plan, value: 0, count: 0 };
    row.value += l.subscription?.net_amount ?? 0;
    row.count += 1;
    map.set(plan, row);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

// Lifecycle states in reading order; each shown with its own label, so colour
// never carries the meaning.
export const STATE_ORDER: DisplayState[] = ["active", "expiring", "grace", "readonly", "locked", "suspended", "draft"];

export function countByState(licenses: MetricLicense[]): { state: DisplayState; count: number }[] {
  return STATE_ORDER.map((state) => ({ state, count: licenses.filter((l) => l.state === state).length }));
}

export function upcomingRenewals(licenses: MetricLicense[], withinDays = 90): MetricLicense[] {
  return licenses
    .filter((l) => inForce(l) && l.daysToExpiry !== null && l.daysToExpiry <= withinDays)
    .sort((a, b) => a.valid_until.localeCompare(b.valid_until));
}

export interface Totals {
  contractValue: number;
  customers: number;
  seatsSold: number | null; // null when any in-force license is unlimited
  viewerSeatsSold: number | null;
  trials: number;
}

export function totals(licenses: MetricLicense[]): Totals {
  const live = licenses.filter(inForce);
  const sum = (pick: (l: MetricLicense) => number | null) =>
    live.some((l) => pick(l) === null) ? null : live.reduce((s, l) => s + (pick(l) ?? 0), 0);
  return {
    contractValue: live.reduce((s, l) => s + (l.subscription?.net_amount ?? 0), 0),
    customers: new Set(live.filter((l) => l.type !== "trial").map((l) => l.tenant.id)).size,
    seatsSold: sum((l) => l.limit_users),
    viewerSeatsSold: sum((l) => l.limit_viewers),
    trials: live.filter((l) => l.type === "trial").length,
  };
}
