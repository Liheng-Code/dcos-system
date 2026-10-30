// Planning public API: the parts of Planning's resource service that other
// modules and core may use. Whole-file contracts (work calendar, progress
// snapshots, baselines, activity steps) are listed in module-boundaries.mjs.
// Adding a name here widens the contract, so it is a deliberate, reviewed change.

export {
  // Task assignment from the WBS task sheet
  addAssignment,
  findOrCreateResourceForProfile,
} from "./resource-service";

// QS → Planning bridge (doc 21), run from the tender BOQ
export { listBridgeRules, listProjectBoqLines } from "./activity-library/qs-bridge-service";
export type { BridgeBoqLine, BridgeRule } from "./activity-library/qs-bridge";
export { listLevelGfa, listSavedLocations, listWbsLevels } from "./activity-library/location-map-service";
export type { SavedLocation, WbsLevel } from "./activity-library/location-map";
export {
  applyBridgeLinks,
  countBridgeLinks,
  listManualPairs,
  loadMasterRates,
  refreshTaskWorkFromLinks,
} from "./activity-library/bridge-calc-service";
export { computeBridgeLinks, type BridgeCalcResult, type MasterRate } from "./activity-library/bridge-calc";

// Requirement catalogues → project records (Phase 4): pickers in Document Control submittals and QA/QC ITPs
export {
  listCatalogueOptions,
  listProjectRequirements,
  type CatalogueOption,
  type Requirement,
  type RequirementRecord,
  type RequirementTask,
} from "./activity-library/requirement-status-service";
export {
  itpInspectionType,
  REQUIREMENT_KIND_LABEL,
  REQUIREMENT_STATE_LABEL,
  type RequirementKind,
  type RequirementState,
} from "./activity-library/requirement-status";

// Library pickers for Design schedules (MEP commissioning, material submittals, coordination log)
export {
  getChipOptionsByIds,
  searchCoordinationItems,
  searchMaterials,
  searchTcItems,
  type CoordinationItem,
  type MaterialOption,
  type TcItem,
} from "./activity-library/activity-chips-service";
export { TC_TYPE_LABEL } from "./activity-library/activity-chips-rules";
