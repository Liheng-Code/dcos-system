"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Link2, Loader2, RefreshCw, Save, Search, Upload } from "lucide-react";
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
  type QuantitySource,
  type TaskRow,
  type TaskWork,
  type TaskWorkInput,
} from "@/lib/planning/productivity-service";
import { buildWorkCalendar, hoursPerDayOf, workingDaysBetween, type WorkCalendar } from "@/lib/planning/work-calendar";
import { computeTaskWork, roundTo, type CalcStatus, type DurationMode, type WorkResult } from "@/lib/planning/work-engine";
import { computeTaskCost, type CostCrewLine } from "@/lib/planning/cost-engine";
import { listLaborRates, listOvertimeMultipliers, type LaborRate } from "@/lib/planning/cost-service";
import { PlanTaskWorkCsvDialog } from "./plan-task-work-csv-dialog";
import { PlanTaskWorkHistoryDialog } from "./plan-task-work-history-dialog";
import { PlanDurationApplyDialog } from "./plan-duration-apply-dialog";
import { cn } from "@/lib/utils";

const SOURCE_BADGE: Record<QuantitySource, string> = { manual: "", boq: "Project BOQ", tender_boq: "Tender BOQ", qto: "QTO", import: "CSV import" };
const MODE_LABEL: Record<DurationMode, string> = { manual: "Manual", fixed_duration: "Fixed duration", fixed_crew: "Fixed crew" };
const OT_TYPES = ["weekday", "weekend", "public_holiday", "night_shift", "emergency", "project_critical"] as const;
const OT_TYPE_LABEL: Record<string, string> = { weekday: "Weekday", weekend: "Weekend", public_holiday: "Public holiday", night_shift: "Night shift", emergency: "Emergency", project_critical: "Project critical" };

interface Draft {
  quantity: string;
  unit: string;
  normId: string;
  crews: string;
  adjust: string;
  mode: DurationMode;
  otPct: string;
  otType: string;
}

const PAGE_SIZE = 50;
const EMPTY: Draft = { quantity: "", unit: "", normId: "", crews: "1", adjust: "100", mode: "manual", otPct: "0", otType: "weekday" };

const parseNum = (s: string): number | null => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));

function draftOf(w: TaskWork | undefined): Draft {
  if (!w) return EMPTY;
  return {
    quantity: w.quantity === null ? "" : String(w.quantity),
    unit: w.quantity_unit ?? "",
    normId: w.norm_id ?? "",
    crews: String(w.crews),
    adjust: String(w.productivity_adjust_pct),
    mode: w.duration_mode,
    otPct: String(w.ot_pct),
    otType: w.ot_type,
  };
}

const PENDING_REASON = "\u0000pending-reason\u0000";

const sameDraft = (a: Draft, b: Draft) =>
  a.quantity === b.quantity && a.unit === b.unit && a.normId === b.normId && a.crews === b.crews && a.adjust === b.adjust
  && a.mode === b.mode && a.otPct === b.otPct && a.otType === b.otType;

