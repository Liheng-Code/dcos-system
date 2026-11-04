"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listActivitiesUsingWorkItem, listAllWorkItems, listResourcesLibrary, listWorkItemsLibrary, workItemDivisionCounts, workItemGapCounts, type Division, type MasterRow, type ResourceListRow, type WorkItemListRow,
} from "@/lib/work-library/work-library-service";
import { countByDivision, inDivision, NO_DIVISION } from "@/lib/work-library/activity-chips-rules";
import { GAP_HINT, GAP_LABEL, rateText, WORK_ITEM_GAPS, workItemGaps, workItemLabel, type WorkItemGap } from "@/lib/work-library/boq-item-rules";
import { errorMessage, PAGE_SIZE, SELECT_CLS } from "./work-library-shared";
import { DivisionSplit, selectedDivisionLabel } from "./division-filter-pane";
import { QsSourceNote } from "./qs-source-note";

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

/** BOQ tab: the cost library's work items by CSI division, with rate, build-up, activities and BOQ use, plus gap filters. */
export function BoqLibraryTab({
  db, divisions, query, refreshKey, onOpenActivity, onOpenBoq, onSuggest,
}: {
  db: SupabaseClient; divisions: Division[]; query: string; refreshKey: number;
  onOpenActivity: (id: string) => void; onOpenBoq: (id: string, list: WorkItemListRow[]) => void;
  /** Opens Auto-suggest links on this division (BOQ items without an activity). */
  onSuggest: (division: string | null) => void;
}) {
  const [division, setDivision] = useState<string | null>(null);
  const [gap, setGap] = useState<WorkItemGap | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [exporting, setExporting] = useState(false);
  const key = `${query}|${division}|${gap}|${showInactive}|${refreshKey}`;
  const countKey = `${query}|${gap}|${showInactive}|${refreshKey}`;
  const gapKey = `${query}|${division}|${showInactive}|${refreshKey}`;
  const [counts, setCounts] = useState<{ key: string; map: Map<string, number> } | null>(null);
  const [gapCounts, setGapCounts] = useState<{ key: string; counts: Record<WorkItemGap, number> } | null>(null);
  useEffect(() => {
    let live = true;
    // On failure the pane shows no counts; the table reports its own error.
    workItemDivisionCounts(db, query, { gap, showInactive })
      .then((map) => { if (live) setCounts({ key: countKey, map }); })
      .catch(() => { if (live) setCounts({ key: countKey, map: new Map() }); });
    return () => { live = false; };
  }, [db, query, gap, showInactive, countKey]);
  useEffect(() => {
    let live = true;
    workItemGapCounts(db, { q: query, division, showInactive })
      .then((c) => { if (live) setGapCounts({ key: gapKey, counts: c }); })
      .catch(() => { /* chips show without counts */ });
    return () => { live = false; };
  }, [db, query, division, showInactive, gapKey]);
  const countMap = counts?.key === countKey ? counts.map : null;
  const countTotal = countMap ? [...countMap.values()].reduce((a, n) => a + n, 0) : null;
  const gapCount = gapCounts?.key === gapKey ? gapCounts.counts : null;
  const [state, setState] = useState<{ key: string; items: WorkItemListRow[]; total: number; error: string | null } | null>(null);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listWorkItemsLibrary(db, { q: query, division, gap, showInactive, limit: PAGE_SIZE, offset: 0 })
      .then((p) => { if (live) setState({ key, items: p.items, total: p.total, error: null }); })
      .catch((e) => { if (live) setState({ key, items: [], total: 0, error: errorMessage(e, "Failed to load BOQ items") }); });
    return () => { live = false; };
  }, [db, query, division, gap, showInactive, key, retry]);

  const liveKey = useRef(key);
  useEffect(() => { liveKey.current = key; }, [key]);

  async function loadMore() {
    if (!state) return;
    const startKey = key;
    const offset = state.items.length;
    setMore(true);
    try {
      const p = await listWorkItemsLibrary(db, { q: query, division, gap, showInactive, limit: PAGE_SIZE, offset });
      if (liveKey.current !== startKey) return;
      setState((s) => (s && s.key === startKey ? { ...s, items: [...s.items, ...p.items], total: p.total } : s));
    } catch (e) {
      if (liveKey.current !== startKey) return;
      setState((s) => (s && s.key === startKey ? { ...s, error: errorMessage(e, "Failed to load more") } : s));
    } finally { setMore(false); }
  }

  /** The current list (all pages) as a spreadsheet; with the "No rate" gap it is the QS to-do list. */
  async function exportList() {
    setExporting(true);
    try {
      const rows = await listAllWorkItems(db, { q: query, division, gap, showInactive });
      const XLSX = await import("xlsx");
      const name = (c: string | null) => (c ? `${c} ${divisions.find((d) => d.code === c)?.name ?? ""}`.trim() : "");
      const sheet = XLSX.utils.json_to_sheet(rows.map((w) => ({
        Code: w.code, Description: workItemLabel(w), Unit: w.unit, Division: name(w.divisionCode), Section: w.sectionCode ?? "",
        "Net rate": w.rate ?? "", "Build-up lines": w.buildupLines ?? 0, Activities: w.usedBy, "BOQ uses": w.boqUses ?? 0,
        Gaps: workItemGaps(w).map((g) => GAP_LABEL[g]).join(", "), Active: w.isActive === false ? "N" : "Y",
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, sheet, "BOQ items");
      XLSX.writeFile(wb, `work-library-boq-items${gap ? `-${gap}` : ""}.xlsx`);
    } catch (e) { toast.error(errorMessage(e, "Could not export")); } finally { setExporting(false); }
  }

  return (
    <DivisionSplit divisions={divisions} counts={countMap} total={countTotal} noun="BOQ item" selected={division} onSelect={setDivision}
      note={<QsSourceNote source="boq">Each BOQ item takes its CSI division from the QS cost library.</QsSourceNote>}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Gaps:</span>
        {WORK_ITEM_GAPS.map((g) => (
          <button
            key={g} type="button" title={GAP_HINT[g]} aria-pressed={gap === g} onClick={() => setGap(gap === g ? null : g)}
            className={cn("inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs",
              gap === g ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary hover:text-primary")}
          >
            {GAP_LABEL[g]}
            {gapCount && <span className={cn("rounded-full px-1.5 tabular-nums", gap === g ? "bg-primary-foreground/20" : "bg-muted")}>{gapCount[g]}</span>}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" className="h-3.5 w-3.5" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
        <div className="ml-auto flex gap-2">
          {gap === "activity" && <Button size="sm" variant="outline" onClick={() => onSuggest(division === NO_DIVISION ? null : division)}>Suggest activities</Button>}
          <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportList()} title="Download the current list as a spreadsheet">
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Export
          </Button>
        </div>
      </div>
      {!state || state.key !== key ? <TableSkeleton /> : state.error ? (
        <TableError message={state.error} onRetry={() => { setState(null); setRetry((n) => n + 1); }} />
      ) : state.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {gap ? `No BOQ items with "${GAP_LABEL[gap]}" here.` : division !== null ? "No BOQ items in this division." : query ? "No BOQ items match your search." : "The cost library has no BOQ items yet."}
        </p>
      ) : (
        <BoqTable
          db={db} items={state.items} total={state.total} label={selectedDivisionLabel(divisions, division)} more={more} onLoadMore={() => void loadMore()}
          openId={openId} setOpenId={setOpenId} onOpenActivity={onOpenActivity} onOpenBoq={onOpenBoq}
        />
      )}
    </DivisionSplit>
  );
}

const countBadge = (n: number | undefined, noun: string) => (
  <Badge className="whitespace-nowrap" variant={n ? "default" : "secondary"}>{n ?? 0} {noun}{n === 1 ? "" : "s"}</Badge>
);

function BoqTable({
  db, items, total, label, more, onLoadMore, openId, setOpenId, onOpenActivity, onOpenBoq,
}: {
  db: SupabaseClient; items: WorkItemListRow[]; total: number; label: string; more: boolean; onLoadMore: () => void;
  openId: string | null; setOpenId: (id: string | null) => void; onOpenActivity: (id: string) => void; onOpenBoq: (id: string, list: WorkItemListRow[]) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>: {total.toLocaleString()} BOQ item{total === 1 ? "" : "s"}. Select a row to open the BOQ item; use the arrow to see the activities that use it.
      </p>
      <div className="overflow-auto rounded-lg border border-border [&_th]:whitespace-nowrap">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" /><TableHead>Code</TableHead><TableHead>Description</TableHead><TableHead>Unit</TableHead><TableHead>Section</TableHead>
              <TableHead className="text-right">Net rate</TableHead><TableHead className="text-right">Build-up</TableHead>
              <TableHead className="text-right">Activities</TableHead><TableHead className="text-right">BOQ uses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((w) => {
              const open = openId === w.id;
              const noRate = w.rate === null || w.rate === undefined;
              return (
                <Fragment key={w.id}>
                  <TableRow className={cn("cursor-pointer", w.isActive === false && "opacity-60")} onClick={() => onOpenBoq(w.id, items)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button type="button" aria-expanded={open} aria-label={open ? "Hide activities" : "Show activities"} onClick={() => setOpenId(open ? null : w.id)}>
                        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{w.code}</TableCell>
                    <TableCell>
                      {workItemLabel(w)}
                      {w.isActive === false && <Badge variant="outline" className="ml-2">Inactive</Badge>}
                    </TableCell>
                    <TableCell>{w.unit}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-xs text-muted-foreground">{w.sectionCode ?? "-"}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-right tabular-nums", noRate && "text-amber-600")}>{noRate ? "No rate" : rateText(w.rate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">{w.buildupLines ? `${w.buildupLines} line${w.buildupLines === 1 ? "" : "s"}` : "none"}</TableCell>
                    <TableCell className="text-right">{countBadge(w.usedBy, "activity")}</TableCell>
                    <TableCell className="text-right">{countBadge(w.boqUses, "line")}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell /><TableCell colSpan={8}><UsedByCell db={db} workItemId={w.id} onOpenActivity={onOpenActivity} /></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {items.length < total && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={more} onClick={onLoadMore}>
            {more && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Load more ({(total - items.length).toLocaleString()} left)
          </Button>
        </div>
      )}
    </div>
  );
}

/** Resource tab: labour and equipment from the cost library, by CSI division (taken from the BOQ items that use them). */
export function ResourceLibraryTab({ db, divisions, query, refreshKey }: { db: SupabaseClient; divisions: Division[]; query: string; refreshKey: number }) {
  const [kind, setKind] = useState<"all" | "labor" | "equipment">("all");
  const [division, setDivision] = useState<string | null>(null);
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
  const counts = useMemo(() => (loaded && !loaded.error ? countByDivision(loaded.rows, (r) => r.divisions) : null), [loaded]);
  const rows = useMemo(() => (loaded?.rows ?? []).filter((r) => inDivision(r.divisions, division)), [loaded, division]);
  return (
    <DivisionSplit divisions={divisions} counts={counts} total={loaded?.rows.length ?? null} noun="resource" selected={division} onSelect={setDivision}
      note={<QsSourceNote source="resource">Labour and equipment have no division of their own; they are listed under the divisions of the BOQ items that use them.</QsSourceNote>}
    >
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
          {loaded && !loaded.error && (
            <span className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{selectedDivisionLabel(divisions, division)}</span>: {rows.length.toLocaleString()} resource{rows.length === 1 ? "" : "s"}
              {division === NO_DIVISION && ". No BOQ item with a division uses these yet."}
            </span>
          )}
        </div>
        {!loaded ? <TableSkeleton /> : loaded.error ? <TableError message={loaded.error} onRetry={() => { setState(null); setRetry((n) => n + 1); }} /> : rows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {loaded.rows.length > 0 ? "No resources in this division." : query ? "No resources match your search." : "The cost library has no manpower or equipment resources yet."}
          </p>
        ) : (
          <div className="overflow-auto rounded-lg border border-border">
            <Table>
              <TableHeader><TableRow><TableHead>Code</TableHead><TableHead>Resource</TableHead><TableHead>Type</TableHead><TableHead>Unit</TableHead><TableHead>Divisions</TableHead><TableHead className="text-right">BOQ items</TableHead></TableRow></TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.code}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell><Badge variant="secondary">{r.kind === "labor" ? "M" : "E"}</Badge></TableCell>
                    <TableCell>{r.unit}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.divisions.length ? r.divisions.join(", ") : "-"}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.workItemCount.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </DivisionSplit>
  );
}
