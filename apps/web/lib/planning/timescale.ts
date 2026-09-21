/**
 * MS-Project-style Timescale model for the Planning ▸ Gantt Chart timeline
 * header. Pure — no React, no Supabase. The config is persisted per project in
 * `plan_timescale.config` (migration 20260904000004) and drives:
 *   - a 1–3 tier timeline header (`gantt-header.tsx`)
 *   - the pixels-per-day (`resolveDayWidth`) every bit of chart geometry keys off
 *   - the header height threaded to both panes (`tierRowHeights`)
 *   - optional non-working-time shading (`schedule-timeline.tsx`)
 */

import { getWeekNumber } from "@/components/planning/gantt-utils";
import type { GanttZoom } from "@/components/planning/gantt-types";

export type TimescaleUnit =
  | "years"
  | "half-years"
  | "quarters"
  | "months"
  | "thirds-of-months"
  | "weeks"
  | "days";

export type TimescaleAlign = "left" | "center" | "right";
export type TierKey = "top" | "middle" | "bottom";

export interface TimescaleTier {
  unit: TimescaleUnit;
  /** key into LABEL_FORMATS[unit] */
  labelFormat: string;
  /** 1 = every unit, 2 = every 2nd unit, … */
  count: number;
  align: TimescaleAlign;
  /** draw the right-edge divider on each cell */
  tickLines: boolean;
  /** number years / quarters / halves from the fiscal-year start */
  fiscalYear: boolean;
}

export interface TimescaleNonworking {
  draw: "behind" | "front" | "none";
  /** hex colour */
  color: string;
}

export interface TimescaleDisplayRange {
  /** ISO `yyyy-MM-dd`, or null = auto (fit the whole programme). */
  from: string | null;
  to: string | null;
}

export interface TimescaleConfig {
  /** MS "Show: One / Two / Three tiers" — the bottom tier is always shown */
  tierCount: 1 | 2 | 3;
  tiers: { top: TimescaleTier; middle: TimescaleTier; bottom: TimescaleTier };
  /** 25..400 — scales pixels-per-day */
  sizePct: number;
  /** horizontal rule between tier rows */
  scaleSeparator: boolean;
  /** 1..12 */
  fiscalYearStartMonth: number;
  nonworking: TimescaleNonworking;
  /** Clip the Gantt timeline to this window (MS-Project "Display range").
   * Either side null = use the programme's own bound. */
  displayRange: TimescaleDisplayRange;
}

const DAY_MS = 86_400_000;

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOW_MIN = ["S", "M", "T", "W", "T", "F", "S"];

// ---------------------------------------------------------------------------
// Label formats — the options shown in the Timescale dialog's "Label" select.
// ---------------------------------------------------------------------------

export const LABEL_FORMATS: Record<
  TimescaleUnit,
  { key: string; label: string; sample: string }[]
> = {
  years: [
    { key: "yyyy", label: "2026", sample: "2026" },
    { key: "yy", label: "'26", sample: "'26" },
    { key: "fy-yyyy", label: "FY 2026", sample: "FY 2026" },
    { key: "year-n", label: "Year 1", sample: "Year 1" },
  ],
  "half-years": [
    { key: "half-n-yyyy", label: "Half 1, 2026", sample: "Half 1, 2026" },
    { key: "h-yyyy", label: "H1 2026", sample: "H1 2026" },
    { key: "hn", label: "H1", sample: "H1" },
    { key: "half-n", label: "Half 1", sample: "Half 1" },
  ],
  quarters: [
    { key: "qtr-n-yyyy", label: "Qtr 1, 2026", sample: "Qtr 1, 2026" },
    { key: "q-yyyy", label: "Q1 2026", sample: "Q1 2026" },
    { key: "qn", label: "Q1", sample: "Q1" },
    { key: "quarter-n", label: "Quarter 1", sample: "Quarter 1" },
  ],
  months: [
    { key: "mmmm-yyyy", label: "January 2026", sample: "January 2026" },
    { key: "mmm-yyyy", label: "Jan 2026", sample: "Jan 2026" },
    { key: "mmm", label: "Jan", sample: "Jan" },
    { key: "mmmmm", label: "J", sample: "J" },
    { key: "m", label: "1", sample: "1" },
    { key: "month-n", label: "Month 1", sample: "Month 1" },
  ],
  "thirds-of-months": [
    { key: "mmm-d", label: "Jan 1", sample: "Jan 1" },
    { key: "d", label: "1", sample: "1" },
  ],
  weeks: [
    { key: "wn", label: "W12", sample: "W12" },
    { key: "week-n", label: "Week 12", sample: "Week 12" },
    { key: "mmm-d", label: "Jan 5", sample: "Jan 5" },
    { key: "d", label: "5", sample: "5" },
  ],
  days: [
    { key: "ddd-m-d", label: "Mon Jan 5", sample: "Mon Jan 5" },
    { key: "m-d", label: "1/5", sample: "1/5" },
    { key: "d", label: "5", sample: "5" },
    { key: "ddd", label: "M", sample: "M" },
  ],
};

