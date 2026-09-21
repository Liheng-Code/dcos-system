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

export const DWL_LABOR_SKILL_LEVELS = ["General Helper", "Skilled", "Master", "Foreman"] as const;
export type DwlLaborSkillLevel = (typeof DWL_LABOR_SKILL_LEVELS)[number];

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
// Cost Item Library — a richer view over the SAME dwl_assemblies above,
// not a parallel catalog. See 20260910000036_dwl_cost_item_library_schema.sql.
// ─────────────────────────────────────────────────────────────────────────

// public.dwl_assembly_costing row (1:1 companion to dwl_assemblies).
export interface DwlAssemblyCosting {
  assembly_id: string;
  tenant_id: string;
  daily_output: number | null;
  overhead_pct: number;
  risk_pct: number;
  profit_pct: number;
  guardrail_note: string | null;
  version_label: string | null;
  status: "active" | "draft" | "archived";
  discipline: string | null;
  work_item_type: string | null;
  vat_pct: number;
  category_id: string | null;
  scope_of_works: string | null;
  manual_direct_cost_per_unit: number | null;
  material_base_cost_override: number | null;
  material_waste_pct_override: number | null;
  labor_cost_override_per_unit: number | null;
  equipment_cost_override_per_unit: number | null;
  tuned_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_assembly_crew / dwl_assembly_equipment rows, joined
// (client-side) with the linked labor/equipment resource's code,
// description and current day rate for display.
export interface DwlAssemblyCrewRow {
  id: string;
  assembly_id: string;
  resource_id: string;
  role_label: string;
  quantity: number;
  sort_order: number;
  description: string | null;
  benchmark_note: string | null;
  resource_code: string | null;
  day_rate: number | null;
  currency: string | null;
}

export type DwlAssemblyEquipmentRow = DwlAssemblyCrewRow;

// public.dwl_assembly_layers row.
export interface DwlAssemblyLayer {
  id: string;
  assembly_id: string;
  sort_order: number;
  layer_name: string;
  material_label: string | null;
  thickness_mm: number;
  color_hex: string;
}

// public.dwl_assembly_layer_materials row (many-to-many: a layer's real
// linked BOQ material(s)).
export interface DwlAssemblyLayerMaterial {
  id: string;
  layer_id: string;
  resource_id: string;
  sort_order: number;
}

// public.dwl_v_assembly_layer_materials row — real cost per layer, rolled
// up from its linked BOQ material(s). Consumption is intentionally not
// summed here (mixed units) — read per-material qty/unit from
// DwlAssemblyMaterialExplosionRow directly, filtered by the layer's linked
// resource_ids.
export interface DwlAssemblyLayerMaterialRow {
  layer_id: string;
  assembly_id: string;
  material_codes: string | null;
  material_names: string | null;
  total_cost_contribution: number;
}

// public.dwl_assembly_layer_specs row — per-layer free-form technical spec.
export interface DwlAssemblyLayerSpec {
  id: string;
  layer_id: string;
  sort_order: number;
  spec_label: string;
  spec_value: string;
}

// public.dwl_assembly_specs row.
export type DwlAssemblySpecSection =
  | "specification" | "storage_protocol" | "productivity_benchmark"
  | "boundary_exclusion" | "estimating_assumption" | "field_lesson" | "inclusion";
export interface DwlAssemblySpec {
  id: string;
  assembly_id: string;
  section: DwlAssemblySpecSection;
  sort_order: number;
  spec_label: string;
  spec_value: string;
}

// public.dwl_v_assembly_material_explosion row — one row per material
// recipe line (the Bill of Quantities tab).
export interface DwlAssemblyMaterialExplosionRow {
  assembly_id: string;
  assembly_code: string;
  resource_id: string;
  material_code: string;
  material_description: string;
  unit: string;
  consumption: number;
  waste_pct: number;
  effective_qty: number;
  unit_price: number | null;
  currency: string | null;
  base_cost_contribution: number;
  waste_cost_contribution: number;
  cost_contribution: number;
  is_expired: boolean | null;
  basis_note: string;
  sort_order: number;
}

// public.dwl_v_assembly_costing_summary row — the Direct/Installed/Tender
// rate roll-up for General Info, the Installed Cost Calculator's starting
// values, and Cost Summary.
export interface DwlAssemblyCostingSummaryRow {
  assembly_id: string;
  code: string;
  element_group: string;
  description: string;
  unit: string;
  daily_output: number | null;
  overhead_pct: number | null;
  risk_pct: number | null;
  profit_pct: number | null;
  guardrail_note: string | null;
  version_label: string | null;
  status: string | null;
  discipline: string | null;
  work_item_type: string | null;
  vat_pct: number | null;
  category_id: string | null;
  scope_of_works: string | null;
  manual_direct_cost_per_unit: number | null;
  tuned_at: string | null;
  is_tuned: boolean;
  created_by: string | null;
  created_by_name: string | null;
  updated_at: string | null;
  material_base_cost: number;
  waste_cost: number;
  material_total_cost: number;
  crew_cost_per_day: number;
  equipment_cost_per_day: number;
  labor_cost_per_unit: number;
  equipment_cost_per_unit: number;
  direct_installed_cost: number;
  target_tender_rate: number;
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

// ─────────────────────────────────────────────────────────────────────────
// Material Specification & Price Recording — DWL Level-1 extension.
// Schema reference: DCOS-DS-12-012 (docs/04-Business-Modules/
// 12-Quantity-Surveying/12-Material-Specification-Price-Recording-Design.md),
// SOP QS-SOP-004. Migrations 20260910000001..20260910000006.
// ─────────────────────────────────────────────────────────────────────────

// Controlled vocabularies mirrored from Excel sheet 10_Lookup_Lists.
export const DWL_MATERIAL_LIFECYCLE = [
  "draft", "active", "superseded", "archived", "obsolete",
] as const;
export type DwlMaterialLifecycle = (typeof DWL_MATERIAL_LIFECYCLE)[number];

export const DWL_DISCIPLINES = [
  "Architectural", "Structural", "Civil", "MEP", "Interior", "Landscape",
  "Specialist", "Façade", "Fire & Life Safety", "Acoustic",
] as const;

export const DWL_SUPPLIER_TYPES = [
  "Manufacturer", "Distributor", "Importer", "Local Supplier",
  "Specialist Supplier", "General Supplier",
] as const;

export const DWL_PRICE_COMPETITIVENESS = [
  "Very Competitive", "Competitive", "Moderate", "Premium",
] as const;

export const DWL_RATE_TYPES = ["Unit Rate", "Lump Sum", "Day Rate"] as const;

export const DWL_SPEC_REVISION_STATUS = [
  "draft", "active", "superseded", "expired",
] as const;
export type DwlSpecRevisionStatus = (typeof DWL_SPEC_REVISION_STATUS)[number];

export const DWL_PRICE_STATUS = [
  "draft", "submitted", "verified", "approved", "active", "expired",
  "superseded", "archived", "rejected",
] as const;
export type DwlPriceStatus = (typeof DWL_PRICE_STATUS)[number];

export const DWL_SUBMISSION_STATUS = [
  "draft", "submitted", "verified", "approved", "rejected",
] as const;
export type DwlSubmissionStatus = (typeof DWL_SUBMISSION_STATUS)[number];

// Cost-breakdown fields shared by dwl_resource_prices, dwl_price_submissions,
// and their forms. Effective = unit_price - discount + delivery + handling
// + other + tax.
export interface DwlPriceBreakdown {
  unit_price: number;
  discount: number;
  delivery_cost: number;
  handling_cost: number;
  other_charges: number;
  tax_amount: number;
}

export function dwlEffectiveUnitCost(b: Partial<DwlPriceBreakdown>): number {
  return (
    (b.unit_price ?? 0)
    - (b.discount ?? 0)
    + (b.delivery_cost ?? 0)
    + (b.handling_cost ?? 0)
    + (b.other_charges ?? 0)
    + (b.tax_amount ?? 0)
  );
}

// The qs_cost_items -> dwl_resources data migration (20260720000013)
// deliberately gave every synthetic %-split resource a verbose, fully
// traceable description — "Material/Labor/Equipment component (migrated)
// for X (source: qs_cost_items.code='...')" — so the raw provenance is
// never lost. That wording is meant for an auditor reading the database,
// not for someone browsing a resource picker or price list; strip it back
// down to just the real name for display, without touching the stored
// description itself.
const DWL_MIGRATED_DESCRIPTION_RE = /^(?:Material|Labor|Equipment) component \(migrated\) for (.+?) \(source: qs_cost_items\.code='[^']*'\)$/;
export function dwlDisplayResourceDescription(description: string): string {
  const match = description.match(DWL_MIGRATED_DESCRIPTION_RE);
  return match ? match[1] : description;
}

// public.dwl_labor_rate_attributes row (1:1 companion to dwl_resources,
// category='labor').
export interface DwlLaborRateAttributes {
  resource_id: string;
  tenant_id: string;
  skill_level: DwlLaborSkillLevel | null;
  standard_productivity_note: string | null;
  updated_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_v_labor_rates row — the Labor Rates page's browse view.
export interface DwlLaborRateRow {
  resource_id: string;
  code: string;
  description: string;
  unit: string;
  spec_reference: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  skill_level: DwlLaborSkillLevel | null;
  standard_productivity_note: string | null;
  daily_basic_rate: number | null;
  overtime_rate_per_hr: number | null;
  currency: string | null;
  valid_from: string | null;
  price_status: DwlPriceStatus | null;
}

// public.dwl_material_attributes row (1:1 companion to dwl_resources).
export interface DwlMaterialAttributes {
  resource_id: string;
  tenant_id: string;
  material_name: string | null;
  subcategory: string | null;
  discipline: string | null;
  material_type: string | null;
  tech_spec_summary: string | null;
  standard: string | null;
  grade: string | null;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  package_size: string | null;
  dimension: string | null;
  thickness: string | null;
  weight: string | null;
  color_finish: string | null;
  application_element: string | null;
  lifecycle_status: DwlMaterialLifecycle;
  tags: string[];
  legacy_code: string | null;
  notes: string | null;
  updated_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_v_materials row — the Materials browse view.
export interface DwlMaterialRow {
  resource_id: string;
  code: string;
  category: DwlCategory;
  material_name: string;
  description: string;
  unit: string;
  spec_reference: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subcategory: string | null;
  discipline: string | null;
  material_type: string | null;
  tech_spec_summary: string | null;
  standard: string | null;
  grade: string | null;
  brand: string | null;
  model: string | null;
  manufacturer: string | null;
  package_size: string | null;
  dimension: string | null;
  thickness: string | null;
  weight: string | null;
  color_finish: string | null;
  application_element: string | null;
  lifecycle_status: DwlMaterialLifecycle | null;
  tags: string[] | null;
  legacy_code: string | null;
  notes: string | null;
  current_unit_price: number | null;
  current_currency: string | null;
  current_price_valid_from: string | null;
  current_price_valid_until: string | null;
  current_price_source_type: DwlSourceType | null;
  current_supplier_name: string | null;
  current_price_is_expired: boolean | null;
  current_spec_code: string | null;
  current_spec_name: string | null;
  current_spec_revision_no: string | null;
  current_spec_effective_date: string | null;
  current_spec_standard: string | null;
  current_spec_grade: string | null;
  current_spec_status: DwlSpecRevisionStatus | null;
  current_effective_unit_cost: number | null;
  current_price_discount: number | null;
  current_price_delivery_cost: number | null;
  current_price_handling_cost: number | null;
  current_price_other_charges: number | null;
  current_price_tax_amount: number | null;
  current_price_status: DwlPriceStatus | null;
  // Material Master — Cost & Rate Library extension (DCOS-DS-12-012,
  // migration 20260910000025). Additive trailing columns.
  category_id: string | null;
  category_name: string | null;
  budget_code_id: string | null;
  budget_code: string | null;
  application_scope: string | null;
  photo_count: number;
}

// Fixed client-side badge/dot color palette for dwl_material_categories.
// color_tag stores one of these keys, never a raw hex value.
export const DWL_CATEGORY_COLORS = [
  "emerald", "sky", "indigo", "violet", "amber",
  "orange", "rose", "teal", "mint", "lavender", "slate",
] as const;
export type DwlCategoryColor = (typeof DWL_CATEGORY_COLORS)[number];

// public.dwl_material_categories row — Material Master category reference
// library (open RLS, UI-gated writes; not tenant-scoped, same pattern as
// qs_element_library / budget_codes). Backs the "Category & Specific Element
// Management" dialog. DCOS-DS-12-012, migrations 20260910000021 + 000026.
export interface DwlMaterialCategory {
  id: string;
  group_name: string | null;
  name: string;
  code: string | null;
  specific_element: string | null;
  discipline: string | null;
  cost_code_prefix: string | null;
  color_tag: string | null;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// public.dwl_material_photos row — tenant-scoped Material Master photo /
// site-verification metadata. storage_path points into the private
// material-photos Storage bucket ({tenant_id}/{resource_id}/{filename}).
// DCOS-DS-12-012, migration 20260910000023/24.
export interface DwlMaterialPhoto {
  id: string;
  tenant_id: string;
  resource_id: string;
  storage_path: string;
  caption: string | null;
  created_by: string | null;
  created_at: string;
}

// public.dwl_material_specs row.
export interface DwlMaterialSpec {
  id: string;
  tenant_id: string;
  spec_code: string;
  resource_id: string;
  spec_name: string;
  discipline: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_material_spec_revisions row (APPEND-ONLY).
export interface DwlMaterialSpecRevision {
  id: string;
  tenant_id: string;
  spec_id: string;
  revision_no: string;
  standard: string | null;
  grade: string | null;
  strength_performance: string | null;
  dimension: string | null;
  thickness: string | null;
  density: string | null;
  unit: string | null;
  manufacturer: string | null;
  brand: string | null;
  technical_req: string | null;
  installation_req: string | null;
  testing_req: string | null;
  approval_req: string | null;
  effective_date: string;
  expiry_date: string | null;
  status: DwlSpecRevisionStatus;
  source_document: string | null;
  created_by: string | null;
  created_at: string;
}

// public.dwl_v_current_material_spec row.
export interface DwlCurrentMaterialSpec {
  resource_id: string;
  spec_id: string;
  spec_code: string;
  spec_name: string;
  revision_id: string;
  revision_no: string;
  standard: string | null;
  grade: string | null;
  strength_performance: string | null;
  dimension: string | null;
  thickness: string | null;
  density: string | null;
  unit: string | null;
  manufacturer: string | null;
  brand: string | null;
  technical_req: string | null;
  installation_req: string | null;
  testing_req: string | null;
  approval_req: string | null;
  effective_date: string;
  expiry_date: string | null;
  status: DwlSpecRevisionStatus;
  source_document: string | null;
}

export type DwlVendorKind = "material_supplier" | "subcontractor";

// public.dwl_supplier_profiles row (1:1 companion to dwl_suppliers).
export interface DwlSupplierProfile {
  supplier_id: string;
  tenant_id: string;
  vendor_kind: DwlVendorKind;
  supplier_code: string | null;
  trading_name: string | null;
  supplier_type: string | null;
  contact_person: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  country: string | null;
  province_city: string | null;
  website: string | null;
  product_categories: string[];
  payment_terms: string | null;
  delivery_terms: string | null;
  credit_terms: string | null;
  lead_time_days: number | null;
  moq: number | null;
  overall_rating: number | null;
  reliability_rating: string | null;
  quality_rating: string | null;
  price_competitiveness: string | null;
  lifecycle_status: string;
  notes: string | null;
}

// public.dwl_v_suppliers row — the Supplier Master list/card browse view
// (dwl_suppliers spine + dwl_supplier_profiles companion + linked-materials
// count). See 20260910000032_dwl_supplier_master_view.sql.
export interface DwlSupplierRow {
  supplier_id: string;
  tenant_id: string;
  name: string;
  contact: string | null;
  rating: "A" | "B" | "C";
  is_active: boolean;
  created_at: string;
  vendor_kind: DwlVendorKind;
  supplier_code: string | null;
  trading_name: string | null;
  supplier_type: string | null;
  contact_person: string | null;
  position: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  country: string | null;
  province_city: string | null;
  website: string | null;
  product_categories: string[] | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  credit_terms: string | null;
  lead_time_days: number | null;
  moq: number | null;
  overall_rating: number | null;
  reliability_rating: string | null;
  quality_rating: string | null;
  price_competitiveness: string | null;
  lifecycle_status: string | null;
  notes: string | null;
  updated_at: string | null;
  materials_linked: number;
}

// public.dwl_subcon_attributes row (1:1 companion to dwl_resources,
// category='subcon'). Mirrors dwl_material_attributes's shape, minimal.
export interface DwlSubconAttributes {
  resource_id: string;
  tenant_id: string;
  trade: string | null;
  lifecycle_status: string;
}

// public.dwl_v_subcon_rates row — one row per commercial rate (price-history
// entry), not one row per item. See 20260910000034_dwl_subcon_rates_schema.sql.
export interface DwlSubconRateRow {
  price_id: string;
  tenant_id: string;
  resource_id: string;
  resource_code: string;
  item_description: string;
  unit: string;
  trade: string | null;
  subcontractor_id: string | null;
  subcontractor_name: string | null;
  subcontractor_code: string | null;
  rate: number;
  currency: string;
  rate_type: string | null;
  effective_date: string;
  rate_year: number;
  scope_notes: string | null;
  source_type: DwlSourceType;
  created_at: string;
}

// public.dwl_v_supplier_materials row.
export interface DwlSupplierMaterialRow {
  id: string;
  tenant_id: string;
  supplier_id: string;
  supplier_name: string;
  supplier_code: string | null;
  resource_id: string;
  material_code: string;
  material_name: string;
  material_unit: string;
  supplier_product_code: string | null;
  supplier_product_name: string | null;
  brand: string | null;
  manufacturer: string | null;
  specification: string | null;
  standard: string | null;
  package_size: string | null;
  moq: number | null;
  lead_time_days: number | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_price_submissions row.
export interface DwlPriceSubmission extends DwlPriceBreakdown {
  id: string;
  tenant_id: string;
  resource_id: string;
  supplier_id: string | null;
  quantity: number | null;
  currency: string;
  valid_from: string;
  quote_valid_until: string | null;
  source_type: DwlSourceType;
  location: string | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  lead_time_days: number | null;
  source_document: string | null;
  quotation_ref: string | null;
  quotation_date: string | null;
  project_code: string | null;
  notes: string | null;
  status: DwlSubmissionStatus;
  submitted_by: string | null;
  submitted_at: string | null;
  verified_by: string | null;
  verified_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  resulting_price_id: string | null;
  dwl_quotation_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// public.dwl_v_price_submissions row (submission + resolved names).
export interface DwlPriceSubmissionRow extends DwlPriceSubmission {
  material_code: string;
  material_name: string;
  material_unit: string;
  supplier_name: string | null;
  effective_unit_cost: number;
}

// Full append-only price-history row incl. Phase C-D/C-E/C-F columns.
export interface DwlPriceHistoryRow extends DwlPriceBreakdown {
  id: string;
  tenant_id: string;
  resource_id: string;
  supplier_id: string | null;
  currency: string;
  valid_from: string;
  quote_valid_until: string | null;
  source_type: DwlSourceType;
  location: string | null;
  notes: string | null;
  quantity: number | null;
  effective_unit_cost: number | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  lead_time_days: number | null;
  source_document: string | null;
  quotation_ref: string | null;
  quotation_date: string | null;
  project_code: string | null;
  price_status: DwlPriceStatus;
  approved_by: string | null;
  approved_at: string | null;
  submission_id: string | null;
  dwl_quotation_id: string | null;
  created_by: string | null;
  created_at: string;
}
