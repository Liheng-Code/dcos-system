"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, AlertTriangle, Clock, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProject } from "@/components/dashboard/project-context";
import { useSheetData } from "@/components/planning/use-sheet-data";
import { LookaheadFilterBar, type FilterOption } from "@/components/planning/lookahead-filter-bar";
import type { SheetNode, SheetRow } from "@/components/planning/sheet-types";
import {
  LOOKAHEAD_STATUSES,
  applyLookaheadFilters,
  buildLookaheadZones,
  hasActiveLookaheadFilters,
  lookaheadDisciplineOptions,
  lookaheadStatus,
  parseLookaheadParams,
  writeLookaheadParams,
  type LookaheadFilters,
  type LookaheadStatus,
  type LookaheadUrlState,
} from "@/lib/planning/lookahead-filters";
import { WbsLookaheadTimeline } from "./wbs-lookahead-timeline";
import { WbsConstraintReadiness } from "./wbs-constraint-readiness";

const WEEKS_OPTIONS = [1, 2, 4, 6] as const;

function collectNodes(rows: SheetRow[], out: SheetNode[] = []): SheetNode[] {
  for (const r of rows) {
    if (r.kind === "node") {
      if (r.node.node_type !== "project") out.push(r.node);
      collectNodes(r.children, out);
    }
  }
  return out;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatLong(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function WbsLookaheadView() {
  const { selectedProjectId, selectedProject } = useProject();
  const data = useSheetData(selectedProjectId);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlState = useMemo(() => parseLookaheadParams(searchParams), [searchParams]);

  const dataDate = data.dataDate ?? new Date().toISOString().slice(0, 10);
  // null in the URL = not touched — default to the data date and a 4-week window.
  const windowStart = urlState.from ?? dataDate;
  const windowEnd = urlState.to ?? addDaysIso(windowStart, 4 * 7);

  // A user mid-edit of one field can briefly leave end < start — clamp for
  // filtering without clobbering what they're typing in the other field.
  const effectiveEnd = windowEnd < windowStart ? windowStart : windowEnd;

  const updateUrl = useCallback(
    (patch: Partial<LookaheadUrlState>) => {
      // Read the live URL, not the render-time searchParams: two clicks before
      // router.replace commits would otherwise drop the first one.
      const current = new URLSearchParams(window.location.search);
      const next: LookaheadUrlState = { ...parseLookaheadParams(current), ...patch };
      const qs = writeLookaheadParams(current, next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const filters: LookaheadFilters = useMemo(
    () => ({ disciplines: urlState.disciplines, zones: urlState.zones, statuses: urlState.statuses }),
    [urlState.disciplines, urlState.zones, urlState.statuses],
  );
  const hasActive = hasActiveLookaheadFilters(filters);
  const clearFilters = () => updateUrl({ disciplines: [], zones: [], statuses: [] });

  const nodes = useMemo(() => collectNodes(data.tree), [data.tree]);
  const zoneData = useMemo(() => buildLookaheadZones(nodes, data.tasks), [nodes, data.tasks]);

  const { windowTasks, matched } = useMemo(() => {
    const res = applyLookaheadFilters(data.tasks, {
      from: windowStart,
      to: effectiveEnd,
      dataDate,
      filters,
      zonesByTaskId: zoneData.zonesByTaskId,
    });
    return res;
  }, [data.tasks, windowStart, effectiveEnd, dataDate, filters, zoneData]);

  const disciplineOptions: FilterOption[] = useMemo(() => lookaheadDisciplineOptions(windowTasks), [windowTasks]);
  const zoneOptions: FilterOption[] = useMemo(
    () =>
      zoneData.options.map((o) => ({
        value: o.id,
        label: o.label,
        depth: o.depth,
        hint: o.nodeType.replace(/_/g, " "),
      })),
    [zoneData],
  );
  const statusOptions: FilterOption[] = useMemo(() => {
    const counts = new Map<LookaheadStatus, number>();
    for (const t of windowTasks) {
      const st = lookaheadStatus(t, dataDate);
      if (st) counts.set(st, (counts.get(st) ?? 0) + 1);
    }
    return LOOKAHEAD_STATUSES.map((s) => ({ value: s.value, label: s.label, count: counts.get(s.value) ?? 0 }));
  }, [windowTasks, dataDate]);

  const activeFilterSummary = useMemo(() => {
    const labelsOf = (vals: string[], opts: FilterOption[]) =>
      vals.map((v) => opts.find((o) => o.value === v)?.label ?? v).join(", ");
    const parts: string[] = [];
    if (filters.disciplines.length) parts.push(`Trade: ${labelsOf(filters.disciplines, disciplineOptions)}`);
    if (filters.zones.length) parts.push(`Zone: ${labelsOf(filters.zones, zoneOptions)}`);
    if (filters.statuses.length) parts.push(`Status: ${labelsOf(filters.statuses, statusOptions)}`);
    return parts.join(" · ");
  }, [filters, disciplineOptions, zoneOptions, statusOptions]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const delayedOrBlockedCount = matched.filter(
    (t) => t.delay_status === "delayed" || t.delay_status === "blocked",
  ).length;
  const unassignedCount = matched.filter((t) => !t.owner_name).length;

  return (
    <div className="flex flex-col gap-5 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CalendarRange className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Look-ahead Planner</h1>
            <p className="text-sm text-muted-foreground">
              Upcoming tasks from {formatLong(windowStart)} to {formatLong(effectiveEnd)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Quick presets — set the end date N weeks after the current start */}
          <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
            {WEEKS_OPTIONS.map((w) => {
              const presetEnd = addDaysIso(windowStart, w * 7);
              const active = presetEnd === effectiveEnd;
              return (
                <button
                  key={w}
                  type="button"
                  aria-pressed={active}
                  onClick={() => updateUrl({ to: presetEnd })}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {w}W
                </button>
              );
            })}
          </div>

          {/* Date range — pick exactly the window you want to see */}
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1 text-xs text-muted-foreground">
            <span>From</span>
            <input
              type="date"
              value={windowStart}
              onChange={(e) => e.target.value && updateUrl({ from: e.target.value })}
              className="rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring"
            />
            <span>To</span>
            <input
              type="date"
              value={effectiveEnd}
              onChange={(e) => e.target.value && updateUrl({ to: e.target.value })}
              className="rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-foreground outline-none focus:border-ring"
            />
          </div>

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <LookaheadFilterBar
        disciplineOptions={disciplineOptions}
        zoneOptions={zoneOptions}
        statusOptions={statusOptions}
        disciplines={filters.disciplines}
        zones={filters.zones}
        statuses={filters.statuses}
        onDisciplines={(v) => updateUrl({ disciplines: v })}
        onZones={(v) => updateUrl({ zones: v })}
        onStatuses={(v) => updateUrl({ statuses: v as LookaheadStatus[] })}
        shown={matched.length}
        total={windowTasks.length}
        hiddenDone={filters.statuses.length === 0 ? (statusOptions.find((o) => o.value === "done")?.count ?? 0) : 0}
        hasActive={hasActive}
        onClear={clearFilters}
        onCopyLink={copyLink}
      />

      {/* Print header (visible only on print) */}
      <div className="hidden print:block mb-4">
        <h1 className="text-2xl font-bold">Look-ahead Plan — {formatLong(windowStart)} to {formatLong(effectiveEnd)}</h1>
        <p className="text-sm text-slate-500">
          {selectedProject?.project_name} · Generated {new Date().toLocaleDateString()}
        </p>
        {activeFilterSummary && <p className="text-sm text-slate-500">Filters — {activeFilterSummary}</p>}
      </div>

      {!data.loading && matched.length === 0 && windowTasks.length > 0 && selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center print:hidden">
          <CalendarRange className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No activities match these filters</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
            <X className="mr-1.5 h-4 w-4" />
            Clear filters
          </Button>
        </div>
      )}

      {!data.loading && windowTasks.length === 0 && selectedProjectId && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center print:hidden">
          <CalendarRange className="mb-3 h-10 w-10 text-slate-300" />
          <p className="text-sm font-medium text-slate-500">No upcoming tasks in this date range</p>
          <p className="mt-1 text-xs text-slate-400">Tasks need a start date set to appear here.</p>
        </div>
      )}

      {/* Gantt-bar timeline (screen only — not meaningful on paper) */}
      {matched.length > 0 && (
        <div className="print:hidden">
          <WbsLookaheadTimeline tasks={matched} float={data.float} />
        </div>
      )}

      {/* Constraint readiness (Completion Plan 1.8) — screen only */}
      {matched.length > 0 && (
        <div className="print:hidden">
          <WbsConstraintReadiness tasks={matched.map((t) => ({ id: t.id, task_code: t.task_code, task_name: t.task_name }))} />
        </div>
      )}

      {/* Print-only flat task table */}
      {matched.length > 0 && (
        <div className="hidden print:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-2 py-1">Code</th>
                <th className="px-2 py-1">Name</th>
                <th className="px-2 py-1">Discipline</th>
                <th className="px-2 py-1">Owner</th>
                <th className="px-2 py-1">Start</th>
                <th className="px-2 py-1">Finish</th>
                <th className="px-2 py-1">Progress</th>
                <th className="px-2 py-1">Status</th>
                <th className="px-2 py-1">Delay</th>
              </tr>
            </thead>
            <tbody>
              {matched.map((t) => (
                <tr key={t.id} className="border-b border-slate-100">
                  <td className="px-2 py-1 font-mono">{t.task_code}</td>
                  <td className="px-2 py-1">{t.task_name}</td>
                  <td className="px-2 py-1">{t.discipline ?? "—"}</td>
                  <td className="px-2 py-1">{t.owner_name ?? "Unassigned"}</td>
                  <td className="px-2 py-1">{formatShort(t.start_date)}</td>
                  <td className="px-2 py-1">{formatShort(t.end_date)}</td>
                  <td className="px-2 py-1">{t.progress}%</td>
                  <td className="px-2 py-1">{t.status.replace(/_/g, " ")}</td>
                  <td className="px-2 py-1">{(t.delay_status ?? "on_track").replace(/_/g, " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary footer */}
      {matched.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 print:mt-4">
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <strong className="text-slate-700">{matched.length}</strong> tasks in this range
          </span>
          {delayedOrBlockedCount > 0 && (
            <span className="flex items-center gap-1.5 text-red-600">
              <AlertTriangle className="h-3.5 w-3.5" />
              <strong>{delayedOrBlockedCount}</strong> delayed / blocked
            </span>
          )}
          <span>
            <strong className="text-slate-700">{unassignedCount}</strong> unassigned
          </span>
        </div>
      )}
    </div>
  );
}
