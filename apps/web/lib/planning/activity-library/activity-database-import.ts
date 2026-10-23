// Pure parse + validate for the Activity Database Excel import (no I/O).
// Sheet "Activities": CSI division (MasterFormat 2016, two digits), optional CSI section, visible code, code, name, unit, trade, type, min %, max %, description.
// Sheet "BOQ links": activity visible code or code, work item code, days per unit, share %.

import { divisionOfSection, formatSectionCode, isValidSectionCode } from "@/lib/csi-divisions";
import { isValidDivisionCode, normalizeDivisionCode, parseVisibleCode } from "./visible-code";

export const ACTIVITY_TYPES = ["construction", "procurement", "design", "submittal", "testing", "milestone"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITIES_SHEET = "Activities";
export const LINKS_SHEET = "BOQ links";
export const ACTIVITY_HEADERS = ["Division Code", "CSI Section", "Visible Code", "Code", "Name", "Unit", "Trade", "Type", "Min %", "Max %", "Description"];
export const LINK_HEADERS = ["Activity Code", "Work Item Code", "Days/Unit", "%"];

export type RawRow = Record<string, unknown>;
export interface RawSheets { activities: RawRow[]; links: RawRow[] }

export interface ImportActivity {
  /** Spreadsheet row number (header = row 1). */
  row: number;
  /** CSI division, two digits (csi_divisions.code). */
  divisionCode: string;
  /** CSI section "xx yy zz" (csi_sections.code) or null. */
  sectionCode: string | null;
  visibleCode: string | null;
  code: string | null;
  name: string;
  unit: string | null;
  trade: string | null;
  activityType: ActivityType | null;
  minPct: number | null;
  maxPct: number | null;
  description: string | null;
}

export interface ImportLink {
  row: number;
  /** Activity visible code or code, upper-cased. */
  activityRef: string;
  workItemCode: string;
  daysPerUnit: number | null;
  sharePct: number;
}

export interface ImportError { sheet: string; row: number; message: string }
/** Codes loaded from the core CSI library, used to reject unknown divisions / sections. Omit to check formats only. */
export interface ImportValidationOptions {
  knownDivisions?: ReadonlySet<string>;
  knownSections?: ReadonlySet<string>;
}
export interface ParsedImport { activities: ImportActivity[]; links: ImportLink[]; errors: ImportError[] }

/** "Min %" -> "minpct", "Work Item Code" -> "workitemcode". */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/%/g, "pct").replace(/[^a-z0-9]/g, "");
}

/** Columns whose cells are percentages (a cell formatted as % holds a fraction: 50% is stored as 0.5). */
export function isPercentHeader(h: string): boolean {
  return ["minpct", "maxpct", "pct", "sharepct", "minduration", "maxduration", "mindurationpct", "maxdurationpct", "share"].includes(normalizeHeader(h));
}

/**
 * Value of a percentage-column cell as a plain percent (0 to 100). Excel stores a cell formatted as "50%" as 0.5;
 * the cell's number format (`z`, needs cellNF) or its displayed text (`w`) tells us it is a percent-formatted cell,
 * so it is multiplied by 100. Unformatted numbers (50, or 0.5 meaning half a percent) are left alone.
 */
export function percentCellValue(v: number, format?: string, shown?: string): number {
  const isPct = (!!format && format.includes("%")) || (!!shown && /%\s*$/.test(shown.trim()));
  return isPct ? Math.round(v * 100 * 1e6) / 1e6 : v;
}

function pick(row: RawRow, ...names: string[]): unknown {
  const wanted = names.map(normalizeHeader);
  for (const key of Object.keys(row)) {
    if (wanted.includes(normalizeHeader(key))) return row[key];
  }
  return undefined;
}

