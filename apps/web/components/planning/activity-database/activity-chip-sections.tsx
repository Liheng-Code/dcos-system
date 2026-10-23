"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  addCoordination, addMaterial, addMethodStatement, addShopDrawing, addTcItem, getMasterChips, removeChip, searchCoordinationItems, searchMaterials,
  searchMethodStatements, searchShopDrawingTypes, searchTcItems,
  type Chip, type ChipKind, type MasterChips,
} from "@/lib/planning/activity-library/activity-chips-service";
import { TC_TYPE_LABEL } from "@/lib/planning/activity-library/activity-chips-rules";
import { errorMessage } from "./activity-database-shared";

interface Option { id: string; label: string; sub?: string }

/** Add + chip: opens a searchable list, picks one item and adds it immediately. */
function ChipPicker({
  search, excludeIds, onPick, label,
}: { search: (q: string) => Promise<Option[]>; excludeIds: Set<string>; onPick: (o: Option) => Promise<void>; label: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    const t = setTimeout(() => {
      search(query)
        .then((o) => { if (live) { setOptions(o); setError(null); } })
        .catch((e) => { if (live) { setOptions([]); setError(errorMessage(e, "Search failed")); } });
    }, query ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [open, query, search]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) { setQuery(""); setOptions(null); setError(null); }
  };
  const visible = (options ?? []).filter((o) => !excludeIds.has(o.id));

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        type="button" disabled={adding} aria-label={`Add ${label}`}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-input px-3 text-sm text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
      >
        Add {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
      </PopoverTrigger>
      <PopoverContent align="start" className="z-[100] w-80 max-w-[90vw] p-1.5">
        <div className="relative mb-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search code or name..."
            className="h-8 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-sm outline-hidden"
          />
        </div>
        <div className="max-h-56 overflow-y-auto">
          {options === null ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">Loading...</p>
          ) : error ? (
            <p className="px-2 py-3 text-center text-xs text-destructive">{error}</p>
          ) : visible.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matching items.</p>
          ) : visible.map((o) => (
            <button
              key={o.id} type="button"
              onClick={async () => {
                handleOpenChange(false);
                setAdding(true);
                try { await onPick(o); } finally { setAdding(false); }
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.sub && <span className="shrink-0 font-mono text-muted-foreground">{o.sub}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ChipSection({
  title, chips, canEdit, onRemove, picker,
}: { title: string; chips: Chip[]; canEdit: boolean; onRemove: (c: Chip) => void; picker: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</h3>
      <div className="flex flex-wrap items-center gap-2">
        {chips.length === 0 && <span className="text-sm text-muted-foreground">None linked</span>}
        {chips.map((c) => (
          <span key={c.linkId} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-3 pr-1.5 text-sm" title={c.code}>
            {c.name}
            {c.tcType && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">{TC_TYPE_LABEL[c.tcType]}</span>}
            {canEdit && (
              <button
                type="button" aria-label={`Remove ${c.name}`} onClick={() => onRemove(c)}
                className="rounded-full p-0.5 text-destructive hover:bg-destructive/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
        {canEdit && picker}
      </div>
    </section>
  );
}

/** Shop drawings, materials and coordination linked to one activity. Saves immediately, at any status. */
export function ActivityChipSections({
  db, masterId, divisionCode, canEdit,
}: { db: SupabaseClient; masterId: string; divisionCode: string | null; canEdit: boolean }) {
  const [chips, setChips] = useState<MasterChips | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setChips(await getMasterChips(db, masterId)); setError(null); } catch (e) { setError(errorMessage(e, "Failed to load the linked items")); }
  }, [db, masterId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const searchSd = useCallback(async (q: string): Promise<Option[]> =>
    (await searchShopDrawingTypes(db, q, divisionCode)).map((s) => ({ id: s.id, label: s.name, sub: s.code })), [db, divisionCode]);
  const searchMat = useCallback(async (q: string): Promise<Option[]> =>
    (await searchMaterials(db, q)).map((m) => ({ id: m.id, label: m.name, sub: m.code })), [db]);
  const searchCo = useCallback(async (q: string): Promise<Option[]> =>
    (await searchCoordinationItems(db, q)).map((c) => ({ id: c.id, label: c.name, sub: c.code })), [db]);

  const searchMs = useCallback(async (q: string): Promise<Option[]> =>
    (await searchMethodStatements(db, q, divisionCode)).map((m) => ({ id: m.id, label: m.name, sub: m.code })), [db, divisionCode]);
  const searchTc = useCallback(async (q: string): Promise<Option[]> =>
    (await searchTcItems(db, q, divisionCode)).map((t) => ({ id: t.id, label: t.name, sub: TC_TYPE_LABEL[t.tc_type] })), [db, divisionCode]);

  async function add(kind: ChipKind, o: Option) {
    try {
      if (kind === "shop_drawing") await addShopDrawing(db, masterId, o.id);
      else if (kind === "material") await addMaterial(db, masterId, o.id);
      else if (kind === "method_statement") await addMethodStatement(db, masterId, o.id);
      else if (kind === "tc") await addTcItem(db, masterId, o.id);
      else await addCoordination(db, masterId, o.id);
      toast.success(`${o.label} added`);
      await load();
    } catch (e) { toast.error(errorMessage(e, "Could not add")); }
  }
  async function remove(kind: ChipKind, c: Chip) {
    try { await removeChip(db, kind, c.linkId); toast.success(`${c.name} removed`); await load(); } catch (e) { toast.error(errorMessage(e, "Could not remove")); }
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-dashed border-border p-3 text-sm">
        <span className="text-destructive">{error}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }
  if (!chips) return <div className="space-y-3"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>;

  const ids = (c: Chip[]) => new Set(c.map((x) => x.id));
  return (
    <div className="space-y-5">
      <ChipSection
        title="Shop drawings" chips={chips.shopDrawings} canEdit={canEdit} onRemove={(c) => void remove("shop_drawing", c)}
        picker={<ChipPicker label="shop drawing" search={searchSd} excludeIds={ids(chips.shopDrawings)} onPick={(o) => add("shop_drawing", o)} />}
      />
      <ChipSection
        title="Materials" chips={chips.materials} canEdit={canEdit} onRemove={(c) => void remove("material", c)}
        picker={<ChipPicker label="material" search={searchMat} excludeIds={ids(chips.materials)} onPick={(o) => add("material", o)} />}
      />
      <ChipSection
        title="Coordination" chips={chips.coordination} canEdit={canEdit} onRemove={(c) => void remove("coordination", c)}
        picker={<ChipPicker label="coordination" search={searchCo} excludeIds={ids(chips.coordination)} onPick={(o) => add("coordination", o)} />}
      />
      <ChipSection
        title="Method statements" chips={chips.methodStatements} canEdit={canEdit} onRemove={(c) => void remove("method_statement", c)}
        picker={<ChipPicker label="method statement" search={searchMs} excludeIds={ids(chips.methodStatements)} onPick={(o) => add("method_statement", o)} />}
      />
      <ChipSection
        title="Testing & commissioning" chips={chips.tcItems} canEdit={canEdit} onRemove={(c) => void remove("tc", c)}
        picker={<ChipPicker label="testing or commissioning item" search={searchTc} excludeIds={ids(chips.tcItems)} onPick={(o) => add("tc", o)} />}
      />
    </div>
  );
}
