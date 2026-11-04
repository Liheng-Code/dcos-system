import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { DEFAULT_CALENDAR } from "../../work-calendar";
import type { ReportData, ReportTask } from "../report-data";
import { buildMasterProgramme, buildMonthlyReport, buildRecoveryReport, buildWeeklyReport, weightedProgress } from "../report-builders";
import { renderReportHtml } from "../report-html";
import { pdfSafe, renderReportPdf } from "../report-pdf";
import { basisLines, canonicalJson, reportTables, type ReportBasis } from "../report-model";
import { contentHash, documentFor, isoWeek } from "../report-filing";

const task = (id: string, over: Partial<ReportTask> = {}): ReportTask => ({
  id, code: id, name: `Task ${id}`, nodeId: "n1", start: "2026-11-02", finish: "2026-11-06", baselineStart: "2026-11-02", baselineFinish: "2026-11-05",
  actualStart: null, actualFinish: null, durationWd: 5, progress: 0, status: "not_started", isMilestone: false, manual: false,
  constraintType: null, constraintDate: null, depIds: [], depTypes: [], depLags: [], totalFloat: 0, critical: true, ...over,
});

const basis: ReportBasis = {
  project: { id: "p", code: "PRJ-1", name: "Test <Villa>", data_date: "2026-11-06", start: "2026-11-02", contract_finish: "2026-12-31" },
  baseline: { id: "b", number: 1, name: "Contract", type: "contract", date: "2026-10-01", approved_at: "2026-10-02T00:00:00Z", client_accepted: true },
  revision: null,
  calculation: { id: "c", at: "2026-11-06T08:00:00Z", engine_version: "2.1.0", input_hash: "abc", finish: "2026-11-20", data_date: null, current: false },
  forecast: null, last_change: null,
};

const data = (): ReportData => ({
  asAt: "2026-11-06", cal: DEFAULT_CALENDAR,
  tasks: [
    task("A", { actualStart: "2026-11-02", progress: 100, actualFinish: "2026-11-05", status: "completed" }),
    task("B", { start: "2026-11-03", finish: "2026-11-10", baselineFinish: "2026-11-09", critical: false, totalFloat: 4 }),
    task("C", { nodeId: "n2", start: "2026-11-12", finish: "2026-11-20", baselineFinish: "2026-11-18" }),
    task("M", { nodeId: "n2", isMilestone: true, durationWd: 0, start: "2026-11-25", finish: "2026-11-25", baselineFinish: "2026-11-25" }),
  ],
  nodes: [{ id: "n1", code: "01", name: "Frame", parentId: null, sortOrder: 1 }, { id: "n2", code: "02", name: "Finishes", parentId: null, sortOrder: 2 }],
  delays: [{ code: "D1", description: "Late rebar", type: "supply", cause: "Supplier", responsible: "Contractor", impactDays: 3, status: "open", lifecycle: "open", openedAt: "2026-11-04", taskId: "B" }],
  progress: [{ taskId: "A", asOf: "2026-11-05", kind: "percent", value: 100, previous: 40, source: "daily report", approvedAt: "2026-11-05T10:00:00Z" }],
  scenarios: [],
  kpis: { overdue: 1, startingNext14d: 2, finishingNext14d: 2, critical: 3, negativeFloat: 0, nearCritical: 0, pcr: null, forecastFinish: "2026-11-25", overrunWd: -30, programmeStatus: "on_track" },
  scurve: { livePct: 30, history: [{ date: "2026-10-31", planned: 10, actual: 8 }] },
  generatedBy: "Planner",
});

