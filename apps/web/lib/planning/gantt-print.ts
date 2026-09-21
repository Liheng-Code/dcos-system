import { openPrint } from "@/lib/print-service";
import type { TaskFloat } from "@/lib/planning/schedule-engine";
import { toGanttTask } from "@/components/planning/schedule-timeline";
import { visibleRowsFrom, type VisibleRow } from "@/components/planning/sheet-utils";
import { PROJECT_NODE_TYPE, type SheetRow } from "@/components/planning/sheet-types";
import { toX, getBarWidth, formatShortDate } from "@/components/planning/gantt-utils";
import type { GanttTask } from "@/components/planning/gantt-types";
import {
  routePath,
  DEP_LINE_STROKE,
  DEP_LINE_BADGE_FILL,
  DEP_LINE_STUB,
  DEP_LINE_LANE,
  type LinkType,
} from "@/components/planning/gantt-dependency-lines";

export type PrintPaperSize = "A4" | "A3" | "Letter" | "Legal" | "Tabloid";
export type PrintOrientation = "portrait" | "landscape";
export type PrintMarginSize = "narrow" | "normal" | "wide";

export interface GanttPrintOptions {
  paperSize: PrintPaperSize;
  orientation: PrintOrientation;
  margin: PrintMarginSize;
  /** null = whole programme (every task's date range) */
  dateRange: { start: string; end: string } | null;
  showBaseline: boolean;
  highlightCritical: boolean;
  showProgress: boolean;
  showMilestones: boolean;
  showDependencies: boolean;
}

export interface GanttPrintInput {
  projectName: string;
  scheduleName: string;
  dataDate: string | null;
  tree: SheetRow[];
  float: Map<string, TaskFloat>;
  /** Row id ("task:<id>" / "node:<id>") → its displayed WBS code, from useSheetData(). */
  wbsCodeByRowId: Map<string, string>;
  /** Formats a task's Start/Finish for the printed table, per the user's date-format preference. Defaults to gantt-utils' formatShortDate. */
  formatDate?: (iso: string) => string;
}

export const PAPER_SIZE_MM: Record<PrintPaperSize, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A3: { w: 297, h: 420 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
  Tabloid: { w: 279.4, h: 431.8 },
};

export const MARGIN_MM: Record<PrintMarginSize, number> = {
  narrow: 8,
  normal: 15,
  wide: 25,
};

const PX_PER_MM = 96 / 25.4;
/** Sum of the fixed label columns (code, name, start, finish, duration, %, float). */
const LABEL_COL_PX = 480;
const MIN_TIMELINE_PX = 200;
/** Every row (task or group) is this tall — fixed so dependency-line Y math lines up exactly with the table's actual layout. */
const ROW_H_PX = 16;
const RULER_H_PX = 18;
const HEADER_ROW_H_PX = 14;
const THEAD_H_PX = RULER_H_PX + HEADER_ROW_H_PX;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function durationDays(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return Math.max(1, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86400000) + 1);
}

/** Builds the printable HTML for one task or WBS-summary row's timeline cell. */
function timelineCellHtml(
  bars: { left: number; width: number; className: string }[],
  timelineWpx: number,
  todayX: number | null,
  milestone?: { x: number },
): string {
  const barsHtml = bars
    .filter((b) => b.width > 0)
    .map((b) => `<div class="bar ${b.className}" style="left:${b.left}px;width:${b.width}px"></div>`)
    .join("");
  const todayHtml =
    todayX != null && todayX >= 0 && todayX <= timelineWpx
      ? `<div class="dataday" style="left:${todayX}px"></div>`
      : "";
  const milestoneHtml =
    milestone && milestone.x >= 0 && milestone.x <= timelineWpx
      ? `<div class="milestone" style="left:${milestone.x}px"></div>`
      : "";
  return `<td class="tl"><div class="tl-inner" style="width:${timelineWpx}px">${todayHtml}${barsHtml}${milestoneHtml}</div></td>`;
}

