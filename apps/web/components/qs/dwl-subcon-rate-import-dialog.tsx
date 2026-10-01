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
  parseSimpleSubconRateSheet, type SimpleSubconRateRow, type ImportIssue,
} from "@/components/qs/dwl-import-lib";
import { deleteDwlResourceById, deleteDwlSupplierById, insertDwlResourcePrice, insertDwlResourceReturning, insertDwlSubconAttribute, insertDwlSupplierProfile, insertDwlSupplierReturning, listDwlSubconAttributes, listDwlSupplierProfilesWithVendorKindSubcontractor, listDwlVSubconRates } from "@/lib/qs/qs-queries";

const TEMPLATE_COLUMNS = [
  "Subcontractor", "Subcontractor Code", "Trade", "Scope Description", "Rate Type", "Unit",
  "Commercial Rate", "Currency", "Effective Date", "Scope Notes",
];

const EXAMPLE_ROW: Omit<SimpleSubconRateRow, "_row"> = {
  subcontractor_name: "Apex Waterproofing Specialists Ltd",
  subcontractor_code: "SUB-WTR-001",
  trade: "Waterproofing & Joint Sealing",
  item_description: "2-Coat Liquid Polyurethane waterproofing to wet rooms and balconies with fiberglass mesh reinforcement",
  rate_type: "Unit Rate",
  unit: "m2",
  rate: 7.5,
  currency: "USD",
  effective_date: new Date().toISOString().slice(0, 10),
  scope_notes: "Excludes protective screed",
};

function rowsToAoa(rows: Omit<SimpleSubconRateRow, "_row">[]): (string | number)[][] {
  return [
    TEMPLATE_COLUMNS,
    ...rows.map((r) => [
      r.subcontractor_name, r.subcontractor_code ?? "", r.trade, r.item_description, r.rate_type, r.unit,
      r.rate, r.currency, r.effective_date, r.scope_notes ?? "",
    ]),
  ];
}

function downloadXlsx(filename: string, aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Subcontractor Rates");
  XLSX.writeFile(wb, filename);
}

interface ImportResult {
  inserted: number;
  skippedDuplicate: number;
  failed: number;
  newSubcontractors: number;
  newItems: number;
  errors: string[];
}

