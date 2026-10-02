import { DISCIPLINE_MAP, BOQ_EXACT_FIELD_MAP, BOQ_PREFIX_FIELD_MAP } from "./bim-types";
import type { LevelInfo, DisciplineInfo, ElementProperty, PropertySet, ElementProperties, SpatialTreeNode, BimElementTakeoff } from "./bim-types";

const SPATIAL_NODE_TYPES: Record<string, SpatialTreeNode["type"]> = {
  IFCPROJECT: "project",
  IFCSITE: "site",
  IFCBUILDING: "building",
  IFCBUILDINGSTOREY: "storey",
};

export interface SpatialStructureItem {
  category: string | null;
  localId: number | null;
  children?: SpatialStructureItem[];
}

export function buildSpatialTree(
  item: SpatialStructureItem,
  dataByLocalId: Map<number, Record<string, unknown>>,
  modelId: string,
  path = "0",
): SpatialTreeNode {
  const data = item.localId !== null ? dataByLocalId.get(item.localId) : undefined;
  const rawName = (data?.["Name"] as { value?: unknown } | undefined)?.value;
  const category = item.category ?? "Model";
  const name = rawName ? String(rawName) : category.replace(/^IFC/i, "");
  const children = item.children ?? [];

  return {
    id: item.localId !== null ? `${modelId}-${item.localId}` : `${modelId}-${path}`,
    name,
    type: SPATIAL_NODE_TYPES[category.toUpperCase()] ?? "element",
    expressId: item.localId ?? undefined,
    modelId,
    visible: true,
    children: children.map((child, i) => buildSpatialTree(child, dataByLocalId, modelId, `${path}-${i}`)),
  };
}

export function extractStoreysFromData(
  itemsData: Record<string, unknown>[],
  modelId: string,
): LevelInfo[] {
  const storeys: LevelInfo[] = [];
  for (const item of itemsData) {
    const ifcClass = (item as Record<string, unknown>)?.expressType ?? (item as Record<string, unknown>)?.type;
    if (ifcClass === "IFCBUILDINGSTOREY" || (item as Record<string, unknown>)?.type === "IfcBuildingStorey") {
    const rawName = item?.Name;
    const name = (rawName && typeof rawName === "object" && "value" in rawName ? (rawName as { value: unknown }).value : item?.name) ?? "Unknown Level";
    const rawElev = item?.Elevation;
    const elevation = (rawElev && typeof rawElev === "object" && "value" in rawElev ? (rawElev as { value: unknown }).value : item?.elevation) ?? 0;
      const expressId = (item as Record<string, unknown>)?.expressID
        ?? (item as Record<string, unknown>)?.expressId
        ?? 0;
      storeys.push({
        expressId: Number(expressId),
        name: String(name),
        elevation: Number(elevation),
        modelId,
        visible: true,
        elementCount: 0,
      });
    }
  }
  return storeys.sort((a, b) => a.elevation - b.elevation);
}

// getItemsData() nests each item's IFC class under `_category: { value }`
// (see FragmentsModel.getItemData in @thatopen/fragments) — there is no
// "expressType" or "type" key on the returned ItemData, despite that being
// the obvious guess. Reading those (as this file's callers used to) silently
// resolves to undefined for every element, which is why discipline counts
// were all landing on "UNKNOWN" and the Disciplines panel rendered empty.
export function getItemCategory(item: Record<string, unknown> | undefined | null): string {
  const raw = item?.["_category"];
  if (raw && typeof raw === "object" && "value" in (raw as Record<string, unknown>)) {
    return String((raw as { value: unknown }).value ?? "UNKNOWN");
  }
  if (raw !== undefined && raw !== null) return String(raw);
  return "UNKNOWN";
}

export function mapIfcClassToDiscipline(ifcClass: string): string {
  const normalized = ifcClass.toUpperCase().replace("IFC", "IFC");
  for (const [code, info] of Object.entries(DISCIPLINE_MAP)) {
    if (info.ifcClasses.includes(normalized) || info.ifcClasses.includes(ifcClass.toUpperCase())) {
      return code;
    }
  }
  return "FED";
}

export function buildDisciplineInfo(
  elementsByClass: Map<string, number>,
  modelId: string,
): DisciplineInfo[] {
  const disciplines: DisciplineInfo[] = [];
  for (const [code, info] of Object.entries(DISCIPLINE_MAP)) {
    let count = 0;
    for (const cls of info.ifcClasses) {
      count += elementsByClass.get(cls.toUpperCase()) ?? 0;
      count += elementsByClass.get(cls) ?? 0;
    }
    disciplines.push({
      name: code,
      label: info.label,
      ifcClasses: info.ifcClasses,
      visible: true,
      elementCount: count,
      modelId,
    });
  }
  return disciplines;
}

