// Browser-safe view of the license (design 4.1: the token itself never goes to
// browsers). Built on the server by toLicenseSummary, read by the client context.

import type { AccessMode, EffectiveLicense, LicenseMode, LicenseState, LimitStatus } from "@/lib/licensing/effective";

export interface LicenseSummary {
  mode: LicenseMode;
  state: LicenseState;
  access: AccessMode;
  enforced: boolean;
  modules: string[];
  features: string[];
  limits: { users: LimitStatus; viewers: LimitStatus; projects: LimitStatus };
  until: string | null;
  graceUntil: string | null;
  readonlyUntil: string | null;
  daysToExpiry: number | null;
  notice: string | null;
  license: {
    id: string;
    rev: number;
    type: "trial" | "subscription" | "enterprise";
    plan: string;
    planName: string | null;
    customer: string | null;
    from: string;
    graceDays: number;
    readonlyDays: number;
    support: { tier: string; maintenanceUntil: string | null; supportUntil: string | null } | null;
  } | null;
  // Administrators only.
  admin?: {
    installedAt: string | null;
    deploymentId: string | null;
    tokenError: string | null;
    events: { event_type: string; payload: Record<string, unknown>; occurred_at: string }[];
  };
}

export function toLicenseSummary(eff: EffectiveLicense): LicenseSummary {
  const c = eff.claims;
  return {
    mode: eff.mode,
    state: eff.state,
    access: eff.access,
    enforced: eff.enforced,
    modules: eff.modules,
    features: eff.features,
    limits: eff.limits,
    until: eff.until,
    graceUntil: eff.graceUntil,
    readonlyUntil: eff.readonlyUntil,
    daysToExpiry: eff.daysToExpiry,
    notice: eff.notice,
    license: c
      ? {
          id: c.lic.id,
          rev: c.lic.rev,
          type: c.lic.type,
          plan: c.lic.plan,
          planName: c.lic.plan_name ?? null,
          customer: c.lic.customer ?? null,
          from: c.lic.from,
          graceDays: c.lic.grace_days,
          readonlyDays: c.lic.readonly_days,
          support: c.support
            ? {
                tier: c.support.tier,
                maintenanceUntil: c.support.maintenance_until ?? null,
                supportUntil: c.support.support_until ?? null,
              }
            : null,
        }
      : null,
  };
}
