// Cost & Rate Library — controlled Excel import: pure parse + validate.
// No React, no Supabase — testable transform of a SheetJS workbook into
// typed rows + a list of issues. DB reconciliation and the actual inserts
// live in dwl-material-import-page.tsx.
//
// Mapping reference: the workbook's own `11_DB_Mapping` sheet and
// DCOS-DS-12-012 §5. Coding remap and unit normalisation per QS-SOP-004 §5.

import * as XLSX from "xlsx";
import type { WorkBook } from "xlsx";
import { DWL_LABOR_SKILL_LEVELS, DWL_UNITS, type DwlCategory, type DwlLaborSkillLevel, type DwlSourceType } from "@/components/qs/dwl-types";

export type IssueLevel = "error" | "warn";
export interface ImportIssue {
  sheet: string;
  row: number | null; // spreadsheet row number (1-based), null = sheet-level
  level: IssueLevel;
  message: string;
}

// ── code validation ────────────────────────────────────────────────────
// Material Master coding standard — standardized 2026-09-15 (QS Manager
// decision, see migration 20260910000030_dwl_material_code_standardize.sql):
// MAT-<GROUP>-<NNN>, e.g. MAT-CEIL-001. Group is derived from Category (or
// Discipline) at creation time by dwl-material-form-dialog.tsx / the
// standardization migration — this parser only validates the syntactic
// shape of an already-assigned code, it does not compute one.
const DWL_CODE_RE = /^MAT-[A-Z]{2,6}-\d{3}$/;
export function remapMaterialCode(raw: string): { code: string | null; legacy: string } {
  const legacy = String(raw ?? "").trim();
  const upper = legacy.toUpperCase();
  if (DWL_CODE_RE.test(upper)) return { code: upper, legacy: "" };
  return { code: null, legacy };
}

// ── unit normalisation ─────────────────────────────────────────────────
const UNIT_MAP: Record<string, string> = {
  "m²": "m2", "m2": "m2", sqm: "m2", "sq.m": "m2",
  "m³": "m3", m3: "m3", cbm: "m3",
  lm: "m", "l.m": "m", length: "m", "lin.m": "m", rm: "m", m: "m",
  "no.": "no", nr: "no", no: "no", nos: "no", each: "no", ea: "no",
  pc: "pcs", pcs: "pcs", piece: "pcs",
  set: "set", bag: "bag", box: "box", roll: "roll", sheet: "sheet", trip: "trip",
  kg: "kg", ton: "tonne", tonne: "tonne", t: "tonne",
  ltr: "l", litre: "l", liter: "l", l: "l",
  hr: "hr", hour: "hr", day: "day", wk: "week", week: "week",
  mo: "month", month: "month", ls: "ls", "lump sum": "ls", "%": "%",
};
const LOCKED = new Set<string>(DWL_UNITS as readonly string[]);
export function normalizeUnit(raw: unknown): { unit: string; known: boolean } {
  const s = String(raw ?? "").trim();
  if (!s) return { unit: "", known: false };
  const mapped = UNIT_MAP[s.toLowerCase()] ?? s;
  return { unit: mapped, known: LOCKED.has(mapped) };
}

export const IMPORT_CURRENCIES = new Set(["USD", "KHR", "EUR", "THB", "VND", "CNY", "SGD", "JPY"]);

export function ratingBand(v: unknown): "A" | "B" | "C" {
  const x = Number(v);
  if (Number.isFinite(x) && x >= 4.5) return "A";
  if (Number.isFinite(x) && x >= 3.5) return "B";
  return "C";
}

export function toIsoDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, ]/g, ""));
  return Number.isFinite(n) ? n : null;
}

// ── header-driven sheet reader ─────────────────────────────────────────
const norm = (h: unknown) => String(h ?? "").toLowerCase().replace(/[\s_\-/().]/g, "");

type Aoa = unknown[][];

export function readSheet(aoa: Aoa, anchorHeader: string, requireFirstCol = true): { headers: string[]; rows: { _row: number; cells: Record<string, unknown> }[] } {
  const anchor = norm(anchorHeader);
  let hIdx = -1;
  for (let i = 0; i < Math.min(aoa.length, 12); i++) {
    if ((aoa[i] || []).some((c) => norm(c) === anchor)) { hIdx = i; break; }
  }
  if (hIdx < 0) return { headers: [], rows: [] };
  const headers = (aoa[hIdx] || []).map((c) => String(c ?? "").trim());
  const rows: { _row: number; cells: Record<string, unknown> }[] = [];
  for (let i = hIdx + 1; i < aoa.length; i++) {
    const r = aoa[i] || [];
    if (r.every((c) => c == null || String(c).trim() === "")) continue;
    if (requireFirstCol && (r[0] == null || String(r[0]).trim() === "")) continue; // first col is always a code/id
    const cells: Record<string, unknown> = {};
    headers.forEach((h, ci) => { if (h) cells[norm(h)] = r[ci] ?? null; });
    rows.push({ _row: i + 1, cells });
  }
  return { headers, rows };
}
export const get = (cells: Record<string, unknown>, ...aliases: string[]) => {
  for (const a of aliases) { const v = cells[norm(a)]; if (v != null && String(v).trim() !== "") return v; }
  return null;
};
export const str = (v: unknown) => (v == null ? null : String(v).trim() || null);

