"use client";

// Performance (design §20, §22 Phase 4): how each reporting unit of the
// selected project reports, the weekly compliance trend, and output per
// worker by activity against the project's typical day. For whoever may see
// the whole project; a reporting unit does not get this tab.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  benchmarkBand,
  getPerformance,
  MIN_DAYS_FOR_BENCHMARK,
  rankUnits,
  SCORE_WEIGHTS,
  type PerformanceData,
} from "@/lib/construction/daily-reporting/performance";
import { addDays, EmptyState, Flag, inputClass, SectionCard, todayIso } from "./dr-ui";

const RANGES = [
  { days: 30, label: "Last 30 days" },
  { days: 60, label: "Last 60 days" },
  { days: 90, label: "Last 90 days" },
];

const pct = (v: number | null) => (v === null ? "—" : `${v}%`);
const scoreTone = (v: number | null): "good" | "warn" | "bad" | "neutral" => (v === null ? "neutral" : v >= 85 ? "good" : v >= 65 ? "warn" : "bad");
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/** Weekly reports due, stacked by outcome. */
function WeeklyTrend({ weeks }: { weeks: PerformanceData["weeks"] }) {
  const max = Math.max(...weeks.map((w) => w.on_time + w.late + w.missing), 1);
  return (
    <div className="flex items-end gap-2 overflow-x-auto pb-1" role="img" aria-label="Reports per week: on time, late and missing">
      {weeks.map((w) => {
        const total = w.on_time + w.late + w.missing;
        const h = (n: number) => `${(n / max) * 96}px`;
        return (
          <div key={w.week_start} className="flex min-w-10 flex-col items-center gap-1" title={`Week of ${w.week_start}: ${w.on_time} on time, ${w.late} late, ${w.missing} missing`}>
            <span className="text-xs tabular-nums text-muted-foreground">{total > 0 ? `${Math.round((w.on_time / total) * 100)}%` : "—"}</span>
            <div className="flex w-7 flex-col-reverse overflow-hidden rounded-sm bg-muted">
              <div className="bg-emerald-500" style={{ height: h(w.on_time) }} />
              <div className="bg-amber-400" style={{ height: h(w.late) }} />
              <div className="bg-red-500" style={{ height: h(w.missing) }} />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">{w.week_start.slice(5)}</span>
          </div>
        );
      })}
    </div>
  );
}

