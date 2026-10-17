// Quantity resolution over pluggable providers (BIM / BOQ / Manual). No provider knows about BIM software:
// each is just "give me the value of a metric for a WBS node". The rule says which metrics to add/deduct and
// which provider wins first.

import { sameUnit } from "../work-engine";
import type { ActQuantityRule, QuantityProviderKey } from "./types";

export interface QuantityValue {
  value: number;
  unit: string | null;
  /** reference for audit (document, BOQ item id, element set ...) */
  source_ref?: string | null;
}

export interface QuantityProvider {
  key: QuantityProviderKey;
  /** Returns null when the provider has no value for this metric/node. */
  get(nodeId: string, metricCode: string): Promise<QuantityValue | null>;
}

export interface ResolvedQuantity {
  quantity: number | null;
  unit: string | null;
  provider: QuantityProviderKey | null;
  /** where the figure came from (BOQ item numbers, model, ...), for the audit trail */
  source_ref: string | null;
  deducted: Record<string, number>;
  added: Record<string, number>;
  /** problems the confidence model turns into exceptions */
  issues: ("missing_quantity" | "unit_mismatch")[];
}

export async function resolveQuantity(
  rule: Pick<ActQuantityRule, "metric_code" | "unit" | "provider_priority" | "deduction_metrics" | "addition_metrics">,
  nodeId: string,
  providers: QuantityProvider[],
): Promise<ResolvedQuantity> {
  const byKey = new Map(providers.map((p) => [p.key, p]));
  const issues: ResolvedQuantity["issues"] = [];

  for (const key of rule.provider_priority) {
    const provider = byKey.get(key);
    if (!provider) continue;
    const base = await provider.get(nodeId, rule.metric_code);
    if (!base) continue;

    const deducted: Record<string, number> = {};
    const added: Record<string, number> = {};
    let total = base.value;
    for (const m of rule.deduction_metrics) {
      const v = (await provider.get(nodeId, m))?.value ?? 0;
      if (v) deducted[m] = v;
      total -= v;
    }
    for (const m of rule.addition_metrics) {
      const v = (await provider.get(nodeId, m))?.value ?? 0;
      if (v) added[m] = v;
      total += v;
    }
    if (rule.unit && base.unit && !sameUnit(rule.unit, base.unit)) issues.push("unit_mismatch");
    return { quantity: Math.max(0, total), unit: (base.unit && rule.unit && sameUnit(base.unit, rule.unit) ? rule.unit : base.unit) ?? rule.unit, provider: key, source_ref: base.source_ref ?? null, deducted, added, issues };
  }
  return { quantity: null, unit: rule.unit, provider: null, source_ref: null, deducted: {}, added: {}, issues: ["missing_quantity"] };
}
