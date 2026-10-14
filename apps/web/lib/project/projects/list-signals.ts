// What the Projects table shows per row beyond the project's own fields: its stage, a one-word
// health and the next deadline. Pure, so it can be tested without a database.

import { STAGE_LABELS, type TenderStage } from "@/lib/qs/tender-lifecycle";

export type Tone = "good" | "warn" | "bad" | "muted";

export interface TenderSignalInput {
  tender_stage: TenderStage;
  submission_deadline: string | null;
}

export interface ProjectSignals {
  stage: { label: string; tone: Tone };
  health: { label: string; tone: Tone };
  /** yyyy-mm-dd (or timestamp) and what it is; null when there is nothing ahead. */
  deadline: { date: string; label: string } | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
  archived: "Archived",
};

const DAY = 86_400_000;

/** Whole days from today to the given date (negative when past). Dates compare by calendar day. */
export function daysUntil(date: string, today: string): number {
  const [y1, m1, d1] = date.slice(0, 10).split("-").map(Number);
  const [y2, m2, d2] = today.split("-").map(Number);
  return Math.round((Date.UTC(y1, m1 - 1, d1) - Date.UTC(y2, m2 - 1, d2)) / DAY);
}

function relative(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

const CLOSED_STAGES: TenderStage[] = ["awarded", "unsuccessful", "closed"];
const SUBMITTED_STAGES: TenderStage[] = ["submitted", "awaiting_result"];

export function tenderSignals(t: TenderSignalInput | null, today: string): ProjectSignals {
  if (!t) return { stage: { label: "Not registered", tone: "warn" }, health: { label: "No tender details", tone: "warn" }, deadline: null };
  const stage = {
    label: STAGE_LABELS[t.tender_stage] ?? t.tender_stage,
    tone: (t.tender_stage === "awarded" ? "good" : t.tender_stage === "unsuccessful" || t.tender_stage === "closed" ? "muted" : "warn") as Tone,
  };
  if (CLOSED_STAGES.includes(t.tender_stage)) return { stage, health: { label: "Closed", tone: "muted" }, deadline: null };
  if (SUBMITTED_STAGES.includes(t.tender_stage)) return { stage, health: { label: "Awaiting result", tone: "muted" }, deadline: null };
  if (!t.submission_deadline) return { stage, health: { label: "No deadline", tone: "warn" }, deadline: null };
  const days = daysUntil(t.submission_deadline, today);
  const health: ProjectSignals["health"] =
    days < 0 ? { label: `Deadline passed ${relative(days)}`, tone: "bad" }
      : days <= 7 ? { label: `Due ${relative(days)}`, tone: "warn" }
        : { label: `Due ${relative(days)}`, tone: "good" };
  return { stage, health, deadline: { date: t.submission_deadline, label: "Submission" } };
}

export function liveSignals(p: { project_status: string; end_date: string | null }, overdueTasks: number, today: string): ProjectSignals {
  const stage = {
    label: STATUS_LABELS[p.project_status] ?? p.project_status,
    tone: (p.project_status === "active" ? "good" : p.project_status === "draft" || p.project_status === "pending_approval" ? "warn" : "muted") as Tone,
  };
  const finished = p.project_status === "completed" || p.project_status === "archived";
  const health: ProjectSignals["health"] = finished
    ? { label: "Closed", tone: "muted" }
    : overdueTasks > 0
      ? { label: `${overdueTasks} overdue task${overdueTasks === 1 ? "" : "s"}`, tone: overdueTasks >= 10 ? "bad" : "warn" }
      : { label: "On track", tone: "good" };
  const deadline = !finished && p.end_date ? { date: p.end_date, label: daysUntil(p.end_date, today) < 0 ? "Finish (passed)" : "Finish" } : null;
  return { stage, health, deadline };
}

/** Counts rows per project id, e.g. overdue tasks. */
export function countBy(rows: { project_id: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r.project_id] = (out[r.project_id] ?? 0) + 1;
  return out;
}
