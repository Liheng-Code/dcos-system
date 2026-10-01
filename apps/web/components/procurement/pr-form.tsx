"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deletePrItemsByPrId, getPrById, getProjectById, insertPr, insertPrItems, listBudgetCodeGroups, listPrItemsByPrId, listPrsByProjectId, updatePrById } from "@/lib/procurement/procurement-queries";
import { Loader2, Save, Plus, Trash2, ArrowLeft, Building2, Hash } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BoqItemPickerDialog } from "@/components/procurement/boq-item-picker-dialog";
import { useProject } from "@/components/dashboard/project-context";

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

export function PRForm({ prId }: { prId?: string }) {
  const router = useRouter();
  const { selectedProjectId, selectedProject } = useProject();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatedPrNumber, setGeneratedPrNumber] = useState("");
  const [budgetGroups, setBudgetGroups] = useState<{ code_letter: string; name: string }[]>([]);
  const [form, setForm] = useState({
    preparation_date: new Date().toISOString().slice(0, 10),
    required_date: "",
    ship_to: "",
    priority: "normal",
    budget_code: "",
    purpose: "",
  });
  const [items, setItems] = useState<PRItem[]>([
    { key: crypto.randomUUID(), boq_item_id: null, item_code: "", item_description: "", unit: "pcs", quantity: 1, estimated_unit_price: 0, estimated_total: 0, budget_code: "", notes: "" },
  ]);
  const isEditing = !!prId;

  useEffect(() => {
    if (!selectedProjectId || !selectedProject) {
      setGeneratedPrNumber("");
      return;
    }
    listBudgetCodeGroups().then((bgRes) => {
      setBudgetGroups((bgRes.data ?? []) as { code_letter: string; name: string }[]);
    });

    if (isEditing && prId) {
      setLoading(true);
      Promise.all([
        getPrById(prId, "*"),
        listPrItemsByPrId(prId, "*"),
      ]).then(([prRes, itemsRes]) => {
        if (prRes.data) {
          const record = prRes.data as { pr_number: string; preparation_date: string | null; required_date: string | null; ship_to: string | null; priority: string; budget_code: string | null; notes: string | null };
          setGeneratedPrNumber(record.pr_number);
          setForm({
            preparation_date: record.preparation_date ?? new Date().toISOString().slice(0, 10),
            required_date: record.required_date ?? "",
            ship_to: record.ship_to ?? "",
            priority: record.priority ?? "normal",
            budget_code: record.budget_code ?? "",
            purpose: record.notes ?? "",
          });
          if (itemsRes.data) {
            setItems((itemsRes.data as { boq_item_id: string | null; item_code: string | null; item_description: string; unit: string; quantity: number; estimated_unit_price: number | null; estimated_total: number | null; budget_code: string | null; notes: string | null }[]).map(i => ({
              key: crypto.randomUUID(),
              boq_item_id: i.boq_item_id,
              item_code: i.item_code ?? "",
              item_description: i.item_description,
              unit: i.unit,
              quantity: i.quantity,
              estimated_unit_price: i.estimated_unit_price ?? 0,
              estimated_total: i.estimated_total ?? 0,
              budget_code: i.budget_code ?? "",
              notes: i.notes ?? "",
            })));
          }
        }
        setLoading(false);
      });
    } else {
      listPrsByProjectId(selectedProjectId).then((prRes) => {
        getProjectById(selectedProjectId, "company_code, location").then((projRes) => {
          const companyCode = projRes.data?.company_code ?? "DCOS";
          const prefix = `${selectedProject.project_code}-${companyCode}-PR-`;
          const existing = (prRes.data ?? []) as { pr_number: string }[];
          let maxSeq = 0;
          for (const pr of existing) {
            if (pr.pr_number.startsWith(prefix)) {
              const num = parseInt(pr.pr_number.slice(prefix.length), 10);
              if (!isNaN(num) && num > maxSeq) maxSeq = num;
            }
          }
          const seq = maxSeq + 1;
          setGeneratedPrNumber(`${prefix}${String(seq).padStart(3, "0")}`);
          if (projRes.data?.location) {
            setForm(prev => ({ ...prev, ship_to: prev.ship_to || projRes.data.location }));
          }
        });
      });
    }
  }, [selectedProjectId, selectedProject, isEditing, prId]);

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
    if (!selectedProjectId) {
      toast.error("Select a project from the top bar");
      return;
    }

    setSaving(true);

    const supabaseForm = {
      pr_number: generatedPrNumber,
      project_id: selectedProjectId,
      preparation_date: form.preparation_date || null,
      required_date: form.required_date || null,
      ship_to: form.ship_to || null,
      priority: form.priority,
      budget_code: form.budget_code || null,
      notes: form.purpose || null,
      total_estimated_cost: totalEstimated(),
    };

    let targetPrId = prId ?? "";

    if (isEditing && prId) {
      const { error: prError } = await updatePrById(supabaseForm, prId);
      if (prError) { toast.error(prError.message); setSaving(false); return; }
      await deletePrItemsByPrId(prId);
    } else {
      const { data: prData, error: prError } = await insertPr(supabaseForm);
      if (prError) { toast.error(prError.message); setSaving(false); return; }
      targetPrId = (prData as { id: string }).id;
    }

    const itemInserts = validItems.map((i, idx) => ({
      pr_id: targetPrId,
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

    const { error: itemsError } = await insertPrItems(itemInserts);
    if (itemsError) { toast.error(itemsError.message); setSaving(false); return; }

    toast.success(isEditing ? "Purchase requisition updated" : "Purchase requisition created");
    router.push(`/dashboard/procurement/pr/${targetPrId}`);
  }

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
        <Building2 className="h-8 w-8" />
        <p>Select a project from the top bar to create a new Purchase Requisition.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">{isEditing ? "Edit Purchase Requisition" : "New Purchase Requisition"}</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isEditing ? "Save Changes" : "Create PR"}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Project Information</h3>

            <div className="space-y-1.5">
              <Label>Project</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedProject?.project_name}</span>
                <span className="font-mono text-xs text-muted-foreground">({selectedProject?.project_code})</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>PR Code</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{generatedPrNumber || "Generating..."}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Date Prepared</Label>
              <Input type="date" value={form.preparation_date} onChange={e => updateForm("preparation_date", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Ship To</Label>
              <Input value={form.ship_to} onChange={e => updateForm("ship_to", e.target.value)} placeholder={selectedProject?.location || "Project location"} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Details</h3>

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
              <Label>Required Date</Label>
              <Input type="date" value={form.required_date} onChange={e => updateForm("required_date", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Budget Group</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.budget_code} onChange={e => updateForm("budget_code", e.target.value)}>
                <option value="">—</option>
                {budgetGroups.map(g => (
                  <option key={g.code_letter} value={g.code_letter}>{g.code_letter} — {g.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Purpose</Label>
              <textarea
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-y min-h-[80px]"
                value={form.purpose}
                onChange={e => updateForm("purpose", e.target.value)}
                placeholder="Describe the purpose of this requisition..."
                rows={4}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Items</h3>
            <div className="flex items-center gap-2">
              {selectedProjectId && (
                <BoqItemPickerDialog projectId={selectedProjectId} onPick={handlePickBoq} />
              )}
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" /> Add Item</Button>
            </div>
          </div>

          {items.map((item, idx) => (
            <div key={item.key} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Item {idx + 1}
                  {item.boq_item_id && (
                    <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-mono text-emerald-700">
                      BOQ linked
                    </span>
                  )}
                </span>
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
    </form>
  );
}
