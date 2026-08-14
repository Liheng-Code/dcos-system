"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GitBranch, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { VariationOrderList } from "@/components/qs/variation-order-list";

const SUB_TAB_IDS = ["main", "sub"] as const;
type SubTab = (typeof SUB_TAB_IDS)[number];

interface SubVariation {
  id: string; subcontract_id: string;
  variation_no: string; description: string;
  type: string; amount: number;
  status: string; approved_date: string | null;
  schedule_impact_days: number | null;
}

function SubVariationList({ projectId }: { projectId: string }) {
  const supabase = createClient();
  const [items, setItems] = useState<SubVariation[]>([]);
  const [subcontracts, setSubcontracts] = useState<{id:string,subcontract_no:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    subcontract_id: "", variation_no: "", description: "",
    type: "addition", amount: "0", schedule_impact_days: "0",
  });

  useEffect(() => {
    supabase.from("subcontracts").select("id,subcontract_no").then(({ data }) => {
      if (data) setSubcontracts(data);
    });
    supabase.from("subcontract_variations").select("*").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setItems(data as SubVariation[]);
      setLoading(false);
    });
  }, [supabase]);

  async function handleCreate() {
    setSaving(true);
    const { error } = await supabase.from("subcontract_variations").insert({
      subcontract_id: form.subcontract_id,
      variation_no: form.variation_no,
      description: form.description,
      type: form.type,
      amount: parseFloat(form.amount) || 0,
      schedule_impact_days: parseInt(form.schedule_impact_days) || 0,
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Variation created");
    setShowForm(false);
    setForm({ subcontract_id: "", variation_no: "", description: "", type: "addition", amount: "0", schedule_impact_days: "0" });
    const { data } = await supabase.from("subcontract_variations").select("*").order("created_at", { ascending: false });
    if (data) setItems(data as SubVariation[]);
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this variation?")) return;
    const { error } = await supabase.from("subcontract_variations").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Variation deleted");
    setItems(items.filter((i) => i.id !== id));
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} variation{items.length !== 1 ? "s" : ""}</p>
        <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
          <Plus className="mr-1 h-4 w-4" /> Add Variation
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Subcontract *</label>
                <select value={form.subcontract_id} onChange={e => setForm({...form, subcontract_id: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">Select subcontract...</option>
                  {subcontracts.map((s) => (<option key={s.id} value={s.id}>{s.subcontract_no}</option>))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Variation No *</label>
                <input value={form.variation_no} onChange={e => setForm({...form, variation_no: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="addition">Addition</option>
                  <option value="deduction">Deduction</option>
                  <option value="omission">Omission</option>
                </select>
              </div>
              <div className="col-span-2 space-y-1">
                <label className="text-xs font-medium">Description</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Amount *</label>
                <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium">Schedule Impact (days)</label>
                <input type="number" value={form.schedule_impact_days} onChange={e => setForm({...form, schedule_impact_days: e.target.value})}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || !form.variation_no.trim() || !form.subcontract_id}>
                {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Create
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {items.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <GitBranch className="mb-2 h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-400">No subcontractor variations</p>
        </div>
      ) : (
        items.map((v) => (
          <Card key={v.id}>
            <CardContent className="flex items-center gap-4 p-3">
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                v.type === "addition" ? "bg-emerald-50 text-emerald-600" :
                v.type === "deduction" ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
              )}>{v.type === "addition" ? "+" : v.type === "deduction" ? "−" : "△"}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">{v.variation_no}</p>
                <p className="text-xs text-muted-foreground truncate">{v.description}</p>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-semibold", v.type === "addition" ? "text-emerald-600" : "text-red-600")}>
                  {v.type === "addition" ? "+" : "−"}{Number(v.amount).toLocaleString()}
                </p>
                <p className="text-xs text-muted-foreground">{v.schedule_impact_days ? `${v.schedule_impact_days} days` : "—"}</p>
              </div>
              <button onClick={() => handleDelete(v.id)} className="text-muted-foreground hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

interface Props {
  projectId: string;
  projectName?: string;
}

export function MergedVariationsView({ projectId, projectName }: Props) {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as SubTab | null;
  const subTab: SubTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "main";

  return (
    <div className="space-y-4">
      {subTab === "main" && <VariationOrderList projectId={projectId} projectName={projectName} />}
      {subTab === "sub"  && <SubVariationList projectId={projectId} />}
    </div>
  );
}
