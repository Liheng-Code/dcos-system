// Units offered for tender BOQ lines. Shared by the BOQ form (boq-tab.tsx) and
// the AI drafting route, so AI-proposed lines always use a unit the form accepts.
export const BOQ_UNITS = ["m", "m2", "m3", "kg", "tonne", "pcs", "no", "set", "day", "hr", "ls", "months", "bag", "roll", "sheet", "trip"] as const;

export type BoqUnit = (typeof BOQ_UNITS)[number];