// ── typed output rows ─────────────────────────────────────────────────
export interface MaterialRow {
  _row: number; code: string; legacy_code: string | null; material_name: string;
  description: string; unit: string; category: string;
  attrs: Record<string, string | null>;
}
export interface SpecRow {
  _row: number; spec_code: string; material_code: string; spec_name: string;
  revision_no: string; effective_date: string | null;
  rev: Record<string, string | null>;
}
export interface SupplierRow {
  _row: number; name: string; contact: string | null; rating: "A" | "B" | "C";
  profile: Record<string, string | number | null>;
}
export interface SupplierMaterialRow {
  _row: number; supplier_name: string | null; supplier_code: string | null;
  material_code: string; supplier_product_code: string | null; supplier_product_name: string | null;
  brand: string | null; manufacturer: string | null; specification: string | null;
  package_size: string | null; moq: number | null; lead_time_days: number | null;
  is_active: boolean;
}
export interface PriceRow {
  _row: number; price_id: string | null; material_code: string; supplier_name: string | null;
  supplier_code: string | null; approved: boolean;
  unit_price: number; currency: string; valid_from: string | null; quote_valid_until: string | null;
  quantity: number | null; discount: number; delivery_cost: number; handling_cost: number;
  other_charges: number; tax_amount: number; payment_terms: string | null; delivery_terms: string | null;
  lead_time_days: number | null; location: string | null; source_document: string | null;
  quotation_ref: string | null; quotation_date: string | null; project_code: string | null;
  price_status: string; notes: string;
}
export interface QuotationRow {
  _row: number; quote_no: string; supplier_name: string | null; project_code: string | null;
  rfq_ref: string | null; quote_date: string | null; valid_until: string | null; currency: string;
  payment_terms: string | null; delivery_terms: string | null; contact_person: string | null;
  source_document: string | null; status: string; notes: string | null;
}
export interface QuotationItemRow {
  _row: number; quote_no: string; line_no: number; material_code: string;
  supplier_product_code: string | null; description: string | null; spec_ref: string | null;
  quantity: number | null; unit: string; unit_price: number; discount: number; delivery: number;
  tax: number; lead_time_days: number | null; remarks: string | null;
}

export interface ParsedImport {
  materials: MaterialRow[];
  specs: SpecRow[];
  suppliers: SupplierRow[];
  supplierMaterials: SupplierMaterialRow[];
  prices: PriceRow[];
  quotations: QuotationRow[];
  quotationItems: QuotationItemRow[];
  issues: ImportIssue[];
}

