import { PROJECT_SECTORS } from "@/lib/project-categories";

export type QsWbsTemplateFamily =
  | "building_low_rise"
  | "building_multi_storey"
  | "commercial_mixed_use"
  | "industrial_large_span"
  | "infrastructure_linear";

export type QsWbsLocationModel = "building" | "campus" | "facility" | "linear";

export interface QsWbsCategoryProfile {
  sector: string;
  buildingType: string;
  primaryFamily: QsWbsTemplateFamily;
  alternativeFamilies: QsWbsTemplateFamily[];
  locationModel: QsWbsLocationModel;
  requiresScopeReview?: boolean;
}

/**
 * Initial category-to-family recommendation matrix. These are suggestions only;
 * scale, phasing, and package scope can justify another family.
 */
export const QS_WBS_CATEGORY_PROFILES: QsWbsCategoryProfile[] = [
  ...[
    ["luxury_villa", "building_low_rise"], ["mansion_estate", "building_low_rise"],
    ["private_residence", "building_low_rise"], ["standard_villa", "building_low_rise"],
    ["townhouse", "building_low_rise"],
    ["apartment", "building_low_rise", "building_multi_storey"],
    ["condominium", "building_multi_storey"], ["residential_tower", "building_multi_storey"],
    ["residential_development", "commercial_mixed_use", "building_low_rise", true],
  ].map(([buildingType, primaryFamily, alternativeFamily, review]) => ({
    sector: "residential", buildingType: String(buildingType), primaryFamily: primaryFamily as QsWbsTemplateFamily,
    alternativeFamilies: alternativeFamily ? [alternativeFamily as QsWbsTemplateFamily] : [], locationModel: "building" as const,
    ...(review ? { requiresScopeReview: true } : {}),
  })),
  ...[
    ["showroom", "building_low_rise"], ["office_building", "building_multi_storey"],
    ["shopping_mall", "commercial_mixed_use", "building_multi_storey", true],
    ["retail_building", "building_low_rise", "commercial_mixed_use"],
    ["mixed_use_building", "commercial_mixed_use", "building_multi_storey", true],
    ["hotel", "building_multi_storey"], ["restaurant", "building_low_rise"],
  ].map(([buildingType, primaryFamily, alternativeFamily, review]) => ({
    sector: "commercial", buildingType: String(buildingType), primaryFamily: primaryFamily as QsWbsTemplateFamily,
    alternativeFamilies: alternativeFamily ? [alternativeFamily as QsWbsTemplateFamily] : [], locationModel: "building" as const,
    ...(review ? { requiresScopeReview: true } : {}),
  })),
  ...["factory", "warehouse", "manufacturing_facility", "logistics_center", "industrial_building"].map((buildingType) => ({
    sector: "industrial", buildingType, primaryFamily: "industrial_large_span" as const,
    alternativeFamilies: [] as QsWbsTemplateFamily[], locationModel: "facility" as const,
  })),
  ...[
    ["school", "building_low_rise", "campus", true], ["university", "commercial_mixed_use", "campus", true],
    ["hospital", "building_multi_storey", "campus", true], ["clinic", "building_low_rise", "building", false],
    ["government_building", "building_multi_storey", "building", true],
    ["religious_building", "building_low_rise", "building", false],
  ].map(([buildingType, primaryFamily, locationModel, review]) => ({
    sector: "institutional", buildingType: String(buildingType), primaryFamily: primaryFamily as QsWbsTemplateFamily,
    alternativeFamilies: [] as QsWbsTemplateFamily[], locationModel: locationModel as QsWbsLocationModel,
    ...(review ? { requiresScopeReview: true } : {}),
  })),
  ...["road", "bridge", "drainage", "water_supply", "utility", "other_infrastructure"].map((buildingType) => ({
    sector: "infrastructure", buildingType, primaryFamily: "infrastructure_linear" as const,
    alternativeFamilies: [] as QsWbsTemplateFamily[], locationModel: "linear" as const,
  })),
];

export function getQsWbsCategoryProfile(sector?: string | null, buildingType?: string | null) {
  if (!sector || !buildingType) return null;
  return QS_WBS_CATEGORY_PROFILES.find((profile) => profile.sector === sector && profile.buildingType === buildingType) ?? null;
}

/** Returns taxonomy entries that do not yet have an explicit QS family recommendation. */
export function getUnmappedQsWbsCategories(): Array<{ sector: string; buildingType: string }> {
  const mapped = new Set(QS_WBS_CATEGORY_PROFILES.map((profile) => `${profile.sector}:${profile.buildingType}`));
  return PROJECT_SECTORS.flatMap((sector) => sector.buildingTypes
    .filter((type) => !mapped.has(`${sector.value}:${type.value}`))
    .map((type) => ({ sector: sector.value, buildingType: type.value })));
}
