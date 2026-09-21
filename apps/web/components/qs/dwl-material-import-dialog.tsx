"use client";

import { useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Package, Upload, Zap,
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
  parseSimpleMaterialSheet, type SimpleMaterialRow, type ImportIssue,
} from "@/components/qs/dwl-import-lib";

const TEMPLATE_COLUMNS = ["Code", "Name", "Category", "Specification", "Standard", "Grade", "Unit", "Brand", "Discipline", "Cost Code", "Application", "Effective Cost"];

// The 25-material ceiling systems reference set (same materials already
// seeded as M-CLG-001..025 by 20260910000010_dwl_seed_ceiling_materials.sql)
// — shown here in the Material Master template's own column shape so it
// doubles as both a downloadable worked example and the "Instant 1-Click
// Load" dataset. Cost Code values are the CSI-style codes from the source
// export; they only apply if they happen to match an existing
// public.budget_codes.code — this repo's budget codes use a different
// lettered scheme, so in practice they are carried on the row but not
// linked (see importSimpleMaterials()).
const CEILING_MATRIX: Omit<SimpleMaterialRow, "_row">[] = [
  { code: "MAT-CEIL-001", legacy_code: "MAT-CL-001", material_name: "Gypsum Board Suspended Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C1396 / EN 520", grade: "Standard Commercial", brand: "Gyproc / Knauf", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.13", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-002", legacy_code: "MAT-CL-002", material_name: "Gypsum Board Direct-Fixed Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C1396 / EN 520", grade: "Standard Residential", brand: "Gyproc / USG Boral", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.14", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-003", legacy_code: "MAT-CL-003", material_name: "Moisture-Resistant Gypsum Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C1396 Type H / EN 520 Type H2", grade: "Moisture-Resistant (Green Board)", brand: "Gyproc AquaROC / Knauf Hydro", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.15", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-004", legacy_code: "MAT-CL-004", material_name: "Fire-Rated Gypsum Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM E119 / BS 476 Part 22 / EN 520 Type F", grade: "Fire-Shield Type X (1hr/2hr FR)", brand: "Gyproc FireLine / Promat Masterboard", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.16", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-005", legacy_code: "MAT-CL-005", material_name: "Cement Board Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C1186 / EN 12467 Class 1", grade: "Grade 1 Exterior / Wet Duty", brand: "SCG SmartBoard / James Hardie HardieBacker", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.17", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-006", legacy_code: "MAT-CL-006", material_name: "Mineral Fiber Acoustic Tile", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM E1264 Type III / EN 13964", grade: "Acoustic Commercial Grade (NRC 0.70)", brand: "Armstrong Fine Fissured / USG Radar", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.23", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-007", legacy_code: "MAT-CL-007", material_name: "Metal Lay-In Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "EN 13964 / ASTM C635", grade: "Architectural Grade Aluminum 3003-H14", brand: "Hunter Douglas / Durlum", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.33", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-008", legacy_code: "MAT-CL-008", material_name: "Metal Clip-In Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "EN 13964 Class A1 Fire Safe", grade: "Concealed Carrier System", brand: "Armstrong MetalClip / SAS International", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.34", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-009", legacy_code: "MAT-CL-009", material_name: "Metal Hook-On Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "EN 13964 / BS 8290", grade: "High-Traffic Heavy Commercial", brand: "Hunter Douglas / Lindner Group", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.35", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-010", legacy_code: "MAT-CL-010", material_name: "Aluminium Linear Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM B209 / EN 13964", grade: "Roll-Formed Aluminum Alloy 3005", brand: "Hunter Douglas Luxalon / Alucobond", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.36", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-011", legacy_code: "MAT-CL-011", material_name: "Aluminium Strip Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "AAMA 2605 / EN 13964 Wind Load Tested", grade: "Exterior Wind-Load Tested PVDF", brand: "Hunter Douglas Luxalon Exterior", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.37", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-012", legacy_code: "MAT-CL-012", material_name: "Aluminium Baffle Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM B221 / EN 13964", grade: "Architectural Extrusion 6063-T5", brand: "Armstrong Metal Baffles / Hunter Douglas", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.38", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-013", legacy_code: "MAT-CL-013", material_name: "Metal Baffle Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C423 / ISO 354 Sound Absorption", grade: "Sound Absorption NRC >= 0.85", brand: "Ecophon / SAS Baffle 500", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.39", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-014", legacy_code: "MAT-CL-014", material_name: "Open Cell / Open Grid Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "EN 13964 Class A1 Fire Safe", grade: "Open Cell Monolithic Grid", brand: "Durlum Open Sky / Hunter Douglas Cell", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.40", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-015", legacy_code: "MAT-CL-015", material_name: "Expanded Metal Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "DIN 791 / EN 13964", grade: "Architectural Mesh Grade", brand: "Lindner Mesh / Durlum Rhomboid", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.41", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-016", legacy_code: "MAT-CL-016", material_name: "PVC Panel Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM D1784 / ISO 9001", grade: "Waterproof Rigid PVC Class 1", brand: "Plastik Ceiling / Everbuild", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.42", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-017", legacy_code: "MAT-CL-017", material_name: "Wood Panel Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "EN 13986 / ASTM E84 Class A Flame Spread", grade: "Architectural Premium Wood Veneer", brand: "Armstrong WoodWorks / Decoustics", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.43", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-018", legacy_code: "MAT-CL-018", material_name: "Wood Slat Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "FSC Certified 100% / ASTM E84", grade: "Select Grade Solid Hardwood Slats", brand: "Gustafs Linear Rib / AcousticWood", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.44", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-019", legacy_code: "MAT-CL-019", material_name: "Acoustic Wood Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ISO 354 / EN 13964 / ASTM C423", grade: "High Acoustic Performance (NRC 0.80+)", brand: "Topakustik / Decoustics Quadrillo", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.45", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-020", legacy_code: "MAT-CL-020", material_name: "Acoustic Fabric Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C423 NRC 0.90 / BS 476 Part 7 Class 1", grade: "Seamless Architectural Fabric System", brand: "BASWA Acoustic / Clipso Acoustic", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.46", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-021", legacy_code: "MAT-CL-021", material_name: "Stretch Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "EN 14716 / NF P 92-507 (M1 Fire Rating)", grade: "Flame Retardant M1 / Class 0", brand: "Barrisol / Newmat", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.47", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-022", legacy_code: "MAT-CL-022", material_name: "Decorative Feature Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM C1381 / BS 8212", grade: "Custom Fabricated Architectural GRG", brand: "Formglas / Architectural Precast Co.", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.48", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-023", legacy_code: "MAT-CL-023", material_name: "Acoustic Cloud Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM E1264 / ISO 354 Sabin Absorption", grade: "Free-Hanging Cloud Absorber (High Sabin)", brand: "Armstrong SoundScapes / Ecophon Solo", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.49", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-024", legacy_code: "MAT-CL-024", material_name: "Exposed Structure Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "ASTM E84 / SSPC-SP 13 Concrete Preparation", grade: "Industrial Loft Architectural Finish", brand: "K-13 Acoustic Thermal / PPG Architectural", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.50", application_scope: null, effective_cost: null },
  { code: "MAT-CEIL-025", legacy_code: "MAT-CL-025", material_name: "Exposed MEP Ceiling", category_text: "Finishes - Ceiling", tech_spec_summary: null, standard: "SMACNA / ASHRAE 90.1 Architectural Exposed Ductwork", grade: "Coordinated Architectural MEP Plenum", brand: "System Coordinated MEP Specification", discipline: "Architectural", unit: "m2", cost_code_text: "09.51.51", application_scope: null, effective_cost: null },
];

