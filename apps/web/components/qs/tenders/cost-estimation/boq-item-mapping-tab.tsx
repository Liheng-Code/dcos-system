"use client";

// BOQ Item Mapping (doc 24, Phase 1): maps each tender BOQ line to a BOQ item (dwl_work_items) so the programme can
// be generated from the BOQ. Services: lib/qs/boq-item-mapping-service.ts; scoring: lib/qs/boq-item-matcher.ts.

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Loader2, Search, Sparkles, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { cn } from "@/lib/utils";
import {
  autoMapTender, clearMapping, confirmMapping, listTenderBoqMappingRows, loadMatchCandidates, rejectMapping,
  setMapping, suggestForLines, type AutoMapResult, type MappingRow, type MappingStatus,
} from "@/lib/qs/boq-item-mapping-service";
import type { WorkItemInput, WorkItemSuggestion } from "@/lib/qs/boq-item-matcher";

type View = "unmapped" | "review" | "all";
type RowState = "confirmed" | "linked" | "auto" | "rejected" | "unmapped";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number) => `${(n * 100).toFixed(n > 0 && n < 0.1 ? 1 : 0)}%`;

/** linked = mapped by hand before review tracking existed (no status). */
function rowState(r: { workItemId: string | null; status: MappingStatus | null }): RowState {
  if (r.workItemId) return r.status === "confirmed" ? "confirmed" : r.status === "auto" ? "auto" : "linked";
  return r.status === "rejected" ? "rejected" : "unmapped";
}

const STATE_UI: Record<RowState, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "border-green-300 bg-green-50 text-green-700" },
  linked: { label: "Linked", cls: "border-green-300 bg-green-50 text-green-700" },
  auto: { label: "Needs review", cls: "border-amber-400 bg-amber-50 text-amber-800" },
  rejected: { label: "Rejected", cls: "border-red-300 bg-red-50 text-red-700" },
  unmapped: { label: "Unmapped", cls: "text-muted-foreground" },
};

type SuggestionState = WorkItemSuggestion[] | "loading" | "error";

