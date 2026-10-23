"use client";

import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  listWorkItemsForDivision, listWorkItemsForMaster, type DivisionWithCounts, type WorkItemRef,
} from "@/lib/planning/activity-library/activity-database-service";
import { activityLabel, errorMessage, PAGE_SIZE, type ActivityListItem } from "./activity-database-shared";

function PaneShell({ title, count, children }: { title: string; count: number | null; children: React.ReactNode }) {
  return (
    <section className="flex min-h-72 min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-full lg:min-h-0">
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2.5 text-sm font-semibold">
        {title}
        {count !== null && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">{count.toLocaleString()}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

function PaneError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 p-6 text-center text-sm">
      <p className="text-destructive">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}

function PaneSkeleton({ rows }: { rows: number }) {
  return <div className="space-y-1 p-2">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
}

function PaneEmpty({ children }: { children: React.ReactNode }) {
  return <p className="p-6 text-center text-sm text-muted-foreground">{children}</p>;
}

// ---------------------------------------------------------------- divisions

export function DivisionPane({
  divisions, loading, error, onRetry, selectedId, onSelect,
}: {
  divisions: DivisionWithCounts[]; loading: boolean; error: string | null; onRetry: () => void;
  selectedId: string | null; onSelect: (id: string | null) => void;
}) {
  const total = divisions.reduce((a, d) => a + d.activityCount, 0);
  const row = (key: string, label: string, count: number, selected: boolean, onClick: () => void) => (
    <button
      key={key} type="button" onClick={onClick} aria-current={selected ? "true" : undefined}
      className={cn("flex w-full items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-left text-sm transition-colors hover:bg-muted/60", selected && "bg-primary/10 font-medium text-primary")}
    >
      <span className="truncate">{label}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{count.toLocaleString()} {count === 1 ? "activity" : "activities"}</span>
    </button>
  );
  return (
    <PaneShell title="Divisions" count={loading || error ? null : divisions.length}>
      {error ? <PaneError message={error} onRetry={onRetry} /> : loading ? <PaneSkeleton rows={12} /> : (
        divisions.length === 0 ? <PaneEmpty>No divisions found.</PaneEmpty> : (
          <>
            {row("all", "All", total, selectedId === null, () => onSelect(null))}
            {divisions.map((d) => row(d.id, `Division ${d.code} - ${d.name}`, d.activityCount, selectedId === d.id, () => onSelect(d.id)))}
          </>
        )
      )}
    </PaneShell>
  );
}

// ---------------------------------------------------------------- activities

export function ActivityPane({
  activities, loading, error, onRetry, searching, selectedId, onOpen, onFocus,
}: {
  activities: ActivityListItem[]; loading: boolean; error: string | null; onRetry: () => void; searching: boolean;
  selectedId: string | null; onOpen: (id: string) => void; onFocus: (id: string | null) => void;
}) {
  return (
    <PaneShell title={searching ? "Activities (search)" : "Activities"} count={loading || error ? null : activities.length}>
      {error ? <PaneError message={error} onRetry={onRetry} /> : loading ? <PaneSkeleton rows={12} /> : (
        activities.length === 0 ? (
          <PaneEmpty>{searching ? "No activities match your search." : "No activities in this division yet. Use Import activities, or open an activity and choose Add activity."}</PaneEmpty>
        ) : (
          <ul onMouseLeave={() => onFocus(null)}>
            {activities.map((a) => (
              <li key={a.id}>
                <button
                  type="button" onClick={() => onOpen(a.id)} onMouseEnter={() => onFocus(a.id)} onFocus={() => onFocus(a.id)} onBlur={() => onFocus(null)}
                  aria-current={selectedId === a.id ? "true" : undefined}
                  className={cn("flex w-full items-baseline gap-3 border-b border-border/60 px-4 py-2 text-left text-sm transition-colors hover:bg-muted/60", selectedId === a.id && "bg-primary/10")}
                >
                  <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">{a.visible_code ?? "-"}</span>
                  <span className="min-w-0 flex-1 truncate">{activityLabel(a)}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </PaneShell>
  );
}

// ---------------------------------------------------------------- BOQs

interface BoqRow { id: string; code: string; description: string; unit: string; usedBy?: number }
interface BoqState { key: string; rows: BoqRow[]; total: number; error: string | null }

export function BoqPane({
  db, divisionId, focusActivity, searching, searchItems, refreshKey,
}: {
  db: SupabaseClient; divisionId: string | null;
  /** Hovered / selected activity: show only its links. */
  focusActivity: ActivityListItem | null;
  /** A search is active: show its results instead. */
  searching: boolean;
  /** Search results; null while they are still loading. */
  searchItems: WorkItemRef[] | null;
  refreshKey: number;
}) {
  const focusId = focusActivity?.id ?? null;
  const key = searching ? "search" : focusId ? `act:${focusId}:${refreshKey}` : `div:${divisionId ?? "all"}:${refreshKey}`;
  const [state, setState] = useState<BoqState | null>(null);
  const [more, setMore] = useState(false);
  const [retry, setRetry] = useState(0);
  const cache = useRef(new Map<string, BoqState>());
  const liveKey = useRef(key);
  useEffect(() => { liveKey.current = key; }, [key]);

  useEffect(() => {
    if (searching) return;
    const cached = cache.current.get(`${key}:${retry}`);
    if (cached) { setState(cached); return; }
    let live = true;
    (async () => {
      let next: BoqState;
      try {
        if (focusId) {
          const g = await listWorkItemsForMaster(db, focusId);
          next = { key, rows: g.links.map((l) => ({ id: l.workItem.id, code: l.workItem.code, description: l.workItem.description, unit: l.workItem.unit })), total: g.links.length, error: null };
        } else {
          const p = await listWorkItemsForDivision(db, divisionId, { limit: PAGE_SIZE, offset: 0 });
          next = { key, rows: p.items, total: p.total, error: null };
        }
      } catch (e) { next = { key, rows: [], total: 0, error: errorMessage(e, "Failed to load BOQs") }; }
      if (!live) return;
      if (!next.error) cache.current.set(`${key}:${retry}`, next);
      setState(next);
    })();
    return () => { live = false; };
  }, [db, key, focusId, divisionId, searching, retry]);

  // Drop cached results when the data is refreshed.
  useEffect(() => { cache.current.clear(); }, [refreshKey]);

  async function loadMore() {
    if (!state || focusId || searching) return;
    const startKey = key;
    const offset = state.rows.length;
    setMore(true);
    try {
      const p = await listWorkItemsForDivision(db, divisionId, { limit: PAGE_SIZE, offset });
      if (liveKey.current !== startKey) return; // the pane moved on; drop this page
      setState((s) => {
        if (!s || s.key !== startKey) return s;
        const merged: BoqState = { ...s, rows: [...s.rows, ...p.items], total: p.total };
        cache.current.set(`${startKey}:${retry}`, merged);
        return merged;
      });
    } catch (e) {
      if (liveKey.current !== startKey) return;
      setState((s) => (s && s.key === startKey ? { ...s, error: errorMessage(e, "Failed to load more BOQs") } : s));
    } finally { setMore(false); }
  }

  const rows: BoqRow[] = searching ? searchItems ?? [] : state?.rows ?? [];
  const loading = searching ? searchItems === null : state?.key !== key;
  const error = !searching && state?.key === key ? state.error : null;
  const total = searching ? searchItems?.length ?? null : state?.key === key ? state.total : null;
  const title = searching ? "BOQs (search)" : focusActivity ? `BOQs of ${focusActivity.visible_code ?? focusActivity.code}` : "BOQs";

  return (
    <PaneShell title={title} count={loading || error ? null : total}>
      {error ? <PaneError message={error} onRetry={() => setRetry((n) => n + 1)} /> : loading ? <PaneSkeleton rows={12} /> : rows.length === 0 ? (
        <PaneEmpty>
          {searching ? "No BOQ items match your search."
            : focusActivity ? "This activity has no BOQ items linked yet. Open it and add links from its BOQs tab."
              : "No BOQ items are linked to activities in this division yet. Open an activity and add links from its BOQs tab."}
        </PaneEmpty>
      ) : (
        <>
          <ul>
            {rows.map((r) => (
              <li key={r.id} className="flex items-baseline gap-3 border-b border-border/60 px-4 py-2 text-sm" title={`${r.code} ${r.description}`}>
                <span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground">{r.code}</span>
                <span className="min-w-0 flex-1 truncate">{r.description} <span className="text-muted-foreground">({r.unit})</span></span>
                {r.usedBy !== undefined && r.usedBy > 1 && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">x{r.usedBy}</span>}
              </li>
            ))}
          </ul>
          {!searching && !focusId && state && state.rows.length < state.total && (
            <div className="flex justify-center p-3">
              <Button size="sm" variant="outline" disabled={more} onClick={() => void loadMore()}>
                {more && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Load more ({(state.total - state.rows.length).toLocaleString()} left)
              </Button>
            </div>
          )}
        </>
      )}
    </PaneShell>
  );
}

// ---------------------------------------------------------------- tab

export function MasterActivityTab({
  db, divisions, divisionsLoading, divisionsError, onRetryDivisions, selectedDivisionId, onSelectDivision,
  activities, activitiesLoading, activitiesError, onRetryActivities, searchActive, searchWorkItems,
  selectedActivityId, onOpenActivity, refreshKey,
}: {
  db: SupabaseClient;
  divisions: DivisionWithCounts[]; divisionsLoading: boolean; divisionsError: string | null; onRetryDivisions: () => void;
  selectedDivisionId: string | null; onSelectDivision: (id: string | null) => void;
  activities: ActivityListItem[]; activitiesLoading: boolean; activitiesError: string | null; onRetryActivities: () => void;
  searchActive: boolean; searchWorkItems: WorkItemRef[] | null;
  selectedActivityId: string | null; onOpenActivity: (id: string) => void; refreshKey: number;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [debounced, setDebounced] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(hoverId), hoverId ? 250 : 0);
    return () => clearTimeout(t);
  }, [hoverId]);

  const focusId = debounced ?? selectedActivityId;
  const focusActivity = focusId ? activities.find((a) => a.id === focusId) ?? null : null;

  return (
    <div className="grid gap-4 lg:h-[calc(100vh-18rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(260px,1fr)_minmax(320px,1.5fr)_minmax(320px,1.5fr)]">
      <DivisionPane divisions={divisions} loading={divisionsLoading} error={divisionsError} onRetry={onRetryDivisions} selectedId={selectedDivisionId} onSelect={onSelectDivision} />
      <ActivityPane
        activities={activities} loading={activitiesLoading} error={activitiesError} onRetry={onRetryActivities} searching={searchActive}
        selectedId={selectedActivityId} onOpen={onOpenActivity} onFocus={setHoverId}
      />
      <BoqPane db={db} divisionId={selectedDivisionId} focusActivity={searchActive ? null : focusActivity} searching={searchActive} searchItems={searchActive ? searchWorkItems : null} refreshKey={refreshKey} />
    </div>
  );
}
