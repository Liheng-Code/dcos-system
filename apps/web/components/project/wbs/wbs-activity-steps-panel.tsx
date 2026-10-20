"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ExternalLink, Gauge, Layers, ListChecks, Loader2, Plus, RefreshCcw, Search, ShieldAlert, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isLocked, needsRespread, spreadSteps } from "@/lib/planning/activity-step-spread";
import {
  applyStepSpread,
  assignStepsToTask,
  canManageStepTemplates,
  type StepPick,
  clearTaskSteps,
  loadStepSpreadContext,
  type StepSpreadContext,
  deleteTaskStep,
  listActivityStepTemplates,
  listTaskSteps,
  stepDateOutOfRange,
  totalWeight,
  upsertTaskStep,
  weightedProgress,
  type ActivityStepTemplate,
  type WbsTaskStep,
} from "@/lib/planning/activity-steps-service";
import { StepTemplateSelector } from "./wbs-step-template-selector";

/** Searchable dropdown for picking a template — a plain <select> becomes unusable once the
 * library grows past a screenful, so this filters by template name or group as you type. */
export function TemplatePicker({
  groups,
  totalCount,
  value,
  onChange,
  placeholder = "Select a template…",
  triggerClassName,
  disabled,
  showCreate,
}: {
  groups: [string, ActivityStepTemplate[]][];
  totalCount: number;
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  triggerClassName?: string;
  disabled?: boolean;
  /** Offer "Create step template": opens Activity Library › Step Templates in a new tab with a new template started. */
  showCreate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => {
    for (const [, list] of groups) {
      const found = list.find((t) => t.id === value);
      if (found) return found;
    }
    return null;
  }, [groups, value]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(([group, list]) => [
        group,
        list.filter((t) => t.template_name.toLowerCase().includes(q) || group.toLowerCase().includes(q)),
      ] as [string, ActivityStepTemplate[]])
      .filter(([, list]) => list.length > 0);
  }, [groups, query]);

  const matchCount = filteredGroups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setQuery("") }}>
      <PopoverTrigger
        disabled={disabled}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border bg-background px-2.5 text-left text-xs outline-none focus:border-primary disabled:opacity-60",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.template_name : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={4} className="w-[340px] max-w-[90vw] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search templates or groups…"
              className="w-full rounded-md border border-border bg-background py-1.5 pl-8 pr-2 text-xs outline-none focus:border-primary"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          {filteredGroups.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">No templates match &quot;{query}&quot;</p>
          ) : (
            filteredGroups.map(([group, list]) => (
              <div key={group} className="mb-1.5 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</div>
                {list.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onChange(t.id); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted",
                      t.id === value && "bg-primary/10 font-semibold text-primary",
                    )}
                  >
                    <span className="truncate">{t.template_name}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
        {query && (
          <div className="border-t border-border px-2.5 py-1.5 text-[10px] text-muted-foreground">
            {matchCount} of {totalCount} match
          </div>
        )}
        {showCreate && (
          <a
            href={`/dashboard/planning/activity-step-templates?new=${encodeURIComponent(query.trim())}`}
            target="_blank"
            rel="noopener"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-1.5 border-t border-border px-2.5 py-2 text-left text-xs font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="flex-1">{query.trim() && matchCount === 0 ? <>Create &quot;{query.trim()}&quot; in Step Templates</> : "Create step template"}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface Props {
  taskId: string;
  taskStart: string | null;
  taskEnd: string | null;
  canEdit: boolean;
  /** Fires whenever the step list changes so the parent can lock/sync its own manual Progress field. */
  onStepsChange?: (hasSteps: boolean, computedProgress: number | null) => void;
}

function nextStepNo(steps: { step_no: number }[]): number {
  return steps.length === 0 ? 1 : Math.max(...steps.map((s) => s.step_no)) + 1;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rounds a (possibly fractional) estimated duration to a whole calendar-day span for date math, minimum 1 day. */
function daySpan(days: number | null | undefined): number | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null;
  return Math.max(1, Math.round(days));
}

interface DateUpdate {
  id: string;
  start_date: string;
  end_date: string | null;
}

/**
 * Walks forward from `fromIndex` chaining each step's Finish = Start + its own
 * est_duration_days, and the next step's Start = previous Finish + 1 day —
 * i.e. back-to-back Finish-to-Start scheduling driven by the template's
 * estimated durations. Stops cascading past any step with no known duration
 * and no existing finish date, since there is nothing to chain from there.
 */
function computeForwardDates(list: WbsTaskStep[], fromIndex: number, seedStart: string): DateUpdate[] {
  const updates: DateUpdate[] = [];
  let cursor = seedStart;
  for (let i = fromIndex; i < list.length; i++) {
    const cur = list[i];
    const span = daySpan(cur.est_duration_days);
    const finish = span != null ? addDaysIso(cursor, span - 1) : (i === fromIndex ? cur.end_date : null);
    updates.push({ id: cur.id, start_date: cursor, end_date: finish });
    if (!finish) break;
    cursor = addDaysIso(finish, 1);
  }
  return updates;
}

export function WbsActivityStepsPanel({ taskId, taskStart, taskEnd, canEdit, onStepsChange }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [steps, setSteps] = useState<WbsTaskStep[]>([]);
  const [templates, setTemplates] = useState<ActivityStepTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [pickerTemplateId, setPickerTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [ctx, setCtx] = useState<StepSpreadContext | null>(null);
  const [canManage, setCanManage] = useState(false);

  async function reload(): Promise<WbsTaskStep[]> {
    setLoading(true);
    try {
      const rows = await listTaskSteps(supabase, taskId);
      setSteps(rows);
      return rows;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load activity steps");
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function loadContext(): Promise<StepSpreadContext | null> {
    try {
      const c = await loadStepSpreadContext(supabase, taskId);
      setCtx(c);
      return c;
    } catch {
      setCtx(null);
      return null;
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload() flips its own loading flag
    void reload();
    listActivityStepTemplates(supabase).then(setTemplates).catch(() => {});
    canManageStepTemplates(supabase).then(setCanManage).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // A template created in Step Templates (opened in another tab) shows up when the planner comes back.
  useEffect(() => {
    const refresh = () => { listActivityStepTemplates(supabase).then(setTemplates).catch(() => {}); };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [supabase]);

  // The activity's dates can change in the surrounding drawer: re-read what the steps spread over.
  useEffect(() => {
    loadStepSpreadContext(supabase, taskId).then(setCtx).catch(() => setCtx(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, taskStart, taskEnd]);

  /** Shares the activity's duration out over the not-started steps and saves their days and dates. */
  async function respread(list: WbsTaskStep[], c: StepSpreadContext | null = ctx, announce = true) {
    if (!c || list.length === 0) return;
    const r = spreadSteps(list, c.duration.days, c.start, c.cal);
    setSteps((prev) => prev.map((p) => {
      const u = r.updates.find((x) => x.id === p.id);
      return u ? { ...p, ...u } : p;
    }));
    try {
      await applyStepSpread(supabase, r.updates);
      for (const w of r.warnings) toast.warning(w);
      if (announce) toast.success(`Spread ${c.duration.days} ${c.unit} over ${r.updates.length} step${r.updates.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to spread step durations");
      await reload();
    }
  }

  /** Changing a step's basis, share or fixed days moves time between steps, so the whole list is re-spread. */
  async function saveTimeChange(step: WbsTaskStep, patch: Partial<WbsTaskStep>) {
    const next = { ...step, ...patch };
    const list = steps.map((s) => (s.id === step.id ? next : s));
    setSteps(list);
    try {
      await upsertTaskStep(supabase, taskId, next);
      await respread(list, ctx, false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save step");
      await reload();
    }
  }

  const durationChanged = ctx != null && steps.length > 0 && needsRespread(steps, ctx.duration.days);
  // e.g. steps attached by Generate before the schedule gave the activity its dates
  const missingDates = ctx?.start != null && steps.some((s) => !isLocked(s) && !s.start_date);
  const stale = durationChanged || missingDates;

  useEffect(() => {
    onStepsChange?.(steps.length > 0, steps.length > 0 ? weightedProgress(steps) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  const groups = useMemo(() => {
    const map = new Map<string, ActivityStepTemplate[]>();
    for (const t of templates) {
      if (!t.is_active) continue;
      const list = map.get(t.group_name) ?? [];
      list.push(t);
      map.set(t.group_name, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [templates]);

  const weightTotal = totalWeight(steps);
  const computedProgress = weightedProgress(steps);

  async function handleAssign(picks: StepPick[]) {
    if (!pickerTemplateId) return;
    if (steps.length > 0 && !confirm("This replaces the current step list with the selected steps. Continue?")) return;
    setBusy(true);
    try {
      await assignStepsToTask(supabase, taskId, pickerTemplateId, picks);
      toast.success(`${picks.length} step${picks.length === 1 ? "" : "s"} assigned`);
      setAssignOpen(false);
      setPickerTemplateId("");
      const [rows, c] = await Promise.all([reload(), loadContext()]);
      await respread(rows, c, false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to assign template");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    if (!confirm("Remove all steps from this activity? Progress reverts to manual entry.")) return;
    setBusy(true);
    try {
      await clearTaskSteps(supabase, taskId);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to clear steps");
    } finally {
      setBusy(false);
    }
  }

  function checkDateWarning(step: WbsTaskStep) {
    if (stepDateOutOfRange(step, taskStart, taskEnd)) {
      toast.warning(
        `"${step.step_name}" falls outside the activity's own ${taskStart ?? "?"} – ${taskEnd ?? "?"} window — saved anyway, but double-check it.`,
      );
    }
  }

  async function saveStep(step: WbsTaskStep, patch: Partial<WbsTaskStep>) {
    const next = { ...step, ...patch };
    setSteps((prev) => prev.map((s) => (s.id === step.id ? next : s)));
    try {
      await upsertTaskStep(supabase, taskId, next);
      if ("start_date" in patch || "end_date" in patch) checkDateWarning(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save step");
      await reload();
    }
  }

  /** Applies a batch of start/finish updates (a forward cascade), optimistically then persisted one by one. */
  async function persistDateCascade(baseList: WbsTaskStep[], updates: DateUpdate[]) {
    setSteps((prev) => prev.map((p) => {
      const u = updates.find((x) => x.id === p.id);
      return u ? { ...p, start_date: u.start_date, end_date: u.end_date } : p;
    }));
    const outOfRange: string[] = [];
    try {
      for (const u of updates) {
        const original = baseList.find((s) => s.id === u.id);
        if (!original) continue;
        const next = { ...original, start_date: u.start_date, end_date: u.end_date };
        await upsertTaskStep(supabase, taskId, next);
        if (stepDateOutOfRange(next, taskStart, taskEnd)) outOfRange.push(next.step_name);
      }
      if (outOfRange.length === 1) {
        toast.warning(`"${outOfRange[0]}" now falls outside the activity's own ${taskStart ?? "?"} – ${taskEnd ?? "?"} window — saved anyway, but double-check it.`);
      } else if (outOfRange.length > 1) {
        toast.warning(`${outOfRange.length} steps now fall outside the activity's own ${taskStart ?? "?"} – ${taskEnd ?? "?"} window — saved anyway, but double-check the schedule.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save step dates");
      await reload();
    }
  }

  /** Entering a step's Start date auto-computes its own Finish from its estimated duration, then
   * chains Finish-to-Start into every following step so the whole sequence re-schedules at once. */
  async function handleStartDateChange(step: WbsTaskStep, newStart: string | null) {
    if (!newStart) {
      await saveStep(step, { start_date: null });
      return;
    }
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx === -1) return;
    await persistDateCascade(steps, computeForwardDates(steps, idx, newStart));
  }

  /** Manually overriding a Finish date only re-chains steps after it — the edited step's own Start is left alone. */
  async function handleFinishDateChange(step: WbsTaskStep, newFinish: string | null) {
    if (!newFinish) {
      await saveStep(step, { end_date: null });
      return;
    }
    const idx = steps.findIndex((s) => s.id === step.id);
    if (idx === -1) return;
    const updates: DateUpdate[] = [{ id: step.id, start_date: step.start_date ?? newFinish, end_date: newFinish }];
    updates.push(...computeForwardDates(steps, idx + 1, addDaysIso(newFinish, 1)));
    await persistDateCascade(steps, updates);
  }

  async function addManualStep() {
    setBusy(true);
    try {
      await upsertTaskStep(supabase, taskId, { step_no: nextStepNo(steps), step_name: "New step", weight: 0, progress: 0 });
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add step");
    } finally {
      setBusy(false);
    }
  }

  async function removeStep(step: WbsTaskStep) {
    setSteps((prev) => prev.filter((s) => s.id !== step.id));
    try {
      await deleteTaskStep(supabase, step.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove step");
      await reload();
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border-2 border-primary/15 bg-white py-6 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border-2 border-primary/15 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-foreground">
          <Layers className="h-3.5 w-3.5 text-primary" /> Activity Steps
        </span>
        {canEdit && steps.length > 0 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setAssignOpen((o) => !o)}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted"
            >
              <RefreshCcw className="h-3 w-3" /> Change template
            </button>
            <button
              type="button"
              onClick={() => void handleClearAll()}
              className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-red-500 hover:bg-red-50"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      {assignOpen && steps.length > 0 && (
        <div className="space-y-2 rounded-lg border-2 border-primary/30 bg-primary/5 p-2">
          <TemplatePicker
            groups={groups}
            totalCount={templates.length}
            value={pickerTemplateId}
            onChange={setPickerTemplateId}
            showCreate={canManage}
          />
          {pickerTemplateId && (
            <StepTemplateSelector key={pickerTemplateId} templateId={pickerTemplateId} busy={busy} assignLabel="Replace with" onAssign={(p) => void handleAssign(p)} />
          )}
        </div>
      )}

      {steps.length > 0 && ctx && (
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md bg-muted/40 px-2 py-1 text-[10px] text-muted-foreground">
            <Gauge className="h-3 w-3 shrink-0" />
            <span>
              Activity <span className="font-semibold text-foreground">{ctx.duration.days} {ctx.unit}</span>
              {ctx.duration.source === "quantity" ? (
                <>
                  {" "}from quantity {ctx.duration.quantity ?? "?"} {ctx.duration.unit ?? ""}
                  {ctx.duration.normCode ? ` (norm ${ctx.duration.normCode})` : ""}
                </>
              ) : (
                <> from the schedule. Add a quantity and norm in Task Work to drive it from quantity.</>
              )}
            </span>
            {ctx.duration.source === "quantity" && ctx.duration.scheduledDays !== ctx.duration.days && (
              <span className="text-amber-600">
                The schedule still has {ctx.duration.scheduledDays} {ctx.unit}; apply the duration in Task Work to move the activity.
              </span>
            )}
          </div>
          {stale && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
              <span>
                {durationChanged
                  ? "The activity's duration changed since the steps were spread."
                  : "The activity now has dates; the steps don't yet."}
              </span>
              {canEdit && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void respread(steps)}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-300 bg-white px-1.5 py-0.5 font-semibold hover:bg-amber-100 disabled:opacity-50"
                >
                  <RefreshCcw className="h-3 w-3" /> Re-spread
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {steps.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-primary/40 bg-primary/5 px-4 py-5 text-center">
          <ListChecks className="mx-auto mb-2 h-6 w-6 text-primary" />
          <p className="mb-1 text-xs font-semibold text-foreground">No Activity Steps yet</p>
          <p className="mb-3 text-[11px] text-muted-foreground">
            Assign a template to break this activity into weighted steps — % Complete then rolls up automatically.
          </p>
          {canEdit && (
            <div className="mx-auto flex max-w-md flex-col items-stretch gap-2">
              <TemplatePicker
                groups={groups}
                totalCount={templates.length}
                value={pickerTemplateId}
                onChange={setPickerTemplateId}
                showCreate={canManage}
              />
              {pickerTemplateId ? (
                <StepTemplateSelector key={pickerTemplateId} templateId={pickerTemplateId} busy={busy} onAssign={(p) => void handleAssign(p)} />
              ) : (
                <p className="text-[10px] text-muted-foreground">Pick a template to see its steps; untick what this activity doesn&apos;t need or add your own.</p>
              )}
              {groups.length === 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {canManage ? "No templates yet: open the list and use Create step template (opens Step Templates)." : "No templates yet. Ask a library manager to add one under Activity Library › Step Templates."}
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-6 px-1.5 py-1 text-left">#</th>
                <th className="px-1.5 py-1 text-left">Step</th>
                <th className="w-14 px-1.5 py-1 text-left">Weight</th>
                <th className="w-14 px-1.5 py-1 text-left">%</th>
                <th className="w-20 px-1.5 py-1 text-left" title="F = fixed days. S = share (%) of the activity's time after fixed steps; the days below it follow the activity's duration.">Time</th>
                <th className="w-24 px-1.5 py-1 text-left">Start</th>
                <th className="w-24 px-1.5 py-1 text-left">Finish</th>
                <th className="w-6"></th>
              </tr>
            </thead>
            <tbody>
              {steps.map((s) => {
                const outOfRange = stepDateOutOfRange(s, taskStart, taskEnd);
                return (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-1.5 py-1 text-muted-foreground">{s.step_no}</td>
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        <input
                          value={s.step_name}
                          disabled={!canEdit}
                          onChange={(e) => setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, step_name: e.target.value } : p)))}
                          onBlur={() => void saveStep(s, { step_name: s.step_name })}
                          className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 outline-none focus:border-border disabled:opacity-60"
                        />
                        {s.inspection_hold_point && (
                          <Tooltip>
                            <TooltipTrigger
                              render={<ShieldAlert className="h-3 w-3 shrink-0 text-amber-500" aria-label="Inspection hold point" />}
                            />
                            <TooltipContent>QA/QC inspection hold point — work should not proceed past this step without sign-off.</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                      {(s.discipline || s.resource_crew) && (
                        <div className="truncate px-1 text-[9px] text-muted-foreground/80">
                          {[s.discipline, s.resource_crew].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        min={0}
                        disabled={!canEdit}
                        value={s.weight}
                        onChange={(e) => setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, weight: Number(e.target.value) || 0 } : p)))}
                        onBlur={() => void saveStep(s, { weight: s.weight })}
                        className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-border disabled:opacity-60"
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        disabled={!canEdit}
                        value={s.progress}
                        onChange={(e) => setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, progress: Math.min(100, Math.max(0, Number(e.target.value) || 0)) } : p)))}
                        onBlur={() => void saveStep(s, { progress: s.progress })}
                        className="w-12 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-border disabled:opacity-60"
                      />
                    </td>
                    <td className="px-1.5 py-1">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => {
                            const toFixed = s.duration_basis !== "fixed";
                            void saveTimeChange(s, toFixed
                              ? { duration_basis: "fixed", duration_share_pct: null }
                              : { duration_basis: "scaled", duration_share_pct: s.duration_share_pct ?? 0 });
                          }}
                          title={s.duration_basis === "fixed"
                            ? "Fixed: same days on every activity. Click to make it scale with quantity."
                            : "Scaled: share of the activity's time after fixed steps. Click to make it fixed."}
                          className={cn(
                            "w-4 shrink-0 rounded text-[9px] font-bold disabled:opacity-60",
                            s.duration_basis === "fixed" ? "bg-slate-200 text-slate-700" : "bg-primary/15 text-primary",
                          )}
                        >
                          {s.duration_basis === "fixed" ? "F" : "S"}
                        </button>
                        {s.duration_basis === "fixed" ? (
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            disabled={!canEdit}
                            value={s.est_duration_days ?? ""}
                            onChange={(e) => setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, est_duration_days: e.target.value === "" ? null : Number(e.target.value) } : p)))}
                            onBlur={() => { const cur = steps.find((x) => x.id === s.id); if (cur) void saveTimeChange(cur, {}); }}
                            title="Fixed days — the other steps are re-spread when you change this"
                            className="w-10 rounded border border-transparent bg-transparent px-1 py-0.5 text-right outline-none focus:border-border disabled:opacity-60"
                          />
                        ) : (
                          <div className="flex flex-col leading-tight">
                            <span className="flex items-center">
                              <input
                                type="number"
                                min={0}
                                disabled={!canEdit}
                                value={s.duration_share_pct ?? ""}
                                onChange={(e) => setSteps((prev) => prev.map((p) => (p.id === s.id ? { ...p, duration_share_pct: e.target.value === "" ? null : Number(e.target.value) } : p)))}
                                onBlur={() => { const cur = steps.find((x) => x.id === s.id); if (cur) void saveTimeChange(cur, {}); }}
                                title="Share of the activity's time after fixed steps"
                                className="w-9 rounded border border-transparent bg-transparent px-0.5 py-0.5 text-right outline-none focus:border-border disabled:opacity-60"
                              />
                              <span className="text-[9px] text-muted-foreground">%</span>
                            </span>
                            <span className="px-0.5 text-[9px] text-muted-foreground">{s.est_duration_days ?? "–"} d</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={cn("px-1.5 py-1", outOfRange && "bg-amber-50")}>
                      <input
                        type="date"
                        disabled={!canEdit}
                        value={s.start_date ?? ""}
                        onChange={(e) => void handleStartDateChange(s, e.target.value || null)}
                        title="Setting this auto-fills Finish from the step's duration and re-schedules every following step"
                        className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 outline-none focus:border-border disabled:opacity-60"
                      />
                    </td>
                    <td className={cn("px-1.5 py-1", outOfRange && "bg-amber-50")}>
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          disabled={!canEdit}
                          value={s.end_date ?? ""}
                          onChange={(e) => void handleFinishDateChange(s, e.target.value || null)}
                          className="w-full rounded border border-transparent bg-transparent px-0.5 py-0.5 outline-none focus:border-border disabled:opacity-60"
                        />
                        {outOfRange && (
                          <Tooltip>
                            <TooltipTrigger
                              render={<AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" aria-label="Outside the activity's own date range" />}
                            />
                            <TooltipContent>
                              This step&apos;s dates fall outside the activity&apos;s own {taskStart ?? "?"} – {taskEnd ?? "?"} window. Saved anyway — double-check it&apos;s intentional.
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </td>
                    <td className="px-1 py-1 text-center">
                      {canEdit && (
                        <button type="button" onClick={() => void removeStep(s)} className="text-muted-foreground hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {canEdit && (
            <button
              type="button"
              onClick={() => void addManualStep()}
              className="flex w-full items-center gap-1.5 border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-muted/40"
            >
              <Plus className="h-3 w-3" /> Add step
            </button>
          )}

          <div className={cn(
            "flex items-center justify-between gap-2 border-t border-border px-2 py-1.5 text-[10px]",
            Math.round(weightTotal) === 100 ? "text-muted-foreground" : "text-amber-600",
          )}>
            <span className="inline-flex items-center gap-1"><Layers className="h-3 w-3" /> Weight total: {weightTotal}{Math.round(weightTotal) === 100 ? "" : " (should be 100)"}</span>
            <span className="font-semibold text-foreground">Computed progress: {computedProgress}%</span>
          </div>
          {canEdit && (
            <p className="border-t border-border px-2 py-1.5 text-[10px] text-muted-foreground">
              Step days follow the activity&apos;s duration: F steps keep their days, S steps share the rest by %. Editing a Start or Finish date re-chains the steps after it.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
