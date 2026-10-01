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
  parseSimpleCostItemSheet, type SimpleCostItemRow, type ImportIssue,
} from "@/components/qs/dwl-import-lib";
import { insertDwlAssemblyItem, insertDwlAssemblyReturning, insertDwlAssemblySpecs, listDwlAssembliesOfIdAndCode, listDwlMaterialCategories, listDwlWorkItems, upsertDwlAssemblyCosting } from "@/lib/qs/qs-queries";

const TEMPLATE_COLUMNS = [
  "Code", "Name", "Short Description", "Category", "Discipline", "Unit", "Status", "Scope of Works",
  "Link to Work Item Code", "Base Direct Cost", "Project Overhead %", "Company Overhead %", "Risk %",
  "Profit %", "VAT %", "Thickness", "Material Core/Grade", "Manufacturer", "Standard", "Fire Rating",
  "Acoustic Rating", "Moisture Resistance", "Surface Finish", "Installation Method", "Compliance Notes",
  "Assumptions", "Inclusions", "Exclusions", "Field Lessons",
];

// A full worked example — every column filled in — so the template is
// self-documenting: Assumptions/Inclusions/Exclusions/Field Lessons show
// the "|"-separated multi-value convention, and Link to Work Item Code is
// left blank to demonstrate the standalone (Base Direct Cost) path.
const EXAMPLE_ROW: Omit<SimpleCostItemRow, "_row"> = {
  code: "ASM-TILE-001",
  name: "Ceramic Floor Tile 600x600 Adhesive Fixed",
  short_description: "Ceramic tile flooring, thin-bed adhesive fixed with grout joints.",
  category_text: "CAT-TILE",
  discipline: "Architectural",
  unit: "m2",
  status: "active",
  scope_of_works: "Supply and install 600x600mm ceramic floor tiles on cementitious adhesive bed with grouted joints, including surface preparation and cleaning.",
  work_item_code: "",
  manual_direct_cost: 18.5,
  project_overhead_pct: 5,
  company_overhead_pct: 5,
  risk_pct: 2,
  profit_pct: 10,
  vat_pct: 10,
  thickness: "10mm tile + 5mm adhesive bed",
  material_core: "Porcelain body, rectified edge",
  manufacturer: "SCG / RCI Ceramic",
  standard: "ISO 13006 / ASTM C373",
  fire_rating: "",
  acoustic_rating: "",
  moisture_resistance: "Water absorption < 3%",
  surface_finish: "Matte, rectified edge, grouted joint",
  installation_method: "Thin-bed adhesive fixing with notched trowel, 3mm grout joint",
  compliance_notes: "Comply with local building code for floor finishes",
  assumptions: ["Substrate is level within ±3mm over 3m", "No underfloor heating present"],
  inclusions: ["Tile adhesive and grout", "Surface cleaning after installation"],
  exclusions: ["Substrate leveling/screed", "Skirting tiles"],
  field_lessons: ["Allow 24hr cure before foot traffic"],
};

function rowsToAoa(rows: Omit<SimpleCostItemRow, "_row">[]): (string | number)[][] {
  return [
    TEMPLATE_COLUMNS,
    ...rows.map((r) => [
      r.code, r.name, r.short_description ?? "", r.category_text ?? "", r.discipline ?? "", r.unit, r.status,
      r.scope_of_works ?? "", r.work_item_code ?? "", r.manual_direct_cost ?? "",
      r.project_overhead_pct, r.company_overhead_pct, r.risk_pct, r.profit_pct, r.vat_pct,
      r.thickness ?? "", r.material_core ?? "", r.manufacturer ?? "", r.standard ?? "", r.fire_rating ?? "",
      r.acoustic_rating ?? "", r.moisture_resistance ?? "", r.surface_finish ?? "", r.installation_method ?? "", r.compliance_notes ?? "",
      r.assumptions.join("|"), r.inclusions.join("|"), r.exclusions.join("|"), r.field_lessons.join("|"),
    ]),
  ];
}

function downloadXlsx(filename: string, aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Cost Item Library");
  XLSX.writeFile(wb, filename);
}

interface ImportResult { inserted: number; skippedExisting: number; failed: number; errors: string[]; }

