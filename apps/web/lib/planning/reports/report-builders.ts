// The Planning reports as content (doc 35 M1; PRD FR-119/121/122/126). Pure: ReportData + basis in, ReportDoc out.
// Every figure comes from the programme as loaded; nothing is estimated here.

import { signedWorkingDayGap } from "../schedule-engine";
import { addWorkingDays } from "../work-calendar";
import { recoveryEffectiveness } from "../activity-library/recovery-effectiveness";
import type { RecoveryTask } from "../activity-library/recovery-engine";
import type { ReportData, ReportTask } from "./report-data";
import { fmtDate, REPORT_TYPE_LABEL, type Cell, type ReportBasis, type ReportDoc, type ReportSection, type ReportType, type TableSection } from "./report-model";

const DAY = 86_400_000;
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const within = (d: string | null, from: string, to: string) => !!d && d >= from && d <= to;
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 10) / 10}%`);
const signed = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n}`);

/** Duration-weighted % complete of the activities (milestones excluded). */
export function weightedProgress(tasks: ReportTask[]): number | null {
  let w = 0, p = 0;
  for (const t of tasks) {
    if (t.isMilestone) continue;
    const d = Math.max(1, t.durationWd ?? 1);
    w += d; p += d * Math.min(100, Math.max(0, t.progress));
  }
  return w > 0 ? Math.round((p / w) * 10) / 10 : null;
}

function finishOf(tasks: ReportTask[], pick: (t: ReportTask) => string | null): string | null {
  let m: string | null = null;
  for (const t of tasks) { const d = pick(t); if (d && (!m || d > m)) m = d; }
  return m;
}

function head(type: ReportType, basis: ReportBasis, data: ReportData, period: { label: string; start: string | null; end: string | null }, orientation: ReportDoc["orientation"]): Omit<ReportDoc, "sections"> {
  const p = basis.project;
  return {
    type, title: REPORT_TYPE_LABEL[type], subtitle: p ? `${p.code} · ${p.name}` : "Project",
    periodLabel: period.label, periodStart: period.start, periodEnd: period.end, asAt: data.asAt, orientation, basis,
    generatedAt: new Date().toISOString(), generatedBy: data.generatedBy,
  };
}

function headline(data: ReportData): ReportSection {
  const forecast = finishOf(data.tasks, (t) => t.finish);
  const baseline = finishOf(data.tasks, (t) => t.baselineFinish);
  const variance = forecast && baseline ? signedWorkingDayGap(data.cal, baseline, forecast) : null;
  const progress = weightedProgress(data.tasks);
  return {
    kind: "kpis",
    items: [
      { label: "Activities", value: String(data.tasks.length) },
      { label: "Complete (by duration)", value: pct(progress) },
      { label: "Forecast finish", value: fmtDate(forecast) },
      { label: "Baseline finish", value: fmtDate(baseline) },
      { label: "Variance (wd)", value: signed(variance), tone: variance == null ? undefined : variance > 0 ? "bad" : "good" },
      { label: "Critical activities", value: String(data.kpis.critical), tone: data.kpis.negativeFloat > 0 ? "bad" : undefined },
      { label: "Negative float", value: String(data.kpis.negativeFloat), tone: data.kpis.negativeFloat > 0 ? "bad" : undefined },
    ],
  };
}

const TASK_COLUMNS: TableSection["columns"] = [
  { key: "code", label: "Code", width: 1.3 }, { key: "name", label: "Activity", width: 3.4 },
  { key: "dur", label: "Dur (wd)", align: "right", width: 0.7 }, { key: "start", label: "Start", width: 1 }, { key: "finish", label: "Finish", width: 1 },
  { key: "bfinish", label: "Baseline finish", width: 1 }, { key: "var", label: "Var (wd)", align: "right", width: 0.7 },
  { key: "float", label: "Float", align: "right", width: 0.6 }, { key: "pct", label: "%", align: "right", width: 0.5 },
];

