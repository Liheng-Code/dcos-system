"use client";

import { useState, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";

const ALLOWED_NODE_TYPES = new Set([
  "phase", "building", "level", "zone", "room", "element", "discipline", "task_group",
]);

const ALLOWED_STATUSES = new Set(["active", "on_hold"]);

const EXPECTED_COLUMNS = ["wbs_code", "wbs_name", "node_type", "parent_code", "sort_order", "status"];

interface Row {
  _row: number;
  wbs_code: string;
  wbs_name: string;
  node_type: string;
  parent_code: string;
  sort_order: number;
  status: string;
  errors: string[];
}

interface WbsImportDialogProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "importing" | "done";

export function WbsImportDialog({ projectId, onClose, onImported }: WbsImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleFile = useCallback(async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (raw.length === 0) {
        toast.error("Spreadsheet is empty");
        return;
      }

      const headers = Object.keys(raw[0]);
      const colMap = new Map<string, string>();
      for (const h of EXPECTED_COLUMNS) {
        const found = headers.find((k) => k.toLowerCase().replace(/[\s_-]/g, "") === h.toLowerCase());
        if (found) colMap.set(h, found);
      }

      const supabase = createClient();
      const { data: existingNodes } = await supabase
        .from("wbs_nodes")
        .select("wbs_code")
        .eq("project_id", projectId);
      const existingCodes = new Set((existingNodes ?? []).map((n: { wbs_code: string }) => n.wbs_code));

      const parsed: Row[] = [];
      for (let i = 0; i < raw.length; i++) {
        const r = raw[i];
        const errs: string[] = [];

        const getCol = (key: string): string => {
          const mapped = colMap.get(key);
          return mapped ? String(r[mapped] ?? "").trim() : "";
        };

        const wbs_code = getCol("wbs_code").toUpperCase();
        const wbs_name = getCol("wbs_name");
        const node_type = getCol("node_type").toLowerCase();
        const parent_code = getCol("parent_code").toUpperCase();
        const rawOrder = getCol("sort_order");
        const rawStatus = getCol("status").toLowerCase();

        if (!wbs_code) errs.push("wbs_code is required");
        if (!wbs_name) errs.push("wbs_name is required");
        if (!node_type) errs.push("node_type is required");
        else if (!ALLOWED_NODE_TYPES.has(node_type)) errs.push(`Invalid node_type "${node_type}"`);

        if (existingCodes.has(wbs_code)) errs.push(`wbs_code "${wbs_code}" already exists in project`);

        const sort_order = rawOrder ? parseInt(rawOrder, 10) : 0;
        if (rawOrder && isNaN(sort_order)) errs.push(`sort_order "${rawOrder}" is not a number`);

        const status = ALLOWED_STATUSES.has(rawStatus) ? rawStatus : "active";

        parsed.push({ _row: i + 2, wbs_code, wbs_name, node_type, parent_code, sort_order, status, errors: errs });
      }

      const seen = new Set<string>();
      for (const row of parsed) {
        if (row.wbs_code && seen.has(row.wbs_code)) row.errors.push(`Duplicate wbs_code "${row.wbs_code}" within file`);
        seen.add(row.wbs_code);
      }

      const allCodes = new Set(parsed.map((r) => r.wbs_code).filter(Boolean));
      for (const row of parsed) {
        if (row.parent_code && !allCodes.has(row.parent_code) && !existingCodes.has(row.parent_code)) {
          row.errors.push(`Parent "${row.parent_code}" not found in file or project`);
        }
      }

      setRows(parsed);
      setExisting(existingCodes);
      setStep("preview");
    } catch (e) {
      toast.error("Failed to parse file: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }, [projectId]);

  const validRows = rows.filter((r) => r.errors.length === 0);
  const invalidRows = rows.filter((r) => r.errors.length > 0);

  async function handleImport() {
    if (validRows.length === 0) return;
    setStep("importing");
    setProgress({ current: 0, total: validRows.length });

    const supabase = createClient();

    const inserted = await supabase
      .from("wbs_nodes")
      .insert(
        validRows.map((r) => ({
          project_id: projectId,
          wbs_code: r.wbs_code,
          wbs_name: r.wbs_name,
          node_type: r.node_type,
          status: r.status,
          sort_order: r.sort_order,
          parent_id: null,
        }))
      )
      .select("id, wbs_code");

    if (inserted.error) {
      toast.error("Import failed: " + inserted.error.message);
      setStep("preview");
      return;
    }

    setProgress({ current: validRows.length, total: validRows.length });

    const codeToId = new Map<string, string>();
    for (const n of inserted.data ?? []) {
      codeToId.set(n.wbs_code, n.id);
    }

    for (const row of validRows) {
      if (row.parent_code) {
        const parentId = codeToId.get(row.parent_code) ?? null;
        if (parentId) {
          await supabase
            .from("wbs_nodes")
            .update({ parent_id: parentId })
            .eq("wbs_code", row.wbs_code)
            .eq("project_id", projectId);
        }
      }
    }

    toast.success(`Imported ${validRows.length} WBS node(s)`);
    setStep("done");
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    const data = [
      ["wbs_code", "wbs_name", "node_type", "parent_code", "sort_order", "status"],
      ["A-01", "Foundation Works", "element", "", "10", "active"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);

    const colWidths = [12, 28, 16, 12, 10, 12];
    ws["!cols"] = colWidths.map((w) => ({ wch: w }));

    XLSX.utils.book_append_sheet(wb, ws, "WBS Nodes");
    XLSX.writeFile(wb, "wbs-import-template.xlsx");
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import WBS</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload a spreadsheet to bulk-create WBS nodes</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-1 mb-5 text-xs text-slate-400">
          <span className={step === "upload" ? "text-slate-900 font-semibold" : ""}>Upload</span>
          <ChevronRight className="h-3 w-3" />
          <span className={step === "preview" ? "text-slate-900 font-semibold" : ""}>Preview</span>
          <ChevronRight className="h-3 w-3" />
          <span className={step === "importing" ? "text-slate-900 font-semibold" : ""}>Import</span>
        </div>

        {step === "upload" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-700 mb-2">Required columns</p>
              <div className="grid grid-cols-6 gap-2 text-xs">
                {[
                  ["wbs_code", "Unique code per node (e.g. A-01)"],
                  ["wbs_name", "Display name"],
                  ["node_type", "Type — see allowed list below"],
                  ["parent_code", "Parent wbs_code (blank if root)"],
                  ["sort_order", "Sort order number"],
                  ["status", "active / closed / on_hold"],
                ].map(([col, hint]) => (
                  <div key={col} className="rounded-lg bg-white border border-slate-100 px-2.5 py-1.5">
                    <code className="font-semibold text-slate-800">{col}</code>
                    <p className="text-slate-400 mt-0.5 leading-tight">{hint}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-400">
                <span><span className="font-medium text-slate-500">node_type</span>: building, level, zone, room, element, discipline, task_group, section, segment, structure, component, area, system, subsystem, equipment</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs mt-3"
                onClick={downloadTemplate}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download Template
              </Button>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-slate-300 bg-white p-8 cursor-pointer hover:border-slate-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileSpreadsheet className="h-8 w-8 text-slate-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">Drop your completed spreadsheet here</p>
                <p className="text-xs text-slate-500 mt-1">or click to browse — .xlsx, .xls, .csv</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <Button variant="outline" size="sm" className="rounded-xl text-xs">
                <Upload className="mr-1.5 h-3.5 w-3.5" /> Select File
              </Button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{rows.length}</span> row(s) found in <span className="font-semibold text-slate-700">{fileName}</span>
              </p>
              <div className="flex items-center gap-2">
                {invalidRows.length > 0 && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> {invalidRows.length} with errors
                  </span>
                )}
                <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => fileInputRef.current?.click()}>
                  Change File
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Parent</th>
                    <th className="px-3 py-2 font-medium">Order</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._row} className={cn("border-t border-slate-100", r.errors.length > 0 ? "bg-amber-50/50" : "")}>
                      <td className="px-3 py-1.5 text-slate-400">{r._row}</td>
                      <td className="px-3 py-1.5 font-mono font-medium">{r.wbs_code || "—"}</td>
                      <td className="px-3 py-1.5">{r.wbs_name || "—"}</td>
                      <td className="px-3 py-1.5">{r.node_type || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-400">{r.parent_code || "—"}</td>
                      <td className="px-3 py-1.5 text-slate-400">{r.sort_order || "—"}</td>
                      <td className="px-3 py-1.5">{r.status}</td>
                      <td className="px-3 py-1.5">
                        {r.errors.length > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-amber-600" title={r.errors.join("; ")}>
                            <AlertCircle className="h-3 w-3 shrink-0" />
                            <span>{r.errors.length}</span>
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

            {invalidRows.length > 0 && (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs font-semibold text-amber-800 mb-1">Validation errors</p>
                <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                  {invalidRows.slice(0, 10).map((r) => (
                    <li key={r._row}>Row {r._row} ({r.wbs_code || "?"}): {r.errors.join("; ")}</li>
                  ))}
                  {invalidRows.length > 10 && <li className="text-amber-500">...and {invalidRows.length - 10} more</li>}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={onClose}>Cancel</Button>
              <Button
                size="sm"
                className="rounded-xl text-xs"
                disabled={validRows.length === 0}
                onClick={handleImport}
              >
                Import {validRows.length} row(s)
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <p className="text-sm text-slate-600">Importing WBS nodes...</p>
            <div className="w-48 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-slate-900 transition-all"
                style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">{progress.current} / {progress.total}</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">Import complete</p>
            <p className="text-xs text-slate-500">{validRows.length} WBS node(s) created successfully</p>
            <Button size="sm" className="rounded-xl mt-2" onClick={() => { onImported(); onClose(); }}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function cn(...inputs: (string | boolean | undefined | null)[]): string {
  return inputs.filter(Boolean).join(" ");
}
