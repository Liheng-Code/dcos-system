"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  addWorkItemLink, removeWorkItemLink, updateWorkItemLink, type Division, type ResourceColumn,
} from "@/lib/planning/activity-library/activity-database-service";
import {
  listConsumption, listWorkItemActivities, removeConsumption, searchConsumptionResources, searchDraftMasters, setConsumption,
  type ConsumptionGrid, type WorkItemActivity, type WorkItemDetail,
} from "@/lib/planning/activity-library/boq-item-service";
import { divisionText, resourceColumnLabel } from "@/lib/planning/activity-library/boq-item-rules";
import { NumberCell } from "./activity-boqs-tab";
import { errorMessage } from "./activity-database-shared";

interface PickOption { id: string; label: string; sub?: string; col?: ResourceColumn }

/** Button that opens a search list; picking an entry runs onPick (errors stay in the list so the user can retry). */
function SearchPopover({
  label, variant, search, excludeIds, onPick, footer, align = "start",
}: {
  label: string; variant: "default" | "outline"; search: (q: string) => Promise<PickOption[]>; excludeIds?: Set<string>;
  onPick: (o: PickOption) => Promise<void>; footer?: string; align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [options, setOptions] = useState<PickOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      search(q)
        .then((o) => { if (live) { setOptions(o); setError(null); } })
        .catch((e) => { if (live) { setOptions([]); setError(errorMessage(e, "Search failed")); } });
    }, q ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, search]);

  const visible = (options ?? []).filter((o) => !excludeIds?.has(o.id));
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(""); setOptions(null); setError(null); } }}>
      <PopoverTrigger render={<Button type="button" size="sm" variant={variant} disabled={busy} />}>
        {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} {label}
      </PopoverTrigger>
      <PopoverContent align={align} className="z-[100] w-96 max-w-[90vw] gap-2 p-2">
        <input
          autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search..."
          className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-hidden"
        />
        <div className="max-h-60 overflow-y-auto">
          {options === null ? <p className="p-3 text-center text-xs text-muted-foreground">Loading...</p>
            : error ? <p className="p-3 text-center text-xs text-destructive">{error}</p>
              : visible.length === 0 ? <p className="p-3 text-center text-xs text-muted-foreground">Nothing to add.</p>
                : visible.map((o) => (
                  <button
                    key={o.id} type="button" disabled={busy}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                    onClick={async () => {
                      setBusy(true);
                      try { await onPick(o); setOpen(false); } catch (e) { setError(errorMessage(e, "Could not add")); } finally { setBusy(false); }
                    }}
                  >
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.sub && <span className="shrink-0 font-mono text-xs text-muted-foreground">{o.sub}</span>}
                  </button>
                ))}
        </div>
        {footer && <p className="px-1 text-xs text-muted-foreground">{footer}</p>}
      </PopoverContent>
    </Popover>
  );
}

