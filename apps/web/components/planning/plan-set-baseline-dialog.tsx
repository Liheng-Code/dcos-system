"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import {
  clearBaseline,
  listBaselines,
  setBaseline,
  type BaselineRow,
} from "@/lib/planning/baseline-service";

interface Props {
  projectId: string;
  /** Task ids of the selected summary row's subtree (empty = no selection). */
  selectedTaskIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

const SLOTS = Array.from({ length: 11 }, (_, i) => i); // 0..10

export function PlanSetBaselineDialog({ projectId, selectedTaskIds, onClose, onSaved }: Props) {
  const [existing, setExisting] = useState<BaselineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"set" | "clear">("set");
  const [slot, setSlot] = useState(0);
  const [scope, setScope] = useState<"all" | "selected">("all");
  const [busy, setBusy] = useState(false);

  const hasSelection = selectedTaskIds.length > 0;

  useEffect(() => {
    listBaselines(projectId)
      .then(setExisting)
      .catch((e) => toast.error(String(e)))
      .finally(() => setLoading(false));
  }, [projectId]);

  const byNumber = useMemo(
    () => new Map(existing.map((b) => [b.baseline_number, b])),
    [existing],
  );

  async function run() {
    setBusy(true);
    try {
      const ids = scope === "selected" && hasSelection ? selectedTaskIds : null;
      if (mode === "set") await setBaseline(projectId, slot, ids);
      else await clearBaseline(projectId, slot, ids);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Flag className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Set Baseline</h2>
            <p className="text-[11px] text-white/70">Snapshot the current schedule (Baseline 0–10)</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "set"} onChange={() => setMode("set")} /> Set baseline
            </label>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={mode === "clear"} onChange={() => setMode("clear")} /> Clear baseline
            </label>
          </div>

          <label className="block">
            <span className="font-semibold">Baseline</span>
            <select
              value={slot}
              onChange={(e) => setSlot(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            >
              {SLOTS.map((n) => {
                const b = byNumber.get(n);
                return (
                  <option key={n} value={n}>
                    {n === 0 ? "Baseline" : `Baseline ${n}`}
                    {b ? ` — saved ${b.baseline_date} (${b.task_count} tasks)` : " — empty"}
                  </option>
                );
              })}
            </select>
          </label>

          <div>
            <div className="mb-1 font-semibold">Scope</div>
            <label className="flex items-center gap-1.5">
              <input type="radio" checked={scope === "all"} onChange={() => setScope("all")} /> Entire project
            </label>
            <label className="mt-1 flex items-center gap-1.5">
              <input
                type="radio"
                checked={scope === "selected"}
                disabled={!hasSelection}
                onChange={() => setScope("selected")}
              />
              Selected tasks{hasSelection ? ` (${selectedTaskIds.length})` : " — select a row first"}
            </label>
          </div>

          <label className="flex items-center gap-1.5 opacity-60">
            <input type="checkbox" checked disabled /> Roll up to summary tasks (automatic)
          </label>

          {loading && (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {mode === "set" ? "Set" : "Clear"}
          </button>
        </div>
      </div>
    </div>
  );
}