async function importSubconRates(
  supabase: ReturnType<typeof createClient>,
  rows: SimpleSubconRateRow[],
  tenantId: string,
  userId: string | null
): Promise<ImportResult> {
  const [subRes, attrRes, ratesRes] = await Promise.all([
    listDwlSupplierProfilesWithVendorKindSubcontractor(),
    listDwlSubconAttributes("resource_id, trade, dwl_resources!inner(id, description)"),
    listDwlVSubconRates(),
  ]);

  const subByName = new Map<string, string>();
  for (const r of (subRes.data ?? []) as unknown as { supplier_id: string; dwl_suppliers: { name: string } }[]) {
    subByName.set(r.dwl_suppliers.name.trim().toLowerCase(), r.supplier_id);
  }

  const itemByKey = new Map<string, string>();
  for (const r of (attrRes.data ?? []) as unknown as { resource_id: string; trade: string | null; dwl_resources: { description: string } }[]) {
    if (!r.trade) continue;
    itemByKey.set(`${r.trade.trim().toLowerCase()}|${r.dwl_resources.description.trim().toLowerCase()}`, r.resource_id);
  }

  const existingRateKeys = new Set<string>();
  for (const r of (ratesRes.data ?? []) as { resource_id: string; subcontractor_id: string | null; effective_date: string }[]) {
    existingRateKeys.add(`${r.resource_id}|${r.subcontractor_id}|${r.effective_date}`);
  }

  const result: ImportResult = { inserted: 0, skippedDuplicate: 0, failed: 0, newSubcontractors: 0, newItems: 0, errors: [] };

  for (const row of rows) {
    let supplierId = subByName.get(row.subcontractor_name.trim().toLowerCase());
    if (!supplierId) {
      const { data: sup, error: supErr } = await insertDwlSupplierReturning({ tenant_id: tenantId, name: row.subcontractor_name.trim(), rating: "B", is_active: true, created_by: userId });
      if (supErr || !sup) {
        result.failed++;
        result.errors.push(`${row.subcontractor_name}: ${supErr?.message ?? "subcontractor insert failed"}`);
        continue;
      }
      supplierId = sup.id as string;
      const { error: profErr } = await insertDwlSupplierProfile({
        supplier_id: supplierId,
        tenant_id: tenantId,
        vendor_kind: "subcontractor",
        supplier_code: row.subcontractor_code,
        created_by: userId,
      });
      if (profErr) {
        await deleteDwlSupplierById(supplierId);
        result.failed++;
        result.errors.push(`${row.subcontractor_name}: ${profErr.message}`);
        continue;
      }
      subByName.set(row.subcontractor_name.trim().toLowerCase(), supplierId);
      result.newSubcontractors++;
    }

    const itemKey = `${row.trade.trim().toLowerCase()}|${row.item_description.trim().toLowerCase()}`;
    let resourceId = itemByKey.get(itemKey);
    if (!resourceId) {
      const codeSuffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
      const tradeGroup = row.trade.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase().padEnd(3, "X") || "GEN";
      const { data: resource, error: resErr } = await insertDwlResourceReturning({
          tenant_id: tenantId,
          code: `S-${tradeGroup}-${codeSuffix}`,
          category: "subcon",
          description: row.item_description.trim(),
          unit: row.unit,
          created_by: userId,
        });
      if (resErr || !resource) {
        result.failed++;
        result.errors.push(`${row.trade} / ${row.item_description}: ${resErr?.message ?? "item insert failed"}`);
        continue;
      }
      resourceId = resource.id as string;
      const { error: attrErr } = await insertDwlSubconAttribute({
        resource_id: resourceId,
        tenant_id: tenantId,
        trade: row.trade.trim(),
        created_by: userId,
      });
      if (attrErr) {
        await deleteDwlResourceById(resourceId);
        result.failed++;
        result.errors.push(`${row.trade}: ${attrErr.message}`);
        continue;
      }
      itemByKey.set(itemKey, resourceId);
      result.newItems++;
    }

    const dupeKey = `${resourceId}|${supplierId}|${row.effective_date}`;
    if (existingRateKeys.has(dupeKey)) { result.skippedDuplicate++; continue; }

    const { error: priceErr } = await insertDwlResourcePrice({
      tenant_id: tenantId,
      resource_id: resourceId,
      supplier_id: supplierId,
      unit_price: row.rate,
      currency: row.currency,
      valid_from: row.effective_date,
      source_type: "quotation",
      rate_type: row.rate_type,
      notes: row.scope_notes,
      created_by: userId,
    });
    if (priceErr) {
      result.failed++;
      result.errors.push(`${row.subcontractor_name} / ${row.trade}: ${priceErr.message}`);
      continue;
    }
    existingRateKeys.add(dupeKey);
    result.inserted++;
  }

  return result;
}

interface DwlSubconRateImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onImported: () => void;
}

export function DwlSubconRateImportDialog({ open, onOpenChange, tenantId, userId, onImported }: DwlSubconRateImportDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SimpleSubconRateRow[]>([]);
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
      const { rows: parsedRows, issues: parsedIssues } = parseSimpleSubconRateSheet(wb);
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
      const res = await importSubconRates(supabase, rows, tenantId, userId);
      setResult(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} row failure(s). See the report.`);
      else toast.success(`Import complete — ${res.inserted} new rate(s) recorded (${res.newSubcontractors} new subcontractor(s), ${res.newItems} new item(s)).`);
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
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Subcontractor Rates Import (Excel / CSV)
          </DialogTitle>
          <DialogDescription>
            Upload → Validate → Preview → Confirm. Invalid rows are listed and nothing is written until you confirm.
            A new Subcontractor or trade item is registered automatically the first time it appears; re-importing
            the same Subcontractor + Trade + Scope + Effective Date is skipped, never duplicated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Download Standardized Template</p>
            <p className="text-xs text-muted-foreground">
              One row per commercial rate. Subcontractor, Trade, Scope Description, Unit and Commercial Rate are
              required — a matching Subcontractor / trade item is reused if it already exists, otherwise it&apos;s
              created for you. Re-adding the same item with a new Effective Date appends a new rate to its history.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("subcontractor-rates-template.csv", rowsToAoa([EXAMPLE_ROW]).map((r) => r.map(String)))}
              >
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("subcontractor-rates-template.xlsx", rowsToAoa([EXAMPLE_ROW]))}>
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
                {result.inserted} new rate{result.inserted === 1 ? "" : "s"} recorded, {result.newSubcontractors} new subcontractor{result.newSubcontractors === 1 ? "" : "s"},{" "}
                {result.newItems} new trade item{result.newItems === 1 ? "" : "s"}, {result.skippedDuplicate} already present (skipped), {result.failed} failed.
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
