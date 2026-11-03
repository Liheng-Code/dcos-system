// Doc 35 I1: contract milestones (plan_contract_milestones) against the programme.
// Due = the extended date when an extension was approved, else the contract date. Forecast / achieved come from the
// linked activity: its start for commencement and access, its finish for everything else. Variance is in calendar
// days (liquidated damages run per calendar day); exposure = late days × rate, capped.

export const MILESTONE_KINDS = [
  "commencement", "access", "key_date", "sectional_completion", "practical_completion", "handover", "other",
] as const;
export type MilestoneKind = (typeof MILESTONE_KINDS)[number];

export const MILESTONE_KIND_LABEL: Record<MilestoneKind, string> = {
  commencement: "Commencement",
  access: "Access / possession",
  key_date: "Key date",
  sectional_completion: "Sectional completion",
  practical_completion: "Practical completion",
  handover: "Handover",
  other: "Other",
};

export interface ContractMilestone {
  id: string;
  project_id: string;
  code: string;
  name: string;
  kind: MilestoneKind;
  contract_date: string;
  revised_date: string | null;
  revision_ref: string | null;
  task_id: string | null;
  ld_rate: number | null;
  ld_currency: string | null;
  ld_cap: number | null;
  clause_ref: string | null;
  notes: string | null;
  sort_order: number;
}

export interface MilestoneTask {
  id: string;
  task_code: string | null;
  task_name: string | null;
  start_date: string | null;
  end_date: string | null;
  baseline_start_date: string | null;
  baseline_finish_date: string | null;
  actual_start_date: string | null;
  actual_finish_date: string | null;
  progress: number | null;
}

export type MilestoneState = "achieved" | "achieved_late" | "on_track" | "at_risk" | "late" | "no_activity";

export const MILESTONE_STATE_LABEL: Record<MilestoneState, string> = {
  achieved: "Achieved",
  achieved_late: "Achieved late",
  on_track: "On track",
  at_risk: "At risk",
  late: "Forecast late",
  no_activity: "No activity linked",
};

export interface MilestoneStatus {
  due: string;
  /** Uses the activity's start (commencement, access) rather than its finish. */
  byStart: boolean;
  forecast: string | null;
  baseline: string | null;
  achieved: string | null;
  /** Calendar days after the due date (+ late, − early); null without an activity. */
  variance: number | null;
  /** Late days × rate, capped; null when no rate. */
  exposure: number | null;
  state: MilestoneState;
}

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export function milestoneStatus(m: ContractMilestone, task: MilestoneTask | null | undefined, atRiskDays = 7): MilestoneStatus {
  const due = m.revised_date ?? m.contract_date;
  const byStart = m.kind === "commencement" || m.kind === "access";
  if (!task) return { due, byStart, forecast: null, baseline: null, achieved: null, variance: null, exposure: null, state: "no_activity" };
  const forecast = byStart ? task.start_date : task.end_date;
  const baseline = byStart ? task.baseline_start_date : task.baseline_finish_date;
  const done = byStart ? (task.actual_start_date ?? (Number(task.progress) > 0 ? task.start_date : null))
    : (task.actual_finish_date ?? (Number(task.progress) >= 100 ? task.end_date : null));
  const at = done ?? forecast;
  const variance = at ? days(due, at) : null;
  const late = Math.max(0, variance ?? 0);
  const exposure = m.ld_rate != null ? Math.min(late * Number(m.ld_rate), m.ld_cap != null ? Number(m.ld_cap) : Infinity) : null;
  let state: MilestoneState;
  if (done) state = late > 0 ? "achieved_late" : "achieved";
  else if (variance == null) state = "no_activity";
  else if (variance > 0) state = "late";
  else if (variance > -atRiskDays) state = "at_risk";
  else state = "on_track";
  return { due, byStart, forecast, baseline, achieved: done, variance, exposure, state };
}

/** Exposure by currency over the milestones not yet achieved (forecast) and achieved late (incurred). */
export function exposureTotals(rows: { m: ContractMilestone; s: MilestoneStatus }[]): { currency: string; forecast: number; incurred: number }[] {
  const out = new Map<string, { currency: string; forecast: number; incurred: number }>();
  for (const { m, s } of rows) {
    if (!s.exposure) continue;
    const c = m.ld_currency || "";
    const t = out.get(c) ?? { currency: c, forecast: 0, incurred: 0 };
    if (s.achieved) t.incurred += s.exposure; else t.forecast += s.exposure;
    out.set(c, t);
  }
  return [...out.values()];
}
