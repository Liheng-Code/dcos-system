// QA/QC rules for a take-off version (Master Plan §11). Pure: returns the issues to store with
// qto_sync_issues. Each issue has a stable fingerprint, so rerunning validation updates the same
// open issue instead of adding a duplicate. The submit RPC re-checks the blocking rules in SQL.
import { dec, toNumber } from "./decimal";
import type { IssueSeverity, QtoItemFactor, RulesetDefinition, TakeoffItem } from "./types";
import { ITEM_UNITS } from "./units";

export interface ValidationIssue {
  rule_code: string;
  severity: IssueSeverity;
  message: string;
  item_id: string | null;
  fingerprint: string;
  evidence?: Record<string, unknown>;
}

export interface ValidationInput {
  version: { id: string; drawing_revision_id: string | null; ruleset_version_id: string | null };
  items: TakeoffItem[];
  factorsByItem?: Record<string, QtoItemFactor[]>;
  /** Item ids that have at least one calculation run. */
  calculatedItemIds?: Set<string>;
  ruleset?: RulesetDefinition | null;
  /** Baseline (previous version) items, for variance warnings. */
  baselineItems?: TakeoffItem[];
}

const blank = (s: string | null | undefined) => !s || s.trim().length === 0;

export function validateVersion(input: ValidationInput): ValidationIssue[] {
  const out: ValidationIssue[] = [];
  const push = (rule_code: string, severity: IssueSeverity, message: string, item: TakeoffItem | null,
                evidence?: Record<string, unknown>, key?: string) => {
    out.push({
      rule_code, severity, message, item_id: item?.id ?? null, evidence,
      fingerprint: `${rule_code}:${key ?? item?.id ?? "version"}`,
    });
  };

  const { version, ruleset } = input;
  const items = input.items.filter((i) => !i.is_deleted);
  if (!version.drawing_revision_id) push("MISSING_SOURCE", "BLOCKING", "The version has no source drawing revision", null);
  if (!version.ruleset_version_id) push("MISSING_RULESET", "BLOCKING", "The version has no measurement ruleset", null);
  if (items.length === 0) push("NO_ITEMS", "BLOCKING", "The version has no take-off items yet", null);

  const allowed = new Map((ruleset?.factors ?? []).map((f) => [f.name.toLowerCase(), f]));
  const maxVariance = ruleset?.validations?.max_variance_pct ?? 25;
  const seen = new Map<string, TakeoffItem>();

  for (const item of items) {
    const label = item.qto_no;
    let qty: number | null = null;
    try { qty = toNumber(dec(String(item.quantity))); } catch { qty = null; }

    // Blocking
    if (blank(item.description) || blank(item.work_section) || !item.unit) {
      push("ITEM_INCOMPLETE", "BLOCKING", `${label}: description, unit and work section are required`, item);
    }
    if (item.unit && !(ITEM_UNITS as readonly string[]).includes(item.unit)) {
      push("INVALID_UNIT", "BLOCKING", `${label}: unit "${item.unit}" is not a take-off unit`, item);
    }
    if (qty === null || qty < 0) push("INVALID_QUANTITY", "BLOCKING", `${label}: the quantity is not a valid non-negative number`, item);
    if (!item.drawing_revision_id) push("ITEM_NO_SOURCE", "BLOCKING", `${label}: no drawing revision recorded as evidence`, item);
    if (item.quantity_status === "EXCLUDED" && blank(item.exclusion_reason)) {
      push("EXCLUDED_NO_REASON", "BLOCKING", `${label}: excluded items need an exclusion reason`, item);
    }
    if (item.quantity_status === "PROVISIONAL" && blank(item.provisional_assumption)) {
      push("PROVISIONAL_NO_ASSUMPTION", "BLOCKING", `${label}: provisional items need a documented assumption`, item);
    }
    for (const f of input.factorsByItem?.[item.id] ?? []) {
      const rule = allowed.get(f.factor_name.toLowerCase());
      const v = Number(f.factor_value);
      if (ruleset && (!rule || v < rule.min || v > rule.max)) {
        push("UNAUTHORIZED_FACTOR", "BLOCKING",
          `${label}: factor ${f.factor_name} = ${f.factor_value} is not authorised by the ruleset`,
          item, { factor: f.factor_name, value: f.factor_value }, `${item.id}:${f.factor_name.toLowerCase()}`);
      }
    }

    // Warnings
    if (!item.wbs_node_id && !item.budget_code_id) {
      push("MISSING_CLASSIFICATION", "WARNING", `${label}: no WBS node or budget code`, item);
    }
    if (item.carry_status === "UNVERIFIED") {
      push("CARRY_UNVERIFIED", "WARNING", `${label}: carried forward but not yet revalidated against the new source`, item);
    }
    if (version.drawing_revision_id && item.drawing_revision_id && item.drawing_revision_id !== version.drawing_revision_id
        && item.carry_status !== "UNVERIFIED") {
      push("OTHER_SOURCE", "WARNING", `${label}: measured on a different drawing revision than the version's source`, item);
    }
    if (input.calculatedItemIds && qty !== null && qty > 0 && !input.calculatedItemIds.has(item.id)) {
      push("NO_CALCULATION", "WARNING", `${label}: quantity has no recorded calculation`, item);
    }

    const dupKey = [item.description, item.unit, item.work_section, item.building, item.level, item.zone, String(item.quantity)]
      .map((s) => (s ?? "").toString().trim().toLowerCase()).join("|");
    const first = seen.get(dupKey);
    if (first && qty !== null && qty > 0) {
      push("DUPLICATE", "WARNING", `${label}: looks like a duplicate of ${first.qto_no}`, item,
        { duplicate_of: first.id }, `${first.id}:${item.id}`);
    } else if (!first) {
      seen.set(dupKey, item);
    }
  }

  // Variance against the baseline, by carried-forward lineage.
  if (input.baselineItems?.length) {
    const base = new Map(input.baselineItems.map((b) => [b.id, b]));
    for (const item of items) {
      const prev = item.carried_from_item_id ? base.get(item.carried_from_item_id) : undefined;
      if (!prev) continue;
      const p = Number(prev.quantity);
      const n = Number(item.quantity);
      if (p > 0 && Math.abs((n - p) / p) * 100 > maxVariance) {
        push("LARGE_VARIANCE", "WARNING",
          `${item.qto_no}: quantity changed ${(((n - p) / p) * 100).toFixed(1)}% from the baseline (over ${maxVariance}%)`,
          item, { previous: p, current: n });
      }
    }
  }
  return out;
}

export function countBySeverity(issues: { severity: IssueSeverity }[]) {
  return {
    blocking: issues.filter((i) => i.severity === "BLOCKING").length,
    warning: issues.filter((i) => i.severity === "WARNING").length,
  };
}