function text(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function num(v: unknown): number | null | "bad" {
  const s = text(v);
  if (s === null) return null;
  const n = Number(s.replace(/%$/, ""));
  return Number.isFinite(n) ? n : "bad";
}

function isBlank(row: RawRow): boolean {
  return Object.values(row).every((v) => text(v) === null);
}

/** `rows[0]` is spreadsheet row 2 (row 1 holds the headers). Rows with any error are reported and left out. */
export function parseActivityImport(sheets: RawSheets, opts: ImportValidationOptions = {}): ParsedImport {
  const errors: ImportError[] = [];
  const activities: ImportActivity[] = [];
  const links: ImportLink[] = [];
  const seenCodes = new Map<string, number>();
  const seenVisible = new Map<string, number>();

  sheets.activities.forEach((raw, i) => {
    if (isBlank(raw)) return;
    const row = i + 2;
    const err = (message: string) => errors.push({ sheet: ACTIVITIES_SHEET, row, message });
    const before = errors.length;

    const divRaw = pick(raw, "Division Code", "CSI Division", "Division");
    const divisionCode = normalizeDivisionCode(divRaw);
    if (!divisionCode || !isValidDivisionCode(divisionCode)) err(`Division must be a two-digit CSI division such as 03 or 26 (got "${text(divRaw) ?? ""}")`);
    else if (!isValidDivisionCode(divisionCode, opts.knownDivisions)) err(`Unknown CSI division ${divisionCode}`);

    const secRaw = text(pick(raw, "CSI Section", "Section", "Section Code"));
    let sectionCode: string | null = null;
    if (secRaw) {
      const formatted = formatSectionCode(secRaw);
      if (!formatted || !isValidSectionCode(formatted)) err(`CSI section "${secRaw}" must look like 03 30 00`);
      else if (divisionCode && divisionOfSection(formatted) !== divisionCode) err(`CSI section ${formatted} does not belong to division ${divisionCode}`);
      else if (opts.knownSections && !opts.knownSections.has(formatted)) err(`Unknown CSI section ${formatted}`);
      else sectionCode = formatted;
    }

    const visibleRaw = text(pick(raw, "Visible Code", "Visible ID"));
    const visibleCode = visibleRaw ? visibleRaw.toUpperCase() : null;
    if (visibleCode) {
      const p = parseVisibleCode(visibleCode);
      if (!p) err(`Visible code "${visibleRaw}" must look like D04-001`);
      else if (divisionCode && p.division !== divisionCode) err(`Visible code ${visibleCode} does not belong to division ${divisionCode}`);
    }

    const codeRaw = text(pick(raw, "Code"));
    const code = codeRaw ? codeRaw.toUpperCase() : null;
    if (!code && !visibleCode) err("Either Code or Visible Code is required");

    const name = text(pick(raw, "Name", "Activity Name"));
    if (!name) err("Name is required");

    const typeRaw = text(pick(raw, "Type", "Activity Type"));
    let activityType: ActivityType | null = null;
    if (typeRaw) {
      const t = typeRaw.toLowerCase();
      if ((ACTIVITY_TYPES as readonly string[]).includes(t)) activityType = t as ActivityType;
      else err(`Type "${typeRaw}" must be one of ${ACTIVITY_TYPES.join(", ")}`);
    }

    const min = num(pick(raw, "Min %", "Min Duration %"));
    const max = num(pick(raw, "Max %", "Max Duration %"));
    if (min === "bad") err("Min % must be a number");
    if (max === "bad") err("Max % must be a number");
    const minPct = min === "bad" ? null : min;
    const maxPct = max === "bad" ? null : max;
    if (minPct !== null && (minPct < 0 || minPct > 100)) err("Min % must be between 0 and 100");
    if (maxPct !== null && (maxPct < 0 || maxPct > 100)) err("Max % must be between 0 and 100");
    if (minPct !== null && maxPct !== null && minPct > maxPct) err(`Min % (${minPct}) must not exceed Max % (${maxPct})`);

    if (code) {
      const prev = seenCodes.get(code);
      if (prev !== undefined) err(`Duplicate code ${code} (also on row ${prev})`);
      else seenCodes.set(code, row);
    }
    if (visibleCode) {
      const prev = seenVisible.get(visibleCode);
      if (prev !== undefined) err(`Duplicate visible code ${visibleCode} (also on row ${prev})`);
      else seenVisible.set(visibleCode, row);
    }

    if (errors.length === before && divisionCode && name) {
      activities.push({
        row, divisionCode, sectionCode, visibleCode, code, name, unit: text(pick(raw, "Unit", "Default Unit")), trade: text(pick(raw, "Trade")),
        activityType, minPct, maxPct, description: text(pick(raw, "Description")),
      });
    }
  });

  const seenLinks = new Set<string>();
  sheets.links.forEach((raw, i) => {
    if (isBlank(raw)) return;
    const row = i + 2;
    const err = (message: string) => errors.push({ sheet: LINKS_SHEET, row, message });
    const before = errors.length;

    const ref = text(pick(raw, "Activity Code", "Activity Visible Code", "Visible Code", "Code", "Activity"));
    const wiRaw = text(pick(raw, "Work Item Code", "BOQ Code", "Work Item"));
    const wi = wiRaw ? wiRaw.toUpperCase() : null; // work item codes are matched case-insensitively
    if (!ref) err("Activity code is required");
    if (!wi) err("Work item code is required");

    const days = num(pick(raw, "Days/Unit", "Days Per Unit", "Duration"));
    const pctRaw = num(pick(raw, "%", "Share %", "Share"));
    if (days === "bad") err("Days/Unit must be a number");
    else if (days !== null && days < 0) err("Days/Unit must not be negative");
    if (pctRaw === "bad") err("% must be a number");
    else if (pctRaw !== null && (pctRaw <= 0 || pctRaw > 100)) err("% must be greater than 0 and at most 100");

    if (ref && wi) {
      const key = `${ref.toUpperCase()}|${wi.toUpperCase()}`;
      if (seenLinks.has(key)) err(`Duplicate link ${ref} / ${wi}`);
      seenLinks.add(key);
    }

    if (errors.length === before && ref && wi) {
      links.push({
        row, activityRef: ref.toUpperCase(), workItemCode: wi, daysPerUnit: days === "bad" ? null : days,
        sharePct: pctRaw === null || pctRaw === "bad" ? 100 : pctRaw,
      });
    }
  });

  return { activities, links, errors };
}
