import type { createClient } from "@/lib/supabase/client";
import type { SimpleMaterialRow } from "@/components/qs/dwl-import-lib";
import { materialFingerprint } from "@/lib/qs/material-fingerprint";

// Material Master import — compares parsed file rows with the existing
// catalog cell by cell before anything is written. A row whose code already
// exists is not simply "existing": each of its cells is checked, so a new
// Effective Cost or a newly filled field shows up as an update the QS can
// apply. Rows that don't exist yet are new; rows that look like an existing
// material under another code are flagged as possible duplicates.

type Supabase = ReturnType<typeof createClient>;

export interface ExistingMaterial {
  id: string;
  code: string;
  unit: string;
  hasAttributes: boolean;
  legacy_code: string | null;
  material_name: string | null;
  tech_spec_summary: string | null;
  standard: string | null;
  grade: string | null;
  brand: string | null;
  discipline: string | null;
  application_scope: string | null;
  material_type: string | null;
  dimension: string | null;
  thickness: string | null;
  density: string | null;
  compressive_strength: string | null;
  color_finish: string | null;
  manufacturer: string | null;
  effective_date: string | null;
  category_id: string | null;
  budget_code_id: string | null;
  current_price: number | null;
  current_price_date: string | null;
}

export interface MaterialCatalogSnapshot {
  materials: ExistingMaterial[];
  byCode: Map<string, ExistingMaterial>;
  byLegacy: Map<string, ExistingMaterial>;
  byName: Map<string, ExistingMaterial[]>;
  // Same-spec lookup (see lib/qs/material-fingerprint.ts) — "same material = one code".
  byFingerprint: Map<string, ExistingMaterial>;
  categories: { id: string; code: string | null; name: string; specific_element: string | null }[];
  budgetCodes: { id: string; code: string }[];
}

// PostgREST returns at most 1000 rows per request; page through the rest.
async function fetchAll<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await query(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
}

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

type AttrRow = Omit<ExistingMaterial, "id" | "code" | "unit" | "hasAttributes" | "current_price" | "current_price_date"> & { resource_id: string };

export async function loadMaterialCatalogSnapshot(supabase: Supabase): Promise<MaterialCatalogSnapshot> {
  const [resources, attrs, prices, cats, budget] = await Promise.all([
    fetchAll<{ id: string; code: string; unit: string }>((a, b) =>
      supabase.from("dwl_resources").select("id, code, unit").eq("category", "material").order("id").range(a, b)),
    fetchAll<AttrRow>((a, b) =>
      supabase
        .from("dwl_material_attributes")
        .select("resource_id, legacy_code, material_name, tech_spec_summary, standard, grade, brand, discipline, application_scope, material_type, dimension, thickness, density, compressive_strength, color_finish, manufacturer, effective_date, category_id, budget_code_id")
        .order("resource_id")
        .range(a, b)),
    // Same "current price" the Material Master shows: latest price per resource.
    fetchAll<{ resource_id: string; unit_price: number | null; effective_unit_cost: number | null; valid_from: string | null }>((a, b) =>
      supabase.from("dwl_v_current_prices").select("resource_id, unit_price, effective_unit_cost, valid_from").order("resource_id").range(a, b)),
    fetchAll<{ id: string; code: string | null; name: string; specific_element: string | null }>((a, b) =>
      supabase.from("dwl_material_categories").select("id, code, name, specific_element").order("id").range(a, b)),
    fetchAll<{ id: string; code: string }>((a, b) => supabase.from("budget_codes").select("id, code").order("id").range(a, b)),
  ]);

  const attrById = new Map(attrs.map((a) => [a.resource_id, a]));
  const priceById = new Map(prices.map((p) => [p.resource_id, p]));
  const materials: ExistingMaterial[] = resources.map((r) => {
    const a = attrById.get(r.id);
    const p = priceById.get(r.id);
    const price = p ? (p.effective_unit_cost ?? p.unit_price) : null;
    return {
      id: r.id, code: r.code, unit: r.unit, hasAttributes: !!a,
      legacy_code: a?.legacy_code ?? null, material_name: a?.material_name ?? null,
      tech_spec_summary: a?.tech_spec_summary ?? null, standard: a?.standard ?? null, grade: a?.grade ?? null,
      brand: a?.brand ?? null, discipline: a?.discipline ?? null, application_scope: a?.application_scope ?? null,
      material_type: a?.material_type ?? null, dimension: a?.dimension ?? null, thickness: a?.thickness ?? null,
      density: a?.density ?? null, compressive_strength: a?.compressive_strength ?? null,
      color_finish: a?.color_finish ?? null, manufacturer: a?.manufacturer ?? null, effective_date: a?.effective_date ?? null,
      category_id: a?.category_id ?? null, budget_code_id: a?.budget_code_id ?? null,
      current_price: price != null ? Number(price) : null,
      current_price_date: p?.valid_from ?? null,
    };
  });

  const byCode = new Map<string, ExistingMaterial>();
  const byLegacy = new Map<string, ExistingMaterial>();
  const byName = new Map<string, ExistingMaterial[]>();
  const byFingerprint = new Map<string, ExistingMaterial>();
  for (const m of materials) {
    if (m.hasAttributes) {
      const fp = materialFingerprint({ ...m, material_name: m.material_name });
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, m);
    }
    byCode.set(m.code, m);
    if (m.legacy_code) byLegacy.set(m.legacy_code, m);
    const key = normalizeName(m.material_name);
    if (key) byName.set(key, [...(byName.get(key) ?? []), m]);
  }
  return { materials, byCode, byLegacy, byName, byFingerprint, categories: cats, budgetCodes: budget };
}

