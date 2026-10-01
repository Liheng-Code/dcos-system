"use client";

// Copy saved Cost Database lines (whole version or selected lines) into a tender's BOQ.
// Opened from QS → Cost Database (version fixed, choose tender) and from the Tender BOQ
// toolbar (tender fixed, choose version).

import { useEffect, useMemo, useState } from "react";
import { Loader2, Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getTenderMargins,
  getWbsProjectNodes,
  listTendersWithLock,
  type TenderOption,
  type WbsProjectNode,
} from "@/lib/qs/tender-cost-service";
import {
  assignCostDatabaseItemsToBoq,
  assignedRate,
  getCostDatabaseItems,
  listCostDatabases,
  type CostDatabase,
  type CostDatabaseItem,
} from "@/lib/qs/tender-cost-database";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const selectCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
const KEEP = "__keep__";

export interface AssignCostDatabaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Target tender (Tender BOQ toolbar). Omit to let the user pick one. */
  tenderId?: string;
  /** Source version (Cost Database page). Omit to let the user pick one. */
  databaseId?: string;
  /** Lines ticked on the Cost Database page; omitted = all lines start ticked. */
  preselectedItemIds?: string[];
  onAssigned?: (count: number, tenderId: string) => void;
}

// Mounted only while open, so every opening starts clean.
export function AssignCostDatabaseDialog(props: AssignCostDatabaseDialogProps) {
  return props.open ? <AssignCostDatabaseBody {...props} /> : null;
}

