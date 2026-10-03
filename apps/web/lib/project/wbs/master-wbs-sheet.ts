// The PMO "Master WBS" Excel sheet: column model and row parsing, shared by the project import
// (components/project/wbs/master-wbs-import-dialog.tsx) and WBS template import.
// (docs/7_Floor_Building_Master_WBS_Complete_Mockup.xlsx → sheet "Master WBS".)
// Header row 1; one row per WBS line. Summary rows (Project / Phase / Work Package) become
// wbs_nodes; Activity / Material Package rows become wbs_tasks.

import * as XLSX from "xlsx";
import { differenceInCalendarDays, format as fmtDate, isValid, parse as parseDateFns } from "date-fns";
import type { SrcNode, SrcTask } from "@/lib/project/wbs/wbs-template";

export type ColKey =
  | "code"
  | "level"
  | "name"
  | "type"
  | "discipline"
  | "area"
  | "duration"
  | "start"
  | "finish"
  | "predecessors"
  | "resources"
  | "cost_code"
  | "notes";

export const COLUMNS: { key: ColKey; label: string; hint: string; required?: boolean }[] = [
  { key: "code", label: "WBS Code", hint: "Dot notation — 0, 01, 01.01, 01.04.07", required: true },
  { key: "level", label: "Level", hint: "0–5 (optional — derived from the code)" },
  { key: "name", label: "Activity / Work Package", hint: "Line name", required: true },
  { key: "type", label: "Type", hint: "Project · Phase · Building · Level · Work Package · Activity · Material Package", required: true },
  { key: "discipline", label: "Discipline", hint: "Structural, MEP, Architectural…" },
  { key: "area", label: "Floor / Area", hint: "B1, GF, 1F…7F, RF, External" },
  { key: "duration", label: "Duration (Days)", hint: "Whole days (activities)" },
  { key: "start", label: "Baseline Start", hint: "dd-MMM-yyyy" },
  { key: "finish", label: "Baseline Finish", hint: "dd-MMM-yyyy" },
  { key: "predecessors", label: "Predecessors", hint: "Comma-separated WBS codes" },
  { key: "resources", label: "Resources", hint: "Comma-separated (free text)" },
  { key: "cost_code", label: "Cost Code", hint: "e.g. D-1100, C-32G1" },
  { key: "notes", label: "Notes / Remarks", hint: "Free text" },
];

const HEADER_ALIASES: Record<ColKey, string[]> = {
  code: ["wbscode", "code", "wbs", "id"],
  level: ["level", "outlinelevel", "depth", "tier"],
  name: ["activityworkpackage", "activity", "workpackage", "name", "title", "description"],
  type: ["type", "nodetype", "kind"],
  discipline: ["discipline", "trade"],
  area: ["floorarea", "floor", "area", "zone", "location"],
  duration: ["durationdays", "duration", "days", "dur"],
  start: ["baselinestart", "start", "startdate", "plannedstart"],
  finish: ["baselinefinish", "finish", "finishdate", "end", "enddate", "plannedfinish"],
  predecessors: ["predecessors", "predecessor", "preds", "logic", "depends", "dependency"],
  resources: ["resources", "resource", "crew"],
  cost_code: ["costcode", "cost", "cbs", "costcentre"],
  notes: ["notesremarks", "notes", "remarks", "comment", "comments"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[\s_\-/.()]/g, "");

const TARGET_SHEET = "master wbs";

export type RowKind = "node" | "task";
export type RowState = "new" | "skip" | "update" | "error";

export interface Predecessor {
  code: string;
  type: string; // fs | ss | ff | sf
  lag: number;
}

export interface MRow {
  _row: number;
  rawCode: string;
  key: string;
  parentKey: string;
  level: number;
  name: string;
  typeRaw: string;
  kind: RowKind;
  nodeType: string;
  taskType: string;
  /** The sheet's level-0 Project row — never imported; the app's project is the root. */
  isProjectRow: boolean;
  discipline: string;
  area: string;
  durationDays: number | null;
  start: string | null;
  finish: string | null;
  predText: string;
  preds: Predecessor[];
  resources: string;
  costCode: string;
  notes: string;
  sortOrder: number;
  isBelowGround: boolean;
  isExternal: boolean;
  scheduleLevel: number;
  state: RowState;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

const CODE_RE = /^\d+(?:\.\d+)*$/;

function normCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").replace(/[，、]/g, ",");
}

function parentOf(code: string): string {
  if (!code || code === "0") return "";
  const i = code.lastIndexOf(".");
  if (i === -1) return "0"; // top-level phase → hangs off the project root row
  return code.slice(0, i);
}

export function depthOf(code: string): number {
  if (code === "0") return 0;
  return code.split(".").length;
}

/** Strip a leading token equal to the WBS code (or its last segment) from a name. */
function stripCodePrefix(name: string, code: string): string {
  const n = name.trim();
  const last = code.includes(".") ? code.slice(code.lastIndexOf(".") + 1) : code;
  for (const token of [code, last]) {
    if (token && n.toLowerCase().startsWith(token.toLowerCase())) {
      const rest = n.slice(token.length).replace(/^[\s.:)\-–—]+/, "");
      if (rest) return rest;
    }
  }
  return n;
}

