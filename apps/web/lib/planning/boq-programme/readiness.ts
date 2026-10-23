// Pure data-readiness check for the BOQ-driven programme (doc 24, phase 1). No I/O.
// For each BOQ line it asks four questions and reports the share of BOQ VALUE (amount) that passes each:
//   mapped    the line points at a BOQ item (dwl_work_item_id)
//   linked    that BOQ item is linked to at least one current activity (plan_act_master_work_items, share > 0)
//   labour    that BOQ item has time-based labour: a labour resource whose unit is hr / day and whose row is not a
//             placeholder. Placeholders are: a note saying "derived % split", or consumption exactly 1 in a unit that
//             is not a time unit (migrated qs_cost_items rows carry 1.0 per m2 / m3 / no and are not hours).
//   located   building + level resolve through a saved plan_location_map decision: confirmed to a WBS node, or confirmed
//             with a split rule (project-wide lines shared over levels). Ignored decisions do not count.
// Lines that fail something are returned as blocking lines, each with a reason code.

import { normalizeUnit } from "@/lib/text-match";

export type ReadinessReason =
  | "not_mapped"
  | "not_linked"
  | "no_labour"
  | "labour_placeholder"
  | "labour_not_time"
  | "location_unmapped"
  | "location_ignored";

export interface ReadinessLine {
  id: string;
  itemCode: string;
  description: string;
  /** BOQ value of the line (quantity x rate). */
  amount: number;
  buildingCode: string | null;
  level: string | null;
  workItemId: string | null;
}

export interface LabourResourceFact {
  unit: string | null;
  consumption: number;
  basisNote?: string | null;
}

export interface WorkItemFacts {
  /** Linked to at least one current activity with share > 0. */
  linked: boolean;
  /** Labour resources of the item (category 'labor'). */
  labour: LabourResourceFact[];
}

/** One saved plan_location_map decision. */
export interface LocationFact {
  building_code: string | null;
  qs_level_label: string;
  wbs_node_id: string | null;
  status: "confirmed" | "ignored";
  split_rule: string;
}

export interface ReadinessContext {
  workItems: ReadonlyMap<string, WorkItemFacts>;
  locations: readonly LocationFact[];
}

export type StageKey = "mapped" | "linked" | "labour" | "located";

export interface StageResult { lines: number; value: number; pct: number }

export interface BlockingLine {
  lineId: string;
  itemCode: string;
  description: string;
  amount: number;
  /** Every stage the line fails (BOQ-item stages are only checked once the line is mapped). */
  reasons: ReadinessReason[];
  /** The first thing to fix. */
  primary: ReadinessReason;
}

export interface ReadinessReport {
  totalLines: number;
  totalValue: number;
  stages: Record<StageKey, StageResult>;
  /** Lines that pass every stage. */
  ready: StageResult;
  /** Biggest value first. */
  blocking: BlockingLine[];
}

const TIME_UNITS = new Set(["hr", "day"]);
const PLACEHOLDER_NOTE_RE = /derived\s*%?\s*split/i;

export type LabourKind = "time" | "placeholder" | "non_time";

/** Classifies one labour row of a BOQ item (see the header for the definition). */
export function classifyLabour(r: LabourResourceFact): LabourKind {
  const unit = normalizeUnit(r.unit);
  if (r.basisNote && PLACEHOLDER_NOTE_RE.test(r.basisNote)) return "placeholder";
  if (unit && TIME_UNITS.has(unit)) return "time";
  if (r.consumption === 1) return "placeholder";
  return "non_time";
}

/** Why a BOQ item's labour cannot drive durations, or null when it has time-based labour. */
export function labourProblem(
  labour: readonly LabourResourceFact[],
): Extract<ReadinessReason, "no_labour" | "labour_placeholder" | "labour_not_time"> | null {
  if (!labour.length) return "no_labour";
  const kinds = labour.map(classifyLabour);
  if (kinds.includes("time")) return null;
  return kinds.includes("non_time") ? "labour_not_time" : "labour_placeholder";
}

export const locationKey = (building: string | null | undefined, label: string | null | undefined): string =>
  `${(building ?? "").trim().toUpperCase()}|${(label ?? "").trim().toUpperCase()}`;

/** 'ok' when a confirmed decision places the line (on a node, or by a split rule). */
export function locationState(
  line: Pick<ReadinessLine, "buildingCode" | "level">,
  byKey: ReadonlyMap<string, LocationFact>,
): "ok" | "ignored" | "unmapped" {
  const loc = byKey.get(locationKey(line.buildingCode, line.level));
  if (!loc) return "unmapped";
  if (loc.status === "ignored") return "ignored";
  return loc.wbs_node_id || loc.split_rule !== "none" ? "ok" : "unmapped";
}

const pctOf = (part: number, whole: number, partLines: number, wholeLines: number): number => {
  if (whole > 0) return Math.round((part / whole) * 1000) / 10;
  return wholeLines > 0 ? Math.round((partLines / wholeLines) * 1000) / 10 : 0;
};

export function computeReadiness(lines: readonly ReadinessLine[], ctx: ReadinessContext): ReadinessReport {
  const byKey = new Map(ctx.locations.map((l) => [locationKey(l.building_code, l.qs_level_label), l]));
  const totalValue = lines.reduce((s, l) => s + (l.amount > 0 ? l.amount : 0), 0);

  const acc: Record<StageKey | "ready", { lines: number; value: number }> = {
    mapped: { lines: 0, value: 0 }, linked: { lines: 0, value: 0 }, labour: { lines: 0, value: 0 },
    located: { lines: 0, value: 0 }, ready: { lines: 0, value: 0 },
  };
  const hit = (k: keyof typeof acc, amount: number) => { acc[k].lines++; acc[k].value += amount > 0 ? amount : 0; };
  const blocking: BlockingLine[] = [];

  for (const l of lines) {
    const reasons: ReadinessReason[] = [];
    const facts = l.workItemId ? ctx.workItems.get(l.workItemId) : undefined;

    if (l.workItemId) {
      hit("mapped", l.amount);
      if (facts?.linked) hit("linked", l.amount); else reasons.push("not_linked");
      const problem = facts ? labourProblem(facts.labour) : "no_labour";
      if (problem === null) hit("labour", l.amount); else reasons.push(problem);
    } else {
      reasons.push("not_mapped");
    }

    const loc = locationState(l, byKey);
    if (loc === "ok") hit("located", l.amount);
    else reasons.push(loc === "ignored" ? "location_ignored" : "location_unmapped");

    if (reasons.length === 0) hit("ready", l.amount);
    else blocking.push({ lineId: l.id, itemCode: l.itemCode, description: l.description, amount: l.amount, reasons, primary: reasons[0] });
  }

  const stage = (k: keyof typeof acc): StageResult => ({
    lines: acc[k].lines, value: acc[k].value, pct: pctOf(acc[k].value, totalValue, acc[k].lines, lines.length),
  });
  blocking.sort((a, b) => b.amount - a.amount || a.itemCode.localeCompare(b.itemCode));
  return {
    totalLines: lines.length,
    totalValue,
    stages: { mapped: stage("mapped"), linked: stage("linked"), labour: stage("labour"), located: stage("located") },
    ready: stage("ready"),
    blocking,
  };
}
