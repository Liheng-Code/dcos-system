"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import {
  getProjectCalendarRow,
  listNorms,
  listTaskWork,
  listTasksForWork,
  recomputeProjectWork,
  saveTaskWork,
  type Norm,
  type TaskRow,
  type TaskWork,
  type TaskWorkInput,
} from "@/lib/planning/productivity-service";
import { buildWorkCalendar, hoursPerDayOf, workingDaysBetween, type WorkCalendar } from "@/lib/planning/work-calendar";
import { computeTaskWork, roundTo, type CalcStatus, type WorkResult } from "@/lib/planning/work-engine";
import { cn } from "@/lib/utils";

interface Draft {
  quantity: string;
  unit: string;
  normId: string;
  crews: string;
  adjust: string;
}

const PAGE_SIZE = 50;
const EMPTY: Draft = { quantity: "", unit: "", normId: "", crews: "1", adjust: "100" };

const parseNum = (s: string): number | null => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

function draftOf(w: TaskWork | undefined): Draft {
  if (!w) return EMPTY;
  return {
    quantity: w.quantity === null ? "" : String(w.quantity),
    unit: w.quantity_unit ?? "",
    normId: w.norm_id ?? "",
    crews: String(w.crews),
    adjust: String(w.productivity_adjust_pct),
  };
}

const sameDraft = (a: Draft, b: Draft) =>
  a.quantity === b.quantity && a.unit === b.unit && a.normId === b.normId && a.crews === b.crews && a.adjust === b.adjust;

const STATUS_LABEL: Record<CalcStatus, string> = {
  ok: "OK",
  missing_quantity: "No quantity",
  missing_unit: "No unit",
  missing_norm: "No norm",
  unit_mismatch: "Unit â‰  norm",
  invalid_input: "Invalid",
  no_duration: "No duration",
};

const labourWorkers = (n: Norm) => n.crew.filter((c) => c.kind === "labor").reduce((s, c) => s + c.workers_per_crew, 0);