const DATE_FORMATS = ["dd-MMM-yyyy", "d-MMM-yyyy", "dd-MMM-yy", "yyyy-MM-dd", "dd/MM/yyyy", "d/M/yyyy", "MM/dd/yyyy"];

function parseCellDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return isValid(v) ? fmtDate(v, "yyyy-MM-dd") : null;
  if (typeof v === "number" && Number.isFinite(v)) {
    // Excel serial date (1900 date system)
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isValid(d) ? fmtDate(d, "yyyy-MM-dd") : null;
  }
  const s = String(v).trim();
  if (!s) return null;
  for (const f of DATE_FORMATS) {
    const d = parseDateFns(s, f, new Date());
    if (isValid(d)) return fmtDate(d, "yyyy-MM-dd");
  }
  const iso = new Date(s);
  return isValid(iso) ? fmtDate(iso, "yyyy-MM-dd") : null;
}

const PRED_RE = /^(\d+(?:\.\d+)*)\s*(FS|SS|FF|SF)?\s*([+-]\s*\d+)?\s*d?$/i;

function parsePredecessors(raw: string): { list: Predecessor[]; bad: string[] } {
  const list: Predecessor[] = [];
  const bad: string[] = [];
  for (const part of raw.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(PRED_RE);
    if (!m) {
      bad.push(part);
      continue;
    }
    list.push({
      code: m[1],
      type: (m[2] ?? "fs").toLowerCase(),
      lag: m[3] ? Number(m[3].replace(/\s+/g, "")) : 0,
    });
  }
  return { list, bad };
}

function classifyType(
  raw: string,
): { kind: RowKind; nodeType: string; taskType: string; known: boolean; isProject: boolean } {
  const s = raw.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  if (s === "project")
    return { kind: "node", nodeType: "building", taskType: "", known: true, isProject: true };
  if (s === "phase")
    return { kind: "node", nodeType: "phase", taskType: "", known: true, isProject: false };
  if (s === "work package" || s === "workpackage" || s === "summary" || s === "wp")
    return { kind: "node", nodeType: "task_group", taskType: "", known: true, isProject: false };
  // Location rows: real building / level / zone nodes (level types, GFA, floor blocks rely on them).
  if (s === "building" || s === "block" || s === "tower")
    return { kind: "node", nodeType: "building", taskType: "", known: true, isProject: false };
  if (s === "level" || s === "floor" || s === "storey" || s === "story")
    return { kind: "node", nodeType: "level", taskType: "", known: true, isProject: false };
  if (s === "zone")
    return { kind: "node", nodeType: "zone", taskType: "", known: true, isProject: false };
  if (s === "material package" || s === "material" || s === "procurement")
    return { kind: "task", nodeType: "", taskType: "material_package", known: true, isProject: false };
  if (s === "activity" || s === "task")
    return { kind: "task", nodeType: "", taskType: "activity", known: true, isProject: false };
  return { kind: "task", nodeType: "", taskType: "activity", known: false, isProject: false };
}

function clampLevel(n: number): number {
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, Math.round(n)));
}

// ---------------------------------------------------------------------------