export function resolveCategory(snapshot: MaterialCatalogSnapshot, text: string | null) {
  if (!text) return null;
  const t = text.trim();
  return snapshot.categories.find((c) => c.code?.toUpperCase() === t.toUpperCase())
    ?? snapshot.categories.find((c) => c.name.toLowerCase() === t.toLowerCase())
    ?? null;
}

export function resolveBudgetCodeId(snapshot: MaterialCatalogSnapshot, text: string | null): string | null {
  if (!text) return null;
  return snapshot.budgetCodes.find((b) => b.code === text.trim())?.id ?? null;
}

export type MaterialRowStatus =
  | "new"                 // not in the catalog — created
  | "update"              // exists, and at least one cell brings new or different data
  | "incomplete"          // resource exists but has no Material Master record — the record is added
  | "possible_duplicate"  // different code, same name as an existing material — skipped unless opted in
  | "unchanged"           // exists and every filled cell matches — nothing to do
  | "invalid";            // failed validation (or a new row with no usable Category / a repeat of an earlier row) — skipped

// Text cells that map 1:1 onto dwl_material_attributes columns.
export const ATTRIBUTE_FIELDS = [
  { key: "material_name", label: "Name" },
  { key: "tech_spec_summary", label: "Specification" },
  { key: "standard", label: "Standard" },
  { key: "grade", label: "Grade" },
  { key: "brand", label: "Brand" },
  { key: "discipline", label: "Discipline" },
  { key: "application_scope", label: "Application" },
  { key: "material_type", label: "Type" },
  { key: "dimension", label: "Size" },
  { key: "thickness", label: "Thickness" },
  { key: "density", label: "Density" },
  { key: "compressive_strength", label: "Compressive Strength" },
  { key: "color_finish", label: "Colour / Finish" },
  { key: "manufacturer", label: "Manufacturer" },
  { key: "effective_date", label: "Effective Date" },
] as const;

export type CellKey = (typeof ATTRIBUTE_FIELDS)[number]["key"] | "category" | "cost_code" | "unit" | "effective_cost";

export interface CellChange {
  key: CellKey;
  label: string;
  file: string;
  existing: string;
  // fill = the catalog cell is empty; change = it has a different value;
  // price = the file's Effective Cost differs from the current price (recorded as a new price, history kept).
  kind: "fill" | "change" | "price";
  // false when the import can't apply it (shown for information only).
  applicable: boolean;
  note?: string;
}

export interface ClassifiedMaterialRow {
  row: SimpleMaterialRow;
  status: MaterialRowStatus;
  matchedBy: "code" | "legacy_code" | "spec" | "name" | null;
  // Why a row is invalid / what happens to it (shown in the comparison table).
  note?: string;
  match: { id: string; code: string; name: string | null; unit: string } | null;
  changes: CellChange[];
}

const blank = (s: string | null | undefined) => (s ?? "").trim() === "";
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

