// Allowed values of the CHECK constraints on the design_* schedule tables, as select options for GenericSchedule.

const opts = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

export const SUB_DISCIPLINES = opts([
  ["mechanical", "Mechanical"], ["electrical", "Electrical"], ["plumbing", "Plumbing"], ["fire_fighting", "Fire Fighting"], ["elv", "ELV"],
  ["hvac", "HVAC"], ["drainage", "Drainage"], ["water_supply", "Water Supply"], ["power", "Power"], ["lighting", "Lighting"],
  ["communication", "Communication"], ["security", "Security"], ["other", "Other"],
]);
export const SERVICE_TYPES = opts([
  ["mechanical", "Mechanical"], ["electrical", "Electrical"], ["plumbing", "Plumbing"], ["fire_fighting", "Fire Fighting"], ["elv", "ELV"],
  ["hvac", "HVAC"], ["drainage", "Drainage"], ["water_supply", "Water Supply"], ["other", "Other"],
]);
export const LOAD_TYPES = opts([["electrical", "Electrical"], ["mechanical", "Mechanical"], ["hvac", "HVAC"], ["plumbing", "Plumbing"], ["fire_fighting", "Fire Fighting"], ["other", "Other"]]);
export const FINISH_ELEMENTS = opts([["floor", "Floor"], ["wall", "Wall"], ["ceiling", "Ceiling"], ["base", "Base"], ["other", "Other"]]);
export const PRIORITIES = opts([["low", "Low"], ["normal", "Normal"], ["high", "High"], ["critical", "Critical"]]);

/** Arc door / window / finish schedules and room data. */
export const ARC_STATUS = opts([["draft", "Draft"], ["submitted", "Submitted"], ["approved", "Approved"], ["revised", "Revised"]]);
/** Material approvals and MEP material submittals. */
export const MATERIAL_STATUS = opts([["submitted", "Submitted"], ["under_review", "Under Review"], ["approved", "Approved"], ["rejected", "Rejected"], ["alternative_proposed", "Alternative Proposed"]]);
export const COMMISSIONING_STATUS = opts([["pending", "Pending"], ["scheduled", "Scheduled"], ["in_progress", "In Progress"], ["passed", "Passed"], ["failed", "Failed"], ["closed", "Closed"]]);
export const TEST_RESULT = opts([["pass", "Pass"], ["fail", "Fail"], ["conditional_pass", "Conditional Pass"], ["not_tested", "Not Tested"]]);
export const EQUIPMENT_STATUS = opts([["draft", "Draft"], ["submitted", "Submitted"], ["approved", "Approved"], ["ordered", "Ordered"], ["delivered", "Delivered"], ["installed", "Installed"], ["commissioned", "Commissioned"]]);
export const SLEEVE_STATUS = opts([["draft", "Draft"], ["coordinated", "Coordinated"], ["approved", "Approved"], ["installed", "Installed"], ["closed", "Closed"]]);
export const CALC_STATUS = opts([["draft", "Draft"], ["submitted", "Submitted"], ["under_review", "Under Review"], ["approved", "Approved"], ["revised", "Revised"]]);
export const MODEL_STATUS = opts([["active", "Active"], ["revised", "Revised"], ["superseded", "Superseded"], ["archived", "Archived"]]);
export const REBAR_STATUS = opts([["submitted", "Submitted"], ["under_review", "Under Review"], ["approved", "Approved"], ["rejected", "Rejected"], ["re_submitted", "Re-submitted"], ["closed", "Closed"]]);
export const QUERY_STATUS = opts([["open", "Open"], ["answered", "Answered"], ["closed", "Closed"], ["cancelled", "Cancelled"]]);
export const CHANGE_STATUS = opts([["draft", "Draft"], ["submitted", "Submitted"], ["under_review", "Under Review"], ["approved", "Approved"], ["rejected", "Rejected"], ["implemented", "Implemented"], ["closed", "Closed"]]);
