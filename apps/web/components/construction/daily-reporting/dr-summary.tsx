"use client";

// Project Daily Summary (design §13.8): official figures come from approved
// report versions only, and the coverage banner always says what is still
// pending or missing. The Live view updates as approvals arrive; publishing
// freezes it as the next Official revision.

import { useEffect, useState } from "react";
import { Loader2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DrApiError, getSummaries, publishSummary, type DrCapabilities } from "@/lib/construction/daily-reporting/service";
import { coverageBanner, TONE_CLASS, WORK_STATUS_LABELS } from "@/lib/construction/daily-reporting/status";
import type { DailySummary, WorkStatus } from "@/lib/construction/daily-reporting/types";
import { EmptyState, Flag, formatDateTime, inputClass, SectionCard, textareaClass, todayIso } from "./dr-ui";

export function DrSummary({
  projectId,
  capabilities,
  initialDate,
  onOpenReport,
}: {
  projectId: string;
  capabilities: DrCapabilities;
  initialDate?: string;
  onOpenReport: (reportId: string) => void;
}) {
  const [date, setDate] = useState(initialDate ?? todayIso());
  const [rows, setRows] = useState<DailySummary[]>([]);
  const [revision, setRevision] = useState<number>(0);
  const [narrative, setNarrative] = useState("");
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);

  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSummaries(projectId, date)
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setRevision(0);
        setNarrative(data.find((r) => r.status === "Official")?.narrative_final ?? "");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [projectId, date, refresh]);

  const live = rows.find((r) => r.revision_no === 0) ?? null;
  const official = rows.find((r) => r.status === "Official") ?? null;
  const shown = rows.find((r) => r.revision_no === revision) ?? live;
  const pendingRevision =
    !!live && !!official && JSON.stringify(live.included_report_versions) !== JSON.stringify(official.included_report_versions);

  async function publish() {
    setPublishing(true);
    try {
      const res = await publishSummary(projectId, date, narrative.trim() || null);
      toast.success(`Summary published as revision ${res.revision_no}.`);
      setRefresh((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof DrApiError ? e.message : "Could not publish the summary.");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Date</span>
          <input type="date" className={cn(inputClass, "w-auto")} value={date} max={todayIso()}
            onChange={(e) => {
              setLoading(true);
              setDate(e.target.value);
            }}
          />
        </label>
        {rows.length > 1 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">View</span>
            <select className={cn(inputClass, "w-auto")} value={revision} onChange={(e) => setRevision(Number(e.target.value))}>
              {rows.map((r) => (
                <option key={r.id} value={r.revision_no}>
                  {r.revision_no === 0 ? "Live" : `Revision ${r.revision_no} — ${r.status}`}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !shown ? (
        <EmptyState title="No reports for this date">Nothing has been submitted or flagged missing yet.</EmptyState>
      ) : (
        <>
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm font-medium",
              shown.coverage.pending + shown.coverage.missing > 0 ? TONE_CLASS.warn : TONE_CLASS.good,
            )}
          >
            <span>{coverageBanner(shown.coverage)}</span>
            <span className="flex items-center gap-2">
              {shown.revision_no === 0 ? <Flag tone="info">Live — not official</Flag> : <Flag tone={shown.status === "Official" ? "good" : "neutral"}>{shown.status} · Rev {shown.revision_no}</Flag>}
              {shown.published_at ? <span className="text-xs font-normal">published {formatDateTime(shown.published_at)}</span> : null}
            </span>
          </div>
          {pendingRevision && shown.revision_no === 0 ? (
            <p className="text-sm text-amber-700">Approved data has changed since revision {official?.revision_no}. Publish to issue a new revision.</p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Manpower (approved)", shown.totals.manpower_total],
              ["Delay hours lost", shown.totals.delay_hours_lost],
              ["Open issues (high)", `${shown.totals.issues} (${shown.totals.issues_high})`],
              ["Safety incidents", shown.totals.incidents],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <SectionCard title="Reporting units">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="pb-1">Unit</th>
                  <th className="pb-1">Report</th>
                  <th className="pb-1">State</th>
                </tr>
              </thead>
              <tbody>
                {shown.coverage.units.map((u) => (
                  <tr key={u.unit_id} className="border-t border-border">
                    <td className="py-1.5">
                      {u.display_name} <span className="text-xs text-muted-foreground">{u.unit_code}</span>
                    </td>
                    <td className="py-1.5">
                      {u.report_id ? (
                        <button type="button" className="text-primary underline" onClick={() => onOpenReport(u.report_id as string)}>
                          {u.report_no}
                        </button>
                      ) : (
                        "—"
                      )}
                      {u.report_kind === "NO_WORK" ? <span className="ml-1 text-xs text-muted-foreground">no work</span> : null}
                    </td>
                    <td className="py-1.5">
                      <Flag tone={u.state === "APPROVED" ? "good" : u.state === "MISSING" ? "bad" : "info"}>
                        {u.state === "APPROVED" ? "Approved" : u.state === "MISSING" ? "Missing" : "Pending — unofficial"}
                      </Flag>
                      {u.late ? <span className="ml-1"><Flag>Late</Flag></span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>

          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Manpower by trade">
              {shown.totals.manpower_by_trade.length === 0 ? (
                <p className="text-sm text-muted-foreground">No approved manpower yet.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {shown.totals.manpower_by_trade.map((t) => (
                    <li key={t.trade} className="flex justify-between">
                      <span>{t.trade}</span>
                      <span className="tabular-nums">{t.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
            <SectionCard title="Day in numbers">
              <ul className="space-y-1 text-sm">
                {Object.entries(shown.totals.activities).map(([status, count]) => (
                  <li key={status} className="flex justify-between">
                    <span>Activities — {WORK_STATUS_LABELS[status as WorkStatus] ?? status}</span>
                    <span className="tabular-nums">{count}</span>
                  </li>
                ))}
                <li className="flex justify-between">
                  <span>Delay events (notice required)</span>
                  <span className="tabular-nums">
                    {shown.totals.delay_events} ({shown.totals.delay_notices})
                  </span>
                </li>
                <li className="flex justify-between">
                  <span>Weather hours lost</span>
                  <span className="tabular-nums">{shown.totals.weather_hours_lost}</span>
                </li>
                <li className="flex justify-between">
                  <span>Instructions received</span>
                  <span className="tabular-nums">{shown.totals.instructions}</span>
                </li>
                <li className="flex justify-between">
                  <span>Equipment working hours</span>
                  <span className="tabular-nums">{shown.totals.equipment_hours}</span>
                </li>
                <li className="flex justify-between">
                  <span>Reports returned or awaiting information</span>
                  <span className="tabular-nums">{shown.totals.open_returns}</span>
                </li>
              </ul>
            </SectionCard>
          </div>

          <SectionCard title="Verified quantities">
            {shown.totals.quantities.length === 0 ? (
              <p className="text-sm text-muted-foreground">No approved quantities yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="pb-1">Activity</th>
                    <th className="pb-1 text-right">Reported</th>
                    <th className="pb-1 text-right">Verified</th>
                    <th className="pb-1 text-right">Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.totals.quantities.map((q, i) => (
                    <tr key={`${q.task_id}-${i}`} className="border-t border-border">
                      <td className="py-1">
                        {q.task_code ? `${q.task_code} — ` : ""}
                        {q.task_name ?? "Unplanned activity"}
                      </td>
                      <td className="py-1 text-right tabular-nums">
                        {q.reported_qty ?? "—"} {q.uom ?? ""}
                      </td>
                      <td className={cn("py-1 text-right tabular-nums", q.adjusted && "font-semibold text-amber-700")}>
                        {q.verified_qty ?? "—"} {q.uom ?? ""}
                      </td>
                      <td className="py-1 text-right tabular-nums">{q.progress ?? "—"}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Verified quantities support measurement. They are not certified for payment.</p>
          </SectionCard>

          {shown.revision_no === 0 && capabilities.canReview ? (
            <SectionCard title={official ? `Publish revision ${official.revision_no + 1}` : "Publish the official summary"}>
              <textarea className={textareaClass} placeholder="Narrative for management (optional)" value={narrative} onChange={(e) => setNarrative(e.target.value)} />
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button disabled={publishing} onClick={() => void publish()}>
                  {publishing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Megaphone className="mr-1 h-4 w-4" />}
                  Publish
                </Button>
                <span className="text-xs text-muted-foreground">
                  Only approved reports are included. Pending and missing units stay visible in the coverage line.
                </span>
              </div>
            </SectionCard>
          ) : shown.narrative_final ? (
            <SectionCard title="Narrative">
              <p className="whitespace-pre-wrap text-sm">{shown.narrative_final}</p>
            </SectionCard>
          ) : null}
        </>
      )}
    </div>
  );
}
