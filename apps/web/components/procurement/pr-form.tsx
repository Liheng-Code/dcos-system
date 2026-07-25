"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Plus, Trash2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BoqItemPickerDialog } from "@/components/procurement/boq-item-picker-dialog";

interface PRItem {
  key: string;
  boq_item_id: string | null;
  item_code: string;
  item_description: string;
  unit: string;
  quantity: number;
  estimated_unit_price: number;
  estimated_total: number;
  budget_code: string;
  notes: string;
}

interface Project {
  id: string;
  project_code: string;
  project_name: string;
}

export function PRForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [siteLocations, setSiteLocations] = useState<{ id: string; name: string; address: string | null }[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<{ code: string; description: string }[]>([]);
  const [form, setForm] = useState({
    project_id: "",
    wbs_node_id: "",
    task_id: "",
    required_date: "",
    delivery_location: "",
    priority: "normal",
    budget_code: "",
    notes: "",
  });
  const [items, setItems] = useState<PRItem[]>([
    { key: crypto.randomUUID(), boq_item_id: null, item_code: "", item_description: "", unit: "pcs", quantity: 1, estimated_unit_price: 0, estimated_total: 0, budget_code: "", notes: "" },
  ]);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("projects").select("id, project_code, project_name").order("project_name").then(({ data }) => {
      if (data) setProjects(data as Project[]);
    });
    supabase.from("site_locations").select("id, name, address").eq("is_active", true).order("name").then(({ data }) => {
      if (data) setSiteLocations(data);
    });
    supabase.from("budget_codes").select("code, description").eq("is_active", true).order("sort_order").then(({ data }) => {
      if (data) setBudgetCodes(data);
    });
  }, []);

  function updateForm(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateItem(key: string, field: string, value: string | number) {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "estimated_unit_price") {
        updated.estimated_total = (updated.quantity || 0) * (updated.estimated_unit_price || 0);
      }
      return updated;
    }));
  }

  function addItem() {
    setItems(prev => [...prev, { key: crypto.randomUUID(), boq_item_id: null, item_code: "", item_description: "", unit: "pcs", quantity: 1, estimated_unit_price: 0, estimated_total: 0, budget_code: "", notes: "" }]);
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function handlePickBoq(picked: { boq_item_id: string; item_code: string; description: string; unit: string; quantity: number; unit_rate: number; budget_code: string; notes: string }[]) {
    setItems(prev => [
      ...prev.filter(i => i.item_description.trim()),
      ...picked.map(p => ({
        key: crypto.randomUUID(),
        boq_item_id: p.boq_item_id,
        item_code: p.item_code,
        item_description: p.description,
        unit: p.unit,
        quantity: p.quantity,
        estimated_unit_price: p.unit_rate,
        estimated_total: p.quantity * p.unit_rate,
        budget_code: p.budget_code,
        notes: p.notes,
      })),
    ]);
  }

  function totalEstimated() {
    return items.reduce((sum, i) => sum + i.estimated_total, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const validItems = items.filter(i => i.item_description.trim());
    if (validItems.length === 0) {
      toast.error("Add at least one item with a description");
      return;
    }
    if (!form.project_id) {
      toast.error("Select a project");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const supabaseForm = {
      ...form,
      pr_number: `PR-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      project_id: form.project_id || null,
      wbs_node_id: form.wbs_node_id || null,
      task_id: form.task_id || null,
      required_date: form.required_date || null,
      delivery_location: form.delivery_location || null,
      budget_code: form.budget_code || null,
      notes: form.notes || null,
    };

    const { data: prData, error: prError } = await supabase
      .from("procurement_prs")
      .insert([supabaseForm])
      .select("id")
      .single();

    if (prError) { toast.error(prError.message); setSaving(false); return; }

    const prId = (prData as { id: string }).id;

    const itemInserts = validItems.map((i, idx) => ({
      pr_id: prId,
      line_no: idx + 1,
      boq_item_id: i.boq_item_id || null,
      item_code: i.item_code || null,
      item_description: i.item_description,
      unit: i.unit,
      quantity: i.quantity,
      estimated_unit_price: i.estimated_unit_price || null,
      estimated_total: i.estimated_total || null,
      budget_code: i.budget_code || null,
      notes: i.notes || null,
    }));

    const { error: itemsError } = await supabase.from("procurement_pr_items").insert(itemInserts);

    if (itemsError) { toast.error(itemsError.message); setSaving(false); return; }

    toast.success("Purchase requisition created");
    router.push(`/dashboard/procurement/pr/${prId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">New Purchase Requisition</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Create PR
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Details</h3>
            <div className="space-y-1.5">
              <Label>Project *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.project_id} onChange={e => updateForm("project_id", e.target.value)}>
                <option value="">Select project...</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.project_code} — {p.project_name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Required Date</Label>
              <Input type="date" value={form.required_date} onChange={e => updateForm("required_date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Delivery Location</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.delivery_location} onChange={e => updateForm("delivery_location", e.target.value)}>
                <option value="">Select location...</option>
                {siteLocations.map(loc => (
                  <option key={loc.id} value={loc.name}>{loc.name}{loc.address ? ` — ${loc.address}` : ""}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.priority} onChange={e => updateForm("priority", e.target.value)}>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Budget Code</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.budget_code} onChange={e => updateForm("budget_code", e.target.value)}>
                <option value="">Select budget code...</option>
                {budgetCodes.map(bc => (
                  <option key={bc.code} value={bc.code}>{bc.code} — {bc.description}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => updateForm("notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Items</h3>
              <div className="flex items-center gap-2">
                {form.project_id && (
                  <BoqItemPickerDialog projectId={form.project_id} onPick={handlePickBoq} />
                )}
                <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> Add Item</Button>
              </div>
            </div>

            {items.map((item, idx) => (
              <div key={item.key} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                  {items.length > 1 && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.key)}><Trash2 className="h-3 w-3 text-red-500" /></Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Item Code</Label>
                    <Input className="h-8 text-xs" value={item.item_code} onChange={e => updateItem(item.key, "item_code", e.target.value)} />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Description *</Label>
                    <Input className="h-8 text-xs" value={item.item_description} onChange={e => updateItem(item.key, "item_description", e.target.value)} placeholder="Material / service description" />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <select className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={item.unit} onChange={e => updateItem(item.key, "unit", e.target.value)}>
                      <option value="pcs">pcs</option>
                      <option value="m">m</option>
                      <option value="m2">m²</option>
                      <option value="m3">m³</option>
                      <option value="kg">kg</option>
                      <option value="ton">ton</option>
                      <option value="lot">lot</option>
                      <option value="hr">hr</option>
                      <option value="day">day</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Qty</Label>
                    <Input className="h-8 text-xs" type="number" min="0.01" step="0.01" value={item.quantity} onChange={e => updateItem(item.key, "quantity", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit Price</Label>
                    <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.estimated_unit_price} onChange={e => updateItem(item.key, "estimated_unit_price", parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Total</Label>
                    <div className="h-8 flex items-center text-xs font-medium">${item.estimated_total.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold">Estimated Total</span>
              <span className="text-lg font-bold">${totalEstimated().toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}
