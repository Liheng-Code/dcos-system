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
import { COLUMNS, depthOf, parseMasterWbsRows, readMasterWbsWorkbook, type MRow } from "@/lib/project/wbs/master-wbs-sheet";
import { importMasterWbs, listWbsNodesByProjectIdOfIdAndWbsCode, listWbsTasksByProjectId } from "@/lib/project/wbs/wbs-queries";
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

type Mode = "merge" | "merge_update" | "replace";

const NODE_KIND_LABEL: Record<string, string> = {
  phase: "Phase", building: "Building", level: "Level", zone: "Zone", task_group: "Package",
};

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

  // Rows the user unticked in the preview (a key also excludes everything under it).
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const isExcluded = useCallback(
    (r: MRow) => [...excluded].some((k) => r.key === k || r.key.startsWith(`${k}.`)),
    [excluded],
  );
  const toggleRow = (r: MRow) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (isExcluded(r)) {
        // Re-tick: drop this key and anything excluded below it (a parent stays as it was).
        for (const k of [...next]) if (k === r.key || k.startsWith(`${r.key}.`)) next.delete(k);
      } else {
        next.add(r.key);
      }
      return next;
    });

  const stats = useMemo(() => {
    const usable = rows.filter((r) => r.state !== "error" && !r.isProjectRow && !isExcluded(r));
    return {
      nodes: usable.filter((r) => r.kind === "node").length,
      tasks: usable.filter((r) => r.kind === "task").length,
      skip: rows.filter((r) => r.state === "skip" && !r.isProjectRow).length,
      errors: rows.filter((r) => r.state === "error").length,
      projectSkipped: rows.some((r) => r.isProjectRow),
      predWarnings: rows.reduce((a, r) => a + r.warnings.filter((w) => w.startsWith("Predecessor")).length, 0),
      unticked: rows.filter((r) => r.state !== "error" && !r.isProjectRow && isExcluded(r)).length,
    };
  }, [rows, isExcluded]);

  const parseFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setFileName(file.name);
      try {
        const { sheetName, raw } = readMasterWbsWorkbook(await file.arrayBuffer());
        setSheetUsed(sheetName);
        if (raw.length === 0) {
          toast.error(`Sheet "${sheetName}" is empty`);
          return;
        }

        // Pass 1 + 2 (cells, Project row, hierarchy) are shared with WBS template import.
        const parsed = parseMasterWbsRows(raw);
        const sheetKeys = new Set(parsed.filter((r) => r.key && !r.isProjectRow).map((r) => r.key));

        const [nodesRes, tasksRes] = await Promise.all([
          listWbsNodesByProjectIdOfIdAndWbsCode(projectId, "wbs_code, wbs_outline_code, full_path"),
          listWbsTasksByProjectId(projectId, "task_code"),
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
        setExcluded(new Set());
        setStep("preview");
      } catch (e) {
        toast.error("Couldn't read that file: " + (e instanceof Error ? e.message : "unknown error"));
      }
    },
    [projectId],
  );

  async function runImport() {
    const usable = rows.filter((r) => r.state !== "error" && !r.isProjectRow && !isExcluded(r));
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

    const { data, error } = await importMasterWbs({
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
      ["02.01", 2, "02.01 TOWER A", "Building", "Construction", "", 280, "01-Feb-2027", "30-Nov-2027", "", "Site Team", "C-2100", ""],
      ["02.01.01", 3, "02.01.01 GROUND FLOOR", "Level", "Construction", "GF", 90, "01-Feb-2027", "01-May-2027", "01.01.02", "Site Team", "C-2110", ""],
      ["02.01.01.01", 4, "02.01.01.01 STRUCTURAL WORKS", "Work Package", "Structural", "GF", 30, "01-Feb-2027", "02-Mar-2027", "", "Site Team", "C-2111", ""],
      ["02.01.01.01.01", 5, "Setting Out", "Activity", "Structural", "GF", 2, "01-Feb-2027", "02-Feb-2027", "", "Surveyor", "C-2111", ""],
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
            <FileSpreadsheet className="h-4 w-4" /> Import WBS from Excel / CSV
          </DialogTitle>
          <DialogDescription>Phases, buildings, levels and packages become WBS nodes; activities keep their dates and links.</DialogDescription>
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
            <details className="rounded-lg border border-border bg-muted/40 p-3">
              <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground">
                Columns: WBS Code*, Name*, Type*, then optional Discipline, Floor / Area, Duration, dates, Predecessors…
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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
            </details>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              Sample file:
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadTemplate("xlsx")}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> Excel
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadTemplate("csv")}>
                <Download className="mr-1.5 h-3.5 w-3.5" /> CSV
              </Button>
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
                {stats.unticked > 0 && <> {" · "}<span className="text-slate-500">{stats.unticked} unticked</span></>}
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
                <span>The sheet&apos;s Project row is skipped; its phases go under this project.</span>
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
                  <col className="w-8" />
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
                    <th className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        aria-label="Select all rows"
                        checked={excluded.size === 0}
                        ref={(el) => { if (el) el.indeterminate = excluded.size > 0 && stats.nodes + stats.tasks > 0; }}
                        onChange={(e) => setExcluded(e.target.checked ? new Set() : new Set(rows.filter((r) => !r.isProjectRow && r.parentKey === "").map((r) => r.key)))}
                        className="h-3.5 w-3.5 accent-primary"
                      />
                    </th>
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
                        isExcluded(r) && "opacity-40",
                      )}
                    >
                      <td className="px-2 py-1">
                        {!r.isProjectRow && r.state !== "error" && (
                          <input
                            type="checkbox"
                            aria-label={`Import ${r.name}`}
                            checked={!isExcluded(r)}
                            onChange={() => toggleRow(r)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                        )}
                      </td>
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
                          {r.isProjectRow ? "Project · skip" : r.kind === "node" ? (NODE_KIND_LABEL[r.nodeType] ?? "Node") : "Activity"}
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
