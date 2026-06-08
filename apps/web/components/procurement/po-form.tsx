"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface POItem {
  key: string;
  pr_item_id: string;
  item_code: string;
  item_description: string;
  unit: string;
  quantity_ordered: number;
  unit_price: number;
  total_price: number;
  delivery_date_expected: string;
  notes: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
  pq_status: string | null;
  pq_expires_at: string | null;
}

interface PRSummary {
  id: string;
  pr_number: string;
  procurement_pr_items: { id: string; item_code: string | null; item_description: string; unit: string; quantity: number; estimated_unit_price: number | null }[];
}

export function POForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prs, setPrs] = useState<PRSummary[]>([]);
  const [selectedPrId, setSelectedPrId] = useState("");
  const [form, setForm] = useState({
    supplier_id: "",
    project_id: "",
    wbs_node_id: "",
    pr_id: "",
    delivery_date_expected: "",
    delivery_address: "",
    currency: "USD",
    payment_terms: "",
    delivery_terms: "",
    notes: "",
  });
  const [items, setItems] = useState<POItem[]>([]);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("procurement_suppliers").select("id, supplier_name, pq_status, pq_expires_at").eq("status", "active").order("supplier_name"),
      supabase.from("procurement_prs").select("id, pr_number").in("approval_status", ["approved", "closed"]).order("created_at", { ascending: false }),
    ]).then(([supRes, prRes]) => {
      if (supRes.data) {
        const rows = supRes.data as Supplier[];
        setSuppliers(rows.sort((a, b) => Number(isSupplierSelectable(b)) - Number(isSupplierSelectable(a)) || a.supplier_name.localeCompare(b.supplier_name)));
      }
      if (prRes.data) setPrs(prRes.data as PRSummary[]);
    });
  }, []);

  async function loadPRItems(prId: string) {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("procurement_pr_items")
      .select("id, item_code, item_description, unit, quantity, estimated_unit_price")
      .eq("pr_id", prId)
      .order("line_no");

    if (error) { toast.error(error.message); return; }
    if (!data || data.length === 0) {
      toast.error("Selected PR has no items");
      return;
    }

    setItems(data.map((item: { id: string; item_code: string | null; item_description: string; unit: string; quantity: number; estimated_unit_price: number | null }) => ({
      key: crypto.randomUUID(),
      pr_item_id: item.id,
      item_code: item.item_code ?? "",
      item_description: item.item_description,
      unit: item.unit,
      quantity_ordered: item.quantity,
      unit_price: item.estimated_unit_price ?? 0,
      total_price: (item.quantity) * (item.estimated_unit_price ?? 0),
      delivery_date_expected: "",
      notes: "",
    })));
  }

  function handlePRSelect(prId: string) {
    setSelectedPrId(prId);
    setForm(prev => ({ ...prev, pr_id: prId }));
    if (prId) loadPRItems(prId);
    else setItems([]);
  }

  function updateForm(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateItem(key: string, field: string, value: string | number) {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity_ordered" || field === "unit_price") {
        updated.total_price = (updated.quantity_ordered || 0) * (updated.unit_price || 0);
      }
      return updated;
    }));
  }

  function grandTotal() {
    return items.reduce((s, i) => s + i.total_price, 0);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.supplier_id) { toast.error("Select a supplier"); return; }
    const selectedSupplier = suppliers.find(s => s.id === form.supplier_id);
    if (selectedSupplier && !isSupplierSelectable(selectedSupplier)) {
      toast.error("Supplier is not prequalified for PO award");
      return;
    }
    if (items.length === 0) { toast.error("Add at least one item"); return; }

    setSaving(true);
    const supabase = createClient();

    const poData = {
      supplier_id: form.supplier_id,
      pr_id: form.pr_id || null,
      delivery_date_expected: form.delivery_date_expected || null,
      delivery_address: form.delivery_address || null,
      currency: form.currency,
      payment_terms: form.payment_terms || null,
      delivery_terms: form.delivery_terms || null,
      total_amount: grandTotal(),
      grand_total: grandTotal(),
      notes: form.notes || null,
    };

    const { data: poResult, error: poError } = await supabase.from("procurement_pos").insert([poData]).select("id").single();
    if (poError) { toast.error(poError.message); setSaving(false); return; }

    const poId = (poResult as { id: string }).id;

    await supabase.from("procurement_pos").update({ po_number: `PO-${new Date().getFullYear()}-${poId.slice(0, 4).toUpperCase()}` }).eq("id", poId);

    const itemInserts = items.map((i, idx) => ({
      po_id: poId,
      pr_item_id: i.pr_item_id || null,
      line_no: idx + 1,
      item_code: i.item_code || null,
      item_description: i.item_description,
      unit: i.unit,
      quantity_ordered: i.quantity_ordered,
      unit_price: i.unit_price,
      total_price: i.total_price,
      delivery_date_expected: i.delivery_date_expected || null,
      notes: i.notes || null,
    }));

    const { error: itemsError } = await supabase.from("procurement_po_items").insert(itemInserts);
    if (itemsError) { toast.error(itemsError.message); setSaving(false); return; }

    toast.success("Purchase order created");
    router.push(`/dashboard/procurement/po/${poId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">New Purchase Order</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Create PO
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Details</h3>

            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.supplier_id} onChange={e => updateForm("supplier_id", e.target.value)}>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id} disabled={!isSupplierSelectable(s)}>{s.supplier_name} - {supplierPqText(s)}</option>)}
              </select>
              {form.supplier_id && <SupplierPqHint supplier={suppliers.find(s => s.id === form.supplier_id)} />}
            </div>

            <div className="space-y-1.5">
              <Label>Source PR (optional)</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={selectedPrId} onChange={e => handlePRSelect(e.target.value)}>
                <option value="">Direct PO (no PR)</option>
                {prs.map(p => <option key={p.id} value={p.id}>{p.pr_number}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Expected Delivery</Label>
              <Input type="date" value={form.delivery_date_expected} onChange={e => updateForm("delivery_date_expected", e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Address</Label>
              <Input value={form.delivery_address} onChange={e => updateForm("delivery_address", e.target.value)} placeholder="Delivery location" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={form.currency} onChange={e => updateForm("currency", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Input value={form.payment_terms} onChange={e => updateForm("payment_terms", e.target.value)} placeholder="Net 30" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Terms</Label>
              <Input value={form.delivery_terms} onChange={e => updateForm("delivery_terms", e.target.value)} placeholder="Incoterms" />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => updateForm("notes", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Items</h3>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Select a PR to load items, or add manually.</p>
            ) : (
              items.map((item, idx) => (
                <div key={item.key} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">Item {idx + 1}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setItems(prev => prev.filter(i => i.key !== item.key))}>
                      <Trash2 className="h-3 w-3 text-red-500" />
                    </Button>
                  </div>
                  <div className="text-xs font-medium">{item.item_description}</div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Unit</Label>
                      <input className="flex h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs" value={item.unit} readOnly />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input className="h-8 text-xs" type="number" min="0.01" step="0.01" value={item.quantity_ordered} onChange={e => updateItem(item.key, "quantity_ordered", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit Price</Label>
                      <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(item.key, "unit_price", parseFloat(e.target.value) || 0)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Total</Label>
                      <div className="h-8 flex items-center text-xs font-medium">${item.total_price.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              ))
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-semibold">Grand Total</span>
              <span className="text-lg font-bold">${grandTotal().toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function isSupplierSelectable(supplier: Supplier) {
  if (supplier.pq_status === "blacklisted" || supplier.pq_status === "suspended" || supplier.pq_status === "expired" || supplier.pq_status === "rejected") return false;
  if (supplier.pq_status === "approved") return !supplier.pq_expires_at || supplier.pq_expires_at >= new Date().toISOString().slice(0, 10);
  return !supplier.pq_status || supplier.pq_status === "not_started";
}

function supplierPqText(supplier: Supplier) {
  if (supplier.pq_status === "approved") return supplier.pq_expires_at ? `Approved until ${supplier.pq_expires_at}` : "Approved";
  if (!supplier.pq_status || supplier.pq_status === "not_started") return "Not prequalified";
  return supplier.pq_status.replaceAll("_", " ");
}

function SupplierPqHint({ supplier }: { supplier?: Supplier }) {
  if (!supplier) return null;
  if (supplier.pq_status === "approved") {
    return <p className="text-xs text-emerald-600">Supplier PQ approved{supplier.pq_expires_at ? ` until ${new Date(supplier.pq_expires_at).toLocaleDateString()}` : ""}.</p>;
  }
  if (!supplier.pq_status || supplier.pq_status === "not_started") {
    return <p className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Supplier has no PQ approval yet.</p>;
  }
  return <p className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" /> Supplier PQ status: {supplier.pq_status.replaceAll("_", " ")}.</p>;
}