function taskRow(t: ReportTask, data: ReportData): Cell[] {
  const variance = t.finish && t.baselineFinish ? signedWorkingDayGap(data.cal, t.baselineFinish, t.finish) : null;
  return [t.code, t.isMilestone ? `◆ ${t.name}` : t.name, t.durationWd, fmtDate(t.start), fmtDate(t.finish), fmtDate(t.baselineFinish),
    variance, t.totalFloat, Math.round(t.progress)];
}

const byStart = (a: ReportTask, b: ReportTask) => (a.start ?? "9999").localeCompare(b.start ?? "9999") || a.code.localeCompare(b.code);

// ── M1 master programme ───────────────────────────────────────────────────
export function buildMasterProgramme(data: ReportData, basis: ReportBasis): ReportDoc {
  const children = new Map<string | null, typeof data.nodes>();
  for (const n of data.nodes) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n]);
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const tasksByNode = new Map<string | null, ReportTask[]>();
  for (const t of data.tasks) tasksByNode.set(t.nodeId, [...(tasksByNode.get(t.nodeId) ?? []), t]);

  const rows: Cell[][] = [];
  const style: ("group" | "critical" | null)[] = [];
  const known = new Set(data.nodes.map((n) => n.id));
  const walk = (parent: string | null) => {
    for (const n of children.get(parent) ?? []) {
      const own = (tasksByNode.get(n.id) ?? []).sort(byStart);
      if (own.length) {
        rows.push([n.code, n.name, null, null, null, null, null, null, null]);
        style.push("group");
        for (const t of own) { rows.push(taskRow(t, data)); style.push(t.critical ? "critical" : null); }
      }
      walk(n.id);
    }
  };
  walk(null);
  const orphans = data.tasks.filter((t) => !t.nodeId || !known.has(t.nodeId)).sort(byStart);
  if (orphans.length) {
    rows.push(["—", "Activities without a WBS node", null, null, null, null, null, null, null]); style.push("group");
    for (const t of orphans) { rows.push(taskRow(t, data)); style.push(t.critical ? "critical" : null); }
  }

  return {
    ...head("master_programme", basis, data, { label: `As at ${fmtDate(data.asAt)}`, start: null, end: data.asAt }, "landscape"),
    sections: [
      headline(data),
      { kind: "table", title: "Programme by WBS", note: "Critical activities are highlighted. Var = finish against the baseline finish, working days (positive = late). Float = total float, working days.",
        columns: TASK_COLUMNS, rows, rowStyle: style, empty: "The programme has no activities." },
    ],
  };
}

