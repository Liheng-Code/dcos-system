"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getProjectStartDate,
  loadProjectCalendar,
  runProjectSchedule,
  workWeekLabel,
  type ProjectScheduleResult,
} from "@/lib/planning/project-schedule";
import { shortDate } from "./wbs-builder-types";

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Calculate every activity's Start / Finish from a project start date, using the
 * activities' durations, links and the project calendar.
 */
export function ScheduleWbsDialog({
  projectId,
  onClose,
  onScheduled,
}: {
  projectId: string;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const [start, setStart] = useState("");
  const [week, setWeek] = useState("");
  const [preview, setPreview] = useState<ProjectScheduleResult | null>(null);
  const [busy, setBusy] = useState<"preview" | "save" | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getProjectStartDate(projectId), loadProjectCalendar(projectId)]).then(([s, cal]) => {
      if (cancelled) return;
      setStart(s ?? today());
      setWeek(workWeekLabel(cal));
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // Preview whenever the start changes.
  useEffect(() => {
    if (!start) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the async preview below
    setBusy("preview");
    runProjectSchedule(projectId, start, { dryRun: true })
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch((e: unknown) => { if (!cancelled) toast.error(e instanceof Error ? e.message : "Could not calculate the schedule"); })
      .finally(() => { if (!cancelled) setBusy(null); });
    return () => { cancelled = true; };
  }, [projectId, start]);

  async function save() {
    setBusy("save");
    try {
      const r = await runProjectSchedule(projectId, start);
      if (!r.ok) {
        toast.error(`Circular links: ${r.cycle.join(" → ")}`);
        return;
      }
      toast.success(`Scheduled · finish ${shortDate(r.finish)} · ${r.workingDays} working days`);
      onScheduled();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the schedule");
    } finally {
      setBusy(null);
    }
  }

  const ok = preview?.ok ? preview : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" /> Schedule
          </DialogTitle>
          <DialogDescription>Start and finish dates are calculated from durations and links.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium">Project start</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-md border border-border bg-background px-2 py-1 text-xs"
            />
          </label>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Working week</span>
            <span>{week || "…"}</span>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
            {busy === "preview" || !preview ? (
              <span className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Calculating…</span>
            ) : !preview.ok ? (
              <span className="text-red-600">Circular links: {preview.cycle.join(" → ")}</span>
            ) : ok && ok.rows.length === 0 ? (
              <span className="text-muted-foreground">No activities to schedule.</span>
            ) : ok ? (
              <div className="grid grid-cols-2 gap-y-1">
                <span className="text-muted-foreground">Finish</span>
                <span className="text-right font-medium">{shortDate(ok.finish)}</span>
                <span className="text-muted-foreground">Programme</span>
                <span className="text-right font-medium">{ok.workingDays} working days</span>
                <span className="text-muted-foreground">Critical activities</span>
                <span className="text-right">{ok.criticalCount}</span>
                <span className="text-muted-foreground">Dates that change</span>
                <span className="text-right">{ok.changed} of {ok.rows.length}</span>
              </div>
            ) : null}
          </div>
          <p className="text-[11px] text-muted-foreground">Manually scheduled activities keep their dates.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy === "save"}>Cancel</Button>
          <Button onClick={save} disabled={!ok || ok.rows.length === 0 || busy !== null}>
            {busy === "save" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Apply dates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
