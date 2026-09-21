// Turns Direct Works Library (DWL) data into DRAFT productivity norms (Productivity plan, Phase 1).
//
// Pure (no I/O). Two sources exist in DWL and neither says "labour constant" outright:
//   * work-item recipes  (dwl_work_item_resources): labour CONSUMPTION per unit, in `day` or `hr`
//   * assemblies         (dwl_assembly_costing + dwl_assembly_crew): a crew and its DAILY OUTPUT
//
// Both reduce to the canonical norm value — man-hours of the whole crew per unit — and a crew.
//
// Data quality is the real problem, so this refuses what it cannot vouch for:
//   * "Labor component (migrated)" and "Migrated flat-rate placeholder" lines are placeholders
//     (consumption 1.0 in the resource's own unit) — NOT productivity. They are ignored, and an item that
//     has nothing else is reported as not importable.
//   * consumption in m2 / m3 / tonne / no (anything but day or hr) is a rate placeholder, not time.
//   * lines migrated from the legacy company rate library are importable but flagged "legacy — not validated".
// Everything imported is a DRAFT: a person must review and approve it.

import { DEFAULT_HOURS_PER_DAY, roundTo } from "./work-engine";

export interface DwlLabourLine {
  resourceId?: string | null;
  resourceCode?: string | null;
  resourceDescription: string;
  /** Unit of the resource (`day`, `hr`, or something meaningless like `m2`). */
  resourceUnit: string;
  /** Labour per unit of the work item, in `resourceUnit`. */
  consumption: number;
  basisNote?: string | null;
}

export interface DwlWorkItem {
  id: string;
  code: string;
  description: string;
  /** Unit of the work item = the norm's output unit. */
  unit: string;
  lines: DwlLabourLine[];
}

export interface DwlAssembly {
  id: string;
  code: string;
  description: string;
  unit: string;
  /** Units of the assembly one crew completes per day. */
  dailyOutput: number | null;
  crew: { resourceId?: string | null; roleLabel: string; quantity: number }[];
}

export interface DraftNormCrewLine {
  kind: "labor";
  roleLabel: string;
  dwlResourceId: string | null;
  workersPerCrew: number;
}

export interface DraftNorm {
  code: string;
  name: string;
  unit: string;
  labourConstantHrPerUnit: number;
  hoursPerDayBasis: number;
  source: "dwl_work_item" | "dwl_assembly";
  dwlWorkItemId: string | null;
  dwlAssemblyId: string | null;
  basisNote: string;
  crew: DraftNormCrewLine[];
  /** True when the values come from the legacy library and have never been validated. */
  legacyUnvalidated: boolean;
}

export type ImportResult =
  | { ok: true; norm: DraftNorm }
  | { ok: false; reason: string };

const PLACEHOLDER = /^(labor component \(migrated\)|migrated flat-rate placeholder)/i;
const LEGACY = /migrated from company_rate_library/i;
const GANG = /gang of\s+(\d+(?:\.\d+)?)/i;

/** DWL descriptions carry the whole scope ("… per m3. Incl. supply and pump placement …"); the norm name is the first sentence. */
export function shortName(description: string, max = 80): string {
  const d = description.trim();
  const firstSentence = d.split(/\.\s/)[0].trim();
  const base = firstSentence.length > 0 ? firstSentence : d;
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}

const noTrailingDot = (s: string) => s.trim().replace(/[.\s]+$/, "");

export function isPlaceholderLabourLine(line: DwlLabourLine): boolean {
  return PLACEHOLDER.test(line.resourceDescription.trim());
}

/** Working hours a labour line represents per unit of output, or null if its unit is not a time unit. */
export function labourHoursPerUnit(line: DwlLabourLine, hoursPerDay: number): number | null {
  const unit = line.resourceUnit.trim().toLowerCase();
  if (!(line.consumption > 0)) return null;
  if (unit === "hr" || unit === "hrs" || unit === "hour" || unit === "hours") return line.consumption;
  if (unit === "day" || unit === "days") return line.consumption * hoursPerDay;
  return null;
}