export const UNIT_LABELS: Record<TimescaleUnit, string> = {
  years: "Years",
  "half-years": "Half Years",
  quarters: "Quarters",
  months: "Months",
  "thirds-of-months": "Thirds of Months",
  weeks: "Weeks",
  days: "Days",
};

export const TIER_KEYS: TierKey[] = ["top", "middle", "bottom"];

/** The tier keys actually rendered, top → bottom, for a given `tierCount`. */
export function activeTierKeys(tierCount: number): TierKey[] {
  return TIER_KEYS.slice(3 - Math.max(1, Math.min(3, tierCount)));
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const yearTier: TimescaleTier = {
  unit: "years", labelFormat: "yyyy", count: 1, align: "center", tickLines: true, fiscalYear: false,
};
const monthTier = (labelFormat: string): TimescaleTier => ({
  unit: "months", labelFormat, count: 1, align: "center", tickLines: true, fiscalYear: false,
});
const weekTier: TimescaleTier = {
  unit: "weeks", labelFormat: "wn", count: 1, align: "center", tickLines: true, fiscalYear: false,
};
const quarterTier = (labelFormat: string): TimescaleTier => ({
  unit: "quarters", labelFormat, count: 1, align: "center", tickLines: true, fiscalYear: false,
});
const dayTier = (labelFormat: string): TimescaleTier => ({
  unit: "days", labelFormat, count: 1, align: "center", tickLines: true, fiscalYear: false,
});

export const DEFAULT_TIMESCALE: TimescaleConfig = {
  tierCount: 2,
  tiers: { top: yearTier, middle: monthTier("mmm-yyyy"), bottom: weekTier },
  sizePct: 100,
  scaleSeparator: true,
  fiscalYearStartMonth: 1,
  nonworking: { draw: "none", color: "#e2e8f0" },
  displayRange: { from: null, to: null },
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Apply the saved Display Range window over the data-derived timeline range.
 * A side that is unset or invalid keeps the data bound; an inverted window is
 * ignored. */
export function applyDisplayRange(
  range: { min: Date; max: Date },
  dr: TimescaleDisplayRange | undefined | null,
): { min: Date; max: Date } {
  if (!dr) return range;
  let { min, max } = range;
  if (dr.from && ISO_DATE_RE.test(dr.from)) min = new Date(`${dr.from}T00:00:00`);
  if (dr.to && ISO_DATE_RE.test(dr.to)) max = new Date(`${dr.to}T00:00:00`);
  if (max.getTime() <= min.getTime()) return range;
  return { min, max };
}

/** Day / Week / Month quick presets — merged onto the live config, keeping
 * size / separator / fiscal / non-working untouched. */
export const ZOOM_PRESETS: Record<
  GanttZoom,
  Pick<TimescaleConfig, "tierCount" | "tiers">
> = {
  day: {
    tierCount: 2,
    tiers: { top: yearTier, middle: monthTier("mmm-yyyy"), bottom: dayTier("d") },
  },
  week: {
    tierCount: 2,
    tiers: { top: yearTier, middle: monthTier("mmm-yyyy"), bottom: weekTier },
  },
  month: {
    tierCount: 2,
    tiers: { top: yearTier, middle: quarterTier("q-yyyy"), bottom: monthTier("mmm") },
  },
};

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Pixels-per-day the bottom tier wants so its cells stay legible. */
export function baseUnitDayWidth(unit: TimescaleUnit): number {
  switch (unit) {
    case "days": return 36;
    case "weeks": return 12;
    case "thirds-of-months": return 7;
    case "months": return 3.4;
    case "quarters": return 1.3;
    case "half-years": return 0.62;
    case "years": return 0.32;
    default: return 12;
  }
}

export function clampDayWidth(w: number): number {
  return Math.max(0.05, Math.min(240, w));
}

/** Rough calendar-day span of one unit — for aligning body gridlines to the
 * bottom tier. */
export function unitApproxDays(unit: TimescaleUnit): number {
  switch (unit) {
    case "days": return 1;
    case "weeks": return 7;
    case "thirds-of-months": return 10;
    case "months": return 30.4;
    case "quarters": return 91.3;
    case "half-years": return 182.6;
    case "years": return 365;
    default: return 7;
  }
}

/** The single pixels-per-day number the whole chart keys off. */
export function resolveDayWidth(config: TimescaleConfig, zoomScale: number): number {
  return clampDayWidth(
    baseUnitDayWidth(config.tiers.bottom.unit) * (config.sizePct / 100) * zoomScale,
  );
}

/** Per-active-tier row heights (top → bottom) + total header height. */
export function tierRowHeights(config: TimescaleConfig): {
  keys: TierKey[];
  rows: number[];
  total: number;
} {
  const keys = activeTierKeys(config.tierCount);
  const h = Math.max(18, Math.min(34, Math.round(20 * (config.sizePct / 100))));
  const rows = keys.map(() => h);
  return { keys, rows, total: rows.reduce((s, r) => s + r, 0) };
}

// ---------------------------------------------------------------------------
// Tier segment enumeration
// ---------------------------------------------------------------------------

function unitStart(unit: TimescaleUnit, date: Date, fyStart: number): Date {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  switch (unit) {
    case "days":
      return new Date(y, m, d);
    case "weeks": {
      const dow = new Date(y, m, d).getDay();
      return new Date(y, m, d - ((dow + 6) % 7)); // Monday
    }
    case "thirds-of-months":
      return new Date(y, m, d < 11 ? 1 : d < 21 ? 11 : 21);
    case "months":
      return new Date(y, m, 1);
    case "quarters": {
      const off = (((m - (fyStart - 1)) % 3) + 3) % 3;
      return new Date(y, m - off, 1);
    }
    case "half-years": {
      const off = (((m - (fyStart - 1)) % 6) + 6) % 6;
      return new Date(y, m - off, 1);
    }
    case "years": {
      const off = (((m - (fyStart - 1)) % 12) + 12) % 12;
      return new Date(y, m - off, 1);
    }
    default:
      return new Date(y, m, d);
  }
}

function addUnits(unit: TimescaleUnit, date: Date, n: number): Date {
  const d = new Date(date);
  switch (unit) {
    case "days":
      d.setDate(d.getDate() + n);
      break;
    case "weeks":
      d.setDate(d.getDate() + 7 * n);
      break;
    case "thirds-of-months":
      for (let i = 0; i < n; i++) {
        const day = d.getDate();
        if (day < 11) d.setDate(11);
        else if (day < 21) d.setDate(21);
        else d.setMonth(d.getMonth() + 1, 1);
      }
      break;
    case "months":
      d.setMonth(d.getMonth() + n, 1);
      break;
    case "quarters":
      d.setMonth(d.getMonth() + 3 * n, 1);
      break;
    case "half-years":
      d.setMonth(d.getMonth() + 6 * n, 1);
      break;
    case "years":
      d.setFullYear(d.getFullYear() + n, d.getMonth(), 1);
      break;
  }
  return d;
}

export interface TierSegment {
  start: Date;
  end: Date;
  index: number;
}

/** Segments that tile [rangeMin, rangeMax], each `count` base units wide,
 * starting on the unit boundary at or before `rangeMin`. */
export function enumerateTierSegments(
  tier: TimescaleTier,
  rangeMin: Date,
  rangeMax: Date,
  fyStart: number,
): TierSegment[] {
  const count = Math.max(1, Math.round(tier.count) || 1);
  const out: TierSegment[] = [];
  let cur = unitStart(tier.unit, rangeMin, fyStart);
  let idx = 0;
  while (cur.getTime() < rangeMax.getTime() && out.length < 6000) {
    const next = addUnits(tier.unit, cur, count);
    out.push({ start: cur, end: next, index: idx });
    cur = next;
    idx += 1;
  }
  return out;
}

/** Day offset of a boundary date from the timeline origin, matching the
 * rounding convention used by `toX` / the old month band. */
export function segDayOffset(date: Date, rangeMin: Date): number {
  return Math.round((date.getTime() - rangeMin.getTime()) / DAY_MS);
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

function monthsSinceFY(m: number, fyStart: number): number {
  return (((m - (fyStart - 1)) % 12) + 12) % 12;
}
function quarterOfFY(date: Date, fyStart: number): number {
  return Math.floor(monthsSinceFY(date.getMonth(), fyStart) / 3) + 1;
}
function halfOfFY(date: Date, fyStart: number): number {
  return Math.floor(monthsSinceFY(date.getMonth(), fyStart) / 6) + 1;
}
/** Fiscal year named by the calendar year in which it ends. */
function fyLabelYear(date: Date, fyStart: number): number {
  if (fyStart === 1) return date.getFullYear();
  return date.getMonth() >= fyStart - 1 ? date.getFullYear() + 1 : date.getFullYear();
}

export function formatTierLabel(
  tier: TimescaleTier,
  segStart: Date,
  segIndex: number,
  ctx: { fiscalYearStartMonth: number },
): string {
  const fy = ctx.fiscalYearStartMonth;
  const m = segStart.getMonth();
  const key = tier.labelFormat;

  switch (tier.unit) {
    case "years": {
      const yr = tier.fiscalYear ? fyLabelYear(segStart, fy) : segStart.getFullYear();
      if (key === "yy") return `'${String(yr).slice(-2)}`;
      if (key === "fy-yyyy") return `FY ${yr}`;
      if (key === "year-n") return `Year ${segIndex + 1}`;
      return String(yr);
    }
    case "half-years": {
      const half = tier.fiscalYear ? halfOfFY(segStart, fy) : m < 6 ? 1 : 2;
      const yr = tier.fiscalYear ? fyLabelYear(segStart, fy) : segStart.getFullYear();
      if (key === "h-yyyy") return `H${half} ${yr}`;
      if (key === "hn") return `H${half}`;
      if (key === "half-n") return `Half ${half}`;
      return `Half ${half}, ${yr}`;
    }
    case "quarters": {
      const q = tier.fiscalYear ? quarterOfFY(segStart, fy) : Math.floor(m / 3) + 1;
      const yr = tier.fiscalYear ? fyLabelYear(segStart, fy) : segStart.getFullYear();
      if (key === "q-yyyy") return `Q${q} ${yr}`;
      if (key === "qn") return `Q${q}`;
      if (key === "quarter-n") return `Quarter ${q}`;
      return `Qtr ${q}, ${yr}`;
    }
    case "months": {
      if (key === "mmmm-yyyy") return `${MONTHS_LONG[m]} ${segStart.getFullYear()}`;
      if (key === "mmm") return MONTHS_SHORT[m];
      if (key === "mmmmm") return MONTHS_LONG[m].charAt(0);
      if (key === "m") return String(m + 1);
      if (key === "month-n") return `Month ${m + 1}`;
      return `${MONTHS_SHORT[m]} ${segStart.getFullYear()}`;
    }
    case "thirds-of-months": {
      if (key === "d") return String(segStart.getDate());
      return `${MONTHS_SHORT[m]} ${segStart.getDate()}`;
    }
    case "weeks": {
      const wn = getWeekNumber(segStart);
      if (key === "week-n") return `Week ${wn}`;
      if (key === "mmm-d") return `${MONTHS_SHORT[m]} ${segStart.getDate()}`;
      if (key === "d") return String(segStart.getDate());
      return `W${wn}`;
    }
    case "days": {
      if (key === "m-d") return `${m + 1}/${segStart.getDate()}`;
      if (key === "d") return String(segStart.getDate());
      if (key === "ddd") return DOW_MIN[segStart.getDay()];
      return `${DOW_SHORT[segStart.getDay()]} ${MONTHS_SHORT[m]} ${segStart.getDate()}`;
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

function mergeTier(base: TimescaleTier, raw: unknown): TimescaleTier {
  if (!raw || typeof raw !== "object") return { ...base };
  const r = raw as Record<string, unknown>;
  const unit = (typeof r.unit === "string" && r.unit in LABEL_FORMATS
    ? r.unit
    : base.unit) as TimescaleUnit;
  const formats = LABEL_FORMATS[unit].map((f) => f.key);
  return {
    unit,
    labelFormat:
      typeof r.labelFormat === "string" && formats.includes(r.labelFormat)
        ? r.labelFormat
        : formats.includes(base.labelFormat)
          ? base.labelFormat
          : formats[0],
    count: typeof r.count === "number" && r.count >= 1 ? Math.round(r.count) : base.count,
    align:
      r.align === "left" || r.align === "center" || r.align === "right"
        ? r.align
        : base.align,
    tickLines: typeof r.tickLines === "boolean" ? r.tickLines : base.tickLines,
    fiscalYear: typeof r.fiscalYear === "boolean" ? r.fiscalYear : base.fiscalYear,
  };
}

export function parseTimescaleConfig(
  row: { config?: unknown } | null | undefined,
): TimescaleConfig {
  const raw = (row?.config ?? {}) as Record<string, unknown>;
  const tiersRaw = (raw.tiers ?? {}) as Record<string, unknown>;
  const nwRaw = (raw.nonworking ?? {}) as Record<string, unknown>;
  const drRaw = (raw.displayRange ?? {}) as Record<string, unknown>;
  const drSide = (v: unknown): string | null =>
    typeof v === "string" && ISO_DATE_RE.test(v) ? v : null;
  const tierCount =
    raw.tierCount === 1 || raw.tierCount === 2 || raw.tierCount === 3
      ? raw.tierCount
      : DEFAULT_TIMESCALE.tierCount;
  return {
    tierCount,
    tiers: {
      top: mergeTier(DEFAULT_TIMESCALE.tiers.top, tiersRaw.top),
      middle: mergeTier(DEFAULT_TIMESCALE.tiers.middle, tiersRaw.middle),
      bottom: mergeTier(DEFAULT_TIMESCALE.tiers.bottom, tiersRaw.bottom),
    },
    sizePct:
      typeof raw.sizePct === "number" && raw.sizePct >= 25 && raw.sizePct <= 400
        ? Math.round(raw.sizePct)
        : DEFAULT_TIMESCALE.sizePct,
    scaleSeparator:
      typeof raw.scaleSeparator === "boolean"
        ? raw.scaleSeparator
        : DEFAULT_TIMESCALE.scaleSeparator,
    fiscalYearStartMonth:
      typeof raw.fiscalYearStartMonth === "number" &&
      raw.fiscalYearStartMonth >= 1 &&
      raw.fiscalYearStartMonth <= 12
        ? Math.round(raw.fiscalYearStartMonth)
        : DEFAULT_TIMESCALE.fiscalYearStartMonth,
    nonworking: {
      draw:
        nwRaw.draw === "behind" || nwRaw.draw === "front" || nwRaw.draw === "none"
          ? nwRaw.draw
          : DEFAULT_TIMESCALE.nonworking.draw,
      color:
        typeof nwRaw.color === "string" && /^#[0-9a-fA-F]{6}$/.test(nwRaw.color)
          ? nwRaw.color
          : DEFAULT_TIMESCALE.nonworking.color,
    },
    displayRange: { from: drSide(drRaw.from), to: drSide(drRaw.to) },
  };
}

/** Merge a Day/Week/Month preset onto the live config. */
export function applyZoomPreset(
  config: TimescaleConfig,
  zoom: GanttZoom,
): TimescaleConfig {
  const preset = ZOOM_PRESETS[zoom];
  return { ...config, tierCount: preset.tierCount, tiers: preset.tiers };
}