export function parseWorkbook(wb: WorkBook): ParsedImport {
  const issues: ImportIssue[] = [];
  const aoaOf = (name: string): Aoa | null => {
    const ws = wb.Sheets[name];
    if (!ws) return null;
    // blankrows: true so the array index maps 1:1 to the spreadsheet row
    // (index i  <->  row i+1). readSheet() does its own emptiness skip, so
    // issue.row numbers stay accurate even with banner/blank rows above.
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  };

  // 01_Material_Master ---------------------------------------------------
  const materials: MaterialRow[] = [];
  const matAoa = aoaOf("01_Material_Master");
  if (!matAoa) issues.push({ sheet: "01_Material_Master", row: null, level: "error", message: "Sheet not found in workbook." });
  else {
    const { rows } = readSheet(matAoa, "Material Code");
    for (const { _row, cells } of rows) {
      const rawCode = str(get(cells, "Material Code"));
      const name = str(get(cells, "Material Name"));
      if (!rawCode) { issues.push({ sheet: "01_Material_Master", row: _row, level: "error", message: "Material Code is required." }); continue; }
      const { code, legacy } = remapMaterialCode(rawCode);
      if (!code) { issues.push({ sheet: "01_Material_Master", row: _row, level: "error", message: `Material Code "${rawCode}" does not match the standardized MAT-<GROUP>-NNN pattern (e.g. MAT-CEIL-001).` }); continue; }
      if (!name) issues.push({ sheet: "01_Material_Master", row: _row, level: "error", message: `${code}: Material Name is required.` });
      const { unit, known } = normalizeUnit(get(cells, "Unit"));
      if (!unit) issues.push({ sheet: "01_Material_Master", row: _row, level: "error", message: `${code}: Unit is required.` });
      else if (!known) issues.push({ sheet: "01_Material_Master", row: _row, level: "warn", message: `${code}: Unit "${unit}" is not in the locked dictionary — imported as-is.` });
      const desc0 = str(get(cells, "Description"));
      const tech = str(get(cells, "Technical Specification (Summary)", "Technical Specification"));
      const description = [name, desc0].filter(Boolean).join(" — ") + (tech ? ` (${tech})` : "");
      if (description.length < 8) issues.push({ sheet: "01_Material_Master", row: _row, level: "warn", message: `${code}: Description is thin — should carry the price-driving spec.` });
      materials.push({
        _row, code, legacy_code: legacy || null, material_name: name ?? code, description, unit,
        category: "material",
        attrs: {
          subcategory: str(get(cells, "Subcategory")), discipline: str(get(cells, "Discipline")),
          material_type: str(get(cells, "Material Type")), tech_spec_summary: tech,
          standard: str(get(cells, "Standard")), grade: str(get(cells, "Grade")),
          brand: str(get(cells, "Brand")), model: str(get(cells, "Model")),
          manufacturer: str(get(cells, "Manufacturer")), package_size: str(get(cells, "Package Size")),
          dimension: str(get(cells, "Dimension / Size", "Dimension")), weight: str(get(cells, "Weight")),
          color_finish: str(get(cells, "Color / Finish", "Colour / Finish")),
          application_element: str(get(cells, "Application / Related Element", "Application")),
          tags: str(get(cells, "Tags")), notes: str(get(cells, "Notes")),
          status: str(get(cells, "Status")),
        },
      });
    }
    const seen = new Set<string>();
    for (const m of materials) {
      if (seen.has(m.code)) issues.push({ sheet: "01_Material_Master", row: m._row, level: "error", message: `Duplicate material code ${m.code} in the file.` });
      seen.add(m.code);
    }
  }
  const matCodes = new Set(materials.map((m) => m.code));
  const legacyToCode = new Map(materials.filter((m) => m.legacy_code).map((m) => [m.legacy_code as string, m.code]));
  const resolveMat = (raw: string | null): string | null => {
    if (!raw) return null;
    const s = raw.trim();
    if (matCodes.has(s)) return s;
    if (legacyToCode.has(s)) return legacyToCode.get(s)!;
    const { code } = remapMaterialCode(s);
    return code && matCodes.has(code) ? code : null;
  };

  // 02_Material_Specification -----------------------------------------
  const specs: SpecRow[] = [];
  const specAoa = aoaOf("02_Material_Specification");
  if (specAoa) {
    const { rows } = readSheet(specAoa, "Specification ID");
    for (const { _row, cells } of rows) {
      const rawId = str(get(cells, "Specification ID"));
      const rawMat = str(get(cells, "Material Code"));
      if (!rawId) { issues.push({ sheet: "02_Material_Specification", row: _row, level: "error", message: "Specification ID is required." }); continue; }
      const mat = resolveMat(rawMat);
      if (!mat) { issues.push({ sheet: "02_Material_Specification", row: _row, level: "error", message: `${rawId}: Material Code "${rawMat}" not found in 01_Material_Master.` }); continue; }
      const revNo = str(get(cells, "Revision")) ?? "R01";
      const specCode = rawId.replace(/-R\d+$/i, "");
      specs.push({
        _row, spec_code: specCode, material_code: mat, spec_name: str(get(cells, "Specification Name")) ?? specCode,
        revision_no: revNo, effective_date: toIsoDate(get(cells, "Effective Date")),
        rev: {
          standard: str(get(cells, "Standard")), grade: str(get(cells, "Grade")),
          strength_performance: str(get(cells, "Strength / Performance")), dimension: str(get(cells, "Dimension")),
          thickness: str(get(cells, "Thickness")), density: str(get(cells, "Density")),
          unit: normalizeUnit(get(cells, "Unit")).unit || null, manufacturer: str(get(cells, "Manufacturer")),
          brand: str(get(cells, "Brand")), technical_req: str(get(cells, "Technical Requirements")),
          installation_req: str(get(cells, "Installation Requirements")), testing_req: str(get(cells, "Testing Requirements")),
          approval_req: str(get(cells, "Approval Requirements")), expiry_date: toIsoDate(get(cells, "Expiry Date")),
          status: (str(get(cells, "Status")) ?? "active").toLowerCase(),
        },
      });
    }
  }

  // 03_Supplier_Master ----------------------------------------------
  const suppliers: SupplierRow[] = [];
  const supAoa = aoaOf("03_Supplier_Master");
  if (supAoa) {
    const { rows } = readSheet(supAoa, "Company Name");
    for (const { _row, cells } of rows) {
      const name = str(get(cells, "Company Name"));
      if (!name) { issues.push({ sheet: "03_Supplier_Master", row: _row, level: "error", message: "Company Name is required." }); continue; }
      suppliers.push({
        _row, name, contact: str(get(cells, "Contact Person")), rating: ratingBand(get(cells, "Supplier Rating (1-5)", "Supplier Rating")),
        profile: {
          supplier_code: str(get(cells, "Supplier Code")), trading_name: str(get(cells, "Trading Name")),
          supplier_type: str(get(cells, "Supplier Type")), contact_person: str(get(cells, "Contact Person")),
          position: str(get(cells, "Position")), phone: str(get(cells, "Phone")), email: str(get(cells, "Email")),
          address: str(get(cells, "Address")), country: str(get(cells, "Country")),
          province_city: str(get(cells, "Province / City")), website: str(get(cells, "Website")),
          payment_terms: str(get(cells, "Payment Terms")), delivery_terms: str(get(cells, "Delivery Terms")),
          credit_terms: str(get(cells, "Credit Terms")), lead_time_days: num(get(cells, "Lead Time (days)", "Lead Time")),
          reliability_rating: str(get(cells, "Reliability Rating")), quality_rating: str(get(cells, "Quality Rating")),
          price_competitiveness: str(get(cells, "Price Competitiveness")), notes: str(get(cells, "Notes")),
        },
      });
    }
    const seen = new Set<string>();
    for (const s of suppliers) {
      if (seen.has(s.name.toLowerCase())) issues.push({ sheet: "03_Supplier_Master", row: s._row, level: "warn", message: `Duplicate supplier name "${s.name}" in the file — will link to one record.` });
      seen.add(s.name.toLowerCase());
    }
  }
  const supNames = new Set(suppliers.map((s) => s.name.toLowerCase()));
  const supCodeToName = new Map(suppliers.filter((s) => s.profile.supplier_code).map((s) => [String(s.profile.supplier_code), s.name]));
  const resolveSup = (name: string | null, code: string | null): string | null => {
    if (name && supNames.has(name.toLowerCase())) return name;
    if (code && supCodeToName.has(code)) return supCodeToName.get(code)!;
    return name; // may still resolve against the DB at import time
  };

  // 04_Supplier_Material ------------------------------------------
  const supplierMaterials: SupplierMaterialRow[] = [];
  const smAoa = aoaOf("04_Supplier_Material");
  if (smAoa) {
    const { rows } = readSheet(smAoa, "Material Code");
    for (const { _row, cells } of rows) {
      const mat = resolveMat(str(get(cells, "Material Code")));
      const supName = str(get(cells, "Supplier Name"));
      const supCode = str(get(cells, "Supplier Code"));
      if (!mat) { issues.push({ sheet: "04_Supplier_Material", row: _row, level: "error", message: `Material Code "${str(get(cells, "Material Code"))}" not found in 01_Material_Master.` }); continue; }
      if (!supName && !supCode) { issues.push({ sheet: "04_Supplier_Material", row: _row, level: "error", message: "Supplier Name or Supplier Code is required." }); continue; }
      const moqRaw = String(get(cells, "Min Order Qty") ?? "").match(/[\d.]+/);
      supplierMaterials.push({
        _row, supplier_name: resolveSup(supName, supCode), supplier_code: supCode, material_code: mat,
        supplier_product_code: str(get(cells, "Supplier Product Code")), supplier_product_name: str(get(cells, "Supplier Product Name")),
        brand: str(get(cells, "Brand")), manufacturer: str(get(cells, "Manufacturer")),
        specification: str(get(cells, "Specification Ref", "Specification")), package_size: str(get(cells, "Package Size")),
        moq: moqRaw ? Number(moqRaw[0]) : null, lead_time_days: num(get(cells, "Lead Time (days)", "Lead Time")),
        is_active: String(get(cells, "Active / Inactive", "Active") ?? "active").toLowerCase() !== "inactive",
      });
    }
  }

  // 05_Price_History --------------------------------------------
  const prices: PriceRow[] = [];
  const priceAoa = aoaOf("05_Price_History");
  if (priceAoa) {
    const { rows } = readSheet(priceAoa, "Price ID");
    for (const { _row, cells } of rows) {
      const mat = resolveMat(str(get(cells, "Material Code")));
      if (!mat) { issues.push({ sheet: "05_Price_History", row: _row, level: "error", message: `Material Code "${str(get(cells, "Material Code"))}" not found in 01_Material_Master.` }); continue; }
      const basic = num(get(cells, "Basic Unit Price"));
      if (basic == null) { issues.push({ sheet: "05_Price_History", row: _row, level: "error", message: "Basic Unit Price is required and must be numeric." }); continue; }
      if (basic < 0) issues.push({ sheet: "05_Price_History", row: _row, level: "error", message: `Negative Basic Unit Price (${basic}).` });
      const ccy = (str(get(cells, "Currency")) ?? "USD").toUpperCase();
      if (!IMPORT_CURRENCIES.has(ccy)) issues.push({ sheet: "05_Price_History", row: _row, level: "error", message: `Currency "${ccy}" is not in the allowed list.` });
      const vf = toIsoDate(get(cells, "Effective Date")) ?? toIsoDate(get(cells, "Date"));
      if (!vf) issues.push({ sheet: "05_Price_History", row: _row, level: "error", message: "Effective Date (or Date) is required and must be a valid date." });
      const approvalStatus = String(get(cells, "Approval Status") ?? get(cells, "Price Status") ?? "").toUpperCase();
      const approved = approvalStatus === "APPROVED";
      const priceId = str(get(cells, "Price ID"));
      prices.push({
        _row, price_id: priceId, material_code: mat,
        supplier_name: resolveSup(str(get(cells, "Supplier Name")), str(get(cells, "Supplier Code"))),
        supplier_code: str(get(cells, "Supplier Code")), approved,
        unit_price: basic, currency: ccy, valid_from: vf, quote_valid_until: toIsoDate(get(cells, "Expiry Date")),
        quantity: num(get(cells, "Quantity")), discount: num(get(cells, "Discount")) ?? 0,
        delivery_cost: num(get(cells, "Delivery Cost", "Delivery")) ?? 0, handling_cost: num(get(cells, "Handling Cost")) ?? 0,
        other_charges: num(get(cells, "Other Charges")) ?? 0, tax_amount: num(get(cells, "Tax")) ?? 0,
        payment_terms: str(get(cells, "Payment Terms")), delivery_terms: str(get(cells, "Delivery Terms")),
        lead_time_days: num(get(cells, "Lead Time (days)", "Lead Time")), location: str(get(cells, "Location")),
        source_document: str(get(cells, "Source Document")), quotation_ref: str(get(cells, "Quotation No.", "Quotation Number")),
        quotation_date: toIsoDate(get(cells, "Date")), project_code: str(get(cells, "Project Code")),
        price_status: approved ? "approved" : "submitted",
        notes: `[import ${priceId ?? _row}] ${str(get(cells, "Notes")) ?? ""} Basis: imported from Cost & Rate Library template row ${_row}.`.trim(),
      });
    }
  }

  // 06_Quotation_Header ---------------------------------------
  const quotations: QuotationRow[] = [];
  const qhAoa = aoaOf("06_Quotation_Header");
  if (qhAoa) {
    const { rows } = readSheet(qhAoa, "Quotation Number");
    for (const { _row, cells } of rows) {
      const quoteNo = str(get(cells, "Quotation Number", "Quotation No."));
      if (!quoteNo) { issues.push({ sheet: "06_Quotation_Header", row: _row, level: "error", message: "Quotation Number is required." }); continue; }
      const st = String(get(cells, "Status") ?? "").toLowerCase();
      quotations.push({
        _row, quote_no: quoteNo, supplier_name: resolveSup(str(get(cells, "Supplier Name")), str(get(cells, "Supplier Code"))),
        project_code: str(get(cells, "Project Code")), rfq_ref: str(get(cells, "RFQ Number")),
        quote_date: toIsoDate(get(cells, "Quotation Date")), valid_until: toIsoDate(get(cells, "Valid Until")),
        currency: (str(get(cells, "Currency")) ?? "USD").toUpperCase(), payment_terms: str(get(cells, "Payment Terms")),
        delivery_terms: str(get(cells, "Delivery Terms")), contact_person: str(get(cells, "Contact Person")),
        source_document: str(get(cells, "Source Document")),
        status: st === "approved" ? "approved" : st === "rejected" ? "rejected" : "under_review",
        notes: str(get(cells, "Notes")),
      });
    }
  }
  const quoteNos = new Set(quotations.map((q) => q.quote_no));

  // 07_Quotation_Items --------------------------------------
  const quotationItems: QuotationItemRow[] = [];
  const qiAoa = aoaOf("07_Quotation_Items");
  if (qiAoa) {
    const { rows } = readSheet(qiAoa, "Quotation No.");
    for (const { _row, cells } of rows) {
      const quoteNo = str(get(cells, "Quotation No.", "Quotation Number", "Quotation ID"));
      const mat = resolveMat(str(get(cells, "Material Code")));
      if (!quoteNo || !quoteNos.has(quoteNo)) { issues.push({ sheet: "07_Quotation_Items", row: _row, level: "error", message: `Quotation "${quoteNo}" not found in 06_Quotation_Header.` }); continue; }
      if (!mat) { issues.push({ sheet: "07_Quotation_Items", row: _row, level: "error", message: `Material Code "${str(get(cells, "Material Code"))}" not found in 01_Material_Master.` }); continue; }
      quotationItems.push({
        _row, quote_no: quoteNo, line_no: num(get(cells, "Item No.")) ?? _row, material_code: mat,
        supplier_product_code: str(get(cells, "Supplier Product Code")), description: str(get(cells, "Description")),
        spec_ref: str(get(cells, "Specification")), quantity: num(get(cells, "Quantity")),
        unit: normalizeUnit(get(cells, "Unit")).unit || "no", unit_price: num(get(cells, "Unit Price")) ?? 0,
        discount: num(get(cells, "Discount")) ?? 0, delivery: num(get(cells, "Delivery")) ?? 0,
        tax: num(get(cells, "Tax")) ?? 0, lead_time_days: num(get(cells, "Lead Time (days)", "Lead Time")),
        remarks: str(get(cells, "Remarks")),
      });
    }
  }

  return { materials, specs, suppliers, supplierMaterials, prices, quotations, quotationItems, issues };
}

