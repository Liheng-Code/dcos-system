"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RiskItem = any;

export function RisksTab({ tenderId }: { tenderId: string }) {
  const [risks, setRisks] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [riskForm, setRiskForm] = useState({ risk_no: "", description: "", category: "technical", likelihood: "medium", impact: "medium", priced_amount: "0", mitigation: "", owner: "" });

  const supabase = createClient();

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("tender_risk_items").select("*").eq("tender_id", tenderId);
    if (data) setRisks(data);
    setLoading(false);
  }, [tenderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleCreateRisk() {
    setSaving(true);
    const { error } = await supabase.from("tender_risk_items").insert({
      tender_id: tenderId, risk_no: riskForm.risk_no, description: riskForm.description,
      category: riskForm.category, likelihood: riskForm.likelihood, impact: riskForm.impact,
      priced_amount: parseFloat(riskForm.priced_amount) || 0,
      mitigation: riskForm.mitigation || null, owner: riskForm.owner || null,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Risk item added");
    setShowRiskForm(false);
    setRiskForm({ risk_no: "", description: "", category: "technical", likelihood: "medium", impact: "medium", priced_amount: "0", mitigation: "", owner: "" });
    await load();
    setSaving(false);
  }

  async function handleDeleteRisk(id: string) {
    setDeletingId(id);
    const { error } = await supabase.from("tender_risk_items").delete().eq("id", id);
    if (error) { toast.error(error.message); setDeletingId(null); return; }
    toast.success("Risk deleted");
    setRisks(risks.filter((r: RiskItem) => r.id !== id));
    setDeletingId(null);
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{risks.length} risk{risks.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setShowRiskForm(!showRiskForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add Risk
        </Button>
      </div>

      {showRiskForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><label className="text-xs font-medium">Risk No *</label><input value={riskForm.risk_no} onChange={e => setRiskForm({...riskForm, risk_no: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Category</label><select value={riskForm.category} onChange={e => setRiskForm({...riskForm, category: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="technical">Technical</option><option value="commercial">Commercial</option><option value="schedule">Schedule</option>
                <option value="geotechnical">Geotechnical</option><option value="market">Market</option><option value="regulatory">Regulatory</option>
                <option value="environmental">Environmental</option><option value="other">Other</option>
              </select></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Description *</label><textarea value={riskForm.description} onChange={e => setRiskForm({...riskForm, description: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Likelihood</label><select value={riskForm.likelihood} onChange={e => setRiskForm({...riskForm, likelihood: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="very_low">Very Low</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="very_high">Very High</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Impact</label><select value={riskForm.impact} onChange={e => setRiskForm({...riskForm, impact: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="very_low">Very Low</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="very_high">Very High</option>
              </select></div>
              <div className="space-y-1"><label className="text-xs font-medium">Priced Amount</label><input type="number" value={riskForm.priced_amount} onChange={e => setRiskForm({...riskForm, priced_amount: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs font-medium">Owner</label><input value={riskForm.owner} onChange={e => setRiskForm({...riskForm, owner: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
              <div className="col-span-2 space-y-1"><label className="text-xs font-medium">Mitigation</label><textarea value={riskForm.mitigation} onChange={e => setRiskForm({...riskForm, mitigation: e.target.value})} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowRiskForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreateRisk} disabled={saving || !riskForm.risk_no.trim() || !riskForm.description.trim()}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Add
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {risks.length === 0 && !showRiskForm ? (
        <div className="rounded-lg border px-6 py-8 text-center text-sm text-muted-foreground">No risk items identified</div>
      ) : (
        risks.map((r: RiskItem) => (
          <Card key={r.id}>
            <CardContent className="flex items-center gap-4 p-3">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                r.risk_score === "critical" ? "bg-red-50 text-red-600" :
                r.risk_score === "high" ? "bg-amber-50 text-amber-600" :
                r.risk_score === "medium" ? "bg-yellow-50 text-yellow-600" : "bg-green-50 text-green-600"
              )}>{r.risk_score?.toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{r.risk_no} — {r.description}</p>
                <p className="text-xs text-muted-foreground">{r.category} · {r.likelihood} / {r.impact}</p>
              </div>
              <p className="text-sm font-semibold">${Number(r.priced_amount).toLocaleString()}</p>
              <button onClick={() => handleDeleteRisk(r.id)} className="text-muted-foreground hover:text-red-600" disabled={deletingId === r.id}>
                {deletingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
