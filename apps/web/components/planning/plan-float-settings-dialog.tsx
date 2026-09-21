"use client";

import { useState } from "react";
import { Gauge, Loader2, X } from "lucide-react";
import type { FloatThresholds } from "@/lib/planning/schedule-engine";

interface Props {
  thresholds: FloatThresholds;
  onClose: () => void;
  onSave: (next: FloatThresholds) => Promise<void>;
}

export function PlanFloatSettingsDialog({ thresholds, onClose, onSave }: Props) {
  const [critical, setCritical] = useState(thresholds.critical);
  const [nearCritical, setNearCritical] = useState(thresholds.nearCritical);
  const [saving, setSaving] = useState(false);

  const invalid = nearCritical < critical;

  async function handleSave() {
    if (invalid) return;
    setSaving(true);
    await onSave({ critical, nearCritical });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[420px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <Gauge className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Float Settings</h2>
            <p className="text-[11px] text-white/70">Tune how &quot;critical&quot; and &quot;near-critical&quot; are defined for this project</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          <label className="block">
            <span className="font-semibold">Critical float threshold (days)</span>
            <input
              type="number"
              value={critical}
              onChange={(e) => setCritical(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              A task is critical (red) when its total float is at or below this number. Default 0.
            </span>
          </label>

          <label className="block">
            <span className="font-semibold">Near-critical float threshold (days)</span>
            <input
              type="number"
              value={nearCritical}
              onChange={(e) => setNearCritical(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none"
            />
            <span className="mt-1 block text-[11px] text-muted-foreground">
              Tasks with float above the critical cutoff but at or below this number show amber as an early warning.
            </span>
          </label>

          {invalid && (
            <p className="text-[11px] text-red-600">Near-critical threshold must be greater than or equal to the critical threshold.</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted/40 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || invalid}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
