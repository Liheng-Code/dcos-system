import { describe, expect, it } from "vitest";
import { nextStep, programmeReadiness, type ReadinessFacts } from "../programme-readiness";
import type { ReconciliationSummary } from "../../boq-mapping/reconcile";

const empty: ReadinessFacts = {
  project: { code: "PRJ-1", type: "tender", status: "draft", start_date: null, end_date: null, data_date: null },
  project_calendar: false,
  wbs: { nodes: 0, levels: 0, buildings: 0 },
  boq: { contract_lines: 0, tender_lines: 0, has_tender: false },
  tasks: { total: 0, activities: 0, generated: 0, with_duration: 0, last_change: null },
  work: { rows: 0, with_norm: 0, calculated: 0 },
  logic: { incomplete: 0, open_ended: 0 },
  calculation: null,
  qaqc: null,
  baseline: { approved: 0, pending: 0, last_approved: null },
  revision: null,
};

const summary = (s: Partial<ReconciliationSummary["byStatus"]>): ReconciliationSummary => {
  const byStatus = { unmapped: 0, partial: 0, complete: 0, over: 0, converted: 0, ...s };
  return { lines: Object.values(byStatus).reduce((a, b) => a + b, 0), byStatus, byIssue: {}, totals: [] };
};

const ready: ReadinessFacts = {
  project: { code: "PRJ-1", type: "awarded", status: "active", start_date: "2026-11-01", end_date: "2027-12-31", data_date: null },
  project_calendar: true,
  wbs: { nodes: 40, levels: 8, buildings: 1 },
  boq: { contract_lines: 120, tender_lines: 0, has_tender: true },
  tasks: { total: 200, activities: 190, generated: 180, with_duration: 190, last_change: "2026-11-01T10:00:00Z" },
  work: { rows: 190, with_norm: 190, calculated: 190 },
  logic: { incomplete: 200, open_ended: 4 },
  calculation: { at: "2026-11-01T11:00:00Z", finish: "2027-11-30", critical: 25, warnings: 0 },
  qaqc: { at: "2026-11-01T12:00:00Z", failed: 1, critical_failed: 0, open_critical: 0 },
  baseline: { approved: 1, pending: 0, last_approved: "2026-11-02T08:00:00Z" },
  revision: null,
};

describe("programmeReadiness", () => {
  it("lists the 11 guided steps in order, with links", () => {
    const steps = programmeReadiness(empty, null);
    expect(steps.map((s) => s.key)).toEqual(["project", "info", "wbs", "boq", "mapping", "generate", "durations", "logic", "calculate", "qaqc", "submit"]);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(steps.every((s) => s.href.startsWith("/dashboard"))).toBe(true);
  });

  it("a new project: only the first step is done, and the next step is project information", () => {
    const steps = programmeReadiness(empty, null);
    expect(steps.filter((s) => s.status === "done").map((s) => s.key)).toEqual(["project"]);
    expect(nextStep(steps)?.key).toBe("info");
    expect(steps.find((s) => s.key === "boq")?.href).toBe("/dashboard/tenders");
  });

  it("a complete programme is done throughout", () => {
    const steps = programmeReadiness(ready, summary({ complete: 120 }));
    expect(steps.filter((s) => s.status !== "done")).toEqual([]);
    expect(nextStep(steps)).toBeNull();
    expect(steps.find((s) => s.key === "boq")?.href).toBe("/dashboard/projects/PRJ-1/boq");
  });

  it("flags double counting, missing durations, open logic and stale results", () => {
    const steps = programmeReadiness({
      ...ready,
      tasks: { ...ready.tasks, with_duration: 150, last_change: "2026-11-02T09:00:00Z" },
      logic: { incomplete: 200, open_ended: 60 },
      qaqc: { at: "2026-11-01T12:00:00Z", failed: 3, critical_failed: 1, open_critical: 1 },
    }, summary({ complete: 100, over: 16, partial: 2 }));
    const by = Object.fromEntries(steps.map((s) => [s.key, s]));
    expect(by.mapping.status).toBe("attention");
    expect(by.mapping.detail).toContain("16 counted twice");
    expect(by.durations.status).toBe("attention");
    expect(by.logic.status).toBe("attention");
    expect(by.logic.detail).toContain("30%");
    expect(by.calculate.status).toBe("attention");
    expect(by.calculate.detail).toContain("calculate again");
    expect(by.qaqc.status).toBe("attention");
    expect(nextStep(steps)?.key).toBe("mapping");
  });

  it("a submitted revision or pending baseline is waiting for approval", () => {
    const steps = programmeReadiness({ ...ready, baseline: { approved: 0, pending: 1, last_approved: null } }, summary({ complete: 1 }));
    expect(steps.find((s) => s.key === "submit")?.status).toBe("waiting");
    const r = programmeReadiness({ ...ready, baseline: { approved: 0, pending: 0, last_approved: null }, revision: { status: "submitted_client", number: 2, submitted_at: null } }, summary({ complete: 1 }));
    expect(r.find((s) => s.key === "submit")?.status).toBe("waiting");
  });
});
