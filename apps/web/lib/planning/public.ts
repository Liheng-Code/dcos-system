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
