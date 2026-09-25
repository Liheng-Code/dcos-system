"use client";

import { useState } from "react";
import { Loader2, Scale, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  applyLevellingRun,
  loadLevellingContext,
  runLevelling,
  saveLevellingRun,
  type LevellingContext,
} from "@/lib/planning/levelling-service";
import type { ResourceLevellingResult } from "@/lib/planning/resource-levelling";

/**
 * Completion Plan 3.2 — resource levelling preview/apply. Self-contained (own
 * data load) so it drops into the Resources page without depending on that
 * page's own state; only the priority-within-float rule the engine
 * implements today is offered.
 */
export function PlanLevellingPanel() {
  const { selectedProjectId } = useProject();
  const [running, setRunning] = useState(false);
  const [ctx, setCtx] = useState<LevellingContext | null>(null);
  const [result, setResult] = useState<ResourceLevellingResult | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function runPreview() {
    if (!selectedProjectId) return;
    setRunning(true);
    setResult(null);
    setSavedRunId(null);
    try {
      const context = await loadLevellingContext(selectedProjectId);
      if (context.levelTasks.length === 0) {
        toast.message("No resource-assigned tasks to level — assign resources to tasks first.");
        setCtx(null);
        return;
      }
      setCtx(context);
      const r = runLevelling(context);
      setResult(r);
      if (r.assignments.length === 0) {
        toast.success("No over-allocation found within the current float budgets.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function apply() {
    if (!selectedProjectId || !ctx || !result || result.assignments.length === 0) return;
    if (!window.confirm(`Apply ${result.assignments.length} start-date shift(s)? Each moved task gets a "start no earlier than" constraint at its new date.`)) return;
    setApplying(true);
    try {
      const runId = savedRunId ?? (await saveLevellingRun(selectedProjectId, result));
      setSavedRunId(runId);
      await applyLevellingRun(
        selectedProjectId,
        runId,
        result.assignments.map((a) => ({ taskId: a.taskId, oldStart: a.oldStart, newStart: a.newStart })),
      );
      toast.success("Levelling applied — open the Gantt or Sheet to see the recalculated schedule.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  const taskLabel = (id: string) => ctx?.taskNamesById[id] ?? id;
  const resourceLabel = (id: string) => ctx?.resourceNames[id] ?? id;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Resource Levelling</span>
            <span className="text-xs text-muted-foreground">— priority-within-float</span>
          </div>
          <Button size="sm" variant="outline" disabled={running} onClick={() => void runPreview()}>
            {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Run Preview
          </Button>
        </div>

        {!result && (
          <p className="text-xs text-muted-foreground">
            Runs the levelling engine against every resource-assigned task, pushing the lowest-priority sharer of an
            over-allocated day later within its float — never past its CPM late finish. Nothing changes until you Apply.
          </p>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {result.peaks.map((p) => (
                <span key={p.resourceId}>
                  {resourceLabel(p.resourceId)} peak: <strong>{p.before}</strong> → <strong>{p.after}</strong>
                </span>
              ))}
              <span className={cn("font-semibold", result.overAllocationResolved ? "text-emerald-600" : "text-amber-600")}>
                {result.overAllocationResolved ? "Fully resolved within float" : `${result.residual.length} residual conflict(s)`}
              </span>
            </div>

            {result.assignments.length > 0 && (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-1.5">Task</th>
                      <th className="px-2 py-1.5">Old Start</th>
                      <th className="px-2 py-1.5">New Start</th>
                      <th className="px-2 py-1.5 text-right">Shift (wd)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.assignments.map((a) => (
                      <tr key={a.taskId} className="border-b border-border/60 last:border-0">
                        <td className="px-2 py-1.5">{taskLabel(a.taskId)}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{a.oldStart}</td>
                        <td className="px-2 py-1.5 font-medium">{a.newStart}</td>
                        <td className="px-2 py-1.5 text-right">{a.shiftedWd}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {result.residual.length > 0 && (
              <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                  <TriangleAlert className="h-3.5 w-3.5" />
                  Residual conflicts ({result.stoppedAtLimit ? "pass limit reached" : "float exhausted"})
                </div>
                {result.residual.map((r, i) => (
                  <p key={i} className="text-[11px] text-amber-800">
                    {resourceLabel(r.resource)} on {r.date}: demand {r.demand} vs capacity {r.capacity} —{" "}
                    {r.committers.map((c) => c.task_code).join(", ")}
                  </p>
                ))}
              </div>
            )}

            {result.assignments.length > 0 && (
              <div className="flex justify-end">
                <Button size="sm" disabled={applying} onClick={() => void apply()}>
                  {applying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Apply {result.assignments.length} shift(s)
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
