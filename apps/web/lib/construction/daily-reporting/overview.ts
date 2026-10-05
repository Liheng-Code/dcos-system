// Module 10-01 Daily Reporting — Management Overview (design §13.9): figures
// across projects and days, compiled from published project summaries only.
// Pure functions, so they can be unit tested.
//
// Transparency rule (§13.8): only an Official summary feeds the numbers. A day
// that has reports but no published summary is counted and shown as "not
// published"; its figures are never mixed into the totals.

import type { DailySummary } from "./types";

export type OverviewSummary = Pick<DailySummary, "project_id" | "summary_date" | "revision_no" | "status" | "coverage" | "totals"> & {
  project?: { project_code: string | null; project_name: string | null } | null;
};

export interface OverviewCounts {
  /** Reports due: one per active unit per working day. */
  expected: number;
  /** Sent on time, work or no-work. */
  on_time: number;
  late: number;
  missing: number;
  /** Of the reports received, how many were "no work today". */
  no_work: number;
  /** Received but not yet approved when the summary was published. */
  pending: number;
  /** Share of due reports that were received, 0–100; null when none were due. */
  compliance_pct: number | null;
}

export interface ProjectOverview extends OverviewCounts {
  project_id: string;
  project_code: string | null;
  project_name: string | null;
  days_published: number;
  /** Days with reports due and no published summary, oldest first. */
  unpublished_dates: string[];
  latest: { date: string; revision_no: number; manpower_total: number; coverage: DailySummary["coverage"] } | null;
  /** Manpower on each published day, oldest first. */
  manpower: { date: string; value: number }[];
  manpower_avg: number | null;
  delay_events: number;
  delay_hours_lost: number;
  delay_notices: number;
  issues: number;
  issues_high: number;
  incidents: number;
  near_misses: number;
}

export interface UnitCompliance extends OverviewCounts {
  project_id: string;
  unit_id: string;
  unit_code: string;
  display_name: string;
}

export interface Overview {
  projects: ProjectOverview[];
  units: UnitCompliance[];
  totals: OverviewCounts & {
    projects: number;
    days_published: number;
    days_unpublished: number;
    manpower_latest: number;
    delay_events: number;
    delay_hours_lost: number;
    issues_high: number;
    incidents: number;
  };
}

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const zero = (): OverviewCounts => ({ expected: 0, on_time: 0, late: 0, missing: 0, no_work: 0, pending: 0, compliance_pct: null });

function finish<T extends OverviewCounts>(c: T): T {
  c.compliance_pct = c.expected > 0 ? Math.round(((c.expected - c.missing) / c.expected) * 100) : null;
  return c;
}

function addCounts(into: OverviewCounts, from: OverviewCounts): void {
  into.expected += from.expected;
  into.on_time += from.on_time;
  into.late += from.late;
  into.missing += from.missing;
  into.no_work += from.no_work;
  into.pending += from.pending;
}

/** One day's unit states as counts. Falls back to the coverage totals when a summary lists no units. */
function dayCounts(coverage: DailySummary["coverage"]): OverviewCounts {
  const c = zero();
  const units = coverage?.units ?? [];
  if (units.length === 0) {
    c.expected = num(coverage?.expected);
    c.missing = num(coverage?.missing);
    c.late = num(coverage?.late);
    c.no_work = num(coverage?.no_work);
    c.pending = num(coverage?.pending);
    c.on_time = Math.max(0, c.expected - c.missing - c.late);
    return c;
  }
  for (const u of units) {
    c.expected += 1;
    if (u.state === "MISSING") {
      c.missing += 1;
      continue;
    }
    if (u.late) c.late += 1;
    else c.on_time += 1;
    if (u.report_kind === "NO_WORK") c.no_work += 1;
    if (u.state === "PENDING") c.pending += 1;
  }
  return c;
}

