"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Package, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv-export";
import {
  parseSimpleLaborRateSheet, type SimpleLaborRateRow, type ImportIssue,
} from "@/components/qs/dwl-import-lib";
import { insertDwlLaborRateAttribute, insertDwlResourcePrice, insertDwlResourceReturning, listDwlResourcesWithCategoryLabor } from "@/lib/qs/qs-queries";

const TEMPLATE_COLUMNS = [
  "Code", "Skill Level", "Trade Description", "Rate Basis", "Basic Rate", "Overtime Rate",
  "Currency", "Standard Productivity", "Active",
];

// A full worked example — every column filled in.
const EXAMPLE_ROW: Omit<SimpleLaborRateRow, "_row"> = {
  code: "L-MAS-002",
  skill_level: "Skilled",
  description: "Masonry Worker — AAC blockwork and brickwork",
  unit: "day",
  daily_basic_rate: 18,
  overtime_rate_per_hr: 3.5,
  currency: "USD",
  standard_productivity_note: "14 - 18 m2/day (AAC blockwork with helper)",
  is_active: true,
};

function rowsToAoa(rows: Omit<SimpleLaborRateRow, "_row">[]): (string | number)[][] {
  return [
    TEMPLATE_COLUMNS,
    ...rows.map((r) => [
      r.code, r.skill_level, r.description, r.unit, r.daily_basic_rate, r.overtime_rate_per_hr,
      r.currency, r.standard_productivity_note ?? "", r.is_active ? "Yes" : "No",
    ]),
  ];
}

function downloadXlsx(filename: string, aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Labor Rates");
  XLSX.writeFile(wb, filename);
}

interface ImportResult { inserted: number; skippedExisting: number; failed: number; errors: string[]; }

async function importLaborRates(
  supabase: ReturnType<typeof createClient>,
  rows: SimpleLaborRateRow[],
  tenantId: string,
  userId: string | null
): Promise<ImportResult> {
  const { data: exRes } = await listDwlResourcesWithCategoryLabor();
  const existingCodes = new Set(((exRes ?? []) as { id: string; code: string }[]).map((r) => r.code.toUpperCase()));

  const result: ImportResult = { inserted: 0, skippedExisting: 0, failed: 0, errors: [] };

  for (const row of rows) {
    if (existingCodes.has(row.code)) { result.skippedExisting++; continue; }

    const { data: resourceRow, error: resErr } = await insertDwlResourceReturning({
        tenant_id: tenantId,
        category: "labor",
        code: row.code,
        description: row.description,
        unit: row.unit,
        is_active: row.is_active,
        created_by: userId,
      });
    if (resErr || !resourceRow) {
      result.failed++;
      result.errors.push(`${row.code}: ${resErr?.message ?? "resource insert failed"}`);
      continue;
    }
    const resourceId = resourceRow.id as string;
    existingCodes.add(row.code);

    const { error: attrErr } = await insertDwlLaborRateAttribute({
      resource_id: resourceId,
      tenant_id: tenantId,
      skill_level: row.skill_level,
      standard_productivity_note: row.standard_productivity_note,
      created_by: userId,
    });
    if (attrErr) result.errors.push(`${row.code}: attributes — ${attrErr.message}`);

    const { error: priceErr } = await insertDwlResourcePrice({
      tenant_id: tenantId,
      resource_id: resourceId,
      unit_price: row.daily_basic_rate,
      overtime_rate_per_hr: row.overtime_rate_per_hr,
      currency: row.currency,
      valid_from: new Date().toISOString().slice(0, 10),
      source_type: "estimate",
      price_status: "approved",
      created_by: userId,
    });
    if (priceErr) result.errors.push(`${row.code}: price — ${priceErr.message}`);

    result.inserted++;
  }

  return result;
}

interface DwlLaborRateImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onImported: () => void;
}