const STATUS_LABEL: Record<CalcStatus, string> = {
  ok: "OK",
  missing_quantity: "No quantity",
  missing_unit: "No unit",
  missing_norm: "No norm",
  unit_mismatch: "Unit ≠ norm",
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
  const [showCsv, setShowCsv] = useState(false);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [applyTaskId, setApplyTaskId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<TaskWorkInput[] | null>(null);
  const [revisionReason, setRevisionReason] = useState("");
  const [laborRates, setLaborRates] = useState<Map<string, LaborRate>>(new Map());
  const [otMultipliers, setOtMultipliers] = useState<Map<string, number>>(new Map());

  const canView = can("task_work", "view");
  const canEdit = can("task_work", "edit");
  const canCreate = can("task_work", "can_create");
  const readOnly = !canEdit && !canCreate;

  const load = useCallback(async () => {
    if (!selectedProjectId) { setTasks([]); setLoading(false); return; }
    setLoading(true);
    try {
      const [t, w, n, c, rates, ot] = await Promise.all([
        listTasksForWork(selectedProjectId),
        listTaskWork(selectedProjectId),
        listNorms(selectedProjectId),
        getProjectCalendarRow(selectedProjectId),
        listLaborRates(),
        listOvertimeMultipliers(),
      ]);
      setTasks(t);
      setWork(new Map(w.map((r) => [r.task_id, r])));
      setNorms(n);
      setCal(buildWorkCalendar(c.calendar, c.exceptions));
      setLaborRates(rates);
      setOtMultipliers(ot);
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

  /** Live cost preview: mirrors plan_task_work_compute()'s cost block (see cost-engine.ts). */
  function costPreviewOf(task: TaskRow, work: WorkResult | null): ReturnType<typeof computeTaskCost> | null {
    const d = draftFor(task.id);
    const norm = d.normId ? normsById.get(d.normId) : undefined;
    if (!norm || !cal) return null;
    const crewLines: CostCrewLine[] = norm.crew
      .filter((c) => c.kind === "labor")
      .map((c) => ({
        roleLabel: c.role_label,
        dwlResourceId: c.dwl_resource_id,
        workersPerCrew: c.workers_per_crew,
        dailyRate: c.dwl_resource_id ? laborRates.get(c.dwl_resource_id)?.dailyRate ?? null : null,
        currency: c.dwl_resource_id ? laborRates.get(c.dwl_resource_id)?.currency ?? null : null,
      }));
    return computeTaskCost({
      workHours: work?.workHours ?? null,
      hasValidWork: work?.status === "ok",
      crewLines,
      totalCrewWorkers: labourWorkers(norm),
      hoursPerDay: hoursPerDayOf(cal),
      otPct: parseNum(d.otPct) ?? 0,
      otType: d.otType,
      otMultiplier: otMultipliers.get(d.otType) ?? 1,
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

  /** True when this row's quantity/unit differ from what's stored — a manual override that breaks any BOQ link. */
  function isManualOverride(id: string, d: Draft): boolean {
    const w = work.get(id);
    if (!w) return false;
    const qty = parseNum(d.quantity);
    return qty !== w.quantity || (d.unit.trim() || null) !== w.quantity_unit;
  }

  /** True when this save would replace an already-recorded quantity — the database requires a reason for that. */
  function isRevision(id: string, d: Draft): boolean {
    const w = work.get(id);
    if (!w || w.quantity === null) return false;
    return isManualOverride(id, d);
  }

  function buildInputs(reasonForRevisions: string): TaskWorkInput[] {
    const inputs: TaskWorkInput[] = [];
    for (const id of dirtyIds) {
      const d = drafts.get(id)!;
      const crews = parseNum(d.crews)!;
      const adjust = parseNum(d.adjust)!;
      const w = work.get(id);
      const manual = isManualOverride(id, d);
      inputs.push({
        task_id: id,
        quantity: parseNum(d.quantity),
        quantity_unit: d.unit.trim() || null,
        quantity_source: manual ? "manual" : (w?.quantity_source ?? "manual"),
        quantity_reason: isRevision(id, d) ? (reasonForRevisions || PENDING_REASON) : (manual ? null : w?.quantity_reason ?? null),
        tender_boq_item_id: manual ? null : (w?.tender_boq_item_id ?? null),
        qs_boq_item_id: manual ? null : (w?.qs_boq_item_id ?? null),
        norm_id: d.normId || null,
        crews,
        productivity_adjust_pct: adjust,
        duration_mode: d.mode,
        ot_pct: parseNum(d.otPct) ?? 0,
        ot_type: d.otType,
      });
    }
    return inputs;
  }

  async function commitSave(inputs: TaskWorkInput[]) {
    setSaving(true);
    try {
      await saveTaskWork(inputs, new Set(work.keys()));
      toast.success(`${inputs.length} task${inputs.length === 1 ? "" : "s"} saved`);
      setPendingSave(null);
      setRevisionReason("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    for (const id of dirtyIds) {
      const d = drafts.get(id)!;
      const crews = parseNum(d.crews);
      const adjust = parseNum(d.adjust);
      if (d.quantity.trim() !== "" && parseNum(d.quantity) === null) { toast.error(`Quantity is not a number (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
      if (crews === null || crews <= 0) { toast.error(`Crews must be more than 0 (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
      if (adjust === null || adjust <= 0) { toast.error(`Adjustment must be more than 0% (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
      const otPct = parseNum(d.otPct);
      if (otPct === null || otPct < 0 || otPct > 100) { toast.error(`OT % must be between 0 and 100 (${tasks.find((t) => t.id === id)?.task_code}).`); return; }
    }
    const needsReason = dirtyIds.some((id) => isRevision(id, drafts.get(id)!));
    if (needsReason) {
      // hold the built inputs; the dialog below fills in PENDING_REASON once a reason is confirmed
      setPendingSave(buildInputs(""));
      return;
    }
    const inputs = buildInputs("");
    if (inputs.length === 0) return;
    await commitSave(inputs);
  }

  async function confirmRevisionReason() {
    if (!revisionReason.trim() || !pendingSave) return;
    const inputs = pendingSave.map((r) => (r.quantity_reason === PENDING_REASON ? { ...r, quantity_reason: revisionReason.trim() } : r));
    await commitSave(inputs);
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
          { label: "Need attention", value: String(totals.attention), hint: "missing norm, unit mismatch…", warn: totals.attention > 0 },
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
          <input className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Search task code or name…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
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
          {!readOnly && (
            <button type="button" onClick={() => setShowCsv(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
              <Upload className="h-3.5 w-3.5" /> Import CSV
            </button>
          )}
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
              <th className="w-16 px-2 py-2 font-medium" title="Task-level productivity adjustment (site conditions, height…)">Adj. %</th>
              <th className="w-28 px-2 py-2 font-medium" title={'"Fixed crew" unlocks Apply, to reschedule the task to the derived duration'}>Mode</th>
              <th className="w-14 px-2 py-2 font-medium" title="Share of this task's crew hours paid at the overtime rate">OT %</th>
              <th className="w-28 px-2 py-2 font-medium" title="Which overtime multiplier applies (only matters when OT % > 0)">OT type</th>
              <th className="px-2 py-2 text-right font-medium">Man-hours</th>
              <th className="px-2 py-2 text-right font-medium" title="Workers needed to finish inside the scheduled days">Crew req.</th>
              <th className="px-2 py-2 text-right font-medium" title="Working days for the planned crew">Days @ crew</th>
              <th className="px-2 py-2 text-right font-medium" title="Sum of the task's cost lines (Planning ▸ Productivity ▸ Cost Rollup) — labour only, resolvable rates only">Planned cost</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="w-8 px-2 py-2 font-medium"></th>
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
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{schedDays ?? (t.is_milestone ? "ms" : "—")}</td>
                  <td className="px-2 py-1.5">
                    <input className={INPUT} inputMode="decimal" value={d.quantity} disabled={readOnly} onChange={(e) => edit(t.id, { quantity: e.target.value })} />
                    {work.get(t.id)?.quantity_source && SOURCE_BADGE[work.get(t.id)!.quantity_source] && (
                      <span className="mt-0.5 inline-flex items-center gap-0.5 text-[9px] text-muted-foreground" title="Traceable to a BOQ line — editing the quantity or unit here breaks the link">
                        <Link2 className="h-2.5 w-2.5" /> {SOURCE_BADGE[work.get(t.id)!.quantity_source]}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5"><input className={INPUT} list="task-work-units" value={d.unit} disabled={readOnly} onChange={(e) => edit(t.id, { unit: e.target.value })} /></td>
                  <td className="px-2 py-1.5">
                    <select className={INPUT} value={d.normId} disabled={readOnly} onChange={(e) => edit(t.id, { normId: e.target.value })}>
                      <option value="">— none —</option>
                      {pickableNorms.filter((n) => !d.unit.trim() || n.unit.toLowerCase() === d.unit.trim().toLowerCase() || n.id === d.normId).map((n) => (
                        <option key={n.id} value={n.id}>{n.status === "draft" ? "(draft) " : ""}{n.code} — {n.name}</option>
                      ))}
                      {norm && norm.status === "retired" && <option value={norm.id}>(retired) {norm.code}</option>}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input className={INPUT} inputMode="decimal" value={d.crews} disabled={readOnly} onChange={(e) => edit(t.id, { crews: e.target.value })} /></td>
                  <td className="px-2 py-1.5"><input className={INPUT} inputMode="decimal" value={d.adjust} disabled={readOnly} onChange={(e) => edit(t.id, { adjust: e.target.value })} /></td>
                  <td className="px-2 py-1.5">
                    <select className={INPUT} value={d.mode} disabled={readOnly} onChange={(e) => edit(t.id, { mode: e.target.value as DurationMode })}>
                      {(Object.keys(MODE_LABEL) as DurationMode[]).map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input className={INPUT} inputMode="decimal" value={d.otPct} disabled={readOnly} onChange={(e) => edit(t.id, { otPct: e.target.value })} /></td>
                  <td className="px-2 py-1.5">
                    <select className={INPUT} value={d.otType} disabled={readOnly} onChange={(e) => edit(t.id, { otType: e.target.value })}>
                      {OT_TYPES.map((ot) => <option key={ot} value={ot}>{OT_TYPE_LABEL[ot]}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r?.workHours != null ? roundTo(r.workHours, 1).toLocaleString() : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r?.crewRequired != null ? r.crewRequired : "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {r?.durationWdDerived != null ? r.durationWdDerived : "—"}
                    {!dirty && work.get(t.id)?.duration_mode === "fixed_crew" && work.get(t.id)?.calc_status === "ok"
                      && work.get(t.id)?.duration_wd_derived != null && work.get(t.id)?.duration_wd_derived !== work.get(t.id)?.duration_wd_current && (
                      <button type="button" title="Preview rescheduling this task to its crew-derived duration" onClick={() => setApplyTaskId(t.id)}
                        className="ml-1.5 rounded border border-primary/40 px-1 py-0.5 text-[9px] font-semibold text-primary hover:bg-primary/10">
                        Apply
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {(() => {
                      const w = work.get(t.id);
                      const cost = showLive ? costPreviewOf(t, p) : null;
                      const plannedCost = showLive ? cost?.plannedCost ?? null : w?.planned_cost ?? null;
                      const status = showLive ? cost?.costCalcStatus ?? null : w?.cost_calc_status ?? null;
                      const message = showLive ? cost?.costCalcMessage ?? null : w?.cost_calc_message ?? null;
                      if (plannedCost == null) {
                        return <span className="text-muted-foreground" title={message ?? undefined}>{status === "partial_rate" || status === "no_rate" ? "no rate" : "—"}</span>;
                      }
                      return (
                        <span title={message ?? undefined} className={status === "partial_rate" ? "text-amber-400" : undefined}>
                          ${plannedCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}{status === "partial_rate" ? "*" : ""}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-2 py-1.5">
                    {r?.status ? (
                      <span title={r.message ?? undefined} className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        r.status === "ok" ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400" : "border-amber-500/30 bg-amber-500/15 text-amber-400")}>
                        {STATUS_LABEL[r.status as CalcStatus]}{dirty ? " · unsaved" : ""}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    {work.has(t.id) && (
                      <button type="button" title="Quantity history" onClick={() => setHistoryTaskId(t.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                        <History className="h-3.5 w-3.5" />
                      </button>
                    )}
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
        <span>{filtered.length} tasks · hours per working day on this project&apos;s calendar: <strong className="text-foreground">{cal ? hoursPerDayOf(cal) : 8}</strong></span>
        <div className="flex items-center gap-2">
          <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button type="button" className="rounded border border-border px-2 py-1 hover:bg-muted disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {showCsv && selectedProjectId && (
        <PlanTaskWorkCsvDialog
          taskIdByCode={new Map(tasks.map((t) => [t.task_code, t.id]))}
          onClose={() => setShowCsv(false)}
          onImported={() => void load()}
        />
      )}

      {historyTaskId && (
        <PlanTaskWorkHistoryDialog
          taskId={historyTaskId}
          taskLabel={tasks.find((t) => t.id === historyTaskId)?.task_code ?? ""}
          onClose={() => setHistoryTaskId(null)}
        />
      )}

      {applyTaskId && selectedProjectId && (
        <PlanDurationApplyDialog
          projectId={selectedProjectId}
          taskId={applyTaskId}
          onClose={() => setApplyTaskId(null)}
          onApplied={() => void load()}
        />
      )}

      {pendingSave && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => { setPendingSave(null); setRevisionReason(""); }} />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-card p-4 shadow-2xl">
            <h2 className="text-sm font-bold text-foreground">A reason is required</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {pendingSave.filter((r) => r.quantity_reason === PENDING_REASON).length} of your changes replace an already-recorded quantity. Give one reason for the revision (applied to all of them).
            </p>
            <textarea autoFocus className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" rows={3}
              placeholder="e.g. Remeasured on site, drawing revision C…" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => { setPendingSave(null); setRevisionReason(""); }} disabled={saving} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Cancel</button>
              <button type="button" onClick={confirmRevisionReason} disabled={saving || !revisionReason.trim()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save with this reason
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