function rowsToAoa(rows: Omit<SimpleMaterialRow, "_row">[]): (string | number)[][] {
  return [
    TEMPLATE_COLUMNS,
    ...rows.map((r) => [
      r.legacy_code ?? r.code, r.material_name, r.category_text ?? "", r.tech_spec_summary ?? "", r.standard ?? "",
      r.grade ?? "", r.unit, r.brand ?? "", r.discipline ?? "", r.cost_code_text ?? "", r.application_scope ?? "",
      r.effective_cost ?? "",
    ]),
  ];
}

function downloadXlsx(filename: string, aoa: (string | number)[][]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: Math.max(c.length + 2, 14) }));
  XLSX.utils.book_append_sheet(wb, ws, "Material Master");
  XLSX.writeFile(wb, filename);
}

const EXAMPLE_ROW: Omit<SimpleMaterialRow, "_row"> = {
  code: "MAT-CONC-004", legacy_code: null, material_name: "Ready Mix Concrete C25/30 (EN 206)",
  category_text: "Structural - Concrete & Cement",
  tech_spec_summary: "Minimum slump 100±25mm, 20mm max aggregate, w/c ratio ≤ 0.5",
  standard: "EN 206 / BS 8500", grade: "C25/30",
  brand: "Insee Pro", discipline: "Structural", unit: "m3", cost_code_text: "03-3000", application_scope: "Slabs, footings",
  effective_cost: 68.5,
};