export function DwlLaborRateImportDialog({ open, onOpenChange, tenantId, userId, onImported }: DwlLaborRateImportDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SimpleLaborRateRow[]>([]);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const errorCount = issues.filter((i) => i.level === "error").length;
  const warnCount = issues.filter((i) => i.level === "warn").length;

  function reset() {
    setFileName(""); setRows([]); setIssues([]); setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File) {
    reset();
    setFileName(file.name);
    setParsing(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });
      const { rows: parsedRows, issues: parsedIssues } = parseSimpleLaborRateSheet(wb);
      setRows(parsedRows);
      setIssues(parsedIssues);
      if (parsedRows.length === 0 && parsedIssues.length === 0) {
        setIssues([{ sheet: wb.SheetNames[0] ?? "(none)", row: null, level: "error", message: "No recognisable rows found." }]);
      }
    } catch (e) {
      setIssues([{ sheet: fileName, row: null, level: "error", message: e instanceof Error ? e.message : "Failed to read the file." }]);
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport() {
    if (!tenantId) { toast.error("No tenant assigned to your profile — cannot import."); return; }
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const res = await importLaborRates(supabase, rows, tenantId, userId);
      setResult(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} row failure(s). See the report.`);
      else toast.success(`Import complete — ${res.inserted} new labor rate(s) registered.`);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const canConfirm = rows.length > 0 && errorCount === 0 && !importing && !parsing;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Labor Rates Import (Excel / CSV)
          </DialogTitle>
          <DialogDescription>
            Upload → Validate → Preview → Confirm. Invalid rows are listed and nothing is written until you confirm.
            A Code that already exists in the library is skipped, never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Download Standardized Template</p>
            <p className="text-xs text-muted-foreground">
              One row per trade. Code, Skill Level, Trade Description, Basic Rate and Overtime Rate are required.
              Code must match L-GRP-NNN, e.g. L-MAS-001. Rate Basis defaults to Day if left blank.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("labor-rates-template.csv", rowsToAoa([EXAMPLE_ROW]).map((r) => r.map(String)))}
              >
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("labor-rates-template.xlsx", rowsToAoa([EXAMPLE_ROW]))}>
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download .XLSX
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
            <Package className="mx-auto h-6 w-6 text-muted-foreground/60" />
            <p className="mt-1.5 text-sm font-medium">Select an Excel (.xlsx, .xls) or CSV (.csv) file</p>
            <p className="text-xs text-muted-foreground">Fill in the downloaded template, then upload it here</p>
            <div className="mt-2.5 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => fileInput.current?.click()} disabled={parsing}>
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                Choose File
              </Button>
              <span className="text-xs text-muted-foreground">{fileName || "No file chosen"}</span>
            </div>
          </div>

          {issues.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={errorCount > 0 ? "destructive" : "outline"}>{errorCount} error{errorCount === 1 ? "" : "s"}</Badge>
                <Badge variant="secondary">{warnCount} warning{warnCount === 1 ? "" : "s"}</Badge>
              </div>
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
                {issues.slice(0, 100).map((i, idx) => (
                  <div key={idx} className={cn("flex items-start gap-2 border-b border-border px-2.5 py-1.5 text-xs last:border-b-0", i.level === "error" ? "text-destructive" : "text-muted-foreground")}>
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>{i.row ? `Row ${i.row}: ` : ""}{i.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Import report
              </p>
              <p className="mt-1 text-muted-foreground">
                {result.inserted} new labor rate{result.inserted === 1 ? "" : "s"} registered,{" "}
                {result.skippedExisting} already present (skipped), {result.failed} failed.
              </p>
              {result.errors.length > 0 && (
                <div className="mt-1.5 space-y-0.5 text-xs text-destructive">
                  {result.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
                  {result.errors.length > 5 && <div>+{result.errors.length - 5} more…</div>}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700" disabled={!canConfirm} onClick={() => void confirmImport()}>
            {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Confirm Import ({rows.length} Record{rows.length === 1 ? "" : "s"})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
