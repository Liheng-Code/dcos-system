"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { differenceInCalendarDays, format as fmtDate, isValid, parse as parseDateFns } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useIsWbsManager } from "@/hooks/use-is-wbs-manager";

// ---------------------------------------------------------------------------
// Column model — the PMO "Master WBS" sheet
// (docs/7_Floor_Building_Master_WBS_Complete_Mockup.xlsx → sheet "Master WBS").
// Header row 1; one row per WBS line. Summary rows (Project / Phase / Work
// Package) become wbs_nodes; Activity / Material Package rows become wbs_tasks.
// ---------------------------------------------------------------------------
type ColKey =
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

const COLUMNS: { key: ColKey; label: string; hint: string; required?: boolean }[] = [
  { key: "code", label: "WBS Code", hint: "Dot notation — 0, 01, 01.01, 01.04.07", required: true },
  { key: "level", label: "Level", hint: "0–5 (optional — derived from the code)" },
  { key: "name", label: "Activity / Work Package", hint: "Line name", required: true },
  { key: "type", label: "Type", hint: "Project · Phase · Work Package · Activity · Material Package", required: true },
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

// ---------------------------------------------------------------------------

type RowKind = "node" | "task";
type RowState = "new" | "skip" | "update" | "error";
type Mode = "merge" | "merge_update" | "replace";

interface Predecessor {
  code: string;
  type: string; // fs | ss | ff | sf
  lag: number;
}

interface MRow {
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

interface ImportSummary {
  mode: string;
  nodes_created: number;
  nodes_skipped: number;
  tasks_created: number;
  tasks_skipped: number;
  deps_linked: number;
  deps_unresolved: number;
  warnings: string[];
}

interface MasterWbsImportDialogProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "importing" | "done";

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

function depthOf(code: string): number {
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

export function MasterWbsImportDialog({ projectId, onClose, onImported }: MasterWbsImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isManager = useIsWbsManager();

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [sheetUsed, setSheetUsed] = useState("");
  const [rows, setRows] = useState<MRow[]>([]);
  const [mode, setMode] = useState<Mode>("merge");
  const [dragging, setDragging] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const stats = useMemo(() => {
    const usable = rows.filter((r) => r.state !== "error" && !r.isProjectRow);
    return {
      nodes: usable.filter((r) => r.kind === "node").length,
      tasks: usable.filter((r) => r.kind === "task").length,
      skip: rows.filter((r) => r.state === "skip" && !r.isProjectRow).length,
      errors: rows.filter((r) => r.state === "error").length,
      projectSkipped: rows.some((r) => r.isProjectRow),
      predWarnings: rows.reduce((a, r) => a + r.warnings.filter((w) => w.startsWith("Predecessor")).length, 0),
    };
  }, [rows]);

  const parseFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setFileName(file.name);
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
        const sheetName =
          wb.SheetNames.find((n) => n.trim().toLowerCase() === TARGET_SHEET) ?? wb.SheetNames[0];
        setSheetUsed(sheetName);
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
        if (raw.length === 0) {
          toast.error(`Sheet "${sheetName}" is empty`);
          return;
        }

        const headers = Object.keys(raw[0]);
        const col: Partial<Record<ColKey, string>> = {};
        for (const key of Object.keys(HEADER_ALIASES) as ColKey[]) {
          col[key] = headers.find(
            (h) => normHeader(h) === normHeader(key) || HEADER_ALIASES[key].includes(normHeader(h)),
          );
        }
        if (!col.code || !col.name || !col.type) {
          toast.error('Missing required columns — need "WBS Code", "Activity / Work Package" and "Type"');
          return;
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
            isBelowGround: /^b\s*-?\d/i.test(area),
            isExternal: /^ext/i.test(area.trim()) || area.trim().toLowerCase() === "external",
            scheduleLevel: clampLevel(level || depthOf(rawCode)),
            state: "new" as RowState,
            errors,
            warnings,
          };
        });

        // -- Pass 2: drop the sheet's Project row, resolve hierarchy -------
        // The DCOS project is already fixed from the global project picker and
        // shown as the WBS root, so the sheet's level-0 Project row is never
        // imported. Its direct children (the phases) re-attach at the top level.
        const projectKeys = new Set(parsed.filter((r) => r.isProjectRow).map((r) => r.key));
        for (const r of parsed) {
          if (projectKeys.has(r.parentKey)) r.parentKey = "";
          if (r.isProjectRow) r.warnings.push("Skipped — phases attach under your current project");
        }

        const sheetKeys = new Set(parsed.filter((r) => r.key && !r.isProjectRow).map((r) => r.key));
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

        const supabase = createClient();
        const [nodesRes, tasksRes] = await Promise.all([
          supabase
            .from("wbs_nodes")
            .select("wbs_code, wbs_outline_code, full_path")
            .eq("project_id", projectId),
          supabase.from("wbs_tasks").select("task_code").eq("project_id", projectId),
        ]);
        // A node's dotted key = its ancestor wbs_code chain (== full_path with
        // " / " → "."), matching the sheet's WBS Code. Same rule the RPC uses.
        const existingNodeKeys = new Set(
          (nodesRes.data ?? [])
            .map((n) => {
              const chain = n.full_path ? String(n.full_path).split(" / ").join(".") : "";
              return (n.wbs_outline_code || chain || n.wbs_code || "").trim();
            })
            .filter(Boolean),
        );
        const existingTaskKeys = new Set(
          (tasksRes.data ?? []).map((t) => String(t.task_code ?? "").trim()).filter(Boolean),
        );

        for (const r of parsed) {
          if (r.errors.length) continue;
          if (r.parentKey && !sheetKeys.has(r.parentKey) && !existingNodeKeys.has(r.parentKey)) {
            r.errors.push(`Parent "${r.parentKey}" is not in the sheet or the project`);
          }
        }

        // Cascade: a child of a broken row can't be created either.
        const byKey = new Map(parsed.map((r) => [r.key, r]));
        let changed = true;
        while (changed) {
          changed = false;
          for (const r of parsed) {
            if (r.errors.length || !r.parentKey) continue;
            const p = byKey.get(r.parentKey);
            if (p && p.errors.length) {
              r.errors.push(`Parent row ${p._row} has errors`);
              changed = true;
            }
          }
        }

        // -- Pass 3: state + sort_order (per parent, sheet order) ----------
        const groupCount = new Map<string, number>();
        for (const r of parsed) {
          if (r.isProjectRow) {
            r.state = r.errors.length ? "error" : "skip";
            continue;
          }
          const existing =
            r.kind === "node" ? existingNodeKeys.has(r.key) : existingTaskKeys.has(r.key);
          r.state = r.errors.length ? "error" : existing ? "skip" : "new";

          const g = r.parentKey || "__root__";
          const n = (groupCount.get(g) ?? 0) + 1;
          groupCount.set(g, n);
          r.sortOrder = n * 10;

          const missingPreds = r.preds.filter(
            (p) => !sheetKeys.has(p.code) && !existingNodeKeys.has(p.code) && !existingTaskKeys.has(p.code),
          );
          for (const p of missingPreds) r.warnings.push(`Predecessor ${p.code} not found — kept as text`);
        }

        setRows(parsed);
        setStep("preview");
      } catch (e) {
        toast.error("Couldn't read that file: " + (e instanceof Error ? e.message : "unknown error"));
      }
    },
    [projectId],
  );

  async function runImport() {
    const usable = rows.filter((r) => r.state !== "error" && !r.isProjectRow);
    if (usable.length === 0) return;
    setStep("importing");

    const nodeRows = usable
      .filter((r) => r.kind === "node")
      .sort((a, b) => depthOf(a.key) - depthOf(b.key) || a._row - b._row);
    const taskRows = usable.filter((r) => r.kind === "task");

    const payload = {
      nodes: nodeRows.map((r) => ({
        key: r.key,
        parent_key: r.parentKey,
        node_type: r.nodeType || "task_group",
        wbs_code: r.key === "0" ? "0" : r.key.includes(".") ? r.key.slice(r.key.lastIndexOf(".") + 1) : r.key,
        outline_code: r.key,
        wbs_name: r.name,
        discipline: r.discipline || null,
        area_label: r.area || null,
        cost_code: r.costCode || null,
        is_below_ground: r.isBelowGround,
        is_external_works: r.isExternal,
        schedule_level: r.scheduleLevel,
        sort_order: r.sortOrder,
      })),
      tasks: taskRows.map((r) => ({
        ord: r._row,
        node_key: r.parentKey,
        task_code: r.key,
        outline_code: r.key,
        task_name: r.name,
        task_type: r.taskType || "activity",
        activity_type: "normal",
        is_milestone: r.durationDays === 0,
        discipline: r.discipline || null,
        area_label: r.area || null,
        cost_code: r.costCode || null,
        start_date: r.start,
        end_date: r.finish,
        duration_days: r.durationDays,
        owner_name: r.resources || null,
        description: r.notes || null,
        dependency_text: r.predText || null,
        schedule_level: r.scheduleLevel,
        sort_order: r.sortOrder,
        predecessors: r.preds,
      })),
    };

    const supabase = createClient();
    const { data, error } = await supabase.rpc("import_master_wbs", {
      p_project_id: projectId,
      p_payload: payload,
      p_mode: mode,
    });

    if (error) {
      toast.error("Import failed: " + error.message);
      setStep("preview");
      return;
    }

    const s = (data ?? {}) as ImportSummary;
    setSummary(s);
    toast.success(
      `Imported ${s.nodes_created ?? 0} node${(s.nodes_created ?? 0) === 1 ? "" : "s"} and ${
        s.tasks_created ?? 0
      } activit${(s.tasks_created ?? 0) === 1 ? "y" : "ies"}`,
    );
    setStep("done");
  }

  function buildTemplateSheet() {
    const aoa = [
      COLUMNS.map((c) => c.label),
      ["0", 0, "PROJECT — SAMPLE BUILDING", "Project", "", "", 400, "01-Oct-2026", "30-Nov-2027", "", "PM Team", "PRJ-000", "Master project"],
      ["01", 1, "01 DESIGN & ENGINEERING", "Phase", "Design", "", 120, "01-Oct-2026", "31-Jan-2027", "", "PM Team", "D-1000", ""],
      ["01.01", 2, "01.01 DESIGN MANAGEMENT", "Work Package", "Design", "", 120, "01-Oct-2026", "31-Jan-2027", "01", "Design Manager", "D-1100", ""],
      ["01.01.01", 3, "Design Brief", "Activity", "Design", "", 10, "01-Oct-2026", "10-Oct-2026", "01.01", "Design Manager, Client", "D-1100", ""],
      ["01.01.02", 3, "Design Criteria", "Activity", "Design", "", 8, "13-Oct-2026", "20-Oct-2026", "01.01.01", "Design Manager", "D-1100", ""],
      ["02", 1, "02 CONSTRUCTION", "Phase", "Construction", "", 280, "01-Feb-2027", "30-Nov-2027", "01", "PM Team", "C-2000", ""],
      ["02.01", 2, "02.01 GROUND FLOOR", "Work Package", "Construction", "GF", 90, "01-Feb-2027", "01-May-2027", "01.01.02", "Site Team", "C-2100", ""],
      ["02.01.01", 3, "Setting Out", "Activity", "Structural", "GF", 2, "01-Feb-2027", "02-Feb-2027", "02.01", "Surveyor", "C-2100", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [12, 7, 40, 16, 14, 12, 14, 15, 15, 18, 24, 12, 24].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master WBS");
    return wb;
  }

  const downloadTemplate = (ext: "xlsx" | "csv") =>
    XLSX.writeFile(buildTemplateSheet(), `master-wbs-template.${ext}`, { bookType: ext });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(1080px,94vw)] max-w-none sm:max-w-none">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Import Master WBS
          </DialogTitle>
          <DialogDescription>
            Import a PMO master programme. <strong>Phase / Work Package</strong> rows become WBS nodes;{" "}
            <strong>Activity / Material Package</strong> rows become scheduled activities with baseline
            dates and predecessor links. The sheet&apos;s top-level Project row is skipped — the WBS
            hangs off your current project. Reads the sheet named <strong>Master WBS</strong>.
          </DialogDescription>
        </DialogHeader>

        {/* Step rail */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          {(["upload", "preview", "importing"] as const).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3" />}
              <span
                className={cn(
                  "capitalize",
                  (step === s || (s === "importing" && step === "done")) && "font-semibold text-foreground",
                )}
              >
                {s === "importing" ? "Import" : s}
              </span>
            </span>
          ))}
        </div>

        {step === "upload" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Expected columns</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {COLUMNS.map((c) => (
                  <div key={c.key} className="rounded-md border border-border bg-background px-2 py-1.5">
                    <div className="flex items-center gap-1 text-xs font-medium">
                      {c.label}
                      {c.required && <span className="text-destructive">*</span>}
                    </div>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{c.hint}</p>
                  </div>
                ))}
              </div>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadTemplate("xlsx")}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Excel template
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadTemplate("csv")}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> CSV template
                </Button>
              </div>
            </div>

            <div
              onDrop={onDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors",
                dragging ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/50",
              )}
            >
              <FileSpreadsheet className="h-7 w-7 text-muted-foreground" />
              <p className="text-sm font-medium">Drop your file here</p>
              <p className="text-[11px] text-muted-foreground">or click to browse — .xlsx, .xls, .csv</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => parseFile(e.target.files?.[0] ?? null)}
              />
              <Button size="sm" variant="outline" className="mt-1 h-7 text-[11px]">
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Select file
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground">
                <strong className="text-foreground">{rows.length}</strong> rows ·{" "}
                <strong className="text-foreground">{fileName}</strong> · sheet{" "}
                <strong className="text-foreground">{sheetUsed}</strong> ·{" "}
                <span className="text-emerald-600">{stats.nodes} nodes</span>
                {" · "}
                <span className="text-sky-600">{stats.tasks} activities</span>
                {stats.skip > 0 && <> {" · "}<span className="text-slate-500">{stats.skip} already exist</span></>}
                {stats.errors > 0 && <> {" · "}<span className="text-amber-600">{stats.errors} errors</span></>}
              </span>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => fileInputRef.current?.click()}>
                Change file
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => parseFile(e.target.files?.[0] ?? null)}
              />
            </div>

            {stats.projectSkipped && (
              <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  The sheet&apos;s top-level <strong>Project</strong> row is skipped — your project is
                  already set from the project picker. Its phases import directly under it.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2 text-[11px]">
              <span className="font-semibold text-muted-foreground">If a row already exists</span>
              {(
                [
                  ["merge", "Skip it"],
                  ["merge_update", "Overwrite it"],
                  ["replace", "Replace the whole WBS"],
                ] as [Mode, string][]
              ).map(([m, label]) => (
                <label key={m} className={cn("flex items-center gap-1.5", m === "replace" && !isManager && "opacity-40")}>
                  <input
                    type="radio"
                    name="mwbs-mode"
                    checked={mode === m}
                    disabled={m === "replace" && !isManager}
                    onChange={() => setMode(m)}
                  />
                  {label}
                </label>
              ))}
              {!isManager && (
                <span className="text-muted-foreground">— replace needs a project manager</span>
              )}
            </div>

            <div className="max-h-[22rem] overflow-auto rounded-lg border border-border">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-12" />
                  <col className="w-28" />
                  <col className="w-24" />
                  <col />
                  <col className="w-32" />
                  <col className="w-24" />
                  <col className="w-28" />
                  <col className="w-28" />
                  <col className="w-12" />
                </colgroup>
                <thead className="sticky top-0 bg-muted text-left text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Code</th>
                    <th className="px-2 py-1.5">Kind</th>
                    <th className="px-2 py-1.5">Name</th>
                    <th className="px-2 py-1.5">Discipline</th>
                    <th className="px-2 py-1.5">Area</th>
                    <th className="whitespace-nowrap px-2 py-1.5">Start</th>
                    <th className="whitespace-nowrap px-2 py-1.5">Finish</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 400).map((r) => (
                    <tr
                      key={r._row}
                      className={cn(
                        "border-t border-border/60",
                        r.state === "error" && "bg-amber-50/60",
                        r.state === "skip" && "text-muted-foreground",
                        r.isProjectRow && "opacity-60",
                      )}
                    >
                      <td className="px-2 py-1 text-muted-foreground tabular-nums">{r._row}</td>
                      <td className="px-2 py-1 font-mono">{r.rawCode || "—"}</td>
                      <td className="px-2 py-1">
                        <span
                          className={cn(
                            "rounded px-1 py-0.5 text-[10px] font-medium",
                            r.isProjectRow
                              ? "bg-slate-100 text-slate-500"
                              : r.kind === "node"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-sky-100 text-sky-700",
                          )}
                        >
                          {r.isProjectRow ? "Project · skip" : r.kind === "node" ? "Node" : "Task"}
                        </span>
                      </td>
                      <td
                        className="truncate px-2 py-1"
                        title={r.name}
                        style={{ paddingLeft: 8 + Math.max(0, depthOf(r.key)) * 12 }}
                      >
                        {r.name || "—"}
                      </td>
                      <td className="truncate px-2 py-1">{r.discipline || "—"}</td>
                      <td className="truncate px-2 py-1">{r.area || "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">{r.start ?? "—"}</td>
                      <td className="whitespace-nowrap px-2 py-1 tabular-nums">{r.finish ?? "—"}</td>
                      <td className="px-2 py-1">
                        {r.errors.length > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-amber-600" title={r.errors.join("; ")}>
                            <AlertTriangle className="h-3 w-3" />
                            {r.errors.length}
                          </span>
                        ) : r.warnings.length > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-slate-400" title={r.warnings.join("; ")}>
                            <Info className="h-3 w-3" />
                            {r.warnings.length}
                          </span>
                        ) : (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {stats.errors > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-1 text-[11px] font-semibold text-amber-800">Rows that will be skipped</p>
                <ul className="list-inside list-disc space-y-0.5 text-[11px] text-amber-700">
                  {rows
                    .filter((r) => r.state === "error")
                    .slice(0, 8)
                    .map((r) => (
                      <li key={r._row}>
                        Row {r._row} ({r.rawCode || r.name || "?"}): {r.errors.join("; ")}
                      </li>
                    ))}
                  {stats.errors > 8 && <li className="text-amber-500">…and {stats.errors - 8} more</li>}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={stats.nodes + stats.tasks === 0} onClick={runImport}>
                Import {stats.nodes} node{stats.nodes === 1 ? "" : "s"} + {stats.tasks} activit
                {stats.tasks === 1 ? "y" : "ies"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Importing {stats.nodes} nodes and {stats.tasks} activities…
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            <p className="text-sm font-semibold">Import complete</p>
            {summary && (
              <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>Nodes created</span>
                <span className="text-right font-medium text-foreground">{summary.nodes_created}</span>
                <span>Nodes skipped</span>
                <span className="text-right font-medium text-foreground">{summary.nodes_skipped}</span>
                <span>Activities created</span>
                <span className="text-right font-medium text-foreground">{summary.tasks_created}</span>
                <span>Activities skipped</span>
                <span className="text-right font-medium text-foreground">{summary.tasks_skipped}</span>
                <span>Predecessor links</span>
                <span className="text-right font-medium text-foreground">{summary.deps_linked}</span>
                <span>Predecessors unresolved</span>
                <span className="text-right font-medium text-foreground">{summary.deps_unresolved}</span>
              </div>
            )}
            {summary && summary.warnings?.length > 0 && (
              <div className="mt-2 max-h-28 w-full overflow-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-700">
                {summary.warnings.slice(0, 20).map((w, i) => (
                  <div key={i}>{w}</div>
                ))}
              </div>
            )}
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                onImported();
                onClose();
              }}
            >
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
