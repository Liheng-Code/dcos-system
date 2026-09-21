"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Loader2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import type { SheetTask } from "./sheet-types";
import { todayISO } from "./sheet-utils";

interface Props {
  currentDataDate: string | null;
  tasks: SheetTask[];
  onClose: () => void;
  onAdvance: (newDate: string, note?: string) => Promise<void>;
}

/**
 * Completion Plan F2 / 1.2 — the first UI in the app that writes
 * projects.data_date. Advancing also captures a progress snapshot and
 * reruns the schedule from the new date (handled by useSheetData's
 * advanceDataDate, which calls the advance_data_date RPC).
 */
export function PlanDataDateDialog({ currentDataDate, tasks, onClose, onAdvance }: Props) {
  const [newDate, setNewDate] = useState(currentDataDate ?? todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const pushedTasks = useMemo(() => {
    if (!newDate) return [];
    return tasks.filter(
      (t) => t.progress === 0 && t.start_date && t.start_date < newDate,
    );
  }, [tasks, newDate]);

  async function handleAdvance() {
    if (currentDataDate && newDate <= currentDataDate) {
      toast.error("The new data date must be after the current one");
      return;
    }
    setBusy(true);
    try {
      await onAdvance(newDate, note.trim() || undefined);
      toast.success(`Data date advanced to ${newDate}`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to advance the data date");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 bg-slate-900 px-4 py-3 text-white">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10">
            <CalendarClock className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold leading-tight">Advance Data Date</h2>
            <p className="text-[11px] text-white/70">
              Moves the schedule&apos;s as-of date forward and captures a progress snapshot
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">Current data date</label>
              <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-sm text-muted-foreground">
                {currentDataDate ?? "Not set"}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-muted-foreground">New data date</label>
              <input
                type="date"
                value={newDate}
                min={currentDataDate ?? undefined}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Week 12 update"
              className="w-full resize-none rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary"
            />
          </div>

          {pushedTasks.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium">
                  {pushedTasks.length} un-started task{pushedTasks.length === 1 ? "" : "s"} planned to start before {newDate}
                </p>
                <p className="mt-0.5 max-h-24 overflow-y-auto text-amber-700">
                  {pushedTasks.slice(0, 8).map((t) => t.task_code).join(", ")}
                  {pushedTasks.length > 8 ? `, +${pushedTasks.length - 8} more` : ""}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleAdvance()}
              disabled={busy || !newDate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Advance Data Date
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
