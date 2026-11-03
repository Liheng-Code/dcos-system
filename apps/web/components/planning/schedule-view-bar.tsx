"use client";

// Gantt / Sheet view bar (doc 35 U3): group-by, filters, saved views and bulk edit of the selected activities.
// Filtering and grouping only change what is shown; bulk edit writes through the schedule hook as one undo step.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, Pencil, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { GROUP_BY_LABEL, filterOptions, isFilterActive, type GroupBy, type ViewFilter } from "@/lib/planning/sheet-view";
import { deleteView, listSavedViews, saveView, type SavedView } from "@/lib/planning/saved-views-service";
import { PRIORITY_OPTIONS, STATUS_LABELS, STATUS_OPTIONS, type SheetTask } from "./sheet-types";
import type { BulkField } from "./use-sheet-data";

const SEL = "h-7 rounded-md border border-border bg-background px-1.5 text-[11px] outline-none focus:border-primary";

export function ScheduleViewBar({
  projectId, tasks, filter, onFilterChange, groupBy, onGroupByChange, selectedTaskIds, onBulkUpdate, readOnly,
}: {
  projectId: string;
  tasks: readonly SheetTask[];
  filter: ViewFilter;
  onFilterChange: (f: ViewFilter) => void;
  groupBy: GroupBy;
  onGroupByChange: (g: GroupBy) => void;
  selectedTaskIds: string[];
  onBulkUpdate: (taskIds: string[], field: BulkField, raw: string) => Promise<void>;
  readOnly: boolean;
}) {
  const db = useMemo(() => createClient(), []);
  const opts = useMemo(() => filterOptions(tasks), [tasks]);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewId, setViewId] = useState("");
  const [saving, setSaving] = useState<{ name: string; shared: boolean } | null>(null);
  const [bulk, setBulk] = useState<{ field: BulkField; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(filter.text ?? "");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- a saved view or Clear replaces the text
  useEffect(() => { setText(filter.text ?? ""); }, [filter.text]);
  // the latest filter and callback, so re-renders of the page do not restart the debounce
  const latest = useRef({ filter, onFilterChange });
  useEffect(() => { latest.current = { filter, onFilterChange }; });
  useEffect(() => {
    if (text === (latest.current.filter.text ?? "")) return;
    const t = setTimeout(() => { setViewId(""); latest.current.onFilterChange({ ...latest.current.filter, text }); }, 300);
    return () => clearTimeout(t);
  }, [text]);

  const loadViews = useCallback(async () => {
    try {
      setViews(await listSavedViews(db, projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }, [db, projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the project's saved views
  useEffect(() => { void loadViews(); setViewId(""); }, [loadViews]);

  const set = (patch: Partial<ViewFilter>) => { setViewId(""); onFilterChange({ ...filter, ...patch }); };
  const active = isFilterActive(filter) || groupBy !== "wbs";
  const current = views.find((v) => v.id === viewId) ?? null;

  function pickView(id: string) {
    setViewId(id);
    const v = views.find((x) => x.id === id);
    if (!v) return;
    onFilterChange(v.filter);
    onGroupByChange(v.group_by);
  }

  async function submitSave() {
    if (!saving?.name.trim()) return;
    setBusy(true);
    try {
      const existing = views.find((v) => v.mine && v.name.toLowerCase() === saving.name.trim().toLowerCase());
      await saveView(db, projectId, { id: existing?.id, name: saving.name, filter, group_by: groupBy, shared: saving.shared });
      await loadViews();
      toast.success(existing ? "View updated" : "View saved");
      setSaving(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function removeView() {
    if (!current?.mine) return;
    try {
      await deleteView(db, current.id);
      setViewId("");
      await loadViews();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function submitBulk() {
    if (!bulk || bulk.value === "") return;
    setBusy(true);
    try {
      await onBulkUpdate(selectedTaskIds, bulk.field, bulk.value);
      setBulk(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-[11px]">
      <Filter className={cn("h-3.5 w-3.5", active ? "text-primary" : "text-muted-foreground")} />
      <label className="flex items-center gap-1">
        <span className="text-muted-foreground">Group</span>
        <select className={SEL} value={groupBy} onChange={(e) => { setViewId(""); onGroupByChange(e.target.value as GroupBy); }}>
          {(Object.keys(GROUP_BY_LABEL) as GroupBy[]).map((g) => <option key={g} value={g}>{GROUP_BY_LABEL[g]}</option>)}
        </select>
      </label>
      <div className="relative">
        <Search className="absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Code or name"
          className={cn(SEL, "w-36 pl-5")}
        />
      </div>
      <select className={SEL} value={filter.statuses?.[0] ?? ""} onChange={(e) => set({ statuses: e.target.value ? [e.target.value] : [] })}>
        <option value="">Any status</option>
        {opts.statuses.map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
      </select>
      {opts.disciplines.length > 0 && (
        <select className={SEL} value={filter.discipline ?? ""} onChange={(e) => set({ discipline: e.target.value || null })}>
          <option value="">Any discipline</option>
          {opts.disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
      {opts.owners.length > 0 && (
        <select className={SEL} value={filter.owner ?? ""} onChange={(e) => set({ owner: e.target.value || null })}>
          <option value="">Any owner</option>
          {opts.owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
      <label className="flex items-center gap-1" title="Activities on the critical path">
        <input type="checkbox" checked={!!filter.criticalOnly} onChange={(e) => set({ criticalOnly: e.target.checked })} /> Critical
      </label>
      <label className="flex items-center gap-1" title="Activities not yet 100% complete">
        <input type="checkbox" checked={!!filter.incompleteOnly} onChange={(e) => set({ incompleteOnly: e.target.checked })} /> Incomplete
      </label>
      <label className="flex items-center gap-1" title="Activities that overlap this period">
        <span className="text-muted-foreground">From</span>
        <input type="date" className={SEL} value={filter.from ?? ""} onChange={(e) => set({ from: e.target.value || null })} />
        <span className="text-muted-foreground">to</span>
        <input type="date" className={SEL} value={filter.to ?? ""} onChange={(e) => set({ to: e.target.value || null })} />
      </label>
      {active && (
        <button type="button" className="flex items-center gap-0.5 text-muted-foreground hover:text-foreground" onClick={() => { setViewId(""); onFilterChange({}); onGroupByChange("wbs"); }}>
          <X className="h-3 w-3" /> Clear
        </button>
      )}

      <span className="mx-1 h-4 w-px bg-border" />
      <select className={SEL} value={viewId} onChange={(e) => pickView(e.target.value)} title="Saved views">
        <option value="">Saved views…</option>
        {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.shared ? (v.mine ? " (shared)" : " (team)") : ""}</option>)}
      </select>
      <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setSaving({ name: current?.mine ? current.name : "", shared: current?.shared ?? false })}>
        <Save className="h-3.5 w-3.5" /> Save view
      </Button>
      {current?.mine && (
        <button type="button" title="Delete this saved view" className="text-muted-foreground hover:text-destructive" onClick={() => void removeView()}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}

      {!readOnly && selectedTaskIds.length > 0 && (
        <>
          <span className="mx-1 h-4 w-px bg-border" />
          <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => setBulk({ field: "status", value: "" })}>
            <Pencil className="h-3.5 w-3.5" /> Edit {selectedTaskIds.length} selected
          </Button>
        </>
      )}

      <Dialog open={!!saving} onOpenChange={(o) => !o && setSaving(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Save view</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Saves the current filters and grouping for this project. A view with the same name is updated.</p>
            <input
              autoFocus
              value={saving?.name ?? ""}
              onChange={(e) => setSaving((s) => (s ? { ...s, name: e.target.value } : s))}
              onKeyDown={(e) => { if (e.key === "Enter") void submitSave(); }}
              placeholder="e.g. Critical structure works"
              maxLength={80}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5"
            />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={!!saving?.shared} onChange={(e) => setSaving((s) => (s ? { ...s, shared: e.target.checked } : s))} />
              Share with the project team
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaving(null)}>Cancel</Button>
            <Button size="sm" disabled={busy || !saving?.name.trim()} onClick={() => void submitSave()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bulk} onOpenChange={(o) => !o && setBulk(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Edit {selectedTaskIds.length} selected activities</DialogTitle></DialogHeader>
          {bulk && (
            <div className="space-y-3 text-sm">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">Field</span>
                <select className="w-full rounded-md border border-border bg-background px-2 py-1.5" value={bulk.field} onChange={(e) => setBulk({ field: e.target.value as BulkField, value: "" })}>
                  <option value="status">Status</option>
                  <option value="priority">Priority</option>
                  <option value="progress">% complete</option>
                  <option value="duration">Duration (working days, or e.g. 7cd)</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">New value</span>
                {bulk.field === "status" || bulk.field === "priority" ? (
                  <select className="w-full rounded-md border border-border bg-background px-2 py-1.5" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })}>
                    <option value="">Choose…</option>
                    {(bulk.field === "status" ? STATUS_OPTIONS : PRIORITY_OPTIONS).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input
                    autoFocus
                    value={bulk.value}
                    onChange={(e) => setBulk({ ...bulk, value: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Enter") void submitBulk(); }}
                    placeholder={bulk.field === "progress" ? "0 to 100" : "e.g. 5"}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5"
                  />
                )}
              </label>
              <p className="text-xs text-muted-foreground">One action: Undo puts every activity back. Activities under a locked WBS node are skipped.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setBulk(null)}>Cancel</Button>
            <Button size="sm" disabled={busy || !bulk?.value} onClick={() => void submitBulk()}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