export function buildOverview(summaries: OverviewSummary[]): Overview {
  // Per project and day: the newest Official revision, else the Live row.
  const byDay = new Map<string, { official: OverviewSummary | null; live: OverviewSummary | null }>();
  for (const s of summaries) {
    const key = `${s.project_id}|${s.summary_date}`;
    const slot = byDay.get(key) ?? { official: null, live: null };
    if (s.status === "Official" && (!slot.official || s.revision_no > slot.official.revision_no)) slot.official = s;
    if (s.status === "Live") slot.live = s;
    byDay.set(key, slot);
  }

  const projects = new Map<string, ProjectOverview>();
  const units = new Map<string, UnitCompliance>();
  const projectOf = (s: OverviewSummary): ProjectOverview => {
    let p = projects.get(s.project_id);
    if (!p) {
      p = {
        ...zero(),
        project_id: s.project_id,
        project_code: s.project?.project_code ?? null,
        project_name: s.project?.project_name ?? null,
        days_published: 0,
        unpublished_dates: [],
        latest: null,
        manpower: [],
        manpower_avg: null,
        delay_events: 0,
        delay_hours_lost: 0,
        delay_notices: 0,
        issues: 0,
        issues_high: 0,
        incidents: 0,
        near_misses: 0,
      };
      projects.set(s.project_id, p);
    }
    return p;
  };

  const days = [...byDay.values()].sort((a, b) =>
    ((a.official ?? a.live) as OverviewSummary).summary_date.localeCompare(((b.official ?? b.live) as OverviewSummary).summary_date),
  );
  for (const { official, live } of days) {
    if (!official) {
      // Reports were due, nothing is published: say so, count nothing.
      if (live && num(live.coverage?.expected) > 0) projectOf(live).unpublished_dates.push(live.summary_date);
      continue;
    }
    const p = projectOf(official);
    const t = (official.totals ?? {}) as Partial<DailySummary["totals"]>;
    p.days_published += 1;
    addCounts(p, dayCounts(official.coverage));
    p.manpower.push({ date: official.summary_date, value: num(t.manpower_total) });
    p.delay_events += num(t.delay_events);
    p.delay_hours_lost += num(t.delay_hours_lost);
    p.delay_notices += num(t.delay_notices);
    p.issues += num(t.issues);
    p.issues_high += num(t.issues_high);
    p.incidents += num(t.incidents);
    p.near_misses += num(t.near_misses);
    p.latest = { date: official.summary_date, revision_no: official.revision_no, manpower_total: num(t.manpower_total), coverage: official.coverage };

    for (const u of official.coverage?.units ?? []) {
      const key = `${official.project_id}|${u.unit_id}`;
      const row = units.get(key) ?? { ...zero(), project_id: official.project_id, unit_id: u.unit_id, unit_code: u.unit_code, display_name: u.display_name };
      addCounts(row, dayCounts({ ...official.coverage, units: [u] }));
      row.unit_code = u.unit_code;
      row.display_name = u.display_name;
      units.set(key, row);
    }
  }

  const totals: Overview["totals"] = {
    ...zero(),
    projects: projects.size,
    days_published: 0,
    days_unpublished: 0,
    manpower_latest: 0,
    delay_events: 0,
    delay_hours_lost: 0,
    issues_high: 0,
    incidents: 0,
  };
  for (const p of projects.values()) {
    finish(p);
    p.manpower_avg = p.manpower.length ? Math.round(p.manpower.reduce((s, m) => s + m.value, 0) / p.manpower.length) : null;
    addCounts(totals, p);
    totals.days_published += p.days_published;
    totals.days_unpublished += p.unpublished_dates.length;
    totals.manpower_latest += p.latest?.manpower_total ?? 0;
    totals.delay_events += p.delay_events;
    totals.delay_hours_lost += p.delay_hours_lost;
    totals.issues_high += p.issues_high;
    totals.incidents += p.incidents;
  }
  finish(totals);

  return {
    projects: [...projects.values()].sort((a, b) => (a.project_code ?? "").localeCompare(b.project_code ?? "")),
    // Worst compliance first: that is who management needs to see.
    units: [...units.values()].map(finish).sort((a, b) => (a.compliance_pct ?? 101) - (b.compliance_pct ?? 101) || b.late - a.late || a.unit_code.localeCompare(b.unit_code)),
    totals,
  };
}
