"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnitRate = any;

export function UnitRatesTab() {
  const [unitRates, setUnitRates] = useState<UnitRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRateForm, setShowRateForm] = useState(false);
  const [rateForm, setRateForm] = useState({ code: "", description: "", category: "material", trade: "", unit: "ea", base_rate: "0", wastage_pct: "0", productivity_factor: "1", notes: "" });

  const supabase = createClient();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("unit_rate_library").select("*").order("category");
    if (data) setUnitRates(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateRate() {
    setSaving(true);
    const { error } = await supabase.from("unit_rate_library").insert({
      code: rateForm.code, description: rateForm.description, category: rateForm.category,
      trade: rateForm.trade || null, unit: rateForm.unit, base_rate: parseFloat(rateForm.base_rate) || 0,
      wastage_pct: parseFloat(rateForm.wastage_pct) || 0,
      productivity_factor: parseFloat(rateForm.productivity_factor) || 1,
      notes: rateForm.notes || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Unit rate added");
    setShowRateForm(false);
    setRateForm({ code: "", description: "", category: "material", trade: "", unit: "ea", base_rate: "0", wastage_pct: "0", productivity_factor: "1", notes: "" });
    await load();
    setSaving(false);
  }

  async function handleDeleteRate(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("unit_rate_library").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Rate deleted");
    setUnitRates(unitRates.filter((r: UnitRate) => r.id !== id));
    setDeletingId(null);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{unitRates.length} rate{unitRates.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setShowRateForm(!showRateForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add Rate
        </Button>
      </div>

      {showRateForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Code *</label><input value={rateForm.code} onChange={e => setRateForm({...rateForm, code: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Category</label><select value={rateForm.category} onChange={e => setRateForm({...rateForm, category: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="labour">Labour</option><option value="material">Material</option><option value="plant">Plant</option>
                <option value="subcontract">Subcontract</option><option value="preliminaries">Preliminaries</option>
                <option value="overhead">Overhead</option><option value="profit">Profit</option>
              </select></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><input value={rateForm.description} onChange={e => setRateForm({...rateForm, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Trade</label><input value={rateForm.trade} onChange={e => setRateForm({...rateForm, trade: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Unit</label><select value={rateForm.unit} onChange={e => setRateForm({...rateForm, unit: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="ea">Each</option><option value="m">Metre</option><option value="m2">Sq Metre</option><option value="m3">Cu Metre</option><option value="kg">Kg</option><option value="ton">Ton</option><option value="hr">Hour</option><option value="day">Day</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Base Rate *</label><input type="number" value={rateForm.base_rate} onChange={e => setRateForm({...rateForm, base_rate: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Wastage %</label><input type="number" value={rateForm.wastage_pct} onChange={e => setRateForm({...rateForm, wastage_pct: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Productivity Factor</label><input type="number" step="0.01" value={rateForm.productivity_factor} onChange={e => setRateForm({...rateForm, productivity_factor: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Notes</label><textarea value={rateForm.notes} onChange={e => setRateForm({...rateForm, notes: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowRateForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateRate} disabled={saving || !rateForm.code.trim() || !rateForm.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {unitRates.length === 0 && !showRateForm ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No unit rates in library</div>
      ) : (
        unitRates.map((r: UnitRate) => (
          <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
              r.category === "labour" ? "bg-blue-50 text-blue-600" :
              r.category === "material" ? "bg-amber-50 text-amber-600" :
              r.category === "plant" ? "bg-purple-50 text-purple-600" : "bg-gray-50 text-gray-600"
            )}>{r.category}</span>
            <span className="font-mono text-xs">{r.code}</span>
            <span className="flex-1 truncate">{r.description}</span>
            <span className="font-semibold">${Number(r.base_rate).toLocaleString()}/{r.unit}</span>
            <button onClick={() => handleDeleteRate(r.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === r.id}>
              {deletingId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
