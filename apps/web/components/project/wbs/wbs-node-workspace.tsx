"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ExternalLink, ListChecks, Lock, TrendingUp } from "lucide-react";
import { WbsCostTab } from "@/components/project/wbs/wbs-cost-tab";
import { cn } from "@/lib/utils";
import { type WbsNodeData, type WbsNodeRecord, type WbsTaskRecord } from "@/components/project/wbs/wbs-types";

interface WbsNodeWorkspaceProps {
  node: WbsNodeData;
  nodeRecord: WbsNodeRecord | null;
  tasks: WbsTaskRecord[];
  onSave: () => void;
  /** This node, or an ancestor, is locked as the Planning backbone. */
  locked?: boolean;
}

// Node fields (code, name, type, status, ...) are edited in the WBS grid itself; the panel shows
// what the grid can't: schedule, activities and cost.
const TABS = ["details", "cost"] as const;

function dateRange(tasks: WbsTaskRecord[], field: "start_date" | "end_date") {
  const dates = tasks.map((task) => task[field]).filter((date): date is string => !!date).sort();
  if (dates.length === 0) return null;
  return field === "start_date" ? dates[0] : dates[dates.length - 1];
}

const statusText = (s: string | null | undefined) => (s ? s.replace(/_/g, " ") : "");

export function WbsNodeWorkspace({ node, nodeRecord, tasks, locked = false }: WbsNodeWorkspaceProps) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("details");

  const plannedStart = dateRange(tasks, "start_date");
  const plannedFinish = dateRange(tasks, "end_date");
  const lateTasks = tasks.filter((task) => task.delay_status === "delayed" || task.delay_status === "blocked").length;
  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.task_code ?? "").localeCompare(b.task_code ?? "", undefined, { numeric: true })),
    [tasks],
  );

  const varianceSummary = useMemo(() => {
    const baselined = tasks.filter((t) => t.baseline_finish_date && t.end_date);
    if (baselined.length === 0) return null;
    const delayed = baselined.filter(
      (t) => new Date(t.end_date!) > new Date(t.baseline_finish_date!),
    );
    const avgDays = Math.round(
      baselined.reduce((sum, t) => {
        return sum + (new Date(t.end_date!).getTime() - new Date(t.baseline_finish_date!).getTime()) / 86400000;
      }, 0) / baselined.length,
    );
    return { total: baselined.length, delayed: delayed.length, onTime: baselined.length - delayed.length, avgDays };
  }, [tasks]);

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>Locked — Planning backbone. Structure and GFA can&apos;t be edited until it is unlocked.</span>
        </div>
      )}
      <div>
        <div className="text-xs text-slate-500">{nodeRecord?.full_path ?? node.full_path ?? node.wbs_code}</div>
        <h2 className="mt-1 text-xl font-semibold text-slate-900">{node.wbs_name}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="rounded-full bg-slate-100 px-2 py-1 capitalize text-slate-700">{statusText(node.node_type)}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-slate-700">{node.wbs_code}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{tasks.length} activities</span>
        </div>
      </div>

      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium capitalize text-slate-600", tab === item && "bg-white text-slate-900 shadow-sm")}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="space-y-4">
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarDays className="h-4 w-4" />
                Schedule
              </div>
              {lateTasks > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600">{lateTasks} late</span>}
            </div>
            <div className="grid grid-cols-2 gap-6 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Planned Start</div>
                <div className="mt-1 font-semibold">{plannedStart ?? "-"}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Planned Finish</div>
                <div className="mt-1 font-semibold">{plannedFinish ?? "-"}</div>
              </div>
            </div>
            <div className="mt-5">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>Progress weighted</span>
                <span>{node.progress_percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-slate-900" style={{ width: `${node.progress_percent}%` }} />
              </div>
            </div>
          </section>

          {varianceSummary && (
            <section className="rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <TrendingUp className="h-4 w-4" />
                Schedule Variance
              </div>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-emerald-50 p-3 text-center">
                  <div className="text-lg font-bold text-emerald-700">{varianceSummary.onTime}</div>
                  <div className="text-[10px] text-emerald-600">On Schedule</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${varianceSummary.delayed > 0 ? "bg-red-50" : "bg-slate-50"}`}>
                  <div className={`text-lg font-bold ${varianceSummary.delayed > 0 ? "text-red-700" : "text-slate-400"}`}>{varianceSummary.delayed}</div>
                  <div className={`text-[10px] ${varianceSummary.delayed > 0 ? "text-red-600" : "text-slate-400"}`}>Delayed</div>
                </div>
                <div className={`rounded-lg p-3 text-center ${varianceSummary.avgDays > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
                  <div className={`text-lg font-bold ${varianceSummary.avgDays > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {varianceSummary.avgDays > 0 ? "+" : ""}{varianceSummary.avgDays}d
                  </div>
                  <div className={`text-[10px] ${varianceSummary.avgDays > 0 ? "text-amber-600" : "text-emerald-600"}`}>Avg Variance</div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-slate-400">{varianceSummary.total} of {tasks.length} activities have a baseline set</div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ListChecks className="h-4 w-4" />
              Activities
              <span className="text-xs font-normal text-slate-500">({tasks.length})</span>
            </div>
            {sortedTasks.length === 0 ? (
              <p className="text-xs text-slate-500">No activities directly under this node.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-xs">
                {sortedTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-24 shrink-0 truncate font-mono text-[10px] text-slate-500">{t.task_code}</span>
                    <span className="min-w-0 flex-1 truncate">{t.task_name}</span>
                    <span className="shrink-0 capitalize text-slate-500">{statusText(t.status)}</span>
                    <span className="w-9 shrink-0 text-right tabular-nums">{Math.round(t.progress ?? 0)}%</span>
                    <Link href={`/dashboard/tasks/${t.id}`} className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Open ${t.task_name}`}>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {tab === "cost" && (
        nodeRecord ? (
          <WbsCostTab
            projectId={nodeRecord.project_id}
            wbsNodeId={node.id}
            tasks={tasks}
            nodeBudget={node.budget_cost}
            nodeActual={node.actual_cost}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">
            Select a saved WBS node to view cost data.
          </div>
        )
      )}
    </div>
  );
}
