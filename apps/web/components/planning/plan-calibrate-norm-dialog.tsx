"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingDown, TrendingUp, X } from "lucide-react";
import { toast } from "sonner";
import { previewCalibratedNorm, proposeCalibratedNorm } from "@/lib/planning/productivity-log-service";
import { roundTo } from "@/lib/planning/work-engine";
import type { Norm } from "@/lib/planning/productivity-service";
import { cn } from "@/lib/utils";

const MIN_LOGS = 3;

interface Props {
  norm: Norm;
  projectId: string;
  onClose: () => void;
  onProposed: () => void;
}

/** Phase 5 part A — "propose calibrated norm": previews what a new draft norm's labour constant would be from
 * this project's logged actuals, then writes it as a DRAFT (never touches the approved norm itself). */
export function PlanCalibrateNormDialog({ norm, projectId, onClose, onProposed }: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ sampleCount: number; observedLc: number | null; fromDate: string | null; toDate: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    previewCalibratedNorm(norm.id, projectId)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [norm.id, projectId]);

  const canPropose = !!preview && preview.sampleCount >= MIN_LOGS && !!preview.observedLc;
  const delta = preview?.observedLc != null ? preview.observedLc - norm.labour_constant_hr_per_unit : null;

  async function run() {
    setBusy(true);
    try {
      await proposeCalibratedNorm(norm.id, projectId, MIN_LOGS);
      toast.success("Draft calibrated norm created — review and approve it in the Norm Library.");
      onProposed();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-muted px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Propose calibrated norm</h2>
            <p className="text-[11px] text-muted-foreground">{norm.code} — {norm.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3 p-4 text-sm">
          {loading ? (
            <div className="flex h-24 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : !preview || preview.sampleCount === 0 ? (
            <p className="text-xs text-muted-foreground">No site logs yet resolve a productivity index against this norm on this project. Log output on Site Records for a task using this norm first.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-xs">
                <div><p className="text-muted-foreground">Approved norm</p><p className="text-sm font-semibold tabular-nums">{roundTo(norm.labour_constant_hr_per_unit, 4)} hr/{norm.unit}</p></div>
                <div><p className="text-muted-foreground">Observed from logs</p><p className="text-sm font-semibold tabular-nums">{preview.observedLc !== null ? `${roundTo(preview.observedLc, 4)} hr/${norm.unit}` : "—"}</p></div>
                <div><p className="text-muted-foreground">Sample</p><p className="tabular-nums">{preview.sampleCount} log{preview.sampleCount === 1 ? "" : "s"}</p></div>
                <div><p className="text-muted-foreground">Period</p><p className="tabular-nums">{preview.fromDate} → {preview.toDate}</p></div>
              </div>
              {delta !== null && (
                <div className={cn("flex items-center gap-1.5 text-xs font-medium", delta < 0 ? "text-emerald-400" : delta > 0 ? "text-amber-400" : "text-muted-foreground")}>
                  {delta < 0 ? <TrendingDown className="h-3.5 w-3.5" /> : delta > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : null}
                  Site is running {Math.abs(roundTo((delta / norm.labour_constant_hr_per_unit) * 100, 1))}% {delta < 0 ? "faster" : delta === 0 ? "on norm" : "slower"} than the approved norm.
                </div>
              )}
              {!canPropose && (
                <p className="text-xs text-amber-400">Need at least {MIN_LOGS} usable logs to propose a calibration (have {preview.sampleCount}).</p>
              )}
              <p className="text-[11px] text-muted-foreground">
                This creates a new <strong>draft</strong> norm ({norm.code}-CAL-…) scoped to this project, with the crew copied from the approved norm — it never changes the approved norm itself, and needs its own approval before anything uses it.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">Cancel</button>
          <button type="button" disabled={!canPropose || busy} onClick={() => void run()} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Create draft
          </button>
        </div>
      </div>
    </div>
  );
}
