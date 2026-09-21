// Pure — no I/O. Builds the self-contained HTML for the monthly progress
// report (Completion Plan 2.8). No PDF library is available in this project
// (see the completion-plan decision to ship HTML instead of PDF for this
// item), so the report is a standalone .html document filed into Document
// Control — legible in any browser and printable to PDF by the reader.

import type { ScheduleKpis } from "./schedule-kpis";

export interface DelaySummaryRow {
  delay_type: string;
  lifecycle: string;
  count: number;
  impact_days: number;
}

export interface ScurvePoint {
  date: string;
  pct: number | null;
  planned_pct?: number | null;
}

export interface MonthlyReportInput {
  projectCode: string;
  projectName: string;
  dataDate: string;
  contractEnd: string | null;
  kpis: ScheduleKpis;
  delaySummary: DelaySummaryRow[];
  scurveLivePct: number | null;
  scurveHistory: ScurvePoint[];
  generatedAt: string;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

const STATUS_LABEL: Record<ScheduleKpis["programmeStatus"], string> = {
  on_track: "On Track",
  at_risk: "At Risk",
  overrun: "Overrun",
};
const STATUS_COLOR: Record<ScheduleKpis["programmeStatus"], string> = {
  on_track: "#059669",
  at_risk: "#d97706",
  overrun: "#dc2626",
};

export function buildMonthlyReportHtml(input: MonthlyReportInput): string {
  const { kpis } = input;
  const statusColor = STATUS_COLOR[kpis.programmeStatus];

  const delayRows = input.delaySummary.length
    ? input.delaySummary
        .map(
          (r) => `<tr><td>${esc(r.delay_type)}</td><td>${esc(r.lifecycle)}</td><td style="text-align:right">${r.count}</td><td style="text-align:right">${r.impact_days}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="color:#64748b;text-align:center">No delay events on record.</td></tr>`;

  const historyRows = input.scurveHistory.length
    ? input.scurveHistory
        .map(
          (p) =>
            `<tr><td>${esc(p.date)}</td><td style="text-align:right">${p.planned_pct ?? "—"}%</td><td style="text-align:right">${p.pct ?? "—"}%</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" style="color:#64748b;text-align:center">No progress snapshots recorded yet.</td></tr>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Monthly Progress Report — ${esc(input.projectCode)} — ${esc(input.dataDate)}</title>
<style>
  body { font-family: -apple-system, Segoe UI, Arial, sans-serif; color: #1e293b; max-width: 860px; margin: 0 auto; padding: 32px 24px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 28px 0 8px; color: #334155; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  .sub { color: #64748b; font-size: 13px; margin: 0 0 20px; }
  .tiles { display: flex; flex-wrap: wrap; gap: 10px; }
  .tile { flex: 1 1 140px; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; }
  .tile .label { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  .tile .value { font-size: 20px; font-weight: 600; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 4px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; text-align: left; }
  th { color: #64748b; font-weight: 600; font-size: 10px; text-transform: uppercase; }
  .status-pill { display: inline-block; padding: 2px 10px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 600; }
  .footer { margin-top: 32px; font-size: 10px; color: #94a3b8; }
</style>
</head>
<body>
  <h1>${esc(input.projectName)} — Monthly Progress Report</h1>
  <p class="sub">${esc(input.projectCode)} · Data date ${esc(input.dataDate)}${input.contractEnd ? ` · Contract end ${esc(input.contractEnd)}` : ""}</p>

  <span class="status-pill" style="background:${statusColor}">${STATUS_LABEL[kpis.programmeStatus]}</span>

  <h2>Schedule Summary</h2>
  <div class="tiles">
    <div class="tile"><div class="label">Overall Progress</div><div class="value">${input.scurveLivePct !== null ? `${input.scurveLivePct.toFixed(1)}%` : "—"}</div></div>
    <div class="tile"><div class="label">Forecast Finish</div><div class="value" style="font-size:15px">${kpis.forecastFinish ?? "—"}</div></div>
    <div class="tile"><div class="label">Overrun (wd)</div><div class="value">${kpis.overrunWd ?? "—"}</div></div>
    <div class="tile"><div class="label">Overdue Activities</div><div class="value">${kpis.overdue}</div></div>
    <div class="tile"><div class="label">Critical Activities</div><div class="value">${kpis.negativeFloat}</div></div>
    <div class="tile"><div class="label">Near-Critical</div><div class="value">${kpis.nearCritical}</div></div>
    <div class="tile"><div class="label">Plan Completion Rate</div><div class="value">${kpis.pcr !== null ? `${kpis.pcr.toFixed(0)}%` : "—"}</div></div>
  </div>

  <h2>Progress History</h2>
  <table>
    <thead><tr><th>Date</th><th style="text-align:right">Planned %</th><th style="text-align:right">Actual %</th></tr></thead>
    <tbody>${historyRows}</tbody>
  </table>

  <h2>Delay Events</h2>
  <table>
    <thead><tr><th>Type</th><th>Lifecycle</th><th style="text-align:right">Count</th><th style="text-align:right">Impact (days)</th></tr></thead>
    <tbody>${delayRows}</tbody>
  </table>

  <p class="footer">Generated automatically on ${esc(input.generatedAt)} when the project data date advanced into a new month. Source: DCOS Planning &amp; Scheduling.</p>
</body>
</html>`;
}
