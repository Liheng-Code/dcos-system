// Programme readiness checklist (doc 35 U1; PRD doc 34 §6.1 guided mode). Pure, no I/O.
// The 11 guided steps, each with a live status from plan_programme_readiness and the BOQ mapping check, and a link
// to the existing page where the step is done. A checklist, not a wizard: steps can be done in any order.

import { projectHref, settingsHref } from "@/lib/project/projects/project-routes";
import type { ReconciliationSummary } from "../boq-mapping/reconcile";

export interface ReadinessFacts {
  project: { code: string; type: string | null; status: string | null; start_date: string | null; end_date: string | null; data_date: string | null } | null;
  project_calendar: boolean;
  wbs: { nodes: number; levels: number; buildings: number };
  boq: { contract_lines: number; tender_lines: number; has_tender: boolean };
  tasks: { total: number; activities: number; generated: number; with_duration: number; last_change: string | null };
  work: { rows: number; with_norm: number; calculated: number };
  logic: { incomplete: number; open_ended: number };
  calculation: { at: string; finish: string | null; critical: number | null; warnings: number } | null;
  qaqc: { at: string; failed: number; critical_failed: number; open_critical: number } | null;
  baseline: { approved: number; pending: number; last_approved: string | null };
  revision: { status: string; number: number; submitted_at: string | null } | null;
}

/** done; attention = done but with something to fix; waiting = with someone else (approval); todo = not started. */
export type StepStatus = "done" | "attention" | "waiting" | "todo";

export interface ReadinessStep {
  n: number;
  key: string;
  title: string;
  status: StepStatus;
  detail: string;
  href: string;
  action: string;
}

/** DCMA logic threshold: at most 5 % of incomplete activities with an open start or finish. */
export const OPEN_END_LIMIT_PCT = 5;

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);

