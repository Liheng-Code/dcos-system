"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { NO_DIVISION } from "@/lib/planning/activity-library/activity-chips-rules";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";

/** One row of the left filter pane. `key` NO_DIVISION is the "none" bucket. */
export interface FilterEntry { key: string; label: string; group: string; count: number; dim?: boolean }

/**
 * Library tab layout: a filter list on the left (CSI divisions, disciplines...), the tab's items on the right.
 * `selected` is an entry key, or null for all.
 */
export function FilterSplit({
  title, noun, entries, total, selected, onSelect, note, children,
}: {
  title: string; noun: string;
  /** Shown above both panes (e.g. where the data comes from). */
  note?: React.ReactNode;
  /** null while loading. */
  entries: FilterEntry[] | null;
  /** Items in "All" (an item under several entries counts once). */
  total: number | null;
  selected: string | null; onSelect: (key: string | null) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      {note}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)]">
        <FilterPane title={title} noun={noun} entries={entries} total={total} selected={selected} onSelect={onSelect} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

function FilterPane({
  title, noun, entries, total, selected, onSelect,
}: {
  title: string; noun: string; entries: FilterEntry[] | null; total: number | null; selected: string | null; onSelect: (key: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // Empty entries stay behind the toggle; the selected one always stays visible.
  const isEmpty = (e: FilterEntry) => e.count === 0;
  const hiddenCount = (entries ?? []).filter((e) => isEmpty(e) && e.key !== selected).length;
  const visible = (entries ?? []).filter((e) => showAll || !isEmpty(e) || e.key === selected);

  const groups: { name: string; items: FilterEntry[] }[] = [];
  for (const e of visible) {
    const g = groups.find((x) => x.name === e.group);
    if (g) g.items.push(e);
    else groups.push({ name: e.group, items: [e] });
  }

  const row = (key: string, label: string, n: number | null, isSelected: boolean, onClick: () => void, dim = false) => (
    <button
      key={key} type="button" onClick={onClick} aria-current={isSelected ? "true" : undefined}
      className={cn("flex w-full items-center justify-between gap-2 border-b border-border/60 px-4 py-2 text-left text-sm transition-colors hover:bg-muted/60", isSelected && "bg-primary/10 font-medium text-primary", dim && !isSelected && "text-muted-foreground")}
    >
      <span className="truncate">{label}</span>
      {n !== null && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground tabular-nums">{n.toLocaleString()}</span>}
    </button>
  );

  return (
    <section className="flex max-h-[28rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card lg:sticky lg:top-2 lg:max-h-[calc(100vh-14rem)]">
      <header className="shrink-0 border-b border-border px-4 py-2.5 text-sm font-semibold">{title}</header>
      <div className="min-h-0 flex-1 overflow-auto">
        {!entries ? (
          <div className="space-y-1 p-2">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : (
          <>
            {row("all", `All ${noun}s`, total, selected === null, () => onSelect(null))}
            {groups.map((g) => (
              <div key={g.name}>
                {g.name && <div className="sticky top-0 z-10 border-b border-border/60 bg-muted px-4 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g.name}</div>}
                {g.items.map((e) => row(e.key, e.label, e.count, selected === e.key, () => onSelect(e.key), e.dim))}
              </div>
            ))}
            {(hiddenCount > 0 || showAll) && (
              <div className="p-2 text-center">
                <Button type="button" size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? `Hide empty ${title.toLowerCase()}` : `Show all ${title.toLowerCase()} (${hiddenCount} empty)`}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/** CSI divisions as filter entries, plus the "No division" bucket when it has items (or is selected). */
export function divisionEntries(divisions: Division[], counts: Map<string, number> | null, selected: string | null): FilterEntry[] | null {
  if (!counts) return null;
  const out: FilterEntry[] = divisions.map((d) => ({ key: d.code, label: `${d.code} - ${d.name}`, group: d.group_name, count: counts.get(d.code) ?? 0, dim: !d.is_active }));
  const none = counts.get(NO_DIVISION) ?? 0;
  if (none > 0 || selected === NO_DIVISION) out.push({ key: NO_DIVISION, label: "No division", group: "Unassigned", count: none, dim: true });
  return out;
}

/** The library layout with CSI divisions on the left. */
export function DivisionSplit({
  divisions, counts, total, noun, selected, onSelect, note, children,
}: {
  divisions: Division[];
  note?: React.ReactNode;
  /** Items per division code (NO_DIVISION for none); null while loading. */
  counts: Map<string, number> | null;
  total: number | null; noun: string; selected: string | null; onSelect: (code: string | null) => void; children: React.ReactNode;
}) {
  return (
    <FilterSplit title="CSI Divisions" noun={noun} entries={divisionEntries(divisions, counts, selected)} total={total} selected={selected} onSelect={onSelect} note={note}>
      {children}
    </FilterSplit>
  );
}

/** "Division 03 - Concrete", "No division" or "All divisions": the right pane's heading for the selected bucket. */
export function selectedDivisionLabel(divisions: Division[], selected: string | null): string {
  if (selected === null) return "All divisions";
  if (selected === NO_DIVISION) return "No division";
  const d = divisions.find((x) => x.code === selected);
  return d ? `Division ${d.code} - ${d.name}` : `Division ${selected}`;
}
