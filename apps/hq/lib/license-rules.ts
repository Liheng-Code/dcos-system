// Create / revise license validation (design 9.1.4, rules V1-V8). Pure, so the
// rules are unit tested; app/actions/licenses.ts supplies the database facts.

import { z } from "zod";
import { AVAILABLE_FEATURES, LICENSABLE_MODULES } from "@dcos/licensing";
import { addDays, addMonths } from "@/lib/license-claims";

const limit = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().nullable(),
);
const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
);

export const licenseFormSchema = z.object({
  // Set when this is a new revision of an existing license.
  fromLicenseId: z.uuid().nullable().optional(),
  tenantId: z.uuid(),
  deploymentId: z.uuid({ message: "Choose a deployment." }),
  type: z.enum(["trial", "subscription", "enterprise"]),
  planId: z.uuid().nullable(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a start date."),
  // Subscription and enterprise: months. Trial: days.
  durationMonths: z.coerce.number().int().optional(),
  trialDays: z.coerce.number().int().optional(),
  // Enterprise only: a negotiated end date instead of a duration.
  validUntil: optionalDate,
  // Revisions only: keep the current term (plan change, entitlement edit).
  keepTerm: z.boolean().optional(),
  graceDays: z.coerce.number().int(),
  readonlyDays: z.coerce.number().int(),
  modules: z.array(z.string()),
  features: z.array(z.string()),
  limitUsers: limit,
  limitViewers: limit,
  limitProjects: limit,
  supportTier: z.enum(["standard", "premium"]),
  supportUntil: optionalDate,
  maintenanceUntil: optionalDate,
  netAmount: z.preprocess((v) => (v === "" || v === undefined || v === null ? null : Number(v)), z.number().min(0).nullable()),
  currency: z.string().trim().toUpperCase().length(3).default("USD"),
  poReference: z.preprocess((v) => (v === "" ? null : v), z.string().max(80).nullable().optional()),
  changeReason: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(500).nullable().optional()),
  notice: z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(300).nullable().optional()),
});

export type LicenseForm = z.infer<typeof licenseFormSchema>;

export interface RuleFacts {
  deploymentTenantId: string | null;
  deploymentStatus: string | null;
  // A different license is live on the deployment, or a draft is open (new licenses only).
  deploymentBusy: boolean;
  // The tenant already had a trial (V3).
  tenantHadTrial: boolean;
  // When revising: the plan's set, to require a reason for overrides (V5).
  planModules: string[] | null;
  planFeatures: string[] | null;
  // The live revision being revised, if any.
  previous: { validFrom: string; validUntil: string } | null;
}

export interface ResolvedTerm {
  validUntil: string;
}

// Returns the calculated end date, or the first rule broken.
export function checkLicenseForm(form: LicenseForm, facts: RuleFacts): { ok: true; term: ResolvedTerm } | { ok: false; error: string } {
  const isRevision = !!form.fromLicenseId;

  // V1
  if (facts.deploymentTenantId !== form.tenantId) return { ok: false, error: "That deployment belongs to another tenant." };
  if (facts.deploymentStatus === "decommissioned") return { ok: false, error: "That deployment is decommissioned." };
  if (!isRevision && facts.deploymentBusy) {
    return { ok: false, error: "This deployment already has a license or an open draft. Use Renew or Change plan on it instead." };
  }

  // V2, V3: the end date is calculated, except a negotiated Enterprise end date.
  let validUntil: string;
  if (isRevision && form.keepTerm) {
    if (!facts.previous) return { ok: false, error: "The revision being changed was not found." };
    if (form.validFrom !== facts.previous.validFrom) return { ok: false, error: "Keeping the term keeps its start date." };
    validUntil = facts.previous.validUntil;
  } else if (form.type === "trial") {
    const days = form.trialDays ?? 30;
    if (days < 14 || days > 60) return { ok: false, error: "A trial runs 14 to 60 days." };
    if (!isRevision && facts.tenantHadTrial) return { ok: false, error: "This tenant has already had a trial." };
    if (form.graceDays !== 0) return { ok: false, error: "A trial has no grace period." };
    validUntil = addDays(form.validFrom, days - 1);
  } else if (form.type === "enterprise" && form.validUntil) {
    validUntil = form.validUntil;
  } else {
    const months = form.durationMonths ?? 12;
    const max = form.type === "enterprise" ? 60 : 36;
    if (months < 1 || months > max) return { ok: false, error: `The term is 1 to ${max} months.` };
    validUntil = addMonths(form.validFrom, months);
  }
  if (validUntil < form.validFrom) return { ok: false, error: "The end date is before the start date." };
  const maxEnd = addMonths(form.validFrom, form.type === "enterprise" ? 60 : 36);
  if (validUntil > maxEnd) return { ok: false, error: "The term is too long." };

  // V4
  for (const [label, value] of [
    ["Users", form.limitUsers],
    ["Projects", form.limitProjects],
  ] as const) {
    if (value !== null && value < 1) return { ok: false, error: `${label} must be at least 1 (leave empty for unlimited).` };
  }
  if (form.limitViewers !== null && form.limitViewers < 0) return { ok: false, error: "Viewers cannot be negative." };

  // Catalogue, and V7 (API Access is not sellable yet)
  const badModule = form.modules.find((m) => !LICENSABLE_MODULES.includes(m));
  if (badModule) return { ok: false, error: `Unknown module ${badModule}.` };
  const badFeature = form.features.find((f) => !AVAILABLE_FEATURES.includes(f));
  if (badFeature) return { ok: false, error: `${badFeature} cannot be sold yet.` };

  // V5: anything beyond the plan needs a reason.
  if (facts.planModules && facts.planFeatures) {
    const beyond =
      form.modules.some((m) => !facts.planModules!.includes(m)) || form.features.some((f) => !facts.planFeatures!.includes(f));
    if (beyond && !form.changeReason) return { ok: false, error: "Give a reason for granting more than the plan includes." };
  }

  // V8
  const maxDays = form.type === "enterprise" ? 180 : 60;
  if (form.graceDays < 0 || form.graceDays > maxDays || form.readonlyDays < 0 || form.readonlyDays > maxDays) {
    return { ok: false, error: `Grace and read-only periods are 0 to ${maxDays} days.` };
  }

  if (isRevision && !form.changeReason) return { ok: false, error: "Say why this revision is needed." };

  return { ok: true, term: { validUntil } };
}
