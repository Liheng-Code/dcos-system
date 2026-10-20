// Rule-based applicability: a template/master applies when every rule matches the project's attributes.

import type { ApplicabilityRule } from "./types";

export type ProjectAttributes = Record<string, string | null | undefined>;

export interface RuleResult {
  rule: ApplicabilityRule;
  matched: boolean;
  /** true when the project attribute is missing, so the planner needs to supply it */
  missing: boolean;
}

export interface ApplicabilityResult {
  applicable: boolean;
  results: RuleResult[];
  missing: string[];
}

const norm = (s: string) => s.trim().toLowerCase();

export function evaluateApplicability(rules: ApplicabilityRule[], attrs: ProjectAttributes): ApplicabilityResult {
  const results = rules.map<RuleResult>((rule) => {
    const raw = attrs[rule.attribute];
    if (raw == null || raw === "") return { rule, matched: false, missing: true };
    const v = norm(raw);
    const set = rule.values.map(norm);
    const hit = set.includes(v);
    const matched =
      rule.operator === "eq" || rule.operator === "in" ? hit : !hit; // neq / not_in
    return { rule, matched, missing: false };
  });
  return {
    applicable: results.every((r) => r.matched),
    results,
    missing: results.filter((r) => r.missing).map((r) => r.rule.attribute),
  };
}
