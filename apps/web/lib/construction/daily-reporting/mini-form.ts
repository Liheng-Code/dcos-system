// Module 10-01 Daily Reporting — the short Telegram Mini App form as data:
// its state, and the mapping to and from the report payload. Pure functions,
// shared by the form component and its tests.

import { emptyPayload, type DrPayload, type FormActivity } from "./types";

export const OTHER_LOCATION = "Other";

export interface Line {
  id: string;
  location: string;
  taskId: string;
  manpower: string;
  progress: string;
}

export interface MiniFormState {
  weather: string;
  toolbox: boolean | null;
  lines: Line[];
  issue: string;
  tomorrow: string;
  custom: NonNullable<DrPayload["custom_fields"]>;
  noWork: boolean;
  noWorkReason: string;
}

export const newId = () => Math.random().toString(36).slice(2, 10);
export const blankLine = (): Line => ({ id: newId(), location: "", taskId: "", manpower: "", progress: "" });
export const blankState = (): MiniFormState => ({
  weather: "",
  toolbox: null,
  lines: [blankLine()],
  issue: "",
  tomorrow: "",
  custom: {},
  noWork: false,
  noWorkReason: "",
});

const num = (v: string): number | null => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const noIssue = (v: string) => v.trim() === "" || /^(no|none|nil|no issues?|n\/a|-)$/i.test(v.trim());

/** The payload the gateway expects, built from the short form. */
export function buildPayload(state: MiniFormState, byTask: Map<string, FormActivity>, discipline: string): DrPayload {
  const p = emptyPayload();
  if (state.noWork) {
    p.no_work_reason = state.noWorkReason.trim() || null;
    return p;
  }
  p.weather = { condition: state.weather || null, hours_lost: 0, note: null };
  p.safety = { toolbox_talk_held: state.toolbox, observations: null, incident_count: 0, near_miss_count: 0 };

  const used = state.lines.filter((l) => l.taskId);
  p.activities = used.map((l) => {
    const a = byTask.get(l.taskId);
    const progress = num(l.progress);
    return {
      line_id: l.id,
      task_id: l.taskId,
      wbs_node_id: a?.wbs_node_id ?? null,
      discipline: a?.discipline ?? null,
      work_status: progress !== null && progress >= 100 ? "completed" : "in_progress",
      progress_before: a?.current_progress ?? null,
      progress_today: progress,
      reported_qty: null,
      uom: a?.quantity_unit ?? null,
      trade_code: a?.suggested_trade ?? null,
      headcount: num(l.manpower),
      hours_normal: 8,
      hours_ot: 0,
      unplanned: false,
      remarks: null,
    };
  });

  const workers = used.reduce((sum, l) => sum + (num(l.manpower) ?? 0), 0);
  if (used.some((l) => num(l.manpower) !== null)) {
    p.manpower = [{ line_id: "m1", trade: discipline || "General", planned_count: null, reported_count: workers, supervisors: null, hours: 8 }];
  }
  if (!noIssue(state.issue)) {
    p.issues = [{ line_id: "i1", issue_type: null, severity: null, description: state.issue.trim(), action_required_from: null }];
  }
  if (state.tomorrow.trim()) {
    p.next_day = [{ line_id: "n1", task_id: null, description: state.tomorrow.trim(), planned_manpower: workers || null, planned_qty: null }];
  }
  if (Object.keys(state.custom).length > 0) p.custom_fields = state.custom;
  return p;
}

/** Restores the short form from a draft saved on the server. */
export function stateFromPayload(p: DrPayload, byTask: Map<string, FormActivity>): MiniFormState {
  const lines = (p.activities ?? [])
    .filter((a) => a.task_id && byTask.has(a.task_id))
    .map((a) => ({
      id: a.line_id,
      location: byTask.get(a.task_id as string)?.location ?? OTHER_LOCATION,
      taskId: a.task_id as string,
      manpower: a.headcount === null || a.headcount === undefined ? "" : String(a.headcount),
      progress: a.progress_today === null || a.progress_today === undefined ? "" : String(a.progress_today),
    }));
  return {
    ...blankState(),
    weather: p.weather?.condition ?? "",
    toolbox: p.safety?.toolbox_talk_held ?? null,
    lines: lines.length > 0 ? lines : [blankLine()],
    issue: p.issues?.[0]?.description ?? "",
    tomorrow: p.next_day?.[0]?.description ?? "",
    custom: p.custom_fields ?? {},
  };
}
