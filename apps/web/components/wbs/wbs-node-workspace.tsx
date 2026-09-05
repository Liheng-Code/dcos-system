"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays, Edit3, Lock, Save, TrendingUp } from "lucide-react";
import { WbsCostTab } from "@/components/wbs/wbs-cost-tab";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { type WbsNodeData, type WbsNodeRecord, type WbsTaskRecord } from "@/components/wbs/wbs-types";

interface WbsNodeWorkspaceProps {
  node: WbsNodeData;
  nodeRecord: WbsNodeRecord | null;
  tasks: WbsTaskRecord[];
  onSave: () => void;
  /** This node, or an ancestor, is locked as the Planning backbone. */
  locked?: boolean;
}

const NODE_TYPES = ["building", "level", "zone", "room", "element", "discipline", "task_group"];
const STATUSES = ["active", "on_hold", "closed"];
const TABS = ["details", "cost", "edit", "permissions"] as const;

function dateRange(tasks: WbsTaskRecord[], field: "start_date" | "end_date") {
  const dates = tasks.map((task) => task[field]).filter((date): date is string => !!date).sort();
  if (dates.length === 0) return null;
  return field === "start_date" ? dates[0] : dates[dates.length - 1];
}

export function WbsNodeWorkspace({ node, nodeRecord, tasks, onSave, locked = false }: WbsNodeWorkspaceProps) {
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<(typeof TABS)[number]>("details");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    wbs_code: nodeRecord?.wbs_code ?? node.wbs_code,
    wbs_name: nodeRecord?.wbs_name ?? node.wbs_name,
    node_type: nodeRecord?.node_type ?? node.node_type,
    status: nodeRecord?.status ?? node.status,
    sort_order: nodeRecord?.sort_order?.toString() ?? "0",
  });

  const plannedStart = dateRange(tasks, "start_date");
  const plannedFinish = dateRange(tasks, "end_date");
  const lateTasks = tasks.filter((task) => task.delay_status === "delayed" || task.delay_status === "blocked").length;

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

  async function handleSave() {
    if (!nodeRecord) return;
    if (locked) {
      toast.error("This WBS node is locked (Planning backbone) — unlock it first");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("wbs_nodes")
      .update({
        wbs_code: form.wbs_code,
        wbs_name: form.wbs_name,
        node_type: form.node_type,
        status: form.status,
        sort_order: parseInt(form.sort_order) || 0,
      })
      .eq("id", nodeRecord.id);

    if (error) toast.error(error.message);
    else {
      toast.success("WBS node updated");
      onSave();
      setTab("details");
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <Lock className="h-3.5 w-3.5 shrink-0" />
          <span>Locked — Planning backbone. Structure and GFA can&apos;t be edited until it is unlocked.</span>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs text-slate-500">{nodeRecord?.full_path ?? node.full_path ?? node.wbs_code}</div>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{node.wbs_name}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
            <span className="rounded-full bg-slate-100 px-2 py-1 capitalize text-slate-700">{node.node_type}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 font-mono text-slate-700">{node.wbs_code}</span>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">{tasks.length} tasks</span>
          </div>
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
              {lateTasks > 0 && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-medium text-red-600">Late</span>}
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
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Tasks</div>
                <div className="mt-1 font-semibold">{tasks.length}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Late Tasks</div>
                <div className="mt-1 font-semibold">{lateTasks}</div>
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
              <div className="mt-2 text-[10px] text-slate-400">{varianceSummary.total} of {tasks.length} tasks have a baseline set</div>
            </section>
          )}

          <section className="rounded-xl border border-slate-200 p-4">
            <dl className="grid grid-cols-2 gap-4 text-xs">
              <div><dt className="mb-1 uppercase tracking-wider text-slate-500">Type</dt><dd className="capitalize">{node.node_type}</dd></div>
              <div><dt className="mb-1 uppercase tracking-wider text-slate-500">Code</dt><dd className="font-mono">{node.wbs_code}</dd></div>
              <div className="col-span-2"><dt className="mb-1 uppercase tracking-wider text-slate-500">Full Path</dt><dd>{nodeRecord?.full_path ?? node.full_path ?? "-"}</dd></div>
              <div><dt className="mb-1 uppercase tracking-wider text-slate-500">Status</dt><dd className="capitalize">{node.status.replace(/_/g, " ")}</dd></div>
              <div><dt className="mb-1 uppercase tracking-wider text-slate-500">Description</dt><dd className="italic text-slate-500">None</dd></div>
            </dl>
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

      {tab === "edit" && (
        <section className="rounded-xl border border-slate-200 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Edit3 className="h-4 w-4" />
            Edit WBS Information
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inline_wbs_code">WBS Code *</Label>
              <input id="inline_wbs_code" value={form.wbs_code} onChange={(e) => setForm((prev) => ({ ...prev, wbs_code: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inline_node_type">Node Type</Label>
              <select id="inline_node_type" value={form.node_type} onChange={(e) => setForm((prev) => ({ ...prev, node_type: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                {NODE_TYPES.map((type) => <option key={type} value={type}>{type.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="inline_wbs_name">Name *</Label>
              <input id="inline_wbs_name" value={form.wbs_name} onChange={(e) => setForm((prev) => ({ ...prev, wbs_name: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inline_status">Status</Label>
              <select id="inline_status" value={form.status} onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary">
                {STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inline_sort_order">Sort Order</Label>
              <input id="inline_sort_order" type="number" value={form.sort_order} onChange={(e) => setForm((prev) => ({ ...prev, sort_order: e.target.value }))} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary" />
            </div>
          </div>
          <div className="mt-4 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || locked || !form.wbs_code.trim() || !form.wbs_name.trim()}
            >
              <Save className="mr-1.5 h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </section>
      )}

      {tab === "permissions" && (
        <section className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <Lock className="h-4 w-4" />
            Permissions
          </div>
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
            WBS permissions are inherited from the selected project. Node-level permission rules can be added here when project permissions are expanded.
          </div>
        </section>
      )}
    </div>
  );
}
