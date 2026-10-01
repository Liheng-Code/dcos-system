"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Package, Upload } from "lucide-react";
import { insertDwlEquipmentAttribute, insertDwlResourcePrice, insertDwlResourceReturning } from "@/lib/qs/qs-queries";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv-export";
import { get, num, readSheet, str, type ImportIssue } from "@/components/qs/dwl-import-lib";
import { DWL_EQUIPMENT_RATE_BASES, type DwlEquipmentRateBasis, type DwlEquipmentRateRow } from "@/components/qs/dwl-types";

// Equipment Rates import — compares each row with the catalog first:
//   new         code not in the library → resource + attributes + price created
//   price       code exists, Rate differs from the current rate → new price row (history kept)
//   unchanged   code exists, same rate → nothing to do
//   invalid     failed validation → skipped
// Existing descriptions / attributes are never overwritten by an import.

const TEMPLATE_COLUMNS = [
  "Code", "Description", "Ownership", "Rate Basis", "Unit of Output", "Rate", "Currency",
  "Operator Included", "Fuel Included", "Fuel L/day", "Minimum Hire", "Mobilisation", "Capacity / Model", "Notes",
];
const NEW_CODE_RE = /^E-[A-Z]{3}-\d{3}$/;
const BASIS_UNIT: Record<string, string> = { hour: "hr", day: "day", week: "week", month: "month" };
const BASIS_ALIASES: Record<string, DwlEquipmentRateBasis> = {
  hour: "hour", hr: "hour", hourly: "hour", day: "day", daily: "day", week: "week", weekly: "week",
  month: "month", monthly: "month", unit_output: "unit_output", output: "unit_output", "per unit": "unit_output",
};

interface EquipRow {
  _row: number;
  code: string;
  description: string;
  ownership: "owned" | "hired";
  rate_basis: DwlEquipmentRateBasis;
  unit: string;
  rate: number;
  currency: string;
  operator_included: boolean;
  fuel_included: boolean;
  fuel_l_per_day: number | null;
  min_hire_qty: number | null;
  mobilisation_cost: number | null;
  capacity_model: string | null;
  notes: string | null;
}

type Status = "new" | "price" | "unchanged";
interface Classified { row: EquipRow; status: Status; existing: DwlEquipmentRateRow | null }

const yes = (v: unknown) => /^(y|yes|true|1|x)$/i.test(String(v ?? "").trim());

const EXAMPLE: Omit<EquipRow, "_row"> = {
  code: "E-EXC-001", description: "Excavator PC200 incl. operator, excl. fuel", ownership: "hired", rate_basis: "day",
  unit: "day", rate: 185, currency: "USD", operator_included: true, fuel_included: false, fuel_l_per_day: 120,
  min_hire_qty: 5, mobilisation_cost: 250, capacity_model: "PC200, 0.8 m3 bucket", notes: "Phnom Penh area",
};

function toAoa(rows: Omit<EquipRow, "_row">[]): (string | number)[][] {
  return [TEMPLATE_COLUMNS, ...rows.map((r) => [
    r.code, r.description, r.ownership, r.rate_basis, r.rate_basis === "unit_output" ? r.unit : "", r.rate, r.currency,
    r.operator_included ? "Yes" : "No", r.fuel_included ? "Yes" : "No", r.fuel_l_per_day ?? "", r.min_hire_qty ?? "",
    r.mobilisation_cost ?? "", r.capacity_model ?? "", r.notes ?? "",
  ])];
}

