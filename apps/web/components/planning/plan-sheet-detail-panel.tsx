"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ExternalLink, Loader2, Table2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { PRIORITY_OPTIONS, STATUS_LABELS, STATUS_OPTIONS, type SheetField, type SheetTask } from "./sheet-types";
import { WbsActivityStepsPanel } from "@/components/wbs/wbs-activity-steps-panel";

interface StaffProfile {
  id: string;
  full_name: string;
  role: string;
  department: string | null;
}

interface PlanSheetDetailPanelProps {
  task: SheetTask | null;
  wbsPath: string | null;
  onUpdateField: (taskId: string, field: SheetField, raw: string) => Promise<void>;
  onAssign: (taskId: string, profile: { id: string; full_name: string | null }) => Promise<void>;
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    open: "bg-slate-100 text-slate-700 border-slate-200",
    assigned: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-blue-50 text-blue-700 border-blue-200",
    paused: "bg-amber-50 text-amber-700 border-amber-200",
    blocked: "bg-red-50 text-red-700 border-red-200",
    review: "bg-purple-50 text-purple-700 border-purple-200",
    submitted: "bg-cyan-50 text-cyan-700 border-cyan-200",
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    closed: "bg-emerald-100 text-emerald-800 border-emerald-300",
    cancelled: "bg-gray-100 text-gray-500 border-gray-200",
    completed: "bg-gray-100 text-gray-600 border-gray-200",
    rejected: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return map[status] ?? "bg-slate-100 text-slate-700 border-slate-200";
}