/** Master Activities tab of the BOQ item dialog: activities that use this BOQ item, with M / E consumption per BOQ unit. */
export function BoqItemActivitiesTab({
  db, item, divisions, canManage, onChanged,
}: { db: SupabaseClient; item: WorkItemDetail; divisions: Division[]; canManage: boolean; onChanged: () => void }) {
  const [activities, setActivities] = useState<WorkItemActivity[] | null>(null);
  const [grid, setGrid] = useState<ConsumptionGrid | null>(null);
  const [pending, setPending] = useState<ResourceColumn[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [removeLink, setRemoveLink] = useState<WorkItemActivity | null>(null);
  const [clearCol, setClearCol] = useState<ResourceColumn | null>(null);
  const [userLabel, setUserLabel] = useState("a library manager");

  const load = useCallback(async () => {
    try {
      const [a, g] = await Promise.all([listWorkItemActivities(db, item.id), listConsumption(db, item.id)]);
      setActivities(a); setGrid(g); setError(null);
    } catch (e) { setError(errorMessage(e, "Failed to load the activities")); }
  }, [db, item.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void db.auth.getUser().then(({ data }) => { if (data.user?.email) setUserLabel(data.user.email); }); }, [db]);

  if (error) {
    return (
      <div className="space-y-2 rounded-md border border-dashed border-border p-6 text-center text-sm">
        <p className="text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!activities || !grid) return <div className="space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>;

  const columns = [...grid.columns, ...pending.filter((p) => !(p.resourceId in grid.values))];
  const divisionName = (code: string | null) => divisions.find((d) => d.code === code)?.name;
  const note = `Set in Activity Database by ${userLabel}`;

  async function afterChange() { await load(); onChanged(); }

  async function saveCell(c: ResourceColumn, v: number | null) {
    if (v === null) {
      if (c.resourceId in grid!.values) setClearCol(c);
      throw new Error(""); // revert the cell; the confirm dialog decides
    }
    await setConsumption(db, item, c.resourceId, v, note);
    setPending((p) => p.filter((x) => x.resourceId !== c.resourceId));
    await afterChange();
  }

  const consumptionCells = (rowKey: string) => columns.map((c) => (
    <TableCell key={c.resourceId} className="text-right">
      <NumberCell
        key={`${rowKey}-${c.resourceId}-${grid.values[c.resourceId] ?? ""}`} value={grid.values[c.resourceId] ?? null} min={0} disabled={!canManage}
        label={`${resourceColumnLabel(c)} for ${item.code}`} onSave={(v) => saveCell(c, v)}
      />
    </TableCell>
  ));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
        <div>
          {canManage && (
            <SearchPopover
              label="Add Master Activity" variant="default" excludeIds={new Set(activities.map((a) => a.master.id))}
              footer="Only draft activities can be linked. Approved or active activities are locked: create a new version of the activity first."
              search={async (q) => (await searchDraftMasters(db, q)).map((m) => ({ id: m.id, label: m.name, sub: m.visible_code ?? m.code }))}
              onPick={async (o) => {
                try { await addWorkItemLink(db, o.id, item.id); toast.success(`${o.label} linked`); await afterChange(); }
                catch (e) { toast.error(errorMessage(e, "Could not link the activity")); throw e; }
              }}
            />
          )}
        </div>
        {canManage && (
          <div className="flex gap-2">
            {(["M", "E"] as const).map((kind) => (
              <SearchPopover
                key={kind} label={kind === "M" ? "Manpower" : "Equipment"} variant="outline" align="end"
                excludeIds={new Set(columns.map((c) => c.resourceId))}
                search={async (q) => (await searchConsumptionResources(db, q, kind)).map((r) => ({ id: r.resourceId, label: r.name, sub: r.unit, col: r }))}
                onPick={async (o) => {
                  const col = o.col;
                  if (!col) throw new Error("Resource not found");
                  setPending((p) => [...p, col]);
                  toast.message(`${o.label} added as a column: enter its consumption per BOQ unit to save it`);
                }}
              />
            ))}
          </div>
        )}
      </div>
      {!canManage && <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">You can view this grid; only library managers can change it.</p>}
      <p className="text-xs text-muted-foreground">
        Manpower (M) and equipment (E) values are consumption per BOQ unit in each resource&apos;s own unit. They belong to this BOQ item, so every activity row shows the same values.
        Duration and percentage belong to each activity link.
      </p>

      <div className="overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead className="min-w-56">Activity</TableHead>
              <TableHead className="whitespace-nowrap">Division</TableHead>
              {columns.map((c) => <TableHead key={c.resourceId} className="whitespace-nowrap text-right" title={c.name}>{resourceColumnLabel(c)}</TableHead>)}
              <TableHead className="whitespace-nowrap text-right">Duration (days/unit)</TableHead>
              <TableHead className="text-right">Percentage</TableHead>
              {canManage && <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.length === 0 ? (
              <TableRow>
                <TableCell />
                <TableCell className="text-sm text-muted-foreground">No master activity uses this BOQ item yet.{canManage ? " Use Add Master Activity." : ""}</TableCell>
                <TableCell />
                {consumptionCells("none")}
                <TableCell /><TableCell />{canManage && <TableCell />}
              </TableRow>
            ) : activities.map((a, i) => {
              const locked = a.master.status !== "draft";
              return (
                <TableRow key={a.linkId}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <div className="text-sm">{a.master.name}</div>
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono">{a.master.visible_code ?? a.master.code}</span>
                      {locked && <span title="Only draft activities can change their BOQ links"> · {a.master.status}, locked</span>}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-sm">{divisionText(a.master.csi_division_code, divisionName(a.master.csi_division_code))}</TableCell>
                  {consumptionCells(a.linkId)}
                  <TableCell className="text-right">
                    <NumberCell key={`d-${a.linkId}-${a.durationDaysPerUnit}`} value={a.durationDaysPerUnit} min={0} disabled={!canManage || locked} label={`Days per unit for ${a.master.name}`}
                      onSave={async (v) => { await updateWorkItemLink(db, a.linkId, { durationDaysPerUnit: v }); await afterChange(); }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumberCell key={`p-${a.linkId}-${a.sharePct}`} value={a.sharePct} min={0} max={100} disabled={!canManage || locked} label={`Percentage for ${a.master.name}`}
                      onSave={async (v) => {
                        if (v === null) throw new Error("Percentage is required.");
                        await updateWorkItemLink(db, a.linkId, { sharePct: v }); await afterChange();
                      }} />
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      {!locked && <Button size="icon" variant="ghost" aria-label={`Remove ${a.master.name}`} onClick={() => setRemoveLink(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={removeLink !== null} onOpenChange={(o) => { if (!o) setRemoveLink(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this activity link?</AlertDialogTitle>
            <AlertDialogDescription>{removeLink ? `${item.code} will no longer be linked to ${removeLink.master.name}. The BOQ item itself stays in the cost library.` : ""}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => {
              const l = removeLink;
              setRemoveLink(null);
              if (!l) return;
              try { await removeWorkItemLink(db, l.linkId); toast.success("Link removed"); await afterChange(); } catch (e) { toast.error(errorMessage(e, "Could not remove the link")); }
            }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearCol !== null} onOpenChange={(o) => { if (!o) setClearCol(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this resource from the BOQ item?</AlertDialogTitle>
            <AlertDialogDescription>
              {clearCol ? `${clearCol.name} will be removed from ${item.code}. Its consumption per unit is deleted for every activity that uses this BOQ item and in the cost library.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={async () => {
              const c = clearCol;
              setClearCol(null);
              if (!c) return;
              try { await removeConsumption(db, item.id, c.resourceId); toast.success(`${c.name} removed`); await afterChange(); } catch (e) { toast.error(errorMessage(e, "Could not remove")); }
            }}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
