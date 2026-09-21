import { format, isValid, parseISO } from "date-fns";

export interface DateFormatPreset {
  id: string;
  /** date-fns format token pattern, e.g. "MMM d, yyyy" */
  pattern: string;
  /** Human label with a live sample of today's date, e.g. "Mar 14, 2026 (Mon, Mar 16)" */
  label: string;
}

const SAMPLE_DATE = new Date(2026, 2, 14); // Sat, Mar 14 2026 — matches the Excel dialog's own sample date

function sample(pattern: string): string {
  return format(SAMPLE_DATE, pattern);
}

const PATTERNS: { id: string; pattern: string }[] = [
  { id: "MMM_D_YYYY", pattern: "MMM d, yyyy" },
  { id: "D_MMM_YYYY", pattern: "d-MMM-yyyy" },
  { id: "D_MMM_YYYY_SPACE", pattern: "d MMM yyyy" },
  { id: "MMMM_D_YYYY", pattern: "MMMM d, yyyy" },
  { id: "MM_DD_YYYY", pattern: "MM/dd/yyyy" },
  { id: "DD_MM_YYYY", pattern: "dd/MM/yyyy" },
  { id: "YYYY_MM_DD", pattern: "yyyy-MM-dd" },
];

export const DATE_FORMAT_PRESETS: DateFormatPreset[] = PATTERNS.map((p) => ({
  ...p,
  label: sample(p.pattern),
}));

export const DEFAULT_DATE_FORMAT_ID = "MMM_D_YYYY";

const PATTERN_BY_ID = new Map(PATTERNS.map((p) => [p.id, p.pattern]));

/** Formats an ISO date string for DISPLAY only, per the user/company's chosen preset. Never throws. */
export function formatDisplayDate(
  iso: string | null | undefined,
  formatId: string = DEFAULT_DATE_FORMAT_ID,
): string {
  if (!iso) return "—";
  const date = iso.length <= 10 ? parseISO(iso) : new Date(iso);
  if (!isValid(date)) return "—";
  const pattern = PATTERN_BY_ID.get(formatId) ?? PATTERN_BY_ID.get(DEFAULT_DATE_FORMAT_ID)!;
  return format(date, pattern);
}

export function isKnownDateFormatId(id: unknown): id is string {
  return typeof id === "string" && PATTERN_BY_ID.has(id);
}
