// Planning public API: the parts of Planning's resource service that other
// modules and core may use. Whole-file contracts (work calendar, progress
// snapshots, baselines, activity steps) are listed in module-boundaries.mjs.
// Adding a name here widens the contract, so it is a deliberate, reviewed change.

export {
  // Task assignment from the WBS task sheet
  addAssignment,
  findOrCreateResourceForProfile,
} from "./resource-service";
