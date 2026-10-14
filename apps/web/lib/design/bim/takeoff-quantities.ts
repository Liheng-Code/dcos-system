// Takeoff quantities from IFC item data (BIM module). Pure: works on the item-data shape returned by
// FragmentsModel.getItemsData(ids, { attributesDefault: true, relationsDefault: { attributes: true, relations: true } }),
// where an element's `IsDefinedBy` is an array of nested property / quantity sets and its `ContainedInStructure`
// the storey it sits in.
//
// Why this exists: the original mapping only recognised a property literally named "volume" (a project-specific Revit
// parameter), so a standard IFC export - whose quantities are called NetVolume, GrossVolume, NetArea, Weight ... inside
// an IfcElementQuantity - produced rows with no quantity, no unit and no storey. This module reads the standard base
// quantities, scales them to metres / square metres / cubic metres / kilograms using the model's own length unit, takes
// the storey from the model's spatial structure, and derives rebar weight from bar geometry when none is stored.

type ItemData = Record<string, unknown>;

export function unwrap(v: unknown): string | undefined {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    const inner = (v as { value: unknown }).value;
    return inner === null || inner === undefined ? undefined : String(inner);
  }
  return v !== undefined && v !== null && typeof v !== "object" ? String(v) : undefined;
}

const num = (v: unknown): number | null => {
  const s = unwrap(v);
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Enumerations arrive as ".MILLI." or "MILLI": both mean MILLI. */
const enumValue = (v: unknown): string => (unwrap(v) ?? "").replace(/\./g, "").trim().toUpperCase();

export const categoryOf = (item: ItemData): string => (unwrap(item["_category"]) ?? "").toUpperCase();

// ── which entities are physical elements ─────────────────────────────────

/** Entities that carry a GlobalId but are not building elements: relationships, property/quantity sets, types, groups, spatial containers. */
const NOT_ELEMENTS: RegExp[] = [
  /^IFCREL/, /^IFCPROPERTY/, /^IFCELEMENTQUANTITY$/, /^IFCQUANTITY/, /TYPE$/, /^IFCGROUP$/, /^IFCZONE$/, /^IFCSYSTEM$/, /^IFCDISTRIBUTIONSYSTEM$/,
  /^IFCPROJECT$/, /^IFCSITE$/, /^IFCBUILDING$/, /^IFCBUILDINGSTOREY$/, /^IFCSPACE$/, /^IFCOPENINGELEMENT$/, /^IFCANNOTATION$/, /^IFCGRID$/,
  /^IFCPERMIT$/, /^IFCTASK$/, /^IFCPROCEDURE$/, /^IFCWORKPLAN$/, /^IFCWORKSCHEDULE$/, /^IFCACTOR$/, /^IFCCOSTITEM$/, /^IFCCOSTSCHEDULE$/,
];

export function isPhysicalElement(category: string): boolean {
  const c = category.toUpperCase();
  return c.startsWith("IFC") && c.length > 3 && !NOT_ELEMENTS.some((re) => re.test(c));
}

// ── units ────────────────────────────────────────────────────────────────

export interface UnitScales {
  /** metres per model length unit */
  length: number;
  /** true when no length unit was found in the data and metres were assumed */
  assumed: boolean;
  /** what the scale was read from, for the audit trail */
  basis: string;
}

const PREFIX: Record<string, number> = { EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3, HECTO: 1e2, DECA: 10, DECI: 0.1, CENTI: 0.01, MILLI: 0.001, MICRO: 1e-6, NANO: 1e-9 };
const NAMED_LENGTH: Record<string, number> = { METRE: 1, METER: 1, FOOT: 0.3048, INCH: 0.0254, YARD: 0.9144, MILE: 1609.344 };

/** Reads the project's length unit from IFCSIUNIT / IFCCONVERSIONBASEDUNIT items; metres are assumed (and flagged) when none is present. */
export function detectUnitScales(allItems: ItemData[]): UnitScales {
  for (const it of allItems) {
    const cat = categoryOf(it);
    if (cat === "IFCSIUNIT" && enumValue(it["UnitType"]) === "LENGTHUNIT") {
      const prefix = enumValue(it["Prefix"]);
      const scale = prefix ? PREFIX[prefix] : 1;
      if (scale) return { length: scale, assumed: false, basis: `IFCSIUNIT ${prefix || "metre"}` };
    }
  }
  for (const it of allItems) {
    if (categoryOf(it) === "IFCCONVERSIONBASEDUNIT" && enumValue(it["UnitType"]) === "LENGTHUNIT") {
      const name = (unwrap(it["Name"]) ?? "").toUpperCase();
      const known = Object.entries(NAMED_LENGTH).find(([k]) => name.includes(k));
      if (known) return { length: known[1], assumed: false, basis: `IFCCONVERSIONBASEDUNIT ${name.toLowerCase()}` };
    }
  }
  return { length: 1, assumed: true, basis: "no length unit in the data: metres assumed" };
}

// ── reading quantities ───────────────────────────────────────────────────

export type QuantityKind = "volume" | "area" | "length" | "weight" | "count";

interface FoundQuantity { set: string; name: string; kind: QuantityKind; value: number; stored: boolean }

const KIND_KEYS: [string, QuantityKind][] = [["VolumeValue", "volume"], ["AreaValue", "area"], ["LengthValue", "length"], ["WeightValue", "weight"], ["CountValue", "count"]];

function kindFromName(name: string): QuantityKind | null {
  const n = name.toLowerCase();
  if (/volume/.test(n)) return "volume";
  if (/area/.test(n)) return "area";
  if (/weight|mass/.test(n)) return "weight";
  if (/^(length|net ?length|gross ?length|width|height|perimeter)$/.test(n)) return "length";
  return null;
}

/** Every quantity of an element: IfcElementQuantity entries (typed) and numeric property-set properties whose name says what they are. */
export function collectQuantities(item: ItemData): FoundQuantity[] {
  const out: FoundQuantity[] = [];
  const definedBy = item["IsDefinedBy"];
  if (!Array.isArray(definedBy)) return out;
  for (const entry of definedBy) {
    if (!entry || typeof entry !== "object") continue;
    const set = entry as Record<string, unknown>;
    const setName = unwrap(set["Name"]) ?? "";
    const quantities = set["Quantities"];
    if (Array.isArray(quantities)) {
      for (const q of quantities) {
        if (!q || typeof q !== "object") continue;
        const qq = q as Record<string, unknown>;
        const name = unwrap(qq["Name"]);
        if (!name) continue;
        for (const [key, kind] of KIND_KEYS) {
          const value = num(qq[key]);
          if (value !== null) { out.push({ set: setName, name, kind, value, stored: true }); break; }
        }
      }
    }
    const props = set["HasProperties"];
    if (Array.isArray(props)) {
      for (const p of props) {
        if (!p || typeof p !== "object") continue;
        const pp = p as Record<string, unknown>;
        const name = unwrap(pp["Name"]);
        const value = num(pp["NominalValue"]);
        const kind = name ? kindFromName(name) : null;
        if (name && kind && value !== null) out.push({ set: setName, name, kind, value, stored: false });
      }
    }
  }
  return out;
}

/** Preferred names per kind, best first. Net before gross: planning wants what is actually built. */
const PREFERRED: Record<QuantityKind, string[]> = {
  volume: ["NetVolume", "GrossVolume", "Volume"],
  area: ["NetArea", "NetSideArea", "NetFootprintArea", "GrossArea", "GrossSideArea", "GrossFootprintArea", "Area", "CrossSectionArea"],
  length: ["Length", "NetLength", "GrossLength"],
  weight: ["NetWeight", "GrossWeight", "Weight", "Mass"],
  count: ["Count"],
};

/** The area a planner means depends on the element: walls are measured on their side face, slabs on plan. */
function areaOrder(category: string): string[] {
  if (/WALL|COLUMN|BEAM|MEMBER/.test(category)) return ["NetSideArea", "GrossSideArea", "NetArea", "GrossArea", "Area"];
  return PREFERRED.area;
}

function pick(found: FoundQuantity[], kind: QuantityKind, order: string[]): FoundQuantity | null {
  const ofKind = found.filter((f) => f.kind === kind && f.value > 0);
  for (const name of order) {
    // a stored IfcElementQuantity beats a same-named property
    const hit = ofKind.filter((f) => f.name.toLowerCase() === name.toLowerCase()).sort((a, b) => Number(b.stored) - Number(a.stored))[0];
    if (hit) return hit;
  }
  return null;
}

export interface ElementQuantity {
  /** the one quantity that goes in the table's quantity / unit columns */
  quantity: number;
  unit: "m3" | "m2" | "m" | "kg" | "nos";
  /** which quantity this is, for the audit trail */
  basis: string;
  /** every other quantity found, in its own unit: Planning reads these too (e.g. slab area next to slab volume) */
  extra: Partial<Record<"m3" | "m2" | "m" | "kg" | "nos", number>>;
}

const UNIT_OF: Record<QuantityKind, ElementQuantity["unit"]> = { volume: "m3", area: "m2", length: "m", weight: "kg", count: "nos" };

function scaled(kind: QuantityKind, value: number, s: UnitScales): number {
  const f = kind === "volume" ? s.length ** 3 : kind === "area" ? s.length ** 2 : kind === "length" ? s.length : 1;
  return Math.round(value * f * 1e6) / 1e6;
}

/** Primary quantity kind by element class: what a planner or estimator measures that element in. */
function primaryKind(category: string): QuantityKind {
  if (/REINFORCING|STIRRUP/.test(category)) return "weight";
  if (/COVERING|DOOR|WINDOW|PLATE|CURTAINWALL/.test(category)) return "area";
  if (/PIPE|DUCT|CABLE|RAILING/.test(category)) return "length";
  return "volume";
}

const STEEL_DENSITY_KG_M3 = 7850;

/** Reinforcement weight from the bar's own geometry (kg), when the export stored no weight. Metres in, kilograms out. */
export function rebarWeightFromGeometry(item: ItemData, s: UnitScales): number | null {
  const length = num(item["BarLength"]);
  if (length === null || length <= 0) return null;
  const area = num(item["CrossSectionArea"]);
  const diameter = num(item["NominalDiameter"]);
  const sectionM2 = area !== null && area > 0 ? area * s.length ** 2 : diameter !== null && diameter > 0 ? (Math.PI / 4) * (diameter * s.length) ** 2 : null;
  if (sectionM2 === null) return null;
  return Math.round(sectionM2 * (length * s.length) * STEEL_DENSITY_KG_M3 * 1e4) / 1e4;
}

export function elementQuantity(item: ItemData, scales: UnitScales): ElementQuantity | null {
  const category = categoryOf(item);
  const found = collectQuantities(item);
  const primary = primaryKind(category);
  const candidates: Partial<Record<QuantityKind, { value: number; basis: string }>> = {};

  for (const kind of ["volume", "area", "length", "weight", "count"] as QuantityKind[]) {
    const order = kind === "area" ? areaOrder(category) : PREFERRED[kind];
    const hit = pick(found, kind, order);
    if (hit) candidates[kind] = { value: scaled(kind, hit.value, scales), basis: `${hit.stored ? "IfcElementQuantity" : "property"} ${hit.name}` };
  }
  if (!candidates.weight && primary === "weight") {
    const w = rebarWeightFromGeometry(item, scales);
    if (w !== null) candidates.weight = { value: w, basis: "derived from bar length and section (7850 kg/m3)" };
  }

  // primary kind first, then the usual fallbacks in order of how useful they are for planning
  const order: QuantityKind[] = [primary, ...(["volume", "area", "weight", "length", "count"] as QuantityKind[]).filter((k) => k !== primary)];
  const chosen = order.find((k) => candidates[k]);
  if (!chosen) return null;

  const extra: ElementQuantity["extra"] = {};
  for (const k of order) if (k !== chosen && candidates[k]) extra[UNIT_OF[k]] = candidates[k]!.value;
  return { quantity: candidates[chosen]!.value, unit: UNIT_OF[chosen], basis: candidates[chosen]!.basis, extra };
}

// ── storey ───────────────────────────────────────────────────────────────

export interface StoreySources {
  /** localId -> storey name from the IFC spatial tree (Project > Site > Building > Storey > elements) */
  spatial?: Map<number, string>;
  /** localId -> nearest storey by bounding box (used only when the model has no usable spatial containment) */
  geometric?: Map<number, string>;
}

export interface StoreyResult { name: string; source: "containment" | "spatial-tree" | "geometry" }

export function elementStorey(item: ItemData, sources: StoreySources): StoreyResult | null {
  const contained = item["ContainedInStructure"];
  if (Array.isArray(contained)) {
    for (const c of contained) {
      if (!c || typeof c !== "object") continue;
      const name = unwrap((c as Record<string, unknown>)["Name"]);
      if (name) return { name, source: "containment" };
    }
  }
  const id = num(item["_localId"]);
  if (id !== null) {
    const fromTree = sources.spatial?.get(id);
    if (fromTree) return { name: fromTree, source: "spatial-tree" };
    const fromGeo = sources.geometric?.get(id);
    if (fromGeo) return { name: fromGeo, source: "geometry" };
  }
  return null;
}
