"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Package, Upload,
} from "lucide-react";
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
  parseSimpleSupplierSheet, type SimpleSupplierRow, type ImportIssue,
} from "@/components/qs/dwl-import-lib";

const TEMPLATE_COLUMNS = [
  "Supplier Code", "Company Name", "Trading Name", "Type", "Contact Person", "Phone", "Email",
  "City", "Country", "Payment Terms", "Delivery Terms", "Lead Time (Days)", "Rating (1-5)",
  "Competitiveness", "Status",
];

function rowsToAoa(rows: Omit<SimpleSupplierRow, "_row">[]): (string | number)[][] {
  return [
    TEMPLATE_COLUMNS,
    ...rows.map((r) => [
      r.supplier_code, r.company_name, r.trading_name ?? "", r.supplier_type ?? "", r.contact_person ?? "",
      r.phone ?? "", r.email ?? "", r.city ?? "", r.country ?? "", r.payment_terms ?? "", r.delivery_terms ?? "",
      r.lead_time_days ?? "", r.rating ?? "", r.competitiveness ?? "", r.is_active ? "Active" : "Inactive",
    ]),
  ];
}

function downloadXlsx(filename: string, aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
  XLSX.writeFile(wb, filename);
}

const EXAMPLE_ROW: Omit<SimpleSupplierRow, "_row"> = {
  supplier_code: "SUP-0001", company_name: "Siam City Cement (Cambodia) Ltd", trading_name: "SCCC Insee",
  supplier_type: "Manufacturer", contact_person: "Somchai Prasert", phone: "+855 23 881 290",
  email: "somchai.p@siamcitycement.com", city: "Phnom Penh", country: "Cambodia / Thailand",
  payment_terms: "30 Days Net", delivery_terms: "FOB Jobsite Plant Mixer", lead_time_days: 2,
  rating: 4.8, competitiveness: "Competitive", is_active: true,
};

interface ImportResult { suppliersInserted: number; suppliersSkipped: number; failed: number; errors: string[]; }

async function importSimpleSuppliers(
  supabase: ReturnType<typeof createClient>,
  rows: SimpleSupplierRow[],
  tenantId: string,
  userId: string | null
): Promise<ImportResult> {
  const { data: exData } = await supabase.from("dwl_supplier_profiles").select("supplier_code");
  const existingCodes = new Set(((exData ?? []) as { supplier_code: string | null }[]).map((p) => p.supplier_code?.toUpperCase()).filter(Boolean));

  const result: ImportResult = { suppliersInserted: 0, suppliersSkipped: 0, failed: 0, errors: [] };

  for (const row of rows) {
    if (existingCodes.has(row.supplier_code.toUpperCase())) { result.suppliersSkipped++; continue; }

    const rating = row.rating;
    const ratingBand = rating != null ? (rating >= 4.5 ? "A" : rating >= 3.5 ? "B" : "C") : "B";

    const { data: supplier, error: supErr } = await supabase.from("dwl_suppliers").insert({
      tenant_id: tenantId, name: row.company_name, contact: row.contact_person,
      rating: ratingBand, is_active: row.is_active, created_by: userId,
    }).select("id").single();
    if (supErr || !supplier) { result.failed++; result.errors.push(`${row.supplier_code}: ${supErr?.message ?? "supplier insert failed"}`); continue; }

    const { error: profErr } = await supabase.from("dwl_supplier_profiles").insert({
      supplier_id: supplier.id, tenant_id: tenantId, supplier_code: row.supplier_code,
      trading_name: row.trading_name, supplier_type: row.supplier_type, contact_person: row.contact_person,
      phone: row.phone, email: row.email, country: row.country, province_city: row.city,
      payment_terms: row.payment_terms, delivery_terms: row.delivery_terms, lead_time_days: row.lead_time_days,
      overall_rating: rating, reliability_rating: rating != null ? String(rating) : null,
      price_competitiveness: row.competitiveness, lifecycle_status: row.is_active ? "active" : "inactive",
      created_by: userId,
    });
    if (profErr) {
      // Two-step spine+companion insert — never leave an orphaned dwl_suppliers row.
      await supabase.from("dwl_suppliers").delete().eq("id", supplier.id as string);
      result.failed++; result.errors.push(`${row.supplier_code}: ${profErr.message}`);
      continue;
    }
    existingCodes.add(row.supplier_code.toUpperCase());
    result.suppliersInserted++;
  }

  return result;
}

interface DwlSupplierImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onImported: () => void;
}

export function DwlSupplierImportDialog({ open, onOpenChange, tenantId, userId, onImported }: DwlSupplierImportDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SimpleSupplierRow[]>([]);
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
      const { rows: parsedRows, issues: parsedIssues } = parseSimpleSupplierSheet(wb);
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
      const res = await importSimpleSuppliers(supabase, rows, tenantId, userId);
      setResult(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} row failure(s). See the report.`);
      else toast.success(`Import complete — ${res.suppliersInserted} new supplier(s).`);
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Controlled Supplier Master Import (Excel / CSV)
          </DialogTitle>
          <DialogDescription>
            Upload → Validate → Preview → Confirm. Invalid rows are listed and nothing is written until you confirm.
            Re-importing the same file creates no duplicates (matched by Supplier Code).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Download Standardized Template</p>
            <p className="text-xs text-muted-foreground">
              Pre-configured with all columns: Supplier Code, Company Name, Trading Name, Type, Contact Person,
              Phone, Email, City, Country, Payment Terms, Delivery Terms, Lead Time (Days), Rating (1-5), Competitiveness, Status.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("supplier-master-template.csv", rowsToAoa([EXAMPLE_ROW]).map((r) => r.map(String)))}
              >
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("supplier-master-template.xlsx", rowsToAoa([EXAMPLE_ROW]))}>
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
            <p className="text-xs text-muted-foreground">Both comma-delimited CSV and multi-sheet Excel files are automatically validated</p>
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
                {result.suppliersInserted} new supplier{result.suppliersInserted === 1 ? "" : "s"},{" "}
                {result.suppliersSkipped} already present, {result.failed} failed.
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
