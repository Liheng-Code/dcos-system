import { createClient } from "@/lib/supabase/client";
import type {
  DwlAssemblyCostingSummaryRow,
  DwlCategory,
  DwlSourceType,
  DwlWorkItemExplosionLine,
} from "@/components/qs/dwl-types";

// ── Types ────────────────────────────────────────────────────────────────────

export interface BudgetCodeGroup {
  code_letter: string;
  name: string;
  sort_order: number;
}

export interface BudgetCode {
  id: string;
  code: string;
  code_letter: string;
  parent_code_id: string | null;
  code_level: 2 | 3;
  description: string;
  sort_order: number;
  is_active: boolean;
}

// Crosswalk from a firm budget code to an external classification standard.
// Many refs per code: the A–Z codes are elemental, so one code usually spans
// several MasterFormat divisions, and clients may want two standards at once.
export type ExternalStandard = "csi_masterformat" | "csi_uniformat" | "rics_nrm1" | "rics_nrm2" | "din_276" | "other";

export const EXTERNAL_STANDARDS: { value: ExternalStandard; label: string; short: string }[] = [
  { value: "csi_masterformat", label: "CSI MasterFormat", short: "MF" },
  { value: "csi_uniformat", label: "CSI UniFormat", short: "UF" },
  { value: "rics_nrm1", label: "RICS NRM 1", short: "NRM1" },
  { value: "rics_nrm2", label: "RICS NRM 2", short: "NRM2" },
  { value: "din_276", label: "DIN 276", short: "DIN" },
  { value: "other", label: "Other", short: "Other" },
];

export interface BudgetCodeExternalRef {
  id: string;
  budget_code_id: string;
  standard: ExternalStandard;
  standard_version: string | null;
  external_code: string;
  external_title: string | null;
  is_primary: boolean;
  notes: string | null;
}

export interface BudgetCodeTreeNode extends BudgetCode {
  children: (BudgetCode & { external_refs: BudgetCodeExternalRef[] })[];
  external_refs: BudgetCodeExternalRef[];
}

export interface BudgetCodeGroupTree {
  group: BudgetCodeGroup;
  codes: BudgetCodeTreeNode[];
}

export interface QsElementLibraryItem {
  id: string;
  discipline: string;
  section: string;
  sub_section: string;
  sub_element: string;
  budget_code_id: string | null;
  typical_unit: string | null;
  sort_order: number;
  is_active: boolean;
  budget_codes?: { code: string; description: string } | null;
  descriptions?: QsDescriptionLibraryItem[];
}

