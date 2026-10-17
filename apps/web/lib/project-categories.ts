// Project sector / building-type taxonomy.
// Source of truth: docs/04-Business-Modules/04-02-Project-Setup/Project Categories.md
//
// A project's `category` column stores the SECTOR slug; the `building_type`
// column stores the leaf building-type slug. This module is the single place
// the two-level list is defined — every create/edit form and the portfolio
// list import from here.

export interface BuildingType {
  value: string;
  label: string;
}

export interface ProjectSector {
  value: string; // stored in projects.category
  label: string;
  buildingTypes: BuildingType[]; // value stored in projects.building_type
}

export const PROJECT_SECTORS: ProjectSector[] = [
  {
    value: "residential",
    label: "Residential",
    buildingTypes: [
      { value: "luxury_villa", label: "Luxury Villa" },
      { value: "mansion_estate", label: "Mansion / Estate" },
      { value: "private_residence", label: "Private Residence" },
      { value: "standard_villa", label: "Standard Villa" },
      { value: "townhouse", label: "Townhouse" },
      { value: "apartment", label: "Apartment" },
      { value: "condominium", label: "Condominium" },
      { value: "residential_tower", label: "Residential Tower" },
      { value: "residential_development", label: "Residential Development" },
    ],
  },
  {
    value: "commercial",
    label: "Commercial",
    buildingTypes: [
      { value: "showroom", label: "Showroom" },
      { value: "office_building", label: "Office Building" },
      { value: "shopping_mall", label: "Shopping Mall" },
      { value: "retail_building", label: "Retail Building" },
      { value: "mixed_use_building", label: "Mixed-Use Building" },
      { value: "hotel", label: "Hotel" },
      { value: "restaurant", label: "Restaurant" },
    ],
  },
  {
    value: "industrial",
    label: "Industrial",
    buildingTypes: [
      { value: "factory", label: "Factory" },
      { value: "warehouse", label: "Warehouse" },
      { value: "manufacturing_facility", label: "Manufacturing Facility" },
      { value: "logistics_center", label: "Logistics Center" },
      { value: "industrial_building", label: "Industrial Building" },
    ],
  },
  {
    value: "institutional",
    label: "Institutional",
    buildingTypes: [
      { value: "school", label: "School" },
      { value: "university", label: "University" },
      { value: "hospital", label: "Hospital" },
      { value: "clinic", label: "Clinic" },
      { value: "government_building", label: "Government Building" },
      { value: "religious_building", label: "Religious Building" },
    ],
  },
  {
    value: "infrastructure",
    label: "Infrastructure",
    buildingTypes: [
      { value: "road", label: "Road" },
      { value: "bridge", label: "Bridge" },
      { value: "drainage", label: "Drainage" },
      { value: "water_supply", label: "Water Supply" },
      { value: "utility", label: "Utility" },
      { value: "other_infrastructure", label: "Other Infrastructure" },
    ],
  },
];

// Legacy sector slugs from the previous flat `category` list, kept so rows
// created before this taxonomy still render a readable label.
const LEGACY_SECTOR_LABELS: Record<string, string> = {
  building: "Building",
  high_rise: "High Rise",
  mixed_use: "Mixed Use",
  other: "Other",
};

export const SECTOR_LABELS: Record<string, string> = {
  ...LEGACY_SECTOR_LABELS,
  ...Object.fromEntries(PROJECT_SECTORS.map((s) => [s.value, s.label])),
};

export const BUILDING_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  PROJECT_SECTORS.flatMap((s) => s.buildingTypes.map((t) => [t.value, t.label])),
);

export function buildingTypesForSector(sector?: string | null, customList: CustomCategoryRecord[] = []): BuildingType[] {
  const all = getAllSectors(customList);
  return all.find((s) => s.value === sector)?.buildingTypes ?? [];
}

function humanize(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function sectorLabel(v?: string | null): string {
  if (!v) return "";
  return SECTOR_LABELS[v] ?? humanize(v);
}

export function buildingTypeLabel(v?: string | null): string {
  if (!v) return "";
  return BUILDING_TYPE_LABELS[v] ?? humanize(v);
}

// ── Custom Categories DB Integration ─────────────────────────────────────────

export interface CustomCategoryRecord {
  id: string;
  category_type: "sector" | "building_type";
  sector_slug: string | null;
  slug: string;
  label: string;
  created_at: string;
}

export async function fetchCustomCategories(): Promise<CustomCategoryRecord[]> {
  try {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase
      .from("project_custom_categories")
      .select("*")
      .order("label", { ascending: true });
    return (data as CustomCategoryRecord[]) ?? [];
  } catch {
    return [];
  }
}

export async function saveCustomCategory(params: {
  category_type: "sector" | "building_type";
  label: string;
  sector_slug?: string | null;
}): Promise<CustomCategoryRecord | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const slug =
    params.label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "custom_" + Date.now();

  const { data, error } = await supabase
    .from("project_custom_categories")
    .insert({
      category_type: params.category_type,
      sector_slug: params.sector_slug || null,
      slug,
      label: params.label.trim(),
    })
    .select()
    .single();

  if (error) throw error;
  return data as CustomCategoryRecord;
}

export function getAllSectors(customList: CustomCategoryRecord[] = []): ProjectSector[] {
  const customSectors = customList
    .filter((c) => c.category_type === "sector")
    .map((c) => {
      const customTypes = customList
        .filter((b) => b.category_type === "building_type" && b.sector_slug === c.slug)
        .map((b) => ({ value: b.slug, label: b.label }));
      return {
        value: c.slug,
        label: c.label,
        buildingTypes: customTypes,
      };
    });

  const standardWithCustom = PROJECT_SECTORS.map((s) => {
    const extraTypes = customList
      .filter((b) => b.category_type === "building_type" && b.sector_slug === s.value)
      .map((b) => ({ value: b.slug, label: b.label }));
    return {
      ...s,
      buildingTypes: [...s.buildingTypes, ...extraTypes],
    };
  });

  return [...standardWithCustom, ...customSectors];
}