export function programmeReadiness(f: ReadinessFacts, mapping: ReconciliationSummary | null): ReadinessStep[] {
  const code = f.project?.code ?? "";
  const awarded = f.project?.type === "awarded";
  const boqLines = awarded ? f.boq.contract_lines || f.boq.tender_lines : f.boq.tender_lines || f.boq.contract_lines;
  const lastChange = f.tasks.last_change ? Date.parse(f.tasks.last_change) : 0;
  const steps: ReadinessStep[] = [];
  const add = (s: Omit<ReadinessStep, "n">) => steps.push({ n: steps.length + 1, ...s });

  add({ key: "project", title: "Create project", status: "done", detail: code, href: projectHref(code), action: "Open project" });

  const start = f.project?.start_date, end = f.project?.end_date;
  add({
    key: "info", title: "Project information", href: settingsHref(code, "general"), action: "Project settings",
    status: start && end ? "done" : start || end ? "attention" : "todo",
    detail: [
      start ? `Start ${start}` : "No start date",
      end ? `finish ${end}` : "no finish date",
      f.project_calendar ? "project calendar set" : "company default calendar",
    ].join(", "),
  });

  add({
    key: "wbs", title: "WBS", href: "/dashboard/wbs", action: "Open WBS",
    status: f.wbs.nodes > 0 ? "done" : "todo",
    detail: f.wbs.nodes > 0
      ? `${f.wbs.nodes} nodes${f.wbs.buildings ? `, ${f.wbs.buildings} buildings` : ""}${f.wbs.levels ? `, ${f.wbs.levels} levels` : ""}`
      : "No WBS yet: build it from a WBS template",
  });

  add({
    key: "boq", title: "Import BOQ", href: awarded ? projectHref(code, "boq") : "/dashboard/tenders", action: awarded ? "Project BOQ" : "Tenders",
    status: boqLines > 0 ? "done" : "todo",
    detail: boqLines > 0 ? `${boqLines} ${awarded && f.boq.contract_lines ? "contract" : "tender"} BOQ lines` : "No BOQ lines yet",
  });

  {
    const m = mapping;
    const inScope = m ? m.lines : 0;
    const mapped = m ? m.byStatus.complete + m.byStatus.partial + m.byStatus.over + m.byStatus.converted : 0;
    const problems = m ? m.byStatus.over + m.byStatus.partial : 0;
    add({
      key: "mapping", title: "Map BOQ to activities", href: "/dashboard/planning/boq-check", action: "BOQ Mapping Check",
      status: !m || mapped === 0 ? "todo" : problems > 0 || m.byStatus.unmapped > 0 ? "attention" : "done",
      detail: !m || inScope === 0 ? "Needs a BOQ first"
        : `${mapped} of ${inScope} lines mapped (${pct(mapped, inScope)}%)`
          + (m.byStatus.over ? `, ${m.byStatus.over} counted twice` : "")
          + (m.byStatus.partial ? `, ${m.byStatus.partial} partly mapped` : ""),
    });
  }

  add({
    key: "generate", title: "Generate activities", href: "/dashboard/planning/boq-programme", action: "Generate from BOQ",
    status: f.tasks.activities > 0 ? "done" : "todo",
    detail: f.tasks.activities > 0 ? `${f.tasks.activities} activities, ${f.tasks.generated} generated from the library or BOQ` : "No activities yet",
  });

  {
    const missing = f.tasks.activities - f.tasks.with_duration;
    add({
      key: "durations", title: "Calculate durations", href: "/dashboard/planning/productivity/task-work", action: "Task Work",
      status: f.tasks.activities === 0 ? "todo" : missing > 0 ? "attention" : "done",
      detail: f.tasks.activities === 0 ? "No activities yet"
        : `${f.tasks.with_duration} of ${f.tasks.activities} activities have a duration`
          + (f.work.rows ? `; ${f.work.calculated} of ${f.work.rows} calculated from productivity norms` : ""),
    });
  }

  {
    const p = pct(f.logic.open_ended, f.logic.incomplete);
    add({
      key: "logic", title: "Schedule logic", href: "/dashboard/planning/sheet", action: "Edit links in the Sheet",
      status: f.tasks.activities === 0 ? "todo" : p > OPEN_END_LIMIT_PCT ? "attention" : "done",
      detail: f.tasks.activities === 0 ? "No activities yet"
        : `${f.logic.open_ended} of ${f.logic.incomplete} open activities have an open start or finish (${p}%, limit ${OPEN_END_LIMIT_PCT}%)`,
    });
  }

  {
    const c = f.calculation;
    const stale = !!c && Date.parse(c.at) < lastChange;
    add({
      key: "calculate", title: "Calculate and review the Gantt", href: "/dashboard/planning/gantt", action: "Open Gantt",
      status: !c ? "todo" : stale ? "attention" : "done",
      detail: !c ? "Not calculated yet: Schedule in the Gantt"
        : `Calculated ${c.at.slice(0, 10)}${c.finish ? `, finish ${c.finish}` : ""}${c.critical != null ? `, ${c.critical} critical` : ""}`
          + (stale ? "; activities changed since: calculate again" : ""),
    });
  }

  {
    const q = f.qaqc;
    const stale = !!q && Date.parse(q.at) < lastChange;
    add({
      key: "qaqc", title: "Schedule QA/QC", href: "/dashboard/planning/schedule-check", action: "Schedule Check",
      status: !q ? "todo" : q.open_critical > 0 || stale ? "attention" : "done",
      detail: !q ? "Not checked yet"
        : `Checked ${q.at.slice(0, 10)}: ${q.failed} of 14 checks failed, ${q.open_critical} critical finding${q.open_critical === 1 ? "" : "s"} open`
          + (stale ? "; activities changed since: run again" : ""),
    });
  }

  {
    const r = f.revision;
    const approved = f.baseline.approved > 0 || r?.status === "approved_internal" || r?.status === "approved_client";
    const waiting = f.baseline.pending > 0 || r?.status === "submitted_internal" || r?.status === "submitted_client";
    add({
      key: "submit", title: "Submit for approval", href: "/dashboard/planning/comparison", action: "Manage schedules",
      status: approved ? "done" : waiting ? "waiting" : "todo",
      detail: [
        f.baseline.approved ? `${f.baseline.approved} approved baseline${f.baseline.approved === 1 ? "" : "s"}` : null,
        f.baseline.pending ? `${f.baseline.pending} baseline waiting for approval` : null,
        r ? `revision ${r.number}: ${r.status.replace(/_/g, " ")}` : null,
      ].filter(Boolean).join(", ") || "Nothing submitted yet",
    });
  }

  return steps;
}

/** The first step that is not done, for the "next step" highlight. */
export function nextStep(steps: readonly ReadinessStep[]): ReadinessStep | null {
  return steps.find((s) => s.status === "todo" || s.status === "attention") ?? null;
}