function statusLabel(status: string) {
  return STATUS_LABELS[status] ?? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const fieldLabelCls = "text-[10px] font-semibold uppercase tracking-wider text-muted-foreground";
const selectCls =
  "mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary";

export function PlanSheetDetailPanel({ task, wbsPath, onUpdateField, onAssign }: PlanSheetDetailPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  // Non-null only while the slider/input is actively being dragged/typed —
  // otherwise the displayed value always tracks `task.progress` directly, so
  // there is no state to resync when the selected task changes (no effect
  // needed: the parent remounts this panel with key={task.id} per task).
  const [dragProgress, setDragProgress] = useState<number | null>(null);
  const [hasActivitySteps, setHasActivitySteps] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const loadingProfiles = showPicker && !profilesLoaded;

  useEffect(() => {
    if (!showPicker || profilesLoaded) return;
    supabase
      .from("profiles")
      .select("id, full_name, role, department")
      .order("full_name")
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else setProfiles((data ?? []) as StaffProfile[]);
        setProfilesLoaded(true);
      });
  }, [showPicker, profilesLoaded, supabase]);

  if (!task) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
        <Table2 className="h-8 w-8 opacity-30" />
        <p className="text-xs">Select a task in the grid to view its details.</p>
      </div>
    );
  }

  async function commitProgress(raw: number) {
    if (!task) return;
    const n = Math.max(0, Math.min(100, Math.round(raw) || 0));
    setDragProgress(null);
    if (n !== task.progress) await onUpdateField(task.id, "progress", String(n));
  }

  async function handlePick(p: StaffProfile) {
    if (!task) return;
    setAssigningId(p.id);
    try {
      await onAssign(task.id, p);
      setShowPicker(false);
    } finally {
      setAssigningId(null);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {wbsPath && <p className="truncate text-[10px] text-muted-foreground">{wbsPath}</p>}
            <h3 className="truncate text-sm font-semibold" title={task.task_name}>
              {task.task_name}
            </h3>
            <p className="font-mono text-[11px] text-muted-foreground">{task.task_code}</p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
              statusBadgeClass(task.status),
            )}
          >
            {statusLabel(task.status)}
          </span>
        </div>
        <Link
          href={`/dashboard/tasks/${task.id}`}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
        >
          Open full task detail <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="flex-1 space-y-4 p-4">
        {/* Assignment */}
        <div>
          <span className={fieldLabelCls}>Assigned to</span>
          <div className="mt-1 flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2.5 py-1.5">
            {task.owner_name ? (
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-600">
                  {task.owner_name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate font-medium">{task.owner_name}</span>
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Unassigned</span>
            )}
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              <UserPlus className="h-3 w-3" />
              {task.owner_name ? "Reassign" : "Assign"}
            </button>
          </div>

          {showPicker && (
            <div className="mt-1.5 rounded-lg border border-border bg-background p-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pick a team member
                </span>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              {loadingProfiles ? (
                <div className="flex justify-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              ) : (
                <div className="max-h-40 space-y-0.5 overflow-y-auto">
                  {profiles.length === 0 && (
                    <p className="px-1 py-2 text-center text-[10px] text-muted-foreground">No staff found</p>
                  )}
                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handlePick(p)}
                      disabled={assigningId !== null}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[9px] font-medium text-slate-600">
                        {p.full_name.charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="block truncate font-medium">{p.full_name}</span>
                        <span className="block text-[9px] text-muted-foreground">
                          {p.role}
                          {p.department ? ` · ${p.department}` : ""}
                        </span>
                      </span>
                      {assigningId === p.id && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status */}
        <label className="block">
          <span className={fieldLabelCls}>Status</span>
          <select
            className={selectCls}
            value={STATUS_OPTIONS.some((o) => o.value === task.status) ? task.status : ""}
            onChange={(e) => onUpdateField(task.id, "status", e.target.value)}
          >
            {!STATUS_OPTIONS.some((o) => o.value === task.status) && (
              <option value="" disabled>
                {statusLabel(task.status)} (workflow status)
              </option>
            )}
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* Progress */}
        <div>
          <span className={fieldLabelCls}>% Complete</span>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              disabled={hasActivitySteps}
              value={dragProgress ?? task.progress}
              onChange={(e) => setDragProgress(Number(e.target.value))}
              onMouseUp={(e) => commitProgress(Number((e.target as HTMLInputElement).value))}
              onTouchEnd={(e) => commitProgress(Number((e.target as HTMLInputElement).value))}
              className="h-1.5 flex-1 accent-primary disabled:opacity-50"
            />
            <input
              type="number"
              min={0}
              max={100}
              disabled={hasActivitySteps}
              value={dragProgress ?? task.progress}
              onChange={(e) => setDragProgress(Number(e.target.value))}
              onBlur={(e) => commitProgress(Number(e.target.value))}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="w-14 shrink-0 rounded-md border border-border bg-background px-1.5 py-1 text-right text-xs outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <span className="shrink-0 text-xs text-muted-foreground">%</span>
          </div>
          {hasActivitySteps && (
            <p className="mt-1 text-[10px] text-muted-foreground">Calculated automatically from Activity Steps below.</p>
          )}
        </div>

        {/* Activity Steps */}
        <WbsActivityStepsPanel
          taskId={task.id}
          taskStart={task.start_date}
          taskEnd={task.end_date}
          canEdit={true}
          onStepsChange={(hasSteps, computed) => {
            setHasActivitySteps(hasSteps);
            if (hasSteps && computed != null && computed !== task.progress) {
              void onUpdateField(task.id, "progress", String(computed));
            }
          }}
        />

        {/* Priority */}
        <label className="block">
          <span className={fieldLabelCls}>Priority</span>
          <select
            className={selectCls}
            value={task.priority}
            onChange={(e) => onUpdateField(task.id, "priority", e.target.value)}
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={fieldLabelCls}>Start</span>
            <p className="mt-1 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs">
              {task.start_date ?? "—"}
            </p>
          </div>
          <div>
            <span className={fieldLabelCls}>Finish</span>
            <p className="mt-1 rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs">
              {task.end_date ?? "—"}
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Edit dates and dependencies from the grid, or in Planning ▸ Gantt Chart.
        </p>
      </div>
    </div>
  );
}
