// Builds the rows of bim_element_takeoff from a loaded model. Pure (the viewer passes in its item data and spatial tree).
// Order of precedence stays what it was: a project's own shared parameters ("Volume", "Reference Level", ...) win; the standard IFC
// quantities and the model's spatial structure only fill what those left empty.

import { buildStoryMapFromSpatialTree, extractBoqFieldsFromItemData } from "./ifc-helpers";
import type { BimElementTakeoff, SpatialTreeNode } from "./bim-types";
import { detectUnitScales, elementQuantity, elementStorey, isPhysicalElement, type UnitScales } from "./takeoff-quantities";


type ItemData = Record<string, unknown>;
export type TakeoffRow = Omit<BimElementTakeoff, "id" | "tenant_id" | "model_id" | "extracted_by" | "extracted_at">;

export interface ExtractionStats {
  items: number;
  elements: number;
  skippedNonElements: number;
  withQuantity: number;
  withStorey: number;
  /** elements whose quantity came from the standard IFC quantities (not from a project parameter) */
  quantityFromIfc: number;
  storeySources: Record<string, number>;
  scales: UnitScales;
}

export interface ExtractionResult { rows: TakeoffRow[]; stats: ExtractionStats }

const guessId = (item: ItemData): number | null => {
  const raw = item["_localId"];
  const v = raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>) ? (raw as { value: unknown }).value : raw;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function extractTakeoffRows(
  items: ItemData[],
  ctx: { spatialTree?: SpatialTreeNode[]; geometricStoreys?: Map<string, Map<number, string>> } = {},
): ExtractionResult {
  const scales = detectUnitScales(items);
  const spatial = ctx.spatialTree?.length ? buildStoryMapFromSpatialTree(ctx.spatialTree) : undefined;
  const geometric = new Map<number, string>();
  for (const m of ctx.geometricStoreys?.values() ?? []) for (const [id, name] of m) geometric.set(id, name);

  const stats: ExtractionStats = { items: items.length, elements: 0, skippedNonElements: 0, withQuantity: 0, withStorey: 0, quantityFromIfc: 0, storeySources: {}, scales };
  const rows: TakeoffRow[] = [];

  for (const item of items) {
    const base = extractBoqFieldsFromItemData(item);
    if (!base) continue; // no GlobalId: nothing to key a row on
    if (!isPhysicalElement(base.ifc_class ?? "")) { stats.skippedNonElements++; continue; }
    stats.elements++;
    const row: TakeoffRow = { ...base, raw_properties: { ...base.raw_properties } };

    if (row.quantity == null || !row.unit) {
      const q = elementQuantity(item, scales);
      if (q) {
        if (row.quantity == null) { row.quantity = q.quantity; row.unit = q.unit; stats.quantityFromIfc++; }
        row.raw_properties._quantity_basis = q.basis;
        // keep the primary as well so Planning can read every unit from one place
        row.raw_properties._quantities = { [q.unit]: q.quantity, ...q.extra };
      }
    }
    if (row.quantity != null && row.quantity > 0) stats.withQuantity++;

    if (!row.building_level && !row.level) {
      const s = elementStorey(item, { spatial, geometric });
      if (s) {
        row.building_level = s.name;
        row.raw_properties._level_source = s.source;
        stats.storeySources[s.source] = (stats.storeySources[s.source] ?? 0) + 1;
      }
    }
    if (row.building_level || row.level) stats.withStorey++;
    row.raw_properties._unit_scale = scales.basis;
    rows.push(row);
  }
  return { rows, stats };
}

/** One line for the toolbar: what was extracted and what is still missing. */
export function describeExtraction(s: ExtractionStats): string {
  const pct = (n: number) => (s.elements ? Math.round((n / s.elements) * 100) : 0);
  const parts = [`${s.elements} elements`, `${pct(s.withQuantity)}% with a quantity`, `${pct(s.withStorey)}% with a storey`];
  if (s.skippedNonElements > 0) parts.push(`${s.skippedNonElements} non-element records skipped`);
  if (s.scales.assumed) parts.push("model length unit not found: metres assumed");
  return parts.join(" · ");
}
