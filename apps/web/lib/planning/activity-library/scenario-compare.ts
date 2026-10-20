// What-if comparison (Phase 3.1). Pure and deterministic: apply a variant (method per activity, productivity %,
// level linking) to the planner inputs, generate the draft in memory, lay it out with the CPM engine and summarise.
// Nothing here touches the database; a chosen variant is committed later as an ordinary generation run.

import { planProjectSchedule, type ScheduleInputTask } from "../project-schedule";
import { workingDaysBetween, type WorkCalendar } from "../work-calendar";
import { planGeneration, type PlannerInput, type PlannerResult } from "./generation-planner";

export interface ScenarioVariant {
  /** masterId -> methodId to use instead of the template's choice */
  methodByMaster: Record<string, string>;
  /** 100 = unchanged; 90 = every standard performs at 90% */
  productivityPct: number;
  /** false = ignore the template's link between consecutive levels */
  linkLevels: boolean;
}

export const BASE_VARIANT: ScenarioVariant = { methodByMaster: {}, productivityPct: 100, linkLevels: true };

export function variantIsBase(v: ScenarioVariant): boolean {
  return Object.keys(v.methodByMaster).length === 0 && v.productivityPct === 100 && v.linkLevels;
}

/** Deterministic ids so two runs of the same variant are identical. */
function seqIds(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

export function applyVariant(input: PlannerInput, v: ScenarioVariant, ids: string | (() => string) = "t"): PlannerInput {
  const pct = v.productivityPct > 0 ? v.productivityPct / 100 : 1;
  const items = input.items.map((it) => {
    const m = v.methodByMaster[it.master_id];
    // a method switch drops any pinned standard so the standard of the new method is picked
    return m ? { ...it, method_id: m, norm_id: null } : it;
  });
  const contexts = Object.fromEntries(
    Object.entries(input.contexts).map(([id, ctx]) => [
      id,
      pct === 1
        ? ctx
        : {
            ...ctx,
            standards: ctx.standards.map((s) => ({
              ...s,
              factors: [...s.factors, { factor_type: "other" as const, label: "what-if", value: pct, condition_note: null }],
            })),
          },
    ]),
  );
  return {
    ...input,
    items,
    contexts,
    interLevel: v.linkLevels ? input.interLevel : null,
    newId: typeof ids === "string" ? seqIds(ids) : ids,
  };
}

export interface LevelMetrics {
  nodeId: string;
  name: string;
  /** sum of task durations (working days) */
  taskDays: number;
  /** working days from the level's first start to its last finish; null when not scheduled */
  spanDays: number | null;
}

export interface ScenarioMetrics {
  activities: number;
  high: number;
  review: number;
  low: number;
  /** activities without a duration (missing quantity / productivity) */
  unsized: number;
  taskDays: number;
  /** programme length in working days from the start date; null on a loop or when nothing is sized */
  spanDays: number | null;
  finish: string | null;
  criticalCount: number | null;
  perLevel: LevelMetrics[];
  loop: string[] | null;
}

export function summariseScenario(
  result: PlannerResult,
  nodes: { id: string; wbs_name: string }[],
  cal: WorkCalendar,
  start: string,
): ScenarioMetrics {
  const tasks: ScheduleInputTask[] = result.tasks.map((t) => ({
    id: t.id, task_code: t.task_code, start_date: null, end_date: null, duration_days: t.duration_days ?? 1, duration_unit: "wd",
    is_milestone: t.is_milestone, manually_scheduled: false, constraint_type: null, constraint_date: null,
    dependency_task_ids: t.dependency_task_ids, dependency_types: t.dependency_types, dependency_lag_days: t.dependency_lag_days,
  }));
  const plan = tasks.length ? planProjectSchedule(tasks, cal, start) : null;
  const rowById = new Map(plan && plan.ok ? plan.rows.map((r) => [r.id, r]) : []);

  const perLevel: LevelMetrics[] = nodes.map((n) => {
    const lt = result.tasks.filter((t) => t.wbs_node_id === n.id);
    const rows = lt.map((t) => rowById.get(t.id)).filter((r): r is NonNullable<typeof r> => !!r);
    const first = rows.map((r) => r.start_date).sort()[0];
    const last = rows.map((r) => r.end_date).sort().slice(-1)[0];
    return {
      nodeId: n.id, name: n.wbs_name,
      taskDays: lt.reduce((a, t) => a + (t.duration_days ?? 0), 0),
      spanDays: first && last ? workingDaysBetween(cal, first, last) : null,
    };
  });

  return {
    activities: result.counts.total, high: result.counts.high, review: result.counts.review, low: result.counts.low,
    unsized: result.tasks.filter((t) => t.duration_days == null).length,
    taskDays: result.tasks.reduce((a, t) => a + (t.duration_days ?? 0), 0),
    spanDays: plan && plan.ok ? plan.workingDays : null,
    finish: plan && plan.ok ? plan.finish : null,
    criticalCount: plan && plan.ok ? plan.criticalCount : null,
    perLevel,
    loop: plan && !plan.ok ? plan.cycle : null,
  };
}

export interface ScenarioOutcome {
  variant: ScenarioVariant;
  metrics: ScenarioMetrics;
  result: PlannerResult;
}

export function runScenario(
  base: PlannerInput,
  v: ScenarioVariant,
  nodes: { id: string; wbs_name: string }[],
  cal: WorkCalendar,
  start: string,
  idPrefix: string,
): ScenarioOutcome {
  const result = planGeneration(applyVariant(base, v, idPrefix));
  return { variant: v, result, metrics: summariseScenario(result, nodes, cal, start) };
}

export interface MetricDelta {
  value: number | null;
  /** difference to the reference scenario (positive = more); null when either side is missing */
  delta: number | null;
}

export function delta(value: number | null, ref: number | null): MetricDelta {
  return { value, delta: value == null || ref == null ? null : Math.round((value - ref) * 100) / 100 };
}
