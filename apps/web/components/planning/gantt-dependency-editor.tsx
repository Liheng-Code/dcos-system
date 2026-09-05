"use client";

import { useState } from "react";
import { Link2, X, Trash2, Loader2, RotateCcw } from "lucide-react";
import type { GanttTask } from "./gantt-types";
import { cn } from "@/lib/utils";

interface GanttDependencyEditorProps {
  predecessor: GanttTask;
  successor: GanttTask;
  currentType: string; // fs | ss | ff | sf
  currentLag: number;
  saving?: boolean;
  onCancel: () => void;
  onSave: (type: string, lag: number) => void;
  onRemove: () => void;
}

const REL_TYPES: { value: string; label: string; desc: string }[] = [
  { value: "fs", label: "Finish-to-Start (FS)", desc: "Target starts after predecessor finishes (Default)" },
  { value: "ss", label: "Start-to-Start (SS)", desc: "Target starts when predecessor starts" },
  { value: "ff", label: "Finish-to-Finish (FF)", desc: "Target finishes when predecessor finishes" },
  { value: "sf", label: "Start-to-Finish (SF)", desc: "Target finishes when predecessor starts" },
];

const PRESETS = [-5, -2, -1, 0, 1, 2, 3, 5];

export function GanttDependencyEditor({
  predecessor,
  successor,
  currentType,
  currentLag,
  saving = false,
  onCancel,
  onSave,
  onRemove,
}: GanttDependencyEditorProps) {
  const [type, setType] = useState(() => (currentType || "fs").toLowerCase());
  const [lag, setLag] = useState(() => String(currentLag ?? 0));

  const lagNum = Number(lag);
  const lagValid = !Number.isNaN(lagNum);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />

      <div className="relative flex w-full max-w-[430px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Link2 className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Edit Task Dependency</h2>
            <p className="text-[11px] text-white/70">Configure relation type (FS, SS, FF, SF) and lag/lead time</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto p-4">
          {/* Predecessor / Target */}
          <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 font-medium text-muted-foreground">Predecessor:</span>
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-indigo-700">
                {predecessor.task_code}
              </span>
              <span className="truncate text-muted-foreground">{predecessor.task_name}</span>
            </div>
            <div className="pl-[4.5rem] text-indigo-500">→</div>
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 font-medium text-muted-foreground">Target Task:</span>
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700">
                {successor.task_code}
              </span>
              <span className="truncate text-muted-foreground">{successor.task_name}</span>
            </div>
          </div>

          {/* Relationship type */}
          <div>
            <div className="mb-2 text-xs font-semibold">Relationship Type</div>
            <div className="grid grid-cols-2 gap-2">
              {REL_TYPES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setType(r.value)}
                  className={cn(
                    "rounded-lg border p-2.5 text-left transition-colors",
                    type === r.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    {r.label}
                    {type === r.value && <span className="text-primary">✓</span>}
                  </div>
                  <div className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Lag / lead */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold">Lag / Lead Time (Days)</span>
              <span className="text-[10px] text-muted-foreground">Default is 0d</span>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={lag}
                  onChange={(e) => setLag(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                  Days
                </span>
              </div>
              <button
                type="button"
                onClick={() => setLag("0")}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 text-[11px] font-medium hover:bg-muted/40"
              >
                <RotateCcw className="h-3 w-3" /> Reset (0d)
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Quick presets:</span>
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setLag(String(p))}
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums transition-colors",
                    lagNum === p
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-border hover:bg-muted/40",
                  )}
                >
                  {p > 0 ? `+${p}d` : `${p}d`}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
              <span className="font-semibold">Tip:</span> Positive lag (+2d) delays target task start. Negative lag
              (-2d lead) overlaps execution ahead of schedule.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onRemove}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove Link
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => lagValid && onSave(type, Math.round(lagNum))}
              disabled={saving || !lagValid}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Save Relation
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
