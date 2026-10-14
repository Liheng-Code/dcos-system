// Starting values for a new project's setup, so it begins mostly configured instead of empty.
// These are the values the setup wizard always proposed. To make them editable by an
// administrator they would move to a company settings table.

export const DEFAULT_CALENDAR = {
  working_days: "Monday to Saturday",
  working_hours: "08:00 - 17:00",
  weekend_rule: "Sunday Off",
  holiday_calendar: "Cambodia National Calendar",
  shift_type: "Day Shift",
  exception_days: "",
};

export const DEFAULT_NUMBERING = {
  format_mask: "PROJECT-DISC-DOC-BLDG-LEVEL-SEQ-REV",
  discipline_codes: ["ARC", "STR", "MEP"],
  document_types: ["DWG", "RFI", "MRA", "MOS"],
  revision_format: "R00, R01, R02",
};

export const DEFAULT_BUDGET = {
  contingency: 5,
  cost_code_template: "Company Standard Cost Code",
  approval_limit_rule: "By Role and Amount",
};

export const DEFAULT_WBS_METHOD = "use_template";

export const DEFAULT_CURRENCY = "USD";
export const DEFAULT_TIME_ZONE = "Asia/Phnom_Penh";

// New tenders, as the pre-contract wizard proposed them.
export const DEFAULT_TENDER = {
  tender_type: "selective",
  procurement_method: "limited_bid",
  tender_days: 30,
};
