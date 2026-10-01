"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { insertWbsNodes, listWbsNodesByProjectIdOfIdAndWbsCode } from "@/lib/wbs/wbs-queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { nextWbsCode, resolveCodeCollision } from "@/lib/wbs-code";
import {
  NODE_TYPE_OPTIONS,
  STATUS_OPTIONS,
  nodeTypeLabel,
  statusLabel,
} from "@/components/wbs/builder/wbs-builder-types";

// ---------------------------------------------------------------------------
// Column model — matches the WBS Builder grid. Only Node Type + Name are
// required; WBS Code auto-generates and hierarchy comes from Parent Code or the
// Indent (outline level) column.
// ---------------------------------------------------------------------------
type ColKey = "node_type" | "wbs_name" | "wbs_code" | "parent_code" | "indent" | "status";

const TEMPLATE_COLUMNS: { key: ColKey; label: string; hint: string; required?: boolean }[] = [
  { key: "node_type", label: "Node Type", hint: "phase · building · level · zone · room · element · discipline · task_group", required: true },
  { key: "wbs_name", label: "Name", hint: "Display name of the node", required: true },
  { key: "wbs_code", label: "WBS Code", hint: "Leave blank to auto-generate (B01, L02…)" },
  { key: "parent_code", label: "Parent Code", hint: "WBS Code of the parent — blank for top level" },
  { key: "indent", label: "Indent", hint: "Outline level 0,1,2… — used when Parent Code is blank" },
  { key: "status", label: "Status", hint: "active · on_hold · closed (default active)" },
];

const HEADER_ALIASES: Record<ColKey, string[]> = {
  node_type: ["nodetype", "type"],
  wbs_name: ["name", "wbsname", "title", "activity", "activityname"],
  wbs_code: ["wbscode", "code", "id"],
  parent_code: ["parentcode", "parent", "parentid", "parentwbs"],
  indent: ["indent", "level", "outlinelevel", "depth", "tier"],
  status: ["status", "state"],
};

const normHeader = (h: string) => h.toLowerCase().replace(/[\s_\-/.]/g, "");

const NODE_TYPE_LOOKUP = (() => {
  const m = new Map<string, string>();
  for (const o of NODE_TYPE_OPTIONS) {
    m.set(o.value, o.value);
    m.set(o.label.toLowerCase().replace(/[^a-z]/g, ""), o.value);
  }
  m.set("area", "building");
  m.set("space", "room");
  m.set("group", "task_group");
  return m;
})();

function normalizeNodeType(raw: string): string | null {
  const s = raw.toLowerCase().trim();
  if (!s) return null;
  const slug = s.replace(/[\s/-]+/g, "_");
  if (NODE_TYPE_OPTIONS.some((o) => o.value === slug)) return slug;
  return NODE_TYPE_LOOKUP.get(s.replace(/[^a-z]/g, "")) ?? null;
}

function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().trim().replace(/[\s-]+/g, "_");
  return STATUS_OPTIONS.includes(s) ? s : "active";
}

// ---------------------------------------------------------------------------

interface ImportRow {
  _row: number; // spreadsheet row number (for messages)
  _uid: string; // pre-assigned id
  node_type: string;
  wbs_name: string;
  wbs_code: string; // resolved (auto-filled if blank)
  rawCode: string; // as typed
  parent_code: string;
  indent: number;
  status: string;
  autoCode: boolean;
  parentUid: string | null;
  existingParentId: string | null;
  sortOrder: number;
  errors: string[];
}

interface ExistingNode {
  id: string;
  wbs_code: string;
  parent_id: string | null;
  sort_order: number;
}

interface WbsImportDialogProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

type Step = "upload" | "preview" | "importing" | "done";

const ROOT_KEY = "__root__";

