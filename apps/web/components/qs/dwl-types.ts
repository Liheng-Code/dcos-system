// Direct Works Cost Library — Level 1 (Resources, Suppliers, Price History)
// Types shared by the "Resource & price entry" screen.
// Schema reference: SOP-QS-002 §7 (docs/03-Business-Modules/12-Quantity-Surveying/
// SOP_Direct_Works_Cost_Library_Module.md).

export type DwlCategory = "material" | "labor" | "equipment" | "subcon";

export type DwlSourceType = "quotation" | "purchase" | "market_survey" | "estimate";

// SOP §6 Decision D3 — locked unit dictionary. One resource = one unit, forever.
export const DWL_UNITS = [
  "m", "m2", "m3", "kg", "tonne", "pcs", "no", "set", "day", "hr", "ls",
  "month", "l", "bag", "roll", "sheet", "trip",
] as const;
export type DwlUnit = (typeof DWL_UNITS)[number];

export const DWL_CATEGORIES: { value: DwlCategory; label: string; codePrefix: string }[] = [
  { value: "material", label: "Material", codePrefix: "M" },
  { value: "labor", label: "Labor", codePrefix: "L" },
  { value: "equipment", label: "Equipment", codePrefix: "E" },
  { value: "subcon", label: "Subcontract", codePrefix: "S" },
];

export const DWL_SOURCE_TYPES: { value: DwlSourceType; label: string }[] = [
  { value: "quotation", label: "Quotation" },
  { value: "purchase", label: "Purchase (actual)" },
  { value: "market_survey", label: "Market Survey" },
  { value: "estimate", label: "Estimate" },
];

