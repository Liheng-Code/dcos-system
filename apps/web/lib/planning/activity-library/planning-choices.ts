// Planning choices (Generate plan G4): which attributes Generate asks for a project category, their suggested
// values and labels. Pure; the catalogue is plan_act_attributes (migration 20261021000023), loaded by
// planning-choices-service.ts. Template / master conditions (applicability.ts) use the same keys and values.

import type { ProjectKind } from "@/lib/template-fit";

export interface PlanningChoice {
  key: string;
  label: string;
  description: string | null;
  options: { value: string; label: string }[];
  /** asked when the project's sector is listed OR its building type is; both empty = every project */
  sectors: string[];
  building_types: string[];
  /** suggested value per building type or sector slug (building type wins) */
  defaults: Record<string, string>;
  sort_order: number;
}

/** Attributes that come from the project itself (Settings › Project), never asked on Generate. */
export const PROJECT_ATTRIBUTES = ["sector", "building_type"] as const;

/** The choices to ask for this project, in catalogue order. A project without a category gets them all. */
export function choicesFor(catalogue: PlanningChoice[], kind: ProjectKind): PlanningChoice[] {
  const known = !!(kind.sector || kind.buildingType);
  return [...catalogue]
    .filter((c) => {
      if (!known) return true;
      if (c.sectors.length === 0 && c.building_types.length === 0) return true;
      return (!!kind.sector && c.sectors.includes(kind.sector)) || (!!kind.buildingType && c.building_types.includes(kind.buildingType));
    })
    .sort((a, b) => a.sort_order - b.sort_order);
}

/** Suggested value of a choice for the project (building type first, then sector); null = none. */
export function suggestedValue(choice: PlanningChoice, kind: ProjectKind): string | null {
  const v = (kind.buildingType && choice.defaults[kind.buildingType]) || (kind.sector && choice.defaults[kind.sector]) || null;
  return v && choice.options.some((o) => o.value === v) ? v : null;
}

/**
 * The attribute values a preview uses: the planner's picks over the suggestions, for the choices asked for this
 * project, plus sector / building type from the project. An explicit "" clears a suggestion.
 */
export function effectiveChoices(catalogue: PlanningChoice[], kind: ProjectKind, picks: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = { sector: kind.sector ?? "", building_type: kind.buildingType ?? "" };
  for (const c of choicesFor(catalogue, kind)) {
    const v = c.key in picks ? picks[c.key] : suggestedValue(c, kind) ?? "";
    if (v) out[c.key] = v;
  }
  return out;
}

/** Readable name of a value ("reinforced_concrete" → "Reinforced concrete"); falls back to the value. */
export function choiceValueLabel(catalogue: PlanningChoice[], key: string, value: string): string {
  return catalogue.find((c) => c.key === key)?.options.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

export function choiceLabel(catalogue: PlanningChoice[], key: string): string {
  if (key === "sector") return "Sector";
  if (key === "building_type") return "Building type";
  return catalogue.find((c) => c.key === key)?.label ?? key.replace(/_/g, " ");
}

/** Unmet template conditions in words: "Roof type: Pitched, tiled or Metal sheet (not set)". */
export function describeUnmet(
  results: { rule: { attribute: string; operator: string; values: string[] }; matched: boolean; missing: boolean }[],
  catalogue: PlanningChoice[],
  valueName: (attribute: string, value: string) => string = (a, v) => choiceValueLabel(catalogue, a, v),
): string[] {
  return results.filter((r) => !r.matched).map((r) => {
    const names = r.rule.values.map((v) => valueName(r.rule.attribute, v)).join(" or ");
    const negated = r.rule.operator === "neq" || r.rule.operator === "not_in";
    return `${choiceLabel(catalogue, r.rule.attribute)}: ${negated ? "not " : ""}${names}${r.missing ? " (not set)" : ""}`;
  });
}