interface ImportResult { resourcesInserted: number; resourcesSkipped: number; attrsInserted: number; attrsSkipped: number; pricesInserted: number; failed: number; errors: string[]; }

async function importSimpleMaterials(
  supabase: ReturnType<typeof createClient>,
  rows: SimpleMaterialRow[],
  tenantId: string,
  userId: string | null
): Promise<ImportResult> {
  const [exRes, exAttr, exCats, exBudget] = await Promise.all([
    supabase.from("dwl_resources").select("id, code").eq("category", "material"),
    supabase.from("dwl_material_attributes").select("resource_id, legacy_code"),
    supabase.from("dwl_material_categories").select("id, code, name, specific_element"),
    supabase.from("budget_codes").select("id, code"),
  ]);
  const codeToId = new Map<string, string>();
  for (const r of (exRes.data ?? []) as { id: string; code: string }[]) codeToId.set(r.code, r.id);
  // Match on legacy_code too, not just the current code — the code column
  // was standardized 2026-09-15 (20260910000030_dwl_material_code_
  // standardize.sql), so a template/matrix row's `code` value may no
  // longer be a resource's *current* code even though the material
  // already exists; without this, re-running an import (or "Instant
  // 1-Click Load") would create a duplicate resource under a stale code.
  const legacyToId = new Map<string, string>();
  const attrSet = new Set<string>();
  for (const a of (exAttr.data ?? []) as { resource_id: string; legacy_code: string | null }[]) {
    attrSet.add(a.resource_id);
    if (a.legacy_code) legacyToId.set(a.legacy_code, a.resource_id);
  }
  const catByCode = new Map<string, { id: string; specific_element: string | null }>();
  const catByName = new Map<string, { id: string; specific_element: string | null }>();
  for (const c of (exCats.data ?? []) as { id: string; code: string | null; name: string; specific_element: string | null }[]) {
    if (c.code) catByCode.set(c.code.toUpperCase(), { id: c.id, specific_element: c.specific_element });
    catByName.set(c.name.toLowerCase(), { id: c.id, specific_element: c.specific_element });
  }
  const budgetByCode = new Map<string, string>();
  for (const b of (exBudget.data ?? []) as { id: string; code: string }[]) budgetByCode.set(b.code, b.id);

  const result: ImportResult = { resourcesInserted: 0, resourcesSkipped: 0, attrsInserted: 0, attrsSkipped: 0, pricesInserted: 0, failed: 0, errors: [] };

  for (const row of rows) {
    let rid = codeToId.get(row.code) ?? (row.legacy_code ? legacyToId.get(row.legacy_code) : undefined);
    if (!rid) {
      const { data, error } = await supabase.from("dwl_resources").insert({
        tenant_id: tenantId, code: row.code, category: "material",
        description: row.standard ? `${row.material_name} (${row.standard})` : row.material_name,
        unit: row.unit, spec_reference: row.standard, created_by: userId,
      }).select("id").single();
      if (error || !data) { result.failed++; result.errors.push(`${row.code}: ${error?.message ?? "resource insert failed"}`); continue; }
      rid = data.id as string; codeToId.set(row.code, rid); result.resourcesInserted++;
    } else {
      result.resourcesSkipped++;
    }

    if (attrSet.has(rid)) { result.attrsSkipped++; continue; }

    const cat = row.category_text
      ? catByCode.get(row.category_text.toUpperCase()) ?? catByName.get(row.category_text.toLowerCase()) ?? null
      : null;
    const budgetCodeId = row.cost_code_text ? budgetByCode.get(row.cost_code_text) ?? null : null;

    const { error: attrErr } = await supabase.from("dwl_material_attributes").insert({
      resource_id: rid, tenant_id: tenantId, material_name: row.material_name,
      discipline: row.discipline, standard: row.standard, grade: row.grade, brand: row.brand,
      tech_spec_summary: row.tech_spec_summary,
      category_id: cat?.id ?? null, application_element: cat?.specific_element ?? null,
      application_scope: row.application_scope, budget_code_id: budgetCodeId,
      legacy_code: row.legacy_code, lifecycle_status: "active", created_by: userId,
    });
    if (attrErr) { result.failed++; result.errors.push(`${row.code}: ${attrErr.message}`); continue; }
    attrSet.add(rid); result.attrsInserted++;

    if (row.effective_cost != null && row.effective_cost > 0) {
      const { error: priceErr } = await supabase.from("dwl_resource_prices").insert({
        tenant_id: tenantId, resource_id: rid, unit_price: row.effective_cost, currency: "USD",
        valid_from: new Date().toISOString().slice(0, 10), source_type: "market_survey", price_status: "approved",
        notes: `Imported via Material Master Excel/CSV template — Effective Cost column.`, created_by: userId,
      });
      if (priceErr) { result.failed++; result.errors.push(`${row.code}: price — ${priceErr.message}`); }
      else result.pricesInserted++;
    }
  }

  return result;
}