// ── Material Master "quick import" — a single flat sheet matching the
// Material Master Catalog's own template (Code, Name, Category, Standard,
// Grade, Unit, Brand, Discipline, Cost Code, Application), as opposed to
// the 11-sheet full Cost & Rate Library workbook parsed above. Used by
// dwl-material-import-dialog.tsx (the "Import (Excel/CSV)" action on the
// Material Master Catalog page).
// ─────────────────────────────────────────────────────────────────────────
// Columns added with the Material Register fields (docs/.../16-Material Register.md).
export interface SimpleMaterialExtras {
  material_type: string | null;
  dimension: string | null; // "Size" column
  thickness: string | null;
  density: string | null;
  compressive_strength: string | null;
  color_finish: string | null; // "Colour / Finish" column
  manufacturer: string | null;
  effective_date: string | null; // YYYY-MM-DD
}

export interface SimpleMaterialRow extends SimpleMaterialExtras {
  _row: number;
  // Blank = the database assigns the next code on create. A code that already
  // exists matches that material; one that does not exist is NOT reused for a
  // new material (it is kept as legacy_code) — see dwl_create_material().
  code: string;
  legacy_code: string | null;
  material_name: string;
  category_text: string | null; // matched against dwl_material_categories by code or name at import time
  tech_spec_summary: string | null; // "Specification" column -> dwl_material_attributes.tech_spec_summary
  standard: string | null;
  grade: string | null;
  brand: string | null;
  discipline: string | null;
  unit: string;
  cost_code_text: string | null; // matched against budget_codes.code at import time; left unset if no match
  application_scope: string | null;
  effective_cost: number | null; // "Effective Cost" column -> a new dwl_resource_prices row (currency: USD, source_type: market_survey) on first import only
}

