"use client";

// Quick assign: QS Cost Item Library (dwl_v_assembly_costing_summary) → Tender BOQ.
// Used from both sides — the Cost Item Library pushes preselected items (no tenderId),
// the Tender BOQ tab pulls (tenderId fixed, items picked here). Net cost is the
// library's direct installed cost; the tender's own margins apply.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, Lock, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { listTenderBoqItemsByTenderId } from "@/lib/qs/qs-queries";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  assignLibraryItemsToBoq,
  boqUnitRate,
  getBudgetCodes,
  getCostLibraryItems,
  getTenderMargins,
  getWbsProjectNodes,
  listTendersWithLock,
  snapshotFromCostingSummary,
  type TenderOption,
  type BudgetCode,
  type WbsProjectNode,
} from "@/lib/qs/tender-cost-service";

type LibraryItem = Awaited<ReturnType<typeof getCostLibraryItems>>[number];

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const selectCls = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";

export interface AssignLibraryToBoqDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pull direction: the tender is fixed. Omit to let the user pick one. */
  tenderId?: string;
  /** Push direction: assembly ids already chosen in the Cost Item Library. */
  preselectedIds?: string[];
  onAssigned?: (count: number, tenderId: string) => void;
}

// Mounted only while open, so every opening starts from a clean selection.
export function AssignLibraryToBoqDialog(props: AssignLibraryToBoqDialogProps) {
  return props.open ? <AssignLibraryToBoqBody {...props} /> : null;
}