// The fragments library returns Property Sets/Quantity Sets as a real IFC
// relational graph, not a flat dict: an item's `IsDefinedBy` key (present
// when getItemsData() was called with relationsDefault/relations including
// IsDefinedBy — see the JSDoc example on FragmentsModel.getItemsData) is an
// array of nested Pset/Qto items. A regular Pset carries its values under
// `HasProperties` (each `{ Name, NominalValue }`); a Quantity Set carries
// them under `Quantities` (each `{ Name, <Length|Area|Volume|Weight|Count>Value }`)
// — structurally distinct, so unlike a name-sniffing heuristic this can tell
// them apart directly from the relation shape itself.
function unwrapValue(v: unknown): string | undefined {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    const inner = (v as { value: unknown }).value;
    return inner === null || inner === undefined ? undefined : String(inner);
  }
  if (v !== undefined && v !== null) return String(v);
  return undefined;
}

interface RelatedPropertyGroup {
  name: string;
  properties: { name: string; value: string }[];
  isQuantitySet: boolean;
}

function collectPropertySetsFromRelations(itemData: Record<string, unknown>): RelatedPropertyGroup[] {
  const definedBy = itemData["IsDefinedBy"];
  if (!Array.isArray(definedBy)) return [];

  const groups: RelatedPropertyGroup[] = [];
  for (const entry of definedBy) {
    if (!entry || typeof entry !== "object") continue;
    const rel = entry as Record<string, unknown>;
    const groupName = unwrapValue(rel["Name"]) ?? "Unnamed";

    const hasProperties = rel["HasProperties"];
    if (Array.isArray(hasProperties) && hasProperties.length > 0) {
      const properties: RelatedPropertyGroup["properties"] = [];
      for (const prop of hasProperties) {
        if (!prop || typeof prop !== "object") continue;
        const p = prop as Record<string, unknown>;
        const name = unwrapValue(p["Name"]);
        const value = unwrapValue(p["NominalValue"]);
        if (name && value !== undefined) properties.push({ name, value });
      }
      if (properties.length > 0) groups.push({ name: groupName, properties, isQuantitySet: false });
    }

    const quantitiesRel = rel["Quantities"];
    if (Array.isArray(quantitiesRel) && quantitiesRel.length > 0) {
      const properties: RelatedPropertyGroup["properties"] = [];
      for (const q of quantitiesRel) {
        if (!q || typeof q !== "object") continue;
        const qq = q as Record<string, unknown>;
        const name = unwrapValue(qq["Name"]);
        const value = unwrapValue(qq["LengthValue"]) ?? unwrapValue(qq["AreaValue"]) ?? unwrapValue(qq["VolumeValue"])
          ?? unwrapValue(qq["WeightValue"]) ?? unwrapValue(qq["CountValue"]) ?? unwrapValue(qq["TimeValue"]);
        if (name && value !== undefined) properties.push({ name, value });
      }
      if (properties.length > 0) groups.push({ name: groupName, properties, isQuantitySet: true });
    }
  }
  return groups;
}

export function extractPropertiesFromItemData(itemData: Record<string, unknown>): ElementProperties {
  const get = (key: string): string | undefined => unwrapValue(itemData[key]);

  // The fragments library extracts IFC's GlobalId during import and stores it
  // separately as `_guid` (not as a `GlobalId` attribute) — see
  // getItemData() in @thatopen/fragments, which always seeds every item's
  // data with `{ _category, _localId, _guid }` before adding named attributes.
  const globalId = get("_guid") ?? "";
  const ifcClass = get("_category") ?? "";
  const name = get("Name") ?? "";
  const tag = get("Tag");
  const objectType = get("ObjectType");
  const description = get("Description");

  const propertySets: PropertySet[] = [];
  const quantities: ElementProperty[] = [];
  for (const group of collectPropertySetsFromRelations(itemData)) {
    if (group.isQuantitySet) {
      quantities.push(...group.properties);
    } else {
      propertySets.push({ name: group.name, properties: group.properties });
    }
  }

  const materials: ElementProperties["materials"] = [];
  const mats = itemData["materials"];
  if (Array.isArray(mats)) {
    for (const m of mats) {
      if (typeof m === "object" && m !== null) {
        const mo = m as Record<string, unknown>;
        materials.push({ name: String(mo.name ?? mo.Name ?? "Unknown") });
      }
    }
  }

  const storey = get("storey") ?? get("buildingStorey");
  const building = get("building");
  const site = get("site");
  const locationParts = [site, building, storey].filter(Boolean);
  const location = locationParts.length > 0 ? locationParts.join(" > ") : undefined;

  return {
    globalId,
    ifcClass,
    name,
    tag,
    objectType,
    description,
    location,
    propertySets,
    quantities,
    materials,
  };
}

type TakeoffFields = Omit<BimElementTakeoff, "id" | "tenant_id" | "model_id" | "extracted_by" | "extracted_at">;

