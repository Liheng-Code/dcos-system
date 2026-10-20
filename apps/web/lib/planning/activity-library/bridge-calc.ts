// Planning <-> QS bridge, Phase 3 (doc 21): per-level quantities from the BOQ. Pure, no I/O.
//
//   BOQ line --(bridge rule: metric, unit factor)--> metric quantity
//            --(confirmed location map: level shares)--> level
//   => one quantity link per (level, metric, BOQ line) with factor = unit factor x level share.
//
// The links are ordinary plan_act_quantity_links rows (source "bridge_rule"), so the existing BOQ provider,
// generation, drift check and Quantity Links page read them unchanged. A level/metric the planner linked by
// hand is left alone. Durations are previewed with the same productivity engine generation uses.

import { allocateLine, type SavedLocation, type WbsLevel } from "./location-map";
import { calculateDuration } from "./productivity-engine";
import { classifyLine, type BridgeBoqLine, type BridgeRule } from "./qs-bridge";

export interface ProposedLink {
  wbs_node_id: string;
  metric_code: string;
  metric_unit: string;
  boq_item_id: string;
  boq_item_ref: string | null;
  boq_description: string | null;
  boq_unit: string | null;
  boq_quantity: number;
  /** BOQ quantity x factor = what this line gives the level's metric */
  factor: number;
  bridge_rule_id: string;
}

export interface LevelMetricQuantity {
  wbs_node_id: string;
  metric: string;
  unit: string;
  quantity: number;
  lines: number;
}

export interface BridgeCalcResult {
  links: ProposedLink[];
  /** summed per level and metric */
  quantities: LevelMetricQuantity[];
  /** driver lines whose location is not confirmed (or ignored / not split): their quantity reaches no level */
  unallocatedLines: number;
  unallocatedByLocation: Map<string, number>;
  /** level/metric pairs skipped because a planner linked them by hand */
  skippedManual: number;
}

export const pairKey = (nodeId: string, metric: string) => `${nodeId}|${metric}`;

const round = (n: number, dp = 6) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeBridgeLinks(
  lines: BridgeBoqLine[],
  rules: BridgeRule[],
  saved: SavedLocation[],
  levels: WbsLevel[],
  gfaByNode: Map<string, number>,
  manualPairs: Set<string>,
): BridgeCalcResult {
  const links: ProposedLink[] = [];
  const sums = new Map<string, LevelMetricQuantity>();
  const skipped = new Set<string>();
  const unallocatedByLocation = new Map<string, number>();
  let unallocatedLines = 0;
  const ruleById = new Map(rules.map((r) => [r.id, r]));

  for (const line of lines) {
    const c = classifyLine(line, rules);
    if (c.status !== "driver") continue;
    const shares = allocateLine({ building_code: line.building_code ?? null, level: line.level ?? null }, saved, levels, gfaByNode);
    if (shares.length === 0) {
      unallocatedLines++;
      const loc = `${line.building_code ?? ""} · ${line.level ?? "(blank)"}`;
      unallocatedByLocation.set(loc, (unallocatedByLocation.get(loc) ?? 0) + 1);
      continue;
    }
    for (const k of c.contributions) {
      const unitFactor = ruleById.get(k.ruleId)?.unit_factor ?? 1;
      for (const s of shares) {
        const key = pairKey(s.wbs_node_id, k.metric);
        if (manualPairs.has(key)) { skipped.add(key); continue; }
        const factor = round(unitFactor * s.share, 9);
        links.push({
          wbs_node_id: s.wbs_node_id,
          metric_code: k.metric,
          metric_unit: k.unit,
          boq_item_id: line.id,
          boq_item_ref: line.item_code ?? null,
          boq_description: line.description ?? null,
          boq_unit: line.unit,
          boq_quantity: line.quantity,
          factor,
          bridge_rule_id: k.ruleId,
        });
        const agg = sums.get(key) ?? { wbs_node_id: s.wbs_node_id, metric: k.metric, unit: k.unit, quantity: 0, lines: 0 };
        agg.quantity = round(agg.quantity + line.quantity * factor);
        agg.lines++;
        sums.set(key, agg);
      }
    }
  }

  return { links, quantities: [...sums.values()], unallocatedLines, unallocatedByLocation, skippedManual: skipped.size };
}

// ── Duration preview ─────────────────────────────────────────────────────────

export interface MasterRate {
  master_id: string;
  master_code: string;
  master_name: string;
  metric: string;
  unit: string | null;
  work_group: string | null;
  duration_basis: "quantity" | "fixed" | "programme";
  norm_code: string | null;
  norm_status: "draft" | "approved" | "retired" | null;
  /** adjusted output per crew-day (base x factors); null = no usable productivity standard */
  output_per_day: number | null;
}

export interface CellPreview {
  quantity: number;
  unit: string;
  lines: number;
  /** working days for one crew; null when the master has no rate or is not quantity-driven */
  days: number | null;
}

/** Duration of one master on one level, one crew, in whole working days (same rounding as generation). */
export function previewDays(quantity: number, rate: Pick<MasterRate, "output_per_day" | "duration_basis">): number | null {
  if (rate.duration_basis !== "quantity" || rate.output_per_day == null) return null;
  return calculateDuration(quantity, rate.output_per_day)?.days ?? null;
}

/** Rows = masters measuring a metric that has quantity somewhere; cells keyed by level node id. */
export function buildPreview(quantities: LevelMetricQuantity[], rates: MasterRate[]): { rate: MasterRate; cells: Map<string, CellPreview> }[] {
  const byMetric = new Map<string, LevelMetricQuantity[]>();
  for (const q of quantities) byMetric.set(q.metric, [...(byMetric.get(q.metric) ?? []), q]);
  return rates
    .filter((r) => byMetric.has(r.metric))
    .map((rate) => {
      const cells = new Map<string, CellPreview>();
      for (const q of byMetric.get(rate.metric) ?? []) {
        cells.set(q.wbs_node_id, { quantity: q.quantity, unit: q.unit, lines: q.lines, days: previewDays(q.quantity, rate) });
      }
      return { rate, cells };
    });
}