// Excel cells arrive as Date (cellDates) or text; keep the calendar day only.
function dateStr(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseSimpleMaterialSheet(wb: WorkBook): { rows: SimpleMaterialRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) {
    issues.push({ sheet: sheetName ?? "(none)", row: null, level: "error", message: "No sheet found in the file." });
    return { rows: [], issues };
  }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  const { rows: rawRows } = readSheet(aoa, "Code", false); // Code may be blank: auto-assigned
  if (rawRows.length === 0) {
    issues.push({ sheet: sheetName, row: null, level: "error", message: "No \"Code\" column found — is this the Material Master template?" });
    return { rows: [], issues };
  }

  const rows: SimpleMaterialRow[] = [];
  const seen = new Set<string>();
  for (const { _row, cells } of rawRows) {
    const rawCode = str(get(cells, "Code", "Material Code"));
    const name = str(get(cells, "Name", "Material Name"));
    // Code is optional: blank = auto-assigned on create; a non-standard value is kept as legacy_code.
    const { code: stdCode, legacy } = rawCode ? remapMaterialCode(rawCode) : { code: null, legacy: "" };
    const code = stdCode ?? "";
    const label = code || rawCode || `row ${_row}`;
    if (!name) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${label}: Name is required.` }); continue; }
    if (code && seen.has(code)) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `Duplicate code ${code} in the file.` }); continue; }
    if (code) seen.add(code);
    const { unit, known } = normalizeUnit(get(cells, "Unit"));
    if (!unit) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${label}: Unit is required.` }); continue; }
    if (!known) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${label}: Unit "${unit}" is not in the locked dictionary — imported as-is.` });
    rows.push({
      _row, code, legacy_code: legacy || null, material_name: name,
      category_text: str(get(cells, "Category")),
      tech_spec_summary: str(get(cells, "Specification", "Technical Specification", "Technical Specification Requirements")),
      standard: str(get(cells, "Standard")),
      grade: str(get(cells, "Grade")),
      brand: str(get(cells, "Brand")),
      discipline: str(get(cells, "Discipline")),
      unit,
      cost_code_text: str(get(cells, "Cost Code")),
      application_scope: str(get(cells, "Application")),
      effective_cost: num(get(cells, "Effective Cost", "Effective Rate", "Unit Price", "Rate")),
      material_type: str(get(cells, "Type", "Material Type")),
      dimension: str(get(cells, "Size", "Dimension")),
      thickness: str(get(cells, "Thickness")),
      density: str(get(cells, "Density")),
      compressive_strength: str(get(cells, "Compressive Strength")),
      color_finish: str(get(cells, "Colour / Finish", "Color / Finish", "Colour", "Color", "Finish")),
      manufacturer: str(get(cells, "Manufacturer")),
      effective_date: dateStr(get(cells, "Effective Date")),
    });
  }
  return { rows, issues };
}

// ── Supplier Master "quick import" — a single flat sheet matching
// docs/DCOS_Supplier_Master_2026-09-15.xlsx's own column shape (Supplier
// Code, Company Name, Trading Name, Type, Contact Person, Phone, Email,
// City, Country, Payment Terms, Delivery Terms, Lead Time (Days),
// Rating (1-5), Competitiveness, Status). Used by
// dwl-supplier-import-dialog.tsx (the "Import (Excel/CSV)" action on the
// Supplier Master page). Supplier Code is free text (not a locked/parsed
// spine identifier — see 20260910000003's own note), so unlike
// remapMaterialCode() there is no format validation beyond "non-empty".
// ─────────────────────────────────────────────────────────────────────────
export interface SimpleSupplierRow {
  _row: number;
  supplier_code: string;
  company_name: string;
  trading_name: string | null;
  supplier_type: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  country: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  lead_time_days: number | null;
  rating: number | null;
  competitiveness: string | null;
  is_active: boolean;
}

export function parseSimpleSupplierSheet(wb: WorkBook): { rows: SimpleSupplierRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) {
    issues.push({ sheet: sheetName ?? "(none)", row: null, level: "error", message: "No sheet found in the file." });
    return { rows: [], issues };
  }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  const { rows: rawRows } = readSheet(aoa, "Supplier Code");
  if (rawRows.length === 0) {
    issues.push({ sheet: sheetName, row: null, level: "error", message: "No \"Supplier Code\" column found — is this the Supplier Master template?" });
    return { rows: [], issues };
  }

  const rows: SimpleSupplierRow[] = [];
  const seen = new Set<string>();
  for (const { _row, cells } of rawRows) {
    const code = str(get(cells, "Supplier Code", "Code"));
    const name = str(get(cells, "Company Name", "Name"));
    if (!code) { issues.push({ sheet: sheetName, row: _row, level: "error", message: "Supplier Code is required." }); continue; }
    if (!name) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Company Name is required.` }); continue; }
    if (seen.has(code.toUpperCase())) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `Duplicate Supplier Code ${code} in the file.` }); continue; }
    seen.add(code.toUpperCase());
    const rating = num(get(cells, "Rating (1-5)", "Rating", "Star Rating"));
    if (rating != null && (rating < 1 || rating > 5)) {
      issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Rating ${rating} is outside 1-5 — imported as-is.` });
    }
    rows.push({
      _row, supplier_code: code, company_name: name,
      trading_name: str(get(cells, "Trading Name")),
      supplier_type: str(get(cells, "Type", "Vendor Type")),
      contact_person: str(get(cells, "Contact Person")),
      phone: str(get(cells, "Phone", "Phone Number")),
      email: str(get(cells, "Email")),
      city: str(get(cells, "City")),
      country: str(get(cells, "Country")),
      payment_terms: str(get(cells, "Payment Terms")),
      delivery_terms: str(get(cells, "Delivery Terms")),
      lead_time_days: num(get(cells, "Lead Time (Days)", "Lead Time")),
      rating,
      competitiveness: str(get(cells, "Competitiveness", "Price Competitiveness")),
      is_active: String(get(cells, "Status") ?? "active").toLowerCase() !== "inactive",
    });
  }
  return { rows, issues };
}

// ── Cost Item Library "quick import" — a single flat sheet mirroring every
// field on the "Create New Cost Item" dialog's 4 tabs (dwl-cost-item-
// create-dialog.tsx), so a bulk-filled template has full parity with what
// a user could type one item at a time. Category / Work Item Code are left
// as plain text here — resolving them against dwl_material_categories /
// dwl_work_items requires a DB round-trip, done in the import dialog's own
// DB-write function, not this pure parser (same split already used for
// Material Master's supplier/category lookups).
// ─────────────────────────────────────────────────────────────────────────
const ASSEMBLY_CODE_RE = /^ASM-[A-Z]{2,8}-\d{3}$/;
const ASSEMBLY_STATUSES = new Set(["active", "draft", "archived"]);

function splitList(v: unknown): string[] {
  if (v == null) return [];
  return String(v).split("|").map((s) => s.trim()).filter(Boolean);
}

export interface SimpleCostItemRow {
  _row: number;
  code: string;
  name: string;
  short_description: string | null;
  category_text: string | null;
  discipline: string | null;
  unit: string;
  status: "active" | "draft" | "archived";
  scope_of_works: string | null;
  work_item_code: string | null;
  manual_direct_cost: number | null;
  project_overhead_pct: number;
  company_overhead_pct: number;
  risk_pct: number;
  profit_pct: number;
  vat_pct: number;
  thickness: string | null;
  material_core: string | null;
  manufacturer: string | null;
  standard: string | null;
  fire_rating: string | null;
  acoustic_rating: string | null;
  moisture_resistance: string | null;
  surface_finish: string | null;
  installation_method: string | null;
  compliance_notes: string | null;
  assumptions: string[];
  inclusions: string[];
  exclusions: string[];
  field_lessons: string[];
}

export function parseSimpleCostItemSheet(wb: WorkBook): { rows: SimpleCostItemRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) {
    issues.push({ sheet: sheetName ?? "(none)", row: null, level: "error", message: "No sheet found in the file." });
    return { rows: [], issues };
  }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  const { rows: rawRows } = readSheet(aoa, "Code");
  if (rawRows.length === 0) {
    issues.push({ sheet: sheetName, row: null, level: "error", message: "No \"Code\" column found — is this the Cost Item Library template?" });
    return { rows: [], issues };
  }

  const rows: SimpleCostItemRow[] = [];
  const seen = new Set<string>();
  for (const { _row, cells } of rawRows) {
    const rawCode = str(get(cells, "Code"));
    const name = str(get(cells, "Name"));
    if (!rawCode) { issues.push({ sheet: sheetName, row: _row, level: "error", message: "Code is required." }); continue; }
    const code = rawCode.toUpperCase();
    if (!ASSEMBLY_CODE_RE.test(code)) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `Code "${rawCode}" does not match the ASM-GROUP-NNN pattern (e.g. ASM-CEIL-002).` }); continue; }
    if (!name) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Name is required.` }); continue; }
    if (seen.has(code)) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `Duplicate code ${code} in the file.` }); continue; }
    seen.add(code);

    const { unit, known } = normalizeUnit(get(cells, "Unit"));
    if (!unit) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Unit is required.` }); continue; }
    if (!known) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Unit "${unit}" is not in the locked dictionary — imported as-is.` });

    const statusRaw = (str(get(cells, "Status")) ?? "active").toLowerCase();
    if (!ASSEMBLY_STATUSES.has(statusRaw)) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Status "${statusRaw}" is not active/draft/archived — imported as active.` });
    const status = (ASSEMBLY_STATUSES.has(statusRaw) ? statusRaw : "active") as "active" | "draft" | "archived";

    const workItemCode = str(get(cells, "Link to Work Item Code", "Work Item Code"));
    const manualCost = num(get(cells, "Base Direct Cost"));
    if (workItemCode && manualCost != null) {
      issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Both Link to Work Item Code and Base Direct Cost were given — the item will be linked and Base Direct Cost ignored.` });
    }

    rows.push({
      _row, code, name,
      short_description: str(get(cells, "Short Description")),
      category_text: str(get(cells, "Category")),
      discipline: str(get(cells, "Discipline")),
      unit, status,
      scope_of_works: str(get(cells, "Scope of Works")),
      work_item_code: workItemCode,
      manual_direct_cost: manualCost,
      project_overhead_pct: num(get(cells, "Project Overhead %")) ?? 0,
      company_overhead_pct: num(get(cells, "Company Overhead %")) ?? 0,
      risk_pct: num(get(cells, "Risk %")) ?? 0,
      profit_pct: num(get(cells, "Profit %")) ?? 0,
      vat_pct: num(get(cells, "VAT %")) ?? 0,
      thickness: str(get(cells, "Thickness")),
      material_core: str(get(cells, "Material Core/Grade", "Material Core / Grade")),
      manufacturer: str(get(cells, "Manufacturer")),
      standard: str(get(cells, "Standard")),
      fire_rating: str(get(cells, "Fire Rating")),
      acoustic_rating: str(get(cells, "Acoustic Rating")),
      moisture_resistance: str(get(cells, "Moisture Resistance")),
      surface_finish: str(get(cells, "Surface Finish")),
      installation_method: str(get(cells, "Installation Method")),
      compliance_notes: str(get(cells, "Compliance Notes")),
      assumptions: splitList(get(cells, "Assumptions")),
      inclusions: splitList(get(cells, "Inclusions")),
      exclusions: splitList(get(cells, "Exclusions")),
      field_lessons: splitList(get(cells, "Field Lessons")),
    });
  }
  return { rows, issues };
}

