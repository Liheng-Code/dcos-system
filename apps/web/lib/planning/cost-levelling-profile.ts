// Productivity & Resource-Costing Plan, Phase 5 part B — the cost side of the levelling diagram.
//
// Pure (no I/O). `buildLevellingProfile` (levelling-profile.ts) answers "how does manpower demand change";
// this answers the companion question "how does the weekly cash flow change" — same preview-only pattern,
// same inputs (a levelling run's `starts`, never written to the database until Apply), reusing
// `phaseCostByWeek` (Phase 4) twice: once against each task's CURRENT start (its CPM "before" date, the same
// one `buildLevellingProfile` uses), once against the LEVELLED start the engine proposes. A task's
// `planned_cost` itself never changes by moving it — only WHICH WEEK it lands in does.

import { addWorkingDays, type WorkCalendar } from "./work-calendar";
import { phaseCostByWeek, type PhasableTask } from "./cost-phasing";

export interface CostLevelTask {
  id: string;
  /** Working days (0 = milestone; milestones never carry cost phasing). */
  durationWd: number;
  /** The task's CPM "before" start — same value levelResources() was given as earliestStart. */
  earliestStart: string;
  /** plan_task_work.planned_cost — null/0 means this task has nothing to phase. */
  plannedCost: number | null;
}

export interface CostLevellingWeek {
  weekStart: string;
  before: number;
  after: number;
  cumulativeBefore: number;
  cumulativeAfter: number;
}

/** `starts` is a levelling result's `starts` map (every task's post-preview start, moved or not). */
export function buildCostLevellingProfile(
  tasks: CostLevelTask[],
  cal: WorkCalendar,
  starts: Map<string, string>,
): CostLevellingWeek[] {
  const priced = tasks.filter((t) => (t.plannedCost ?? 0) > 0 && t.durationWd > 0 && !!t.earliestStart);

  const endOf = (start: string, durationWd: number) => (durationWd <= 1 ? start : addWorkingDays(cal, start, durationWd - 1));

  const toPhasable = (start: string, t: CostLevelTask): PhasableTask => ({
    startDate: start,
    endDate: endOf(start, t.durationWd),
    isMilestone: false,
    plannedCost: t.plannedCost,
  });

  const beforeWeekly = phaseCostByWeek(priced.map((t) => toPhasable(t.earliestStart, t)), cal);
  const afterWeekly = phaseCostByWeek(priced.map((t) => toPhasable(starts.get(t.id) ?? t.earliestStart, t)), cal);

  const beforeByWeek = new Map(beforeWeekly.map((w) => [w.weekStart, w.cost]));
  const afterByWeek = new Map(afterWeekly.map((w) => [w.weekStart, w.cost]));
  const weeks = [...new Set([...beforeByWeek.keys(), ...afterByWeek.keys()])].sort();

  let cumulativeBefore = 0;
  let cumulativeAfter = 0;
  return weeks.map((weekStart) => {
    const before = beforeByWeek.get(weekStart) ?? 0;
    const after = afterByWeek.get(weekStart) ?? 0;
    cumulativeBefore = Math.round((cumulativeBefore + before) * 100) / 100;
    cumulativeAfter = Math.round((cumulativeAfter + after) * 100) / 100;
    return { weekStart, before, after, cumulativeBefore, cumulativeAfter };
  });
}