export function BoqItemMappingTab({ tenderId, isLocked = false }: { tenderId: string; isLocked?: boolean }) {
  const { can } = useTenderPermissions();
  const canEdit = can("tender_boq", "edit") && !isLocked;

  const [rows, setRows] = useState<MappingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>("unmapped");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [candidates, setCandidates] = useState<WorkItemInput[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Map<string, SuggestionState>>(new Map());
  const [pickerFor, setPickerFor] = useState<MappingRow | null>(null);
  const [preview, setPreview] = useState<AutoMapResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listTenderBoqMappingRows(createClient(), tenderId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the tender BOQ lines.");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  // The page keys this tab on the tender, so state starts fresh per tender (loading is initially true).
  useEffect(() => {
    let cancelled = false;
    listTenderBoqMappingRows(createClient(), tenderId)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the tender BOQ lines."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenderId]);

  // Work items are loaded once: names for the suggestion list and the data of the "search other" picker.
  const ensureCandidates = useCallback(async (): Promise<WorkItemInput[]> => {
    if (candidates.length) return candidates;
    const c = await loadMatchCandidates(createClient());
    setCandidates(c);
    return c;
  }, [candidates]);
  const candById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const coverage = useMemo(() => {
    const c = { total: 0, value: 0, mappedValue: 0, mapped: 0, confirmed: 0, auto: 0, unmapped: 0, rejected: 0 };
    for (const r of rows) {
      const s = rowState(r);
      c.total++;
      c.value += r.amount;
      if (s === "unmapped") c.unmapped++;
      else if (s === "rejected") c.rejected++;
      else {
        c.mapped++;
        c.mappedValue += r.amount;
        if (s === "auto") c.auto++;
        else c.confirmed++;
      }
    }
    return c;
  }, [rows]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const s = rowState(r);
      if (view === "unmapped" && s !== "unmapped" && s !== "rejected") return false;
      if (view === "review" && s !== "auto") return false;
      if (!q) return true;
      return [r.itemCode, r.description, r.buildingCode, r.level, r.workItem?.code, r.workItem?.description].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, view, search]);

  const patchRow = (id: string, patch: Partial<MappingRow>) => setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  async function act(row: MappingRow, run: () => Promise<void>, after: Partial<MappingRow>, okMsg: string) {
    setBusy((b) => new Set(b).add(row.id));
    try {
      await run();
      patchRow(row.id, after);
      toast.success(okMsg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the change.");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(row.id);
        return n;
      });
    }
  }

  async function assign(row: MappingRow, workItemId: string, score: number | null) {
    const items = await ensureCandidates();
    const w = items.find((c) => c.id === workItemId);
    await act(
      row,
      () => setMapping(createClient(), row.id, workItemId, score),
      {
        workItemId,
        status: "confirmed",
        score,
        workItem: w ? { id: w.id, code: w.code, description: w.name || w.description, unit: w.unit ?? "" } : row.workItem,
      },
      "Mapped to BOQ item",
    );
  }

  async function loadSuggestions(row: MappingRow) {
    setSuggestions((m) => new Map(m).set(row.id, "loading"));
    try {
      const [map] = await Promise.all([suggestForLines(createClient(), [row.id], { limit: 3 }), ensureCandidates()]);
      setSuggestions((m) => new Map(m).set(row.id, map.get(row.id) ?? []));
    } catch {
      setSuggestions((m) => new Map(m).set(row.id, "error"));
    }
  }

  function toggleSuggestions(row: MappingRow) {
    if (expanded === row.id) {
      setExpanded(null);
      return;
    }
    setExpanded(row.id);
    if (!suggestions.has(row.id)) void loadSuggestions(row);
  }

  async function runPreview() {
    setPreviewing(true);
    try {
      await ensureCandidates();
      setPreview(await autoMapTender(createClient(), tenderId, { apply: false }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-map failed.");
    } finally {
      setPreviewing(false);
    }
  }

  async function applyAuto() {
    setApplying(true);
    try {
      const res = await autoMapTender(createClient(), tenderId, { apply: true });
      if (res.failed.length) toast.error(`${res.applied} mapped, ${res.failed.length} failed: ${res.failed[0].message}`);
      else toast.success(`${res.applied} lines mapped; review them under "Needs review".`);
      setPreview(null);
      await load();
      setView("review");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto-map failed.");
    } finally {
      setApplying(false);
    }
  }

  async function confirmSelected() {
    const targets = rows.filter((r) => selected.has(r.id) && rowState(r) === "auto");
    if (!targets.length) {
      toast.info("Select lines that need review first.");
      return;
    }
    setBulkBusy(true);
    let ok = 0;
    let firstErr = "";
    for (let i = 0; i < targets.length; i += 10) {
      await Promise.all(targets.slice(i, i + 10).map(async (r) => {
        try {
          await confirmMapping(createClient(), r.id);
          patchRow(r.id, { status: "confirmed" });
          ok++;
        } catch (e) {
          if (!firstErr) firstErr = e instanceof Error ? e.message : "Failed";
        }
      }));
    }
    setBulkBusy(false);
    setSelected(new Set());
    if (firstErr) toast.error(`${ok} confirmed, ${targets.length - ok} failed: ${firstErr}`);
    else toast.success(`${ok} lines confirmed`);
  }

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const toggleAll = () => setSelected(allVisibleSelected ? new Set() : new Set(visible.map((r) => r.id)));
  const toggleOne = (id: string) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });
  const selectedReview = rows.filter((r) => selected.has(r.id) && rowState(r) === "auto").length;

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-border px-6 py-14 text-center text-sm">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={() => void load()}>Retry</Button>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border px-6 py-14 text-center text-sm text-muted-foreground">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-muted-foreground/50" />
        <p className="font-medium text-foreground">This tender has no BOQ lines yet</p>
        <p className="mt-1">Add or import lines in the Tender BOQ tab, then come back to map them to BOQ items.</p>
      </div>
    );
  }

  const lineCov = coverage.total ? coverage.mapped / coverage.total : 0;
  const valueCov = coverage.value ? coverage.mappedValue / coverage.value : 0;

  return (
    <div className="space-y-4">
      {isLocked && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          The tender BOQ is locked; mappings can be viewed but not changed.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Lines mapped" value={pct(lineCov)} sub={`${coverage.mapped} of ${coverage.total}`} />
        <Stat label="Value mapped" value={pct(valueCov)} sub={`${fmt(coverage.mappedValue)} of ${fmt(coverage.value)}`} />
        <Stat label="Confirmed" value={String(coverage.confirmed)} tone="text-green-700" />
        <Stat label="Needs review" value={String(coverage.auto)} tone="text-amber-700" />
        <Stat label="Unmapped" value={String(coverage.unmapped)} />
        <Stat label="Rejected" value={String(coverage.rejected)} tone="text-red-700" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {([["unmapped", "Unmapped"], ["review", "Needs review"], ["all", "All"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={cn("rounded-md px-3 py-1 text-xs font-medium", view === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code, description, location…"
            className="h-8 w-64 rounded-lg border border-input bg-transparent pl-7 pr-2 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={!canEdit || bulkBusy || selectedReview === 0} onClick={() => void confirmSelected()}>
            {bulkBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Confirm selected{selectedReview ? ` (${selectedReview})` : ""}
          </Button>
          <Button size="sm" disabled={!canEdit || previewing} onClick={() => void runPreview()}>
            {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            Auto-map
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="w-8 px-2 py-2"><Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all" /></th>
              <th className="px-2 py-2 font-medium">Item code</th>
              <th className="px-2 py-2 font-medium">Description</th>
              <th className="px-2 py-2 font-medium">Unit</th>
              <th className="px-2 py-2 text-right font-medium">Qty</th>
              <th className="px-2 py-2 text-right font-medium">Amount</th>
              <th className="px-2 py-2 font-medium">Location</th>
              <th className="px-2 py-2 font-medium">BOQ item</th>
              <th className="px-2 py-2 font-medium">Status</th>
              <th className="px-2 py-2 text-right font-medium">Score</th>
              <th className="px-2 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-muted-foreground">
                  {view === "all" && !search ? "No lines." : "No lines match this view."}
                  {view !== "all" && (
                    <button className="ml-2 text-primary underline" onClick={() => { setView("all"); setSearch(""); }}>Show all</button>
                  )}
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const state = rowState(r);
              const ui = STATE_UI[state];
              const isBusy = busy.has(r.id);
              const sug = suggestions.get(r.id);
              const isAssembly = !!r.assemblyId && !r.workItemId;
              return (
                <Fragment key={r.id}>
                  <tr className="hover:bg-muted/30">
                    <td className="px-2 py-1.5"><Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggleOne(r.id)} aria-label="Select line" /></td>
                    <td className="whitespace-nowrap px-2 py-1.5 font-mono">{r.itemCode}</td>
                    <td className="max-w-[320px] px-2 py-1.5"><span className="line-clamp-2">{r.description}</span></td>
                    <td className="px-2 py-1.5">{r.unit}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.quantity)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(r.amount)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">{[r.buildingCode, r.level].filter(Boolean).join(" / ") || "—"}</td>
                    <td className="max-w-[240px] px-2 py-1.5">
                      {r.workItem ? (
                        <span className="line-clamp-2"><span className="font-mono">{r.workItem.code}</span> {r.workItem.description}</span>
                      ) : isAssembly ? (
                        <span className="text-muted-foreground">Priced from assembly</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5"><Badge variant="outline" className={cn("text-[10px]", ui.cls)}>{ui.label}</Badge></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{r.score !== null && r.workItemId ? r.score.toFixed(2) : "—"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5">
                      {isBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      ) : (
                        <div className="flex items-center gap-1">
                          {canEdit && !isAssembly && (
                            <Button size="xs" variant="outline" onClick={() => toggleSuggestions(r)}>
                              {expanded === r.id ? <ChevronDown /> : <ChevronRight />} Suggest
                            </Button>
                          )}
                          {canEdit && state === "auto" && (
                            <>
                              <Button size="xs" variant="outline" onClick={() => void act(r, () => confirmMapping(createClient(), r.id), { status: "confirmed" }, "Confirmed")}>Confirm</Button>
                              <Button size="xs" variant="destructive" onClick={() => void act(r, () => rejectMapping(createClient(), r.id), { workItemId: null, workItem: null, status: "rejected", score: null }, "Rejected")}>Reject</Button>
                            </>
                          )}
                          {canEdit && (r.workItemId || r.status) && (
                            <Button
                              size="xs"
                              variant="ghost"
                              title="Clear mapping and review state"
                              onClick={() => void act(r, () => clearMapping(createClient(), r.id), { workItemId: null, workItem: null, status: null, score: null }, "Cleared")}
                            >
                              <X /> Clear
                            </Button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                  {expanded === r.id && (
                    <tr className="bg-muted/20">
                      <td />
                      <td colSpan={10} className="px-2 py-2">
                        {sug === "loading" || sug === undefined ? (
                          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding candidates…</div>
                        ) : sug === "error" ? (
                          <div className="flex items-center gap-2 text-destructive">
                            Could not load suggestions.
                            <Button size="xs" variant="outline" onClick={() => void loadSuggestions(r)}>Retry</Button>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {sug.length === 0 && <p className="text-muted-foreground">No close match in the BOQ item library.</p>}
                            {sug.map((s) => {
                              const w = candById.get(s.workItemId);
                              return (
                                <div key={s.workItemId} className="flex flex-wrap items-center gap-2">
                                  <Badge variant="outline" className="tabular-nums">{s.score.toFixed(2)}</Badge>
                                  <span className="font-mono">{w?.code ?? "—"}</span>
                                  <span className="max-w-[420px] truncate">{w ? w.name || w.description : s.workItemId}</span>
                                  <span className="text-muted-foreground">{s.reasons.join(" · ")}</span>
                                  <Button
                                    size="xs"
                                    className="ml-auto"
                                    disabled={r.workItemId === s.workItemId && state !== "auto"}
                                    onClick={() => void assign(r, s.workItemId, s.score)}
                                  >
                                    Accept
                                  </Button>
                                </div>
                              );
                            })}
                            <Button size="xs" variant="outline" onClick={() => { void ensureCandidates(); setPickerFor(r); }}>
                              <Search /> Search other…
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Showing {visible.length} of {rows.length} lines. Lines priced from an assembly cannot also be mapped to a BOQ item.
      </p>

      <WorkItemPicker
        key={pickerFor?.id ?? "closed"}
        row={pickerFor}
        items={candidates}
        onClose={() => setPickerFor(null)}
        onPick={(w) => {
          const r = pickerFor;
          setPickerFor(null);
          if (r) void assign(r, w.id, null);
        }}
      />

      <Dialog open={!!preview} onOpenChange={(o) => { if (!o && !applying) setPreview(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Auto-map preview</DialogTitle>
            <DialogDescription>
              {preview?.considered ?? 0} unmapped, unreviewed lines looked at. Nothing is written until you apply; applied matches land in &quot;Needs review&quot;.
            </DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Auto (clear winner)" value={String(preview.auto)} tone="text-green-700" />
                <Stat label="Review manually" value={String(preview.review)} tone="text-amber-700" />
                <Stat label="No match" value={String(preview.none)} />
              </div>
              {preview.mapped.length > 0 ? (
                <div className="max-h-72 overflow-auto rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-muted text-left">
                      <tr>
                        <th className="px-2 py-1.5 font-medium">Line</th>
                        <th className="px-2 py-1.5 font-medium">Proposed BOQ item</th>
                        <th className="px-2 py-1.5 text-right font-medium">Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {preview.mapped.map((m) => {
                        const line = rows.find((r) => r.id === m.lineId);
                        const w = candById.get(m.workItemId);
                        return (
                          <tr key={m.lineId}>
                            <td className="max-w-[300px] px-2 py-1"><span className="font-mono">{line?.itemCode}</span> <span className="line-clamp-1">{line?.description}</span></td>
                            <td className="max-w-[300px] px-2 py-1"><span className="font-mono">{w?.code}</span> {w ? w.name || w.description : ""}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{m.score.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No line has a clear winner. Use Suggest on each line instead.</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={applying} onClick={() => setPreview(null)}>Cancel</Button>
            <Button disabled={applying || !preview || preview.auto === 0} onClick={() => void applyAuto()}>
              {applying && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Apply {preview?.auto ?? 0} matches
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone)}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function WorkItemPicker({ row, items, onClose, onPick }: { row: MappingRow | null; items: WorkItemInput[]; onClose: () => void; onPick: (w: WorkItemInput) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? items.filter((w) => w.code.toLowerCase().includes(t) || (w.name ?? "").toLowerCase().includes(t) || w.description.toLowerCase().includes(t))
      : items;
    return list.slice(0, 100);
  }, [items, q]);
  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose a BOQ item</DialogTitle>
          <DialogDescription className="line-clamp-2">{row ? `${row.itemCode} ${row.description}` : ""}</DialogDescription>
        </DialogHeader>
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search active BOQ items by name or code…"
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
        />
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          {items.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Loading…</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No BOQ item matches.</p>
          ) : (
            results.map((w) => (
              <button key={w.id} onClick={() => onPick(w)} className="flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left text-xs last:border-0 hover:bg-muted">
                <span className="w-28 shrink-0 font-mono">{w.code}</span>
                <span className="flex-1 truncate">{w.name || w.description}</span>
                <span className="shrink-0 text-muted-foreground">{w.unit}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