export function summarize(p: ParsedImport) {
  return {
    materials: p.materials.length, specs: p.specs.length, suppliers: p.suppliers.length,
    supplierMaterials: p.supplierMaterials.length, prices: p.prices.filter((x) => x.approved).length,
    submissions: p.prices.filter((x) => !x.approved).length,
    quotations: p.quotations.length, quotationItems: p.quotationItems.length,
    errors: p.issues.filter((i) => i.level === "error").length,
    warnings: p.issues.filter((i) => i.level === "warn").length,
  };
}

// ── Price History "quick import" — a single flat sheet mirroring the
// Price History / Direct Works Resources page: one dwl_resources row (any
// category: material/labor/equipment/subcon) plus an optional first price
// row on dwl_resource_prices, matching the fields on dwl-resource-form-
// dialog.tsx and dwl-price-form-dialog.tsx respectively. Supplier is left
// as plain text here — resolved against dwl_suppliers by name at import
// time, same split already used for Category/Work Item Code in the Cost
// Item Library import above.
// ─────────────────────────────────────────────────────────────────────────
const RESOURCE_CATEGORY_PREFIX: Record<DwlCategory, string> = { material: "M", labor: "L", equipment: "E", subcon: "S" };
const RESOURCE_CATEGORIES = new Set<string>(["material", "labor", "equipment", "subcon"]);
const RESOURCE_SOURCE_TYPES = new Set<string>(["quotation", "purchase", "market_survey", "estimate"]);

