// Cost loading against the QS approved budget (doc 35 C5; PRD MOD-07). Pure, no I/O.
// Facts from plan_budget_reconciliation(project): each contract BOQ line's amount and the value the programme's
// activities carry for it (plan_task_boq_lines.amount), plus approved VOs and activities whose budget was changed
// by hand.
//
// Line status: not_loaded (no activity carries it) | under (part of it) | matched | over (more than its amount)
//              | unapproved (a draft / revised line, outside the approved budget)

export interface BudgetLineFact {
  id: string;
  item_no: string | null;
  description: string | null;
  unit: string | null;
  quantity: number | null;
  section: string | null;
  status: string;
  amount: number;
  loaded: number;
  scheduled: number;
  tasks: number;
}

export interface BudgetReconciliationFacts {
  meta: {
    currency: string | null;
    approved_boq: number;
    approved_boq_lines: number;
    unapproved_boq: number;
    unapproved_boq_lines: number;
    approved_vos: number;
    approved_vo_count: number;
    task_budget_total: number;
    task_budget_from_lines: number;
    loaded_from_tender: number;
    scheduled_budget: number;
  };
  lines: BudgetLineFact[];
  adjusted_tasks: { task_id: string; code: string; name: string; budget: number; from_lines: number }[];
}

export type BudgetLineStatus = "not_loaded" | "under" | "matched" | "over" | "unapproved";

export interface ReconciledBudgetLine extends BudgetLineFact {
  status_check: BudgetLineStatus;
  /** loaded - amount */
  difference: number;
}

export interface BudgetSummary {
  /** approved BOQ + approved VOs */
  approvedBudget: number;
  /** activity budgets in total (what cost loading spreads) */
  programmeBudget: number;
  /** approvedBudget - programmeBudget: positive = approved value not in the programme */
  gap: number;
  /** programmeBudget / approvedBudget, % (null without an approved budget) */
  coveragePct: number | null;
  /** approved BOQ lines' value carried by the programme, capped at each line's amount */
  approvedLoaded: number;
  /** approved BOQ value not carried by any activity (not_loaded + the missing part of under) */
  missing: number;
  /** value loaded above a line's amount */
  overLoaded: number;
  /** approved VOs: not mapped to activities, so never in the programme */
  vosNotInProgramme: number;
  /** activity budgets changed by hand (budget - its BOQ lines), net */
  handAdjusted: number;
  counts: Record<BudgetLineStatus, number>;
  /** programme value from a tender BOQ (before the contract BOQ exists) */
  fromTender: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Amounts are split in whole cents, so a fully loaded line matches to the cent; allow a little for rounding. */
const tolerance = (amount: number) => Math.max(0.05, Math.abs(amount) * 0.0005);
const APPROVED = new Set(["approved", "locked"]);

export function reconcileBudgetLine(l: BudgetLineFact): ReconciledBudgetLine {
  const amount = Number(l.amount) || 0;
  const loaded = Number(l.loaded) || 0;
  const difference = round2(loaded - amount);
  let status: BudgetLineStatus;
  if (!APPROVED.has(l.status)) status = "unapproved";
  else if (Math.abs(difference) <= tolerance(amount)) status = "matched";
  else if (loaded === 0) status = "not_loaded";
  else status = difference < 0 ? "under" : "over";
  return { ...l, amount, loaded, status_check: status, difference };
}

export function reconcileBudget(facts: BudgetReconciliationFacts): { lines: ReconciledBudgetLine[]; summary: BudgetSummary } {
  const lines = facts.lines.map(reconcileBudgetLine);
  const counts: Record<BudgetLineStatus, number> = { not_loaded: 0, under: 0, matched: 0, over: 0, unapproved: 0 };
  let approvedLoaded = 0, missing = 0, overLoaded = 0;
  for (const l of lines) {
    counts[l.status_check]++;
    if (l.status_check === "unapproved") continue;
    approvedLoaded += Math.min(l.loaded, l.amount);
    if (l.difference < 0 && l.status_check !== "matched") missing += -l.difference;
    if (l.difference > 0 && l.status_check !== "matched") overLoaded += l.difference;
  }
  const m = facts.meta;
  const approvedBudget = Number(m.approved_boq) + Number(m.approved_vos);
  const programmeBudget = Number(m.task_budget_total);
  return {
    lines,
    summary: {
      approvedBudget: round2(approvedBudget),
      programmeBudget: round2(programmeBudget),
      gap: round2(approvedBudget - programmeBudget),
      coveragePct: approvedBudget > 0 ? Math.round((programmeBudget / approvedBudget) * 1000) / 10 : null,
      approvedLoaded: round2(approvedLoaded),
      missing: round2(missing),
      overLoaded: round2(overLoaded),
      vosNotInProgramme: round2(Number(m.approved_vos)),
      handAdjusted: round2(Number(m.task_budget_total) - Number(m.task_budget_from_lines)),
      counts,
      fromTender: round2(Number(m.loaded_from_tender)),
    },
  };
}
