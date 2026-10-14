// BIM quantity provider - pure parts (Phase 3.4, Planning side). The data comes from bim_element_takeoff, which the
// Design/BIM team fills. Planning never trusts it blindly: a coverage report says how much of each structural class is
// usable (has a quantity AND a storey), and the provider only sums elements that are.

import { normalizeLevel } from "../boq-matching";
import { floorNumber } from "./boq-quantity";
import { normalizeUnit } from "../work-engine";

export const STRUCTURAL_CLASSES = ["IFCSLAB", "IFCBEAM", "IFCCOLUMN", "IFCWALL", "IFCWALLSTANDARDCASE", "IFCREINFORCINGBAR"] as const;

/** Share of a class that must be usable before the planner may rely on it. */
export const COVERAGE_MIN = 0.8;

export interface BimElementRow {
  ifc_class: string | null;
  unit: string | null;
  quantity: number | null;
  level: string | null;
  building_level: string | null;
  /** other quantities of the same element by unit (m3, m2, m, kg), stored by the extractor in raw_properties._quantities */
  extra?: Record<string, number> | null;
}

/** The element's quantity in `unit`: the table's own quantity when its unit matches, else the secondary quantity of that unit. */
export function quantityIn(r: Pick<BimElementRow, "unit" | "quantity" | "extra">, unit: string): number | null {
  const want = normalizeUnit(unit);
  if (r.quantity != null && r.quantity > 0 && normalizeUnit(r.unit) === want) return r.quantity;
  if (r.extra) {
    for (const [u, q] of Object.entries(r.extra)) if (normalizeUnit(u) === want && typeof q === "number" && q > 0) return q;
  }
  return null;
}

const hasAnyQuantity = (r: Pick<BimElementRow, "quantity" | "extra">): boolean =>
  (r.quantity != null && r.quantity > 0) || (!!r.extra && Object.values(r.extra).some((q) => typeof q === "number" && q > 0));

/** The storey label of an element: building_level when present, else level. */
export function bimLevelKey(r: Pick<BimElementRow, "level" | "building_level">): string | null {
  const k = (r.building_level ?? "").trim() || (r.level ?? "").trim();
  return k || null;
}

export interface ClassCoverage {
  ifc_class: string;
  total: number;
  withQuantity: number;
  withLevel: number;
  /** has both a quantity > 0 and a storey */
  usable: number;
  /** usable / total, 0..1 */
  usableShare: number;
  units: string[];
  ready: boolean;
}

export function coverageByClass(rows: BimElementRow[], min = COVERAGE_MIN): ClassCoverage[] {
  const by = new Map<string, { total: number; q: number; lv: number; ok: number; units: Set<string> }>();
  for (const r of rows) {
    const c = (r.ifc_class ?? "").toUpperCase();
    if (!c) continue;
    const e = by.get(c) ?? { total: 0, q: 0, lv: 0, ok: 0, units: new Set<string>() };
    const hasQ = hasAnyQuantity(r);
    const hasL = bimLevelKey(r) != null;
    e.total++;
    if (hasQ) e.q++;
    if (hasL) e.lv++;
    if (hasQ && hasL) {
      e.ok++;
      const u = normalizeUnit(r.unit);
      if (u && r.quantity != null && r.quantity > 0) e.units.add(u);
      for (const [eu, q] of Object.entries(r.extra ?? {})) if (typeof q === "number" && q > 0) { const n = normalizeUnit(eu); if (n) e.units.add(n); }
    }
    by.set(c, e);
  }
  return [...by.entries()]
    .map(([ifc_class, e]) => ({
      ifc_class, total: e.total, withQuantity: e.q, withLevel: e.lv, usable: e.ok,
      usableShare: e.total ? Math.round((e.ok / e.total) * 1000) / 1000 : 0, units: [...e.units].sort(),
      ready: e.total > 0 && e.ok / e.total >= min,
    }))
    .sort((a, b) => b.total - a.total);
}

export interface BimMetricRule { metric_code: string; ifc_class: string; unit: string }

export interface BimAggregate {
  value: number;
  unit: string;
  elements: number;
}

/** Sum of usable elements of the mapped classes, in the metric's unit, for the given storey labels. */
export function aggregateBim(rows: BimElementRow[], rules: BimMetricRule[], storeys: Set<string>): BimAggregate | null {
  if (rules.length === 0 || storeys.size === 0) return null;
  const wanted = new Map<string, Set<string>>(); // class -> canonical units
  for (const r of rules) {
    const c = r.ifc_class.toUpperCase();
    wanted.set(c, (wanted.get(c) ?? new Set()).add(normalizeUnit(r.unit) ?? r.unit));
  }
  let value = 0;
  let elements = 0;
  for (const r of rows) {
    const c = (r.ifc_class ?? "").toUpperCase();
    const units = wanted.get(c);
    const key = bimLevelKey(r);
    if (!units || !key || !storeys.has(key)) continue;
    // an element can supply the metric through its own quantity or a secondary one of the wanted unit
    const unit = [...units].find((u) => quantityIn(r, u) !== null);
    if (!unit) continue;
    value += quantityIn(r, unit)!;
    elements++;
  }
  if (elements === 0) return null;
  return { value: Math.round(value * 1000) / 1000, unit: [...(wanted.values().next().value ?? [])][0] ?? "", elements };
}

// ── level mapping suggestions ────────────────────────────────────────────

/** "L01", "Level 1", "Storey 3", "3rd Floor", "01 - Level 1" -> comparable form, via the BOQ matcher's normaliser. */
export function canonicalLevel(label: string | null | undefined): string | null {
  if (!label) return null;
  let s = label.trim();
  s = s.replace(/^l\s*0*(\d+)\b.*$/i, "$1"); // L01, L 1
  s = s.replace(/^(?:storey|story|floor)\s*0*(\d+)\b.*$/i, "$1");
  s = s.replace(/^0*(\d+)(?:st|nd|rd|th)\s+floor\b.*$/i, "$1");
  s = s.replace(/^\d+\s*[-.:]\s*(?=level|storey|floor)/i, "");
  const direct = normalizeLevel(s);
  if (direct) return direct;
  const n = floorNumber(s);
  return n != null ? `${n}F` : null;
}

export interface LevelSuggestion {
  bimLevel: string;
  nodeId: string | null;
  /** how the suggestion was reached; null = no suggestion */
  basis: "same level" | null;
}

/** Suggest a WBS level node for every BIM storey label. Suggestions only: the planner confirms. */
export function suggestLevelMap(bimLevels: string[], nodes: { id: string; name: string }[]): LevelSuggestion[] {
  const byCanon = new Map<string, string>();
  for (const n of nodes) {
    const c = canonicalLevel(n.name);
    if (c && !byCanon.has(c)) byCanon.set(c, n.id);
  }
  return bimLevels.map((bimLevel) => {
    const c = canonicalLevel(bimLevel);
    const id = c ? byCanon.get(c) ?? null : null;
    return { bimLevel, nodeId: id, basis: id ? "same level" : null };
  });
}