function AssignCostDatabaseBody({
  open, onOpenChange, tenderId: fixedTenderId, databaseId: fixedDatabaseId, preselectedItemIds, onAssigned,
}: AssignCostDatabaseDialogProps) {
  const { selectedProject } = useProject();

  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [tenderId, setTenderId] = useState(fixedTenderId ?? "");
  const [databases, setDatabases] = useState<CostDatabase[]>([]);
  const [databaseId, setDatabaseId] = useState(fixedDatabaseId ?? "");
  const [items, setItems] = useState<CostDatabaseItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(!!fixedDatabaseId);
  const [search, setSearch] = useState("");
  // item id → qty input
  const [selected, setSelected] = useState<Map<string, string>>(new Map());

  const [resetQty, setResetQty] = useState(false);
  const [keepMargins, setKeepMargins] = useState(true);
  const [margins, setMargins] = useState({ labor: "0", material: "0" });
  const [levels, setLevels] = useState<WbsProjectNode[]>([]);
  const [buildings, setBuildings] = useState<WbsProjectNode[]>([]);
  const [level, setLevel] = useState(KEEP);
  const [building, setBuilding] = useState(KEEP);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fixedDatabaseId) listCostDatabases().then(setDatabases).catch(() => setDatabases([]));
    if (fixedTenderId) return;
    void listTendersWithLock()
      .catch(() => [] as TenderOption[])
      .then((list) => {
        setTenders(list);
        if (selectedProject?.project_type === "tender") {
          const own = list.find((t) => t.project_id === selectedProject.id && !t.locked);
          if (own) setTenderId(own.id);
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lines of the chosen version; all (or the preselected ones) start ticked at their saved quantity.
  useEffect(() => {
    if (!databaseId) return;
    let cancelled = false;
    getCostDatabaseItems(databaseId)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        const pick = preselectedItemIds ? rows.filter((r) => preselectedItemIds.includes(r.id)) : rows;
        setSelected(new Map(pick.map((r) => [r.id, String(Number(r.quantity))])));
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load saved BOQ"))
      .finally(() => !cancelled && setLoadingItems(false));
    return () => { cancelled = true; };
  }, [databaseId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Target tender's WBS levels/buildings and default margins.
  useEffect(() => {
    if (!tenderId) return;
    void Promise.all([getWbsProjectNodes(tenderId), getTenderMargins(tenderId)])
      .then(([nodes, m]) => {
        setLevels(nodes.levels);
        setBuildings(nodes.buildings);
        setLevel(KEEP);
        setBuilding(KEEP);
        setMargins({ labor: String(m.defaultLaborMarginPct), material: String(m.defaultMaterialMarginPct) });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load tender settings"));
  }, [tenderId]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => r.item_code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.section.toLowerCase().includes(q));
  }, [items, search]);

  const laborPct = parseFloat(margins.labor) || 0;
  const materialPct = parseFloat(margins.material) || 0;
  const qtyOf = (id: string) => (resetQty ? 0 : parseFloat(selected.get(id) ?? "0") || 0);
  const total = items.reduce(
    (s, r) => (selected.has(r.id) ? s + qtyOf(r.id) * assignedRate(r, keepMargins, laborPct, materialPct) : s),
    0
  );

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const r of visible) {
        if (allVisibleSelected) next.delete(r.id);
        else if (!next.has(r.id)) next.set(r.id, String(Number(r.quantity)));
      }
      return next;
    });
  }
  function toggle(r: CostDatabaseItem) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(r.id)) next.delete(r.id);
      else next.set(r.id, String(Number(r.quantity)));
      return next;
    });
  }

  const selectedTender = tenders.find((t) => t.id === tenderId);
  const tenderLocked = !fixedTenderId && !!selectedTender?.locked;

  async function handleAssign() {
    if (!tenderId || selected.size === 0) return;
    setSaving(true);
    try {
      const count = await assignCostDatabaseItemsToBoq({
        tenderId,
        items: items.filter((r) => selected.has(r.id)).map((item) => ({ item, quantity: qtyOf(item.id) })),
        keepMargins,
        labor_margin_pct: laborPct,
        material_margin_pct: materialPct,
        level: level === KEEP ? null : level,
        building_code: building === KEEP ? null : building,
      });
      toast.success(`${count} line${count !== 1 ? "s" : ""} added to Tender BOQ${selectedTender ? ` (${selectedTender.tender_no})` : ""}`);
      onAssigned?.(count, tenderId);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add lines to the Tender BOQ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>{fixedTenderId ? "Assign from Cost Database" : "Assign to Tender BOQ"}</DialogTitle>
          <DialogDescription>
            Copy a saved BOQ — all lines or the ones you tick — into a tender&apos;s BOQ. The saved version itself is not changed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {!fixedDatabaseId && (
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">Saved BOQ</label>
              <select
                value={databaseId}
                onChange={(e) => { setDatabaseId(e.target.value); setItems([]); setSelected(new Map()); setLoadingItems(!!e.target.value); }}
                className={selectCls}
              >
                <option value="">Choose a saved BOQ...</option>
                {databases.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} — {d.item_count} lines · {fmt(Number(d.total_amount))}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!fixedTenderId && (
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium">Target tender</label>
              <select value={tenderId} onChange={(e) => setTenderId(e.target.value)} className={selectCls}>
                <option value="">Choose a tender...</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.locked}>
                    {t.tender_no} — {t.title}{t.locked ? " (locked)" : ""}
                  </option>
                ))}
              </select>
              {tenderLocked && <p className="flex items-center gap-1 text-xs text-amber-700"><Lock className="h-3 w-3" /> Pricing for this tender is locked.</p>}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium">Quantities</label>
            <select value={resetQty ? "reset" : "keep"} onChange={(e) => setResetQty(e.target.value === "reset")} className={selectCls}>
              <option value="keep">Keep saved quantities</option>
              <option value="reset">Reset to 0 (new project)</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Margins</label>
            <select value={keepMargins ? "keep" : "tender"} onChange={(e) => setKeepMargins(e.target.value === "keep")} className={selectCls}>
              <option value="keep">Keep saved margins</option>
              <option value="tender">Apply these margins</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Level</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectCls}>
              <option value={KEEP}>Keep saved level</option>
              <option value="All">All — Unallocated</option>
              {levels.map((l) => <option key={l.id} value={l.wbs_code}>{l.wbs_code} — {l.wbs_name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Building</label>
            <select value={building} onChange={(e) => setBuilding(e.target.value)} className={selectCls}>
              <option value={KEEP}>Keep saved building</option>
              {buildings.map((b) => <option key={b.id} value={b.wbs_code}>{b.wbs_code} — {b.wbs_name}</option>)}
            </select>
          </div>
          {!keepMargins && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium">Labor Margin %</label>
                <input type="number" step="any" value={margins.labor} onChange={(e) => setMargins({ ...margins, labor: e.target.value })} className={selectCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Material Margin %</label>
                <input type="number" step="any" value={margins.material} onChange={(e) => setMargins({ ...margins, material: e.target.value })} className={selectCls} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search lines by code, description or section..." className="pl-8" />
          </div>
          <label className="flex items-center gap-1.5 text-sm">
            <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all lines" disabled={visible.length === 0} />
            Select all
          </label>
        </div>

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
          {loadingItems ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : !databaseId ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Choose a saved BOQ to see its lines.</p>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No lines found.</p>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead className="sticky top-0 z-10 whitespace-nowrap bg-muted text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Section</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2 text-right">Saved Rate</th>
                  <th className="w-24 px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">New Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const isSel = selected.has(r.id);
                  const rate = assignedRate(r, keepMargins, laborPct, materialPct);
                  return (
                    <tr key={r.id} className="whitespace-nowrap border-t border-border">
                      <td className="px-2 py-1.5">
                        <Checkbox checked={isSel} onCheckedChange={() => toggle(r)} aria-label={`Select ${r.item_code}`} />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs">{r.item_code}</td>
                      <td className="w-full max-w-0 px-2 py-1.5"><span className="block truncate" title={r.description}>{r.description}</span></td>
                      <td className="max-w-[180px] truncate px-2 py-1.5 text-muted-foreground" title={r.section}>{r.section}</td>
                      <td className="px-2 py-1.5">{r.unit}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{fmt(Number(r.unit_rate))}</td>
                      <td className="px-2 py-1.5 text-right">
                        {isSel && (resetQty ? <span className="font-mono">0.00</span> : (
                          <input
                            type="number"
                            step="any"
                            value={selected.get(r.id)}
                            onChange={(e) => setSelected((prev) => new Map(prev).set(r.id, e.target.value))}
                            aria-label={`Quantity ${r.item_code}`}
                            className="w-24 rounded border border-border bg-background px-1.5 py-1 text-right text-sm"
                          />
                        ))}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{isSel ? fmt(rate) : ""}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{isSel ? fmt(qtyOf(r.id) * rate) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size} of {items.length} lines selected · Total <span className="font-mono font-medium text-foreground">{fmt(total)}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAssign} disabled={saving || !tenderId || tenderLocked || selected.size === 0}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Add {selected.size} to BOQ
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
