"use client";

import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  getPreliminariesItems, createPreliminariesItem, deletePreliminariesItem, getBudgetCodes,
  type TenderPreliminariesItem, type BudgetCode,
} from "@/lib/tender-cost-service";

const fmt = (n: number) => Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function PreliminariesTab({ tenderId }: { tenderId: string }) {
  const [items, setItems] = useState<TenderPreliminariesItem[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<BudgetCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [form, setForm] = useState({ code: "", budget_code: "", description: "", unit: "ea", quantity: "0", rate: "0" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [items, codes] = await Promise.all([getPreliminariesItems(tenderId), getBudgetCodes()]);
      setItems(items);
      setBudgetCodes(codes.filter((c) => c.code_letter === "Z"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load preliminaries");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setSaving(true);
    try {
      const bc = budgetCodes.find((c) => c.code === form.budget_code);
      await createPreliminariesItem({
        tender_id: tenderId,
        code: form.code,
        budget_code_id: bc?.id ?? null,
        description: form.description,
        unit: form.unit,
        quantity: parseFloat(form.quantity) || 0,
        rate: parseFloat(form.rate) || 0,
      });
      toast.success("Preliminaries item added");
      setShowForm(false);
      setForm({ code: "", budget_code: "", description: "", unit: "ea", quantity: "0", rate: "0" });
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
      await deletePreliminariesItem(id);
      toast.success("Item deleted");
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete item");
    } finally {
      setDeletingId(null);
    }
  }

  const total = items.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} item(s) · Total ${fmt(total)}</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add Item
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Code *</label><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Z.01" /></div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Budget Code</label>
                <select value={form.budget_code} onChange={(e) => setForm({ ...form, budget_code: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">None</option>
                  {budgetCodes.map((c) => <option key={c.id} value={c.code}>{c.code} — {c.description}</option>)}
                </select>
              </div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Unit</label><input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Qty</label><input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Rate</label><input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Amount</label><p className="pt-2 text-sm font-semibold">{fmt((parseFloat(form.quantity) || 0) * (parseFloat(form.rate) || 0))}</p></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.code.trim() || !form.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !showForm ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No preliminaries items added</div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Code</th>
                <th className="text-left px-3 py-2 font-medium">Description</th>
                <th className="text-right px-3 py-2 font-medium">Qty</th>
                <th className="text-right px-3 py-2 font-medium">Rate</th>
                <th className="text-right px-3 py-2 font-medium">Amount</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2 font-mono text-xs">{item.code}</td>
                  <td className="px-3 py-2">{item.description} <span className="text-xs text-muted-foreground">/ {item.unit}</span></td>
                  <td className="px-3 py-2 text-right">{fmt(item.quantity)}</td>
                  <td className="px-3 py-2 text-right">${fmt(item.rate)}</td>
                  <td className="px-3 py-2 text-right font-semibold">${fmt(item.amount)}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => handleDelete(item.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === item.id}>
                      {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/30 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-right">TOTAL PRELIMINARIES</td>
                <td className="px-3 py-2 text-right">${fmt(total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
