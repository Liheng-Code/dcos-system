// BOQ mapping integrity (doc 35 B1/B2). Pure, no I/O. Classifies each BOQ line from plan_boq_mapping_facts:
// how much of its quantity the programme maps, through which paths, and what is wrong with it.
//
// Paths:   programme  plan_task_boq_lines share % (Generate from BOQ)
//          link       plan_act_quantity_links factor x 100 % (activity library Generate); a link in another unit
//                     (a conversion such as kg -> t) cannot be compared and only counts as "mapped"
//          direct     Task Work quantity linked to the line, on tasks without programme lines
// Status:  unmapped (no path) | partial (< 100 %) | complete | over (> 100 %, counted more than once)
//          | converted (only links in another unit: the share cannot be checked)

import { normalizeUnit } from "../work-engine";

export interface MappingLinkFact {
  metric_code: string;
  unit: string | null;
  factor_sum: number;
  nodes: number;
  /** links whose BOQ snapshot differs from the current BOQ quantity */
  stale: number;
}

export interface MappingFact {
  source: "qs_boq" | "tender_boq";
  id: string;
  /** contract main works or the programme's tender; false = another BOQ of the project that is still mapped */
  in_scope: boolean;
  ref: string | null;
  description: string | null;
  unit: string | null;
  quantity: number;
  building: string | null;
  level: string | null;
  work_item_id: string | null;
  /** sum of the active library activities' shares of the line's BOQ item (should be 100) */
  work_item_share_pct: number | null;
  work_item_masters: number | null;
  programme: { share_pct: number; quantity: number; tasks: number } | null;
  links: MappingLinkFact[] | null;
  direct: { quantity: number; tasks: number; unit: string | null } | null;
}

export type MappingStatus = "unmapped" | "partial" | "complete" | "over" | "converted";

export type MappingIssue =
  | "counted_twice"     // over 100 %
  | "multiple_paths"    // mapped by more than one path: likely the same work twice
  | "library_shares"    // the BOQ item's activity shares in the library do not add up to 100 %
  | "stale_programme"   // the BOQ quantity changed since Generate from BOQ ran
  | "stale_links"       // the BOQ quantity changed since the links were confirmed
  | "unit_conversion"   // links in another unit (not compared)
  | "other_boq"         // mapped, but not part of the programme's BOQ (an older tender, a prelims BOQ)
  | "zero_quantity";    // mapped, but the BOQ line has no quantity

export interface ReconciledLine extends MappingFact {
  status: MappingStatus;
  issues: MappingIssue[];
  /** % of the line's quantity mapped in its own unit, over all paths */
  mapped_pct: number;
  /** quantity mapped in the line's unit */
  mapped_quantity: number;
  paths: number;
}

const TOL_PCT = 0.5;
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function reconcileLine(f: MappingFact): ReconciledLine {
  const q = Number(f.quantity) || 0;
  const lineUnit = normalizeUnit(f.unit);
  const links = f.links ?? [];
  const sameUnit = links.filter((l) => normalizeUnit(l.unit) === lineUnit);
  const converted = links.filter((l) => normalizeUnit(l.unit) !== lineUnit);

  const progPct = f.programme ? Number(f.programme.share_pct) : 0;
  const linkPct = sameUnit.reduce((s, l) => s + Number(l.factor_sum) * 100, 0);
  // a direct task in another unit is not comparable (no unit on the task counts as the line's)
  const directSame = !!f.direct && (f.direct.unit == null || normalizeUnit(f.direct.unit) === lineUnit);
  const directPct = directSame && q > 0 ? (Number(f.direct!.quantity) / q) * 100 : 0;
  const mappedPct = progPct + linkPct + directPct;
  const mappedQty = (f.programme ? Number(f.programme.quantity) : 0)
    + sameUnit.reduce((s, l) => s + q * Number(l.factor_sum), 0)
    + (directSame ? Number(f.direct!.quantity) : 0);
  const paths = (f.programme ? 1 : 0) + (links.length ? 1 : 0) + (f.direct ? 1 : 0);

  let status: MappingStatus;
  if (paths === 0) status = "unmapped";
  else if (mappedPct > 100 + TOL_PCT) status = "over";
  else if (sameUnit.length === 0 && !f.programme && !directSame) status = "converted";
  else if (mappedPct < 100 - TOL_PCT) status = "partial";
  else status = "complete";

  const issues: MappingIssue[] = [];
  if (status === "over") issues.push("counted_twice");
  if (paths > 1) issues.push("multiple_paths");
  if (f.work_item_share_pct != null && (f.work_item_masters ?? 0) > 0 && Math.abs(Number(f.work_item_share_pct) - 100) > TOL_PCT) {
    issues.push("library_shares");
  }
  if (f.programme) {
    const expected = (q * Number(f.programme.share_pct)) / 100;
    // each task's quantity is rounded to 4 dp, so the tolerance grows with the number of tasks
    const tol = Math.max(0.001, Math.abs(expected) * 1e-4) + Number(f.programme.tasks) * 5e-5;
    if (Math.abs(expected - Number(f.programme.quantity)) > tol) issues.push("stale_programme");
  }
  if (links.some((l) => l.stale > 0)) issues.push("stale_links");
  if (converted.length || (f.direct && !directSame)) issues.push("unit_conversion");
  if (paths > 0 && !f.in_scope) issues.push("other_boq");
  if (paths > 0 && q === 0) issues.push("zero_quantity");

  return { ...f, quantity: q, status, issues, mapped_pct: round(mappedPct, 2), mapped_quantity: round(mappedQty), paths };
}

export interface UnitTotal {
  unit: string;
  boq_quantity: number;
  mapped_quantity: number;
  lines: number;
}

export interface ReconciliationSummary {
  lines: number;
  byStatus: Record<MappingStatus, number>;
  byIssue: Partial<Record<MappingIssue, number>>;
  /** in-scope lines per unit: BOQ quantity vs quantity mapped in that unit (over-mapping counts in full) */
  totals: UnitTotal[];
}

export function reconcile(facts: readonly MappingFact[]): { lines: ReconciledLine[]; summary: ReconciliationSummary } {
  const lines = facts.map(reconcileLine);
  const byStatus: Record<MappingStatus, number> = { unmapped: 0, partial: 0, complete: 0, over: 0, converted: 0 };
  const byIssue: Partial<Record<MappingIssue, number>> = {};
  const totals = new Map<string, UnitTotal>();
  for (const l of lines) {
    byStatus[l.status]++;
    for (const i of l.issues) byIssue[i] = (byIssue[i] ?? 0) + 1;
    if (!l.in_scope) continue;
    const u = normalizeUnit(l.unit) ?? "(no unit)";
    const t = totals.get(u) ?? { unit: u, boq_quantity: 0, mapped_quantity: 0, lines: 0 };
    t.boq_quantity = round(t.boq_quantity + l.quantity);
    t.mapped_quantity = round(t.mapped_quantity + l.mapped_quantity);
    t.lines++;
    totals.set(u, t);
  }
  return {
    lines,
    summary: { lines: lines.length, byStatus, byIssue, totals: [...totals.values()].sort((a, b) => b.lines - a.lines || a.unit.localeCompare(b.unit)) },
  };
}