export interface SimpleResourceRow {
  _row: number;
  category: DwlCategory;
  code: string;
  description: string;
  unit: string;
  spec_reference: string | null;
  is_active: boolean;
  unit_price: number | null;
  currency: string;
  source_type: DwlSourceType;
  supplier_text: string | null;
  valid_from: string | null;
  quote_valid_until: string | null;
  notes: string | null;
}

export function parseSimpleResourceSheet(wb: WorkBook): { rows: SimpleResourceRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) {
    issues.push({ sheet: sheetName ?? "(none)", row: null, level: "error", message: "No sheet found in the file." });
    return { rows: [], issues };
  }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  const { rows: rawRows } = readSheet(aoa, "Code");
  if (rawRows.length === 0) {
    issues.push({ sheet: sheetName, row: null, level: "error", message: "No \"Code\" column found — is this the Price History template?" });
    return { rows: [], issues };
  }

  const rows: SimpleResourceRow[] = [];
  const seen = new Set<string>();
  for (const { _row, cells } of rawRows) {
    const categoryRaw = (str(get(cells, "Category")) ?? "").toLowerCase();
    if (!RESOURCE_CATEGORIES.has(categoryRaw)) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `Category must be one of material/labor/equipment/subcon (got "${categoryRaw}").` });
      continue;
    }
    const category = categoryRaw as DwlCategory;

    const rawCode = str(get(cells, "Code"));
    if (!rawCode) { issues.push({ sheet: sheetName, row: _row, level: "error", message: "Code is required." }); continue; }
    const code = rawCode.toUpperCase();
    const prefix = RESOURCE_CATEGORY_PREFIX[category];
    if (!new RegExp(`^${prefix}-[A-Z]{3}-\\d{3}$`).test(code)) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `Code "${rawCode}" must match ${prefix}-GRP-NNN for category "${category}" (e.g. ${prefix}-CON-001).` });
      continue;
    }
    if (seen.has(code)) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `Duplicate code ${code} in the file.` }); continue; }
    seen.add(code);

    const description = str(get(cells, "Description"));
    if (!description || description.length < 8) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Description must state the price-driving spec (grade, size, class) — at least 8 characters.` });
      continue;
    }

    const { unit, known } = normalizeUnit(get(cells, "Unit"));
    if (!unit) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Unit is required.` }); continue; }
    if (!known) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Unit "${unit}" is not in the locked dictionary — imported as-is.` });

    const unitPrice = num(get(cells, "Unit Price"));
    const sourceRaw = (str(get(cells, "Source Type")) ?? "estimate").toLowerCase();
    if (!RESOURCE_SOURCE_TYPES.has(sourceRaw)) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Source Type "${sourceRaw}" is not quotation/purchase/market_survey/estimate — imported as estimate.` });
    const sourceType = (RESOURCE_SOURCE_TYPES.has(sourceRaw) ? sourceRaw : "estimate") as DwlSourceType;

    rows.push({
      _row, category, code, description, unit,
      spec_reference: str(get(cells, "Spec Reference")),
      is_active: (str(get(cells, "Active")) ?? "yes").toLowerCase() !== "no",
      unit_price: unitPrice,
      currency: (str(get(cells, "Currency")) ?? "USD").toUpperCase(),
      source_type: sourceType,
      supplier_text: str(get(cells, "Supplier")),
      valid_from: toIsoDate(get(cells, "Valid From")) ?? (unitPrice != null ? new Date().toISOString().slice(0, 10) : null),
      quote_valid_until: toIsoDate(get(cells, "Quote Valid Until")),
      notes: str(get(cells, "Notes")),
    });
  }
  return { rows, issues };
}

// ── Labor Rates "quick import" — a single flat sheet mirroring the "Add
// Labor Trade Rate" dialog (dwl-labor-rate-form-dialog.tsx): one
// dwl_resources row (category='labor') + one dwl_labor_rate_attributes row
// + a starting dwl_resource_prices row, all in one line. Same locked
// L-GRP-NNN coding standard, not the mockup's own shorthand.
// ─────────────────────────────────────────────────────────────────────────
const LABOR_CODE_RE = /^L-[A-Z]{3}-\d{3}$/;
const LABOR_RATE_BASIS_UNITS = new Set(["day", "month", "hr"]);
const LABOR_SKILL_LEVELS = new Set<string>(DWL_LABOR_SKILL_LEVELS as readonly string[]);

export interface SimpleLaborRateRow {
  _row: number;
  code: string;
  skill_level: DwlLaborSkillLevel;
  description: string;
  unit: "day" | "month" | "hr";
  daily_basic_rate: number;
  overtime_rate_per_hr: number;
  currency: string;
  standard_productivity_note: string | null;
  is_active: boolean;
}