// ── M1 weekly progress ────────────────────────────────────────────────────
export function buildWeeklyReport(data: ReportData, basis: ReportBasis, weekEnding: string): ReportDoc {
  const from = addDays(weekEnding, -6);
  const ahead = addDays(weekEnding, 14);
  const t = data.tasks;
  const name = new Map(t.map((x) => [x.id, x]));
  const started = t.filter((x) => within(x.actualStart, from, weekEnding) || (!x.actualStart && x.progress > 0 && within(x.start, from, weekEnding)));
  const finished = t.filter((x) => within(x.actualFinish, from, weekEnding) || (!x.actualFinish && x.progress >= 100 && within(x.finish, from, weekEnding)));
  const behind = t.filter((x) => !x.isMilestone && (
    (x.progress <= 0 && !x.actualStart && !!x.start && x.start <= weekEnding) || (x.progress < 100 && !x.actualFinish && !!x.finish && x.finish <= weekEnding)));
  const upcoming = t.filter((x) => x.progress < 100 && (within(x.start, addDays(weekEnding, 1), ahead) || (x.progress > 0 && within(x.finish, addDays(weekEnding, 1), ahead)))).sort(byStart);
  const progress = data.progress.filter((p) => within(p.asOf, from, weekEnding)).sort((a, b) => a.asOf.localeCompare(b.asOf));
  const delays = data.delays.filter((d) => within(d.openedAt, from, weekEnding));
  const milestones = t.filter((x) => x.isMilestone && x.progress < 100 && within(x.finish, addDays(weekEnding, 1), addDays(weekEnding, 30))).sort(byStart);

  const list = (title: string, tasks: ReportTask[], empty: string): TableSection => ({
    kind: "table", title, columns: TASK_COLUMNS, rows: tasks.sort(byStart).map((x) => taskRow(x, data)),
    rowStyle: tasks.map((x) => (x.critical ? "critical" : null)), empty,
  });

  return {
    ...head("weekly", basis, data, { label: `Week ending ${fmtDate(weekEnding)}`, start: from, end: weekEnding }, "landscape"),
    sections: [
      headline(data),
      { kind: "kpis", title: `This week (${fmtDate(from)} – ${fmtDate(weekEnding)})`, items: [
        { label: "Started", value: String(started.length) }, { label: "Finished", value: String(finished.length) },
        { label: "Behind programme", value: String(behind.length), tone: behind.length ? "warn" : "good" },
        { label: "Progress records", value: String(progress.length) }, { label: "Delays raised", value: String(delays.length), tone: delays.length ? "warn" : undefined },
      ] },
      list("Started this week", started, "No activity started this week."),
      list("Finished this week", finished, "No activity finished this week."),
      {
        kind: "table", title: "Behind programme", note: "Planned to have started or finished by the end of the week, but has not.",
        columns: [...TASK_COLUMNS, { key: "issue", label: "Issue", width: 1.2 }],
        rows: behind.sort(byStart).map((x) => [...taskRow(x, data), x.progress <= 0 && !x.actualStart && x.start && x.start <= weekEnding ? "not started" : "not finished"]),
        rowStyle: behind.map((x) => (x.critical ? "critical" : null)), empty: "Nothing is behind the programme.",
      },
      {
        kind: "table", title: "Progress recorded", columns: [
          { key: "date", label: "Date", width: 0.9 }, { key: "code", label: "Code", width: 1.2 }, { key: "name", label: "Activity", width: 3 },
          { key: "kind", label: "Measure", width: 0.9 }, { key: "from", label: "From", align: "right", width: 0.6 }, { key: "to", label: "To", align: "right", width: 0.6 },
          { key: "source", label: "Source", width: 1.3 }, { key: "approved", label: "Approved", width: 0.9 },
        ],
        rows: progress.map((p) => [fmtDate(p.asOf), name.get(p.taskId)?.code ?? "—", name.get(p.taskId)?.name ?? "(deleted)", p.kind, p.previous, p.value, p.source, p.approvedAt ? fmtDate(p.approvedAt.slice(0, 10)) : "—"]),
        empty: "No approved progress was recorded this week.",
      },
      list(`Look-ahead: the next two weeks (to ${fmtDate(ahead)})`, upcoming, "Nothing starts or finishes in the next two weeks."),
      delayTable("Delays raised this week", delays, name),
      list("Milestones in the next 30 days", milestones, "No milestone falls in the next 30 days."),
    ],
  };
}

function delayTable(title: string, delays: ReportData["delays"], tasks: Map<string, ReportTask>): TableSection {
  return {
    kind: "table", title, columns: [
      { key: "code", label: "Ref", width: 0.9 }, { key: "desc", label: "Delay", width: 3 }, { key: "type", label: "Type", width: 1 },
      { key: "resp", label: "Responsible", width: 1.1 }, { key: "task", label: "Activity", width: 1.2 }, { key: "opened", label: "Opened", width: 0.9 },
      { key: "days", label: "Impact (d)", align: "right", width: 0.7 }, { key: "status", label: "Status", width: 0.8 },
    ],
    rows: delays.map((d) => [d.code, d.description ?? d.cause, d.type?.replaceAll("_", " ") ?? null, d.responsible, d.taskId ? tasks.get(d.taskId)?.code ?? null : null, fmtDate(d.openedAt), d.impactDays, d.status]),
    empty: "None.",
  };
}

