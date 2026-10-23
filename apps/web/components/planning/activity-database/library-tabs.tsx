"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listActivitiesUsingWorkItem, listResourcesLibrary, listWorkItemsLibrary, type MasterRow, type ResourceListRow, type WorkItemListRow,
} from "@/lib/planning/activity-library/activity-database-service";
import { workItemLabel } from "@/lib/planning/activity-library/boq-item-rules";
import { errorMessage, PAGE_SIZE, SELECT_CLS } from "./activity-database-shared";

function TableError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm">
      <p className="text-destructive">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function TableSkeleton() {
  return <div className="space-y-1">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

type UsingActivity = Pick<MasterRow, "id" | "visible_code" | "code" | "name">;

function UsedByCell({ db, workItemId, onOpenActivity }: { db: SupabaseClient; workItemId: string; onOpenActivity: (id: string) => void }) {
  const [rows, setRows] = useState<UsingActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listActivitiesUsingWorkItem(db, workItemId)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setError(errorMessage(e, "Failed to load")); });
    return () => { live = false; };
  }, [db, workItemId]);
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (!rows) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (rows.length === 0) return <span className="text-sm text-muted-foreground">No current activity uses this BOQ item.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((a) => (
        <button
          key={a.id} type="button" onClick={() => onOpenActivity(a.id)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary hover:text-primary"
        >
          <span className="font-mono text-muted-foreground">{a.visible_code ?? a.code}</span> {a.name}
        </button>
      ))}
    </div>
  );
}

/** BOQ tab: the cost library's work items with the activities that use each one. */
export function BoqLibraryTab({
  db, query, refreshKey, onOpenActivity, onOpenBoq,
}: { db: SupabaseClient; query: string; refreshKey: number; onOpenActivity: (id: string) => void; onOpenBoq: (id: string, list: WorkItemListRow[]) => void }) {
  const key = `${query}|${refreshKey}`;
  const [state, setState] = useState<{ key: string; items: WorkItemListRow[]; total: number; error: string | null } | null>(null);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listWorkItemsLibrary(db, { q: query, limit: PAGE_SIZE, offset: 0 })
      .then((p) => { if (live) setState({ key, items: p.items, total: p.total, error: null }); })
      .catch((e) => { if (live) setState({ key, items: [], total: 0, error: errorMessage(e, "Failed to load BOQ items") }); });
    return () => { live = false; };
  }, [db, query, key, retry]);

  const liveKey = useRef(key);
  useEffect(() => { liveKey.current = key; }, [key]);

  async function loadMore() {
    if (!state) return;
    const startKey = key;
    const offset = state.items.length;
    setMore(true);
    try {
      const p = await listWorkItemsLibrary(db, { q: query, limit: PAGE_SIZE, offset });
      if (liveKey.current !== startKey) return;
      setState((s) => (s && s.key === startKey ? { ...s, items: [...s.items, ...p.items], total: p.total } : s));
    } catch (e) {
      if (liveKey.current !== startKey) return;
      setState((s) => (s && s.key === startKey ? { ...s, error: errorMessage(e, "Failed to load more") } : s));
    } finally { setMore(false); }
  }

  if (!state || state.key !== key) return <TableSkeleton />;
  if (state.error) return <TableError message={state.error} onRetry={() => { setState(null); setRetry((n) => n + 1); }} />;
  if (state.items.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{query ? "No BOQ items match your search." : "The cost library has no BOQ items yet."}</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{state.total.toLocaleString()} BOQ item{state.total === 1 ? "" : "s"}. Select a row to open the BOQ item; use the arrow to see the activities that use it.</p>
      <div className="overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" /><TableHead>Code</TableHead><TableHead>Description</TableHead><TableHead>Unit</TableHead><TableHead>Section</TableHead><TableHead className="text-right">Used by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.items.map((w) => {
              const open = openId === w.id;
              return (
                <Fragment key={w.id}>
                  <TableRow className="cursor-pointer" onClick={() => onOpenBoq(w.id, state.items)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-expanded={open} aria-label={open ? "Hide activities" : "Show activities"} onClick={() => setOpenId(open ? null : w.id)}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{w.code}</TableCell>
                    <TableCell>{workItemLabel(w)}</TableCell>
                    <TableCell>{w.unit}</TableCell>
                    <TableCell className="text-muted-foreground">{w.boqSection ?? "-"}</TableCell>
                    <TableCell className="text-right"><Badge variant={w.usedBy > 0 ? "default" : "secondary"}>{w.usedBy} {w.usedBy === 1 ? "activity" : "activities"}</Badge></TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell /><TableCell colSpan={5}><UsedByCell db={db} workItemId={w.id} onOpenActivity={onOpenActivity} /></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {state.items.length < state.total && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={more} onClick={() => void loadMore()}>
            {more && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Load more ({(state.total - state.items.length).toLocaleString()} left)
          </Button>
        </div>
      )}
    </div>
  );
}

/** Resource tab: labour and equipment from the cost library. */
export function ResourceLibraryTab({ db, query, refreshKey }: { db: SupabaseClient; query: string; refreshKey: number }) {
  const [kind, setKind] = useState<"all" | "labor" | "equipment">("all");
  const key = `${query}|${kind}|${refreshKey}`;
  const [state, setState] = useState<{ key: string; rows: ResourceListRow[]; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let live = true;
    listResourcesLibrary(db, { q: query, kind })
      .then((rows) => { if (live) setState({ key, rows, error: null }); })
      .catch((e) => { if (live) setState({ key, rows: [], error: errorMessage(e, "Failed to load resources") }); });
    return () => { live = false; };
  }, [db, query, kind, key, retry]);

  const loaded = state?.key === key ? state : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Type
          <select className={`${SELECT_CLS} w-44`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="all">All (M and E)</option>
            <option value="labor">M - Manpower</option>
            <option value="equipment">E - Equipment</option>
          </select>
        </label>
        {loaded && !loaded.error && <span className="text-sm text-muted-foreground">{loaded.rows.length.toLocaleString()} resource{loaded.rows.length === 1 ? "" : "s"}</span>}
      </div>
      {!loaded ? <TableSkeleton /> : loaded.error ? <TableError message={loaded.error} onRetry={() => { setState(null); setRetry((n) => n + 1); }} /> : loaded.rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{query ? "No resources match your search." : "The cost library has no manpower or equipment resources yet."}</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Resource</TableHead><TableHead>Type</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">BOQ items</TableHead></TableRow></TableHeader>
            <TableBody>
              {loaded.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code}</TableCell>
                  <TableCell>{r.name}</TableCell>
                  <TableCell><Badge variant="secondary">{r.kind === "labor" ? "M" : "E"}</Badge></TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.workItemCount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
