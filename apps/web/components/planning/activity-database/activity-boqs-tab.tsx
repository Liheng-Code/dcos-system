"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  addWorkItemLink, listWorkItemsForMaster, removeWorkItemLink, searchWorkItems, updateWorkItemLink,
  type MasterWorkItemGrid, type MasterWorkItemLink, type WorkItemRef,
} from "@/lib/planning/activity-library/activity-database-service";
import { resourceColumnLabel } from "@/lib/planning/activity-library/boq-item-rules";
import { COST_LIBRARY_HREF, errorMessage } from "./activity-database-shared";

/** Number cell that saves on blur when the value changed. */
export function NumberCell({
  value, disabled, min, max, label, onSave,
}: { value: number | null; disabled: boolean; min?: number; max?: number; label: string; onSave: (v: number | null) => Promise<void> }) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const [saving, setSaving] = useState(false);

  async function commit() {
    const next = text.trim() === "" ? null : Number(text);
    if (next !== null && !Number.isFinite(next)) { setText(value === null ? "" : String(value)); return; }
    if (next === value) return;
    setSaving(true);
    try { await onSave(next); } catch (e) {
      if (!(e instanceof Error) || e.message) toast.error(errorMessage(e, "Could not save")); // an empty message means the caller cancelled
      setText(value === null ? "" : String(value));
    } finally { setSaving(false); }
  }

  return (
    <Input
      type="number" step="any" min={min} max={max} value={text} disabled={disabled || saving} aria-label={label}
      className="ml-auto h-8 w-24 text-right tabular-nums"
      onChange={(e) => setText(e.target.value)} onBlur={() => void commit()}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
    />
  );
}

function WorkItemPicker({ db, linkedIds, onPick }: { db: SupabaseClient; linkedIds: Set<string>; onPick: (w: WorkItemRef) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<WorkItemRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      setLoading(true);
      searchWorkItems(db, q, 30)
        .then((r) => { if (live) setResults(r); })
        .catch((e) => { if (live) toast.error(errorMessage(e, "Search failed")); })
        .finally(() => { if (live) setLoading(false); });
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [db, open, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button size="sm" />}>
        <Plus className="mr-1 h-4 w-4" /> Add BOQ
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-2 p-2">
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search BOQ items by code or description..." />
        <div className="max-h-64 overflow-auto">
          {loading && <div className="flex justify-center p-3"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>}
          {!loading && results.length === 0 && <p className="p-3 text-center text-sm text-muted-foreground">No BOQ items found.</p>}
          {results.map((w) => {
            const linked = linkedIds.has(w.id);
            return (
              <button
                key={w.id} type="button" disabled={linked || busyId !== null}
                className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                onClick={async () => {
                  setBusyId(w.id);
                  try { await onPick(w); setOpen(false); } catch { /* the caller already showed the error */ } finally { setBusyId(null); }
                }}
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{w.code}</span>
                <span className="flex-1">{w.description} <span className="text-muted-foreground">({w.unit})</span></span>
                {linked && <span className="text-xs text-muted-foreground">linked</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** BOQs tab of the activity dialog: linked work items with M / E hours per unit, days per unit and %. */
export function ActivityBoqsTab({
  db, masterId, editable, canManage, onLinksChanged,
}: { db: SupabaseClient; masterId: string; editable: boolean; canManage: boolean; onLinksChanged: () => void }) {
  const [grid, setGrid] = useState<MasterWorkItemGrid | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remove, setRemove] = useState<MasterWorkItemLink | null>(null);

  const load = useCallback(async () => {
    try { setGrid(await listWorkItemsForMaster(db, masterId)); setError(null); }
    catch (e) { setError(errorMessage(e, "Failed to load BOQs")); }
  }, [db, masterId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const canEdit = editable && canManage;

  if (error) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-6 text-center text-sm">
        <p className="text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!grid) return <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>;

  const linkedIds = new Set(grid.links.map((l) => l.workItem.id));

  async function afterChange() { await load(); onLinksChanged(); }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {grid.links.length} BOQ item{grid.links.length === 1 ? "" : "s"} linked.
          {" "}Manpower (M) and equipment (E) columns show consumption per BOQ unit in each resource&apos;s own unit and are read-only here; edit them in the{" "}
          <Link href={COST_LIBRARY_HREF} className="text-primary underline-offset-2 hover:underline">cost library</Link>.
        </p>
        {canEdit && (
          <WorkItemPicker db={db} linkedIds={linkedIds} onPick={async (w) => {
            try { await addWorkItemLink(db, masterId, w.id); toast.success(`${w.code} linked`); await afterChange(); }
            catch (e) { toast.error(errorMessage(e, "Could not add the BOQ")); throw e; }
          }} />
        )}
      </div>
      {!editable && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          This activity is not a draft, so its BOQ links are locked. Create a new version to change them.
        </p>
      )}
      {editable && !canManage && (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">You can view this grid; only library managers can change it.</p>
      )}
      {grid.links.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No BOQ items linked yet.{canEdit ? " Use Add BOQ to link work items from the cost library." : ""}
        </div>
      ) : (
        <div className="overflow-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead className="min-w-64">BOQ</TableHead>
                {grid.columns.map((c) => (
                  <TableHead key={c.resourceId} className="whitespace-nowrap text-right" title={`${c.kind === "M" ? "Manpower" : "Equipment"}: ${c.name}`}>
                    {resourceColumnLabel(c)}
                  </TableHead>
                ))}
                <TableHead className="whitespace-nowrap text-right">Duration (days/unit)</TableHead>
                <TableHead className="text-right">Percentage</TableHead>
                {canEdit && <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grid.links.map((l, i) => (
                <TableRow key={l.linkId}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="text-sm">{l.workItem.description}</div>
                    <div className="text-xs text-muted-foreground"><span className="font-mono">{l.workItem.code}</span> · {l.workItem.unit}</div>
                  </TableCell>
                  {grid.columns.map((c) => (
                    <TableCell key={c.resourceId} className="text-right tabular-nums text-muted-foreground">
                      {l.resources[c.resourceId] !== undefined ? l.resources[c.resourceId].toLocaleString() : "-"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <NumberCell key={`d-${l.linkId}-${l.durationDaysPerUnit}`} value={l.durationDaysPerUnit} min={0} disabled={!canEdit} label={`Days per unit for ${l.workItem.code}`}
                      onSave={async (v) => { await updateWorkItemLink(db, l.linkId, { durationDaysPerUnit: v }); await load(); }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumberCell key={`p-${l.linkId}-${l.sharePct}`} value={l.sharePct} min={0} max={100} disabled={!canEdit} label={`Percentage for ${l.workItem.code}`}
                      onSave={async (v) => {
                        if (v === null) throw new Error("Percentage is required.");
                        await updateWorkItemLink(db, l.linkId, { sharePct: v }); await load();
                      }} />
                  </TableCell>
                  {canEdit && (
                    <TableCell>
                      <Button size="icon" variant="ghost" aria-label={`Remove ${l.workItem.code}`} onClick={() => setRemove(l)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={remove !== null} onOpenChange={(o) => { if (!o) setRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove BOQ link?</AlertDialogTitle>
            <AlertDialogDescription>
              {remove ? `${remove.workItem.code} will no longer be linked to this activity. The BOQ item itself stays in the cost library.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => {
              const l = remove;
              setRemove(null);
              if (!l) return;
              try { await removeWorkItemLink(db, l.linkId); toast.success("BOQ link removed"); await afterChange(); }
              catch (e) { toast.error(errorMessage(e, "Could not remove the link")); }
            }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