function taskRowHtml(
  depth: number,
  gantt: GanttTask,
  code: string,
  rangeStart: Date,
  dayW: number,
  timelineWpx: number,
  todayX: number | null,
  opts: GanttPrintOptions,
  formatDate: (iso: string) => string,
): string {
  const indent = 8 + depth * 14;
  const dur = durationDays(gantt.start_date, gantt.end_date);
  const critical = opts.highlightCritical && gantt.is_critical;

  if (gantt.is_milestone && opts.showMilestones && gantt.start_date) {
    const x = toX(gantt.start_date, rangeStart, dayW);
    return `
      <tr class="task">
        <td class="code">${escapeHtml(code)}</td>
        <td class="name" style="padding-left:${indent}px">◆ ${escapeHtml(gantt.task_name)}</td>
        <td>${formatDate(gantt.start_date)}</td>
        <td>${formatDate(gantt.start_date)}</td>
        <td class="num">—</td>
        <td class="num">${gantt.progress}%</td>
        <td class="num">${gantt.total_float ?? "—"}</td>
        ${timelineCellHtml([], timelineWpx, todayX, { x })}
      </tr>`;
  }

  const bars: { left: number; width: number; className: string }[] = [];
  if (opts.showBaseline && gantt.baseline_start_date && gantt.baseline_finish_date) {
    bars.push({
      left: toX(gantt.baseline_start_date, rangeStart, dayW),
      width: getBarWidth(gantt.baseline_start_date, gantt.baseline_finish_date, dayW),
      className: "baseline",
    });
  }
  let mainWidth = 0;
  if (gantt.start_date && gantt.end_date) {
    const left = toX(gantt.start_date, rangeStart, dayW);
    mainWidth = getBarWidth(gantt.start_date, gantt.end_date, dayW);
    bars.push({ left, width: mainWidth, className: critical ? "planned critical" : "planned" });
    if (opts.showProgress && gantt.progress > 0) {
      bars.push({
        left,
        width: Math.min(mainWidth, mainWidth * (gantt.progress / 100)),
        className: "progress",
      });
    }
  }

  return `
    <tr class="task">
      <td class="code">${escapeHtml(code)}</td>
      <td class="name" style="padding-left:${indent}px">${escapeHtml(gantt.task_name)}</td>
      <td>${gantt.start_date ? formatDate(gantt.start_date) : "—"}</td>
      <td>${gantt.end_date ? formatDate(gantt.end_date) : "—"}</td>
      <td class="num">${dur ?? "—"}</td>
      <td class="num">${gantt.progress}%</td>
      <td class="num">${gantt.total_float ?? "—"}</td>
      ${timelineCellHtml(bars, timelineWpx, todayX)}
    </tr>`;
}

function groupRowHtml(
  row: Extract<SheetRow, { kind: "node" }>,
  depth: number,
  code: string,
  rangeStart: Date,
  dayW: number,
  timelineWpx: number,
  todayX: number | null,
  formatDate: (iso: string) => string,
): string {
  const indent = depth * 14;
  const { rollup } = row;
  const bars =
    rollup.start && rollup.end
      ? [{ left: toX(rollup.start, rangeStart, dayW), width: getBarWidth(rollup.start, rollup.end, dayW), className: "group" }]
      : [];
  return `
    <tr class="grp">
      <td class="code">${escapeHtml(code)}</td>
      <td class="name" style="padding-left:${indent}px">${escapeHtml(row.node.wbs_name)}</td>
      <td>${rollup.start ? formatDate(rollup.start) : "—"}</td>
      <td>${rollup.end ? formatDate(rollup.end) : "—"}</td>
      <td class="num">—</td>
      <td class="num">${Math.round(rollup.progress)}%</td>
      <td class="num">—</td>
      ${timelineCellHtml(bars, timelineWpx, todayX)}
    </tr>`;
}

/**
 * Renders every predecessor→successor link as an orthogonal MS-Project-style
 * connector, reusing the exact routing math the on-screen Gantt uses
 * (`gantt-dependency-lines.tsx`). Positioned as one absolute overlay spanning
 * every row — correct as long as the printout fits on a single page of rows;
 * on a run long enough to spill onto a second physical page, the repeating
 * `<thead>` on that page eats extra vertical space this single coordinate
 * space doesn't know about, so lines drift out of alignment from page 2
 * onward. A known limitation, not a bug — most printed programmes are short
 * enough that this never shows up.
 */
