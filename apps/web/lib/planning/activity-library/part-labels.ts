// Names of a project's parts in its own words. Activity templates target WBS level types (basement, ground,
// typical, roof, mezzanine, podium) and chainage sections (segment). Non-building projects reuse those level
// types for their own parts, e.g. a bridge's "basement" template holds its foundations
// (supabase/migrations/20261021000010_activity_library_infrastructure.sql). The stored values stay as they are;
// only the labels change per sector / building type.

import type { ProjectKind } from "@/lib/template-fit";

const BUILDING: Record<string, string> = {
  basement: "Basement",
  ground: "Ground floor",
  podium: "Podium",
  mezzanine: "Mezzanine",
  typical: "Typical floor",
  roof: "Roof",
  segment: "Chainage section",
  site: "Site / external works",
};

const BY_BUILDING_TYPE: Record<string, Partial<Record<string, string>>> = {
  // villa / townhouse: the floors above ground are its upper floors
  luxury_villa: { typical: "Upper floor" },
  mansion_estate: { typical: "Upper floor" },
  private_residence: { typical: "Upper floor" },
  standard_villa: { typical: "Upper floor" },
  townhouse: { typical: "Upper floor" },
  residential_development: { typical: "Upper floor" },
  bridge: { basement: "Foundations", ground: "Substructure", typical: "Spans", roof: "Deck" },
  // road / drainage: the level-type templates are the culverts along the route
  road: { basement: "Culvert base", ground: "Culvert walls", typical: "Culvert top slab", roof: "Culvert headwalls" },
  drainage: { basement: "Culvert base / pump station", ground: "Culvert walls", typical: "Culvert top slab", roof: "Culvert headwalls" },
  water_supply: { basement: "Pump station" },
  utility: { basement: "Pump station" },
};

const BY_SECTOR: Record<string, Partial<Record<string, string>>> = {
  industrial: { basement: "Pits & trenches", typical: "Mezzanine", ground: "Ground slab & frame" },
};

/** Label of a level type (or "segment") for the project; unknown types are shown as they are. */
export function partLabel(levelType: string | null | undefined, kind: ProjectKind): string {
  if (!levelType) return "";
  return BY_BUILDING_TYPE[kind.buildingType ?? ""]?.[levelType]
    ?? BY_SECTOR[kind.sector ?? ""]?.[levelType]
    ?? BUILDING[levelType]
    ?? levelType.replace(/_/g, " ");
}