function parseSheet(wb: WorkBook, existingCodes: Set<string>): { rows: EquipRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheet = wb.SheetNames[0];
  const ws = sheet ? wb.Sheets[sheet] : null;
  if (!ws) return { rows: [], issues: [{ sheet: sheet ?? "(none)", row: null, level: "error", message: "No sheet found in the file." }] };
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as unknown[][];
  const { rows: raw } = readSheet(aoa, "Code");
  if (raw.length === 0) return { rows: [], issues: [{ sheet, row: null, level: "error", message: "No \"Code\" column found — is this the Equipment Rates template?" }] };

  const rows: EquipRow[] = [];
  const seen = new Set<string>();
  for (const { _row, cells } of raw) {
    const err = (message: string) => issues.push({ sheet, row: _row, level: "error", message });
    const code = str(get(cells, "Code"))?.toUpperCase();
    if (!code) { err("Code is required."); continue; }
    if (!existingCodes.has(code) && !NEW_CODE_RE.test(code)) { err(`Code "${code}" is not in the library and does not match E-GRP-NNN (e.g. E-EXC-001).`); continue; }
    if (seen.has(code)) { err(`Duplicate code ${code} in the file.`); continue; }
    seen.add(code);
    const description = str(get(cells, "Description"));
    if (!description || description.length < 6) { err(`${code}: Description is required (min 6 characters).`); continue; }
    const basisRaw = (str(get(cells, "Rate Basis")) ?? "day").toLowerCase();
    const basis = BASIS_ALIASES[basisRaw];
    if (!basis) { err(`${code}: Rate Basis must be one of ${DWL_EQUIPMENT_RATE_BASES.join(" / ")}.`); continue; }
    const outputUnit = str(get(cells, "Unit of Output", "Unit"));
    if (basis === "unit_output" && !outputUnit) { err(`${code}: Unit of Output is required when Rate Basis is unit_output.`); continue; }
    const rate = num(get(cells, "Rate"));
    if (rate == null || rate < 0) { err(`${code}: Rate must be a non-negative number.`); continue; }
    const ownershipRaw = (str(get(cells, "Ownership")) ?? "hired").toLowerCase();
    rows.push({
      _row, code, description,
      ownership: ownershipRaw.startsWith("own") ? "owned" : "hired",
      rate_basis: basis,
      unit: basis === "unit_output" ? outputUnit! : BASIS_UNIT[basis],
      rate,
      currency: (str(get(cells, "Currency")) ?? "USD").toUpperCase(),
      operator_included: yes(get(cells, "Operator Included")),
      fuel_included: yes(get(cells, "Fuel Included")),
      fuel_l_per_day: num(get(cells, "Fuel L/day", "Fuel")),
      min_hire_qty: num(get(cells, "Minimum Hire")),
      mobilisation_cost: num(get(cells, "Mobilisation", "Mobilization")),
      capacity_model: str(get(cells, "Capacity / Model", "Capacity")),
      notes: str(get(cells, "Notes")),
    });
  }
  return { rows, issues };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  existing: DwlEquipmentRateRow[];
  onImported: () => void;
}

