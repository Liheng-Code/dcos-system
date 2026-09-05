"use client";

import { useMemo, useState } from "react";
import { CalendarRange, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { addCalendarDays, type WorkCalendar } from "@/lib/planning/work-calendar";
import { moveProject, resolveMoveDelta } from "@/lib/planning/project-schedule-service";

interface Props {
  projectId: string;
  /** Earliest current task start (ISO). */
  currentStart: string;
  calendar: WorkCalendar;
  /** Block the move when a locked backbone exists and the user isn't a manager. */
  blocked: boolean;
  onClose: () => void;
  onMoved: () => void;
}

export function PlanMoveProjectDialog({
  projectId,
  currentStart,
  calendar,
  blocked,
  onClose,
  onMoved,
}: Props) {
  const [mode, setMode] = useState<"date" | "days">("date");
  const [newStart, setNewStart] = useState(currentStart);
  const [days, setDays] = useState("0");
  const [shiftConstraints, setShiftConstraints] = useState(true);
  const [shiftBaseline, setShiftBaseline] = useState(false);
  const [busy, setBusy] = useState(false);

  const opts = useMemo(
    () => ({
      currentStart,
      newStart: mode === "date" ? newStart : undefined,
      shiftWorkingDays: mode === "days" ? Number(days) || 0 : undefined,
      shiftConstraints,
      shiftBaseline,
      calendar,
    }),
    [mode, newStart, days, currentStart, shiftConstraints, shiftBaseline, calendar],
  );

  const delta = resolveMoveDelta(opts);
  const preview =
    delta === 0
      ? "No change."
      : `Every task moves ${delta > 0 ? "+" : ""}${delta} day${
          Math.abs(delta) === 1 ? "" : "s"
        } · earliest start → ${addCalendarDays(currentStart, delta)}`;

  async function run() {
    setBusy(true);
    try {
      const res = await moveProject(projectId, opts);
      onMoved();
      onClose();
      if (res.moved > 0) toast.message(`Project moved · ${res.moved} tasks shifted`);
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
            <CalendarRange className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Move Project</h2>
            <p className="text-[11px] text-white/70">Shift the whole schedule to a new start date</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4 text-xs">
          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
            <span className="text-muted-foreground">Current project start:</span>{" "}
            <span className="font-mono font-semibold">{currentStart}</span>
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "date"} onChange={() => setMode("date")} />
              <span className="w-28 shrink-0">New start date</span>
              <input
                type="date"
                value={newStart}
                disabled={mode !== "date"}
                onChange={(e) => setNewStart(e.target.value)}
                className="flex-1 rounded border border-border bg-background px-2 py-1 disabled:opacity-40"
              />
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" checked={mode === "days"} onChange={() => setMode("days")} />
              <span className="w-28 shrink-0">Shift by</span>
              <input
                type="number"
                value={days}
                disabled={mode !== "days"}
                onChange={(e) => setDays(e.target.value)}
                className="w-20 rounded border border-border bg-background px-2 py-1 disabled:opacity-40"
              />
              <span className="text-muted-foreground">working days</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shiftConstraints}
                onChange={(e) => setShiftConstraints(e.target.checked)}
              />
              Also move constraint dates
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={shiftBaseline}
                onChange={(e) => setShiftBaseline(e.target.checked)}
              />
              Also move baseline dates
            </label>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-muted-foreground">
            {preview}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Weekend landings are re-snapped by the next Calculate.
          </p>
          {blocked && (
            <p className="text-[11px] font-medium text-amber-600">
              A locked WBS backbone exists — unlock it (or ask an admin / project manager) to move
              the project.
            </p>
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
            disabled={busy || blocked || delta === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Move
          </button>
        </div>
      </div>
    </div>
  );
}
