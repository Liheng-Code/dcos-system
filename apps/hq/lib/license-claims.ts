// Turns a license revision into the claims that get signed (design 4.1), and the
// state HQ shows for it. Pure, so it is unit tested.

import {
  computeEffective,
  tokenExpiry,
  type LicenseClaims,
  type LicenseState,
} from "@dcos/licensing";
import type { Deployment, License, Plan, Tenant } from "@/lib/types";

export const HQ_ISSUER = "dcos-hq";

export interface ClaimsInput {
  license: License;
  tenant: Pick<Tenant, "code" | "display_name">;
  deployment: Pick<Deployment, "deployment_code" | "topology">;
  plan: Pick<Plan, "code" | "display_name"> | null;
}

// Everything in the claims except the per-signature fields (jti, iat, nbf).
export function stableClaims({ license, tenant, deployment, plan }: ClaimsInput): Omit<LicenseClaims, "jti" | "iat" | "nbf"> {
  return {
    iss: HQ_ISSUER,
    sub: tenant.code,
    aud: deployment.deployment_code,
    exp: tokenExpiry(license.valid_until, license.grace_days, license.readonly_days),
    prof: deployment.topology === "on_prem" ? "offline" : "online",
    lic: {
      id: license.number,
      rev: license.revision,
      type: license.type,
      plan: plan?.code ?? "CUSTOM",
      plan_name: plan?.display_name ?? "Custom",
      customer: tenant.display_name,
      from: license.valid_from,
      until: license.valid_until,
      grace_days: license.grace_days,
      readonly_days: license.readonly_days,
      hq_state: license.hq_state,
      suspend_mode: license.hq_state === "suspended" ? (license.suspend_mode ?? "locked") : null,
      notice: license.notice,
    },
    ent: {
      modules: [...license.modules].sort(),
      features: [...license.features].sort(),
      limits: { users: license.limit_users, viewers: license.limit_viewers, projects: license.limit_projects },
    },
    support: {
      tier: license.support_tier,
      maintenance_until: license.maintenance_until,
      support_until: license.support_until,
    },
  };
}

// Fresh claims for one signature.
export function claimsForSigning(input: ClaimsInput, now: number = Date.now()): LicenseClaims {
  const nowSec = Math.floor(now / 1000);
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return {
    ...stableClaims(input),
    jti: `lt_${input.license.number}_r${input.license.revision}_${random}`,
    iat: nowSec,
    nbf: nowSec - 300,
  } as LicenseClaims;
}

// The signed claims must be exactly the revision's claims: a signature is only
// accepted for what HQ prepared, never for something edited in the browser.
export function claimsMismatch(signed: LicenseClaims, input: ClaimsInput, now: number = Date.now()): string | null {
  const { jti, iat, nbf, ...rest } = signed;
  const expected = stableClaims(input);
  if (JSON.stringify(normalise(rest)) !== JSON.stringify(normalise(expected))) {
    return "The signed license does not match this revision.";
  }
  const expectedPrefix = `lt_${input.license.number}_r${input.license.revision}_`;
  if (!jti.startsWith(expectedPrefix)) return "The token id does not belong to this revision.";
  const nowSec = Math.floor(now / 1000);
  if (Math.abs(iat - nowSec) > 3600 || nbf > iat) return "The signature is too old; sign again.";
  return null;
}

// Stable key order so two equal claim objects serialise identically.
function normalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalise(v)]),
    );
  }
  return value;
}

export type DisplayState = LicenseState | "draft" | "superseded" | "discarded" | "terminated";

// State to show for a revision: the tenant-side lifecycle for live revisions
// (computed from the dates, exactly as the tenant app computes it), the stored
// status otherwise.
export function displayState(license: License, now: number = Date.now()): { state: DisplayState; daysToExpiry: number | null } {
  if (license.status === "draft" || license.status === "superseded" || license.status === "discarded" || license.status === "terminated") {
    return { state: license.status, daysToExpiry: null };
  }
  const claims = {
    ...stableClaims({
      license,
      tenant: { code: "x", display_name: "x" },
      deployment: { deployment_code: "x", topology: "saas_dedicated" },
      plan: null,
    }),
    jti: "x",
    iat: 0,
    nbf: 0,
  } as LicenseClaims;
  const eff = computeEffective("enforce", claims, now, { users: 0, viewers: 0, projects: 0 });
  return { state: eff.state, daysToExpiry: eff.daysToExpiry };
}

export function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0); // 31 Jan + 1 month = 28/29 Feb
  // The term ends the day before the same date in the following period.
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