export function DrPerformance({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const [loaded, setLoaded] = useState<{ key: string; data: PerformanceData } | null>(null);
  const key = `${projectId}|${days}`;

  useEffect(() => {
    let cancelled = false;
    const to = todayIso();
    getPerformance(projectId, addDays(to, -(days - 1)), to)
      .then((data) => !cancelled && setLoaded({ key: `${projectId}|${days}`, data }))
      .catch((e) => {
        if (cancelled) return;
        toast.error(e instanceof Error ? e.message : String(e));
        setLoaded({ key: `${projectId}|${days}`, data: { allowed: true, units: [], weeks: [], benchmark: [] } });
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, days]);

  const data = loaded?.key === key ? loaded.data : null;
  const units = useMemo(() => rankUnits(data?.units ?? []), [data]);

  if (!data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const active = units.filter((u) => u.due > 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          How each reporting unit reports, from the reports themselves. The score points at where to look; it is not a contractual measure, and
          the reporting units do not see it.
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

      {active.length === 0 ? (
        <EmptyState title="No reports were due in this period">Scores appear once the reporting units of this project have reported.</EmptyState>
      ) : (
        <>
          <SectionCard title="Reporting units — weakest first">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2">Reporting unit</th>
                    <th className="px-2 py-2">Score</th>
                    <th className="px-2 py-2 text-right">On time</th>
                    <th className="px-2 py-2 text-right">Accepted first time</th>
                    <th className="px-2 py-2 text-right">Quantities unchanged</th>
                    <th className="px-2 py-2 text-right">Due</th>
                    <th className="px-2 py-2 text-right">Late</th>
                    <th className="px-2 py-2 text-right">Missing</th>
                    <th className="px-2 py-2 text-right">Returned</th>
                    <th className="px-2 py-2 text-right">Flags / report</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((u) => (
                    <tr key={u.unit_id} className="border-t border-border align-top">
                      <td className="px-2 py-2">
                        <p className="font-medium">{u.display_name}</p>
                        <p className="text-xs text-muted-foreground">{u.unit_code}</p>
                      </td>
                      <td className="px-2 py-2">
                        {u.score !== null ? <Flag tone={scoreTone(u.score)}>{u.score}</Flag> : <span className="text-xs text-muted-foreground">{u.note}</span>}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(u.timeliness_pct)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{pct(u.first_time_pct)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {pct(u.accuracy_pct)}
                        {u.qty_lines > 0 ? <span className="block text-xs text-muted-foreground">{u.qty_lines - u.adjusted_lines} of {u.qty_lines}</span> : null}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{u.due}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{u.late}</td>
                      <td className={cn("px-2 py-2 text-right tabular-nums", u.missing > 0 && "font-medium text-red-700")}>{u.missing}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{u.returned}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{u.reports > 0 ? fmt(u.warnings / u.reports) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Score = on time ({SCORE_WEIGHTS.timeliness}) + accepted without being returned ({SCORE_WEIGHTS.firstTime}) + quantities the approver left
              unchanged ({SCORE_WEIGHTS.accuracy}). A missing report counts as not on time; an excused day does not count. A part with nothing to
              judge yet is left out.
            </p>
          </SectionCard>

          {data.weeks.length > 0 ? (
            <SectionCard title="Reports per week">
              <WeeklyTrend weeks={data.weeks} />
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> on time</span>
                <span className="mr-3 inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-400" /> late</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-red-500" /> missing</span>
                <span className="ml-3">The figure above each bar is the share on time.</span>
              </p>
            </SectionCard>
          ) : null}

          <SectionCard title="Output per worker, by activity">
            {data.benchmark.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing to show yet. This needs approved reports that give both a quantity and a number of workers for an activity.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2">Activity</th>
                        <th className="px-2 py-2">Reporting unit</th>
                        <th className="px-2 py-2 text-right">Days</th>
                        <th className="px-2 py-2 text-right">Quantity</th>
                        <th className="px-2 py-2 text-right">Worker-days</th>
                        <th className="px-2 py-2 text-right">Per worker per day</th>
                        <th className="px-2 py-2 text-right">Typical on this project</th>
                        <th className="px-2 py-2">Compared</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.benchmark.map((b, i) => {
                        const { band, ratio } = benchmarkBand(b);
                        return (
                          <tr key={i} className="border-t border-border">
                            <td className="px-2 py-2">
                              {b.activity ?? "Activity"} <span className="text-xs text-muted-foreground">{b.task_code}</span>
                            </td>
                            <td className="px-2 py-2 text-xs">{b.unit_code}</td>
                            <td className="px-2 py-2 text-right tabular-nums">{b.days}</td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {fmt(b.qty)} {b.uom}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">{fmt(b.worker_days)}</td>
                            <td className="px-2 py-2 text-right font-medium tabular-nums">
                              {fmt(b.per_worker)} {b.uom}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                              {band === "only" ? "—" : `${fmt(b.typical_per_worker)} ${b.uom}`}
                            </td>
                            <td className="px-2 py-2">
                              {band === "only" ? (
                                <span className="text-xs text-muted-foreground">nothing to compare with yet</span>
                              ) : (
                                <Flag tone={band === "below" ? "warn" : band === "above" ? "info" : "neutral"}>
                                  {band === "below" ? "Below" : band === "above" ? "Above" : "Typical"} · {ratio}×
                                </Flag>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  From approved reports, using the quantity the approver verified. &quot;Typical&quot; is the middle value of all units&apos; daily output
                  per worker for the activity on this project. A unit is compared once it has {MIN_DAYS_FOR_BENCHMARK} days and at least one other unit
                  does the same activity. &quot;Above&quot; is not always good news: check the quantity before the productivity.
                </p>
              </>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
