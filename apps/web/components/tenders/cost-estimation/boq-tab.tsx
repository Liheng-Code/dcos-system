"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { Loader2, Plus, Trash2, Upload, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getBoqItemsGrouped, createBoqItem, deleteBoqItem, getBudgetCodes,
  type BoqItemsGrouped, type BudgetCode,
} from "@/lib/tender-cost-service";
import { TenderCostImportDialog } from "./tender-cost-import-dialog";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function BoqTab({ tenderId }: { tenderId: string }) {
  const [grouped, setGrouped] = useState<BoqItemsGrouped | null>(null);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const [form, setForm] = useState({
    budget_code: "", section: "", sub_section: "", level: "All", description: "", unit: "ea",
    quantity: "0", labor_net_cost: "0", labor_margin_pct: "0", material_net_cost: "0", material_margin_pct: "0",
  });

  const { can } = useTenderPermissions();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, codes] = await Promise.all([getBoqItemsGrouped(tenderId), getBudgetCodes()]);
      setGrouped(g);
      setBudgetCodes(codes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load BOQ");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      const bc = budgetCodes.find((c) => c.code === form.budget_code);
      await createBoqItem({
        tender_id: tenderId,
        section: form.section,
        item_code: `${form.budget_code || "MISC"}.${Date.now().toString().slice(-6)}`,
        description: form.description,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        budget_code_id: bc?.id ?? null,
        level: form.level,
        sub_section: form.sub_section || null,
        labor_net_cost: parseFloat(form.labor_net_cost) || 0,
        labor_margin_pct: parseFloat(form.labor_margin_pct) || 0,
        material_net_cost: parseFloat(form.material_net_cost) || 0,
        material_margin_pct: parseFloat(form.material_margin_pct) || 0,
      });
      toast.success("BOQ item added");
      setShowForm(false);
      setForm({ budget_code: "", section: "", sub_section: "", level: "All", description: "", unit: "ea", quantity: "0", labor_net_cost: "0", labor_margin_pct: "0", material_net_cost: "0", material_margin_pct: "0" });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add item");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteBoqItem(id);
      toast.success("Item deleted");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  function toggle(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{grouped?.groups.reduce((n, g) => n + g.budgetCodes.reduce((m, b) => m + b.sections.reduce((k, s) => k + s.subSections.reduce((j, ss) => j + ss.items.length, 0), 0), 0), 0) ?? 0} item(s) · Direct Works ${fmt(grouped?.grandTotal ?? 0)}</p>
        <div className="flex gap-2">
          {can("tender_boq", "can_create") && (
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          )}
          {can("tender_boq", "can_create") && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" /> Add Item
          </Button>
          )}
        </div>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">Budget Code *</label>
                <select value={form.budget_code} onChange={(e) => setForm({ ...form, budget_code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {budgetCodes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Level</label><input value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="e.g. 02.GF or All" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Section</label><input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Sub Section</label><input value={form.sub_section} onChange={(e) => setForm({ ...form, sub_section: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Quantity</label><input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Labor Net Cost</label><input type="number" value={form.labor_net_cost} onChange={(e) => setForm({ ...form, labor_net_cost: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Labor Margin %</label><input type="number" value={form.labor_margin_pct} onChange={(e) => setForm({ ...form, labor_margin_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Material Net Cost</label><input type="number" value={form.material_net_cost} onChange={(e) => setForm({ ...form, material_net_cost: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Material Margin %</label><input type="number" value={form.material_margin_pct} onChange={(e) => setForm({ ...form, material_margin_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.description.trim() || !form.budget_code}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {(!grouped || grouped.groups.length === 0) ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No BOQ items yet — import your Raw Data spreadsheet or add items manually</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Item</th>
                <th className="text-left px-3 py-2 font-medium">Unit</th>
                <th className="text-right px-3 py-2 font-medium">Qty</th>
                <th className="text-right px-3 py-2 font-medium">Rate</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grouped.groups.map((g) => (
                <Fragment key={`g-${g.codeLetter}`}>
                  <tr className="bg-slate-100 cursor-pointer" onClick={() => toggle(g.codeLetter)}>
                    <td className="px-3 py-2 font-semibold flex items-center gap-1" colSpan={4}>
                      {collapsed.has(g.codeLetter) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {g.codeLetter} — {g.groupName}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">${fmt(g.subtotal)}</td>
                    <td />
                  </tr>
                  {!collapsed.has(g.codeLetter) && g.budgetCodes.map((bc) => (
                    <Fragment key={`bc-${bc.budgetCodeId}-${bc.code}`}>
                      <tr className="bg-slate-50">
                        <td className="px-3 py-1.5 pl-6 font-medium text-xs" colSpan={4}>{bc.code} — {bc.description}</td>
                        <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(bc.subtotal)}</td>
                        <td />
                      </tr>
                      {bc.sections.map((sec) => (
                        <Fragment key={`sec-${bc.budgetCodeId}-${sec.section}`}>
                          {sec.subSections.map((ss) => (
                            <Fragment key={`ss-${bc.budgetCodeId}-${sec.section}-${ss.subSection}`}>
                              {ss.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="px-3 py-1.5 pl-10 text-xs">
                                    <div>{item.description}</div>
                                    <div className="text-[10px] text-muted-foreground">{sec.section}{ss.subSection !== "—" ? ` · ${ss.subSection}` : ""} · {item.level}</div>
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">{item.unit}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">{fmt(item.quantity)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs">${fmt(item.unit_rate)}</td>
                                  <td className="px-3 py-1.5 text-right text-xs font-medium">${fmt(item.total_amount)}</td>
                                  <td className="px-2 py-1.5">
                                    {can("tender_boq", "delete") && (
                                    <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                                      {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                    </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <TenderCostImportDialog tenderId={tenderId} initialMode="boq" onClose={() => setShowImport(false)} onImported={load} />
      )}
    </div>
  );
}
