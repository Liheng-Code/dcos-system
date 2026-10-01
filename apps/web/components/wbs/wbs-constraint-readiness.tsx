"use client";

import { useEffect, useMemo, useState } from "react";
import { listTaskConstraintsByTaskIds, upsertTaskConstraint } from "@/lib/wbs/wbs-queries";
import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";

const CONSTRAINT_TYPES = ["drawings", "materials", "crew", "permits", "equipment", "predecessor"] as const;
type ConstraintType = (typeof CONSTRAINT_TYPES)[number];

const LABELS: Record<ConstraintType, string> = {
  drawings: "Drawings",
  materials: "Materials",
  crew: "Crew",
  permits: "Permits",
  equipment: "Equipment",
  predecessor: "Predecessor",
};

type ConstraintStatus = "ok" | "missing" | "pending" | "unknown";
const STATUS_CYCLE: ConstraintStatus[] = ["unknown", "ok", "pending", "missing"];
const STATUS_COLOR: Record<ConstraintStatus, string> = {
  ok: "bg-emerald-500",
  pending: "bg-amber-400",
  missing: "bg-red-500",
  unknown: "bg-slate-300",
};
const STATUS_LABEL: Record<ConstraintStatus, string> = {
  ok: "Ready",
  pending: "Pending",
  missing: "Missing",
  unknown: "Unknown",
};

interface ConstraintRow {
  task_id: string;
  constraint_type: ConstraintType;
  status: ConstraintStatus;
  source: string | null;
  notes: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Set manually",
  pr: "Purchase Requisition",
  pos: "Purchase Order",
  document: "Document Control",
  rfi: "RFI",
  inspection: "Inspection",
};

interface ReadinessTask {
  id: string;
  task_code: string;
  task_name: string;
}

interface Props {
  tasks: ReadinessTask[];
}

/**
 * Completion Plan 1.8 — look-ahead constraint readiness. Reads/writes
 * public.task_constraints directly (no dedicated service file exists for
 * this table yet); one dot per constraint type, click to cycle its status.
 */
export function WbsConstraintReadiness({ tasks }: Props) {
  const [rows, setRows] = useState<ConstraintRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blockersOnly, setBlockersOnly] = useState(false);

  const taskIdsKey = useMemo(() => [...new Set(tasks.map((t) => t.id))].sort().join(","), [tasks]);

  useEffect(() => {
    const ids = taskIdsKey ? taskIdsKey.split(",") : [];
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing rows when the task list becomes empty
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    listTaskConstraintsByTaskIds(ids)
      .then(({ data }) => {
        setRows((data ?? []) as ConstraintRow[]);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIdsKey]);

  const byTask = useMemo(() => {
    const map = new Map<string, Map<ConstraintType, ConstraintRow>>();
    for (const r of rows) {
      if (!map.has(r.task_id)) map.set(r.task_id, new Map());
      map.get(r.task_id)!.set(r.constraint_type, r);
    }
    return map;
  }, [rows]);

  function statusOf(taskId: string, type: ConstraintType): ConstraintStatus {
    return byTask.get(taskId)?.get(type)?.status ?? "unknown";
  }

  function tooltipOf(taskId: string, type: ConstraintType, status: ConstraintStatus): string {
    const row = byTask.get(taskId)?.get(type);
    const base = `${LABELS[type]}: ${STATUS_LABEL[status]}`;
    if (!row?.source || row.source === "manual") return `${base} — click to change`;
    const sourceLabel = SOURCE_LABEL[row.source] ?? row.source;
    return row.notes ? `${base} (auto — ${sourceLabel}: ${row.notes})` : `${base} (auto — ${sourceLabel})`;
  }

  function isReady(taskId: string): boolean {
    return CONSTRAINT_TYPES.every((ct) => statusOf(taskId, ct) === "ok");
  }

  async function cycleStatus(taskId: string, type: ConstraintType) {
    const current = statusOf(taskId, type);
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    setRows((prev) => {
      const exists = prev.some((r) => r.task_id === taskId && r.constraint_type === type);
      return exists
        ? prev.map((r) =>
            r.task_id === taskId && r.constraint_type === type ? { ...r, status: next, source: "manual" } : r,
          )
        : [...prev, { task_id: taskId, constraint_type: type, status: next, source: "manual", notes: null }];
    });
    // A manual click always claims the row — otherwise the next automatic
    // trigger (procurement/document/RFI/inspection feed) would silently
    // overwrite this override, since those feeds skip only source='manual'.
    await upsertTaskConstraint({ task_id: taskId, constraint_type: type, status: next, source: "manual", source_ref: null });
  }

  const visibleTasks = blockersOnly ? tasks.filter((t) => !isReady(t.id)) : tasks;
  const blockerCount = tasks.filter((t) => !isReady(t.id)).length;

  if (loading) return null;
  if (tasks.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Constraint Readiness</span>
          {blockerCount > 0 && (
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
              {blockerCount} not ready
            </span>
          )}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={blockersOnly} onChange={(e) => setBlockersOnly(e.target.checked)} />
          Show blockers only
        </label>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/30 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-1.5 text-left">Task</th>
              {CONSTRAINT_TYPES.map((ct) => (
                <th key={ct} className="w-16 px-1 py-1.5 text-center">{LABELS[ct]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleTasks.map((t) => (
              <tr key={t.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                <td className="px-3 py-1.5">
                  <span className="font-mono font-medium">{t.task_code}</span>
                  <span className="ml-1.5 text-muted-foreground">{t.task_name}</span>
                </td>
                {CONSTRAINT_TYPES.map((ct) => {
                  const status = statusOf(t.id, ct);
                  return (
                    <td key={ct} className="px-1 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => void cycleStatus(t.id, ct)}
                        title={tooltipOf(t.id, ct, status)}
                        className={cn("mx-auto h-3 w-3 rounded-full transition-transform hover:scale-125", STATUS_COLOR[status])}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {visibleTasks.length === 0 && (
              <tr>
                <td colSpan={CONSTRAINT_TYPES.length + 1} className="px-3 py-4 text-center text-muted-foreground">
                  {blockersOnly ? "Every task in this window is ready." : "No tasks in this window."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
