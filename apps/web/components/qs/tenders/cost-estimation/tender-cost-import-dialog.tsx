"use client";

import { useState, useCallback, useRef } from "react";
import { X, Upload, Download, FileSpreadsheet, Loader2, CheckCircle2, AlertCircle, AlertTriangle, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { getBudgetCodes, bulkInsertPriceList, bulkInsertBoqItems } from "@/lib/qs/tender-cost-service";

type Mode = "price_list" | "boq";
type Step = "upload" | "preview" | "importing" | "done";

const PRICE_LIST_COLUMNS = [
  "item_code", "section", "sub_section", "sub_element", "description", "unit",
  "labor_net_cost", "labor_margin_pct", "material_net_cost", "material_margin_pct",
  "basis_source", "budget_code",
];

const BOQ_COLUMNS = [
  "discipline", "budget_code", "building_code", "level", "section", "sub_section", "sub_element",
  "material_type", "element_group", "element_id", "description", "brand", "supplier", "unit",
  "quantity", "actual_quantity", "labor_net_cost", "labor_margin_pct", "material_net_cost",
  "material_margin_pct", "package_name",
];

interface PriceListRow {
  _row: number;
  item_code: string;
  section: string;
  sub_section: string;
  sub_element: string;
  description: string;
  unit: string;
  labor_net_cost: number;
  labor_margin_pct: number;
  material_net_cost: number;
  material_margin_pct: number;
  basis_source: string;
  budget_code: string;
  errors: string[];
}

interface BoqRow {
  _row: number;
  discipline: string;
  budget_code: string;
  building_code: string;
  level: string;
  section: string;
  sub_section: string;
  sub_element: string;
  material_type: string;
  element_group: string;
  element_id: string;
  description: string;
  notes: string;
  brand: string;
  supplier: string;
  unit: string;
  quantity: number;
  actual_quantity: number | null;
  labor_net_cost: number | null;
  labor_margin_pct: number | null;
  material_net_cost: number | null;
  material_margin_pct: number | null;
  package_name: string;
  errors: string[];
}

interface TenderCostImportDialogProps {
  tenderId: string;
  initialMode?: Mode;
  onClose: () => void;
  onImported: () => void;
}

export function TenderCostImportDialog({ tenderId, initialMode = "boq", onClose, onImported }: TenderCostImportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [priceListRows, setPriceListRows] = useState<PriceListRow[]>([]);
  const [boqRows, setBoqRows] = useState<BoqRow[]>([]);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [importedCount, setImportedCount] = useState(0);

  function buildColumnMap(headers: string[], expected: string[]): Map<string, string> {
    const colMap = new Map<string, string>();
    for (const h of expected) {
      const found = headers.find((k) => k.toLowerCase().replace(/[\s_-]/g, "") === h.toLowerCase().replace(/_/g, ""));
      if (found) colMap.set(h, found);
    }
    return colMap;
  }

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
      const budgetCodes = await getBudgetCodes();
      const validCodes = new Set(budgetCodes.map((c) => c.code));

      if (mode === "price_list") {
        const colMap = buildColumnMap(headers, PRICE_LIST_COLUMNS);
        const getCol = (r: Record<string, string>, key: string): string => {
          const mapped = colMap.get(key);
          return mapped ? String(r[mapped] ?? "").trim() : "";
        };

        const parsed: PriceListRow[] = [];
        const seenCodes = new Set<string>();
        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const errs: string[] = [];
          const item_code = getCol(r, "item_code");
          const description = getCol(r, "description");
          const unit = getCol(r, "unit") || "ea";
          const budget_code = getCol(r, "budget_code").toUpperCase();

          if (!item_code) errs.push("item_code is required");
          if (!description) errs.push("description is required");
          if (budget_code && !validCodes.has(budget_code)) errs.push(`budget_code "${budget_code}" not found`);
          if (item_code && seenCodes.has(item_code)) errs.push(`Duplicate item_code "${item_code}" within file`);
          seenCodes.add(item_code);

          const num = (key: string) => {
            const v = getCol(r, key);
            const n = v ? parseFloat(v) : 0;
            return isNaN(n) ? 0 : n;
          };
          // Source workbook stores margins as fractions (0.2 = 20%); this schema stores
          // margin_pct as a whole-number percentage (20), matching overhead_pct/profit_pct
          // elsewhere in the codebase — convert on the way in.
          const pct = (key: string) => num(key) * 100;

          parsed.push({
            _row: i + 2,
            item_code,
            section: getCol(r, "section"),
            sub_section: getCol(r, "sub_section"),
            sub_element: getCol(r, "sub_element"),
            description,
            unit,
            labor_net_cost: num("labor_net_cost"),
            labor_margin_pct: pct("labor_margin_pct"),
            material_net_cost: num("material_net_cost"),
            material_margin_pct: pct("material_margin_pct"),
            basis_source: getCol(r, "basis_source"),
            budget_code,
            errors: errs,
          });
        }
        setPriceListRows(parsed);
      } else {
        const colMap = buildColumnMap(headers, BOQ_COLUMNS);
        const getCol = (r: Record<string, string>, key: string): string => {
          const mapped = colMap.get(key);
          return mapped ? String(r[mapped] ?? "").trim() : "";
        };

        const parsed: BoqRow[] = [];
        for (let i = 0; i < raw.length; i++) {
          const r = raw[i];
          const errs: string[] = [];
          const budget_code = getCol(r, "budget_code").toUpperCase();
          const unit = getCol(r, "unit");
          const quantityRaw = getCol(r, "quantity");
          const quantity = quantityRaw ? parseFloat(quantityRaw) : NaN;

          // Description mapping rule: material_type wins when non-blank (this workbook's
          // "Description" column is blank for ~96% of rows — the real text lives in
          // Material Type); the rare non-blank Description value becomes a remark/note.
          const materialType = getCol(r, "material_type");
          const descriptionCol = getCol(r, "description");
          const description = materialType || descriptionCol;
          const notes = materialType && descriptionCol ? descriptionCol : "";

          if (!description) errs.push("description (or material_type) is required");
          if (!unit) errs.push("unit is required");
          if (budget_code && !validCodes.has(budget_code)) errs.push(`budget_code "${budget_code}" not found`);
          else if (!budget_code) errs.push("budget_code is required");
          if (!quantityRaw || isNaN(quantity)) errs.push(`quantity "${quantityRaw}" is not a valid number`);

          const num = (key: string): number | null => {
            const v = getCol(r, key);
            if (!v) return null;
            const n = parseFloat(v);
            return isNaN(n) ? null : n;
          };
          // Source workbook stores margins as fractions (0.2 = 20%); this schema stores
          // margin_pct as a whole-number percentage (20) — convert on the way in.
          const pct = (key: string): number | null => {
            const n = num(key);
            return n === null ? null : n * 100;
          };

          parsed.push({
            _row: i + 2,
            discipline: getCol(r, "discipline"),
            budget_code,
            building_code: getCol(r, "building_code") || "BA",
            level: getCol(r, "level") || "All",
            section: getCol(r, "section"),
            sub_section: getCol(r, "sub_section"),
            sub_element: getCol(r, "sub_element"),
            material_type: materialType,
            element_group: getCol(r, "element_group"),
            element_id: getCol(r, "element_id"),
            description,
            notes,
            brand: getCol(r, "brand"),
            supplier: getCol(r, "supplier"),
            unit,
            quantity: isNaN(quantity) ? 0 : quantity,
            actual_quantity: num("actual_quantity"),
            labor_net_cost: num("labor_net_cost"),
            labor_margin_pct: pct("labor_margin_pct"),
            material_net_cost: num("material_net_cost"),
            material_margin_pct: pct("material_margin_pct"),
            package_name: getCol(r, "package_name"),
            errors: errs,
          });
        }
        setBoqRows(parsed);
      }

      setStep("preview");
    } catch (e) {
      toast.error("Failed to parse file: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  }, [mode]);

  const validPriceListRows = priceListRows.filter((r) => r.errors.length === 0);
  const invalidPriceListRows = priceListRows.filter((r) => r.errors.length > 0);
  const validBoqRows = boqRows.filter((r) => r.errors.length === 0);
  const invalidBoqRows = boqRows.filter((r) => r.errors.length > 0);

  async function handleImport() {
    if (mode === "price_list") {
      if (validPriceListRows.length === 0) return;
      setStep("importing");
      setProgress({ current: 0, total: validPriceListRows.length });
      try {
        const budgetCodes = await getBudgetCodes();
        const codeToId = new Map(budgetCodes.map((c) => [c.code, c.id]));
        const count = await bulkInsertPriceList(
          tenderId,
          validPriceListRows.map((r) => ({
            item_code: r.item_code,
            section: r.section || null,
            sub_section: r.sub_section || null,
            sub_element: r.sub_element || null,
            description: r.description,
            unit: r.unit,
            labor_net_cost: r.labor_net_cost,
            labor_margin_pct: r.labor_margin_pct,
            material_net_cost: r.material_net_cost,
            material_margin_pct: r.material_margin_pct,
            basis_source: r.basis_source || null,
            budget_code_id: r.budget_code ? codeToId.get(r.budget_code) ?? null : null,
          }))
        );
        setImportedCount(count);
        setProgress({ current: count, total: count });
        toast.success(`Imported ${count} Price List item(s)`);
        setStep("done");
      } catch (e) {
        toast.error("Import failed: " + (e instanceof Error ? e.message : "Unknown error"));
        setStep("preview");
      }
    } else {
      if (validBoqRows.length === 0) return;
      setStep("importing");
      setProgress({ current: 0, total: validBoqRows.length });
      try {
        const budgetCodes = await getBudgetCodes();
        const codeToId = new Map(budgetCodes.map((c) => [c.code, c.id]));

        // Synthesize item_code as {budget_code}.{seq} per budget code group, in file order —
        // the source workbook has no natural item code (Nº / PTB Code are always blank).
        const seqByCode = new Map<string, number>();
        const rows = validBoqRows.map((r) => {
          const seq = (seqByCode.get(r.budget_code) ?? 0) + 1;
          seqByCode.set(r.budget_code, seq);
          return {
            section: r.section,
            item_code: `${r.budget_code}.${String(seq).padStart(3, "0")}`,
            description: r.description,
            unit: r.unit,
            quantity: r.quantity,
            discipline: r.discipline || null,
            budget_code_id: codeToId.get(r.budget_code) ?? null,
            building_code: r.building_code,
            level: r.level,
            sub_section: r.sub_section || null,
            sub_element: r.sub_element || null,
            material_type: r.material_type || null,
            element_group: r.element_group || null,
            element_id: r.element_id || null,
            brand: r.brand || null,
            supplier: r.supplier || null,
            package_name: r.package_name || null,
            actual_quantity: r.actual_quantity,
            notes: r.notes || null,
            labor_net_cost: r.labor_net_cost,
            labor_margin_pct: r.labor_margin_pct,
            material_net_cost: r.material_net_cost,
            material_margin_pct: r.material_margin_pct,
          };
        });

        const count = await bulkInsertBoqItems(tenderId, rows);
        setImportedCount(count);
        setProgress({ current: count, total: count });
        toast.success(`Imported ${count} BOQ item(s)`);
        setStep("done");
      } catch (e) {
        toast.error("Import failed: " + (e instanceof Error ? e.message : "Unknown error"));
        setStep("preview");
      }
    }
  }

  function downloadTemplate() {
    const wb = XLSX.utils.book_new();
    if (mode === "price_list") {
      const data = [
        PRICE_LIST_COLUMNS,
        ["PL-001", "Sub Structure", "Bored Pile", "Concrete", "Normal Concrete, 35Mpa (Cylinder)", "m3", "8", "0.2", "98", "0.12", "Ready-mix C35", "B.01"],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Price List");
      XLSX.writeFile(wb, "tender-price-list-template.xlsx");
    } else {
      const data = [
        BOQ_COLUMNS,
        ["Civil and Structure", "B.01", "BA", "01.UG", "Sub Structure", "Bored Pile", "Concrete", "Normal Concrete, 35Mpa (Cylinder)", "", "", "", "", "", "m3", "374.16", "374.16", "8", "0.2", "98", "0.12", ""],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), "Raw Data");
      XLSX.writeFile(wb, "tender-boq-raw-data-template.xlsx");
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function switchMode(next: Mode) {
    setMode(next);
    setStep("upload");
    setPriceListRows([]);
    setBoqRows([]);
    setFileName("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-4xl rounded-2xl bg-white shadow-2xl border border-slate-200 p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import Tender Cost Data</h2>
            <p className="text-xs text-slate-500 mt-0.5">Upload a Price List or Raw Data / BOQ spreadsheet</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 mb-4 rounded-lg bg-slate-100 p-1 text-xs w-fit">
          <button
            onClick={() => switchMode("boq")}
            className={cn("px-3 py-1.5 rounded-md font-medium transition-colors", mode === "boq" ? "bg-white shadow text-slate-900" : "text-slate-500")}
          >
            Raw Data / BOQ
          </button>
          <button
            onClick={() => switchMode("price_list")}
            className={cn("px-3 py-1.5 rounded-md font-medium transition-colors", mode === "price_list" ? "bg-white shadow text-slate-900" : "text-slate-500")}
          >
            Price List
          </button>
        </div>

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
              <p className="text-xs font-semibold text-slate-700 mb-2">
                {mode === "boq" ? "Required columns (Raw Data / BOQ)" : "Required columns (Price List)"}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-xs">
                {(mode === "boq" ? BOQ_COLUMNS : PRICE_LIST_COLUMNS).map((col) => (
                  <div key={col} className="rounded-lg bg-white border border-slate-100 px-2.5 py-1.5">
                    <code className="font-semibold text-slate-800">{col}</code>
                  </div>
                ))}
              </div>
              {mode === "boq" && (
                <p className="mt-2 text-xs text-slate-400">
                  If your sheet leaves <code>description</code> blank and puts the item text in <code>material_type</code> instead (common in Excel take-offs),
                  it&apos;s handled automatically — <code>material_type</code> wins when present, and any leftover <code>description</code> value is kept as a note.
                  <code>budget_code</code> must match an existing Budget Code (e.g. <code>B.01</code>). An <code>item_code</code> is generated automatically per row.
                </p>
              )}
              <p className="mt-2 text-xs text-slate-400">
                <code>labor_margin_pct</code> / <code>material_margin_pct</code> are entered as a fraction, e.g. <code>0.2</code> for a 20% margin (matching typical Excel take-off sheets).
              </p>
              <Button variant="outline" size="sm" className="rounded-xl text-xs mt-3" onClick={downloadTemplate}>
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
                <p className="text-sm font-medium text-slate-700">Drop your spreadsheet here</p>
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

        {step === "preview" && mode === "price_list" && (
          <PriceListPreview
            rows={priceListRows}
            validRows={validPriceListRows}
            invalidRows={invalidPriceListRows}
            fileName={fileName}
            fileInputRef={fileInputRef}
            onFile={handleFile}
            onCancel={onClose}
            onImport={handleImport}
          />
        )}

        {step === "preview" && mode === "boq" && (
          <BoqPreview
            rows={boqRows}
            validRows={validBoqRows}
            invalidRows={invalidBoqRows}
            fileName={fileName}
            fileInputRef={fileInputRef}
            onFile={handleFile}
            onCancel={onClose}
            onImport={handleImport}
          />
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            <p className="text-sm text-slate-600">Importing…</p>
            <div className="w-48 h-1.5 rounded-full bg-slate-200 overflow-hidden">
              <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }} />
            </div>
            <p className="text-xs text-slate-400">{progress.current} / {progress.total}</p>
          </div>
        )}

        {step === "done" && (
          <div className="flex flex-col items-center justify-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">Import complete</p>
            <p className="text-xs text-slate-500">{importedCount} row(s) imported successfully</p>
            <Button size="sm" className="rounded-xl mt-2" onClick={() => { onImported(); onClose(); }}>
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function PriceListPreview({ rows, validRows, invalidRows, fileName, fileInputRef, onFile, onCancel, onImport }: {
  rows: PriceListRow[]; validRows: PriceListRow[]; invalidRows: PriceListRow[]; fileName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File | null) => void; onCancel: () => void; onImport: () => void;
}) {
  return (
    <div className="space-y-3">
      <PreviewHeader rows={rows} invalidRows={invalidRows} fileName={fileName} fileInputRef={fileInputRef} onFile={onFile} />
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Code</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 font-medium">Total Rate</th>
              <th className="px-3 py-2 font-medium">Budget Code</th>
              <th className="px-3 py-2 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._row} className={cn("border-t border-slate-100", r.errors.length > 0 ? "bg-amber-50/50" : "")}>
                <td className="px-3 py-1.5 text-slate-400">{r._row}</td>
                <td className="px-3 py-1.5 font-mono font-medium">{r.item_code || "—"}</td>
                <td className="px-3 py-1.5">{r.description || "—"}</td>
                <td className="px-3 py-1.5 text-slate-400">{r.unit}</td>
                <td className="px-3 py-1.5">
                  {(r.labor_net_cost * (1 + r.labor_margin_pct / 100) + r.material_net_cost * (1 + r.material_margin_pct / 100)).toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-slate-400">{r.budget_code || "—"}</td>
                <td className="px-3 py-1.5"><ErrorBadge errors={r.errors} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorList invalidRows={invalidRows} keyOf={(r) => r.item_code} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="rounded-xl text-xs" disabled={validRows.length === 0} onClick={onImport}>
          Import {validRows.length} row(s)
        </Button>
      </div>
    </div>
  );
}

function BoqPreview({ rows, validRows, invalidRows, fileName, fileInputRef, onFile, onCancel, onImport }: {
  rows: BoqRow[]; validRows: BoqRow[]; invalidRows: BoqRow[]; fileName: string;
  fileInputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File | null) => void; onCancel: () => void; onImport: () => void;
}) {
  return (
    <div className="space-y-3">
      <PreviewHeader rows={rows} invalidRows={invalidRows} fileName={fileName} fileInputRef={fileInputRef} onFile={onFile} />
      <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">Budget Code</th>
              <th className="px-3 py-2 font-medium">Level</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 font-medium">Qty</th>
              <th className="px-3 py-2 font-medium">Errors</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._row} className={cn("border-t border-slate-100", r.errors.length > 0 ? "bg-amber-50/50" : "")}>
                <td className="px-3 py-1.5 text-slate-400">{r._row}</td>
                <td className="px-3 py-1.5 font-mono font-medium">{r.budget_code || "—"}</td>
                <td className="px-3 py-1.5 text-slate-400">{r.level}</td>
                <td className="px-3 py-1.5 truncate max-w-[220px]" title={r.description}>{r.description || "—"}</td>
                <td className="px-3 py-1.5 text-slate-400">{r.unit || "—"}</td>
                <td className="px-3 py-1.5">{r.quantity}</td>
                <td className="px-3 py-1.5"><ErrorBadge errors={r.errors} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ErrorList invalidRows={invalidRows} keyOf={(r) => r.description || "(blank)"} />
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={onCancel}>Cancel</Button>
        <Button size="sm" className="rounded-xl text-xs" disabled={validRows.length === 0} onClick={onImport}>
          Import {validRows.length} row(s)
        </Button>
      </div>
    </div>
  );
}

function PreviewHeader<T extends { errors: string[] }>({ rows, invalidRows, fileName, fileInputRef, onFile }: {
  rows: T[]; invalidRows: T[]; fileName: string; fileInputRef: React.RefObject<HTMLInputElement | null>; onFile: (f: File | null) => void;
}) {
  return (
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
        <Button variant="outline" size="sm" className="rounded-xl text-xs" onClick={() => fileInputRef.current?.click()}>Change File</Button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </div>
    </div>
  );
}

function ErrorBadge({ errors }: { errors: string[] }) {
  if (errors.length === 0) return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
  return (
    <span className="inline-flex items-center gap-0.5 text-amber-600" title={errors.join("; ")}>
      <AlertCircle className="h-3 w-3 shrink-0" /><span>{errors.length}</span>
    </span>
  );
}

function ErrorList<T extends { _row: number; errors: string[] }>({ invalidRows, keyOf }: { invalidRows: T[]; keyOf: (r: T) => string }) {
  if (invalidRows.length === 0) return null;
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
      <p className="text-xs font-semibold text-amber-800 mb-1">Validation errors</p>
      <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
        {invalidRows.slice(0, 10).map((r) => (
          <li key={r._row}>Row {r._row} ({keyOf(r)}): {r.errors.join("; ")}</li>
        ))}
        {invalidRows.length > 10 && <li className="text-amber-500">...and {invalidRows.length - 10} more</li>}
      </ul>
    </div>
  );
}

function cn(...inputs: (string | boolean | undefined | null)[]): string {
  return inputs.filter(Boolean).join(" ");
}
