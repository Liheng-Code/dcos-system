"use client";

// Capacity by period for one project resource (doc 35 C1): inside a period the resource's capacity is the period's
// value instead of Max Units, e.g. a crew that grows to 3 in the frame phase or a crane that leaves site. Each row
// saves on its own; the database rejects overlapping periods.

import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCapacityPeriod,
  listCapacityPeriods,
  saveCapacityPeriod,
  type ResourceCapacityRow,
} from "@/lib/planning/resource-service";

const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function PlanResourceCapacity({ projectId, resourceId, baseUnits }: { projectId: string; resourceId: string; baseUnits: number }) {
  const [rows, setRows] = useState<ResourceCapacityRow[] | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [units, setUnits] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listCapacityPeriods(projectId)
      .then((all) => setRows(all.filter((r) => r.resource_id === resourceId)))
      .catch((e) => { setRows([]); toast.error(e instanceof Error ? e.message : String(e)); });
  }, [projectId, resourceId]);
  useEffect(load, [load]);

  async function add() {
    const n = Number(units);
    if (!from) return toast.error("Pick the first day of the period.");
    if (to && to < from) return toast.error("The period ends before it starts.");
    if (units.trim() === "" || Number.isNaN(n) || n < 0) return toast.error("Capacity % must be zero or more.");
    setBusy(true);
    try {
      await saveCapacityPeriod(projectId, { resource_id: resourceId, from_date: from, to_date: to || null, max_units: n });
      setFrom(""); setTo(""); setUnits("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await deleteCapacityPeriod(id);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none";
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <span className="flex items-center gap-1.5 font-semibold">
        <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" /> Capacity by period
      </span>
      <p className="text-muted-foreground">
        Outside these periods the capacity is Max Units ({baseUnits}%). Over-allocation and levelling use the capacity of each day. Saved as you add or remove a period.
      </p>
      {rows === null ? (
        <div className="flex items-center gap-1.5 text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
      ) : rows.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-2 py-1.5">
              <span className="min-w-0 flex-1">{fmt(r.from_date)} – {r.to_date ? fmt(r.to_date) : "onwards"}</span>
              <span className="font-semibold tabular-nums">{r.max_units}%</span>
              <button type="button" title="Remove period" disabled={busy} onClick={() => remove(r.id)} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 items-end gap-2">
        <label className="block"><span className="text-muted-foreground">From</span><input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="block"><span className="text-muted-foreground">To (blank = onwards)</span><input type="date" className={input} value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></label>
        <label className="block"><span className="text-muted-foreground">Capacity %</span><input type="number" min={0} className={input} value={units} onChange={(e) => setUnits(e.target.value)} placeholder="e.g. 300" /></label>
        <button type="button" onClick={add} disabled={busy} className="inline-flex h-[26px] items-center justify-center gap-1 rounded-md border border-border px-2 font-semibold hover:bg-muted disabled:opacity-50">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Add period
        </button>
      </div>
    </div>
  );
}
