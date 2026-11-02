"use client";

// Task drawer > Progress (doc 35 Phase P): the activity's progress method, its installed quantity
// against scope, a form to record quantity, and the approved progress history.

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { todayISO } from "@/lib/planning/work-calendar";
import {
  PROGRESS_METHOD_LABEL,
  getTaskQuantityStatus,
  getTaskStoredProgressMethod,
  listProgressHistory,
  listQuantityEntries,
  recordTaskQuantity,
  setTaskProgressMethod,
  type ProgressHistoryRow,
  type ProgressMethod,
  type QuantityEntry,
  type TaskQuantityStatus,
} from "@/lib/planning/progress-quantity-service";

const fmt = (n: number | null | undefined) =>
  n == null ? "-" : new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);

export function PlanTaskQuantityPanel({
  taskId,
  onMethodChange,
  onChanged,
}: {
  taskId: string;
  /** Tells the drawer which method is in force (quantity locks the typed % input). */
  onMethodChange?: (method: ProgressMethod) => void;
  /** Progress may have changed (an entry recorded directly). */
  onChanged?: () => void;
}) {
  const [status, setStatus] = useState<TaskQuantityStatus | null>(null);
  const [stored, setStored] = useState<ProgressMethod | null>(null);
  const [entries, setEntries] = useState<QuantityEntry[]>([]);
  const [history, setHistory] = useState<ProgressHistoryRow[]>([]);
  const [qty, setQty] = useState("");
  const [asOf, setAsOf] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [s, m, e, h] = await Promise.all([
      getTaskQuantityStatus(taskId),
      getTaskStoredProgressMethod(taskId),
      listQuantityEntries(taskId),
      listProgressHistory(taskId),
    ]);
    setStatus(s);
    setStored(m);
    setEntries(e);
    setHistory(h);
    if (s) onMethodChange?.(s.method);
  }, [taskId, onMethodChange]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading this activity's progress data
    reload()
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [reload]);

  async function changeMethod(value: string) {
    setBusy(true);
    try {
      await setTaskProgressMethod(taskId, value === "" ? null : (value as ProgressMethod));
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    const n = Number(qty);
    if (!Number.isFinite(n) || n === 0) {
      toast.error("Enter a quantity (negative to correct)");
      return;
    }
    setBusy(true);
    try {
      const mode = await recordTaskQuantity(taskId, n, asOf, note.trim() || undefined);
      toast.success(mode === "pending" ? "Quantity sent to a planner for approval" : "Quantity recorded");
      setQty("");
      setNote("");
      await reload();
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>;
  if (!status) return null;

  const hasScope = (status.scope ?? 0) > 0;
  const unit = status.unit ? ` ${status.unit}` : "";
  const installedPct = hasScope ? Math.min(100, (status.installed / status.scope!) * 100) : 0;
  const pendingPct = hasScope ? Math.min(100 - installedPct, (status.pending / status.scope!) * 100) : 0;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3 text-xs">
      <label className="block">
        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Progress method</span>
        <select
          value={stored ?? ""}
          onChange={(e) => void changeMethod(e.target.value)}
          disabled={busy}
          className="w-full rounded-md border border-border bg-background px-2 py-1.5"
        >
          <option value="">Project default ({PROGRESS_METHOD_LABEL[status.method].toLowerCase()} now)</option>
          {(Object.keys(PROGRESS_METHOD_LABEL) as ProgressMethod[]).map((m) => (
            <option key={m} value={m}>{PROGRESS_METHOD_LABEL[m]}</option>
          ))}
        </select>
      </label>

      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Installed quantity</span>
          {hasScope && <span className="tabular-nums">{fmt(status.percent)}% of scope</span>}
        </div>
        {hasScope ? (
          <>
            <div className="grid grid-cols-4 gap-2 tabular-nums">
              <div><p className="text-muted-foreground">Scope</p><p className="font-semibold">{fmt(status.scope)}{unit}</p></div>
              <div><p className="text-muted-foreground">Installed</p><p className="font-semibold">{fmt(status.installed)}{unit}</p></div>
              <div><p className="text-muted-foreground">Pending</p><p className="font-semibold">{fmt(status.pending)}{unit}</p></div>
              <div><p className="text-muted-foreground">Remaining</p><p className="font-semibold">{fmt(status.remaining)}{unit}</p></div>
            </div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${installedPct}%` }} />
              <div className="h-full bg-amber-400/70" style={{ width: `${pendingPct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">No scope quantity yet: set the activity&apos;s quantity in Task Work to track installed quantity.</p>
        )}
      </div>

      {hasScope && (
        <div className="grid grid-cols-[1fr_auto_auto] gap-2">
          <input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={`Installed${unit}`}
            className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5"
          />
          <input
            type="date"
            value={asOf}
            max={todayISO()}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5"
          />
          <button
            type="button"
            onClick={() => void record()}
            disabled={busy || qty === ""}
            className="rounded-md bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-50"
          >
            Record
          </button>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (location, report reference)"
            className="col-span-3 rounded-md border border-border bg-background px-2 py-1.5"
          />
        </div>
      )}

      {entries.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Quantity entries</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id} className="flex items-center gap-2">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{e.as_of}</span>
                <span className="w-24 shrink-0 text-right tabular-nums font-medium">{fmt(e.quantity)}{e.unit ? ` ${e.unit}` : ""}</span>
                <span className={cn("rounded px-1.5 text-[10px] font-semibold",
                  e.status === "approved" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : e.status === "pending" ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                    : "bg-muted text-muted-foreground line-through")}>
                  {e.status}
                </span>
                <span className="truncate text-muted-foreground">{e.source === "daily_report" ? "daily report" : ""}{e.note ? ` ${e.note}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Approved progress history</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {history.map((h, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{h.as_of}</span>
                <span className="w-24 shrink-0 text-right tabular-nums">
                  {h.kind === "quantity" ? `${h.value > 0 ? "+" : ""}${fmt(h.value)}${unit}` : `${fmt(h.previous_value)}% → ${fmt(h.value)}%`}
                </span>
                <span className="truncate text-muted-foreground">{h.source.replace("_", " ")}{h.note ? ` · ${h.note}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