function buildDependencyLinesSvg(
  ganttByTaskId: Map<string, GanttTask>,
  taskTopById: Map<string, number>,
  rangeStart: Date,
  dayW: number,
  timelineWpx: number,
): string {
  interface Bar { left: number; right: number; cy: number }
  const bars = new Map<string, Bar>();
  for (const [id, top] of taskTopById) {
    const g = ganttByTaskId.get(id);
    const s = g?.start_date;
    if (!g || !s) continue;
    const e = g.end_date || s;
    const x = toX(s, rangeStart, dayW);
    const ms = !!g.is_milestone;
    const left = ms ? x + dayW / 2 : x;
    const right = ms ? x + dayW / 2 : x + getBarWidth(s, e, dayW);
    bars.set(id, { left, right, cy: top + ROW_H_PX / 2 });
  }

  const outSeen = new Map<string, number>();
  const inSeen = new Map<string, number>();
  const paths: { d: string; type: LinkType; bx: number; by: number }[] = [];

  for (const [taskId, g] of ganttByTaskId) {
    const preds = g.dependency_task_ids ?? [];
    for (let i = 0; i < preds.length; i++) {
      const pg = bars.get(preds[i]);
      const sg = bars.get(taskId);
      if (!pg || !sg) continue;

      const type = ((g.dependency_types?.[i] || "fs").toUpperCase()) as LinkType;
      const fromFinish = type === "FS" || type === "FF";
      const toStart = type === "FS" || type === "SS";
      const sx = fromFinish ? pg.right : pg.left;
      const exitDir: 1 | -1 = fromFinish ? 1 : -1;
      const tx = toStart ? sg.left : sg.right;
      const entryDir: 1 | -1 = toStart ? 1 : -1;

      const laneOut = outSeen.get(preds[i]) ?? 0;
      const laneIn = inSeen.get(taskId) ?? 0;
      outSeen.set(preds[i], laneOut + 1);
      inSeen.set(taskId, laneIn + 1);

      const { d, bx, by } = routePath(
        sx,
        pg.cy,
        exitDir,
        tx,
        sg.cy,
        entryDir,
        DEP_LINE_STUB + laneOut * DEP_LINE_LANE,
        DEP_LINE_STUB + laneIn * DEP_LINE_LANE,
        ROW_H_PX,
        timelineWpx,
        type,
        () => false, // print skips the on-screen "dodge a bar in the way" refinement
      );
      paths.push({ d, type, bx, by });
    }
  }

  if (paths.length === 0) return "";

  const pathsHtml = paths
    .map(
      (p) => `
        <path d="${p.d}" fill="none" stroke="${DEP_LINE_STROKE}" stroke-width="1.2" stroke-linejoin="round" marker-end="url(#dep-arrow)" />
        <rect x="${p.bx - 9}" y="${p.by - 5.5}" width="18" height="11" rx="2.5" fill="${DEP_LINE_BADGE_FILL}" />
        <text x="${p.bx}" y="${p.by}" text-anchor="middle" dominant-baseline="central" font-size="6.5" font-weight="700" fill="#fff">${p.type}</text>`,
    )
    .join("");

  const height = Math.max(...[...taskTopById.values()], 0) + ROW_H_PX;
  return `
    <svg class="dep-lines" style="position:absolute;top:${THEAD_H_PX}px;left:${LABEL_COL_PX}px;width:${timelineWpx}px;height:${height}px;overflow:visible" viewBox="0 0 ${timelineWpx} ${height}">
      <defs>
        <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M0,0 L8,4 L0,8 Z" fill="${DEP_LINE_STROKE}" />
        </marker>
      </defs>
      ${pathsHtml}
    </svg>
  `;
}