export function parseSimpleLaborRateSheet(wb: WorkBook): { rows: SimpleLaborRateRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) {
    issues.push({ sheet: sheetName ?? "(none)", row: null, level: "error", message: "No sheet found in the file." });
    return { rows: [], issues };
  }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  const { rows: rawRows } = readSheet(aoa, "Code");
  if (rawRows.length === 0) {
    issues.push({ sheet: sheetName, row: null, level: "error", message: "No \"Code\" column found — is this the Labor Rates template?" });
    return { rows: [], issues };
  }

  const rows: SimpleLaborRateRow[] = [];
  const seen = new Set<string>();
  for (const { _row, cells } of rawRows) {
    const rawCode = str(get(cells, "Code"));
    if (!rawCode) { issues.push({ sheet: sheetName, row: _row, level: "error", message: "Code is required." }); continue; }
    const code = rawCode.toUpperCase();
    if (!LABOR_CODE_RE.test(code)) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `Code "${rawCode}" must match L-GRP-NNN (e.g. L-MAS-001).` });
      continue;
    }
    if (seen.has(code)) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `Duplicate code ${code} in the file.` }); continue; }
    seen.add(code);

    const skillRaw = str(get(cells, "Skill Level"));
    if (!skillRaw || !LABOR_SKILL_LEVELS.has(skillRaw)) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Skill Level must be one of ${DWL_LABOR_SKILL_LEVELS.join("/")} (got "${skillRaw ?? ""}").` });
      continue;
    }
    const skillLevel = skillRaw as DwlLaborSkillLevel;

    const description = str(get(cells, "Trade Description", "Description"));
    if (!description || description.length < 8) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Trade Description must state enough detail — at least 8 characters.` });
      continue;
    }

    const unitRaw = (str(get(cells, "Rate Basis", "Unit")) ?? "day").toLowerCase();
    if (!LABOR_RATE_BASIS_UNITS.has(unitRaw)) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${code}: Rate Basis "${unitRaw}" is not day/month/hr — imported as day.` });
    const unit = (LABOR_RATE_BASIS_UNITS.has(unitRaw) ? unitRaw : "day") as "day" | "month" | "hr";

    const dailyRate = num(get(cells, "Basic Rate", "Daily Basic Rate"));
    if (dailyRate == null || dailyRate < 0) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Basic Rate is required and must be a non-negative number.` }); continue; }
    const otRate = num(get(cells, "Overtime Rate", "Overtime Rate / hr"));
    if (otRate == null || otRate < 0) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${code}: Overtime Rate is required and must be a non-negative number.` }); continue; }

    rows.push({
      _row, code, skill_level: skillLevel, description, unit,
      daily_basic_rate: dailyRate,
      overtime_rate_per_hr: otRate,
      currency: (str(get(cells, "Currency")) ?? "USD").toUpperCase(),
      standard_productivity_note: str(get(cells, "Standard Productivity", "Standard Productivity Constant")),
      is_active: (str(get(cells, "Active")) ?? "yes").toLowerCase() !== "no",
    });
  }
  return { rows, issues };
}

// ── Subcontractor Trade Rates "quick import" — a single flat sheet
// mirroring the "Add Trade Rate" dialog (dwl-subcon-rate-form-dialog.tsx).
// Unlike the other quick imports, a subcon rate item has no explicit Code
// column in the UI — it's matched by (Trade, Item Description), same as
// the dialog's own find-or-create logic, and a brand-new Subcontractor
// (by name) is registered automatically rather than requiring it to exist
// first, since the whole point of a bulk import is not having to register
// every company one at a time beforehand.
// ─────────────────────────────────────────────────────────────────────────
export interface SimpleSubconRateRow {
  _row: number;
  subcontractor_name: string;
  subcontractor_code: string | null;
  trade: string;
  item_description: string;
  rate_type: string;
  unit: string;
  rate: number;
  currency: string;
  effective_date: string;
  scope_notes: string | null;
}

export function parseSimpleSubconRateSheet(wb: WorkBook): { rows: SimpleSubconRateRow[]; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  const sheetName = wb.SheetNames[0];
  const ws = sheetName ? wb.Sheets[sheetName] : null;
  if (!ws) {
    issues.push({ sheet: sheetName ?? "(none)", row: null, level: "error", message: "No sheet found in the file." });
    return { rows: [], issues };
  }
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true }) as Aoa;
  const { rows: rawRows } = readSheet(aoa, "Subcontractor");
  if (rawRows.length === 0) {
    issues.push({ sheet: sheetName, row: null, level: "error", message: "No \"Subcontractor\" column found — is this the Subcontractor Rates template?" });
    return { rows: [], issues };
  }

  const rows: SimpleSubconRateRow[] = [];
  for (const { _row, cells } of rawRows) {
    const subName = str(get(cells, "Subcontractor"));
    if (!subName) { issues.push({ sheet: sheetName, row: _row, level: "error", message: "Subcontractor is required." }); continue; }

    const trade = str(get(cells, "Trade"));
    if (!trade) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${subName}: Trade is required.` }); continue; }

    const itemDescription = str(get(cells, "Scope Description", "Item Description"));
    if (!itemDescription || itemDescription.length < 3) {
      issues.push({ sheet: sheetName, row: _row, level: "error", message: `${subName}: Scope Description is required (min 3 characters).` });
      continue;
    }

    const { unit, known } = normalizeUnit(get(cells, "Unit"));
    if (!unit) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${subName}: Unit is required.` }); continue; }
    if (!known) issues.push({ sheet: sheetName, row: _row, level: "warn", message: `${subName}: Unit "${unit}" is not in the locked dictionary — imported as-is.` });

    const rate = num(get(cells, "Commercial Rate", "Rate"));
    if (rate == null || rate < 0) { issues.push({ sheet: sheetName, row: _row, level: "error", message: `${subName}: Commercial Rate is required and must be a non-negative number.` }); continue; }

    rows.push({
      _row,
      subcontractor_name: subName,
      subcontractor_code: str(get(cells, "Subcontractor Code")),
      trade,
      item_description: itemDescription,
      rate_type: str(get(cells, "Rate Type")) ?? "Unit Rate",
      unit,
      rate,
      currency: (str(get(cells, "Currency")) ?? "USD").toUpperCase(),
      effective_date: toIsoDate(get(cells, "Effective Date")) ?? new Date().toISOString().slice(0, 10),
      scope_notes: str(get(cells, "Scope Notes")),
    });
  }
  return { rows, issues };
}
