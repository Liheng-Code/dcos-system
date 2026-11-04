import { describe, expect, it } from "vitest";
import { reconcileBudget, reconcileBudgetLine, type BudgetLineFact, type BudgetReconciliationFacts } from "../budget-reconciliation";

const line = (over: Partial<BudgetLineFact>): BudgetLineFact => ({
  id: "l1", item_no: "1.1", description: "Concrete", unit: "m3", quantity: 10, section: "Frame", status: "locked",
  amount: 1000, loaded: 1000, scheduled: 1000, tasks: 1, ...over,
});

describe("reconcileBudgetLine", () => {
  it("classifies lines", () => {
    expect(reconcileBudgetLine(line({})).status_check).toBe("matched");
    expect(reconcileBudgetLine(line({ loaded: 999.99 })).status_check).toBe("matched"); // rounding
    expect(reconcileBudgetLine(line({ loaded: 0 })).status_check).toBe("not_loaded");
    expect(reconcileBudgetLine(line({ loaded: 600 }))).toMatchObject({ status_check: "under", difference: -400 });
    expect(reconcileBudgetLine(line({ loaded: 1500 }))).toMatchObject({ status_check: "over", difference: 500 });
    expect(reconcileBudgetLine(line({ status: "draft", loaded: 0 })).status_check).toBe("unapproved");
  });
});

describe("reconcileBudget", () => {
  it("compares the programme with the approved budget", () => {
    const facts: BudgetReconciliationFacts = {
      meta: {
        currency: "USD", approved_boq: 3000, approved_boq_lines: 3, unapproved_boq: 500, unapproved_boq_lines: 1,
        approved_vos: 200, approved_vo_count: 1, task_budget_total: 2650, task_budget_from_lines: 2600,
        loaded_from_tender: 0, scheduled_budget: 2650,
      },
      lines: [
        line({ id: "a" }),
        line({ id: "b", loaded: 600 }),
        line({ id: "c", loaded: 1000 + 0 }),
        line({ id: "d", status: "draft", amount: 500, loaded: 0 }),
      ],
      adjusted_tasks: [{ task_id: "t", code: "A1", name: "x", budget: 150, from_lines: 100 }],
    };
    const { summary } = reconcileBudget(facts);
    expect(summary.approvedBudget).toBe(3200);
    expect(summary.programmeBudget).toBe(2650);
    expect(summary.gap).toBe(550);
    expect(summary.coveragePct).toBe(82.8);
    expect(summary.missing).toBe(400);
    expect(summary.approvedLoaded).toBe(2600);
    expect(summary.vosNotInProgramme).toBe(200);
    expect(summary.handAdjusted).toBe(50);
    expect(summary.counts).toEqual({ not_loaded: 0, under: 1, matched: 2, over: 0, unapproved: 1 });
  });

  it("has no coverage without an approved budget", () => {
    const { summary } = reconcileBudget({
      meta: {
        currency: null, approved_boq: 0, approved_boq_lines: 0, unapproved_boq: 0, unapproved_boq_lines: 0, approved_vos: 0,
        approved_vo_count: 0, task_budget_total: 100, task_budget_from_lines: 100, loaded_from_tender: 100, scheduled_budget: 0,
      },
      lines: [], adjusted_tasks: [],
    });
    expect(summary.coveragePct).toBeNull();
    expect(summary.fromTender).toBe(100);
  });
});