interface DwlMaterialImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  userId: string | null;
  onImported: () => void;
}

export function DwlMaterialImportDialog({ open, onOpenChange, tenantId, userId, onImported }: DwlMaterialImportDialogProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<SimpleMaterialRow[]>([]);
  const [issues, setIssues] = useState<ImportIssue[]>([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

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
      const { rows: parsedRows, issues: parsedIssues } = parseSimpleMaterialSheet(wb);
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
      const res = await importSimpleMaterials(supabase, rows, tenantId, userId);
      setResult(res);
      if (res.failed > 0) toast.warning(`Import finished with ${res.failed} row failure(s). See the report.`);
      else toast.success(`Import complete — ${res.resourcesInserted} new material(s), ${res.attrsInserted} record(s) enriched.`);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  async function instantLoadMatrix() {
    if (!tenantId) { toast.error("No tenant assigned to your profile — cannot import."); return; }
    setMatrixLoading(true);
    try {
      const matrixRows: SimpleMaterialRow[] = CEILING_MATRIX.map((r, i) => ({ ...r, _row: i + 2 }));
      const res = await importSimpleMaterials(supabase, matrixRows, tenantId, userId);
      if (res.resourcesInserted === 0 && res.attrsInserted === 0) {
        toast.info("All 25 ceiling reference materials are already in your Material Master catalog.");
      } else {
        toast.success(`Ceiling reference matrix loaded — ${res.resourcesInserted} new material(s), ${res.attrsInserted} record(s) enriched.`);
      }
      if (res.failed > 0) toast.warning(`${res.failed} row(s) failed — see console.`);
      onImported();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the reference matrix.");
    } finally {
      setMatrixLoading(false);
    }
  }

  const canConfirm = rows.length > 0 && errorCount === 0 && !importing && !parsing;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> Controlled Material Master Import (Excel / CSV)
          </DialogTitle>
          <DialogDescription>
            Upload → Validate → Preview → Confirm. Invalid rows are listed and nothing is written until you confirm.
            Re-importing the same file creates no duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-border p-3">
            <p className="text-sm font-medium">Download Standardized Template</p>
            <p className="text-xs text-muted-foreground">
              Pre-configured with all columns: Code, Name, Category, Specification, Standard, Grade, Unit, Brand, Discipline, Cost Code, Application, Effective Cost.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadCsv("material-master-template.csv", rowsToAoa([EXAMPLE_ROW]).map((r) => r.map(String)))}
              >
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("material-master-template.xlsx", rowsToAoa([EXAMPLE_ROW]))}>
                <Upload className="h-3.5 w-3.5 rotate-180" /> Download .XLSX
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex items-start gap-3">
              <Badge className="mt-0.5 shrink-0 bg-violet-600 text-white">CL-001 – CL-025</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-violet-900">Ceiling Systems Reference Matrix (25 Assemblies)</p>
                <p className="text-xs text-violet-700/80">
                  Pre-mapped with Gypsum, Acoustic Tiles, Metal Lay-In/Clip-In, Baffles, Wood Slats, Stretch Ceilings & Exposed MEP.
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => downloadCsv("ceiling-systems-matrix.csv", rowsToAoa(CEILING_MATRIX).map((r) => r.map(String)))}>
                Matrix CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => downloadXlsx("ceiling-systems-matrix.xlsx", rowsToAoa(CEILING_MATRIX))}>
                Matrix .XLSX
              </Button>
              <Button
                size="sm"
                className="bg-violet-600 hover:bg-violet-700"
                disabled={matrixLoading || !tenantId}
                onClick={() => void instantLoadMatrix()}
              >
                {matrixLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                Instant 1-Click Load
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
                {result.resourcesInserted} new material{result.resourcesInserted === 1 ? "" : "s"}, {result.attrsInserted} record{result.attrsInserted === 1 ? "" : "s"} enriched,{" "}
                {result.pricesInserted} price{result.pricesInserted === 1 ? "" : "s"} recorded,{" "}
                {result.resourcesSkipped + result.attrsSkipped} already present, {result.failed} failed.
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