// Flattens an item's direct attributes + every Pset's properties into one
// lowercased-key -> value map (first match wins, so a direct IFC attribute
// takes priority over a same-named Pset property), then matches it against
// BOQ_EXACT_FIELD_MAP / BOQ_PREFIX_FIELD_MAP to build a takeoff row. Returns
// null only when there's no GlobalId to key the row on; otherwise always
// returns a row (even a sparse one) so gaps are visible in the staging table
// rather than silently dropping elements.
export function extractBoqFieldsFromItemData(itemData: Record<string, unknown>): TakeoffFields | null {
  const get = (key: string): string | undefined => unwrapValue(itemData[key]);

  // See extractPropertiesFromItemData above — GlobalId is surfaced as `_guid`,
  // not as a `GlobalId` attribute.
  const globalId = get("_guid");
  if (!globalId) return null;

  const flat = new Map<string, string>();
  const setIfAbsent = (key: string, value: string | undefined) => {
    const lower = key.toLowerCase();
    if (value !== undefined && value !== "" && !flat.has(lower)) flat.set(lower, value);
  };

  for (const [key, value] of Object.entries(itemData)) {
    if (key.startsWith("_") || Array.isArray(value)) continue;
    if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
      setIfAbsent(key, String((value as { value: unknown }).value ?? ""));
    } else if (value !== undefined && value !== null && typeof value !== "object") {
      setIfAbsent(key, String(value));
    }
  }

  for (const group of collectPropertySetsFromRelations(itemData)) {
    for (const prop of group.properties) {
      setIfAbsent(prop.name, prop.value);
    }
  }

  const flatKeys = Array.from(flat.keys());
  const result: TakeoffFields = {
    global_id: globalId,
    ifc_class: get("_category"),
    raw_properties: Object.fromEntries(flat),
  };

  for (const [sourceKey, targetField] of Object.entries(BOQ_EXACT_FIELD_MAP)) {
    const value = flat.get(sourceKey);
    if (value === undefined) continue;
    if (targetField === "quantity") {
      const num = Number(value);
      result.quantity = Number.isNaN(num) ? null : num;
    } else {
      (result as Record<string, unknown>)[targetField] = value;
    }
  }

  for (const [prefix, targetField] of Object.entries(BOQ_PREFIX_FIELD_MAP)) {
    const matchKey = flatKeys.find((k) => k.startsWith(prefix));
    if (matchKey) (result as Record<string, unknown>)[targetField] = flat.get(matchKey);
  }

  return result;
}

export function countElementsPerClass(
  allItemData: Record<string, unknown>[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of allItemData) {
    const cls = getItemCategory(item);
    counts.set(cls, (counts.get(cls) ?? 0) + 1);
  }
  return counts;
}

// Walk the IFC spatial tree to build a localId → story name map.
// The spatial structure is: Project → Site → Building → Storey → Elements.
// Each storey node's children (recursively) are the elements contained in it.
export function buildStoryMapFromSpatialTree(
  spatialNodes: SpatialTreeNode[],
): Map<number, string> {
  const map = new Map<number, string>();

  function walk(nodes: SpatialTreeNode[], storyName: string) {
    for (const node of nodes) {
      if (node.type === "storey") {
        // This is a storey — walk its children with this story's name
        walk(node.children, node.name);
      } else if (node.type === "element" && node.expressId !== undefined) {
        // Leaf element — assign it to the current story
        if (storyName) map.set(node.expressId, storyName);
      } else {
        // Intermediate container (project/site/building) — pass story name through
        walk(node.children, storyName);
      }
    }
  }

  walk(spatialNodes, "");
  return map;
}

// Build a localId → story name map using bounding-box proximity.
// For each element, its center Y is compared to each storey's elevation to
// find the nearest storey. This works even when the IFC spatial hierarchy
// lacks IFCBUILDINGSTOREY nodes (common in structural exports).
// `boxes` must be the result of fragModel.getBoxes(localIds).
export function buildStoryMapFromBoundingBox(
  localIds: number[],
  boxes: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }[],
  storeys: LevelInfo[],
): Map<number, string> {
  const map = new Map<number, string>();
  if (storeys.length === 0) return map;

  // Pre-sort storeys by elevation for clarity
  const sorted = [...storeys].sort((a, b) => a.elevation - b.elevation);

  for (let i = 0; i < localIds.length; i++) {
    const box = boxes[i];
    if (!box) continue;
    const centerY = (box.min.y + box.max.y) / 2;

    let nearest = sorted[0];
    let nearestDist = Math.abs(centerY - nearest.elevation);
    for (let j = 1; j < sorted.length; j++) {
      const dist = Math.abs(centerY - sorted[j].elevation);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = sorted[j];
      }
    }
    map.set(localIds[i], nearest.name);
  }

  return map;
}

// Build a localId → IFC class map from items data.
export function buildClassMapFromData(
  itemsData: Record<string, unknown>[],
  localIds: number[],
): Map<number, string> {
  const map = new Map<number, string>();
  localIds.forEach((id, i) => {
    const item = itemsData[i] as Record<string, unknown>;
    const cls = getItemCategory(item);
    if (cls && cls !== "UNKNOWN") map.set(id, cls);
  });
  return map;
}
