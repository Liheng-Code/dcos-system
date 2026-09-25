"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { applyDurationChange, previewDurationApply, type DurationApplyResult } from "@/lib/planning/duration-apply-service";

interface Props {
  projectId: string;
  taskId: string;
  onClose: () => void;
  onApplied: () => void;
}

export function PlanDurationApplyDialog({ projectId, taskId, onClose, onApplied }: Props) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<DurationApplyResult | null>(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    previewDurationApply(projectId, taskId)
      .then((r) => { if (!cancelled) setResult(r); })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId, taskId]);

  async function apply() {
    setApplying(true);
    try {
      const outcome = await applyDurationChange(projectId, taskId);
      if (!outcome.applied) {
        toast.error(outcome.reason ?? "Nothing to apply.");
        return;
      }
      toast.success(
        `Duration applied` + (outcome.rippledCount > 0 ? ` — ${outcome.rippledCount} task${outcome.rippledCount === 1 ? "" : "s"} rescheduled` : "")
        + (outcome.skippedLockedCount > 0 ? ` (${outcome.skippedLockedCount} locked task${outcome.skippedLockedCount === 1 ? "" : "s"} left untouched)` : ""),
      );
      onApplied();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-muted px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-foreground">Apply crew-derived duration</h2>
            <p className="text-[11px] text-muted-foreground">Preview only, until you click Apply. The CPM engine re-runs over the whole project; every successor that would move is listed below.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-background"><X className="h-4 w-4" /></button>
        </div>

        <div className="overflow-y-auto p-4 text-xs">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Computing the reschedule…</div>
          ) : !result ? null : !result.ok ? (
            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {result.reason}
            </p>
          ) : result.noChange ? (
            <p className="flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {result.target.task_code} already finishes on the crew-derived duration — nothing to apply.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-border p-3">
                <p className="font-semibold text-foreground">{result.target.task_code} — {result.target.task_name}</p>
                <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                  {result.target.oldDurationWd ?? "—"} working days, finishing {result.target.oldEnd}
                  <ArrowRight className="h-3 w-3" />
                  <strong className="text-foreground">{result.target.newDurationWd} working days, finishing {result.target.newEnd}</strong>
                </p>
              </div>

              {result.rippled.length > 0 ? (
                <div>
                  <p className="mb-1.5 font-medium text-foreground">{result.rippled.length} successor{result.rippled.length === 1 ? "" : "s"} would also move</p>
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                    {result.rippled.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5 last:border-0">
                        <span className="min-w-0 truncate"><span className="font-medium text-foreground">{r.task_code}</span> <span className="text-muted-foreground">{r.task_name}</span></span>
                        <span className="shrink-0 text-muted-foreground">{r.oldStart} → {r.newStart}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No successor tasks are affected.</p>
              )}

              {result.skippedLocked.length > 0 && (
                <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {result.skippedLocked.length} successor{result.skippedLocked.length === 1 ? "" : "s"} under a locked WBS node will be left untouched: {result.skippedLocked.map((r) => r.task_code).join(", ")}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <button type="button" onClick={onClose} disabled={applying} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Cancel</button>
          {result?.ok && !result.noChange && (
            <button type="button" onClick={apply} disabled={applying}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Apply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