// public.dwl_resources row
export interface DwlResource {
  id: string;
  tenant_id: string;
  code: string;
  category: DwlCategory;
  description: string;
  unit: string;
  spec_reference: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_v_current_prices row (SOP §7 Step 1.2)
export interface DwlCurrentPrice {
  resource_id: string;
  code: string;
  description: string;
  unit: string;
  unit_price: number;
  currency: string;
  valid_from: string;
  quote_valid_until: string | null;
  source_type: DwlSourceType;
  supplier_name: string | null;
  is_expired: boolean;
}

// public.dwl_suppliers row
export interface DwlSupplier {
  id: string;
  tenant_id: string;
  name: string;
  contact: string | null;
  rating: "A" | "B" | "C";
  is_active: boolean;
}

// Merged row for the browse/search list: dwl_resources joined (client-side)
// with its current price from dwl_v_current_prices, if any. A resource with
// zero price rows (just created, no price entered yet) has price = null.
export interface DwlResourceRow {
  resource: DwlResource;
  price: DwlCurrentPrice | null;
}

// public.dwl_resource_prices row — the raw, append-only price history table
// (SOP §7 Step 1.1). dwl_v_current_prices collapses this to one row per
// resource (the latest); the Price Dashboard's trend chart and
// quotation-vs-purchase comparison need the FULL history, so they read this
// table directly instead.
export interface DwlResourcePriceHistory {
  id: string;
  tenant_id: string;
  resource_id: string;
  supplier_id: string | null;
  unit_price: number;
  currency: string;
  valid_from: string;
  quote_valid_until: string | null;
  source_type: DwlSourceType;
  location: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Price Dashboard (SOP §13 Phase 7 item 5) — expiring quotations, price
// trends, quotation-vs-purchase gaps. Read-only reporting screen; no
// create/edit forms of its own (append-only price entry stays on the
// Resource & Price Entry screen).
// ─────────────────────────────────────────────────────────────────────────

// Expiring-quotation window presets. SOP §15 acceptance test 4 specifies a
// 14-day window; 30/60/90 are offered so the screen is still useful when
// nothing falls inside 14 days (as of 2026-07-20 the live catalogue's
// quote_valid_until dates cluster around 2026-09-30, ~70 days out).
export const DWL_EXPIRY_WINDOWS = [14, 30, 60, 90] as const;
export type DwlExpiryWindow = (typeof DWL_EXPIRY_WINDOWS)[number];

// A dwl_v_current_prices row known to carry a quote_valid_until, annotated
// with the computed day-count used to bucket it for the expiring-quotations
// panel.
export interface DwlExpiringQuotationRow extends DwlCurrentPrice {
  daysUntilExpiry: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Level 2 — Work Items & Recipes (SOP §8). Types shared by the "Rate
// build-up" screen.
// ─────────────────────────────────────────────────────────────────────────

// public.dwl_work_items row
export interface DwlWorkItem {
  id: string;
  tenant_id: string;
  code: string;
  boq_section: string;
  description: string;
  unit: string;
  method_note: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_work_item_resources row (a single recipe line — NOT append-only,
// normal tenant-scoped CRUD per its RLS, unlike dwl_resource_prices).
export interface DwlWorkItemResource {
  id: string;
  tenant_id: string;
  work_item_id: string;
  resource_id: string;
  consumption: number;
  waste_pct: number;
  basis_note: string;
  sort_order: number;
}

// public.dwl_v_work_item_rates row (SOP §8 Step 2.2) — the live, computed
// header rate for a work item. Only work items with at least one recipe
// line appear here (inner joins), so a freshly created work item with zero
// lines must be merged against dwl_work_items directly, same pattern as the
// resource/price merge on the Resource & Price Entry screen.
export interface DwlWorkItemRate {
  work_item_id: string;
  code: string;
  boq_section: string;
  description: string;
  unit: string;
  net_direct_rate: number;
  has_expired_price: boolean;
  recipe_lines: number;
}

// public.dwl_v_work_item_explosion row (SOP §8 Step 2.2) — one row per
// recipe line, for the rate build-up / explosion screen.
//
// `work_item_id` and `resource_category` were added to the view additively
// (SOP-QS-003 §4.2, docs/03-Business-Modules/12-Quantity-Surveying/
// 08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md) so that a Tender BOQ
// library pick can query the explosion by uuid (not just work_item_code) and
// bucket lines into labor/material cost buckets (§6.2). Existing consumers
// (dwl-work-items-list-page.tsx) use an explicit column list that predates
// these two columns and are unaffected.
export interface DwlWorkItemExplosionLine {
  work_item_id: string;
  work_item_code: string;
  sort_order: number;
  resource_code: string;
  resource_desc: string;
  resource_unit: string;
  resource_category: DwlCategory;
  consumption: number;
  waste_pct: number;
  unit_price: number;
  line_cost: number;
  source_type: DwlSourceType;
  is_expired: boolean;
  basis_note: string;
}

// Merged row for the work item browse list: dwl_work_items joined
// (client-side) with its live rate from dwl_v_work_item_rates, if any.
export interface DwlWorkItemRow {
  workItem: DwlWorkItem;
  rate: DwlWorkItemRate | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Level 3 — Assemblies (SOP §9). Types shared by the "Assembly builder"
// screen. An assembly is a recipe of *work items* (not resources); its
// per-line quantity is a DESIGN RATIO (e.g. 2.00 = plaster on both faces),
// never waste — waste already lives inside Level 2 recipes.
// ─────────────────────────────────────────────────────────────────────────

// public.dwl_assemblies row
export interface DwlAssembly {
  id: string;
  tenant_id: string;
  code: string;
  element_group: string;
  description: string;
  unit: string;
  measurement_rule: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

// public.dwl_assembly_items row (one line — normal tenant-scoped CRUD, not
// append-only, same as dwl_work_item_resources).
export interface DwlAssemblyItem {
  id: string;
  tenant_id: string;
  assembly_id: string;
  work_item_id: string;
  qty_per_unit: number;
  basis_note: string;
  sort_order: number;
}

// public.dwl_v_assembly_rates row (SOP §9 Step 3.1) — the live, computed
// header rate for an assembly. Only assemblies with at least one item line
// appear here (inner joins), so a freshly created assembly with zero lines
// must be merged against dwl_assemblies directly.
export interface DwlAssemblyRate {
  assembly_id: string;
  code: string;
  element_group: string;
  description: string;
  unit: string;
  net_direct_rate: number;
  has_expired_price: boolean;
}

// Merged row for the assembly browse list.
export interface DwlAssemblyRow {
  assembly: DwlAssembly;
  rate: DwlAssemblyRate | null;
}

// Detail-panel row: one dwl_assembly_items line joined (client-side) with
// its dwl_work_items code/description/unit and live dwl_v_work_item_rates
// rate, for the assembly explosion table.
export interface DwlAssemblyItemRow {
  item: DwlAssemblyItem;
  workItem: {
    code: string;
    description: string;
    unit: string;
    net_direct_rate: number | null;
    has_expired_price: boolean;
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Level 4 — Parametric Quantity Models & Quick Estimate (SOP §10-11). Types
// shared by the "Quick estimate" screen. A model's factors describe, per
// assembly, a QUANTITY RATIO against a project driver (e.g. concrete m³ per
// m² GFA) — not a price. Prices still flow up live from Level 1-3.
// ─────────────────────────────────────────────────────────────────────────

export type DwlModelDriver = "gfa" | "footprint" | "storeys" | "gfa_per_45" | "fixed";

export const DWL_MODEL_DRIVERS: { value: DwlModelDriver; label: string }[] = [
  { value: "gfa", label: "GFA (m²)" },
  { value: "footprint", label: "Footprint (m²)" },
  { value: "storeys", label: "Storeys (no.)" },
  { value: "gfa_per_45", label: "GFA ÷ 45 (≈ 1 unit per 45 m²)" },
  { value: "fixed", label: "Fixed quantity (ignores project size)" },
];

// public.dwl_quantity_models row
export interface DwlQuantityModel {
  id: string;
  tenant_id: string;
  code: string;
  building_type: string;
  description: string;
  basis_note: string;
  is_active: boolean;
  created_at: string;
}

// public.dwl_model_factors row — normal tenant-scoped CRUD, not append-only
// (same pattern as dwl_work_item_resources / dwl_assembly_items).
export interface DwlModelFactor {
  id: string;
  tenant_id: string;
  model_id: string;
  assembly_id: string;
  driver: DwlModelDriver;
  factor: number;
  basis_note: string;
}

// Detail-panel row: one dwl_model_factors line joined (client-side) with its
// dwl_assemblies code/element_group/unit and live dwl_v_assembly_rates rate.
export interface DwlModelFactorRow {
  factor: DwlModelFactor;
  assembly: {
    code: string;
    element_group: string;
    description: string;
    unit: string;
    net_direct_rate: number | null;
    has_expired_price: boolean;
  };
}

// Merged row for the model browse list.
export interface DwlQuantityModelRow {
  model: DwlQuantityModel;
  factorCount: number;
}

// public.dwl_projects row — a LIGHTWEIGHT QUICK-ESTIMATE RECORD scoped to
// this module. Distinct from, and not linked to, the main DCOS project
// registry (public.projects) — see SOP §10 Step 4.3 migration note.
export interface DwlProject {
  id: string;
  tenant_id: string;
  name: string;
  model_id: string | null;
  gfa: number | null;
  footprint: number | null;
  storeys: number | null;
  status: string;
  created_at: string;
}

// public.dwl_v_project_estimate row (SOP §10 Step 4.3, exact view) — one row
// per assembly the project's model prices.
export interface DwlProjectEstimateRow {
  project_id: string;
  name: string;
  element_group: string;
  assembly_code: string;
  description: string;
  unit: string;
  quantity: number;
  net_direct_rate: number;
  amount: number;
}

// Markup inputs applied on top of the summed direct cost (SOP §10 Step 4.3:
// "applied on top of the summed direct cost at project level ... stored per
// project so each tender can set its own margins"). IMPORTANT SCHEMA GAP:
// the Phase 4/5 migrations added no markup column to dwl_projects and no
// separate markup table, so this cannot actually be "stored per project"
// today. This screen keeps markups as local UI state and embeds them in the
// snapshot's jsonb payload at issue time (the only durable place available)
// — see the screen's report / DwlProjectSnapshot below.
export interface DwlMarkupInputs {
  prelims_pct: number;
  overheads_pct: number;
  risk_pct: number;
  contingency_pct: number;
  profit_pct: number;
  tax_pct: number;
}

// SOP §10 Step 4.3 indicative defaults ("10 / 3 / 4 / 3 / 5 / 8 / 10%") —
// starting values only, not a validated benchmark (SOP note under Step
// 4.3). The SOP names 6 categories but lists 7 percentages; the trailing
// 10% is unlabeled in the source text and is NOT implemented as a 7th line
// here — flagged as a documentation ambiguity in the screen report.
export const DWL_DEFAULT_MARKUPS: DwlMarkupInputs = {
  prelims_pct: 10,
  overheads_pct: 3,
  risk_pct: 4,
  contingency_pct: 3,
  profit_pct: 5,
  tax_pct: 8,
};

export const DWL_MARKUP_LABELS: { key: keyof DwlMarkupInputs; label: string }[] = [
  { key: "prelims_pct", label: "Preliminaries" },
  { key: "overheads_pct", label: "Overheads" },
  { key: "risk_pct", label: "Risk" },
  { key: "contingency_pct", label: "Contingency" },
  { key: "profit_pct", label: "Profit" },
  { key: "tax_pct", label: "Tax" },
];

// public.dwl_project_snapshots row — APPEND-ONLY. No UPDATE/DELETE RLS
// policy exists for this table (SOP §11), enforced at the DB level, not
// just a UI convention. Once issued, a snapshot is permanent history.
export interface DwlProjectSnapshot {
  id: string;
  tenant_id: string;
  project_id: string;
  label: string;
  snapped_at: string;
  snapped_by: string | null;
  payload: DwlSnapshotPayload;
}

// Shape of dwl_project_snapshots.payload written by this screen.
export interface DwlSnapshotPayload {
  project: {
    name: string;
    model_code: string | null;
    gfa: number | null;
    footprint: number | null;
    storeys: number | null;
  };
  estimate_rows: DwlProjectEstimateRow[];
  direct_cost: number;
  markups: DwlMarkupInputs;
  markup_amount: number;
  total: number;
}
