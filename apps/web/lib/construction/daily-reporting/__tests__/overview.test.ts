import { describe, expect, it } from "vitest";
import { buildOverview, type OverviewSummary } from "../overview";
import type { DailySummary } from "../types";

const P1 = "p1";
const P2 = "p2";

type UnitRow = DailySummary["coverage"]["units"][number];
const unit = (code: string, state: UnitRow["state"], over: Partial<UnitRow> = {}): UnitRow => ({
  unit_id: `u-${code}`,
  unit_code: code,
  display_name: `Unit ${code}`,
  report_id: state === "MISSING" ? null : `r-${code}`,
  report_no: state === "MISSING" ? null : `DR-${code}`,
  report_kind: state === "MISSING" ? null : "WORK",
  state,
  late: false,
  ...over,
});

function summary(over: Partial<OverviewSummary> & { units?: UnitRow[]; totals?: Partial<DailySummary["totals"]> }): OverviewSummary {
  const units = over.units ?? [unit("A", "APPROVED"), unit("B", "APPROVED")];
  return {
    project_id: P1,
    summary_date: "2026-10-01",
    revision_no: 1,
    status: "Official",
    project: { project_code: "PRJ-1", project_name: "Tower" },
    ...over,
    coverage: {
      expected: units.length,
      submitted: units.filter((u) => u.state !== "MISSING").length,
      approved: units.filter((u) => u.state === "APPROVED").length,
      no_work: units.filter((u) => u.report_kind === "NO_WORK").length,
      pending: units.filter((u) => u.state === "PENDING").length,
      late: units.filter((u) => u.late).length,
      missing: units.filter((u) => u.state === "MISSING").length,
      units,
    },
    totals: { manpower_total: 40, ...(over.totals ?? {}) } as DailySummary["totals"],
  };
}

