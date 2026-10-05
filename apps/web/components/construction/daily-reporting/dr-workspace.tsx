"use client";

// Daily Reporting workspace: the reporter's list and form, the reviewer's
// inbox and review package, the project daily summary, the missing-reports
// board and the setup screen. Which tabs appear depends on what the signed-in
// user may do on the selected project.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarOff, FilePlus2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getCapabilities,
  listMyReportingUnits,
  listReports,
  type DrCapabilities,
} from "@/lib/construction/daily-reporting/service";
import type { DrReport, ReportingUnit } from "@/lib/construction/daily-reporting/types";
import { DrConflicts } from "./dr-conflicts";
import { DrMissingBoard } from "./dr-missing-board";
import { DrOverview } from "./dr-overview";
import { DrReportForm, type FormMode } from "./dr-report-form";
import { DrReportView } from "./dr-report-view";
import { DrSetup } from "./dr-setup";
import { DrTelegramLink } from "./dr-telegram-link";
import { DrSummary } from "./dr-summary";
import { addDays, EmptyState, Flag, formatDateTime, inputClass, StateBadge, todayIso } from "./dr-ui";

type Tab = "reports" | "review" | "summary" | "missing" | "overview" | "setup";

type View =
  | { kind: "tabs" }
  | { kind: "report"; reportId: string }
  | { kind: "form"; unitId: string; date: string; mode: FormMode };

function ReportTable({ reports, onOpen, showUnit }: { reports: DrReport[]; onOpen: (id: string) => void; showUnit: boolean }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2">Report</th>
            <th className="px-3 py-2">Date</th>
            {showUnit ? <th className="px-3 py-2">Unit</th> : null}
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.id} className="cursor-pointer border-t border-border hover:bg-muted/40" onClick={() => onOpen(r.id)}>
              <td className="px-3 py-2 font-medium">
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => onOpen(r.id)}>
                  {r.report_no}
                </button>
                <span className="ml-2 text-xs text-muted-foreground">v{r.current_version_no}</span>
              </td>
              <td className="px-3 py-2 tabular-nums">{r.report_date}</td>
              {showUnit ? (
                <td className="px-3 py-2">
                  {r.unit?.display_name} <span className="text-xs text-muted-foreground">{r.unit?.unit_code}</span>
                </td>
              ) : null}
              <td className="px-3 py-2">
                <span className="flex flex-wrap items-center gap-1">
                  <StateBadge report={r} />
                  {r.report_kind === "NO_WORK" ? <Flag tone="neutral">No work</Flag> : null}
                  {r.warning_count > 0 && showUnit ? <Flag>{r.warning_count} flagged</Flag> : null}
                  {r.late_flag ? <Flag>Late</Flag> : null}
                  {showUnit && r.sync_state === "REQUIRES_REVIEW" ? <Flag tone="bad">Offline — check</Flag> : null}
                  {r.sync_state === "EVIDENCE_PENDING" ? <Flag tone="info">Photos uploading</Flag> : null}
                  {showUnit && r.sync_state === "CONFLICT" ? <Flag tone="bad">Conflict</Flag> : null}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground">{formatDateTime(r.first_submitted_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Remounts on a new deep link (?report=, ?tab=) and on a project switch, so each starts from a clean state. */
export function DrWorkspace() {
  const params = useSearchParams();
  const { selectedProjectId } = useProject();
  return <Workspace key={`${selectedProjectId}|${params.toString()}`} />;
}

