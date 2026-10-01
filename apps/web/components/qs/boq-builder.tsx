"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Loader2, Plus, ShoppingCart, Trash2, CheckCircle2, AlertTriangle, Circle, Package, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  type QsBoqItem,
  type QsBoqSection,
  type QsBoq as QsBoqHeader,
  type QsCostItem,
  createBoqItem,
  createBoqSection,
  deleteBoqItem,
  deleteBoqSection,
  getBoqItems,
  getBoqSections,
  getCostItems,
  updateBoqBaselineStatus,
} from "@/lib/qs/qs-service";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { RaisePrFromBoqDialog } from "@/components/procurement/raise-pr-from-boq-dialog";
import { BoqLockDialog } from "@/components/qs/boq-lock-dialog";

const fmt = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type ItemForm = {
  description: string;
  unit: string;
  quantity: string;
  unit_rate: string;
  cost_item_id: string | null;
  libSearch: string;
  showLib: boolean;
  saving: boolean;
};

interface Props {
  projectId: string;
  boqId?: string;
  boq?: QsBoqHeader | null;
}

export function BoqBuilder({ projectId, boqId }: Props) {
  const { can } = useQsPermissions();

  const [sections, setSections]         = useState<QsBoqSection[]>([]);
  const [itemsMap, setItemsMap]         = useState<Record<string, QsBoqItem[]>>({});
  const [procurementMap, setProcurementMap] = useState<Record<string, { requisitioned: number; ordered: number; delivered: number; remaining: number; po_ids: string | null }>>({});
  const [expanded, setExpanded]         = useState<Set<string>>(new Set());
  const [library, setLibrary]           = useState<QsCostItem[]>([]);
  const [loading, setLoading]           = useState(true);

  const [lockDialogOpen, setLockDialogOpen] = useState(false);
  const [showAddSec, setShowAddSec] = useState(false);
  const [secTitle, setSecTitle]     = useState("");
  const [addingSec, setAddingSec]   = useState(false);

  const [forms, setForms] = useState<Record<string, ItemForm>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const [secs, lib, procRes] = await Promise.all([
        getBoqSections(projectId, boqId),
        getCostItems(),
        supabase.from("qs_v_boq_requisition_status").select("boq_item_id, requisitioned_quantity, ordered_quantity, delivered_quantity, remaining_quantity, po_ids").eq("project_id", projectId),
      ]);
      setSections(secs);
      setLibrary(lib);
      const procmap: Record<string, { requisitioned: number; ordered: number; delivered: number; remaining: number; po_ids: string | null }> = {};
      if (procRes.data) {
        for (const row of procRes.data) {
          procmap[row.boq_item_id] = {
            requisitioned: row.requisitioned_quantity,
            ordered:       row.ordered_quantity,
            delivered:     row.delivered_quantity,
            remaining:     row.remaining_quantity,
            po_ids:        row.po_ids,
          };
        }
      }
      setProcurementMap(procmap);
      const maps: Record<string, QsBoqItem[]> = {};
      await Promise.all(secs.map(async (s) => { maps[s.id] = await getBoqItems(projectId, s.id, boqId); }));
      setItemsMap(maps);
      if (secs.length > 0) setExpanded(new Set([secs[0].id]));
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to load BOQ"); }
    finally { setLoading(false); }
  }, [projectId, boqId]);

  useEffect(() => { void Promise.resolve().then(() => load()); }, [load]);

  const totalBudget = Object.values(itemsMap).flat()
    .reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  const allItems = Object.values(itemsMap).flat();
  const baselineStatus = allItems.find((item) => item.baseline_status)?.baseline_status
    ?? sections.find((section) => section.baseline_status)?.baseline_status
    ?? "draft";
  const baselineLocked = baselineStatus === "locked";

  function toggle(id: string) {
    setExpanded((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleAddSection() {
    if (!secTitle.trim()) return;
    setAddingSec(true);
    try {
      const s = await createBoqSection(projectId, secTitle.trim(), undefined, boqId);
      setSections((p) => [...p, s]);
      setItemsMap((p) => ({ ...p, [s.id]: [] }));
      setExpanded((p) => new Set([...p, s.id]));
      setSecTitle(""); setShowAddSec(false);
      toast.success("Section added");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to add section"); }
    finally { setAddingSec(false); }
  }

  async function handleDeleteSection(id: string) {
    if ((itemsMap[id]?.length ?? 0) > 0) { toast.error("Remove all items first."); return; }
    try {
      await deleteBoqSection(id);
      setSections((p) => p.filter((s) => s.id !== id));
      setItemsMap((p) => { const n = { ...p }; delete n[id]; return n; });
      toast.success("Section removed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to remove section"); }
  }

  function initForm(sid: string) {
    setForms((p) => ({
      ...p,
      [sid]: { description: "", unit: "", quantity: "", unit_rate: "", cost_item_id: null, libSearch: "", showLib: false, saving: false },
    }));
  }

  function upd(sid: string, patch: Partial<ItemForm>) {
    setForms((p) => ({ ...p, [sid]: { ...p[sid], ...patch } }));
  }

  function pickLib(sid: string, item: QsCostItem) {
    upd(sid, {
      description: item.description,
      unit: item.unit,
      unit_rate: String(item.base_rate),
      cost_item_id: item.id,
      showLib: false,
      libSearch: "",
    });
  }

  async function handleAddItem(sid: string) {
    const f = forms[sid];
    if (!f || !f.description.trim() || !f.unit.trim()) { toast.error("Description and unit are required."); return; }
    upd(sid, { saving: true });
    try {
      const item = await createBoqItem({
        project_id: projectId,
        boq_section_id: sid,
        description: f.description.trim(),
        unit: f.unit.trim(),
        quantity: parseFloat(f.quantity) || 0,
        unit_rate: parseFloat(f.unit_rate) || 0,
        cost_item_id: f.cost_item_id,
      });
      setItemsMap((p) => ({ ...p, [sid]: [...(p[sid] ?? []), item] }));
      setForms((p) => { const n = { ...p }; delete n[sid]; return n; });
      toast.success("Item added");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to add item");
      upd(sid, { saving: false });
    }
  }

  async function handleDeleteItem(sid: string, itemId: string) {
    try {
      await deleteBoqItem(itemId);
      setItemsMap((p) => ({ ...p, [sid]: (p[sid] ?? []).filter((i) => i.id !== itemId) }));
      toast.success("Item removed");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Failed to remove item"); }
  }

  async function handleBaselineStatus(status: "approved" | "locked" | "revised") {
    try {
      await updateBoqBaselineStatus(projectId, status, boqId);
      await load();
      toast.success(status === "approved" ? "BOQ baseline approved" : status === "locked" ? "BOQ baseline locked" : "BOQ reopened for revision");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update BOQ baseline");
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500">
            {sections.length} section{sections.length !== 1 ? "s" : ""} ·{" "}
            {Object.values(itemsMap).flat().length} items
          </p>
          <p className="text-lg font-semibold">
            Total BOQ: <span className="text-emerald-600">${fmt(totalBudget)}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn(
            "rounded-full px-2.5 py-1 text-[10px] font-medium capitalize",
            baselineStatus === "locked" ? "bg-slate-900 text-white" :
            baselineStatus === "approved" ? "bg-emerald-100 text-emerald-700" :
            baselineStatus === "revised" ? "bg-amber-100 text-amber-700" :
            "bg-slate-100 text-slate-600",
          )}>
            {baselineStatus} baseline
          </span>
          {baselineStatus === "draft" && allItems.length > 0 && can("boq", "approve") && (
            <Button size="sm" variant="outline" onClick={() => void handleBaselineStatus("approved")}>Approve BOQ</Button>
          )}
          {(baselineStatus === "approved" || baselineStatus === "revised") && can("boq", "approve") && (
            <Button
              size="sm"
              variant="outline"
              disabled={!boqId}
              title={!boqId ? "Open a specific BOQ to lock its baseline" : undefined}
              onClick={() => setLockDialogOpen(true)}
            >
              {baselineStatus === "revised" ? "Re-lock Baseline" : "Lock Baseline"}
            </Button>
          )}
          {baselineStatus === "locked" && can("boq", "approve") && (
            <Button size="sm" variant="outline" onClick={() => void handleBaselineStatus("revised")}>Open Revision</Button>
          )}
          {can("boq", "can_create") && (
            <Button size="sm" onClick={() => setShowAddSec(true)} disabled={baselineLocked} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Section
            </Button>
          )}
        </div>
      </div>

      {/* Add section inline */}
      {showAddSec && (
        <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <input
            autoFocus
            value={secTitle}
            onChange={(e) => setSecTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void handleAddSection(); if (e.key === "Escape") setShowAddSec(false); }}
            placeholder="Section title, e.g. Concrete Works"
            className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button size="sm" onClick={handleAddSection} disabled={addingSec || !secTitle.trim()}>
            {addingSec ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowAddSec(false)}>Cancel</Button>
        </div>
      )}

      {/* Empty state */}
      {sections.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-center">
          <BookOpen className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No BOQ sections yet. Add your first section to begin.</p>
        </div>
      )}

      {/* Sections */}
      {sections.map((section) => {
        const items = itemsMap[section.id] ?? [];
        const sectionTotal = items.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
        const isExpanded = expanded.has(section.id);
        const form = forms[section.id];
        const filteredLib = form
          ? library.filter((li) =>
              !form.libSearch ||
              li.description.toLowerCase().includes(form.libSearch.toLowerCase()) ||
              li.code.includes(form.libSearch),
            ).slice(0, 20)
          : [];

        return (
          <div key={section.id} className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
            {/* Section header */}
            <div
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-slate-50/60"
              onClick={() => toggle(section.id)}
            >
              {isExpanded
                ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
              <span className="flex-1 text-sm font-semibold text-slate-800">{section.title}</span>
              <span className="text-xs text-slate-400">{items.length} item{items.length !== 1 ? "s" : ""}</span>
              <span className="min-w-[7rem] text-right text-sm font-medium text-slate-700">${fmt(sectionTotal)}</span>
              {(() => {
                const allFulfilled = items.length > 0 && items.every(i => {
                  const p = procurementMap[i.id];
                  return p && p.remaining <= 0;
                });
                if (allFulfilled) return null;
                return (
                <RaisePrFromBoqDialog
                  projectId={projectId}
                  boqItemIds={items.map((i) => i.id)}
                  triggerLabel="Raise PR"
                  triggerSize="sm"
                  triggerClassName="ml-2 gap-1 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                />
                );
              })()}
              {can("boq", "delete") && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (!baselineLocked) void handleDeleteSection(section.id); }}
                  disabled={baselineLocked}
                  className="ml-2 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {isExpanded && (
              <div className="border-t border-slate-100">
                {/* Items table */}
                {items.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400">
                          <th className="w-8 px-3 py-2 text-left">#</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="w-14 px-3 py-2 text-center">Unit</th>
                          <th className="w-[72px] px-3 py-2 text-right">Qty</th>
                          <th className="w-[88px] px-3 py-2 text-right">Rate</th>
                          <th className="w-[88px] px-3 py-2 text-right">Total</th>
                          <th className="w-[72px] px-3 py-2 text-right">PR</th>
                          <th className="w-[72px] px-3 py-2 text-right">PO</th>
                          <th className="w-[72px] px-3 py-2 text-right">Dlv</th>
                          <th className="w-[72px] px-3 py-2 text-right">Rem</th>
                          <th className="w-24 px-3 py-2 text-center">Status</th>
                          <th className="px-3 py-2 text-left">PO</th>
                          <th className="w-20 px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => {
                          const proc = procurementMap[item.id];
                          const reqd      = proc?.requisitioned ?? 0;
                          const ordered   = proc?.ordered ?? 0;
                          const delivered = proc?.delivered ?? 0;
                          const remaining = proc?.remaining ?? Number(item.quantity);
                          const boqQty    = Number(item.quantity);
                          const isFulfilled = remaining <= 0;
                          let Badge: React.ReactNode;
                          if (isFulfilled && delivered >= ordered && ordered > 0) {
                            Badge = <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700"><CheckCircle2 className="h-3 w-3" /> Delivered</span>;
                          } else if (isFulfilled && ordered > 0) {
                            Badge = <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700"><Package className="h-3 w-3" /> Ordered</span>;
                          } else if (isFulfilled) {
                            Badge = <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"><CheckCircle2 className="h-3 w-3" /> Fulfilled</span>;
                          } else if (reqd > 0) {
                            Badge = <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"><AlertTriangle className="h-3 w-3" /> Partial</span>;
                          } else {
                            Badge = <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700"><Circle className="h-3 w-3" /> Open</span>;
                          }
                          return (
                          <tr key={item.id} className={cn(
                            "border-t border-slate-100 transition-colors",
                            isFulfilled ? "opacity-50" : "hover:bg-slate-50/40",
                          )}>
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="max-w-[200px] px-3 py-2 text-slate-700">
                              {item.description}
                              {item.is_provisional && <span className="ml-1 text-[9px] text-amber-500">(P)</span>}
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500">{item.unit}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{boqQty.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmt(Number(item.unit_rate))}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-700">${fmt(Number(item.total_amount ?? 0))}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{reqd > 0 ? reqd.toLocaleString() : "—"}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{ordered > 0 ? ordered.toLocaleString() : "—"}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{delivered > 0 ? delivered.toLocaleString() : "—"}</td>
                            <td className={cn(
                              "px-3 py-2 text-right font-medium",
                              isFulfilled ? "text-slate-400" : remaining < boqQty ? "text-amber-600" : "text-emerald-600",
                            )}>
                              {remaining.toLocaleString()}
                            </td>
                            <td className="px-3 py-2 text-center">{Badge}</td>
                            <td className="max-w-[120px] truncate px-3 py-2 text-[10px] text-slate-400">
                              {proc?.po_ids || "—"}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-0.5">
                                {!isFulfilled ? (
                                  <RaisePrFromBoqDialog
                                    projectId={projectId}
                                    boqItemIds={[item.id]}
                                    triggerLabel=""
                                    triggerSize="sm"
                                    triggerClassName="h-7 w-7 p-0 justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                  />
                                ) : ordered > 0 ? (
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded text-[10px] text-slate-300 cursor-not-allowed" title={"Covered by PO"}>
                                    <Package className="h-3.5 w-3.5" />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-7 w-7 items-center justify-center rounded text-[10px] text-slate-300 cursor-not-allowed" title={"Fully requisitioned"}>
                                    <ShoppingCart className="h-3.5 w-3.5" />
                                  </span>
                                )}
                                {reqd > 0 && ordered === 0 && (
                                  <a
                                    href={`/dashboard/procurement/po/new?boq_item_ids=${item.id}`}
                                    className="inline-flex h-7 w-7 items-center justify-center rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                                    title="Create PO from this BOQ item"
                                  >
                                    <FileText className="h-3.5 w-3.5" />
                                  </a>
                                )}
                                {can("boq", "delete") && (
                                  <button
                                    onClick={() => { if (!baselineLocked) void handleDeleteItem(section.id, item.id); }}
                                    disabled={baselineLocked}
                                    className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Add item form */}
                {form ? (
                  <div className="space-y-2 border-t border-slate-100 bg-slate-50/40 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">New Item</p>

                    {/* Rate library search */}
                    <div className="relative">
                      <input
                        value={form.libSearch}
                        onChange={(e) => upd(section.id, { libSearch: e.target.value, showLib: e.target.value.length > 0 })}
                        onFocus={() => upd(section.id, { showLib: true })}
                        onBlur={() => setTimeout(() => upd(section.id, { showLib: false }), 150)}
                        placeholder="Search rate library (optional)…"
                        className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                      {form.showLib && filteredLib.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {filteredLib.map((li) => (
                            <button
                              key={li.id}
                              onMouseDown={(e) => { e.preventDefault(); pickLib(section.id, li); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-primary/5"
                            >
                              <span className="w-20 shrink-0 font-mono text-[10px] text-slate-400">{li.code}</span>
                              <span className="flex-1 text-slate-700">{li.description}</span>
                              <span className="text-slate-400">{li.unit}</span>
                              <span className="font-medium text-emerald-600">${fmt(li.base_rate)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <input
                        value={form.description}
                        onChange={(e) => upd(section.id, { description: e.target.value })}
                        placeholder="Description *"
                        className="col-span-5 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                      <input
                        value={form.unit}
                        onChange={(e) => upd(section.id, { unit: e.target.value })}
                        placeholder="Unit *"
                        className="col-span-2 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                      <input
                        value={form.quantity}
                        onChange={(e) => upd(section.id, { quantity: e.target.value })}
                        type="number" min="0" step="any"
                        placeholder="Qty"
                        className="col-span-2 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                      <input
                        value={form.unit_rate}
                        onChange={(e) => upd(section.id, { unit_rate: e.target.value })}
                        type="number" min="0" step="any"
                        placeholder="Rate"
                        className="col-span-3 rounded-lg border border-border bg-white px-3 py-2 text-xs outline-none focus:border-primary"
                      />
                    </div>

                    {(parseFloat(form.quantity) > 0 || parseFloat(form.unit_rate) > 0) && (
                      <p className="text-xs text-slate-500">
                        Total:{" "}
                        <span className="font-semibold text-emerald-600">
                          ${fmt((parseFloat(form.quantity) || 0) * (parseFloat(form.unit_rate) || 0))}
                        </span>
                      </p>
                    )}

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => void handleAddItem(section.id)}
                        disabled={form.saving || !form.description.trim()}
                        className="gap-1"
                      >
                        {form.saving
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Plus className="h-3.5 w-3.5" />}
                        Add Item
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setForms((p) => { const n = { ...p }; delete n[section.id]; return n; })}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-center border-t border-slate-100 p-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => initForm(section.id)}
                      disabled={baselineLocked}
                      className="gap-1.5 text-xs"
                    >
                      <Plus className="h-3 w-3" /> Add Item
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {lockDialogOpen && boqId && (
        <BoqLockDialog
          projectId={projectId}
          boqId={boqId}
          canApprove={can("boq", "approve")}
          onClose={() => setLockDialogOpen(false)}
          onLocked={() => void load()}
        />
      )}
    </div>
  );
}
