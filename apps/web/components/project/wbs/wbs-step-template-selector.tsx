"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { rebalanceWeights } from "@/lib/planning/activity-step-spread";
import { listTemplateItems, type DurationBasis, type StepPick } from "@/lib/planning/activity-steps-service";

interface DraftStep extends StepPick {
  key: string;
  checked: boolean;
  /** added here, not from the template: name, weight and time are editable */
  added: boolean;
}

const inputCls = "h-7 rounded-md border border-border bg-background px-1.5 text-[11px] outline-none focus:border-primary";

const toPick = (s: StepPick): StepPick => ({
  step_name: s.step_name, weight: s.weight, discipline: s.discipline, resource_crew: s.resource_crew,
  est_duration_days: s.est_duration_days, duration_basis: s.duration_basis, duration_share_pct: s.duration_share_pct,
  inspection_hold_point: s.inspection_hold_point, notes: s.notes,
});

/**
 * The chosen template's steps as a tick list, plus steps the planner adds, before they are put on the activity.
 * Weights of what is kept are rebalanced to 100%; scaled shares are normalised by the spread anyway.
 * Mount with key={templateId} so the list resets when the template changes.
 */
export function StepTemplateSelector({
  templateId,
  busy,
  assignLabel = "Assign",
  onAssign,
}: {
  templateId: string;
  busy: boolean;
  assignLabel?: string;
  onAssign: (picks: StepPick[]) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [drafts, setDrafts] = useState<DraftStep[] | null>(null);

  useEffect(() => {
    let live = true;
    listTemplateItems(supabase, templateId)
      .then((items) => {
        if (!live) return;
        setDrafts(items.map((it) => ({ ...toPick(it), key: it.id, checked: true, added: false })));
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : "Failed to load the template's steps");
        if (live) setDrafts([]);
      });
    return () => { live = false; };
  }, [supabase, templateId]);

  if (!drafts) {
    return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  }

  const picked = drafts.filter((d) => d.checked && d.step_name.trim());
  const pickedWeight = picked.reduce((s, d) => s + (Number(d.weight) || 0), 0);
  const allChecked = drafts.length > 0 && drafts.every((d) => d.checked);

  const patch = (key: string, p: Partial<DraftStep>) => setDrafts((list) => list!.map((d) => (d.key === key ? { ...d, ...p } : d)));

  function addStep() {
    setDrafts((list) => [
      ...list!,
      {
        key: `new-${Date.now()}`, checked: true, added: true,
        step_name: "", weight: 10, discipline: null, resource_crew: null,
        est_duration_days: 1, duration_basis: "scaled", duration_share_pct: 10,
        inspection_hold_point: false, notes: null,
      },
    ]);
  }

  function assign() {
    const weights = rebalanceWeights(picked.map((d) => Number(d.weight) || 0));
    onAssign(picked.map((d, i) => ({ ...toPick(d), step_name: d.step_name.trim(), weight: weights[i] })));
  }

  return (
    <div className="space-y-2 text-left">
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={() => setDrafts((list) => list!.map((d) => ({ ...d, checked: !allChecked })))}
            aria-label="Tick all steps"
          />
          <span className="flex-1">Step</span>
          <span className="w-14 text-right">Weight</span>
          <span className="w-24 text-right">Time</span>
          <span className="w-4" />
        </div>
        {drafts.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">This template has no steps. Add your own below.</p>
        )}
        <div className="max-h-64 overflow-y-auto">
          {drafts.map((d) => (
            <div key={d.key} className={cn("flex items-center gap-2 border-b border-border/60 px-2 py-1 text-[11px] last:border-b-0", !d.checked && "opacity-50")}>
              <input type="checkbox" checked={d.checked} onChange={() => patch(d.key, { checked: !d.checked })} aria-label={`Include ${d.step_name || "new step"}`} />
              {d.added ? (
                <input
                  autoFocus={!d.step_name}
                  value={d.step_name}
                  onChange={(e) => patch(d.key, { step_name: e.target.value })}
                  placeholder="Step name"
                  className={cn(inputCls, "min-w-0 flex-1")}
                />
              ) : (
                <span className="min-w-0 flex-1 truncate" title={d.step_name}>
                  {d.step_name}
                  {d.inspection_hold_point && <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] font-semibold text-amber-700">HOLD</span>}
                </span>
              )}
              {d.added ? (
                <input
                  type="number" min={0} step="any" value={d.weight}
                  onChange={(e) => patch(d.key, { weight: Number(e.target.value) })}
                  className={cn(inputCls, "w-14 text-right")}
                  aria-label="Weight"
                />
              ) : (
                <span className="w-14 text-right tabular-nums text-muted-foreground">{Number(d.weight)}%</span>
              )}
              {d.added ? (
                <span className="flex w-24 items-center justify-end gap-0.5">
                  <input
                    type="number" min={0} step="any"
                    value={(d.duration_basis === "fixed" ? d.est_duration_days : d.duration_share_pct) ?? 0}
                    onChange={(e) => patch(d.key, d.duration_basis === "fixed" ? { est_duration_days: Number(e.target.value) } : { duration_share_pct: Number(e.target.value) })}
                    className={cn(inputCls, "w-11 text-right")}
                    aria-label="Time"
                  />
                  <select
                    value={d.duration_basis}
                    onChange={(e) => patch(d.key, { duration_basis: e.target.value as DurationBasis })}
                    className={cn(inputCls, "w-12 px-0.5")}
                    aria-label="Time basis"
                  >
                    <option value="scaled">%</option>
                    <option value="fixed">d</option>
                  </select>
                </span>
              ) : (
                <span className="w-24 text-right tabular-nums text-muted-foreground">
                  {d.duration_basis === "fixed" ? `${d.est_duration_days ?? 0} d fixed` : `${d.duration_share_pct ?? 0}% of time`}
                </span>
              )}
              {d.added ? (
                <button type="button" onClick={() => setDrafts((list) => list!.filter((x) => x.key !== d.key))} className="w-4 text-muted-foreground hover:text-red-500" aria-label="Remove step">
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : <span className="w-4" />}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addStep} className="inline-flex items-center gap-1 rounded-md border border-dashed border-primary/50 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/5">
          <Plus className="h-3 w-3" /> Add step
        </button>
        <span className="flex-1 text-[10px] text-muted-foreground">
          {picked.length} of {drafts.length} steps
          {picked.length > 0 && Math.abs(pickedWeight - 100) > 0.01 && <> · weights {Math.round(pickedWeight * 100) / 100}% → rebalanced to 100%</>}
        </span>
      </div>

      <button
        type="button"
        disabled={busy || picked.length === 0}
        onClick={assign}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        {assignLabel} {picked.length} step{picked.length === 1 ? "" : "s"}
      </button>
    </div>
  );
}