export function DwlEquipmentRateImportDialog({ open, onOpenChange, tenantId, userId, existing, onImported }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [classified, setClassified] = useState<Classified[]>([]);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<{ created: number; prices: number; failed: number; errors: string[] } | null>(null);

  const byCode = useMemo(() => new Map(existing.map((e) => [e.code.toUpperCase(), e])), [existing]);
  const counts = useMemo(() => {
    const c = { new: 0, price: 0, unchanged: 0 };
    for (const r of classified) c[r.status]++;
    return c;
  }, [classified]);
  const invalidRows = new Set(issues.filter((i) => i.level === "error" && i.row != null).map((i) => i.row)).size;
  const fileLevelError = issues.some((i) => i.level === "error" && i.row == null);
  const toApply = classified.filter((c) => c.status !== "unchanged");

  function reset() {
    setFileName(""); setClassified([]); setIssues([]); setReport(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function onFile(file: File) {
    reset();
    setFileName(file.name);
    setParsing(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const { rows, issues: parsed } = parseSheet(wb, new Set(byCode.keys()));
      setIssues(parsed);
      setClassified(rows.map((row) => {
        const ex = byCode.get(row.code) ?? null;
        if (!ex) return { row, status: "new" as const, existing: null };
        return { row, status: ex.rate != null && Math.abs(ex.rate - row.rate) < 0.0001 ? "unchanged" as const : "price" as const, existing: ex };
      }));
    } catch (e) {
      setIssues([{ sheet: file.name, row: null, level: "error", message: e instanceof Error ? e.message : "Failed to read the file." }]);
    } finally {
      setParsing(false);
    }
  }

  async function confirmImport() {
    if (!tenantId) { toast.error("No tenant assigned to your profile — cannot import."); return; }
    setImporting(true);
    const res = { created: 0, prices: 0, failed: 0, errors: [] as string[] };
    const today = new Date().toISOString().slice(0, 10);
    try {
      for (const { row, status, existing: ex } of toApply) {
        let resourceId = ex?.resource_id ?? null;
        if (status === "new") {
          const { data, error } = await insertDwlResourceReturning({ tenant_id: tenantId, category: "equipment", code: row.code, description: row.description, unit: row.unit, created_by: userId });
          if (error || !data) { res.failed++; res.errors.push(`${row.code}: ${error?.message ?? "insert failed"}`); continue; }
          resourceId = data.id as string;
          const { error: attrErr } = await insertDwlEquipmentAttribute({
            resource_id: resourceId, tenant_id: tenantId, ownership: row.ownership, rate_basis: row.rate_basis,
            operator_included: row.operator_included, fuel_included: row.fuel_included,
            fuel_l_per_day: row.fuel_included ? null : row.fuel_l_per_day, min_hire_qty: row.min_hire_qty,
            mobilisation_cost: row.mobilisation_cost, capacity_model: row.capacity_model, notes: row.notes, created_by: userId,
          });
          if (attrErr) res.errors.push(`${row.code}: details — ${attrErr.message}`);
          res.created++;
        }
        const { error: priceErr } = await insertDwlResourcePrice({
          tenant_id: tenantId, resource_id: resourceId, unit_price: row.rate, currency: row.currency,
          valid_from: today, source_type: "estimate", price_status: "approved",
          notes: "Imported via Equipment Rates Excel/CSV template.", created_by: userId,
        });
        if (priceErr) { res.failed++; res.errors.push(`${row.code}: price — ${priceErr.message}`); }
        else if (status === "price") res.prices++;
      }
      setReport(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} failure(s). See the report.`);
      else toast.success(`Import complete — ${res.created} new, ${res.prices} rate update(s).`);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  const STATUS_LABEL: Record<Status, string> = { new: "New", price: "Rate changed", unchanged: "Unchanged" };
  const STATUS_CLASS: Record<Status, string> = {
    new: "border-emerald-200 bg-emerald-50 text-emerald-700",
    price: "border-violet-200 bg-violet-50 text-violet-700",
    unchanged: "border-border bg-muted text-muted-foreground",
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className={cn("max-h-[90vh] overflow-y-auto", classified.length > 0 ? "sm:max-w-4xl" : "sm:max-w-2xl")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Equipment Rates Import (Excel / CSV)
          </DialogTitle>
          <DialogDescription>
            Upload → Validate → Compare with the catalog → Import. New codes are created; a different Rate on an existing
            code is added to its price history. Existing details are never overwritten.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Download Standardized Template</p>
            <p className="text-xs text-muted-foreground">
              One row per plant item. New codes must match E-GRP-NNN (e.g. E-EXC-001); existing codes (e.g. PL-PLT-05) may be
              used to update their rate. Rate Basis: hour / day / week / month / unit_output.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadCsv("equipment-rates-template.csv", toAoa([EXAMPLE]).map((r) => r.map(String)))}>
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                const wb = XLSX.utils.book_new();
                const ws = XLSX.utils.aoa_to_sheet(toAoa([EXAMPLE]));
                ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
                XLSX.utils.book_append_sheet(wb, ws, "Equipment Rates");
                XLSX.writeFile(wb, "equipment-rates-template.xlsx");
              }}>
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download .XLSX
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-border p-4 text-center">
            <input ref={fileInput} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
            <Package className="mx-auto h-6 w-6 text-muted-foreground/60" />
            <p className="mt-1.5 text-sm font-medium">Select an Excel (.xlsx, .xls) or CSV (.csv) file</p>
            <div className="mt-2.5 flex items-center justify-center gap-2">
              <Button size="sm" onClick={() => fileInput.current?.click()} disabled={parsing}>
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Choose File
              </Button>
              <span className="text-xs text-muted-foreground">{fileName || "No file chosen"}</span>
            </div>
          </div>

          {classified.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className={STATUS_CLASS.new}>{counts.new} new</Badge>
                <Badge variant="outline" className={STATUS_CLASS.price}>{counts.price} rate changed</Badge>
                <Badge variant="outline" className={STATUS_CLASS.unchanged}>{counts.unchanged} unchanged</Badge>
                <Badge variant={invalidRows > 0 ? "destructive" : "outline"}>{invalidRows} invalid (skipped)</Badge>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                    <tr className="text-left">
                      <th className="px-2 py-1.5">Row</th><th className="px-2 py-1.5">Code</th><th className="px-2 py-1.5">Description</th>
                      <th className="px-2 py-1.5">Basis</th><th className="px-2 py-1.5 text-right">Current</th>
                      <th className="px-2 py-1.5 text-right">File</th><th className="px-2 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classified.map(({ row, status, existing: ex }) => (
                      <tr key={row._row} className={cn("border-t border-border", status === "unchanged" && "text-muted-foreground")}>
                        <td className="px-2 py-1.5 tabular-nums">{row._row}</td>
                        <td className="px-2 py-1.5 font-mono">{row.code}</td>
                        <td className="px-2 py-1.5">{ex?.description ?? row.description}</td>
                        <td className="px-2 py-1.5">{row.rate_basis === "unit_output" ? `per ${row.unit}` : row.rate_basis}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{ex?.rate != null ? ex.rate.toFixed(2) : "—"}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{row.rate.toFixed(2)}</td>
                        <td className="px-2 py-1.5"><Badge variant="outline" className={cn("text-[10px]", STATUS_CLASS[status])}>{STATUS_LABEL[status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {issues.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border">
              {issues.slice(0, 100).map((i, idx) => (
                <div key={idx} className={cn("flex items-start gap-2 border-b border-border px-2.5 py-1.5 text-xs last:border-b-0", i.level === "error" ? "text-destructive" : "text-muted-foreground")}>
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{i.row ? `Row ${i.row}: ` : ""}{i.message}</span>
                </div>
              ))}
            </div>
          )}

          {report && (
            <div className="rounded-lg border border-border p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Import report</p>
              <p className="mt-1 text-muted-foreground">
                {report.created} new equipment item(s), {report.prices} rate update(s), {report.failed} failed.
              </p>
              {report.errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" className="bg-emerald-600 hover:bg-emerald-700"
            disabled={toApply.length === 0 || fileLevelError || importing || parsing || !!report}
            onClick={() => void confirmImport()}>
            {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Import ({counts.new} new + {counts.price} rate update{counts.price === 1 ? "" : "s"})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
