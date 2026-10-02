"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { BarChart } from "@/components/report-kit/charts/bar-chart";
import { listTasksForWork, type TaskRow } from "@/lib/planning/productivity-service";
import {
  createProductivityLog,
  deleteProductivityLog,
  getTaskWorkContext,
  listProductivityLogs,
  type ProductivityLog,
} from "@/lib/planning/productivity-log-service";
import { aggregatePiByTrade, computeProductivityLog, type PiStatus } from "@/lib/planning/productivity-index";
import { todayISO } from "@/lib/planning/work-calendar";
import { cn } from "@/lib/utils";

const PI_STATUS_LABEL: Record<PiStatus, string> = {
  ok: "OK",
  no_task: "No task",
  no_norm: "No norm",
  no_quantity: "No quantity",
  unit_mismatch: "Unit mismatch",
  no_hours: "No hours",
};

const PI_STATUS_STYLE: Record<PiStatus, string> = {
  ok: "",
  no_task: "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
  no_norm: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  no_quantity: "border-amber-500/30 bg-amber-500/15 text-amber-400",
  unit_mismatch: "border-red-500/30 bg-red-500/15 text-red-400",
  no_hours: "border-zinc-500/30 bg-zinc-500/15 text-zinc-400",
};

function piBadge(index: number | null, status: PiStatus) {
  if (status !== "ok" || index === null) {
    return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", PI_STATUS_STYLE[status])}>{PI_STATUS_LABEL[status]}</span>;
  }
  const cls = index >= 1 ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400";
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums", cls)}>{index.toFixed(2)}×</span>;
}

const emptyForm = {
  logDate: todayISO(),
  taskId: null as string | null,
  taskQuery: "",
  trade: "",
  headcount: "1",
  hoursNormal: "8",
  hoursOt: "0",
  quantityDone: "",
  unit: "",
  note: "",
};

/** Site Records (Productivity plan, Phase 5 part A) — fast daily entry of headcount/hours/quantity done per
 * task or trade, plus the resulting productivity index (actual ÷ norm) per trade. */