export function WbsImportDialog({ projectId, onClose, onImported }: WbsImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [dragging, setDragging] = useState(false);
  const [importedCount, setImportedCount] = useState(0);

  const validRows = useMemo(() => rows.filter((r) => r.errors.length === 0), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.errors.length > 0), [rows]);

  const parseFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setFileName(file.name);

      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
        if (raw.length === 0) {
          toast.error("That sheet is empty");
          return;
        }

        const headers = Object.keys(raw[0]);
        const col: Partial<Record<ColKey, string>> = {};
        for (const key of Object.keys(HEADER_ALIASES) as ColKey[]) {
          col[key] = headers.find(
            (h) => normHeader(h) === normHeader(key) || HEADER_ALIASES[key].includes(normHeader(h)),
          );
        }
        if (!col.node_type || !col.wbs_name) {
          toast.error('Missing required columns — need at least "Node Type" and "Name"');
          return;
        }

        const { data } = await listWbsNodesByProjectIdOfIdAndWbsCode(projectId, "id, wbs_code, parent_id, sort_order");
        const existing = (data ?? []) as ExistingNode[];
        const existingByCode = new Map(existing.map((n) => [n.wbs_code.toUpperCase(), n]));

        const cell = (r: Record<string, unknown>, key: ColKey) =>
          col[key] ? String(r[col[key]!] ?? "").trim() : "";

        // -- Pass 1: raw parse --------------------------------------------------
        const parsed: ImportRow[] = raw.map((r, i) => {
          const errors: string[] = [];
          const nodeTypeRaw = cell(r, "node_type");
          const node_type = normalizeNodeType(nodeTypeRaw) ?? "";
          const wbs_name = cell(r, "wbs_name");
          const rawCode = cell(r, "wbs_code").toUpperCase();
          const parent_code = cell(r, "parent_code").toUpperCase();
          const indentRaw = cell(r, "indent");
          const indent = indentRaw ? Math.max(0, Math.floor(Number(indentRaw))) : 0;

          if (!wbs_name) errors.push("Name is required");
          if (!nodeTypeRaw) errors.push("Node Type is required");
          else if (!node_type) errors.push(`Unknown Node Type "${nodeTypeRaw}"`);
          if (indentRaw && !Number.isFinite(Number(indentRaw)))
            errors.push(`Indent "${indentRaw}" is not a number`);

          return {
            _row: i + 2,
            _uid: crypto.randomUUID(),
            node_type,
            wbs_name,
            wbs_code: rawCode,
            rawCode,
            parent_code,
            indent,
            status: normalizeStatus(cell(r, "status")),
            autoCode: !rawCode,
            parentUid: null,
            existingParentId: null,
            sortOrder: 0,
            errors,
          };
        });

        // -- Pass 2: resolve parents (Parent Code, else Indent) ---------------
        const fileByCode = new Map<string, ImportRow>();
        for (const row of parsed) if (row.rawCode) fileByCode.set(row.rawCode, row);

        parsed.forEach((row, idx) => {
          if (row.parent_code) {
            const inFile = fileByCode.get(row.parent_code);
            const inProject = existingByCode.get(row.parent_code);
            if (inFile && inFile !== row) row.parentUid = inFile._uid;
            else if (inProject) row.existingParentId = inProject.id;
            else row.errors.push(`Parent "${row.parent_code}" not found in the file or project`);
          } else if (row.indent > 0) {
            let p: ImportRow | null = null;
            for (let j = idx - 1; j >= 0; j--) {
              if (parsed[j].indent === row.indent - 1) {
                p = parsed[j];
                break;
              }
              if (parsed[j].indent < row.indent - 1) break;
            }
            if (p) row.parentUid = p._uid;
            else row.errors.push(`Indent ${row.indent} has no parent row above it`);
          }
        });

        // A child of a broken row can't be created either.
        const uidToRow = new Map(parsed.map((r) => [r._uid, r]));
        let changed = true;
        while (changed) {
          changed = false;
          for (const row of parsed) {
            if (row.errors.length) continue;
            const p = row.parentUid ? uidToRow.get(row.parentUid) : null;
            if (p && p.errors.length) {
              row.errors.push(`Parent row ${p._row} has errors`);
              changed = true;
            }
          }
        }

        // -- Pass 3: sort_order + auto WBS codes, grouped by parent -----------
        const groupKey = (r: ImportRow) => r.parentUid ?? r.existingParentId ?? ROOT_KEY;
        const existingSiblingCodes = new Map<string, Set<string>>();
        const existingSiblingMaxSort = new Map<string, number>();
        for (const n of existing) {
          const k = n.parent_id ?? ROOT_KEY;
          (existingSiblingCodes.get(k) ?? existingSiblingCodes.set(k, new Set()).get(k)!).add(
            n.wbs_code.toUpperCase(),
          );
          existingSiblingMaxSort.set(k, Math.max(existingSiblingMaxSort.get(k) ?? -10, n.sort_order));
        }

        const groupTaken = new Map<string, Set<string>>();
        const groupCount = new Map<string, number>();
        for (const row of parsed) {
          const k = groupKey(row);
          const taken =
            groupTaken.get(k) ??
            groupTaken.set(k, new Set(existingSiblingCodes.get(k) ?? [])).get(k)!;

          if (!row.wbs_code && row.node_type) {
            const base = nextWbsCode(
              row.node_type,
              [...taken].map((c) => ({ wbs_code: c })),
            );
            row.wbs_code = resolveCodeCollision(base, taken);
          }
          if (row.wbs_code) {
            if (taken.has(row.wbs_code)) {
              row.errors.push(`Code "${row.wbs_code}" is used twice under the same parent`);
            }
            taken.add(row.wbs_code);
          }

          const n = (groupCount.get(k) ?? 0) + 1;
          groupCount.set(k, n);
          row.sortOrder = (existingSiblingMaxSort.get(k) ?? -10) + 10 * n;
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
    if (validRows.length === 0) return;
    setStep("importing");

    // Order parents before children so the self-referencing FK is satisfied in
    // one bulk insert.
    const byUid = new Map(validRows.map((r) => [r._uid, r]));
    const seen = new Set<string>();
    const ordered: ImportRow[] = [];
    const visit = (r: ImportRow) => {
      if (seen.has(r._uid)) return;
      seen.add(r._uid);
      const p = r.parentUid ? byUid.get(r.parentUid) : null;
      if (p) visit(p);
      ordered.push(r);
    };
    for (const r of validRows) visit(r);

    const { error } = await insertWbsNodes(ordered.map((r) => ({
        id: r._uid,
        project_id: projectId,
        parent_id: r.parentUid ?? r.existingParentId ?? null,
        node_type: r.node_type,
        wbs_code: r.wbs_code,
        wbs_name: r.wbs_name,
        status: r.status,
        sort_order: r.sortOrder,
      })));

    if (error) {
      toast.error("Import failed: " + error.message);
      setStep("preview");
      return;
    }

    setImportedCount(ordered.length);
    toast.success(`Imported ${ordered.length} WBS node${ordered.length === 1 ? "" : "s"}`);
    setStep("done");
  }

  function buildTemplateSheet() {
    const rowsAoa = [
      ["Node Type", "Name", "WBS Code", "Parent Code", "Indent", "Status"],
      ["building", "Bank Tower", "", "", 0, "active"],
      ["level", "Ground Floor", "", "", 1, "active"],
      ["zone", "Lobby", "", "", 2, "active"],
      ["element", "Reception Desk", "", "", 3, "active"],
      ["level", "Level 1", "", "", 1, "active"],
      ["building", "Parking Structure", "", "", 0, "active"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rowsAoa);
    ws["!cols"] = [16, 26, 12, 14, 8, 10].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "WBS");
    return wb;
  }

  const downloadTemplate = (ext: "xlsx" | "csv") =>
    XLSX.writeFile(buildTemplateSheet(), `wbs-import-template.${ext}`, { bookType: ext });

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files[0]) parseFile(e.dataTransfer.files[0]);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" /> Import WBS
          </DialogTitle>
          <DialogDescription>
            Bulk-create nodes from an Excel or CSV file. Only <strong>Node Type</strong> and{" "}
            <strong>Name</strong> are required — codes auto-generate and hierarchy comes from{" "}
            <strong>Parent Code</strong> or the <strong>Indent</strong> column.
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
                  (step === s || (s === "importing" && step === "done")) &&
                    "font-semibold text-foreground",
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
              <p className="mb-2 text-[11px] font-semibold text-muted-foreground">Columns</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {TEMPLATE_COLUMNS.map((c) => (
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
                <strong className="text-foreground">{rows.length}</strong> row{rows.length === 1 ? "" : "s"} in{" "}
                <strong className="text-foreground">{fileName}</strong>
                {" · "}
                <span className="text-emerald-600">{validRows.length} ready</span>
                {invalidRows.length > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-600">{invalidRows.length} with errors</span>
                  </>
                )}
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

            <div className="max-h-72 overflow-auto rounded-lg border border-border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">WBS Code</th>
                    <th className="px-2 py-1.5">Node Type</th>
                    <th className="px-2 py-1.5">Name</th>
                    <th className="px-2 py-1.5">Status</th>
                    <th className="px-2 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 300).map((r) => (
                    <tr
                      key={r._row}
                      className={cn(
                        "border-t border-border/60",
                        r.errors.length > 0 && "bg-amber-50/60",
                      )}
                    >
                      <td className="px-2 py-1 text-muted-foreground tabular-nums">{r._row}</td>
                      <td className="px-2 py-1 font-mono">
                        {r.wbs_code || "—"}
                        {r.autoCode && r.wbs_code && (
                          <span className="ml-1 text-[9px] uppercase text-muted-foreground">auto</span>
                        )}
                      </td>
                      <td className="px-2 py-1">{r.node_type ? nodeTypeLabel(r.node_type) : "—"}</td>
                      <td className="px-2 py-1" style={{ paddingLeft: 8 + r.indent * 14 }}>
                        {r.wbs_name || "—"}
                      </td>
                      <td className="px-2 py-1">{statusLabel(r.status)}</td>
                      <td className="px-2 py-1">
                        {r.errors.length > 0 ? (
                          <span
                            className="inline-flex items-center gap-0.5 text-amber-600"
                            title={r.errors.join("; ")}
                          >
                            <AlertTriangle className="h-3 w-3" />
                            {r.errors.length}
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
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                <p className="mb-1 text-[11px] font-semibold text-amber-800">Rows that will be skipped</p>
                <ul className="list-inside list-disc space-y-0.5 text-[11px] text-amber-700">
                  {invalidRows.slice(0, 8).map((r) => (
                    <li key={r._row}>
                      Row {r._row} ({r.wbs_code || r.wbs_name || "?"}): {r.errors.join("; ")}
                    </li>
                  ))}
                  {invalidRows.length > 8 && (
                    <li className="text-amber-500">…and {invalidRows.length - 8} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={validRows.length === 0} onClick={runImport}>
                Import {validRows.length} row{validRows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Creating {validRows.length} nodes…</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <CheckCircle2 className="h-9 w-9 text-emerald-500" />
            <p className="text-sm font-semibold">Import complete</p>
            <p className="text-xs text-muted-foreground">
              {importedCount} WBS node{importedCount === 1 ? "" : "s"} created
            </p>
            <Button
              size="sm"
              className="mt-2"
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