export function PlanTaskWork() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const { can, loaded: permsLoaded } = usePlanningPermissions();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [work, setWork] = useState<Map<string, TaskWork>>(new Map());
  const [norms, setNorms] = useState<Norm[]>([]);
  const [cal, setCal] = useState<WorkCalendar | null>(null);
  const [drafts, setDrafts] = useState<Map<string, Draft>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [search, setSearch] = useState("");
  const [discipline, setDiscipline] = useState("all");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);

  const canView = can("task_work", "view");
  const canEdit = can("task_work", "edit");
  const canCreate = can("task_work", "can_create");
  const readOnly = !canEdit && !canCreate;

  const load = useCallback(async () => {
    if (!selectedProjectId) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [t, w, n, c] = await Promise.all([
        listTasksForWork(selectedProjectId),
        listTaskWork(selectedProjectId),
        listNorms(selectedProjectId),
        getProjectCalendarRow(selectedProjectId),
      ]);
      setTasks(t);
      setWork(new Map(w.map((r) => [r.task_id, r])));
      setNorms(n);
      setCal(buildWorkCalendar(c.calendar, c.exceptions));
      setDrafts(new Map());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
  useEffect(() => { void load(); }, [load]);

  const normsById = useMemo(() => new Map(norms.map((n) => [n.id, n])), [norms]);
  // approved first, then drafts; retired only when already chosen
  const pickableNorms = useMemo(
    () => [...norms].filter((n) => n.status !== "retired").sort((a, b) => (a.status === b.status ? a.code.localeCompare(b.code) : a.status === "approved" ? -1 : 1)),
    [norms],
  );
  const disciplines = useMemo(() => [...new Set(tasks.map((t) => t.discipline).filter(Boolean) as string[])].sort(), [tasks]);

  const draftFor = useCallback((id: string): Draft => drafts.get(id) ?? draftOf(work.get(id)), [drafts, work]);
  const isDirty = useCallback((id: string) => drafts.has(id) && !sameDraft(drafts.get(id)!, draftOf(work.get(id))), [drafts, work]);
  const dirtyIds = useMemo(() => tasks.filter((t) => isDirty(t.id)).map((t) => t.id), [tasks, isDirty]);

  function edit(taskId: string, patch: Partial<Draft>) {
    setDrafts((prev) => {
      const next = new Map(prev);
      const cur = prev.get(taskId) ?? draftOf(work.get(taskId));
      const merged = { ...cur, ...patch };
      // choosing a norm fills an empty unit from it
      if (patch.normId && !merged.unit.trim()) merged.unit = normsById.get(patch.normId)?.unit ?? merged.unit;
      next.set(taskId, merged);
      return next;
    });
  }

  function previewOf(task: TaskRow): WorkResult | null {
    const d = draftFor(task.id);
    const hasInput = !sameDraft(d, EMPTY) || work.has(task.id);
    if (!hasInput || !cal) return null;
    const norm = d.normId ? normsById.get(d.normId) ?? null : null;
    const dur =
      task.start_date && task.end_date && !task.is_milestone ? workingDaysBetween(cal, task.start_date, task.end_date) : null;
    return computeTaskWork({
      quantity: parseNum(d.quantity),
      quantityUnit: d.unit.trim() || null,
      norm: norm ? { unit: norm.unit, labourConstantHrPerUnit: norm.labour_constant_hr_per_unit, efficiencyPct: norm.efficiency_pct } : null,
      adjustPct: parseNum(d.adjust) ?? 100,
      crewWorkers: norm ? labourWorkers(norm) : 0,
      crews: parseNum(d.crews) ?? 1,
      hoursPerDay: cal ? hoursPerDayOf(cal) : 8,
      currentDurationWd: dur,
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      const w = work.get(t.id);
      if (q && !`${t.task_code} ${t.task_name}`.toLowerCase().includes(q)) return false;
      if (discipline !== "all" && t.discipline !== discipline) return false;
      if (filter === "with_data") return !!w;
      if (filter === "no_data") return !w;
      if (filter === "attention") return !!w && w.calc_status !== "ok";
      if (filter === "unsaved") return dirtyIds.includes(t.id);
      return true;
    });
  }, [tasks, work, search, discipline, filter, dirtyIds]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const totals = useMemo(() => {
    let hours = 0, ok = 0, attention = 0;
    for (const w of work.values()) {
      if (w.work_hours) hours += w.work_hours;
      if (w.calc_status === "ok") ok++; else attention++;
    }
    return { hours, ok, attention, none: tasks.length - work.size };
  }, [work, tasks.length]);

  async function save() {
    const inputs: TaskWorkInput[] = [];
    for (const id of dirtyIds) {
      const d = drafts.get(id)!;
      const crews = parseNum(d.crews);
      const adjust = parseNum(d.adjust);
      if (d.quantity.trim() !== "" && parseNum(d.quantity) === null) { toast.error(`Quantity is not a number (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
      if (crews === null || crews <= 0) { toast.error(`Crews must be more than 0 (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
      if (adjust === null || adjust <= 0) { toast.error(`Adjustment must be more than 0% (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
      inputs.push({
        task_id: id,
        quantity: parseNum(d.quantity),
        quantity_unit: d.unit.trim() || null,
        norm_id: d.normId || null,
        crews,
        productivity_adjust_pct: adjust,
        duration_mode: work.get(id)?.duration_mode ?? "manual",
      });
    }
    if (inputs.length === 0) return;
    setSaving(true);
    try {
      await saveTaskWork(inputs, new Set(work.keys()));
      toast.success(`${inputs.length} task${inputs.length === 1 ? "" : "s"} saved`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function recompute() {
    if (!selectedProjectId) return;
    setRecomputing(true);
    try {
      const n = await recomputeProjectWork(selectedProjectId);
      toast.success(`${n} task${n === 1 ? "" : "s"} recalculated`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRecomputing(false);
    }
  }

  if (projectLoading || !permsLoaded || loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!selectedProjectId) return <p className="py-10 text-center text-sm text-muted-foreground">Select a project from the sidebar to enter task quantities.</p>;
  if (!canView) return <p className="py-10 text-center text-sm text-muted-foreground">You do not have access to task work.</p>;

  const INPUT = "w-full rounded border border-border bg-background px-1.5 py-1 text-xs outline-none focus:border-primary disabled:opacity-60";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total man-hours", value: Math.round(totals.hours).toLocaleString(), hint: "tasks with a valid calculation" },
          { label: "Tasks with work data", value: String(totals.ok), hint: `of ${tasks.length} tasks` },
          { label: "Need attention", value: String(totals.attention), hint: "missing norm, unit mismatchâ€¦", warn: totals.attention > 0 },
          { label: "No quantity yet", value: String(totals.none), hint: "no work record" },
        ].map((k) => (
          <div key={k.label} className={cn("rounded-lg border bg-card p-3", k.warn ? "border-amber-500/40" : "border-border")}>
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
            <p className={cn("text-xl font-bold tabular-nums", k.warn && "text-amber-400")}>{k.value}</p>
            <p className="text-[10px] text-muted-foreground">{k.hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Search task code or nameâ€¦" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <select className="rounded-md border border-border bg-background px-2.5 py-2 text-sm" value={discipline} onChange={(e) => { setDiscipline(e.target.value); setPage(0); }}>
          <option value="all">All disciplines</option>
          {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="rounded-md border border-border bg-background px-2.5 py-2 text-sm" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }}>
          <option value="all">All tasks</option><option value="with_data">With work data</option><option value="no_data">Without work data</option>
          <option value="attention">Needs attention</option><option value="unsaved">Unsaved changes</option>
        </select>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={recompute} disabled={recomputing || saving || work.size === 0}
            title="Recalculate after norms, task dates or calendar hours changed"
            className="inline-flex items-center gap-1.5 rounded-lg border border-orange-400 bg-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-100 disabled:brightness-90 disabled:hover:bg-orange-500">
            {recomputing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Recalculate all
          </button>
          {!readOnly && (
            <button type="button" onClick={save} disabled={saving || dirtyIds.length === 0}
              className="inline-flex items-center gap-1.5 rounded-lg border border-orange-400 bg-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-100 disabled:brightness-90 disabled:hover:bg-orange-500">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save {dirtyIds.length > 0 ? `${dirtyIds.length} change${dirtyIds.length === 1 ? "" : "s"}` : "changes"}
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full min-w-[1080px] text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-2 py-2 font-medium">Task</th>
              <th className="px-2 py-2 text-right font-medium" title="Working days between the task's dates on the project calendar">Sched. days</th>
              <th className="w-24 px-2 py-2 font-medium">Quantity</th>
              <th className="w-20 px-2 py-2 font-medium">Unit</th>
              <th className="w-56 px-2 py-2 font-medium">Norm</th>
              <th className="w-16 px-2 py-2 font-medium" title="Crews working in parallel">Crews</th>
              <th className="w-16 px-2 py-2 font-medium" title="Task-level productivity adjustment (site conditions, heightâ€¦)">Adj. %</th>
              <th className="px-2 py-2 text-right font-medium">Man-hours</th>
              <th className="px-2 py-2 text-right font-medium" title="Workers needed to finish inside the scheduled days">Crew req.</th>
              <th className="px-2 py-2 text-right font-medium" title="Working days for the planned crew">Days @ crew</th>
              <th className="px-2 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((t) => {
              const d = draftFor(t.id);
              const dirty = isDirty(t.id);
              const p = previewOf(t);
              const norm = d.normId ? normsById.get(d.normId) : undefined;
              const schedDays = cal && t.start_date && t.end_date && !t.is_milestone ? workingDaysBetween(cal, t.start_date, t.end_date) : null;
              const showLive = dirty || !work.has(t.id);
              const r = showLive ? p : (() => { const w = work.get(t.id)!; return { workHours: w.work_hours, crewRequired: w.crew_required, durationWdDerived: w.duration_wd_derived, status: w.calc_status, message: w.calc_message } as Partial<WorkResult>; })();
              return (
                <tr key={t.id} className={cn("border-b border-border last:border-0", dirty && "bg-primary/5")}>
                  <td className="max-w-[260px] px-2 py-1.5">
                    <span className="block truncate font-medium" title={t.task_name}>{t.task_code}</span>
                    <span className="block truncate text-muted-foreground" title={t.task_name}>{t.task_name}</span>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{schedDays ?? (t.is_milestone ? "ms" : "â€”")}</td>
                  <td className="px-2 py-1.5"><input className={INPUT} inputMode="decimal" value={d.quantity} disabled={readOnly} onChange={(e) => edit(t.id, { quantity: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={INPUT} list="task-work-units" value={d.unit} disabled={readOnly} onChange={(e) => edit(t.id, { unit: e.target.value })} /></td>
                  <td className="px-2 py-1.5">
                    <select className={INPUT} value={d.normId} disabled={readOnly} onChange={(e) => edit(t.id, { normId: e.target.value })}>
                      <option value="">â€” none â€”</option>
                      {pickableNorms.filter((n) => !d.unit.trim() || n.unit.toLowerCase() === d.unit.trim().toLowerCase() || n.id === d.normId).map((n) => (
                        <option key={n.id} value={n.id}>{n.status === "draft" ? "(draft) " : ""}{n.code} â€” {n.name}</option>
                      ))}
                      {norm && norm.status === "retired" && <option value={norm.id}>(retired) {norm.code}</option>}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input className={INPUT} inputMode="decimal" value={d.crews} disabled={readOnly} onChange={(e) => edit(t.id, { crews: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={INPUT} inputMode="decimal" value={d.adjust} disabled={readOnly} onChange={(e) => edit(t.id, { adjust: e.target.value })} /></td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r?.workHours != null ? roundTo(r.workHours, 1).toLocaleString() : "â€”"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r?.crewRequired != null ? r.crewRequired : "â€”"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r?.durationWdDerived != null ? r.durationWdDerived : "â€”"}</td>
                  <td className="px-2 py-1.5">
                    {r?.status ? (
                      <span title={r.message ?? undefined} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        r.status === "ok" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400")}>
                        {STATUS_LABEL[r.status as CalcStatus]}{dirty ? " Â· unsaved" : ""}
                      </span>
                    ) : <span className="text-muted-foreground">â€”</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <datalist id="task-work-units">{["m3", "m2", "m", "kg", "t", "no", "ls"].map((u) => <option key={u} value={u} />)}</datalist>
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">No tasks match the filters.</p>}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{filtered.length} tasks Â· hours per working day on this project&apos;s calendar: <strong className="text-foreground">{cal ? hoursPerDayOf(cal) : 8}</strong></span>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>
    </div>
  );
}