describe("management overview", () => {
  it("is empty with no summaries", () => {
    const o = buildOverview([]);
    expect(o.projects).toEqual([]);
    expect(o.units).toEqual([]);
    expect(o.totals).toMatchObject({ projects: 0, expected: 0, compliance_pct: null });
  });

  it("adds up compliance, manpower, delays and issues over the published days of a project", () => {
    const o = buildOverview([
      summary({ totals: { manpower_total: 40, delay_events: 1, delay_hours_lost: 3, issues: 2, issues_high: 1 } }),
      summary({
        summary_date: "2026-10-02",
        units: [unit("A", "APPROVED", { late: true }), unit("B", "MISSING")],
        totals: { manpower_total: 20, incidents: 1, near_misses: 2, delay_notices: 1 },
      }),
    ]);
    expect(o.projects).toHaveLength(1);
    expect(o.projects[0]).toMatchObject({
      project_code: "PRJ-1",
      days_published: 2,
      unpublished_dates: [],
      expected: 4,
      on_time: 2,
      late: 1,
      missing: 1,
      compliance_pct: 75,
      manpower: [
        { date: "2026-10-01", value: 40 },
        { date: "2026-10-02", value: 20 },
      ],
      manpower_avg: 30,
      delay_events: 1,
      delay_hours_lost: 3,
      delay_notices: 1,
      issues: 2,
      issues_high: 1,
      incidents: 1,
      near_misses: 2,
    });
    expect(o.projects[0].latest).toMatchObject({ date: "2026-10-02", manpower_total: 20 });
  });

  it("uses only the newest published revision of a day", () => {
    const o = buildOverview([
      summary({ revision_no: 1, status: "Superseded", totals: { manpower_total: 10 } }),
      summary({ revision_no: 2, totals: { manpower_total: 55 } }),
      summary({ revision_no: 1, totals: { manpower_total: 10 } }),
    ]);
    expect(o.projects[0].days_published).toBe(1);
    expect(o.projects[0].manpower).toEqual([{ date: "2026-10-01", value: 55 }]);
    expect(o.projects[0].latest?.revision_no).toBe(2);
  });

  it("never mixes an unpublished day into the numbers, and says the day is not published", () => {
    const o = buildOverview([
      summary({}),
      summary({ summary_date: "2026-10-02", status: "Live", revision_no: 0, units: [unit("A", "PENDING"), unit("B", "MISSING")], totals: { manpower_total: 99 } }),
    ]);
    expect(o.projects[0]).toMatchObject({ days_published: 1, unpublished_dates: ["2026-10-02"], expected: 2, missing: 0, compliance_pct: 100 });
    expect(o.projects[0].manpower).toEqual([{ date: "2026-10-01", value: 40 }]);
    expect(o.totals).toMatchObject({ days_published: 1, days_unpublished: 1, manpower_latest: 40 });
  });

  it("ignores the Live row once the day is published, and a Live day on which nothing was due", () => {
    const o = buildOverview([
      summary({}),
      summary({ status: "Live", revision_no: 0, totals: { manpower_total: 99 } }),
      summary({ summary_date: "2026-10-04", status: "Live", revision_no: 0, units: [] }),
    ]);
    expect(o.projects[0]).toMatchObject({ days_published: 1, unpublished_dates: [] });
  });

  it("a project with nothing published still appears, with no figures", () => {
    const o = buildOverview([summary({ project_id: P2, project: { project_code: "PRJ-2", project_name: "Mall" }, status: "Live", revision_no: 0 })]);
    expect(o.projects[0]).toMatchObject({ project_code: "PRJ-2", days_published: 0, unpublished_dates: ["2026-10-01"], latest: null, compliance_pct: null, manpower_avg: null });
  });

  it("counts a No Work report as received, a pending one as received but not approved", () => {
    const o = buildOverview([
      summary({ units: [unit("A", "APPROVED", { report_kind: "NO_WORK" }), unit("B", "PENDING"), unit("C", "MISSING")] }),
    ]);
    expect(o.projects[0]).toMatchObject({ expected: 3, on_time: 2, no_work: 1, pending: 1, missing: 1, compliance_pct: 67 });
  });

  it("builds the unit compliance board, worst first", () => {
    const o = buildOverview([
      summary({ units: [unit("A", "APPROVED"), unit("B", "MISSING"), unit("C", "APPROVED", { late: true })] }),
      summary({ summary_date: "2026-10-02", units: [unit("A", "APPROVED"), unit("B", "APPROVED", { late: true }), unit("C", "APPROVED", { late: true })] }),
    ]);
    expect(o.units.map((u) => [u.unit_code, u.expected, u.on_time, u.late, u.missing, u.compliance_pct])).toEqual([
      ["B", 2, 0, 1, 1, 50],
      ["C", 2, 0, 2, 0, 100],
      ["A", 2, 2, 0, 0, 100],
    ]);
  });

  it("keeps projects apart and totals them", () => {
    const o = buildOverview([
      summary({ totals: { manpower_total: 40, incidents: 1 } }),
      summary({ project_id: P2, project: { project_code: "PRJ-0", project_name: "Mall" }, units: [unit("A", "MISSING")], totals: { manpower_total: 5, issues_high: 2 } }),
    ]);
    expect(o.projects.map((p) => p.project_code)).toEqual(["PRJ-0", "PRJ-1"]);
    expect(o.units).toHaveLength(3);
    expect(o.totals).toMatchObject({ projects: 2, expected: 3, missing: 1, compliance_pct: 67, manpower_latest: 45, incidents: 1, issues_high: 2 });
  });

  it("falls back to the coverage totals when a summary lists no units", () => {
    const s = summary({});
    s.coverage = { ...s.coverage, units: [], expected: 5, missing: 1, late: 2, no_work: 1, pending: 0 };
    expect(buildOverview([s]).projects[0]).toMatchObject({ expected: 5, on_time: 2, late: 2, missing: 1, no_work: 1, compliance_pct: 80 });
  });
});