function Workspace() {
  const { selectedProjectId, selectedProject, loading: projectLoading } = useProject();
  const router = useRouter();
  const params = useSearchParams();

  const [capabilities, setCapabilities] = useState<DrCapabilities | null>(null);
  const [myUnits, setMyUnits] = useState<ReportingUnit[]>([]);
  // Deep links from notifications: ?report=<id>, ?tab=summary|missing.
  const [requestedTab, setTab] = useState<Tab>(() => (params.get("tab") as Tab | null) ?? "reports");
  const [view, setView] = useState<View>(() => {
    const reportId = params.get("report");
    return reportId ? { kind: "report", reportId } : { kind: "tabs" };
  });
  const [reports, setReports] = useState<DrReport[]>([]);
  const [inbox, setInbox] = useState<DrReport[]>([]);
  const [allReports, setAllReports] = useState<DrReport[]>([]);
  const [loading, setLoading] = useState(!!selectedProjectId);
  const [unitId, setUnitId] = useState("");
  const [date, setDate] = useState(todayIso());

  const [refresh, setRefresh] = useState(0);
  const reload = useCallback(() => setRefresh((n) => n + 1), []);

  useEffect(() => {
    if (!selectedProjectId) return;
    let cancelled = false;
    const from = addDays(todayIso(), -30);
    (async () => {
      const caps = await getCapabilities(selectedProjectId);
      const units = caps.userId ? await listMyReportingUnits(selectedProjectId, caps.userId) : [];
      const [mine, queue, all] = await Promise.all([
        units.length ? listReports(selectedProjectId, { unitIds: units.map((u) => u.id), from }) : Promise.resolve([]),
        caps.canReview ? listReports(selectedProjectId, { inbox: true }) : Promise.resolve([]),
        caps.canReview ? listReports(selectedProjectId, { from }) : Promise.resolve([]),
      ]);
      return { caps, units, mine, queue, all };
    })()
      .then(({ caps, units, mine, queue, all }) => {
        if (cancelled) return;
        setCapabilities(caps);
        setMyUnits(units);
        setUnitId((current) => (units.some((u) => u.id === current) ? current : units[0]?.id ?? ""));
        setReports(mine);
        setInbox(queue);
        setAllReports(all);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, refresh]);

  const tabs = useMemo(() => {
    if (!capabilities) return [] as { key: Tab; label: string }[];
    const out: { key: Tab; label: string }[] = [];
    if (myUnits.length > 0 || !capabilities.canReview) out.push({ key: "reports", label: "My reports" });
    if (capabilities.canReview) {
      out.push({ key: "review", label: `Review${inbox.length ? ` (${inbox.length})` : ""}` });
      out.push({ key: "summary", label: "Daily summary" });
      out.push({ key: "missing", label: "Missing reports" });
    }
    if (capabilities.canViewProject) out.push({ key: "overview", label: "Overview" });
    if (capabilities.canAdmin) out.push({ key: "setup", label: "Setup" });
    return out;
  }, [capabilities, myUnits.length, inbox.length]);

  // The requested tab may not exist for this user; fall back to the first one they have.
  const tab: Tab = tabs.some((t) => t.key === requestedTab) ? requestedTab : tabs[0]?.key ?? "reports";

  const backToTabs = () => {
    setView({ kind: "tabs" });
    if (params.get("report")) router.replace("/dashboard/site/daily-reporting");
    reload();
  };

  if (projectLoading || loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!selectedProjectId || !capabilities) {
    return <EmptyState title="Select a project">Choose a project in the header to see its daily reports.</EmptyState>;
  }

  if (view.kind === "form") {
    return (
      <DrReportForm
        key={`${view.unitId}-${view.date}-${view.mode}`}
        unitId={view.unitId}
        date={view.date}
        mode={view.mode}
        onCancel={backToTabs}
        onDone={(reportId) => {
          reload();
          setView(reportId ? { kind: "report", reportId } : { kind: "tabs" });
        }}
      />
    );
  }
  if (view.kind === "report") {
    return (
      <DrReportView
        key={view.reportId}
        reportId={view.reportId}
        capabilities={capabilities}
        onBack={backToTabs}
        onCorrect={(u, d) => setView({ kind: "form", unitId: u, date: d, mode: "correct" })}
        onAmend={(u, d) => setView({ kind: "form", unitId: u, date: d, mode: "amend" })}
      />
    );
  }

  const openReport = (reportId: string) => setView({ kind: "report", reportId });
  const actionNeeded = reports.filter((r) => r.review_state === "RETURNED" || r.review_state === "INFO_REQUESTED");
  const existingForDate = reports.find((r) => r.unit_id === unitId && r.report_date === date && r.submission_state !== "WITHDRAWN");

  return (
    <div className="space-y-4">
      {tabs.length > 1 ? (
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium",
                tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      {tab === "reports" ? (
        myUnits.length === 0 ? (
          <EmptyState title="You are not a reporter on this project">
            {capabilities.canAdmin
              ? "Add yourself or others as reporters of a reporting unit in Setup."
              : `Ask the Project Manager of ${selectedProject?.project_name ?? "this project"} to add you to a reporting unit.`}
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <DrTelegramLink userId={capabilities.userId} />
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
              {myUnits.length > 1 ? (
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-medium">Reporting unit</span>
                  <select className={cn(inputClass, "w-auto")} value={unitId} onChange={(e) => setUnitId(e.target.value)}>
                    {myUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name} ({u.unit_code})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="text-sm">
                  <p className="font-medium">{myUnits[0].display_name}</p>
                  <p className="text-xs text-muted-foreground">{myUnits[0].unit_code}</p>
                </div>
              )}
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Report date</span>
                <input type="date" className={cn(inputClass, "w-auto")} value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
              </label>
              {existingForDate && existingForDate.report_kind !== "NO_WORK" ? (
                <Button variant="outline" onClick={() => openReport(existingForDate.id)}>
                  Open {existingForDate.report_no}
                </Button>
              ) : (
                <Button disabled={!unitId} onClick={() => setView({ kind: "form", unitId, date, mode: "new" })}>
                  {existingForDate ? <CalendarOff className="mr-1 h-4 w-4" /> : <FilePlus2 className="mr-1 h-4 w-4" />}
                  {existingForDate ? "Replace No Work with a report" : "Start report"}
                </Button>
              )}
            </div>

            {actionNeeded.length > 0 ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p className="font-medium">{actionNeeded.length} report(s) need your action</p>
                <ul className="mt-1 space-y-1">
                  {actionNeeded.map((r) => (
                    <li key={r.id}>
                      <button type="button" className="underline" onClick={() => openReport(r.id)}>
                        {r.report_no} · {r.report_date}
                      </button>{" "}
                      — {r.review_state === "RETURNED" ? "returned for correction" : "information requested"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {reports.length === 0 ? (
              <EmptyState title="No reports in the last 30 days">Start today&apos;s report above.</EmptyState>
            ) : (
              <ReportTable reports={reports} onOpen={openReport} showUnit={myUnits.length > 1} />
            )}
          </div>
        )
      ) : null}

      {tab === "review" ? (
        <div className="space-y-4">
          <DrConflicts projectId={selectedProjectId} onOpenReport={openReport} onChanged={reload} />
          <h3 className="text-sm font-semibold">Awaiting your decision — flagged first</h3>
          {inbox.length === 0 ? <EmptyState title="Nothing to review">All submitted reports have a decision.</EmptyState> : <ReportTable reports={inbox} onOpen={openReport} showUnit />}
          <h3 className="pt-2 text-sm font-semibold">All reports, last 30 days</h3>
          {allReports.length === 0 ? <EmptyState title="No reports yet" /> : <ReportTable reports={allReports} onOpen={openReport} showUnit />}
        </div>
      ) : null}

      {tab === "summary" ? (
        <DrSummary projectId={selectedProjectId} capabilities={capabilities} initialDate={params.get("date") ?? undefined} onOpenReport={openReport} />
      ) : null}
      {tab === "missing" ? <DrMissingBoard projectId={selectedProjectId} capabilities={capabilities} onOpenReport={openReport} /> : null}
      {tab === "overview" ? <DrOverview projectId={selectedProjectId} /> : null}
      {tab === "setup" ? <DrSetup projectId={selectedProjectId} capabilities={capabilities} /> : null}
    </div>
  );
}