export function PlanSiteRecords() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const { can, loaded: permsLoaded } = usePlanningPermissions();
  const canCreate = can("productivity", "can_create");
  const canDelete = can("productivity", "delete");
  const canView = can("productivity", "view");

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [logs, setLogs] = useState<ProductivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [taskNorm, setTaskNorm] = useState<{ unit: string; labourConstantHrPerUnit: number } | null>(null);
  const [showTaskList, setShowTaskList] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!selectedProjectId) { setTasks([]); setLogs([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [t, l] = await Promise.all([listTasksForWork(selectedProjectId), listProductivityLogs(selectedProjectId)]);
      setTasks(t);
      setLogs(l);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
  useEffect(() => { void load(); }, [load]);

  const taskMatches = useMemo(() => {
    const q = form.taskQuery.trim().toLowerCase();
    if (!q) return [];
    return tasks.filter((t) => `${t.task_code} ${t.task_name}`.toLowerCase().includes(q)).slice(0, 20);
  }, [tasks, form.taskQuery]);

  async function pickTask(t: TaskRow | null) {
    if (!t) {
      setForm((f) => ({ ...f, taskId: null, taskQuery: "" }));
      setTaskNorm(null);
      setShowTaskList(false);
      return;
    }
    setForm((f) => ({ ...f, taskId: t.id, taskQuery: `${t.task_code} — ${t.task_name}` }));
    setShowTaskList(false);
    try {
      const ctx = await getTaskWorkContext(t.id);
      setTaskNorm(ctx.norm ? { unit: ctx.norm.unit, labourConstantHrPerUnit: ctx.norm.labourConstantHrPerUnit } : null);
      setForm((f) => ({
        ...f,
        trade: f.trade || ctx.suggestedTrade || "",
        unit: f.unit || ctx.quantityUnit || "",
      }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const preview = useMemo(
    () =>
      computeProductivityLog({
        hasTask: !!form.taskId,
        headcount: Number(form.headcount) || 0,
        hoursNormal: Number(form.hoursNormal) || 0,
        hoursOt: Number(form.hoursOt) || 0,
        quantityDone: form.quantityDone.trim() === "" ? null : Number(form.quantityDone),
        unit: form.unit || null,
        norm: taskNorm,
      }),
    [form, taskNorm],
  );

  async function submit() {
    if (!selectedProjectId) return;
    const headcount = Number(form.headcount);
    const hoursNormal = Number(form.hoursNormal);
    const hoursOt = Number(form.hoursOt);
    if (!(headcount > 0)) { toast.error("Headcount must be greater than zero."); return; }
    if (hoursNormal < 0 || hoursOt < 0) { toast.error("Hours cannot be negative."); return; }
    if (hoursNormal + hoursOt <= 0) { toast.error("Enter normal and/or overtime hours."); return; }
    if (!form.trade.trim()) { toast.error("Enter a trade."); return; }

    setSaving(true);
    try {
      await createProductivityLog(selectedProjectId, {
        task_id: form.taskId,
        trade_code: form.trade.trim(),
        log_date: form.logDate,
        headcount,
        hours_normal: hoursNormal,
        hours_ot: hoursOt,
        quantity_done: form.quantityDone.trim() === "" ? null : Number(form.quantityDone),
        unit: form.unit.trim() || null,
        condition_note: form.note.trim() || null,
      });
      toast.success("Logged");
      setForm({ ...emptyForm, logDate: form.logDate, trade: form.trade });
      setTaskNorm(null);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this log entry?")) return;
    try {
      await deleteProductivityLog(id);
      toast.success("Deleted");
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  const trades = useMemo(
    () => aggregatePiByTrade(logs.map((l) => ({ tradeCode: l.trade_code, actualHours: l.actual_hours ?? 0, productivityIndex: l.productivity_index, piStatus: l.pi_status }))),
    [logs],
  );

  if (projectLoading || !permsLoaded || loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!selectedProjectId) return <p className="py-10 text-center text-sm text-muted-foreground">Select a project from the sidebar to record site output.</p>;
  if (!canView) return <p className="py-10 text-center text-sm text-muted-foreground">You do not have access to productivity records.</p>;

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">Log today&apos;s output</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
              Task (optional)
              <div className="relative">
                <input
                  className="w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary"
                  placeholder="Search task code or name…"
                  value={form.taskQuery}
                  onChange={(e) => { setForm((f) => ({ ...f, taskQuery: e.target.value, taskId: null })); setShowTaskList(true); }}
                  onFocus={() => setShowTaskList(true)}
                  onBlur={() => { blurTimer.current = setTimeout(() => setShowTaskList(false), 150); }}
                />
                {showTaskList && taskMatches.length > 0 && (
                  <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-popover shadow-lg">
                    {taskMatches.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                        onMouseDown={(e) => { e.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); void pickTask(t); }}
                      >
                        <span className="font-medium">{t.task_code}</span> <span className="text-muted-foreground">{t.task_name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Trade
              <input className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.trade} onChange={(e) => setForm((f) => ({ ...f, trade: e.target.value }))} placeholder="e.g. Concreting" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Date
              <input type="date" className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.logDate} onChange={(e) => setForm((f) => ({ ...f, logDate: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Headcount
              <input type="number" min={1} className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.headcount} onChange={(e) => setForm((f) => ({ ...f, headcount: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Normal hrs
              <input type="number" min={0} step={0.5} className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.hoursNormal} onChange={(e) => setForm((f) => ({ ...f, hoursNormal: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              OT hrs
              <input type="number" min={0} step={0.5} className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.hoursOt} onChange={(e) => setForm((f) => ({ ...f, hoursOt: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Quantity done
              <input type="number" min={0} step="any" className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.quantityDone} onChange={(e) => setForm((f) => ({ ...f, quantityDone: e.target.value }))} placeholder="optional" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Unit
              <input className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="m3, m2…" />
            </label>
            <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-4">
              Notes (weather, conditions…)
              <input className="rounded-md border border-border bg-background px-2.5 py-2 text-sm outline-none focus:border-primary" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Actual hours: <strong className="text-foreground">{preview.actualHours}</strong></span>
              {preview.status === "ok" ? (
                <span className="text-muted-foreground">Productivity index: {piBadge(preview.productivityIndex, preview.status)}</span>
              ) : (
                <span className="text-muted-foreground">{preview.message}</span>
              )}
            </div>
            <button type="button" disabled={saving} onClick={() => void submit()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Log entry
            </button>
          </div>
        </div>
      )}

      <BarChart
        title="Productivity index by trade"
        description="Actual ÷ norm man-hours, weighted by each log's actual hours. 1.00× matches the norm; above is faster, below is slower."
        data={trades.map((t) => ({ trade: t.trade, index: t.index }))}
        series={[{ dataKey: "index", name: "Productivity index", color: "var(--chart-1)" }]}
        xKey="trade"
        empty={trades.length === 0}
        formatY={(v) => `${v.toFixed(1)}×`}
        formatTooltip={(v) => `${v.toFixed(2)}×`}
        height={240}
      />

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-2 py-2 font-medium">Date</th>
              <th className="px-2 py-2 font-medium">Task</th>
              <th className="px-2 py-2 font-medium">Trade</th>
              <th className="px-2 py-2 text-right font-medium">Headcount</th>
              <th className="px-2 py-2 text-right font-medium">Hours</th>
              <th className="px-2 py-2 text-right font-medium">Qty done</th>
              <th className="px-2 py-2 font-medium">PI</th>
              <th className="px-2 py-2 font-medium">Source</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="px-2 py-1.5 text-muted-foreground">{l.log_date}</td>
                <td className="px-2 py-1.5">{l.task_code ? <><span className="font-medium">{l.task_code}</span> <span className="text-muted-foreground">{l.task_name}</span></> : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5">{l.trade_code}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.headcount}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.hours_normal}{l.hours_ot > 0 ? ` +${l.hours_ot} OT` : ""}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.quantity_done !== null ? `${l.quantity_done} ${l.unit ?? ""}` : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-2 py-1.5">{piBadge(l.productivity_index, l.pi_status)}</td>
                <td className="px-2 py-1.5 text-muted-foreground capitalize">{l.source.replace("_", " ")}</td>
                <td className="px-2 py-1.5 text-right">
                  {canDelete && (
                    <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-red-400" title="Delete" onClick={() => void remove(l.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No productivity logs yet.</p>}
      </div>
    </div>
  );
}
