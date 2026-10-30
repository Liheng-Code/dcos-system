// Pure rate rules for project resources (plan_resources) linked to the QS cost library (dwl_resources).

import type { ResourceType } from "./resource-service";

export type RateSource = "override" | "qs" | "none";

/** QS cost-library resource offered for (or linked to) a project resource. */
export interface QsResourceOption {
  id: string;
  code: string;
  name: string;
  category: string;
  unit: string | null;
  /** dwl_v_resource_costing_rates.costing_rate: the QS rate (labour all-in when enabled); null when unpriced. */
  rate: number | null;
  currency: string | null;
}

/** dwl_resources.category that matches a Planning resource type. */
export const QS_CATEGORY: Record<ResourceType, string> = {
  labor: "labor",
  equipment: "equipment",
  material: "material",
  subcontractor: "subcon",
};

/**
 * The rate a project resource is costed at: its own override when set, else the linked QS rate, else none.
 * The unit goes with the rate (the override is per the resource's unit label, the QS rate per the QS unit).
 */
export function effectiveRate(
  resource: { cost_per_unit: number | null; unit_label: string | null },
  qs: Pick<QsResourceOption, "rate" | "unit" | "currency"> | null,
): { rate: number | null; unit: string | null; currency: string | null; source: RateSource } {
  if (resource.cost_per_unit != null) {
    return { rate: resource.cost_per_unit, unit: resource.unit_label, currency: qs?.currency ?? null, source: "override" };
  }
  if (qs && qs.rate != null) return { rate: qs.rate, unit: qs.unit, currency: qs.currency, source: "qs" };
  return { rate: null, unit: resource.unit_label, currency: null, source: "none" };
}

/** "22.48 USD/day", "12/day", or "-" when there is no rate. */
export function rateLabel(r: { rate: number | null; unit: string | null; currency: string | null }): string {
  if (r.rate == null) return "-";
  const amount = r.rate.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${amount}${r.currency ? ` ${r.currency}` : ""}${r.unit ? `/${r.unit}` : ""}`;
}
