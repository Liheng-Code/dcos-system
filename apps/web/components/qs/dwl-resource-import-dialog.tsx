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
  parseSimpleResourceSheet, type SimpleResourceRow, type ImportIssue,
} from "@/components/qs/dwl-import-lib";

const TEMPLATE_COLUMNS = [
  "Category", "Code", "Description", "Unit", "Spec Reference", "Active",
  "Unit Price", "Currency", "Source Type", "Supplier", "Valid From", "Quote Valid Until", "Notes",
];

// A full worked example — every column filled in — so the template is
// self-documenting: the price columns are optional (leave Unit Price blank
// to register the resource with no starting price, same as clicking "Add
// Resource" alone without also clicking "$ Price").
const EXAMPLE_ROW: Omit<SimpleResourceRow, "_row"> = {
  category: "material",
  code: "M-CON-004",
  description: "Ready Mix Concrete C25/30, 20mm aggregate, slump 100±25mm",
  unit: "m3",
  spec_reference: "EN 206 / BS 8500",
  is_active: true,
  unit_price: 68.5,
  currency: "USD",
  source_type: "quotation",
  supplier_text: "Siam City Concrete & Cement Co.",
  valid_from: new Date().toISOString().slice(0, 10),
  quote_valid_until: null,
  notes: "Basis: quotation QT-2026-0112",
};

function rowsToAoa(rows: Omit<SimpleResourceRow, "_row">[]): (string | number)[][] {
  return [
    TEMPLATE_COLUMNS,
    ...rows.map((r) => [
      r.category, r.code, r.description, r.unit, r.spec_reference ?? "", r.is_active ? "Yes" : "No",
      r.unit_price ?? "", r.currency, r.source_type, r.supplier_text ?? "", r.valid_from ?? "", r.quote_valid_until ?? "", r.notes ?? "",
    ]),
  ];
}

function downloadXlsx(filename: string, aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Price History");
  XLSX.writeFile(wb, filename);
}

interface ImportResult { inserted: number; skippedExisting: number; pricesInserted: number; failed: number; errors: string[]; }

async function importResources(
  supabase: ReturnType<typeof createClient>,
  rows: SimpleResourceRow[],
  tenantId: string,
  userId: string | null
): Promise<ImportResult> {
  const [exRes, exSup] = await Promise.all([
    supabase.from("dwl_resources").select("id, code"),
    supabase.from("dwl_suppliers").select("id, name"),
  ]);
  const existingCodes = new Set(((exRes.data ?? []) as { id: string; code: string }[]).map((r) => r.code.toUpperCase()));
  const supplierByName = new Map<string, string>();
  for (const s of (exSup.data ?? []) as { id: string; name: string }[]) supplierByName.set(s.name.toLowerCase(), s.id);

  const result: ImportResult = { inserted: 0, skippedExisting: 0, pricesInserted: 0, failed: 0, errors: [] };

  for (const row of rows) {
    if (existingCodes.has(row.code)) { result.skippedExisting++; continue; }

    const { data: resourceRow, error: resErr } = await supabase
      .from("dwl_resources")
      .insert({
        tenant_id: tenantId,
        code: row.code,
        category: row.category,
        description: row.description,
        unit: row.unit,
        spec_reference: row.spec_reference,
        is_active: row.is_active,
        created_by: userId,
      })
      .select("id")
      .single();
    if (resErr || !resourceRow) {
      result.failed++;
      result.errors.push(`${row.code}: ${resErr?.message ?? "resource insert failed"}`);
      continue;
    }
    const resourceId = resourceRow.id as string;
    existingCodes.add(row.code);
    result.inserted++;

    if (row.unit_price != null && row.unit_price >= 0) {
      let supplierId: string | null = null;
      if (row.supplier_text) {
        supplierId = supplierByName.get(row.supplier_text.toLowerCase()) ?? null;
        if (!supplierId) result.errors.push(`${row.code}: supplier "${row.supplier_text}" not found — price recorded without a supplier link.`);
      }
      const { error: priceErr } = await supabase.from("dwl_resource_prices").insert({
        tenant_id: tenantId,
        resource_id: resourceId,
        supplier_id: supplierId,
        unit_price: row.unit_price,
        currency: row.currency,
        valid_from: row.valid_from,
        quote_valid_until: row.quote_valid_until,
        source_type: row.source_type,
        notes: row.notes,
        created_by: userId,
      });
      if (priceErr) result.errors.push(`${row.code}: price — ${priceErr.message}`);
      else result.pricesInserted++;
    }
  }

  return result;
}

interface DwlResourceImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onImported: () => void;
}

export function DwlResourceImportDialog({ open, onOpenChange, tenantId, userId, onImported }: DwlResourceImportDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SimpleResourceRow[]>([]);
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
      const { rows: parsedRows, issues: parsedIssues } = parseSimpleResourceSheet(wb);
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
      const res = await importResources(supabase, rows, tenantId, userId);
      setResult(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} row failure(s). See the report.`);
      else toast.success(`Import complete — ${res.inserted} new resource(s) registered, ${res.pricesInserted} price(s) recorded.`);
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
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Price History Import (Excel / CSV)
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
              One row per resource (material, labor, equipment or subcontract). Category, Code, Description and Unit
              are required — the price columns are optional; leave Unit Price blank to register the resource with no
              starting price. Code must match &lt;M/L/E/S&gt;-GRP-NNN for its category, e.g. M-CON-001.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("price-history-template.csv", rowsToAoa([EXAMPLE_ROW]).map((r) => r.map(String)))}
              >
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("price-history-template.xlsx", rowsToAoa([EXAMPLE_ROW]))}>
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
                {result.inserted} new resource{result.inserted === 1 ? "" : "s"} registered, {result.pricesInserted} price{result.pricesInserted === 1 ? "" : "s"} recorded,{" "}
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