export interface QsDescriptionLibraryItem {
  id: string;
  element_library_id: string;
  description: string;
  material_rate: number | null;
  labor_rate: number | null;
  in_price_list: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface TenderPriceListItem {
  id: string;
  tender_id: string;
  item_code: string;
  section: string | null;
  sub_section: string | null;
  sub_element: string | null;
  description: string;
  unit: string;
  labor_net_cost: number;
  labor_margin_pct: number;
  labor_rate: number;
  material_net_cost: number;
  material_margin_pct: number;
  material_rate: number;
  total_rate: number;
  basis_source: string | null;
  match_key: string;
  budget_code_id: string | null;
  source_unit_rate_id: string | null;
  budget_codes?: { code: string; description: string } | null;
}

// SOP-QS-003 §4.1 widened rate_source to carry library provenance:
// 'dwl_work_item' / 'dwl_assembly' rows were created (or last refreshed) from
// the Direct Works Cost Library picker; 'manual'/'price_list' behavior is
// completely unchanged (BR1).
export type RateSource = "manual" | "price_list" | "dwl_work_item" | "dwl_assembly";

export interface TenderBoqItem {
  id: string;
  tender_id: string;
  section: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  unit_rate: number;
  total_amount: number;
  sort_order: number;
  discipline: string | null;
  budget_code_id: string | null;
  building_code: string;
  level: string;
  sub_section: string | null;
  sub_element: string | null;
  material_type: string | null;
  element_group: string | null;
  element_id: string | null;
  brand: string | null;
  supplier: string | null;
  package_name: string | null;
  actual_quantity: number | null;
  labor_net_cost: number | null;
  labor_margin_pct: number | null;
  material_net_cost: number | null;
  material_margin_pct: number | null;
  price_list_item_id: string | null;
  // SOP-QS-003 §4.1 — at most one of these two is ever non-null (DB CHECK
  // constraint); both null means manual or price_list entry.
  dwl_work_item_id: string | null;
  dwl_assembly_id: string | null;
  rate_source: RateSource;
  // SOP-QS-003 §4.3 — frozen resource-level rate build-up snapshot, written
  // once at pick time and wholesale-replaced (never patched) at Refresh time.
  // null for manual/price_list rows.
  rate_build_up: BoqRateBuildUp | null;
  notes: string | null;
  budget_codes?: { code: string; description: string; code_letter: string } | null;
}

// ── Direct Works Cost Library → BOQ snapshot (SOP-QS-003 §5, §4.3, §6.2) ────
//
// docs/03-Business-Modules/12-Quantity-Surveying/
// 08-SOP_Direct_Works_Library_Tender_BOQ_Integration.md

/** One line of a frozen rate_build_up snapshot (§4.3 exact shape). */
export interface BoqRateBuildUpLine {
  /** The constituent work item this line came from — equals `source_code`
   *  itself for a direct Work Item pick, or the specific component's own
   *  code for an Assembly pick (this is the audit-trail field: it lets a
   *  multi-component assembly snapshot be traced back to which constituent
   *  produced which resource line, per §5). */
  work_item_code: string;
  /** dwl_assembly_items.qty_per_unit; 1.0 for a direct Work Item pick. */
  qty_per_unit: number;
  resource_code: string;
  resource_desc: string;
  resource_unit: string;
  resource_category: DwlCategory;
  consumption: number;
  waste_pct: number;
  unit_price: number;
  /** dwl_v_work_item_explosion.line_cost — per unit of the constituent work
   *  item, unscaled by qty_per_unit. */
  line_cost: number;
  /** line_cost * qty_per_unit — per unit of the item actually picked. */
  extended_cost: number;
  source_type: DwlSourceType;
  is_expired: boolean;
  basis_note: string;
}

/** Exact rate_build_up jsonb shape (SOP-QS-003 §4.3). */
export interface BoqRateBuildUp {
  source: "dwl_work_item" | "dwl_assembly";
  source_id: string;
  source_code: string;
  snapshot_at: string;
  /** dwl_v_work_item_rates / dwl_v_assembly_rates .net_direct_rate at pick
   *  time, per unit of the picked item. */
  snapshot_net_direct_rate: number;
  /** Sum of lines[].extended_cost where resource_category = 'labor' (§6.2). */
  labor_net_cost: number;
  /** Sum of lines[].extended_cost where resource_category in
   *  ('material','equipment','subcon') — equipment/subcon fold into this
   *  bucket because tender_boq_items only has two cost buckets (BR5). */
  material_net_cost: number;
  lines: BoqRateBuildUpLine[];
  /** Absent (legacy) = recipe basis: snapshot_net_direct_rate is
   *  dwl_v_*_rates.net_direct_rate and lines[] holds the explosion.
   *  "installed_cost" = a QS Cost Item Library pick: snapshot_net_direct_rate
   *  is dwl_v_assembly_costing_summary.direct_installed_cost (what the library
   *  screen shows), lines[] is empty and `installed` holds the breakdown. */
  basis?: "installed_cost";
  installed?: BoqInstalledCostBreakdown;
}

/** Cost Item Library breakdown frozen on an installed-cost snapshot. */
export interface BoqInstalledCostBreakdown {
  material_base_cost: number;
  waste_cost: number;
  labor_cost_per_unit: number;
  equipment_cost_per_unit: number;
  daily_output: number | null;
  crew_cost_per_day: number;
  equipment_cost_per_day: number;
  is_tuned: boolean;
  manual_direct_cost_per_unit: number | null;
}

export function isInstalledCostSnapshot(rateBuildUp: BoqRateBuildUp | null | undefined): boolean {
  return rateBuildUp?.basis === "installed_cost";
}

export interface BoqLibrarySnapshotResult {
  rate_build_up: BoqRateBuildUp;
  labor_net_cost: number;
  material_net_cost: number;
  /** BR3 sanity check — sum(lines[].extended_cost) vs snapshot_net_direct_rate
   *  within ±0.01, same comparison/tolerance dwl-work-items-list-page.tsx
   *  already performs for the library screen itself. Non-blocking: a mismatch
   *  does not prevent saving, the caller decides how (or whether) to surface
   *  it. See SOP §4.3 BR3 and its OQ-9 rounding-at-scale caveat. */
  reconciles: boolean;
}

// SOP-QS-003 §6.4/BR9 — pick-time (and refresh-time) equipment+subcon margin-
// basis guardrail. 10% is a business decision (user/QS Manager, 2026-07-21 —
// see Revision Log OQ-7a), not an architect default; kept as a named,
// exported constant (not inlined at call sites) so it can be retuned later
// without hunting through the two call sites (pick + refresh) that use it.
export const EQUIPMENT_SUBCON_GUARDRAIL_PCT = 10;

/**
 * BR9 — equipment+subcon share of a snapshot's net_direct_rate:
 *   sum(lines[].extended_cost where resource_category in ('equipment','subcon'))
 *   / snapshot_net_direct_rate
 *
 * Computed from the same rate_build_up buildBoqLibrarySnapshot() already
 * produces, so both call sites (pick time in handleLibrarySelect, refresh
 * time in buildBoqLibraryRefreshPreview) reuse this one implementation.
 * Purely informational — this NEVER blocks a pick or a refresh (§6.4:
 * "non-blocking... not a hard stop"); the caller decides how to surface the
 * warning when the returned share exceeds EQUIPMENT_SUBCON_GUARDRAIL_PCT.
 */
export function computeEquipmentSubconShare(rateBuildUp: BoqRateBuildUp): number {
  if (!rateBuildUp.snapshot_net_direct_rate) return 0;
  const equipmentSubconCost = rateBuildUp.lines
    .filter((line) => line.resource_category === "equipment" || line.resource_category === "subcon")
    .reduce((sum, line) => sum + line.extended_cost, 0);
  return equipmentSubconCost / rateBuildUp.snapshot_net_direct_rate;
}

/** A minimal, structurally-compatible view of what LibraryRatePicker's
 *  onSelect hands back (components/qs/library-rate-picker.tsx). Declared
 *  locally rather than imported so this lib module doesn't take a hard
 *  dependency on a "use client" component — any DwlWorkItemRate/
 *  DwlAssemblyRate value satisfies this shape structurally. */
export type BoqLibraryPick =
  | { kind: "work_item"; data: { work_item_id: string; code: string; net_direct_rate: number } }
  | { kind: "assembly"; data: { assembly_id: string; code: string; net_direct_rate: number } };

async function explodeWorkItem(workItemId: string): Promise<DwlWorkItemExplosionLine[]> {
  const { data, error } = await createClient()
    .from("dwl_v_work_item_explosion")
    .select(
      "work_item_id, work_item_code, sort_order, resource_code, resource_desc, resource_unit, resource_category, consumption, waste_pct, unit_price, line_cost, source_type, is_expired, basis_note"
    )
    .eq("work_item_id", workItemId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as DwlWorkItemExplosionLine[];
}

function toSnapshotLine(line: DwlWorkItemExplosionLine, qtyPerUnit: number): BoqRateBuildUpLine {
  // 4dp matches dwl_v_work_item_explosion.line_cost's own rounding (§4.3 QA
  // flag) — extended_cost is only ever line_cost * qty_per_unit, so it
  // carries the same precision, not an invented one.
  const extended_cost = Math.round(line.line_cost * qtyPerUnit * 10000) / 10000;
  return {
    work_item_code: line.work_item_code,
    qty_per_unit: qtyPerUnit,
    resource_code: line.resource_code,
    resource_desc: line.resource_desc,
    resource_unit: line.resource_unit,
    resource_category: line.resource_category,
    consumption: line.consumption,
    waste_pct: line.waste_pct,
    unit_price: line.unit_price,
    line_cost: line.line_cost,
    extended_cost,
    source_type: line.source_type,
    is_expired: line.is_expired,
    basis_note: line.basis_note,
  };
}

/**
 * Builds the frozen rate_build_up snapshot for a Direct Works Cost Library
 * pick (SOP-QS-003 §5):
 *
 * - Work Item pick: one query to dwl_v_work_item_explosion filtered by
 *   work_item_id → its rows become lines[] directly, qty_per_unit = 1.0.
 * - Assembly pick: dwl_assembly_items gives each constituent's
 *   (work_item_id, qty_per_unit); each constituent's explosion lines are
 *   scaled by that qty_per_unit into extended_cost and concatenated into one
 *   flat lines[], each line keeping its own work_item_code so a
 *   multi-component snapshot stays traceable back to which constituent
 *   produced which line.
 *
 * Also performs the §6.2 margin bucketing (labor_net_cost/material_net_cost)
 * and the BR3 reconciliation sanity check. Does not write anything —
 * the caller passes the result's rate_build_up/labor_net_cost/
 * material_net_cost into createBoqItem().
 */
export async function buildBoqLibrarySnapshot(pick: BoqLibraryPick): Promise<BoqLibrarySnapshotResult> {
  const snapshot_at = new Date().toISOString();

  let source: "dwl_work_item" | "dwl_assembly";
  let source_id: string;
  let source_code: string;
  let snapshot_net_direct_rate: number;
  let lines: BoqRateBuildUpLine[];

  if (pick.kind === "work_item") {
    source = "dwl_work_item";
    source_id = pick.data.work_item_id;
    source_code = pick.data.code;
    snapshot_net_direct_rate = pick.data.net_direct_rate;

    const explosion = await explodeWorkItem(source_id);
    lines = explosion.map((line) => toSnapshotLine(line, 1.0));
  } else {
    source = "dwl_assembly";
    source_id = pick.data.assembly_id;
    source_code = pick.data.code;
    snapshot_net_direct_rate = pick.data.net_direct_rate;

    const { data: constituents, error: constErr } = await createClient()
      .from("dwl_assembly_items")
      .select("work_item_id, qty_per_unit, basis_note")
      .eq("assembly_id", source_id)
      .order("sort_order");
    if (constErr) throw new Error(constErr.message);

    const rows = (constituents ?? []) as { work_item_id: string; qty_per_unit: number; basis_note: string }[];

    // One explosion query per constituent — a small (few-item) assembly, not
    // worth a fan-out RPC for this build (§5 describes it as a two-step
    // per-constituent procedure, not a single joined query).
    const explosions = await Promise.all(rows.map((c) => explodeWorkItem(c.work_item_id)));

    lines = [];
    for (let i = 0; i < rows.length; i++) {
      const qtyPerUnit = rows[i].qty_per_unit;
      for (const line of explosions[i]) {
        lines.push(toSnapshotLine(line, qtyPerUnit));
      }
    }
  }

  let labor_net_cost = 0;
  let material_net_cost = 0;
  for (const line of lines) {
    // BR5 — equipment/subcon fold into material_net_cost; only 'labor' gets
    // its own bucket, since tender_boq_items has just the two.
    if (line.resource_category === "labor") labor_net_cost += line.extended_cost;
    else material_net_cost += line.extended_cost;
  }
  labor_net_cost = Math.round(labor_net_cost * 100) / 100;
  material_net_cost = Math.round(material_net_cost * 100) / 100;

  const lineSum = lines.reduce((sum, line) => sum + line.extended_cost, 0);
  const reconciles = Math.abs(lineSum - snapshot_net_direct_rate) < 0.01;
  if (!reconciles) {
    // Dev-time signal only (BR3) — never blocks the pick, per the SOP's own
    // "not a hard failure" instruction.
    console.warn(
      `[BR3] Library snapshot for ${source_code} does not reconcile: lines sum to ${lineSum}, header rate is ${snapshot_net_direct_rate}.`
    );
  }

  const rate_build_up: BoqRateBuildUp = {
    source,
    source_id,
    source_code,
    snapshot_at,
    snapshot_net_direct_rate,
    labor_net_cost,
    material_net_cost,
    lines,
  };

  return { rate_build_up, labor_net_cost, material_net_cost, reconciles };
}

// ── QS Cost Item Library → Tender BOQ quick assign ──────────────────────────
//
// Priced on dwl_v_assembly_costing_summary.direct_installed_cost (the figure the
// Cost Item Library screen shows), net cost only: the library's overhead/risk/
// profit/VAT are not carried, the tender's own labor/material margins apply.

const COSTING_SUMMARY_COLUMNS =
  "assembly_id, code, element_group, description, unit, discipline, daily_output, is_tuned, manual_direct_cost_per_unit, material_base_cost, waste_cost, material_total_cost, crew_cost_per_day, equipment_cost_per_day, labor_cost_per_unit, equipment_cost_per_unit, direct_installed_cost";

type CostingSummaryPick = Pick<
  DwlAssemblyCostingSummaryRow,
  | "assembly_id" | "code" | "element_group" | "description" | "unit" | "discipline" | "daily_output" | "is_tuned"
  | "manual_direct_cost_per_unit" | "material_base_cost" | "waste_cost" | "material_total_cost" | "crew_cost_per_day"
  | "equipment_cost_per_day" | "labor_cost_per_unit" | "equipment_cost_per_unit" | "direct_installed_cost"
>;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Installed-cost snapshot for one costing-summary row. Labor gets its own
 *  bucket; material + equipment fold into material (BR5). A manual-cost item
 *  (no bottom-up build, view falls back to manual_direct_cost_per_unit) puts
 *  the whole figure in material. */
export function snapshotFromCostingSummary(row: CostingSummaryPick): BoqLibrarySnapshotResult {
  const installed = Number(row.direct_installed_cost) || 0;
  const labor = Number(row.labor_cost_per_unit) || 0;
  const materialAndEquipment = (Number(row.material_total_cost) || 0) + (Number(row.equipment_cost_per_unit) || 0);
  const bottomUp = labor + materialAndEquipment;
  const labor_net_cost = bottomUp > 0 ? round2(labor) : 0;
  // Material takes the remainder of the rounded total, so labor + material equals the
  // 2-dp installed cost the library shows (no 1-cent drift from rounding each bucket).
  const material_net_cost = bottomUp > 0 ? round2(round2(installed) - labor_net_cost) : round2(installed);

  const rate_build_up: BoqRateBuildUp = {
    source: "dwl_assembly",
    source_id: row.assembly_id,
    source_code: row.code,
    snapshot_at: new Date().toISOString(),
    snapshot_net_direct_rate: installed,
    labor_net_cost,
    material_net_cost,
    lines: [],
    basis: "installed_cost",
    installed: {
      material_base_cost: Number(row.material_base_cost) || 0,
      waste_cost: Number(row.waste_cost) || 0,
      labor_cost_per_unit: labor,
      equipment_cost_per_unit: Number(row.equipment_cost_per_unit) || 0,
      daily_output: row.daily_output,
      crew_cost_per_day: Number(row.crew_cost_per_day) || 0,
      equipment_cost_per_day: Number(row.equipment_cost_per_day) || 0,
      is_tuned: !!row.is_tuned,
      manual_direct_cost_per_unit: row.manual_direct_cost_per_unit,
    },
  };
  return { rate_build_up, labor_net_cost, material_net_cost, reconciles: true };
}

export async function getCostLibraryItems(assemblyIds?: string[]): Promise<CostingSummaryPick[]> {
  let query = createClient().from("dwl_v_assembly_costing_summary").select(COSTING_SUMMARY_COLUMNS).order("code");
  if (assemblyIds) {
    if (assemblyIds.length === 0) return [];
    query = query.in("assembly_id", assemblyIds);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as CostingSummaryPick[];
}

/** unit_rate = labor net × (1 + labor %) + material net × (1 + material %) —
 *  the same formula createBoqItem() and Refresh use. */
export function boqUnitRate(laborNet: number, laborMarginPct: number, materialNet: number, materialMarginPct: number): number {
  return laborNet * (1 + laborMarginPct / 100) + materialNet * (1 + materialMarginPct / 100);
}

export async function isTenderLocked(tenderId: string): Promise<boolean> {
  const { data, error } = await createClient().rpc("tender_is_locked", { p_tender_id: tenderId });
  if (error) throw new Error(error.message);
  return !!data;
}

export interface TenderOption {
  id: string;
  tender_no: string;
  title: string;
  project_id: string | null;
  locked: boolean;
}

/** Tenders for a "choose target tender" picker, newest first, each flagged with its price lock. */
export async function listTendersWithLock(): Promise<TenderOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tender_register")
    .select("id, tender_no, title, project_id")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const locks = await Promise.all(
    rows.map((t) => supabase.rpc("tender_is_locked", { p_tender_id: t.id }).then(({ data: l }) => l === true))
  );
  return rows.map((t, i) => ({ ...t, locked: locks[i] }));
}

export interface AssignLibraryItemsPayload {
  tenderId: string;
  items: { assemblyId: string; quantity: number }[];
  level: string;
  building_code: string;
  /** Overrides each item's section budget code when set. */
  budget_code_id: string | null;
  budget_code: string | null;
  labor_margin_pct: number;
  material_margin_pct: number;
}

/** Adds Cost Item Library items to a tender BOQ in one insert. Returns the count. */
export async function assignLibraryItemsToBoq(payload: AssignLibraryItemsPayload): Promise<number> {
  if (payload.items.length === 0) return 0;
  if (await isTenderLocked(payload.tenderId)) {
    throw new Error("Tender pricing is locked after internal review — items can't be added.");
  }
  const library = await getCostLibraryItems(payload.items.map((i) => i.assemblyId));
  const byId = new Map(library.map((r) => [r.assembly_id, r]));
  const stamp = Date.now().toString().slice(-6);

  const rows = payload.items.map((item, idx) => {
    const lib = byId.get(item.assemblyId);
    if (!lib) throw new Error("A selected cost item is no longer in the library.");
    const snap = snapshotFromCostingSummary(lib);
    return {
      tender_id: payload.tenderId,
      section: lib.element_group || "Direct Works",
      item_code: `${payload.budget_code || lib.code || "MISC"}.${stamp}${idx > 0 ? `-${idx}` : ""}`,
      description: lib.description,
      unit: lib.unit,
      quantity: item.quantity,
      unit_rate: boqUnitRate(snap.labor_net_cost, payload.labor_margin_pct, snap.material_net_cost, payload.material_margin_pct),
      discipline: lib.discipline ?? null,
      budget_code_id: payload.budget_code_id,
      building_code: payload.building_code || "BA",
      level: payload.level || "All",
      element_group: lib.element_group ?? null,
      dwl_assembly_id: lib.assembly_id,
      rate_build_up: snap.rate_build_up,
      rate_source: "dwl_assembly" as RateSource,
      is_manual_rate: false,
      labor_net_cost: snap.labor_net_cost,
      labor_margin_pct: payload.labor_margin_pct,
      material_net_cost: snap.material_net_cost,
      material_margin_pct: payload.material_margin_pct,
      sort_order: 0,
    };
  });

  const { error } = await createClient().from("tender_boq_items").insert(rows);
  if (error) throw new Error(error.message);
  return rows.length;
}

// ── "Refresh from Library" (SOP-QS-003 §7.3, BR2/BR4/BR7/BR9) ──────────────
//
// Deliberately NOT built by re-using updateBoqItem()'s generic
// changesRate/rate_source path: a refresh legitimately overwrites
// labor_net_cost/material_net_cost from the library, but must never flip
// rate_source to 'manual' the way a human hand-typing a net cost would
// (BR2) — different provenance, different action. Split into a
// preview (no write) + commit (writes exactly what was previewed) pair
// rather than one do-everything function, because BR7 requires a
// confirmation step before anything is committed ("cancel = no write at
// all") — the preview is what the confirmation dialog renders, and commit
// re-uses that exact snapshot rather than re-querying, so what the estimator
// confirmed is exactly what gets written.

export interface BoqLibraryRefreshPreview {
  /** The fresh snapshot (§5) re-built against the row's current library
   *  source — wholesale replacement payload for rate_build_up (BR4). */
  rate_build_up: BoqRateBuildUp;
  labor_net_cost: number;
  material_net_cost: number;
  /** Computed at the row's CURRENT (unchanged) labor_margin_pct/
   *  material_margin_pct — createBoqItem()'s formula, reused explicitly here
   *  because updateBoqItem() does not compute unit_rate at all (§7.3 step 4
   *  correction, v0.2). */
  unit_rate: number;
  before: { snapshot_net_direct_rate: number; unit_rate: number };
  after: { snapshot_net_direct_rate: number; unit_rate: number };
  /** BR9 — equipment+subcon share of the NEW snapshot; caller shows the
   *  non-blocking warning when this exceeds EQUIPMENT_SUBCON_GUARDRAIL_PCT. */
  equipmentSubconShare: number;
  /** BR3 sanity check on the new snapshot (see BoqLibrarySnapshotResult). */
  reconciles: boolean;
}

/**
 * SOP-QS-003 §7.3 steps 1-3 — re-runs the exact §5 snapshot procedure against
 * the row's CURRENT dwl_work_item_id/dwl_assembly_id and computes what the
 * resulting unit_rate would be, WITHOUT writing anything. Only valid for
 * rows already sourced from the library (rate_source in
 * ('dwl_work_item','dwl_assembly')) — throws otherwise, since there is
 * nothing to refresh *from* on a manual/price_list row (§7.3 opening line).
 *
 * buildBoqLibrarySnapshot() takes the header net_direct_rate as an input
 * (the same way the picker supplies it at pick time) rather than querying it
 * itself, so this function looks up the row's CURRENT net_direct_rate from
 * dwl_v_work_item_rates / dwl_v_assembly_rates first — a fresh query, not a
 * diff/patch of the frozen snapshot (§7.3 step 1).
 */
export async function buildBoqLibraryRefreshPreview(row: TenderBoqItem): Promise<BoqLibraryRefreshPreview> {
  if (row.rate_source !== "dwl_work_item" && row.rate_source !== "dwl_assembly") {
    throw new Error("Refresh from Library is only available for rows priced from the Direct Works Cost Library.");
  }
  if (!row.rate_build_up) {
    throw new Error("This row has no library snapshot to refresh from.");
  }

  const laborMarginPct = row.labor_margin_pct ?? 0;
  const materialMarginPct = row.material_margin_pct ?? 0;

  if (isInstalledCostSnapshot(row.rate_build_up)) {
    if (!row.dwl_assembly_id) throw new Error("This row is missing its dwl_assembly_id — cannot refresh.");
    const [lib] = await getCostLibraryItems([row.dwl_assembly_id]);
    if (!lib) throw new Error("This cost item is no longer in the Cost Item Library.");
    const snapshot = snapshotFromCostingSummary(lib);
    const unit_rate = boqUnitRate(snapshot.labor_net_cost, laborMarginPct, snapshot.material_net_cost, materialMarginPct);
    return {
      rate_build_up: snapshot.rate_build_up,
      labor_net_cost: snapshot.labor_net_cost,
      material_net_cost: snapshot.material_net_cost,
      unit_rate,
      before: { snapshot_net_direct_rate: row.rate_build_up.snapshot_net_direct_rate, unit_rate: row.unit_rate },
      after: { snapshot_net_direct_rate: snapshot.rate_build_up.snapshot_net_direct_rate, unit_rate },
      // Equipment is folded into the installed cost; there are no resource lines to split out.
      equipmentSubconShare: 0,
      reconciles: true,
    };
  }

  const supabase = createClient();
  let pick: BoqLibraryPick;

  if (row.rate_source === "dwl_work_item") {
    if (!row.dwl_work_item_id) throw new Error("This row is missing its dwl_work_item_id — cannot refresh.");
    const { data, error } = await supabase
      .from("dwl_v_work_item_rates")
      .select("work_item_id, code, net_direct_rate")
      .eq("work_item_id", row.dwl_work_item_id)
      .single();
    if (error) throw new Error(error.message);
    pick = {
      kind: "work_item",
      data: { work_item_id: data.work_item_id, code: data.code, net_direct_rate: data.net_direct_rate },
    };
  } else {
    if (!row.dwl_assembly_id) throw new Error("This row is missing its dwl_assembly_id — cannot refresh.");
    const { data, error } = await supabase
      .from("dwl_v_assembly_rates")
      .select("assembly_id, code, net_direct_rate")
      .eq("assembly_id", row.dwl_assembly_id)
      .single();
    if (error) throw new Error(error.message);
    pick = {
      kind: "assembly",
      data: { assembly_id: data.assembly_id, code: data.code, net_direct_rate: data.net_direct_rate },
    };
  }

  const snapshot = await buildBoqLibrarySnapshot(pick);

  // §7.3 step 4 / BR7 — computed explicitly at the row's CURRENT (unchanged)
  // margins; labor_margin_pct/material_margin_pct themselves are never
  // touched by a refresh (BR8).
  const unit_rate = boqUnitRate(snapshot.labor_net_cost, laborMarginPct, snapshot.material_net_cost, materialMarginPct);

  return {
    rate_build_up: snapshot.rate_build_up,
    labor_net_cost: snapshot.labor_net_cost,
    material_net_cost: snapshot.material_net_cost,
    unit_rate,
    before: { snapshot_net_direct_rate: row.rate_build_up.snapshot_net_direct_rate, unit_rate: row.unit_rate },
    after: { snapshot_net_direct_rate: snapshot.rate_build_up.snapshot_net_direct_rate, unit_rate },
    equipmentSubconShare: computeEquipmentSubconShare(snapshot.rate_build_up),
    reconciles: snapshot.reconciles,
  };
}

/**
 * SOP-QS-003 §7.3 steps 2-5 — commits a previously-built
 * BoqLibraryRefreshPreview exactly as previewed (no re-query, no re-compute):
 * writes rate_build_up (wholesale replace, BR4), labor_net_cost,
 * material_net_cost, and the already-computed unit_rate in one update call.
 * Deliberately does NOT touch rate_source, labor_margin_pct,
 * material_margin_pct, dwl_work_item_id, or dwl_assembly_id (BR2/BR8) — this
 * is the entire reason Refresh is its own function instead of a call into
 * updateBoqItem(), whose changesRate logic exists specifically to flip
 * rate_source to 'manual' on a hand-typed net-cost edit, which a refresh is
 * not. total_amount is a generated column (quantity * unit_rate) and updates
 * automatically once unit_rate is written.
 */
export async function commitBoqLibraryRefresh(
  row: TenderBoqItem,
  preview: BoqLibraryRefreshPreview
): Promise<TenderBoqItem> {
  const { data, error } = await createClient()
    .from("tender_boq_items")
    .update({
      rate_build_up: preview.rate_build_up,
      labor_net_cost: preview.labor_net_cost,
      material_net_cost: preview.material_net_cost,
      unit_rate: preview.unit_rate,
    })
    .eq("id", row.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBoqItem;
}

// ── Staleness badges (SOP-QS-003 §7.1/§7.2, BR6) ────────────────────────────

export interface BoqLibraryCurrentRate {
  net_direct_rate: number;
  has_expired_price: boolean;
}

export interface BoqLibraryCurrentRates {
  /** Keyed by dwl_work_item_id. */
  workItemRates: Map<string, BoqLibraryCurrentRate>;
  /** Keyed by dwl_assembly_id. */
  assemblyRates: Map<string, BoqLibraryCurrentRate>;
  /** Keyed by dwl_assembly_id — current direct_installed_cost, for rows
   *  assigned from the Cost Item Library (basis "installed_cost"). */
  installedRates: Map<string, BoqLibraryCurrentRate>;
}

/**
 * Batch-fetches the CURRENT dwl_v_work_item_rates / dwl_v_assembly_rates rows
 * for every distinct dwl_work_item_id / dwl_assembly_id present on the given
 * (already-loaded) BOQ rows — one IN(...) query each, mirroring the
 * merge-in-the-frontend pattern dwl-work-items-list-page.tsx already uses
 * for the library screen itself (§7 "Implementation shape"). No new view or
 * RPC. Caller merges the result against each row client-side via
 * getBoqItemStaleness() below.
 */
export async function getBoqLibraryCurrentRates(items: TenderBoqItem[]): Promise<BoqLibraryCurrentRates> {
  const supabase = createClient();
  const workItemIds = [...new Set(items.map((i) => i.dwl_work_item_id).filter((v): v is string => !!v))];
  const recipeItems = items.filter((i) => !isInstalledCostSnapshot(i.rate_build_up));
  const installedItems = items.filter((i) => isInstalledCostSnapshot(i.rate_build_up));
  const assemblyIds = [...new Set(recipeItems.map((i) => i.dwl_assembly_id).filter((v): v is string => !!v))];
  const installedIds = [...new Set(installedItems.map((i) => i.dwl_assembly_id).filter((v): v is string => !!v))];

  const [installedRows, wiResult, asmResult] = await Promise.all([
    getCostLibraryItems(installedIds),
    workItemIds.length
      ? supabase.from("dwl_v_work_item_rates").select("work_item_id, net_direct_rate, has_expired_price").in("work_item_id", workItemIds)
      : Promise.resolve({ data: [] as { work_item_id: string; net_direct_rate: number; has_expired_price: boolean }[], error: null }),
    assemblyIds.length
      ? supabase.from("dwl_v_assembly_rates").select("assembly_id, net_direct_rate, has_expired_price").in("assembly_id", assemblyIds)
      : Promise.resolve({ data: [] as { assembly_id: string; net_direct_rate: number; has_expired_price: boolean }[], error: null }),
  ]);
  if (wiResult.error) throw new Error(wiResult.error.message);
  if (asmResult.error) throw new Error(asmResult.error.message);

  const workItemRates = new Map<string, BoqLibraryCurrentRate>();
  for (const r of wiResult.data ?? []) {
    workItemRates.set(r.work_item_id, { net_direct_rate: r.net_direct_rate, has_expired_price: r.has_expired_price });
  }
  const assemblyRates = new Map<string, BoqLibraryCurrentRate>();
  for (const r of asmResult.data ?? []) {
    assemblyRates.set(r.assembly_id, { net_direct_rate: r.net_direct_rate, has_expired_price: r.has_expired_price });
  }
  const installedRates = new Map<string, BoqLibraryCurrentRate>();
  for (const r of installedRows) {
    installedRates.set(r.assembly_id, { net_direct_rate: Number(r.direct_installed_cost) || 0, has_expired_price: false });
  }
  return { workItemRates, assemblyRates, installedRates };
}

export interface BoqStalenessFlags {
  /** §7.1 — the live library itself has a stale quote behind this rate.
   *  Informational/secondary — does not by itself mean the BOQ line's price
   *  is wrong yet. */
  libraryPriceExpired: boolean;
  /** §7.2 — the row's frozen snapshot_net_direct_rate has drifted from the
   *  CURRENT library rate by >= 0.01 (OQ-4's recommended flat tolerance,
   *  same as BR3's). Actionable/primary — this is what Refresh responds to. */
  rateChangedSincePriced: boolean;
}

/**
 * BR6 — computes BOTH staleness badges for one BOQ row. They are
 * independent and must not be merged into a single generic "stale" flag: a
 * line can have a current, non-expired library rate that has simply moved
 * (§7.2 without §7.1), or vice versa.
 */
export function getBoqItemStaleness(item: TenderBoqItem, currentRates: BoqLibraryCurrentRates): BoqStalenessFlags {
  if ((item.rate_source !== "dwl_work_item" && item.rate_source !== "dwl_assembly") || !item.rate_build_up) {
    return { libraryPriceExpired: false, rateChangedSincePriced: false };
  }
  const current =
    item.rate_source === "dwl_work_item"
      ? item.dwl_work_item_id
        ? currentRates.workItemRates.get(item.dwl_work_item_id)
        : undefined
      : item.dwl_assembly_id
        ? (isInstalledCostSnapshot(item.rate_build_up) ? currentRates.installedRates : currentRates.assemblyRates).get(
            item.dwl_assembly_id
          )
        : undefined;
  if (!current) {
    return { libraryPriceExpired: false, rateChangedSincePriced: false };
  }
  return {
    libraryPriceExpired: current.has_expired_price,
    rateChangedSincePriced: Math.abs(item.rate_build_up.snapshot_net_direct_rate - current.net_direct_rate) >= 0.01,
  };
}

export interface TenderPreliminariesItem {
  id: string;
  tender_id: string;
  code: string;
  budget_code_id: string | null;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
  notes: string | null;
}

export interface TenderBidSummary {
  id: string;
  tender_id: string;
  revision_no: number;
  direct_cost: number;
  preliminaries: number;
  subcontract_cost: number;
  overhead_pct: number;
  overhead_amount: number;
  profit_pct: number;
  profit_amount: number;
  contingency: number;
  contingency_pct: number | null;
  risk_allowance: number;
  risk_pct: number | null;
  vat_pct: number;
  vat_amount: number;
  total_bid_price: number;
  status: "draft" | "review" | "final" | "submitted";
  notes: string | null;
}

export interface BoqGroupSubSection {
  subSection: string;
  subtotal: number;
  items: TenderBoqItem[];
}

export interface BoqGroupSection {
  section: string;
  subtotal: number;
  subSections: BoqGroupSubSection[];
}

export interface BoqGroupBudgetCode {
  budgetCodeId: string | null;
  code: string;
  description: string;
  subtotal: number;
  sections: BoqGroupSection[];
}

export interface BoqGroupLetter {
  codeLetter: string;
  groupName: string;
  subtotal: number;
  budgetCodes: BoqGroupBudgetCode[];
}

export interface BoqItemsGrouped {
  groups: BoqGroupLetter[];
  grandTotal: number;
}

export interface TenderCoverSummary {
  tenderId: string;
  elementalCostSummary: {
    codeLetter: string;
    groupName: string;
    amount: number;
    priced: boolean;
  }[];
  directWorksTotal: number;
  preliminariesTotal: number;
  bidSummary: TenderBidSummary | null;
}

// ── Budget Codes ─────────────────────────────────────────────────────────────

export async function getBudgetCodeGroups(): Promise<BudgetCodeGroup[]> {
  const { data, error } = await createClient()
    .from("budget_code_groups")
    .select("*")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as BudgetCodeGroup[];
}

export async function getBudgetCodes(): Promise<BudgetCode[]> {
  const { data, error } = await createClient()
    .from("budget_codes")
    .select("*")
    .order("code");
  if (error) throw new Error(error.message);
  return (data ?? []) as BudgetCode[];
}

export async function getBudgetCodeTree(): Promise<BudgetCodeGroupTree[]> {
  const [groups, rawCodes, refs] = await Promise.all([getBudgetCodeGroups(), getBudgetCodes(), listBudgetCodeExternalRefs()]);
  const refsByCode = new Map<string, BudgetCodeExternalRef[]>();
  for (const r of refs) refsByCode.set(r.budget_code_id, [...(refsByCode.get(r.budget_code_id) ?? []), r]);
  const codes = rawCodes.map((c) => ({ ...c, external_refs: refsByCode.get(c.id) ?? [] }));
  const level2 = codes.filter((c) => c.code_level === 2);
  const childrenByParent: Record<string, (BudgetCode & { external_refs: BudgetCodeExternalRef[] })[]> = {};
  for (const c of codes) {
    if (c.parent_code_id) {
      (childrenByParent[c.parent_code_id] ??= []).push(c);
    }
  }
  for (const parentId of Object.keys(childrenByParent)) {
    childrenByParent[parentId].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
  }
  return groups.map((group) => ({
    group,
    codes: level2
      .filter((c) => c.code_letter === group.code_letter)
      .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
      .map((c) => ({ ...c, children: childrenByParent[c.id] ?? [] })),
  }));
}

// ── Budget code external refs (crosswalk) ───────────────────────────────────

export async function listBudgetCodeExternalRefs(): Promise<BudgetCodeExternalRef[]> {
  const { data, error } = await createClient()
    .from("budget_code_external_refs")
    .select("id, budget_code_id, standard, standard_version, external_code, external_title, is_primary, notes")
    .order("standard")
    .order("external_code");
  if (error) throw new Error(error.message);
  return (data ?? []) as BudgetCodeExternalRef[];
}

type ExternalRefInput = {
  standard: ExternalStandard;
  standard_version?: string | null;
  external_code: string;
  external_title?: string | null;
  is_primary?: boolean;
  notes?: string | null;
};

// Only one primary ref per (code, standard) — enforced by a partial unique
// index — so clear any existing primary for that standard before setting one.
async function clearPrimary(budgetCodeId: string, standard: ExternalStandard, exceptId?: string) {
  let q = createClient()
    .from("budget_code_external_refs")
    .update({ is_primary: false })
    .eq("budget_code_id", budgetCodeId)
    .eq("standard", standard)
    .eq("is_primary", true);
  if (exceptId) q = q.neq("id", exceptId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function createBudgetCodeExternalRef(budgetCodeId: string, input: ExternalRefInput): Promise<BudgetCodeExternalRef> {
  if (input.is_primary) await clearPrimary(budgetCodeId, input.standard);
  const { data, error } = await createClient()
    .from("budget_code_external_refs")
    .insert({
      budget_code_id: budgetCodeId,
      standard: input.standard,
      standard_version: input.standard_version?.trim() || null,
      external_code: input.external_code.trim(),
      external_title: input.external_title?.trim() || null,
      is_primary: input.is_primary ?? false,
      notes: input.notes?.trim() || null,
    })
    .select("id, budget_code_id, standard, standard_version, external_code, external_title, is_primary, notes")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("This budget code already has that external code for this standard.");
    throw new Error(error.message);
  }
  return data as BudgetCodeExternalRef;
}

export async function updateBudgetCodeExternalRef(id: string, budgetCodeId: string, input: ExternalRefInput): Promise<BudgetCodeExternalRef> {
  if (input.is_primary) await clearPrimary(budgetCodeId, input.standard, id);
  const { data, error } = await createClient()
    .from("budget_code_external_refs")
    .update({
      standard: input.standard,
      standard_version: input.standard_version?.trim() || null,
      external_code: input.external_code.trim(),
      external_title: input.external_title?.trim() || null,
      is_primary: input.is_primary ?? false,
      notes: input.notes?.trim() || null,
    })
    .eq("id", id)
    .select("id, budget_code_id, standard, standard_version, external_code, external_title, is_primary, notes")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("This budget code already has that external code for this standard.");
    throw new Error(error.message);
  }
  return data as BudgetCodeExternalRef;
}

export async function deleteBudgetCodeExternalRef(id: string): Promise<void> {
  const { error } = await createClient().from("budget_code_external_refs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export function formatExternalRef(ref: Pick<BudgetCodeExternalRef, "standard" | "external_code">): string {
  const short = EXTERNAL_STANDARDS.find((s) => s.value === ref.standard)?.short ?? ref.standard;
  return `${short} ${ref.external_code}`;
}

export async function createBudgetCode(payload: {
  code: string;
  code_letter: string;
  parent_code_id?: string | null;
  code_level: 2 | 3;
  description: string;
  sort_order?: number;
}): Promise<BudgetCode> {
  let sort_order = payload.sort_order;
  if (sort_order === undefined) {
    const supabase = createClient();
    const { data: maxRow } = await supabase
      .from("budget_codes")
      .select("sort_order")
      .eq("code_letter", payload.code_letter)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sort_order = (maxRow?.sort_order ?? 0) + 1;
  }
  const { data, error } = await createClient()
    .from("budget_codes")
    .insert({ ...payload, parent_code_id: payload.parent_code_id ?? null, sort_order })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as BudgetCode;
}

export async function updateBudgetCode(
  id: string,
  payload: Partial<Pick<BudgetCode, "code" | "code_letter" | "description" | "sort_order" | "is_active" | "parent_code_id">>
): Promise<BudgetCode> {
  const { data, error } = await createClient()
    .from("budget_codes")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as BudgetCode;
}

export async function deleteBudgetCode(id: string): Promise<void> {
  const supabase = createClient();
  const [priceList, boqItems, prelimItems] = await Promise.all([
    supabase.from("tender_price_list").select("id").eq("budget_code_id", id).limit(1),
    supabase.from("tender_boq_items").select("id").eq("budget_code_id", id).limit(1),
    supabase.from("tender_preliminaries_items").select("id").eq("budget_code_id", id).limit(1),
  ]);
  if ((priceList.data?.length ?? 0) > 0 || (boqItems.data?.length ?? 0) > 0 || (prelimItems.data?.length ?? 0) > 0) {
    throw new Error("This budget code is in use by Price List, BOQ, or Preliminaries items and cannot be deleted.");
  }
  const { error } = await supabase.from("budget_codes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getQsElementLibrary(): Promise<QsElementLibraryItem[]> {
  const { data, error } = await createClient()
    .from("qs_element_library")
    .select("*, budget_codes(code, description)")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QsElementLibraryItem[];
}

export async function getQsDescriptionLibrary(): Promise<QsDescriptionLibraryItem[]> {
  const { data, error } = await createClient()
    .from("qs_description_library")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as QsDescriptionLibraryItem[];
}

// ── Price List ───────────────────────────────────────────────────────────────

export async function getPriceList(tenderId: string): Promise<TenderPriceListItem[]> {
  const { data, error } = await createClient()
    .from("tender_price_list")
    .select("*, budget_codes(code, description)")
    .eq("tender_id", tenderId)
    .order("item_code");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TenderPriceListItem[];
}

export async function getPriceListByMatchKey(
  tenderId: string,
  description: string,
  unit: string
): Promise<TenderPriceListItem | null> {
  const { data } = await createClient()
    .from("tender_price_list")
    .select("*")
    .eq("tender_id", tenderId)
    .eq("match_key", `${description}|${unit}`)
    .maybeSingle();
  return (data as TenderPriceListItem) ?? null;
}

export async function createPriceListItem(payload: {
  tender_id: string;
  item_code: string;
  section?: string | null;
  sub_section?: string | null;
  sub_element?: string | null;
  description: string;
  unit: string;
  labor_net_cost?: number;
  labor_margin_pct?: number;
  material_net_cost?: number;
  material_margin_pct?: number;
  basis_source?: string | null;
  budget_code_id?: string | null;
}): Promise<TenderPriceListItem> {
  const { data, error } = await createClient()
    .from("tender_price_list")
    .insert(payload)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderPriceListItem;
}

export async function updatePriceListItem(
  id: string,
  payload: Partial<{
    section: string | null;
    sub_section: string | null;
    sub_element: string | null;
    description: string;
    unit: string;
    labor_net_cost: number;
    labor_margin_pct: number;
    material_net_cost: number;
    material_margin_pct: number;
    basis_source: string | null;
    budget_code_id: string | null;
  }>
): Promise<TenderPriceListItem> {
  const { data, error } = await createClient()
    .from("tender_price_list")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderPriceListItem;
}

export async function deletePriceListItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_price_list").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bulkInsertPriceList(
  tenderId: string,
  rows: Array<{
    item_code: string;
    section?: string | null;
    sub_section?: string | null;
    sub_element?: string | null;
    description: string;
    unit: string;
    labor_net_cost: number;
    labor_margin_pct: number;
    material_net_cost: number;
    material_margin_pct: number;
    basis_source?: string | null;
    budget_code_id?: string | null;
  }>
): Promise<number> {
  const { error } = await createClient()
    .from("tender_price_list")
    .insert(rows.map((r) => ({ ...r, tender_id: tenderId })));
  if (error) throw new Error(error.message);
  return rows.length;
}

export async function pullFromUnitRateLibrary(tenderId: string): Promise<number> {
  const supabase = createClient();

  const { data: unitRates, error: fetchError } = await supabase
    .from("unit_rate_library")
    .select("*")
    .order("category");
  if (fetchError) throw new Error(fetchError.message);
  if (!unitRates || unitRates.length === 0) return 0;

  const { data: existing } = await supabase
    .from("tender_price_list")
    .select("source_unit_rate_id")
    .eq("tender_id", tenderId);
  const existingIds = new Set((existing ?? []).map((r) => r.source_unit_rate_id).filter(Boolean));

  const newRates = unitRates.filter((r) => !existingIds.has(r.id));
  if (newRates.length === 0) return 0;

  const rows = newRates.map((r) => ({
    tender_id: tenderId,
    item_code: r.code,
    description: r.description,
    unit: r.unit,
    labor_net_cost: r.category === "labour" ? r.base_rate : 0,
    labor_margin_pct: 0,
    material_net_cost: r.category === "material" ? r.base_rate : 0,
    material_margin_pct: 0,
    basis_source: "Pulled from Unit Rate Library",
    source_unit_rate_id: r.id,
  }));

  const { error: insertError } = await supabase.from("tender_price_list").insert(rows);
  if (insertError) throw new Error(insertError.message);
  return rows.length;
}

export async function getElementLibraryForPicker(): Promise<{
  elements: QsElementLibraryItem[];
  descriptions: QsDescriptionLibraryItem[];
}> {
  const supabase = createClient();
  const [elRes, descRes] = await Promise.all([
    supabase.from("qs_element_library").select("*, budget_codes(code, description)").eq("is_active", true).order("sort_order"),
    supabase.from("qs_description_library").select("*").eq("is_active", true).order("sort_order"),
  ]);
  if (elRes.error) throw new Error(elRes.error.message);
  if (descRes.error) throw new Error(descRes.error.message);
  return {
    elements: (elRes.data ?? []) as unknown as QsElementLibraryItem[],
    descriptions: (descRes.data ?? []) as unknown as QsDescriptionLibraryItem[],
  };
}

export interface SelectedElementItem {
  elementId: string;
  descriptionIds?: string[];
}

export async function pullFromElementLibrary(
  tenderId: string,
  selectedItems: SelectedElementItem[],
): Promise<number> {
  const supabase = createClient();

  const { data: tender, error: tenderErr } = await supabase
    .from("tender_register")
    .select("default_labor_margin_pct, default_material_margin_pct")
    .eq("id", tenderId)
    .single();
  if (tenderErr) throw new Error(tenderErr.message);
  const defLaborMargin = tender?.default_labor_margin_pct ?? 0;
  const defMaterialMargin = tender?.default_material_margin_pct ?? 0;

  const { data: elements, error: elErr } = await supabase
    .from("qs_element_library")
    .select("*, budget_codes(code, description)")
    .eq("is_active", true)
    .order("sort_order");
  if (elErr) throw new Error(elErr.message);
  if (!elements || elements.length === 0) return 0;

  const { data: descriptions, error: descErr } = await supabase
    .from("qs_description_library")
    .select("*")
    .eq("is_active", true)
    .order("sort_order");
  if (descErr) throw new Error(descErr.message);

  const descByElement = new Map<string, typeof descriptions>();
  for (const d of descriptions ?? []) {
    const list = descByElement.get(d.element_library_id) ?? [];
    list.push(d);
    descByElement.set(d.element_library_id, list);
  }

  const selectedMap = new Map<string, string[] | undefined>();
  for (const s of selectedItems) selectedMap.set(s.elementId, s.descriptionIds);

  const { data: existing } = await supabase
    .from("tender_price_list")
    .select("item_code, description, unit, section, sub_section, sub_element")
    .eq("tender_id", tenderId);
  const existingCodes = new Set((existing ?? []).map((r) => r.item_code));
  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.description}||${r.unit}||${r.section}||${r.sub_section}||${r.sub_element}`)
  );

  function uniqueCode(base: string): string {
    if (!existingCodes.has(base)) {
      existingCodes.add(base);
      return base;
    }
    let n = 2;
    while (existingCodes.has(`${base}-${n}`)) n++;
    const code = `${base}-${n}`;
    existingCodes.add(code);
    return code;
  }

  const rows: Record<string, unknown>[] = [];
  for (const el of elements) {
    if (!selectedMap.has(el.id)) continue;
    const selectedDescIds = selectedMap.get(el.id);

    const allDescs = descByElement.get(el.id) ?? [];
    const fallbackDesc = { id: null, description: el.sub_element || el.section, material_rate: null, labor_rate: null, in_price_list: false };
    const descsToUse = selectedDescIds === undefined
      ? (allDescs.length > 0 ? allDescs : [fallbackDesc])
      : allDescs.filter((d) => selectedDescIds.includes(d.id));

    for (const d of descsToUse) {
      const key = `${d.description}||${el.typical_unit ?? "ea"}||${el.section}||${el.sub_section}||${el.sub_element}`;
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      rows.push({
        tender_id: tenderId,
        item_code: uniqueCode(el.sub_element || el.sub_section || el.section),
        section: el.section,
        sub_section: el.sub_section,
        sub_element: el.sub_element,
        description: d.description,
        unit: el.typical_unit ?? "ea",
        labor_net_cost: d.labor_rate ?? 0,
        labor_margin_pct: defLaborMargin,
        material_net_cost: d.material_rate ?? 0,
        material_margin_pct: defMaterialMargin,
        basis_source: "Pulled from Element Library",
        budget_code_id: el.budget_code_id ?? null,
      });
    }
  }

  if (rows.length === 0) return 0;
  const { error: insertErr } = await supabase.from("tender_price_list").insert(rows);
  if (insertErr) throw new Error(insertErr.message);
  return rows.length;
}

// ── BOQ Items ────────────────────────────────────────────────────────────────

export async function getBoqItems(
  tenderId: string,
  filters?: { budgetCodeId?: string; level?: string; discipline?: string }
): Promise<TenderBoqItem[]> {
  let query = createClient()
    .from("tender_boq_items")
    .select("*, budget_codes(code, description, code_letter)")
    .eq("tender_id", tenderId);
  if (filters?.budgetCodeId) query = query.eq("budget_code_id", filters.budgetCodeId);
  if (filters?.level) query = query.eq("level", filters.level);
  if (filters?.discipline) query = query.eq("discipline", filters.discipline);
  const { data, error } = await query.order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TenderBoqItem[];
}

export async function getBoqItemsGrouped(tenderId: string): Promise<BoqItemsGrouped> {
  const [items, groups] = await Promise.all([getBoqItems(tenderId), getBudgetCodeGroups()]);

  const groupMap = new Map<string, BoqGroupLetter>();
  const UNCLASSIFIED_LETTER = "—";

  for (const g of groups) {
    groupMap.set(g.code_letter, { codeLetter: g.code_letter, groupName: g.name, subtotal: 0, budgetCodes: [] });
  }
  groupMap.set(UNCLASSIFIED_LETTER, { codeLetter: UNCLASSIFIED_LETTER, groupName: "Unclassified", subtotal: 0, budgetCodes: [] });

  const budgetCodeMapByLetter = new Map<string, Map<string, BoqGroupBudgetCode>>();

  for (const item of items) {
    const letter = item.budget_codes?.code_letter ?? UNCLASSIFIED_LETTER;
    const group = groupMap.get(letter) ?? groupMap.get(UNCLASSIFIED_LETTER)!;
    const codeKey = item.budget_code_id ?? "unclassified";
    const codeLabel = item.budget_codes?.code ?? "Unclassified";
    const codeDesc = item.budget_codes?.description ?? "No budget code assigned";

    if (!budgetCodeMapByLetter.has(letter)) budgetCodeMapByLetter.set(letter, new Map());
    const bcMap = budgetCodeMapByLetter.get(letter)!;
    if (!bcMap.has(codeKey)) {
      const bc: BoqGroupBudgetCode = { budgetCodeId: item.budget_code_id, code: codeLabel, description: codeDesc, subtotal: 0, sections: [] };
      bcMap.set(codeKey, bc);
      group.budgetCodes.push(bc);
    }
    const bc = bcMap.get(codeKey)!;

    const sectionLabel = item.section || "General";
    let section = bc.sections.find((s) => s.section === sectionLabel);
    if (!section) {
      section = { section: sectionLabel, subtotal: 0, subSections: [] };
      bc.sections.push(section);
    }

    const subSectionLabel = item.sub_section || "—";
    let subSection = section.subSections.find((s) => s.subSection === subSectionLabel);
    if (!subSection) {
      subSection = { subSection: subSectionLabel, subtotal: 0, items: [] };
      section.subSections.push(subSection);
    }

    subSection.items.push(item);
    subSection.subtotal += Number(item.total_amount ?? 0);
    section.subtotal += Number(item.total_amount ?? 0);
    bc.subtotal += Number(item.total_amount ?? 0);
    group.subtotal += Number(item.total_amount ?? 0);
  }

  const orderedGroups = [...groups.map((g) => groupMap.get(g.code_letter)!), groupMap.get(UNCLASSIFIED_LETTER)!].filter(
    (g) => g.budgetCodes.length > 0
  );
  const grandTotal = orderedGroups.reduce((sum, g) => sum + g.subtotal, 0);

  return { groups: orderedGroups, grandTotal };
}

/** Flattens getBoqItemsGrouped()'s nested tree back into a flat item list —
 *  used by the §7.1/§7.2 staleness-badge load so boq-tab.tsx doesn't need a
 *  second round-trip to the DB just to get a flat array to batch-fetch
 *  current library rates against. */
export function flattenBoqItemsGrouped(grouped: BoqItemsGrouped): TenderBoqItem[] {
  const out: TenderBoqItem[] = [];
  for (const g of grouped.groups) {
    for (const bc of g.budgetCodes) {
      for (const sec of bc.sections) {
        for (const ss of sec.subSections) {
          out.push(...ss.items);
        }
      }
    }
  }
  return out;
}

export async function createBoqItem(payload: {
  tender_id: string;
  section: string;
  item_code: string;
  description: string;
  unit: string;
  quantity: number;
  discipline?: string | null;
  budget_code_id?: string | null;
  building_code?: string;
  level?: string;
  sub_section?: string | null;
  sub_element?: string | null;
  material_type?: string | null;
  element_group?: string | null;
  element_id?: string | null;
  brand?: string | null;
  supplier?: string | null;
  package_name?: string | null;
  actual_quantity?: number | null;
  notes?: string | null;
  price_list_item_id?: string | null;
  labor_net_cost?: number | null;
  labor_margin_pct?: number | null;
  material_net_cost?: number | null;
  material_margin_pct?: number | null;
  // SOP-QS-003 §4.1/§5 — Direct Works Cost Library provenance. At most one
  // of these two should be set (mirrors the DB CHECK constraint); when
  // either is set, rate_source is derived as 'dwl_work_item'/'dwl_assembly'
  // below instead of the caller passing it explicitly (§6.2: a library-picked
  // line behaves exactly like a manual line from the moment it's created —
  // labor_net_cost/material_net_cost/margins above are the already-bucketed,
  // estimator-typed-margin values, computed by buildBoqLibrarySnapshot()).
  dwl_work_item_id?: string | null;
  dwl_assembly_id?: string | null;
  rate_build_up?: BoqRateBuildUp | null;
  sort_order?: number;
}): Promise<TenderBoqItem> {
  const supabase = createClient();

  let rate = { labor_net_cost: payload.labor_net_cost ?? 0, labor_margin_pct: payload.labor_margin_pct ?? 0, material_net_cost: payload.material_net_cost ?? 0, material_margin_pct: payload.material_margin_pct ?? 0 };
  let rate_source: RateSource = "manual";
  let price_list_item_id = payload.price_list_item_id ?? null;
  const dwl_work_item_id = payload.dwl_work_item_id ?? null;
  const dwl_assembly_id = payload.dwl_assembly_id ?? null;

  if (price_list_item_id) {
    const { data: pl } = await supabase.from("tender_price_list").select("*").eq("id", price_list_item_id).single();
    if (pl) {
      rate = { labor_net_cost: pl.labor_net_cost, labor_margin_pct: pl.labor_margin_pct, material_net_cost: pl.material_net_cost, material_margin_pct: pl.material_margin_pct };
      rate_source = "price_list";
    }
  } else if (dwl_work_item_id) {
    rate_source = "dwl_work_item";
  } else if (dwl_assembly_id) {
    rate_source = "dwl_assembly";
  }

  const unit_rate = boqUnitRate(rate.labor_net_cost, rate.labor_margin_pct, rate.material_net_cost, rate.material_margin_pct);

  const { data, error } = await supabase
    .from("tender_boq_items")
    .insert({
      tender_id: payload.tender_id,
      section: payload.section,
      item_code: payload.item_code,
      description: payload.description,
      unit: payload.unit,
      quantity: payload.quantity,
      unit_rate,
      discipline: payload.discipline ?? null,
      budget_code_id: payload.budget_code_id ?? null,
      building_code: payload.building_code ?? "BA",
      level: payload.level ?? "All",
      sub_section: payload.sub_section ?? null,
      sub_element: payload.sub_element ?? null,
      material_type: payload.material_type ?? null,
      element_group: payload.element_group ?? null,
      element_id: payload.element_id ?? null,
      brand: payload.brand ?? null,
      supplier: payload.supplier ?? null,
      package_name: payload.package_name ?? null,
      actual_quantity: payload.actual_quantity ?? null,
      notes: payload.notes ?? null,
      price_list_item_id,
      dwl_work_item_id,
      dwl_assembly_id,
      rate_build_up: payload.rate_build_up ?? null,
      rate_source,
      ...rate,
      sort_order: payload.sort_order ?? 0,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBoqItem;
}

export async function updateBoqItem(
  id: string,
  payload: Partial<{
    description: string;
    unit: string;
    quantity: number;
    unit_rate: number;
    labor_net_cost: number;
    labor_margin_pct: number;
    material_net_cost: number;
    material_margin_pct: number;
    budget_code_id: string | null;
    notes: string | null;
  }>
): Promise<TenderBoqItem> {
  // SOP-QS-003 §4.1 BR1 (narrowed, v0.2/v0.3) — ONLY a net-cost edit flips
  // rate_source back to 'manual'. A margin-only edit (labor_margin_pct/
  // material_margin_pct) must NOT trip this, since §6.2 expects the
  // estimator to type a margin on essentially every library pick (margins
  // default to 0) — tripping rate_source on that routine, expected action
  // would silently strip the Refresh affordance (§7.3, gated on
  // rate_source) from almost every library-sourced line. This was
  // previously (incorrectly) also triggered by labor_margin_pct/
  // material_margin_pct !== undefined — corrected per commercial-qs review.
  const changesRate = payload.labor_net_cost !== undefined || payload.material_net_cost !== undefined;

  const update: Record<string, unknown> = { ...payload };
  if (changesRate) {
    update.rate_source = "manual";
  }
  const { data, error } = await createClient().from("tender_boq_items").update(update).eq("id", id).select().single();
  if (error) throw new Error(error.message);
  return data as TenderBoqItem;
}

export async function deleteBoqItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_boq_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function bulkInsertBoqItems(
  tenderId: string,
  rows: Array<Omit<Parameters<typeof createBoqItem>[0], "tender_id">>
): Promise<number> {
  const supabase = createClient();

  // Resolve MatchKey lookups against the tender's Price List once, up front (avoid N+1 queries).
  const { data: priceListRows } = await supabase.from("tender_price_list").select("*").eq("tender_id", tenderId);
  const priceListByMatchKey = new Map((priceListRows ?? []).map((p) => [p.match_key as string, p]));

  const insertRows = rows.map((r) => {
    const matchKey = `${r.description}|${r.unit}`;
    const matched = priceListByMatchKey.get(matchKey);
    const laborNet = r.labor_net_cost ?? matched?.labor_net_cost ?? 0;
    const laborMargin = r.labor_margin_pct ?? matched?.labor_margin_pct ?? 0;
    const materialNet = r.material_net_cost ?? matched?.material_net_cost ?? 0;
    const materialMargin = r.material_margin_pct ?? matched?.material_margin_pct ?? 0;
    const unit_rate = laborNet * (1 + laborMargin / 100) + materialNet * (1 + materialMargin / 100);
    return {
      tender_id: tenderId,
      section: r.section,
      item_code: r.item_code,
      description: r.description,
      unit: r.unit,
      quantity: r.quantity,
      unit_rate,
      discipline: r.discipline ?? null,
      budget_code_id: r.budget_code_id ?? null,
      building_code: r.building_code ?? "BA",
      level: r.level ?? "All",
      sub_section: r.sub_section ?? null,
      sub_element: r.sub_element ?? null,
      material_type: r.material_type ?? null,
      element_group: r.element_group ?? null,
      element_id: r.element_id ?? null,
      brand: r.brand ?? null,
      supplier: r.supplier ?? null,
      package_name: r.package_name ?? null,
      actual_quantity: r.actual_quantity ?? null,
      notes: r.notes ?? null,
      price_list_item_id: matched?.id ?? null,
      rate_source: (matched ? "price_list" : "manual") as RateSource,
      labor_net_cost: laborNet,
      labor_margin_pct: laborMargin,
      material_net_cost: materialNet,
      material_margin_pct: materialMargin,
      sort_order: r.sort_order ?? 0,
    };
  });

  const { error } = await supabase.from("tender_boq_items").insert(insertRows);
  if (error) throw new Error(error.message);
  return insertRows.length;
}

// ── Preliminaries ────────────────────────────────────────────────────────────

export async function getPreliminariesItems(tenderId: string): Promise<TenderPreliminariesItem[]> {
  const { data, error } = await createClient()
    .from("tender_preliminaries_items")
    .select("*")
    .eq("tender_id", tenderId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as TenderPreliminariesItem[];
}

export async function createPreliminariesItem(payload: {
  tender_id: string;
  code: string;
  budget_code_id?: string | null;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  sort_order?: number;
  notes?: string | null;
}): Promise<TenderPreliminariesItem> {
  const { data, error } = await createClient().from("tender_preliminaries_items").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as TenderPreliminariesItem;
}

export async function updatePreliminariesItem(
  id: string,
  payload: Partial<{ description: string; unit: string; quantity: number; rate: number; notes: string | null }>
): Promise<TenderPreliminariesItem> {
  const { data, error } = await createClient()
    .from("tender_preliminaries_items")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderPreliminariesItem;
}

export async function deletePreliminariesItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_preliminaries_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function getPreliminariesTotal(tenderId: string): Promise<number> {
  const items = await getPreliminariesItems(tenderId);
  return items.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
}

// ── Rollup / Bid Summary ─────────────────────────────────────────────────────

export async function getDirectWorksTotal(tenderId: string): Promise<number> {
  const { data, error } = await createClient().from("tender_boq_items").select("total_amount").eq("tender_id", tenderId);
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);
}

export async function getBidSummaries(tenderId: string): Promise<TenderBidSummary[]> {
  const { data, error } = await createClient()
    .from("tender_bid_summaries")
    .select("*")
    .eq("tender_id", tenderId)
    .order("revision_no", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TenderBidSummary[];
}

export async function createBidSummaryRevision(tenderId: string): Promise<TenderBidSummary> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const existing = await getBidSummaries(tenderId);
  const nextRev = existing.length > 0 ? Math.max(...existing.map((b) => b.revision_no)) + 1 : 1;
  const [directCost, preliminariesTotal] = await Promise.all([
    getDirectWorksTotal(tenderId),
    getPreliminariesTotal(tenderId),
  ]);
  const { data, error } = await supabase
    .from("tender_bid_summaries")
    .insert({ tender_id: tenderId, revision_no: nextRev, direct_cost: directCost, preliminaries: preliminariesTotal, overhead_pct: 10, profit_pct: 5, created_by: user?.id ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBidSummary;
}

export async function updateBidSummary(
  id: string,
  payload: Partial<{
    direct_cost: number;
    preliminaries: number;
    subcontract_cost: number;
    overhead_pct: number;
    profit_pct: number;
    contingency: number;
    contingency_pct: number | null;
    risk_allowance: number;
    risk_pct: number | null;
    vat_pct: number;
    status: TenderBidSummary["status"];
    notes: string | null;
  }>
): Promise<TenderBidSummary> {
  const { data, error } = await createClient()
    .from("tender_bid_summaries")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderBidSummary;
}

export async function deleteBidSummary(id: string): Promise<void> {
  const { error } = await createClient().from("tender_bid_summaries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Recomputes direct_cost from tender_boq_items and preliminaries from tender_preliminaries_items,
 *  writing both onto the given bid summary revision. An explicit action, not an automatic trigger,
 *  so it never silently clobbers a hand-adjusted revision during a bulk BOQ import. */
export async function recalculateBidSummaryFromBoq(tenderId: string, bidSummaryId: string): Promise<TenderBidSummary> {
  const [directCost, preliminariesTotal] = await Promise.all([getDirectWorksTotal(tenderId), getPreliminariesTotal(tenderId)]);
  return updateBidSummary(bidSummaryId, { direct_cost: directCost, preliminaries: preliminariesTotal });
}

// ── GFA / Cost per m² (§9 rollout, tender-phase — see migration 20260718000005) ──

export interface TenderGfa {
  gfaTotal: number | null;
  gfaSource: string | null;
}

export interface TenderCostPerM2Summary {
  directWorksTotal: number;
  preliminariesTotal: number;
  combinedTotal: number;
  gfaTotal: number | null;
  blendedRate: number | null;
}

export async function getTenderGfa(tenderId: string): Promise<TenderGfa> {
  const { data, error } = await createClient()
    .from("tender_register")
    .select("gfa_total, gfa_source")
    .eq("id", tenderId)
    .single();
  if (error) throw new Error(error.message);
  return { gfaTotal: data?.gfa_total ?? null, gfaSource: data?.gfa_source ?? null };
}

export async function updateTenderGfa(tenderId: string, payload: TenderGfa): Promise<void> {
  const { error } = await createClient()
    .from("tender_register")
    .update({ gfa_total: payload.gfaTotal, gfa_source: payload.gfaSource })
    .eq("id", tenderId);
  if (error) throw new Error(error.message);
}

export async function updateTenderMargins(
  tenderId: string,
  defaultLaborMarginPct: number,
  defaultMaterialMarginPct: number,
): Promise<void> {
  const { error } = await createClient()
    .from("tender_register")
    .update({
      default_labor_margin_pct: defaultLaborMarginPct,
      default_material_margin_pct: defaultMaterialMarginPct,
    })
    .eq("id", tenderId);
  if (error) throw new Error(error.message);
}

export async function getTenderMargins(
  tenderId: string,
): Promise<{ defaultLaborMarginPct: number; defaultMaterialMarginPct: number }> {
  const { data, error } = await createClient()
    .from("tender_register")
    .select("default_labor_margin_pct, default_material_margin_pct")
    .eq("id", tenderId)
    .single();
  if (error) throw new Error(error.message);
  return {
    defaultLaborMarginPct: data?.default_labor_margin_pct ?? 0,
    defaultMaterialMarginPct: data?.default_material_margin_pct ?? 0,
  };
}

/** Blended tender $/m2 = (Direct Works + Preliminaries) / GFA total, per DCOS-QS-GDL-001 §5.1
 *  GFA is sourced from WBS Preliminary level node quantities (metric_code = 'GFA'),
 *  not from a manual entry on tender_register. */
export async function getTenderCostPerM2Summary(tenderId: string): Promise<TenderCostPerM2Summary> {
  const supabase = createClient();

  const [{ directWorksTotal, preliminariesTotal }, gfaTotal] = await Promise.all([
    (async () => {
      const [dw, pi] = await Promise.all([getDirectWorksTotal(tenderId), getPreliminariesTotal(tenderId)]);
      return { directWorksTotal: dw, preliminariesTotal: pi };
    })(),
    (async (): Promise<number> => {
      const { data: tender } = await supabase
        .from("tender_register").select("project_id").eq("id", tenderId).single();
      const projectId = tender?.project_id as string | null;
      if (!projectId) return 0;
      const { data: nodes } = await supabase
        .from("wbs_nodes").select("id").eq("project_id", projectId).eq("node_type", "level");
      if (!nodes || nodes.length === 0) return 0;
      const { data: quants } = await supabase
        .from("wbs_node_quantities").select("value").eq("metric_code", "GFA").in("wbs_node_id", nodes.map((n) => n.id));
      return (quants ?? []).reduce((sum, q) => sum + Number(q.value ?? 0), 0);
    })(),
  ]);

  const combinedTotal = directWorksTotal + preliminariesTotal;
  const blendedRate = gfaTotal > 0 ? combinedTotal / gfaTotal : null;
  return { directWorksTotal, preliminariesTotal, combinedTotal, gfaTotal: gfaTotal || null, blendedRate };
}

// ── WBS Nodes (for BOQ Level / Building / Discipline dropdowns) ───────────────

export interface WbsProjectNode {
  id: string;
  wbs_code: string;
  wbs_name: string;
  node_type: string;
  full_path: string | null;
  sort_order: number;
}

export interface WbsProjectNodes {
  levels: WbsProjectNode[];
  buildings: WbsProjectNode[];
  disciplines: WbsProjectNode[];
}

export async function getWbsProjectNodes(tenderId: string): Promise<WbsProjectNodes> {
  const supabase = createClient();
  const { data: tender } = await supabase
    .from("tender_register")
    .select("project_id")
    .eq("id", tenderId)
    .single();
  const projectId = tender?.project_id as string | null;
  if (!projectId) return { levels: [], buildings: [], disciplines: [] };
  const { data, error } = await supabase
    .from("wbs_nodes")
    .select("id, wbs_code, wbs_name, node_type, full_path, sort_order")
    .eq("project_id", projectId)
    .in("node_type", ["level", "building", "discipline"])
    .order("sort_order");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as WbsProjectNode[];
  return {
    levels: rows.filter((n) => n.node_type === "level"),
    buildings: rows.filter((n) => n.node_type === "building"),
    disciplines: rows.filter((n) => n.node_type === "discipline"),
  };
}

// ── Cost per m² by Floor (WBS Preliminary levels) ────────────────────────────

export interface FloorCostLine {
  levelCode: string;
  wbsNodeId: string | null;
  wbsName: string | null;
  sortOrder: number;
  gfa: number | null;
  directCost: number;
  prelimsCost: number;
  totalCost: number;
  costPerM2: number | null;
}

export interface TenderCostPerM2ByFloor {
  floors: FloorCostLine[];
  unallocated: FloorCostLine | null;
  blendedTotal: FloorCostLine;
}

/** Cost breakdown by floor, linking BOQ items to WBS Preliminary level nodes via
 *  the `level` text field on tender_boq_items.  Prelims are apportioned pro-rata
 *  by each floor's share of total direct cost (same approach as §7 post-award). */
export async function getTenderCostPerM2ByFloor(tenderId: string): Promise<TenderCostPerM2ByFloor> {
  const supabase = createClient();

  // 1. Get the project this tender belongs to
  const { data: tender, error: tErr } = await supabase
    .from("tender_register")
    .select("project_id")
    .eq("id", tenderId)
    .single();
  if (tErr) throw new Error(tErr.message);
  const projectId = tender?.project_id as string | null;

  // 2. Parallel fetch: BOQ items, preliminaries, and (if project linked) WBS level nodes + GFA
  const [boqItems, prelimsItems] = await Promise.all([
    getBoqItems(tenderId),
    getPreliminariesItems(tenderId),
  ]);

  let wbsLevels: { id: string; wbs_code: string; wbs_name: string; sort_order: number }[] = [];
  let gfaByNode: Map<string, number> = new Map();

  if (projectId) {
    const [nodesRes, quantitiesRes] = await Promise.all([
      supabase
        .from("wbs_nodes")
        .select("id, wbs_code, wbs_name, sort_order")
        .eq("project_id", projectId)
        .eq("node_type", "level")
        .order("sort_order"),
      supabase
        .from("wbs_node_quantities")
        .select("wbs_node_id, value")
        .eq("metric_code", "GFA"),
    ]);
    if (!nodesRes.error) wbsLevels = (nodesRes.data ?? []) as typeof wbsLevels;
    if (!quantitiesRes.error) {
      const wbsIds = new Set(wbsLevels.map((n) => n.id));
      for (const q of quantitiesRes.data ?? []) {
        if (wbsIds.has(q.wbs_node_id)) gfaByNode.set(q.wbs_node_id, Number(q.value ?? 0));
      }
    }
  }

  // 3. Group BOQ direct cost by level text
  const directCostByLevel = new Map<string, number>();
  for (const item of boqItems) {
    const level = (item.level ?? "All").trim() || "All";
    directCostByLevel.set(level, (directCostByLevel.get(level) ?? 0) + Number(item.total_amount ?? 0));
  }

  const prelimsTotal = prelimsItems.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const grandDirectCost = boqItems.reduce((sum, i) => sum + Number(i.total_amount ?? 0), 0);

  // 4. Build a normalised lookup from BOQ level codes → WBS node
  //    BOQ level values are the level_code from level_master (e.g. "GF", "1F", "02.GF").
  //    WBS level nodes have wbs_code = same level_code.
  const wbsByCode = new Map<string, typeof wbsLevels[number]>();
  for (const node of wbsLevels) wbsByCode.set(node.wbs_code.toLowerCase(), node);

  function matchWbsNode(levelCode: string): typeof wbsLevels[number] | null {
    const norm = levelCode.toLowerCase().trim();
    if (!norm || norm === "all") return null;
    // Direct match
    const direct = wbsByCode.get(norm);
    if (direct) return direct;
    // Strip common prefix patterns like "02." from "02.GF"
    const stripped = norm.replace(/^\d+\./, "");
    if (stripped !== norm) {
      const byStripped = wbsByCode.get(stripped);
      if (byStripped) return byStripped;
    }
    // Partial: WBS code contained in BOQ level or vice versa
    for (const node of wbsLevels) {
      const lc = node.wbs_code.toLowerCase();
      if (norm.includes(lc) || lc.includes(norm)) return node;
    }
    return null;
  }

  // 5. Build floor lines for each BOQ level
  const seenWbsIds = new Set<string>();
  const floors: FloorCostLine[] = [];
  const sortedLevels = [...directCostByLevel.entries()].sort((a, b) => {
    const aNode = matchWbsNode(a[0]);
    const bNode = matchWbsNode(b[0]);
    const aOrder = aNode?.sort_order ?? 9999;
    const bOrder = bNode?.sort_order ?? 9999;
    return aOrder - bOrder || a[0].localeCompare(b[0], undefined, { numeric: true });
  });

  for (const [levelCode, directCost] of sortedLevels) {
    const node = matchWbsNode(levelCode);
    const wbsNodeId = node?.id ?? null;
    const gfa = node ? (gfaByNode.get(node.id) ?? null) : null;
    const prelimsShare = grandDirectCost > 0 ? (directCost / grandDirectCost) * prelimsTotal : 0;
    const totalCost = directCost + prelimsShare;

    if (wbsNodeId) seenWbsIds.add(wbsNodeId);

    if (!node && (levelCode === "All" || !levelCode.trim())) {
      // Unallocated items — skip for now, handle below
      continue;
    }

    floors.push({
      levelCode: node?.wbs_code ?? levelCode,
      wbsNodeId,
      wbsName: node?.wbs_name ?? null,
      sortOrder: node?.sort_order ?? 9999,
      gfa,
      directCost,
      prelimsCost: prelimsShare,
      totalCost,
      costPerM2: gfa && gfa > 0 ? totalCost / gfa : null,
    });
  }

  // 6. Add remaining WBS levels not yet seen (floors with no BOQ items, with or without GFA)
  for (const node of wbsLevels) {
    if (seenWbsIds.has(node.id)) continue;
    const gfa = gfaByNode.get(node.id) ?? null;
    floors.push({
      levelCode: node.wbs_code,
      wbsNodeId: node.id,
      wbsName: node.wbs_name,
      sortOrder: node.sort_order,
      gfa,
      directCost: 0,
      prelimsCost: 0,
      totalCost: 0,
      costPerM2: null,
    });
  }

  floors.sort((a, b) => a.sortOrder - b.sortOrder || a.levelCode.localeCompare(b.levelCode, undefined, { numeric: true }));

  // 7. Unallocated ("All" level items)
  const allDirectCost = directCostByLevel.get("All") ?? 0;
  let unallocated: FloorCostLine | null = null;
  if (allDirectCost > 0) {
    const allPrelimsShare = grandDirectCost > 0 ? (allDirectCost / grandDirectCost) * prelimsTotal : 0;
    unallocated = {
      levelCode: "All",
      wbsNodeId: null,
      wbsName: "Unallocated",
      sortOrder: 99999,
      gfa: null,
      directCost: allDirectCost,
      prelimsCost: allPrelimsShare,
      totalCost: allDirectCost + allPrelimsShare,
      costPerM2: null,
    };
  }

  // 8. Blended total
  const totalGfa = floors.reduce((s, f) => s + (f.gfa ?? 0), 0);
  const blendedTotalCost = grandDirectCost + prelimsTotal;
  const blendedTotal: FloorCostLine = {
    levelCode: "TOTAL",
    wbsNodeId: null,
    wbsName: "Blended Total",
    sortOrder: 99999,
    gfa: totalGfa > 0 ? totalGfa : null,
    directCost: grandDirectCost,
    prelimsCost: prelimsTotal,
    totalCost: blendedTotalCost,
    costPerM2: totalGfa > 0 ? blendedTotalCost / totalGfa : null,
  };

  return { floors, unallocated, blendedTotal };
}

// ── Exclude Items ──────────────────────────────────────────────────────────

export interface TenderExcludeItem {
  id: string;
  tender_id: string;
  item_code: string;
  description: string;
  reason: string | null;
  notes: string | null;
  sort_order: number;
}

export async function getExcludeItems(tenderId: string): Promise<TenderExcludeItem[]> {
  const { data, error } = await createClient()
    .from("tender_exclude_items")
    .select("*")
    .eq("tender_id", tenderId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as TenderExcludeItem[];
}

export async function createExcludeItem(payload: {
  tender_id: string;
  item_code: string;
  description: string;
  reason?: string | null;
  notes?: string | null;
  sort_order?: number;
}): Promise<TenderExcludeItem> {
  const { data, error } = await createClient().from("tender_exclude_items").insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as TenderExcludeItem;
}

export async function updateExcludeItem(
  id: string,
  payload: Partial<{ description: string; reason: string | null; notes: string | null }>
): Promise<TenderExcludeItem> {
  const { data, error } = await createClient()
    .from("tender_exclude_items")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TenderExcludeItem;
}

export async function deleteExcludeItem(id: string): Promise<void> {
  const { error } = await createClient().from("tender_exclude_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Tender Submission Data Aggregation ───────────────────────────────────────

export interface TenderSubmissionData {
  tender: {
    tender_no: string;
    title: string;
    description: string | null;
    project_location: string | null;
    client_name: string | null;
    contractor_name: string | null;
    issue_date: string | null;
    currency: string;
    gfa_total: number | null;
    gfa_source: string | null;
  };
  bidSummary: TenderBidSummary | null;
  elementalSummary: {
    codeLetter: string;
    groupName: string;
    amount: number;
    priced: boolean;
  }[];
  preliminariesTotal: number;
  preliminariesItems: TenderPreliminariesItem[];
  boqItemsGrouped: BoqItemsGrouped;
  excludeItems: TenderExcludeItem[];
  directWorksTotal: number;
  blendedRate: number | null;
  // budget_code_id → primary external refs, e.g. "MF 04 20 00 · NRM1 2.5.1" (only codes that have any).
  primaryExternalRefs: Record<string, string>;
}

export async function getTenderSubmissionData(tenderId: string, bidSummaryId?: string): Promise<TenderSubmissionData> {
  const supabase = createClient();

  const [
    tender,
    bidSummaries,
    grouped,
    preliminariesItems,
    excludeItems,
    externalRefs,
  ] = await Promise.all([
    supabase
      .from("tender_register")
      .select("tender_no, title, description, project_location, client_name, contractor_name, issue_date, currency, gfa_total, gfa_source")
      .eq("id", tenderId)
      .single(),
    getBidSummaries(tenderId),
    getBoqItemsGrouped(tenderId),
    getPreliminariesItems(tenderId),
    getExcludeItems(tenderId),
    // The crosswalk is optional decoration for the print — never fail the submission over it.
    listBudgetCodeExternalRefs().catch(() => [] as BudgetCodeExternalRef[]),
  ]);

  const primaryExternalRefs: Record<string, string> = {};
  for (const r of externalRefs) {
    if (!r.is_primary) continue;
    const label = formatExternalRef(r);
    primaryExternalRefs[r.budget_code_id] = primaryExternalRefs[r.budget_code_id]
      ? `${primaryExternalRefs[r.budget_code_id]} · ${label}`
      : label;
  }

  if (tender.error) throw new Error(tender.error.message);

  const bidSummary = bidSummaryId
    ? bidSummaries.find((b) => b.id === bidSummaryId) ?? null
    : bidSummaries[0] ?? null;

  const preliminariesTotal = preliminariesItems.reduce((sum, i) => sum + Number(i.amount ?? 0), 0);
  const directWorksTotal = grouped.grandTotal;

  const gfaTotal = tender.data?.gfa_total ?? 0;
  const blendedRate = gfaTotal > 0 ? (directWorksTotal + preliminariesTotal) / gfaTotal : null;

  return {
    tender: tender.data as TenderSubmissionData["tender"],
    bidSummary,
    elementalSummary: grouped.groups.map((g) => ({
      codeLetter: g.codeLetter,
      groupName: g.groupName,
      amount: g.subtotal,
      priced: g.subtotal > 0,
    })),
    preliminariesTotal,
    preliminariesItems,
    boqItemsGrouped: grouped,
    excludeItems,
    directWorksTotal,
    blendedRate,
    primaryExternalRefs,
  };
}

// ── Cover / Tender Summary ───────────────────────────────────────────────────

export async function getTenderCoverSummary(tenderId: string, bidSummaryId?: string): Promise<TenderCoverSummary> {
  const [grouped, bidSummaries] = await Promise.all([getBoqItemsGrouped(tenderId), getBidSummaries(tenderId)]);
  const bidSummary = bidSummaryId
    ? bidSummaries.find((b) => b.id === bidSummaryId) ?? null
    : bidSummaries[0] ?? null;
  const preliminariesTotal = await getPreliminariesTotal(tenderId);

  return {
    tenderId,
    elementalCostSummary: grouped.groups.map((g) => ({
      codeLetter: g.codeLetter,
      groupName: g.groupName,
      amount: g.subtotal,
      priced: g.subtotal > 0,
    })),
    directWorksTotal: grouped.grandTotal,
    preliminariesTotal,
    bidSummary,
  };
}