// ── M1 recovery report ────────────────────────────────────────────────────
export function buildRecoveryReport(data: ReportData, basis: ReportBasis): ReportDoc {
  const recoveryTasks: RecoveryTask[] = data.tasks.map((t) => ({
    id: t.id, code: t.code, name: t.name, discipline: null, start: t.start, finish: t.finish, progress: t.progress, isMilestone: t.isMilestone,
    manual: t.manual, crewable: false, constraintType: t.constraintType, constraintDate: t.constraintDate, depIds: t.depIds, depTypes: t.depTypes, depLags: t.depLags,
  }));
  const open = data.delays.filter((d) => d.status === "open" || d.status === "disputed");
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const live = data.scenarios.filter((s) => s.status !== "dismissed");
  const sections: ReportSection[] = [
    headline(data),
    { kind: "kpis", title: "Recovery position", items: [
      { label: "Contract completion", value: fmtDate(basis.project?.contract_finish ?? null) },
      { label: "Open delays", value: `${open.length} (${Math.round(open.reduce((n, d) => n + d.impactDays, 0) * 10) / 10} d)`, tone: open.length ? "warn" : undefined },
      { label: "Scenarios proposed", value: String(live.filter((s) => s.status === "proposed").length) },
      { label: "Adopted, awaiting approval", value: String(live.filter((s) => s.status === "adopted" && !s.applied_at).length) },
      { label: "Applied", value: String(live.filter((s) => s.applied_at).length) },
    ] },
    {
      kind: "table", title: "Recovery scenarios", note: "Recovers = working days the scheduling engine measured when the scenario was saved. Achieved = forecast finish when applied against now.",
      columns: [
        { key: "name", label: "Scenario", width: 2.6 }, { key: "status", label: "Status", width: 1.6 }, { key: "target", label: "Target", width: 0.9 },
        { key: "finish", label: "Scenario finish", width: 0.9 }, { key: "rec", label: "Recovers (wd)", align: "right", width: 0.8 },
        { key: "ach", label: "Achieved (wd)", align: "right", width: 0.8 }, { key: "risk", label: "Risk", width: 0.6 },
      ],
      rows: live.map((s) => {
        const e = s.applied_at ? recoveryEffectiveness(s, recoveryTasks, data.cal) : null;
        const status = s.applied_at ? `applied ${fmtDate(s.applied_at.slice(0, 10))}` : s.status === "adopted" ? `adopted · ${s.revision ? `R${s.revision.revision_number} ${s.revision.status.replaceAll("_", " ")}` : "no revision"}` : "proposed";
        return [s.name, status, fmtDate(s.target_finish), fmtDate(s.scenario_finish), s.recovered_wd, e?.achievedWd ?? null, s.risk];
      }),
      empty: "No recovery scenario has been saved.",
    },
  ];
  for (const s of live.filter((x) => x.status === "adopted")) {
    const e = recoveryEffectiveness(s, recoveryTasks, data.cal);
    sections.push({
      kind: "table", title: `Changes: ${s.name}`, columns: [
        { key: "code", label: "Code", width: 1.1 }, { key: "change", label: "Change", width: 4 }, { key: "gain", label: "Measured (wd)", align: "right", width: 0.8 },
        { key: "state", label: s.applied_at ? "In the programme now" : "State", width: 1.2 },
      ],
      rows: s.levers.map((l, i) => [l.code, l.label, l.gainWd || null, s.applied_at ? e.levers[i]?.state ?? null : "not applied yet"]),
      empty: "No changes.",
    });
  }
  sections.push(delayTable("Open delays", open, byId));
  return { ...head("recovery", basis, data, { label: `As at ${fmtDate(data.asAt)}`, start: null, end: data.asAt }, "landscape"), sections };
}

