// License token claims (design section 4.1). This is the contract between the
// signer (scripts/licensing/issue-license.mjs, later DCOS HQ) and the app; change
// it only together with both.

import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
// null means unlimited.
const limit = z.number().int().nonnegative().nullable();

export const licenseClaimsSchema = z.object({
  iss: z.string(),
  sub: z.string(), // HQ tenant id
  aud: z.string(), // deployment id
  jti: z.string(),
  iat: z.number(),
  nbf: z.number(),
  exp: z.number(),
  prof: z.enum(["online", "offline"]),
  lic: z.object({
    id: z.string(),
    rev: z.number().int().nonnegative(),
    type: z.enum(["trial", "subscription", "enterprise"]),
    plan: z.string(),
    plan_name: z.string().optional(),
    customer: z.string().optional(),
    from: isoDate,
    until: isoDate,
    grace_days: z.number().int().nonnegative(),
    readonly_days: z.number().int().nonnegative(),
    hq_state: z.enum(["active", "suspended", "revoked", "terminated"]),
    suspend_mode: z.enum(["readonly", "locked"]).nullable().optional(),
    notice: z.string().nullable().optional(),
  }),
  ent: z.object({
    modules: z.array(z.string()),
    features: z.array(z.string()),
    limits: z.object({
      users: limit,
      viewers: limit,
      projects: limit,
      storage_gb: limit.optional(),
    }),
  }),
  support: z
    .object({
      tier: z.enum(["standard", "premium"]),
      maintenance_until: isoDate.nullable().optional(),
      support_until: isoDate.nullable().optional(),
    })
    .optional(),
  min_app: z.string().optional(),
});

export type LicenseClaims = z.infer<typeof licenseClaimsSchema>;
