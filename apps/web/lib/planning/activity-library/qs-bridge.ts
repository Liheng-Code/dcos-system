// Planning <-> QS bridge (doc 21): which BOQ lines feed which quantity metric. Pure, no I/O.
//
// A BOQ line is classified by the QS Element Library (Discipline > Section > Sub Section > Sub Element).
// A bridge rule matches on those fields (null = any), case- and space-insensitive, and optionally on the
// BOQ unit. Among the rules that match a line, only the most specific ones count:
//   - if any of them is "excluded", the line is excluded (tie wire, water stop ...);
//   - otherwise every "driver" rule contributes quantity x unit_factor to its metric
//     (one line may feed several metrics, e.g. slab rebar split bottom / top).
// A line that would match a rule except for its unit is reported as unit_mismatch, never converted.

import { normalizeUnit } from "../work-engine";

export type BridgeRole = "driver" | "excluded";

export interface BridgeRule {
  id: string;
  role: BridgeRole;
  metric_code: string | null;
  metric_unit: string | null;
  unit_factor: number;
  match_discipline: string | null;
  match_section: string | null;
  match_sub_section: string | null;
  match_sub_element: string | null;
  match_unit: string | null;
  note: string | null;
  is_active: boolean;
  sort_order: number;
}

export interface BridgeBoqLine {
  id: string;
  discipline: string | null;
  section: string | null;
  sub_section: string | null;
  sub_element: string | null;
  unit: string | null;
  quantity: number;
  level?: string | null;
  building_code?: string | null;
  item_code?: string | null;
  description?: string | null;
}

export interface MetricContribution {
  ruleId: string;
  metric: string;
  unit: string;
  quantity: number;
}

export type LineClassification =
  | { status: "driver"; contributions: MetricContribution[] }
  | { status: "excluded"; ruleId: string; note: string | null }
  | { status: "unit_mismatch"; ruleId: string; expectedUnit: string | null }
  | { status: "unmapped" };

const norm = (s: string | null | undefined): string => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

function fieldMatches(pattern: string | null, value: string | null): boolean {
  return pattern == null || norm(pattern) === "" || norm(pattern) === norm(value);
}

/** Number of match fields a rule sets: more = more specific. */
export function specificity(rule: BridgeRule): number {
  return [rule.match_discipline, rule.match_section, rule.match_sub_section, rule.match_sub_element, rule.match_unit]
    .filter((v) => v != null && norm(v) !== "").length;
}

function matchesIgnoringUnit(rule: BridgeRule, line: BridgeBoqLine): boolean {
  return (
    fieldMatches(rule.match_discipline, line.discipline) &&
    fieldMatches(rule.match_section, line.section) &&
    fieldMatches(rule.match_sub_section, line.sub_section) &&
    fieldMatches(rule.match_sub_element, line.sub_element)
  );
}

function unitMatches(rule: BridgeRule, line: BridgeBoqLine): boolean {
  return rule.match_unit == null || norm(rule.match_unit) === "" || normalizeUnit(rule.match_unit) === normalizeUnit(line.unit);
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

export function classifyLine(line: BridgeBoqLine, rules: BridgeRule[]): LineClassification {
  const candidates = rules.filter((r) => r.is_active && matchesIgnoringUnit(r, line));
  const matching = candidates.filter((r) => unitMatches(r, line));
  if (matching.length === 0) {
    if (candidates.length > 0) {
      const best = [...candidates].sort((a, b) => specificity(b) - specificity(a))[0];
      return { status: "unit_mismatch", ruleId: best.id, expectedUnit: best.match_unit };
    }
    return { status: "unmapped" };
  }

  const top = Math.max(...matching.map(specificity));
  const winners = matching.filter((r) => specificity(r) === top).sort((a, b) => a.sort_order - b.sort_order);
  const excluded = winners.find((r) => r.role === "excluded");
  if (excluded) return { status: "excluded", ruleId: excluded.id, note: excluded.note };

  const seen = new Set<string>();
  const contributions: MetricContribution[] = [];
  for (const r of winners) {
    if (!r.metric_code || seen.has(r.metric_code)) continue;
    seen.add(r.metric_code);
    contributions.push({ ruleId: r.id, metric: r.metric_code, unit: r.metric_unit ?? "", quantity: round(line.quantity * r.unit_factor) });
  }
  return contributions.length > 0 ? { status: "driver", contributions } : { status: "unmapped" };
}

// ── Coverage report ─────────────────────────────────────────────────────────

export interface MetricTotal {
  metric: string;
  unit: string;
  quantity: number;
  lines: number;
  /** Activity Master codes whose quantity rule reads this metric; empty = no activity uses it yet. */
  masters: string[];
}

export interface UnmappedGroup {
  key: string;
  discipline: string | null;
  section: string | null;
  sub_section: string | null;
  sub_element: string | null;
  unit: string | null;
  lines: number;
  quantity: number;
  status: "unmapped" | "unit_mismatch";
  expectedUnit?: string | null;
}

export interface BridgeCoverage {
  totalLines: number;
  driverLines: number;
  excludedLines: number;
  unmappedLines: number;
  mismatchLines: number;
  metrics: MetricTotal[];
  unmapped: UnmappedGroup[];
  /** Line ids by classification, for drill-down. */
  byLine: Map<string, LineClassification>;
}

export function bridgeCoverage(
  lines: BridgeBoqLine[],
  rules: BridgeRule[],
  mastersByMetric: Map<string, string[]>,
): BridgeCoverage {
  const byLine = new Map<string, LineClassification>();
  const metrics = new Map<string, MetricTotal>();
  const unmapped = new Map<string, UnmappedGroup>();
  let driverLines = 0, excludedLines = 0, unmappedLines = 0, mismatchLines = 0;

  for (const line of lines) {
    const c = classifyLine(line, rules);
    byLine.set(line.id, c);
    if (c.status === "driver") {
      driverLines++;
      for (const k of c.contributions) {
        const m = metrics.get(k.metric) ?? { metric: k.metric, unit: k.unit, quantity: 0, lines: 0, masters: mastersByMetric.get(k.metric) ?? [] };
        m.quantity = round(m.quantity + k.quantity);
        m.lines++;
        metrics.set(k.metric, m);
      }
    } else if (c.status === "excluded") {
      excludedLines++;
    } else {
      if (c.status === "unmapped") unmappedLines++; else mismatchLines++;
      const key = [line.discipline, line.section, line.sub_section, line.sub_element, normalizeUnit(line.unit), c.status].map(norm).join("|");
      const g = unmapped.get(key) ?? {
        key,
        discipline: line.discipline,
        section: line.section,
        sub_section: line.sub_section,
        sub_element: line.sub_element,
        unit: line.unit,
        lines: 0,
        quantity: 0,
        status: c.status,
        expectedUnit: c.status === "unit_mismatch" ? c.expectedUnit : undefined,
      };
      g.lines++;
      g.quantity = round(g.quantity + (Number(line.quantity) || 0));
      unmapped.set(key, g);
    }
  }

  return {
    totalLines: lines.length,
    driverLines,
    excludedLines,
    unmappedLines,
    mismatchLines,
    metrics: [...metrics.values()].sort((a, b) => a.metric.localeCompare(b.metric)),
    unmapped: [...unmapped.values()].sort((a, b) => b.lines - a.lines),
    byLine,
  };
}