// ── M1 monthly progress (the report the data-date job files) ──────────────
export function buildMonthlyReport(data: ReportData, basis: ReportBasis): ReportDoc {
  const month = data.asAt.slice(0, 7);
  const from = `${month}-01`;
  const k = data.kpis;
  const byId = new Map(data.tasks.map((t) => [t.id, t]));
  const delaySummary = new Map<string, { type: string; lifecycle: string; count: number; days: number }>();
  for (const d of data.delays) {
    const key = `${d.type}|${d.lifecycle}`;
    const e = delaySummary.get(key) ?? { type: d.type?.replaceAll("_", " ") ?? "—", lifecycle: d.lifecycle ?? "—", count: 0, days: 0 };
    e.count++; e.days += d.impactDays; delaySummary.set(key, e);
  }
  const milestones = data.tasks.filter((t) => t.isMilestone && (t.progress < 100 || within(t.finish, from, data.asAt)) && !!t.finish && t.finish <= addDays(data.asAt, 60)).sort(byStart);
  const horizon = addWorkingDays(data.cal, data.asAt, 22);
  const critical = data.tasks.filter((t) => t.critical && t.progress < 100 && !!t.start && t.start <= horizon).sort(byStart).slice(0, 40);
  const STATUS = { on_track: "On track", at_risk: "At risk", overrun: "Overrun" } as const;
  return {
    ...head("monthly", basis, data, { label: month, start: from, end: data.asAt }, "portrait"),
    sections: [
      { kind: "kpis", title: "Schedule summary", items: [
        { label: "Programme status", value: STATUS[k.programmeStatus], tone: k.programmeStatus === "on_track" ? "good" : k.programmeStatus === "at_risk" ? "warn" : "bad" },
        { label: "Overall progress", value: pct(data.scurve.livePct ?? weightedProgress(data.tasks)) },
        { label: "Forecast finish", value: fmtDate(k.forecastFinish) },
        { label: "Against contract (wd)", value: signed(k.overrunWd), tone: (k.overrunWd ?? 0) > 0 ? "bad" : undefined },
        { label: "Overdue activities", value: String(k.overdue), tone: k.overdue ? "warn" : undefined },
        { label: "Critical", value: String(k.critical) }, { label: "Near-critical", value: String(k.nearCritical) },
        { label: "Negative float", value: String(k.negativeFloat), tone: k.negativeFloat ? "bad" : undefined },
      ] },
      { kind: "bars", title: "Progress history (planned against actual)", unit: "%", legend: ["Planned", "Actual"], max: 100,
        bars: data.scurve.history.map((p) => ({ label: fmtDate(p.date), a: p.planned, b: p.actual })) },
      {
        kind: "table", title: "Delay events", columns: [
          { key: "type", label: "Type", width: 2 }, { key: "life", label: "Lifecycle", width: 1.4 }, { key: "n", label: "Count", align: "right", width: 0.7 }, { key: "d", label: "Impact (d)", align: "right", width: 0.8 },
        ],
        rows: [...delaySummary.values()].map((d) => [d.type, d.lifecycle, d.count, Math.round(d.days * 10) / 10]), empty: "No delay events on record.",
      },
      { kind: "table", title: "Milestones (this month and the next 60 days)", columns: TASK_COLUMNS, rows: milestones.map((t) => taskRow(t, data)),
        rowStyle: milestones.map((t) => (t.critical ? "critical" : null)), empty: "No milestones in this window." },
      { kind: "table", title: "Critical work in the next month", columns: TASK_COLUMNS, rows: critical.map((t) => taskRow(t, data)), rowStyle: critical.map(() => "critical" as const),
        note: critical.length === 40 ? "First 40 by start date." : undefined, empty: "No critical activity starts in the next month." },
      ...(byId.size === 0 ? [{ kind: "text" as const, paragraphs: ["The programme has no activities."] }] : []),
    ],
  };
}

export function buildReport(type: ReportType, data: ReportData, basis: ReportBasis, opts: { weekEnding?: string } = {}): ReportDoc {
  switch (type) {
    case "master_programme": return buildMasterProgramme(data, basis);
    case "weekly": return buildWeeklyReport(data, basis, opts.weekEnding ?? data.asAt);
    case "recovery": return buildRecoveryReport(data, basis);
    case "monthly": return buildMonthlyReport(data, basis);
  }
}
