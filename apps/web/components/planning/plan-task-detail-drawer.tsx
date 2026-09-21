"use client";

import { X } from "lucide-react";
import { WbsActivityStepsPanel } from "@/components/wbs/wbs-activity-steps-panel";
import type { SheetTask } from "./sheet-types";

interface Props {
  task: SheetTask;
  formatDate: (iso: string | null | undefined) => string;
  onClose: () => void;
  onSyncProgress: (taskId: string, pct: number) => void;
}

/**
 * A focused slide-over for the Gantt Chart page — just enough context (name,
 * code, dates, current %) plus Activity Steps. Full field editing (dates,
 * links, resources) stays on Planning ▸ Sheet's docked detail panel; this
 * drawer deliberately doesn't duplicate that so there's only one write path
 * for those fields.
 */
export function PlanTaskDetailDrawer({ task, formatDate, onClose, onSyncProgress }: Props) {
  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-hidden border-l border-border bg-background shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border bg-slate-900 px-4 py-3 text-white">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-white/60">{task.task_code}</p>
            <h2 className="truncate text-sm font-bold leading-tight">{task.task_name}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 text-xs">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Start</span>
              <p className="mt-1">{formatDate(task.start_date)}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Finish</span>
              <p className="mt-1">{formatDate(task.end_date)}</p>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress</span>
              <p className="mt-1 font-semibold">{task.progress}%</p>
            </div>
          </div>
          <p className="mb-4 text-[10px] text-muted-foreground">
            Editing dates, predecessors, or resources? Use the Sheet grid on the left, or Planning ▸ Sheet.
          </p>

          <WbsActivityStepsPanel
            taskId={task.id}
            taskStart={task.start_date}
            taskEnd={task.end_date}
            canEdit={true}
            onStepsChange={(hasSteps, computed) => {
              if (hasSteps && computed != null && computed !== task.progress) {
                onSyncProgress(task.id, computed);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