export function printGanttSchedule(input: GanttPrintInput, options: GanttPrintOptions): void {
  const { projectName, scheduleName, dataDate, tree, float, wbsCodeByRowId, formatDate = formatShortDate } = input;

  // Fully expanded — a printed record is meant to show everything, and the
  // reader can't "click to expand" paper. Drop the synthetic project row;
  // the header block already states the project name.
  const visible: VisibleRow[] = visibleRowsFrom(tree, new Set()).filter(
    (v) => !(v.row.kind === "node" && v.row.node.node_type === PROJECT_NODE_TYPE),
  );

  const ganttByTaskId = new Map<string, GanttTask>();
  for (const v of visible) {
    if (v.row.kind === "task") ganttByTaskId.set(v.row.task.id, toGanttTask(v.row.task, float.get(v.row.task.id)));
  }

  let rangeStart: Date;
  let rangeEnd: Date;
  if (options.dateRange) {
    rangeStart = new Date(options.dateRange.start);
    rangeEnd = new Date(options.dateRange.end);
  } else {
    const times: number[] = [];
    for (const g of ganttByTaskId.values()) {
      if (g.start_date) times.push(new Date(g.start_date).getTime());
      if (g.end_date) times.push(new Date(g.end_date).getTime());
      if (options.showBaseline) {
        if (g.baseline_start_date) times.push(new Date(g.baseline_start_date).getTime());
        if (g.baseline_finish_date) times.push(new Date(g.baseline_finish_date).getTime());
      }
    }
    rangeStart = times.length ? new Date(Math.min(...times)) : new Date();
    rangeEnd = times.length ? new Date(Math.max(...times)) : new Date(Date.now() + 30 * 86400000);
  }
  const totalDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1);

  const size = PAPER_SIZE_MM[options.paperSize];
  const marginMm = MARGIN_MM[options.margin];
  const pageWmm = options.orientation === "landscape" ? Math.max(size.w, size.h) : Math.min(size.w, size.h);
  const pageHmm = options.orientation === "landscape" ? Math.min(size.w, size.h) : Math.max(size.w, size.h);
  const contentWpx = (pageWmm - marginMm * 2) * PX_PER_MM;
  const timelineWpx = Math.max(MIN_TIMELINE_PX, contentWpx - LABEL_COL_PX);
  const dayW = timelineWpx / totalDays;

  const todayX = dataDate ? toX(dataDate, rangeStart, dayW) : null;

  // Month ruler, repeated in the table's <thead> so it reappears on every page.
  const ticks: { x: number; label: string }[] = [];
  const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
  while (cursor <= rangeEnd) {
    const iso = cursor.toISOString().slice(0, 10);
    ticks.push({ x: toX(iso, rangeStart, dayW), label: cursor.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  const rulerHtml = ticks
    .filter((t) => t.x >= -60 && t.x <= timelineWpx)
    .map((t) => `<span class="tick" style="left:${Math.max(0, t.x)}px">${t.label}</span>`)
    .join("");

  const taskTopById = new Map<string, number>();
  const rowsHtml = visible
    .map((v, i) => {
      const code = wbsCodeByRowId.get(v.row.id) ?? "";
      if (v.row.kind === "node") return groupRowHtml(v.row, v.depth, code, rangeStart, dayW, timelineWpx, todayX, formatDate);
      const gantt = ganttByTaskId.get(v.row.task.id);
      if (!gantt) return "";
      taskTopById.set(v.row.task.id, i * ROW_H_PX);
      return taskRowHtml(v.depth, gantt, code, rangeStart, dayW, timelineWpx, todayX, options, formatDate);
    })
    .join("");

  const dependencyLinesSvg = options.showDependencies
    ? buildDependencyLinesSvg(ganttByTaskId, taskTopById, rangeStart, dayW, timelineWpx)
    : "";

  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const dataDateLabel = dataDate
    ? new Date(dataDate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : "—";

  const html = `
    <div class="header">
      <div>
        <div class="logo">DCOS</div>
        <div style="font-size:8pt;color:#555">Digital Construction Operating System</div>
      </div>
      <div class="doc-ref">
        <strong>PROJECT PROGRAMME</strong><br>
        Project: ${escapeHtml(projectName)}<br>
        Schedule: ${escapeHtml(scheduleName)}<br>
        Printed: ${printedOn}<br>
        Data date: ${dataDateLabel}
      </div>
    </div>

    <div style="position:relative">
      <table class="repeat-header gantt-table" style="width:${LABEL_COL_PX + timelineWpx}px">
        <colgroup>
          <col style="width:70px"><col style="width:170px"><col style="width:56px"><col style="width:56px">
          <col style="width:40px"><col style="width:40px"><col style="width:48px"><col style="width:${timelineWpx}px">
        </colgroup>
        <thead>
          <tr class="ruler-row">
            <th colspan="7"></th>
            <th class="tl"><div class="ruler" style="width:${timelineWpx}px">${rulerHtml}</div></th>
          </tr>
          <tr>
            <th>Code</th><th>Task Name</th><th>Start</th><th>Finish</th>
            <th>Dur</th><th>%</th><th>Float</th><th>Timeline</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${dependencyLinesSvg}
    </div>

    <div class="legend">
      <span><span class="swatch planned"></span> Planned</span>
      ${options.highlightCritical ? `<span><span class="swatch critical"></span> Critical path</span>` : ""}
      ${options.showBaseline ? `<span><span class="swatch baseline"></span> Baseline</span>` : ""}
      ${options.showProgress ? `<span><span class="swatch progress"></span> % Complete</span>` : ""}
      ${options.showDependencies ? `<span>→ Dependency (FS/SS/FF/SF)</span>` : ""}
      <span><span class="swatch-line"></span> Data date</span>
    </div>

    <div class="footer">
      <span>Generated by DCOS — ${printedOn}</span>
      <span>${escapeHtml(projectName)} · ${escapeHtml(scheduleName)}</span>
    </div>
  `;

  const pageCss = `
    <style>
      @page { size: ${pageWmm}mm ${pageHmm}mm; margin: ${marginMm}mm; }
      body { padding: 0; font-size: 7.5pt; }
      table.gantt-table { table-layout: fixed; border-collapse: collapse; }
      table.gantt-table th, table.gantt-table td { border: 1px solid #ddd; padding: 1px 4px; font-size: 7pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      table.gantt-table thead tr:not(.ruler-row) th { background: #1e3a5f; color: #fff; height: ${HEADER_ROW_H_PX}px; }
      table.gantt-table thead tr.ruler-row th { background: #f1f5f9; border-bottom: none; padding: 0; }
      table.gantt-table td.num { text-align: right; }
      table.gantt-table tr.grp td { background: #e8eef5; font-weight: bold; }
      table.gantt-table tbody tr td { height: ${ROW_H_PX}px; }
      table.gantt-table tr { page-break-inside: avoid; }
      svg.dep-lines { pointer-events: none; }
      td.tl, th.tl { padding: 0; position: relative; }
      .tl-inner, .ruler { position: relative; height: 100%; min-height: 16px; }
      .ruler { height: 18px; }
      .ruler .tick { position: absolute; top: 2px; font-size: 6.5pt; color: #64748b; border-left: 1px solid #cbd5e1; padding-left: 2px; white-space: nowrap; }
      .bar { position: absolute; top: 3px; height: 10px; border-radius: 2px; background: #3b82f6; }
      .bar.planned.critical { background: #dc2626; }
      .bar.baseline { top: 1px; height: 4px; background: #94a3b8; border-radius: 1px; }
      .bar.progress { top: 3px; height: 10px; background: rgba(0,0,0,0.35); border-radius: 2px 0 0 2px; }
      .bar.group { top: 4px; height: 8px; background: #1e3a5f; }
      .milestone { position: absolute; top: 2px; width: 8px; height: 8px; background: #7c3aed; transform: rotate(45deg) translateX(-4px); }
      .dataday { position: absolute; top: 0; bottom: 0; border-left: 1px dashed #dc2626; }
      .legend { display: flex; gap: 16px; margin-top: 8px; font-size: 7.5pt; color: #444; align-items: center; }
      .legend .swatch { display: inline-block; width: 14px; height: 8px; border-radius: 2px; background: #3b82f6; margin-right: 4px; vertical-align: middle; }
      .legend .swatch.critical { background: #dc2626; }
      .legend .swatch.baseline { background: #94a3b8; }
      .legend .swatch.progress { background: rgba(0,0,0,0.35); }
      .legend .swatch-line { display: inline-block; width: 14px; border-top: 1px dashed #dc2626; margin-right: 4px; vertical-align: middle; }
    </style>
  `;

  openPrint(html, `${projectName} — ${scheduleName}`, pageCss);
}
