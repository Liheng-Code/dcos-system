// Pure logic for generating timesheet entries from the daily attendance facts:
// splitting a day's hours across projects, replacing only auto-generated entries, and
// checking that what a person booked still adds up to what attendance says was worked.
//
// Convention (same as the planning bridge trigger): an entry's hours_worked is its total
// hours and ot_hours is the overtime part of it.

export interface Allocation {
  project_id: string | null; // null = overhead (no project)
  wbs_node_id: string | null;
  task_id: string | null;
  percent: number;
}

export interface DayFact {
  date: string;
  status: string;
  regular_hours: number;
  ot_hours_actual: number;
  /** Project the approved OT request was raised for, if any. */
  ot: { project_id: string | null; wbs_node_id: string | null; task_id: string | null; ot_type: string | null } | null;
}

export interface ExistingEntry {
  id: string;
  entry_date: string;
  source: "auto" | "manual";
}

export interface BookedEntry {
  entry_date: string;
  hours_worked: number;
  ot_hours: number;
}

export interface NewEntry {
  entry_date: string;
  project_id: string | null;
  wbs_node_id: string | null;
  task_id: string | null;
  task_description: string;
  hours_worked: number;
  ot_hours: number;
  ot_type: string | null;
  source: "auto";
}

export interface WeekPlan {
  insert: NewEntry[];
  deleteIds: string[];
  /** Days left alone because a person already entered or edited them. */
  keptManualDates: string[];
}

export interface DayIssue {
  date: string;
  message: string;
}

const cents = (hours: number) => Math.round(hours * 100);
const fromCents = (c: number) => c / 100;
const TOLERANCE = 0.01;

/**
 * Splits `total` hours by `weights` into 2-decimal parts that add up to exactly `total`.
 * Leftover hundredths go to the parts with the largest remainders (earlier part first on ties).
 */
export function splitHours(total: number, weights: number[]): number[] {
  if (weights.length === 0) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const target = cents(total);
  if (sum <= 0) return weights.map((_, i) => (i === 0 ? fromCents(target) : 0));
  const exact = weights.map((w) => (target * w) / sum);
  const floors = exact.map(Math.floor);
  let left = target - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, rem: v - Math.floor(v) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i] += 1;
    left -= 1;
  }
  return floors.map(fromCents);
}

/**
 * The project shares for one day. Under 100% the rest is overhead; over 100% the shares are
 * scaled down; with none, everything goes to `fallbackProjectId` (or overhead).
 */
export function normaliseAllocations(allocations: Allocation[], fallbackProjectId: string | null): Allocation[] {
  const usable = allocations.filter((a) => a.percent > 0);
  const total = usable.reduce((s, a) => s + a.percent, 0);
  if (usable.length === 0) {
    return [{ project_id: fallbackProjectId, wbs_node_id: null, task_id: null, percent: 100 }];
  }
  if (total > 100) return usable.map((a) => ({ ...a, percent: (a.percent / total) * 100 }));
  if (total < 100) return [...usable, { project_id: null, wbs_node_id: null, task_id: null, percent: 100 - total }];
  return usable;
}

const describe = (status: string) => `Auto from attendance (${status.toLowerCase().replace(/_/g, " ")})`;

/** The entries a day should have, from its attendance fact. */
export function entriesForDay(fact: DayFact, allocations: Allocation[]): NewEntry[] {
  const regular = fact.regular_hours;
  const ot = fact.ot_hours_actual;
  if (regular + ot <= 0) return [];

  const out: NewEntry[] = [];
  const base = { entry_date: fact.date, task_description: describe(fact.status), source: "auto" as const };

  // OT raised against a specific project is booked there; otherwise it follows the regular split.
  const otOwnProject = ot > 0 && fact.ot?.project_id ? fact.ot : null;
  const otToSplit = otOwnProject ? 0 : ot;

  const shares = normaliseAllocations(allocations, null);
  const weights = shares.map((s) => s.percent);
  const regularParts = splitHours(regular, weights);
  const otParts = splitHours(otToSplit, weights);

  shares.forEach((share, i) => {
    const hours = regularParts[i] + otParts[i];
    if (hours <= 0) return;
    out.push({
      ...base,
      project_id: share.project_id,
      wbs_node_id: share.wbs_node_id,
      task_id: share.task_id,
      hours_worked: fromCents(cents(hours)),
      ot_hours: otParts[i],
      ot_type: otParts[i] > 0 ? fact.ot?.ot_type ?? null : null,
    });
  });

  if (otOwnProject) {
    out.push({
      ...base,
      project_id: otOwnProject.project_id,
      wbs_node_id: otOwnProject.wbs_node_id,
      task_id: otOwnProject.task_id,
      hours_worked: ot,
      ot_hours: ot,
      ot_type: otOwnProject.ot_type,
    });
  }
  return out;
}

/**
 * What to write for a week: auto entries are replaced; a day that has any manual entry is
 * kept as the person left it. `allocationsFor` gives the project shares for a date.
 */
export function planWeek(
  facts: DayFact[],
  existing: ExistingEntry[],
  allocationsFor: (date: string) => Allocation[],
): WeekPlan {
  const plan: WeekPlan = { insert: [], deleteIds: [], keptManualDates: [] };
  const manualDates = new Set(existing.filter((e) => e.source === "manual").map((e) => e.entry_date));

  for (const fact of facts) {
    if (manualDates.has(fact.date)) { plan.keptManualDates.push(fact.date); continue; }
    plan.insert.push(...entriesForDay(fact, allocationsFor(fact.date)));
  }
  // Every auto entry is replaced, including those on days that no longer have a fact.
  for (const e of existing) {
    if (e.source === "auto" && !manualDates.has(e.entry_date)) plan.deleteIds.push(e.id);
  }
  return plan;
}

/**
 * Compares what is booked per day with the payable hours attendance recorded (regular + approved OT).
 * Advisory only: a mismatch is flagged, never blocked.
 */
export function checkDays(facts: DayFact[], booked: BookedEntry[]): DayIssue[] {
  const bookedByDate = new Map<string, number>();
  for (const b of booked) bookedByDate.set(b.entry_date, (bookedByDate.get(b.entry_date) ?? 0) + Number(b.hours_worked));

  const issues: DayIssue[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    seen.add(fact.date);
    const expected = fact.regular_hours + fact.ot_hours_actual;
    const actual = bookedByDate.get(fact.date) ?? 0;
    if (Math.abs(expected - actual) <= TOLERANCE) continue;
    if (expected === 0) {
      issues.push({ date: fact.date, message: `${actual}h booked on a ${fact.status.toLowerCase().replace(/_/g, " ")} day with no attendance hours` });
    } else if (actual === 0) {
      issues.push({ date: fact.date, message: `No hours booked; attendance recorded ${expected}h` });
    } else {
      issues.push({ date: fact.date, message: `${actual}h booked but attendance recorded ${expected}h` });
    }
  }
  for (const [date, hours] of bookedByDate) {
    if (!seen.has(date) && hours > 0) issues.push({ date, message: `${hours}h booked on a day with no attendance record` });
  }
  return issues.sort((a, b) => a.date.localeCompare(b.date));
}