/** Reads the "Master WBS" sheet (or the first sheet) as row objects keyed by header. */
export function readMasterWbsWorkbook(data: ArrayBuffer): { sheetName: string; raw: Record<string, unknown>[] } {
  const wb = XLSX.read(data, { type: "array", cellDates: true });
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === TARGET_SHEET) ?? wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], { defval: "", raw: false });
  return { sheetName, raw };
}

/**
 * Parses sheet rows into MRows (pass 1: cells; pass 2: drop the Project row, resolve hierarchy).
 * Project-specific checks (what already exists) are left to the caller. Throws on missing columns.
 */
export function parseMasterWbsRows(raw: Record<string, unknown>[]): MRow[] {
  if (raw.length === 0) throw new Error("The sheet is empty");
  const headers = Object.keys(raw[0]);
  const col: Partial<Record<ColKey, string>> = {};
  for (const key of Object.keys(HEADER_ALIASES) as ColKey[]) {
    col[key] = headers.find(
      (h) => normHeader(h) === normHeader(key) || HEADER_ALIASES[key].includes(normHeader(h)),
    );
  }
  if (!col.code || !col.name || !col.type) {
    throw new Error('Missing required columns — need "WBS Code", "Activity / Work Package" and "Type"');
  }

  const cell = (r: Record<string, unknown>, key: ColKey) =>
    col[key] ? String(r[col[key]!] ?? "").trim() : "";
  const cellRaw = (r: Record<string, unknown>, key: ColKey) => (col[key] ? r[col[key]!] : "");

  // -- Pass 1: raw parse ------------------------------------------------
  const parsed: MRow[] = raw.map((r, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const rawCode = normCode(cell(r, "code"));
    const key = rawCode;
    const name0 = cell(r, "name");
    const typeRaw = cell(r, "type");

    if (!rawCode) errors.push("WBS Code is required");
    else if (!CODE_RE.test(rawCode)) errors.push(`WBS Code "${rawCode}" is not dot-notation`);
    if (!name0) errors.push("Name is required");

    const levelCell = Number(cell(r, "level"));
    const level = Number.isFinite(levelCell) && cell(r, "level") !== "" ? levelCell : depthOf(rawCode);

    const t = classifyType(typeRaw);
    const isProjectRow = t.isProject || rawCode === "0" || level === 0;
    if (!typeRaw) errors.push("Type is required");
    else if (!t.known && !isProjectRow)
      warnings.push(`Unrecognised Type "${typeRaw}" — treated as Activity`);

    const durStr = cell(r, "duration");
    const durationDays = durStr !== "" && Number.isFinite(Number(durStr)) ? Number(durStr) : null;

    const start = parseCellDate(cellRaw(r, "start"));
    const finish = parseCellDate(cellRaw(r, "finish"));
    if (cell(r, "start") && !start) warnings.push(`Baseline Start "${cell(r, "start")}" not understood`);
    if (cell(r, "finish") && !finish) warnings.push(`Baseline Finish "${cell(r, "finish")}" not understood`);
    if (start && finish && finish < start) warnings.push("Baseline Finish is before Baseline Start");
    if (durationDays != null && start && finish) {
      const span = differenceInCalendarDays(new Date(finish), new Date(start));
      if (Math.abs(span - durationDays) > 3)
        warnings.push(`Duration ${durationDays}d ≠ date span ${span}d`);
    }

    const predText = cell(r, "predecessors");
    const { list: preds, bad } = parsePredecessors(predText);
    for (const b of bad) warnings.push(`Predecessor "${b}" not understood — kept as text`);

    const area = cell(r, "area");

    return {
      _row: i + 2,
      rawCode,
      key,
      parentKey: parentOf(rawCode),
      level,
      name: stripCodePrefix(name0, rawCode),
      typeRaw,
      kind: t.kind,
      nodeType: t.nodeType,
      taskType: t.taskType,
      isProjectRow,
      discipline: cell(r, "discipline"),
      area,
      durationDays,
      start,
      finish,
      predText,
      preds,
      resources: cell(r, "resources"),
      costCode: cell(r, "cost_code"),
      notes: cell(r, "notes"),
      sortOrder: 0,
      isBelowGround: /^b\s*-?\d/i.test(area)
        || (t.nodeType === "level" && /^(b\s*-?\d|lg\b|ug\b|basement)/i.test(stripCodePrefix(name0, rawCode))),
      isExternal: /^ext/i.test(area.trim()) || area.trim().toLowerCase() === "external",
      scheduleLevel: clampLevel(level || depthOf(rawCode)),
      state: "new" as RowState,
      errors,
      warnings,
    };
  });

  // -- Pass 2: drop the sheet's Project row, resolve hierarchy -------
  // The DCOS project is the WBS root, so the sheet's level-0 Project row is never
  // imported. Its direct children (the phases) re-attach at the top level.
  const projectKeys = new Set(parsed.filter((r) => r.isProjectRow).map((r) => r.key));
  for (const r of parsed) {
    if (projectKeys.has(r.parentKey)) r.parentKey = "";
    if (r.isProjectRow) r.warnings.push("Skipped — phases attach under your current project");
  }

  const parentKeys = new Set(
    parsed.filter((r) => !r.isProjectRow).map((r) => r.parentKey).filter(Boolean),
  );
  for (const r of parsed) {
    if (r.kind === "task" && parentKeys.has(r.key)) {
      r.kind = "node";
      r.nodeType = "task_group";
      r.taskType = "";
      r.warnings.push("Has child rows — imported as a Work Package node");
    }
  }
  return parsed;
}

