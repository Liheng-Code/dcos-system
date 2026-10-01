"use client";

import { useEffect, useState } from "react";
import { createCashForecast, getCashFlowSummary, listCashForecast } from "@/lib/account/account-service";
import { Search, Plus, Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface CfEntry {
  id: string; forecast_date: string; category: string;
  description: string | null; amount: number;
  probability_pct: number; expected_amount: number;
  notes: string | null;
}

export function CashFlowView() {
  const [entries, setEntries] = useState<CfEntry[]>([]);
  const [summary, setSummary] = useState<{ forecast_date: string; total_inflow: number; total_outflow: number; net_flow: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    Promise.all([
      listCashForecast(),
      getCashFlowSummary(),
    ]).then(([entriesRes, summaryRes]) => {
      if (entriesRes.data) setEntries(entriesRes.data as CfEntry[]);
      if (summaryRes.data) setSummary(summaryRes.data as typeof summary);
      setLoading(false);
    });
  }

  useEffect(() => { load(); }, []);

  const filtered = entries.filter(e =>
    e.category.toLowerCase().includes(search.toLowerCase()) ||
    (e.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const totalInflow = summary.reduce((s, r) => s + r.total_inflow, 0);
  const totalOutflow = summary.reduce((s, r) => s + r.total_outflow, 0);

  if (showForm) return <CashFlowForm onSaved={() => { setShowForm(false); load(); }} onCancel={() => setShowForm(false)} />;

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  const categoryLabels: Record<string, string> = {
    inflow_ar: "AR Collection", inflow_other: "Other Inflow",
    outflow_ap: "AP Payment", outflow_payroll: "Payroll", outflow_other: "Other Outflow",
  };

  return (
    <div className="space-y-4">
      {summary.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <Card><CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Projected Inflow</div>
            <div className="text-lg font-semibold text-green-600">${totalInflow.toFixed(2)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Projected Outflow</div>
            <div className="text-lg font-semibold text-red-600">${totalOutflow.toFixed(2)}</div>
          </CardContent></Card>
          <Card><CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Net Position</div>
            <div className={`text-lg font-semibold ${totalInflow - totalOutflow >= 0 ? "text-green-600" : "text-red-600"}`}>
              ${(totalInflow - totalOutflow).toFixed(2)}
            </div>
          </CardContent></Card>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search entries..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> New Entry</Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase">
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Category</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-right px-3 py-2">Amount</th>
              <th className="text-center px-3 py-2">Probability</th>
              <th className="text-right px-3 py-2">Expected</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No cash flow entries.</td></tr>
            ) : filtered.map(e => (
              <tr key={e.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-3 py-1.5">{e.forecast_date}</td>
                <td className="px-3 py-1.5"><Badge variant="outline" className="text-[9px]">{categoryLabels[e.category] || e.category}</Badge></td>
                <td className="px-3 py-1.5">{e.description ?? "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono">${e.amount.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-center">{e.probability_pct}%</td>
                <td className="px-3 py-1.5 text-right font-mono">${e.expected_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashFlowForm({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) {
  const [forecastDate, setForecastDate] = useState(new Date().toISOString().slice(0, 10));
  const [category, setCategory] = useState("inflow_ar");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState(0);
  const [probability, setProbability] = useState(100);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { error } = await createCashForecast({
      forecast_date: forecastDate, category, description: description.trim() || null,
      amount, probability_pct: probability, notes: notes.trim() || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Cash flow entry created");
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
        <h2 className="text-lg font-semibold">New Cash Flow Entry</h2>
      </div>
      <Card><CardContent className="pt-5">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Forecast Date</Label>
              <Input type="date" value={forecastDate} onChange={e => setForecastDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="inflow_ar">AR Collection</option>
                <option value="inflow_other">Other Inflow</option>
                <option value="outflow_ap">AP Payment</option>
                <option value="outflow_payroll">Payroll</option>
                <option value="outflow_other">Other Outflow</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input type="number" step="0.01" min="0" value={amount || ""} onChange={e => setAmount(parseFloat(e.target.value) || 0)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Probability (%)</Label>
              <Input type="number" step="1" min="0" max="100" value={probability} onChange={e => setProbability(parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </div>
        </form>
      </CardContent></Card>
    </div>
  );
}