export function formatPrice(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

export function compareCells(row: SimpleMaterialRow, m: ExistingMaterial, snapshot: MaterialCatalogSnapshot): CellChange[] {
  const changes: CellChange[] = [];
  // An empty cell in the file is never a change — the file just doesn't say.
  for (const f of ATTRIBUTE_FIELDS) {
    const file = row[f.key];
    const existing = m[f.key];
    if (blank(file) || same(file, existing)) continue;
    changes.push({ key: f.key, label: f.label, file: file!, existing: existing || "—", kind: blank(existing) ? "fill" : "change", applicable: true });
  }

  if (!blank(row.category_text)) {
    const cat = resolveCategory(snapshot, row.category_text);
    const existingCat = snapshot.categories.find((c) => c.id === m.category_id);
    if (!cat) {
      if (!existingCat || !same(existingCat.name, row.category_text)) {
        changes.push({ key: "category", label: "Category", file: row.category_text!, existing: existingCat?.name ?? "—", kind: existingCat ? "change" : "fill", applicable: false, note: "Not a Material Master category" });
      }
    } else if (cat.id !== m.category_id) {
      changes.push({ key: "category", label: "Category", file: cat.name, existing: existingCat?.name ?? "—", kind: existingCat ? "change" : "fill", applicable: true });
    }
  }

  if (!blank(row.cost_code_text)) {
    const bcId = resolveBudgetCodeId(snapshot, row.cost_code_text);
    const existingBc = snapshot.budgetCodes.find((b) => b.id === m.budget_code_id);
    // Codes that aren't DCOS budget codes (e.g. CSI numbers) can't be linked; don't report them as changes.
    if (bcId && bcId !== m.budget_code_id) {
      changes.push({ key: "cost_code", label: "Cost Code", file: row.cost_code_text!, existing: existingBc?.code ?? "—", kind: existingBc ? "change" : "fill", applicable: true });
    }
  }

  if (!blank(row.unit) && !same(row.unit, m.unit)) {
    changes.push({ key: "unit", label: "Unit", file: row.unit, existing: m.unit, kind: "change", applicable: false, note: "Unit changes affect prices and recipes — change it in the Material Master" });
  }

  if (row.effective_cost != null && row.effective_cost > 0) {
    const current = m.current_price;
    if (current == null || Math.abs(current - row.effective_cost) >= 0.005) {
      changes.push({
        key: "effective_cost", label: "Effective Cost", file: formatPrice(row.effective_cost),
        existing: current == null ? "—" : `${formatPrice(current)}${m.current_price_date ? ` (${m.current_price_date})` : ""}`,
        kind: "price", applicable: true,
      });
    }
  }
  return changes;
}

function rowFingerprint(row: SimpleMaterialRow, categoryId: string | null): string {
  return materialFingerprint({ ...row, category_id: categoryId });
}

export function classifyMaterialRows(rows: SimpleMaterialRow[], snapshot: MaterialCatalogSnapshot): ClassifiedMaterialRow[] {
  // Rows of this file that will create a material, by spec — a second row with
  // the same spec is the same material, not a new one.
  const newInFile = new Map<string, number>();
  return rows.map((row) => {
    const byCode = row.code ? snapshot.byCode.get(row.code) : undefined;
    // A file may carry a pre-standardization code (e.g. MAT-CL-003) that still
    // passes the code pattern, so the row's own code is checked as a legacy code too.
    const byLegacy = byCode
      ? undefined
      : (row.code ? snapshot.byLegacy.get(row.code) : undefined) ?? (row.legacy_code ? snapshot.byLegacy.get(row.legacy_code) : undefined);
    const exact = byCode ?? byLegacy;
    if (exact) {
      const match = { id: exact.id, code: exact.code, name: exact.material_name, unit: exact.unit };
      const matchedBy = byCode ? "code" as const : "legacy_code" as const;
      if (!exact.hasAttributes) return { row, status: "incomplete", matchedBy, match, changes: [] };
      const changes = compareCells(row, exact, snapshot);
      return { row, status: changes.some((c) => c.applicable) ? "update" : "unchanged", matchedBy, match, changes };
    }
    const cat = resolveCategory(snapshot, row.category_text);
    // No code match: the same spec already in the catalog is the same material,
    // whatever code the file carries. Its cells are compared like any update.
    const bySpec = snapshot.byFingerprint.get(rowFingerprint(row, cat?.id ?? null));
    if (bySpec) {
      const match = { id: bySpec.id, code: bySpec.code, name: bySpec.material_name, unit: bySpec.unit };
      const changes = compareCells(row, bySpec, snapshot);
      return { row, status: changes.some((c) => c.applicable) ? "update" : "unchanged", matchedBy: "spec", match, changes };
    }
    const sameName = snapshot.byName.get(normalizeName(row.material_name)) ?? [];
    const dup = sameName.find((m) => m.unit.toLowerCase() === row.unit.toLowerCase()) ?? sameName[0];
    if (dup) {
      return {
        row, status: "possible_duplicate", matchedBy: "name",
        match: { id: dup.id, code: dup.code, name: dup.material_name, unit: dup.unit },
        // For information only: a duplicate is imported (or not) as a whole row.
        changes: compareCells(row, dup, snapshot).map((c) => ({ ...c, applicable: false })),
      };
    }
    // A new material needs a Category: the code group comes from it.
    if (!cat) {
      return { row, status: "invalid", matchedBy: null, match: null, changes: [],
        note: row.category_text ? `Category "${row.category_text}" is not a Material Master category` : "Category is required to generate a code" };
    }
    const fp = rowFingerprint(row, cat.id);
    const first = newInFile.get(fp);
    if (first != null) {
      return { row, status: "invalid", matchedBy: null, match: null, changes: [], note: `Same material as row ${first} in this file` };
    }
    newInFile.set(fp, row._row);
    return { row, status: "new", matchedBy: null, match: null, changes: [] };
  });
}

export const STATUS_LABEL: Record<MaterialRowStatus, string> = {
  new: "New",
  update: "Has updates",
  incomplete: "Exists — record missing",
  possible_duplicate: "Possible duplicate",
  unchanged: "Unchanged",
  invalid: "Invalid",
};

export const cellId = (rowNo: number, key: CellKey) => `${rowNo}:${key}`;

// Whole rows created unless the QS changes the selection.
export function isRowSelectedByDefault(status: MaterialRowStatus): boolean {
  return status === "new" || status === "incomplete";
}

export function isRowSelectable(status: MaterialRowStatus): boolean {
  return status === "new" || status === "incomplete" || status === "possible_duplicate";
}

// New prices and filling empty cells are safe defaults; overwriting a value
// that is already in the catalog waits for the QS to tick it.
export function isCellSelectedByDefault(c: CellChange): boolean {
  return c.applicable && (c.kind === "price" || c.kind === "fill");
}