/**
 * Sheet rows as a WBS (nodes + activities) for template creation. Rows with errors, rows whose
 * parent is missing, and the Project row are left out; predecessors become links between activities.
 */
export function masterWbsRowsToSrc(rows: MRow[]): { nodes: SrcNode[]; tasks: SrcTask[]; skipped: number } {
  const usable = rows.filter((r) => !r.isProjectRow && r.errors.length === 0);
  const nodeKeys = new Set(usable.filter((r) => r.kind === "node").map((r) => r.key));
  const nodes: SrcNode[] = [];
  const tasks: SrcTask[] = [];
  const order = new Map<string, number>();
  const nextOrder = (parent: string) => {
    const n = (order.get(parent) ?? 0) + 1;
    order.set(parent, n);
    return n * 10;
  };
  // Parents first, so a missing parent can be detected in one pass.
  const sorted = [...usable].sort((a, b) => depthOf(a.key) - depthOf(b.key) || a._row - b._row);
  const kept = new Set<string>();
  for (const r of sorted) {
    if (r.kind !== "node") continue;
    if (r.parentKey && !kept.has(r.parentKey)) continue;
    kept.add(r.key);
    nodes.push({
      id: r.key, parent_id: r.parentKey || null, node_type: r.nodeType || "task_group",
      wbs_code: r.key.includes(".") ? r.key.slice(r.key.lastIndexOf(".") + 1) : r.key, wbs_name: r.name,
      discipline: r.discipline || null, cost_code: r.costCode || null, is_external_works: r.isExternal,
      schedule_level: r.scheduleLevel, sort_order: nextOrder(r.parentKey),
    });
  }
  const taskKeys = new Set(usable.filter((r) => r.kind === "task").map((r) => r.key));
  for (const r of [...usable].sort((a, b) => a._row - b._row)) {
    if (r.kind !== "task" || !kept.has(r.parentKey) || !nodeKeys.has(r.parentKey)) continue;
    const preds = r.preds.filter((p) => taskKeys.has(p.code));
    tasks.push({
      id: r.key, wbs_node_id: r.parentKey, task_code: r.key, task_name: r.name,
      task_type: r.taskType || "activity", activity_type: "normal", is_milestone: r.durationDays === 0,
      discipline: r.discipline || null, cost_code: r.costCode || null, duration_days: r.durationDays,
      description: r.notes || null, schedule_level: r.scheduleLevel, sort_order: nextOrder(r.parentKey),
      dependency_task_ids: preds.map((p) => p.code), dependency_types: preds.map((p) => p.type),
      dependency_lag_days: preds.map((p) => p.lag),
    });
  }
  return { nodes, tasks, skipped: rows.length - nodes.length - tasks.length };
}