function AssignLibraryToBoqBody({ open, onOpenChange, tenderId: fixedTenderId, preselectedIds, onAssigned }: AssignLibraryToBoqDialogProps) {
  const { selectedProject } = useProject();
  const pushMode = !!preselectedIds;

  const [tenders, setTenders] = useState<TenderOption[]>([]);
  const [tenderId, setTenderId] = useState(fixedTenderId ?? "");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  // assembly id → qty input
  const [selected, setSelected] = useState<Map<string, string>>(() => new Map((preselectedIds ?? []).map((id) => [id, "0"])));

  const [budgetCodes, setBudgetCodes] = useState<BudgetCode[]>([]);
  const [levels, setLevels] = useState<WbsProjectNode[]>([]);
  const [buildings, setBuildings] = useState<WbsProjectNode[]>([]);
  const [existing, setExisting] = useState<{ dwl_assembly_id: string; level: string | null; building_code: string | null }[]>([]);
  const [form, setForm] = useState({ level: "All", building_code: "", budget_code: "", labor_margin_pct: "0", material_margin_pct: "0" });
  const [saving, setSaving] = useState(false);

  // Load the library + tenders once per opening.
  useEffect(() => {
    getCostLibraryItems(pushMode ? preselectedIds : undefined)
      .then(setLibrary)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load the Cost Item Library"))
      .finally(() => setLoadingLibrary(false));
    getBudgetCodes().then(setBudgetCodes).catch(() => setBudgetCodes([]));

    if (fixedTenderId) return;
    void (async () => {
      const list = await listTendersWithLock().catch(() => [] as TenderOption[]);
      setTenders(list);
      // Default to the selected pre-contract project's tender when it's open for pricing.
      if (selectedProject?.project_type === "tender") {
        const own = list.find((t) => t.project_id === selectedProject.id && !t.locked);
        if (own) setTenderId(own.id);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Tender-dependent data: WBS levels/buildings, default margins, what's already in its BOQ.
  useEffect(() => {
    if (!tenderId) return;
    void (async () => {
      try {
        const [nodes, margins, { data: boq }] = await Promise.all([
          getWbsProjectNodes(tenderId),
          getTenderMargins(tenderId),
          listTenderBoqItemsByTenderId(tenderId),
        ]);
        setLevels(nodes.levels);
        setBuildings(nodes.buildings);
        setExisting((boq ?? []) as { dwl_assembly_id: string; level: string | null; building_code: string | null }[]);
        setForm((f) => ({
          ...f,
          level: "All",
          building_code: "",
          labor_margin_pct: String(margins.defaultLaborMarginPct),
          material_margin_pct: String(margins.defaultMaterialMarginPct),
        }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load tender settings");
      }
    })();
  }, [tenderId]);

  const groups = useMemo(() => [...new Set(library.map((r) => r.element_group))].sort(), [library]);
  const visible = useMemo(() => {
    let rows = library;
    if (groupFilter !== "all") rows = rows.filter((r) => r.element_group === groupFilter);
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter((r) => r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    return rows;
  }, [library, groupFilter, search]);

  const alreadyInBoq = (id: string) =>
    existing.some((e) => e.dwl_assembly_id === id && (e.level ?? "All") === form.level && (e.building_code ?? "") === (form.building_code || "BA"));

  const laborPct = parseFloat(form.labor_margin_pct) || 0;
  const materialPct = parseFloat(form.material_margin_pct) || 0;
  const priced = useMemo(() => {
    const byId = new Map(library.map((r) => [r.assembly_id, r]));
    return [...selected.entries()].flatMap(([id, qty]) => {
      const lib = byId.get(id);
      if (!lib) return [];
      const snap = snapshotFromCostingSummary(lib);
      // tender_boq_items.unit_rate is stored at 2 dp; preview the amount that will be saved.
      const rate = Math.round(boqUnitRate(snap.labor_net_cost, laborPct, snap.material_net_cost, materialPct) * 100) / 100;
      return [{ id, qty: parseFloat(qty) || 0, rate }];
    });
  }, [selected, library, laborPct, materialPct]);
  const total = priced.reduce((s, p) => s + p.qty * p.rate, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else next.set(id, "0");
      return next;
    });
  }

  const selectedTender = tenders.find((t) => t.id === tenderId);
  const tenderLocked = !fixedTenderId && !!selectedTender?.locked;

  async function handleAssign() {
    if (!tenderId || selected.size === 0) return;
    setSaving(true);
    try {
      const bc = budgetCodes.find((c) => c.code === form.budget_code);
      const count = await assignLibraryItemsToBoq({
        tenderId,
        items: [...selected.entries()].map(([assemblyId, qty]) => ({ assemblyId, quantity: parseFloat(qty) || 0 })),
        level: form.level,
        building_code: form.building_code,
        budget_code_id: bc?.id ?? null,
        budget_code: bc?.code ?? null,
        labor_margin_pct: laborPct,
        material_margin_pct: materialPct,
      });
      toast.success(`${count} item${count !== 1 ? "s" : ""} added to Tender BOQ${selectedTender ? ` (${selectedTender.tender_no})` : ""}`);
      onAssigned?.(count, tenderId);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add items to the Tender BOQ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="w-[96vw] max-w-[96vw] sm:max-w-7xl">
        <DialogHeader>
          <DialogTitle>{pushMode ? "Assign to Tender BOQ" : "Assign from Cost Library"}</DialogTitle>
          <DialogDescription>
            Items are priced at the Cost Item Library&apos;s direct installed cost (labor / material + equipment).
            The tender&apos;s margins apply; library overhead, risk, profit and VAT are not carried.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {!fixedTenderId && (
            <div className="col-span-2 space-y-1 md:col-span-3">
              <label className="text-xs font-medium">Tender</label>
              <select value={tenderId} onChange={(e) => setTenderId(e.target.value)} className={selectCls}>
                <option value="">Choose a tender...</option>
                {tenders.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.locked}>
                    {t.tender_no} — {t.title}{t.locked ? " (locked)" : ""}
                  </option>
                ))}
              </select>
              {tenderLocked && (
                <p className="flex items-center gap-1 text-xs text-amber-700"><Lock className="h-3 w-3" /> Pricing for this tender is locked.</p>
              )}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium">Level</label>
            <select value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className={selectCls} disabled={!tenderId}>
              <option value="All">All — Unallocated</option>
              {levels.map((l) => <option key={l.id} value={l.wbs_code}>{l.wbs_code} — {l.wbs_name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Building</label>
            <select value={form.building_code} onChange={(e) => setForm({ ...form, building_code: e.target.value })} className={selectCls} disabled={!tenderId}>
              <option value="">Select...</option>
              {buildings.map((b) => <option key={b.id} value={b.wbs_code}>{b.wbs_code} — {b.wbs_name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Budget Code</label>
            <select value={form.budget_code} onChange={(e) => setForm({ ...form, budget_code: e.target.value })} className={selectCls}>
              <option value="">Select...</option>
              {budgetCodes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Labor Margin %</label>
            <input type="number" step="any" value={form.labor_margin_pct} onChange={(e) => setForm({ ...form, labor_margin_pct: e.target.value })} className={selectCls} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Material Margin %</label>
            <input type="number" step="any" value={form.material_margin_pct} onChange={(e) => setForm({ ...form, material_margin_pct: e.target.value })} className={selectCls} />
          </div>
        </div>

        {!pushMode && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search cost items by code or name..." className="pl-8" />
            </div>
            <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="h-9 rounded-lg border border-border bg-background px-2.5 text-sm">
              <option value="all">All Categories</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
        )}

        <div className="max-h-[45vh] overflow-auto rounded-lg border border-border">
          {loadingLibrary ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No cost items found.</p>
          ) : (
            <table className="w-full min-w-[760px] text-sm">
              <thead className="sticky top-0 z-10 whitespace-nowrap bg-muted text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="w-8 px-2 py-2" />
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Description</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2 text-right">Installed Cost</th>
                  <th className="w-24 px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const isSel = selected.has(r.assembly_id);
                  const noCost = !(Number(r.direct_installed_cost) > 0);
                  const p = priced.find((x) => x.id === r.assembly_id);
                  return (
                    <tr key={r.assembly_id} className="whitespace-nowrap border-t border-border">
                      <td className="px-2 py-1.5">
                        <Checkbox checked={isSel} disabled={noCost && !isSel} onCheckedChange={() => toggle(r.assembly_id)} aria-label={`Select ${r.code}`} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{r.code}</td>
                      <td className="max-w-0 w-full px-2 py-1.5">
                        <span className="block truncate" title={r.description}>{r.description.split(" — ")[0]}</span>
                        <span className="flex gap-1">
                          {noCost && <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700"><AlertTriangle className="mr-0.5 h-2.5 w-2.5" />No cost</Badge>}
                          {tenderId && alreadyInBoq(r.assembly_id) && <Badge variant="outline" className="text-[10px]">Already in BOQ</Badge>}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">{r.unit}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{fmt(Number(r.direct_installed_cost) || 0)}</td>
                      <td className="px-2 py-1.5 text-right">
                        {isSel && (
                          <input
                            type="number"
                            step="any"
                            value={selected.get(r.assembly_id)}
                            onChange={(e) => setSelected((prev) => new Map(prev).set(r.assembly_id, e.target.value))}
                            aria-label={`Quantity ${r.code}`}
                            className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-sm"
                          />
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-mono">{p ? fmt(p.rate) : ""}</td>
                      <td className="px-2 py-1.5 text-right font-mono">{p ? fmt(p.qty * p.rate) : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {selected.size} selected · Total <span className="font-mono font-medium text-foreground">{fmt(total)}</span>
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