async function importCostItems(
  supabase: ReturnType<typeof createClient>,
  rows: SimpleCostItemRow[],
  tenantId: string,
  userId: string | null
): Promise<ImportResult> {
  const [exAsm, exCats, exWorkItems] = await Promise.all([
    listDwlAssembliesOfIdAndCode(),
    listDwlMaterialCategories(),
    listDwlWorkItems(),
  ]);
  const existingCodes = new Set(((exAsm.data ?? []) as { id: string; code: string }[]).map((r) => r.code.toUpperCase()));
  const catByCode = new Map<string, { id: string; name: string }>();
  const catByName = new Map<string, { id: string; name: string }>();
  for (const c of (exCats.data ?? []) as { id: string; code: string | null; name: string }[]) {
    if (c.code) catByCode.set(c.code.toUpperCase(), { id: c.id, name: c.name });
    catByName.set(c.name.toLowerCase(), { id: c.id, name: c.name });
  }
  const workItemByCode = new Map<string, string>();
  for (const w of (exWorkItems.data ?? []) as { id: string; code: string }[]) workItemByCode.set(w.code.toUpperCase(), w.id);

  const result: ImportResult = { inserted: 0, skippedExisting: 0, failed: 0, errors: [] };

  for (const row of rows) {
    if (existingCodes.has(row.code)) { result.skippedExisting++; continue; }

    const cat = row.category_text
      ? catByCode.get(row.category_text.toUpperCase()) ?? catByName.get(row.category_text.toLowerCase()) ?? null
      : null;
    const elementGroup = cat?.name ?? (row.discipline || "General");
    const description = row.short_description?.trim() ? `${row.name.trim()} — ${row.short_description.trim()}` : row.name.trim();
    const workItemId = row.work_item_code ? workItemByCode.get(row.work_item_code.toUpperCase()) ?? null : null;
    const isStandalone = !workItemId;

    const { data: assemblyRow, error: asmErr } = await insertDwlAssemblyReturning({
        tenant_id: tenantId,
        code: row.code,
        element_group: elementGroup,
        description,
        unit: row.unit,
        measurement_rule: "Net area/quantity as measured, per selected unit",
        created_by: userId,
      });
    if (asmErr || !assemblyRow) {
      result.failed++;
      result.errors.push(`${row.code}: ${asmErr?.message ?? "assembly insert failed"}`);
      continue;
    }
    const assemblyId = assemblyRow.id as string;
    existingCodes.add(row.code);

    const { error: costErr } = await upsertDwlAssemblyCosting({
        assembly_id: assemblyId,
        tenant_id: tenantId,
        category_id: cat?.id ?? null,
        discipline: row.discipline || null,
        status: row.status,
        overhead_pct: (row.project_overhead_pct + row.company_overhead_pct) / 100,
        risk_pct: row.risk_pct / 100,
        profit_pct: row.profit_pct / 100,
        vat_pct: row.vat_pct / 100,
        manual_direct_cost_per_unit: isStandalone ? (row.manual_direct_cost ?? 0) : null,
        scope_of_works: row.scope_of_works,
        created_by: userId,
      });
    if (costErr) {
      result.failed++;
      result.errors.push(`${row.code}: ${costErr.message}`);
      continue;
    }

    if (workItemId) {
      const { error: linkErr } = await insertDwlAssemblyItem({
        tenant_id: tenantId,
        assembly_id: assemblyId,
        work_item_id: workItemId,
        qty_per_unit: 1,
        basis_note: "Direct 1:1 — single work item forms the whole assembly",
        sort_order: 0,
      });
      if (linkErr) result.errors.push(`${row.code}: registered, but linking the work item failed — ${linkErr.message}`);
    } else if (row.work_item_code) {
      result.errors.push(`${row.code}: Work Item Code "${row.work_item_code}" not found — registered as standalone instead.`);
    }

    const specRows: { tenant_id: string; assembly_id: string; section: string; sort_order: number; spec_label: string; spec_value: string }[] = [];
    const fixedSpecs: [string, string | null][] = [
      ["Thickness / Dimensions", row.thickness],
      ["Material Core / Grade", row.material_core],
      ["Manufacturer / Brand Reference", row.manufacturer],
      ["Applicable Standard", row.standard],
      ["Fire Rating", row.fire_rating],
      ["Acoustic Rating (NRC / STC / CAC)", row.acoustic_rating],
      ["Moisture Resistance", row.moisture_resistance],
      ["Surface Finish & Jointing", row.surface_finish],
      ["Installation Method & Fixings", row.installation_method],
      ["Specification & Compliance Notes", row.compliance_notes],
    ];
    fixedSpecs.forEach(([label, value], i) => {
      if (value?.trim()) specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "specification", sort_order: i + 1, spec_label: label, spec_value: value.trim() });
    });
    row.assumptions.forEach((s, i) => specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "estimating_assumption", sort_order: i + 1, spec_label: "", spec_value: s }));
    row.inclusions.forEach((s, i) => specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "inclusion", sort_order: i + 1, spec_label: "", spec_value: s }));
    row.exclusions.forEach((s, i) => specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "boundary_exclusion", sort_order: i + 1, spec_label: "", spec_value: s }));
    row.field_lessons.forEach((s, i) => specRows.push({ tenant_id: tenantId, assembly_id: assemblyId, section: "field_lesson", sort_order: i + 1, spec_label: "", spec_value: s }));

    if (specRows.length > 0) {
      const { error: specErr } = await insertDwlAssemblySpecs(specRows);
      if (specErr) result.errors.push(`${row.code}: detail rows — ${specErr.message}`);
    }

    result.inserted++;
  }

  return result;
}

interface DwlCostItemImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onImported: () => void;
}

export function DwlCostItemImportDialog({ open, onOpenChange, tenantId, userId, onImported }: DwlCostItemImportDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SimpleCostItemRow[]>([]);
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
      const { rows: parsedRows, issues: parsedIssues } = parseSimpleCostItemSheet(wb);
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
      const res = await importCostItems(supabase, rows, tenantId, userId);
      setResult(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} row failure(s). See the report.`);
      else toast.success(`Import complete — ${res.inserted} new cost item(s) registered.`);
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
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Cost Item Library Import (Excel / CSV)
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
              One row per cost item. Only Code, Name and Unit are required — every other column can be left blank
              and filled in later on the item&apos;s own tabs. Assumptions/Inclusions/Exclusions/Field Lessons accept
              multiple values separated by &quot;|&quot;.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("cost-item-library-template.csv", rowsToAoa([EXAMPLE_ROW]).map((r) => r.map(String)))}
              >
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("cost-item-library-template.xlsx", rowsToAoa([EXAMPLE_ROW]))}>
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
                {result.inserted} new cost item{result.inserted === 1 ? "" : "s"} registered,{" "}
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