describe("report builders (doc 35 M1)", () => {
  it("master programme: activities under their WBS headings, critical highlighted", () => {
    const doc = buildMasterProgramme(data(), basis);
    const t = doc.sections.find((s) => s.kind === "table")!;
    if (t.kind !== "table") throw new Error();
    expect(t.rows.map((r) => r[0])).toEqual(["01", "A", "B", "02", "C", "M"]);
    expect(t.rowStyle).toEqual(["group", "critical", null, "group", "critical", "critical"]);
    // B finishes Tue 10 Nov against a baseline of Mon 9 Nov: 1 working day late
    expect(t.rows[2][6]).toBe(1);
    expect(doc.orientation).toBe("landscape");
  });

  it("weekly: started, finished, behind, progress and delays of the week", () => {
    const doc = buildWeeklyReport(data(), basis, "2026-11-06");
    const table = (title: string) => doc.sections.find((s) => s.kind === "table" && s.title.startsWith(title));
    const rows = (title: string) => { const s = table(title); return s && s.kind === "table" ? s.rows : []; };
    expect(rows("Started this week").map((r) => r[0])).toEqual(["A"]);
    expect(rows("Finished this week").map((r) => r[0])).toEqual(["A"]);
    expect(rows("Behind programme").map((r) => [r[0], r[9]])).toEqual([["B", "not started"]]);
    expect(rows("Progress recorded")).toHaveLength(1);
    expect(rows("Delays raised this week").map((r) => r[0])).toEqual(["D1"]);
    expect(rows("Look-ahead").map((r) => r[0])).toEqual(["C"]);
    expect(doc.periodStart).toBe("2026-10-31");
  });

  it("monthly and recovery reports build", () => {
    expect(buildMonthlyReport(data(), basis).periodLabel).toBe("2026-11");
    const r = buildRecoveryReport(data(), basis);
    const t = r.sections.find((s) => s.kind === "table" && s.title === "Recovery scenarios");
    expect(t && t.kind === "table" ? t.empty : "").toContain("No recovery scenario");
  });

  it("weights progress by duration", () => {
    expect(weightedProgress([task("a", { durationWd: 10, progress: 100 }), task("b", { durationWd: 30, progress: 0 })])).toBe(25);
  });
});

describe("report basis (doc 35 M3)", () => {
  it("names data date, baseline, revision and calculation, flagging gaps", () => {
    const lines = basisLines(basis, "2026-11-06");
    expect(lines.map((l) => l.label)).toEqual(["Data date", "Baseline", "Programme revision", "Calculation"]);
    expect(lines[1].value).toBe("BL1 Contract (contract), set 1 Oct 2026, approved 2 Oct 2026, client accepted");
    expect(lines[3]).toMatchObject({ warn: true });
    expect(basisLines({ ...basis, project: { ...basis.project!, data_date: null }, baseline: null }, "2026-11-06")[0].value).toBe("none set (as at 6 Nov 2026)");
  });
});

describe("renderers (doc 35 M2)", () => {
  it("HTML escapes content and prints the basis", () => {
    const html = renderReportHtml(buildMasterProgramme(data(), basis));
    expect(html).toContain("Test &lt;Villa&gt;");
    expect(html).toContain("BL1 Contract");
    expect(html).toContain("@page { size: A4 landscape");
  });

  it("PDF has pages, a title and survives characters Helvetica cannot draw", async () => {
    const d = data();
    d.tasks.push(task("K", { name: "ការងារ → slab ≥ 200mm" }));
    for (let i = 0; i < 120; i++) d.tasks.push(task(`X${i}`, { nodeId: "n1" }));
    const { bytes, pages } = await renderReportPdf(buildMasterProgramme(d, basis));
    expect(pages).toBeGreaterThan(1);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(pages);
    expect(pdf.getTitle()).toContain("Master programme");
  });

  it("pdfSafe keeps Latin text and replaces the rest", () => {
    expect(pdfSafe("Café – 600×600 → ok ◆")).toBe("Café – 600x600 -> ok »");
    expect(pdfSafe("ខ")).toBe("?");
  });
});

describe("filing (doc 35 M4)", () => {
  it("numbers documents per report and period", () => {
    const doc = buildWeeklyReport(data(), basis, "2026-11-06");
    expect(documentFor("weekly", doc)).toMatchObject({ typeCode: "WLY", number: "WLY-2026-W45" });
    expect(documentFor("monthly", buildMonthlyReport(data(), basis)).number).toBe("MTH-2026-11");
    expect(isoWeek("2027-01-01")).toBe("2026-W53");
    expect(isoWeek("2026-01-01")).toBe("2026-W01");
  });

  it("hashes the content, not the moment it was generated", () => {
    const a = buildMasterProgramme(data(), basis);
    const b = { ...a, generatedAt: "2030-01-01T00:00:00Z", generatedBy: "Someone else" };
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash({ ...a, periodLabel: "other" })).not.toBe(contentHash(a));
    expect(canonicalJson({ b: 1, a: [2, { d: null, c: 3 }] })).toBe('{"a":[2,{"c":3,"d":null}],"b":1}');
  });

  it("gives each table its own sheet name", () => {
    const sheets = reportTables(buildWeeklyReport(data(), basis, "2026-11-06")).map((t) => t.name);
    expect(new Set(sheets).size).toBe(sheets.length);
    expect(sheets.every((n) => n.length <= 31)).toBe(true);
  });
});