export function deriveNormFromWorkItem(item: DwlWorkItem, hoursPerDay: number = DEFAULT_HOURS_PER_DAY): ImportResult {
  const real = item.lines.filter((l) => !isPlaceholderLabourLine(l));
  if (real.length === 0) {
    return {
      ok: false,
      reason: item.lines.length === 0
        ? "No labour lines in this recipe"
        : "Only placeholder labour lines (migrated, consumption 1.0) — no real productivity data",
    };
  }

  const timed = real
    .map((line) => ({ line, hours: labourHoursPerUnit(line, hoursPerDay) }))
    .filter((x): x is { line: DwlLabourLine; hours: number } => x.hours !== null);
  if (timed.length === 0) {
    const units = [...new Set(real.map((l) => l.resourceUnit))].join(", ");
    return { ok: false, reason: `Labour consumption is in '${units}', not day or hr — a rate placeholder, not time` };
  }

  const labourConstant = timed.reduce((s, x) => s + x.hours, 0);

  // crew sizes: a "gang of N" note anchors the line it sits on; the others follow in proportion.
  // With no anchor the smallest line is 1 worker and the rest scale from it.
  const anchor = timed.find((x) => GANG.test(x.line.basisNote ?? ""));
  let scale: number;
  let anchoredBy: string;
  if (anchor) {
    const n = Number(GANG.exec(anchor.line.basisNote ?? "")![1]);
    scale = n / anchor.hours;
    anchoredBy = `crew sized from the recipe note "gang of ${n}" (${anchor.line.resourceDescription}); other trades in proportion`;
  } else {
    const smallest = Math.min(...timed.map((x) => x.hours));
    scale = 1 / smallest;
    anchoredBy = "crew sizes derived from the recipe ratios (smallest trade = 1 worker) — confirm the real gang size";
  }

  const crew: DraftNormCrewLine[] = timed.map((x) => ({
    kind: "labor",
    roleLabel: x.line.resourceDescription,
    dwlResourceId: x.line.resourceId ?? null,
    workersPerCrew: Math.max(0.1, roundTo(x.hours * scale, 1)),
  }));

  const legacy = timed.some((x) => LEGACY.test(x.line.basisNote ?? "") || LEGACY.test(x.line.resourceDescription));
  const notes = [
    `Imported from DWL work item ${item.code} — ${noTrailingDot(item.description)}.`,
    `Labour constant = sum of recipe labour × ${hoursPerDay} h/day where the recipe is in days.`,
    anchoredBy + ".",
    legacy
      ? "LEGACY VALUE: migrated from the old company rate library; the source of this figure is not documented and it has never been validated."
      : "",
    ...timed.map((x) => x.line.basisNote).filter((n): n is string => !!n && !LEGACY.test(n)),
  ].filter(Boolean);

  return {
    ok: true,
    norm: {
      code: item.code,
      name: shortName(item.description),
      unit: item.unit,
      labourConstantHrPerUnit: roundTo(labourConstant, 4),
      hoursPerDayBasis: hoursPerDay,
      source: "dwl_work_item",
      dwlWorkItemId: item.id,
      dwlAssemblyId: null,
      basisNote: notes.join(" "),
      crew,
      legacyUnvalidated: legacy,
    },
  };
}

export function deriveNormFromAssembly(asm: DwlAssembly, hoursPerDay: number = DEFAULT_HOURS_PER_DAY): ImportResult {
  if (!asm.dailyOutput || asm.dailyOutput <= 0) {
    return { ok: false, reason: "The assembly has no daily output recorded" };
  }
  const workers = asm.crew.reduce((s, c) => s + (c.quantity > 0 ? c.quantity : 0), 0);
  if (workers <= 0) return { ok: false, reason: "The assembly has no crew" };

  return {
    ok: true,
    norm: {
      code: asm.code,
      name: shortName(asm.description),
      unit: asm.unit,
      labourConstantHrPerUnit: roundTo((workers * hoursPerDay) / asm.dailyOutput, 4),
      hoursPerDayBasis: hoursPerDay,
      source: "dwl_assembly",
      dwlWorkItemId: null,
      dwlAssemblyId: asm.id,
      basisNote:
        `Imported from DWL assembly ${asm.code} — ${noTrailingDot(asm.description)}. ` +
        `Crew of ${workers} workers completes ${asm.dailyOutput} ${asm.unit}/day at ${hoursPerDay} h/day.`,
      crew: asm.crew
        .filter((c) => c.quantity > 0)
        .map((c) => ({
          kind: "labor" as const,
          roleLabel: c.roleLabel,
          dwlResourceId: c.resourceId ?? null,
          workersPerCrew: c.quantity,
        })),
      legacyUnvalidated: false,
    },
  };
}
