"use client";

// Management Overview (design §13.9): reporting compliance, manpower, delays
// and issues across every project the signed-in user may see, and the unit
// compliance board of the selected project. Built from published summaries
// only; a day with no published summary is shown as such and not counted.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { buildOverview, type OverviewCounts, type OverviewSummary } from "@/lib/construction/daily-reporting/overview";
import { listOverviewSummaries } from "@/lib/construction/daily-reporting/service";
import { coverageBanner } from "@/lib/construction/daily-reporting/status";
import { addDays, EmptyState, Flag, inputClass, SectionCard, todayIso } from "./dr-ui";

const RANGES = [
  { days: 7, label: "Last 7 days" },
  { days: 14, label: "Last 14 days" },
  { days: 30, label: "Last 30 days" },
];

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "bad" | "warn" }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "bad" && "text-red-700", tone === "warn" && "text-amber-700")}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const complianceTone = (v: number | null): "good" | "warn" | "bad" | "neutral" => (v === null ? "neutral" : v >= 95 ? "good" : v >= 80 ? "warn" : "bad");

/** Share of due reports by outcome, as one stacked bar. */
function ComplianceBar({ c }: { c: OverviewCounts }) {
  if (c.expected === 0) return <span className="text-xs text-muted-foreground">nothing due</span>;
  const part = (n: number) => `${(n / c.expected) * 100}%`;
  return (
    <div
      className="flex h-2 w-28 overflow-hidden rounded-full bg-muted"
      role="img"
      aria-label={`${c.on_time} on time, ${c.late} late, ${c.missing} missing of ${c.expected} due`}
      title={`${c.on_time} on time · ${c.late} late · ${c.missing} missing`}
    >
      <div className="bg-emerald-500" style={{ width: part(c.on_time) }} />
      <div className="bg-amber-400" style={{ width: part(c.late) }} />
      <div className="bg-red-500" style={{ width: part(c.missing) }} />
    </div>
  );
}

