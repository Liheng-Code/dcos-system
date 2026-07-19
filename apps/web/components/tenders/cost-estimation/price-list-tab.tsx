"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPriceList, createPriceListItem, deletePriceListItem, getBudgetCodes, pullFromUnitRateLibrary,
  type TenderPriceListItem, type BudgetCode,
} from "@/lib/tender-cost-service";
import { TenderCostImportDialog } from "./tender-cost-import-dialog";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PriceListTab({ tenderId }: { tenderId: string }) {
  const [items, setItems] = useState<TenderPriceListItem[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const { can } = useTenderPermissions();

  const [form, setForm] = useState({
    item_code: "", section: "", sub_section: "", sub_element: "", description: "", unit: "ea",
    labor_net_cost: "0", labor_margin_pct: "0", material_net_cost: "0", material_margin_pct: "0",
    basis_source: "", budget_code: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, codes] = await Promise.all([getPriceList(tenderId), getBudgetCodes()]);
      setItems(items);
      setBudgetCodes(codes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load price list");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      const bc = budgetCodes.find((c) => c.code === form.budget_code);
      await createPriceListItem({
        tender_id: tenderId,
        item_code: form.item_code,
        section: form.section || null,
        sub_section: form.sub_section || null,
        sub_element: form.sub_element || null,
        description: form.description,
        unit: form.unit,
        labor_net_cost: parseFloat(form.labor_net_cost) || 0,
        labor_margin_pct: parseFloat(form.labor_margin_pct) || 0,
        material_net_cost: parseFloat(form.material_net_cost) || 0,
        material_margin_pct: parseFloat(form.material_margin_pct) || 0,
        basis_source: form.basis_source || null,
        budget_code_id: bc?.id ?? null,
      });
      toast.success("Price List item added");
      setShowForm(false);
      setForm({ item_code: "", section: "", sub_section: "", sub_element: "", description: "", unit: "ea", labor_net_cost: "0", labor_margin_pct: "0", material_net_cost: "0", material_margin_pct: "0", basis_source: "", budget_code: "" });
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
      await deletePriceListItem(id);
      toast.success("Item deleted");
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  async function handlePullFromLibrary() {
    if (!confirm("Pull rates from Unit Rate Library? Existing rates with the same source will be skipped.")) return;
    setPulling(true);
    try {
      const count = await pullFromUnitRateLibrary(tenderId);
      if (count === 0) {
        toast.info("No new rates to pull — all library rates already exist");
      } else {
        toast.success(`Pulled ${count} rate(s) from Unit Rate Library`);
        load();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to pull from library");
    } finally {
      setPulling(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} rate(s)</p>
        <div className="flex gap-2">
          {can("tender_price_list", "can_create") && (
          <Button size="sm" variant="outline" onClick={handlePullFromLibrary} disabled={pulling}>
            {pulling ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Pull from Library
          </Button>
          )}
          {can("tender_price_list", "can_create") && (
          <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
            <Upload className="mr-1 h-4 w-4" /> Import
          </Button>
          )}
          {can("tender_price_list", "can_create") && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="mr-1 h-4 w-4" /> Add Rate
          </Button>
          )}
        </div>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Item Code *</label><input value={form.item_code} onChange={(e) => setForm({ ...form, item_code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Budget Code</label>
                <select value={form.budget_code} onChange={(e) => setForm({ ...form, budget_code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">None</option>
                  {budgetCodes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </div>
              <div className="space-y-1"><label className="text-xs font-medium">Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Section</label><input value={form.section} onChange={(e) => setForm({ ...form, section: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Sub Section</label><input value={form.sub_section} onChange={(e) => setForm({ ...form, sub_section: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Sub Element</label><input value={form.sub_element} onChange={(e) => setForm({ ...form, sub_element: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Labor Net Cost</label><input type="number" value={form.labor_net_cost} onChange={(e) => setForm({ ...form, labor_net_cost: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Labor Margin %</label><input type="number" value={form.labor_margin_pct} onChange={(e) => setForm({ ...form, labor_margin_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Material Net Cost</label><input type="number" value={form.material_net_cost} onChange={(e) => setForm({ ...form, material_net_cost: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Material Margin %</label><input type="number" value={form.material_margin_pct} onChange={(e) => setForm({ ...form, material_margin_pct: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Basis / Source</label><input value={form.basis_source} onChange={(e) => setForm({ ...form, basis_source: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.item_code.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !showForm ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground space-y-2">
          <p>No price list items yet.</p>
          <p>Start by pulling base rates from the <strong>Unit Rate Library</strong>, or import your own Price List spreadsheet.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-left px-3 py-2 font-medium">Budget Code</th>
                <th className="text-right px-3 py-2 font-medium">Labor Rate</th>
                <th className="text-right px-3 py-2 font-medium">Material Rate</th>
                <th className="text-right px-3 py-2 font-medium">Total Rate</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 font-mono text-xs">{item.item_code}</td>
                  <td className="px-3 py-2">{item.description} <span className="text-xs text-muted-foreground">/ {item.unit}</span></td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{item.budget_codes?.code ?? "—"}</td>
                  <td className="px-3 py-2 text-right">${fmt(item.labor_rate)}</td>
                  <td className="px-3 py-2 text-right">${fmt(item.material_rate)}</td>
                  <td className="px-3 py-2 text-right font-semibold">${fmt(item.total_rate)}</td>
                  <td className="px-3 py-2">
                    {can("tender_price_list", "delete") && (
                    <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                      {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport && (
        <TenderCostImportDialog tenderId={tenderId} initialMode="price_list" onClose={() => setShowImport(false)} onImported={load} />
      )}
    </div>
  );
}