function Sparkline({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const max = Math.max(...points.map((p) => p.value), 1);
  const step = 80 / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(22 - (p.value / max) * 20).toFixed(1)}`).join(" ");
  return (
    <svg width="80" height="24" viewBox="0 0 80 24" className="text-primary" role="img" aria-label={`Manpower from ${points[0].value} to ${points[points.length - 1].value}`}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function DrOverview({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(14);
  const [loaded, setLoaded] = useState<{ days: number; rows: OverviewSummary[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const to = todayIso();
    listOverviewSummaries(addDays(to, -(days - 1)), to)
      .then((rows) => !cancelled && setLoaded({ days, rows }))
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : String(e));
        setLoaded({ days, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const overview = useMemo(() => buildOverview(loaded?.rows ?? []), [loaded]);
  const units = overview.units.filter((u) => u.project_id === projectId);
  const t = overview.totals;

  if (!loaded || loaded.days !== days) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Figures come from published daily summaries only. A day whose summary is not published yet is listed as such and is not counted.
        </p>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Period</span>
          <select className={cn(inputClass, "w-auto")} value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {RANGES.map((r) => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {overview.projects.length === 0 ? (
        <EmptyState title="No daily summaries in this period">Nothing has been reported on the projects you can see.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Stat label="Reporting compliance" value={pct(t.compliance_pct)} hint={`${t.expected - t.missing} of ${t.expected} reports received`} tone={complianceTone(t.compliance_pct) === "bad" ? "bad" : undefined} />
            <Stat label="Late reports" value={String(t.late)} tone={t.late > 0 ? "warn" : undefined} />
            <Stat label="Missing reports" value={String(t.missing)} tone={t.missing > 0 ? "bad" : undefined} />
            <Stat label="Manpower, latest day" value={String(t.manpower_latest)} hint={`across ${t.projects} project${t.projects === 1 ? "" : "s"}`} />
            <Stat label="Delay events" value={String(t.delay_events)} hint={`${t.delay_hours_lost} h lost`} />
            <Stat label="Safety incidents" value={String(t.incidents)} hint={`${t.issues_high} high-priority issue${t.issues_high === 1 ? "" : "s"}`} tone={t.incidents > 0 ? "bad" : undefined} />
          </div>
          {t.days_unpublished > 0 ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {t.days_unpublished} project day{t.days_unpublished === 1 ? " has" : "s have"} reports but no published summary. Those days are not in the figures above.
            </p>
          ) : null}

          <SectionCard title="Projects">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Project</th>
                    <th className="px-2 py-2">Latest published day</th>
                    <th className="px-2 py-2">Compliance</th>
                    <th className="px-2 py-2 text-right">Late</th>
                    <th className="px-2 py-2 text-right">Missing</th>
                    <th className="px-2 py-2">Manpower</th>
                    <th className="px-2 py-2 text-right">Delays</th>
                    <th className="px-2 py-2 text-right">Issues</th>
                    <th className="px-2 py-2 text-right">Incidents</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.projects.map((p) => (
                    <tr key={p.project_id} className={cn("border-t border-border align-top", p.project_id === projectId && "bg-muted/40")}>
                      <td className="px-2 py-2">
                        <p className="font-medium">{p.project_name ?? "Project"}</p>
                        <p className="text-xs text-muted-foreground">{p.project_code}</p>
                      </td>
                      <td className="px-2 py-2">
                        {p.latest ? (
                          <>
                            <p className="tabular-nums">
                              {p.latest.date} <span className="text-xs text-muted-foreground">rev {p.latest.revision_no}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{coverageBanner(p.latest.coverage)}</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Nothing published</span>
                        )}
                        {p.unpublished_dates.length > 0 ? (
                          <p className="mt-1">
                            <Flag>
                              {p.unpublished_dates.length} day{p.unpublished_dates.length === 1 ? "" : "s"} not published
                            </Flag>
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Flag tone={complianceTone(p.compliance_pct)}>{pct(p.compliance_pct)}</Flag>
                          <ComplianceBar c={p} />
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {p.days_published} day{p.days_published === 1 ? "" : "s"} published
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{p.late}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", p.missing > 0 && "font-medium text-red-700")}>{p.missing}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <span className="tabular-nums">{p.latest ? p.latest.manpower_total : "—"}</span>
                          <Sparkline points={p.manpower} />
                        </div>
                        {p.manpower_avg !== null ? <p className="text-xs text-muted-foreground">avg {p.manpower_avg}</p> : null}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {p.delay_events}
                        {p.delay_hours_lost > 0 ? <span className="block text-xs text-muted-foreground">{p.delay_hours_lost} h lost</span> : null}
                        {p.delay_notices > 0 ? <span className="block text-xs text-amber-700">{p.delay_notices} notice{p.delay_notices === 1 ? "" : "s"}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {p.issues}
                        {p.issues_high > 0 ? <span className="block text-xs text-red-700">{p.issues_high} high</span> : null}
                      </td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", p.incidents > 0 && "font-medium text-red-700")}>
                        {p.incidents}
                        {p.near_misses > 0 ? <span className="block text-xs font-normal text-muted-foreground">{p.near_misses} near miss{p.near_misses === 1 ? "" : "es"}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Unit compliance — selected project">
            {units.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published summary for this project in the period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2">Reporting unit</th>
                      <th className="px-2 py-2">Compliance</th>
                      <th className="px-2 py-2 text-right">Due</th>
                      <th className="px-2 py-2 text-right">On time</th>
                      <th className="px-2 py-2 text-right">Late</th>
                      <th className="px-2 py-2 text-right">Missing</th>
                      <th className="px-2 py-2 text-right">No work</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => (
                      <tr key={u.unit_id} className="border-t border-border">
                        <td className="px-2 py-2">
                          {u.display_name} <span className="text-xs text-muted-foreground">{u.unit_code}</span>
                        </td>
                        <td className="px-2 py-2">
                          <div className="flex items-center gap-2">
                            <Flag tone={complianceTone(u.compliance_pct)}>{pct(u.compliance_pct)}</Flag>
                            <ComplianceBar c={u} />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{u.expected}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{u.on_time}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{u.late}</td>
                        <td className={cn("px-2 py-2 text-right tabular-nums", u.missing > 0 && "font-medium text-red-700")}>{u.missing}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{u.no_work}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
