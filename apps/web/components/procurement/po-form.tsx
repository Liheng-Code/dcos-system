"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getPrById, getProjectById, insertPo, insertPoItems, listActiveSuppliers, listApprovedPrsByProjectId, listBoqRequisitionStatusByBoqItemIds, listPosByProjectId, listPrItemsByPrId } from "@/lib/procurement/procurement-service";
import { AlertTriangle, ArrowLeft, Loader2, Save, Trash2, Plus, Building2, Hash } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useProject } from "@/components/dashboard/project-context";

interface POItem {
  key: string;
  item_type: "section" | "line";
  pr_item_id: string;
  boq_item_id: string;
  item_code: string;
  item_description: string;
  materials_code: string;
  brand: string;
  country: string;
  unit: string;
  quantity_ordered: number;
  unit_rate_labor: number;
  unit_rate_materials: number;
  total_price: number;
  delivery_date_expected: string;
  notes: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  payment_terms: string | null;
  pq_status: string | null;
  pq_expires_at: string | null;
}

interface PRSummary {
  id: string;
  pr_number: string;
}

function newLineItem(): POItem {
  return {
    key: crypto.randomUUID(),
    item_type: "line",
    pr_item_id: "",
    boq_item_id: "",
    item_code: "",
    item_description: "",
    materials_code: "",
    brand: "",
    country: "",
    unit: "pcs",
    quantity_ordered: 1,
    unit_rate_labor: 0,
    unit_rate_materials: 0,
    total_price: 0,
    delivery_date_expected: "",
    notes: "",
  };
}

function newSectionHeader(): POItem {
  return { ...newLineItem(), item_type: "section", unit: "", quantity_ordered: 0 };
}

export function POForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedProjectId, selectedProject } = useProject();
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prs, setPrs] = useState<PRSummary[]>([]);
  const [selectedPrId, setSelectedPrId] = useState("");
  const [loadingBoq, setLoadingBoq] = useState(false);
  const [generatedPoNumber, setGeneratedPoNumber] = useState("");
  const [form, setForm] = useState({
    supplier_id: "",
    wbs_node_id: "",
    pr_id: "",
    po_date: new Date().toISOString().slice(0, 10),
    vendor_address: "",
    vendor_contact_person: "",
    vendor_contact_no: "",
    delivery_date_expected: "",
    delivery_address: "",
    currency: "USD",
    advance_payment_terms: "",
    other_payment_terms: "",
    delivery_terms: "",
    vat_rate: 10,
    notes: "",
  });
  const [items, setItems] = useState<POItem[]>([]);

  const loadReferenceData = useCallback(() => {
    if (!selectedProjectId) return;
    Promise.all([
      listActiveSuppliers("id, supplier_name, address, contact_person, phone, payment_terms, pq_status, pq_expires_at"),
      listApprovedPrsByProjectId(selectedProjectId),
    ]).then(([supRes, prRes]) => {
      if (supRes.data) {
        const rows = supRes.data as Supplier[];
        setSuppliers(rows.sort((a, b) => Number(isSupplierSelectable(b)) - Number(isSupplierSelectable(a)) || a.supplier_name.localeCompare(b.supplier_name)));
      }
      if (prRes.data) setPrs(prRes.data as PRSummary[]);
    });
  }, [selectedProjectId]);

  useEffect(() => { loadReferenceData(); }, [loadReferenceData]);

  useEffect(() => {
    if (!selectedProjectId || !selectedProject) {
      setGeneratedPoNumber("");
      return;
    }
    listPosByProjectId(selectedProjectId).then((poRes) => {
      getProjectById(selectedProjectId, "company_code").then((projRes) => {
        const companyCode = projRes.data?.company_code ?? "DCOS";
        const prefix = `${selectedProject.project_code}-${companyCode}-PO-`;
        const existing = (poRes.data ?? []) as { po_number: string }[];
        let maxSeq = 0;
        for (const po of existing) {
          if (po.po_number.startsWith(prefix)) {
            const num = parseInt(po.po_number.slice(prefix.length), 10);
            if (!isNaN(num) && num > maxSeq) maxSeq = num;
          }
        }
        setGeneratedPoNumber(`${prefix}${String(maxSeq + 1).padStart(3, "0")}`);
      });
    });
  }, [selectedProjectId, selectedProject]);

  useEffect(() => {
    const boqIds = searchParams?.get("boq_item_ids");
    if (!boqIds) return;
    setLoadingBoq(true);
    listBoqRequisitionStatusByBoqItemIds(boqIds.split(","))
      .then(({ data, error }) => {
        if (error) { toast.error(error.message); setLoadingBoq(false); return; }
        if (data && data.length > 0) {
          setItems(data.map((row: Record<string, unknown>) => ({
            ...newLineItem(),
            boq_item_id: row.boq_item_id as string,
            item_code: ((row.item_no as string) ?? (row.item_code as string) ?? "") as string,
            item_description: row.description as string,
            unit: row.unit as string,
            quantity_ordered: (row.remaining_quantity as number) || 0,
            unit_rate_materials: (row.unit_rate as number) || 0,
            total_price: ((row.remaining_quantity as number) || 0) * ((row.unit_rate as number) || 0),
          })));
        }
        setLoadingBoq(false);
      });
  }, [searchParams]);

  async function loadPRItems(prId: string) {
    const [itemsRes, prRes] = await Promise.all([
      listPrItemsByPrId(prId, "id, boq_item_id, item_code, item_description, unit, quantity, estimated_unit_price"),
      getPrById(prId, "wbs_node_id, ship_to"),
    ]);

    if (itemsRes.error) { toast.error(itemsRes.error.message); return; }
    if (!itemsRes.data || itemsRes.data.length === 0) {
      toast.error("Selected PR has no items");
      return;
    }

    setItems((itemsRes.data as { id: string; boq_item_id: string | null; item_code: string | null; item_description: string; unit: string; quantity: number; estimated_unit_price: number | null }[]).map(item => ({
      ...newLineItem(),
      pr_item_id: item.id,
      boq_item_id: item.boq_item_id ?? "",
      item_code: item.item_code ?? "",
      item_description: item.item_description,
      unit: item.unit,
      quantity_ordered: item.quantity,
      unit_rate_materials: item.estimated_unit_price ?? 0,
      total_price: item.quantity * (item.estimated_unit_price ?? 0),
    })));

    if (prRes.data) {
      setForm(prev => ({
        ...prev,
        wbs_node_id: prRes.data.wbs_node_id ?? "",
        delivery_address: prev.delivery_address || prRes.data.ship_to || "",
      }));
    }
  }

  function handlePRSelect(prId: string) {
    setSelectedPrId(prId);
    setForm(prev => ({ ...prev, pr_id: prId }));
    if (prId) loadPRItems(prId);
    else setItems([]);
  }

  function handleSupplierSelect(supplierId: string) {
    updateForm("supplier_id", supplierId);
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setForm(prev => ({
        ...prev,
        vendor_address: supplier.address ?? "",
        vendor_contact_person: supplier.contact_person ?? "",
        vendor_contact_no: supplier.phone ?? "",
        other_payment_terms: prev.other_payment_terms || supplier.payment_terms || "",
      }));
    }
  }

  function updateForm(field: string, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function updateItem(key: string, field: keyof POItem, value: string | number) {
    setItems(prev => prev.map(item => {
      if (item.key !== key) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity_ordered" || field === "unit_rate_labor" || field === "unit_rate_materials") {
        updated.total_price = (updated.quantity_ordered || 0) * ((updated.unit_rate_labor || 0) + (updated.unit_rate_materials || 0));
      }
      return updated;
    }));
  }

  function addLineItem() {
    setItems(prev => [...prev, newLineItem()]);
  }

  function addSectionHeader() {
    setItems(prev => [...prev, newSectionHeader()]);
  }

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function subtotal() {
    return items.filter(i => i.item_type === "line").reduce((s, i) => s + i.total_price, 0);
  }

  function taxAmount() {
    return subtotal() * ((Number(form.vat_rate) || 0) / 100);
  }

  function grandTotal() {
    return subtotal() + taxAmount();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedProjectId) { toast.error("Select a project from the top bar"); return; }
    if (!form.supplier_id) { toast.error("Select a supplier"); return; }
    const selectedSupplier = suppliers.find(s => s.id === form.supplier_id);
    if (selectedSupplier && !isSupplierSelectable(selectedSupplier)) {
      toast.error("Supplier is not prequalified for PO award");
      return;
    }
    const lineItems = items.filter(i => i.item_type === "line");
    if (lineItems.length === 0) { toast.error("Add at least one item"); return; }

    setSaving(true);

    const poData = {
      po_number: generatedPoNumber,
      project_id: selectedProjectId,
      wbs_node_id: form.wbs_node_id || null,
      supplier_id: form.supplier_id,
      pr_id: form.pr_id || null,
      po_date: form.po_date || null,
      vendor_address: form.vendor_address || null,
      vendor_contact_person: form.vendor_contact_person || null,
      vendor_contact_no: form.vendor_contact_no || null,
      delivery_date_expected: form.delivery_date_expected || null,
      delivery_address: form.delivery_address || null,
      currency: form.currency,
      advance_payment_terms: form.advance_payment_terms || null,
      other_payment_terms: form.other_payment_terms || null,
      payment_terms: form.advance_payment_terms || form.other_payment_terms || null,
      delivery_terms: form.delivery_terms || null,
      vat_rate: Number(form.vat_rate) || 0,
      total_amount: subtotal(),
      tax_amount: taxAmount(),
      grand_total: grandTotal(),
      notes: form.notes || null,
    };

    const { data: poResult, error: poError } = await insertPo(poData);
    if (poError) { toast.error(poError.message); setSaving(false); return; }

    const poId = (poResult as { id: string }).id;

    const itemInserts = items.map((i, idx) => ({
      po_id: poId,
      pr_item_id: i.pr_item_id || null,
      boq_item_id: i.boq_item_id || null,
      line_no: idx + 1,
      item_type: i.item_type,
      item_code: i.item_code || null,
      item_description: i.item_description,
      materials_code: i.item_type === "line" ? (i.materials_code || null) : null,
      brand: i.item_type === "line" ? (i.brand || null) : null,
      country: i.item_type === "line" ? (i.country || null) : null,
      unit: i.item_type === "section" ? null : i.unit,
      quantity_ordered: i.item_type === "section" ? 0 : i.quantity_ordered,
      unit_rate_labor: i.item_type === "section" ? 0 : i.unit_rate_labor,
      unit_rate_materials: i.item_type === "section" ? 0 : i.unit_rate_materials,
      unit_price: i.item_type === "section" ? 0 : i.unit_rate_labor + i.unit_rate_materials,
      total_price: i.item_type === "section" ? 0 : i.total_price,
      delivery_date_expected: i.delivery_date_expected || null,
      notes: i.notes || null,
    }));

    const { error: itemsError } = await insertPoItems(itemInserts);
    if (itemsError) { toast.error(itemsError.message); setSaving(false); return; }

    toast.success("Purchase order created");
    router.push(`/dashboard/procurement/po/${poId}`);
  }

  if (!selectedProjectId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-2">
        <Building2 className="h-8 w-8" />
        <p>Select a project from the top bar to create a new Purchase Order.</p>
      </div>
    );
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
              <Label>Project</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedProject?.project_name}</span>
                <span className="font-mono text-xs text-muted-foreground">({selectedProject?.project_code})</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>PPO No.</Label>
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-mono">
                <Hash className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{generatedPoNumber || "Generating..."}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={form.po_date} onChange={e => updateForm("po_date", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={form.currency} onChange={e => updateForm("currency", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Supplier *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.supplier_id} onChange={e => handleSupplierSelect(e.target.value)}>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id} disabled={!isSupplierSelectable(s)}>{s.supplier_name} - {supplierPqText(s)}</option>)}
              </select>
              {form.supplier_id && <SupplierPqHint supplier={suppliers.find(s => s.id === form.supplier_id)} />}
            </div>

            <div className="space-y-1.5">
              <Label>Vendor Address</Label>
              <textarea className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-y min-h-[60px]" value={form.vendor_address} onChange={e => updateForm("vendor_address", e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.vendor_contact_person} onChange={e => updateForm("vendor_contact_person", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact No.</Label>
                <Input value={form.vendor_contact_no} onChange={e => updateForm("vendor_contact_no", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Source PR (optional)</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={selectedPrId} onChange={e => handlePRSelect(e.target.value)}>
                <option value="">Direct PO (no PR)</option>
                {prs.map(p => <option key={p.id} value={p.id}>{p.pr_number}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Ship To</Label>
              <Input value={form.delivery_address} onChange={e => updateForm("delivery_address", e.target.value)} placeholder="Delivery location" />
            </div>

            <div className="space-y-1.5">
              <Label>Expected Delivery</Label>
              <Input type="date" value={form.delivery_date_expected} onChange={e => updateForm("delivery_date_expected", e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Credit Terms</h3>

            <div className="space-y-1.5">
              <Label>Advance Payment</Label>
              <Input value={form.advance_payment_terms} onChange={e => updateForm("advance_payment_terms", e.target.value)} placeholder="N/A" />
            </div>

            <div className="space-y-1.5">
              <Label>Other Payment</Label>
              <Input value={form.other_payment_terms} onChange={e => updateForm("other_payment_terms", e.target.value)} placeholder="15 days" />
            </div>

            <div className="space-y-1.5">
              <Label>Delivery Terms</Label>
              <Input value={form.delivery_terms} onChange={e => updateForm("delivery_terms", e.target.value)} placeholder="Incoterms" />
            </div>

            <div className="space-y-1.5">
              <Label>VAT Rate (%)</Label>
              <Input type="number" min="0" step="0.01" value={form.vat_rate} onChange={e => updateForm("vat_rate", parseFloat(e.target.value) || 0)} />
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => updateForm("notes", e.target.value)} />
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total Amount</span>
                <span className="font-medium">${subtotal().toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">VAT ({form.vat_rate}%)</span>
                <span className="font-medium">${taxAmount().toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-sm font-semibold">Grand Total</span>
                <span className="text-lg font-bold">${grandTotal().toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Items</h3>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={addSectionHeader} className="gap-1"><Plus className="h-3 w-3" /> Add Section Header</Button>
              <Button type="button" variant="outline" size="sm" onClick={addLineItem} className="gap-1"><Plus className="h-3 w-3" /> Add Item</Button>
            </div>
          </div>

          {loadingBoq ? (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading BOQ items…
            </p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Select a PR to load items, or add manually.</p>
          ) : (
            items.map((item, idx) => (
              <div key={item.key} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {item.item_type === "section" ? `Section ${idx + 1}` : `Item ${idx + 1}`}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(item.key)}>
                    <Trash2 className="h-3 w-3 text-red-500" />
                  </Button>
                </div>

                {item.item_type === "section" ? (
                  <textarea
                    className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm font-semibold placeholder:text-muted-foreground placeholder:font-normal focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-y min-h-[40px]"
                    value={item.item_description}
                    onChange={e => updateItem(item.key, "item_description", e.target.value)}
                    placeholder="Section heading, e.g. 'I Supply and Installation External Fencing Works'"
                  />
                ) : (
                  <>
                    <textarea
                      className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none resize-y min-h-[60px]"
                      style={{ whiteSpace: "pre-line" }}
                      value={item.item_description}
                      onChange={e => updateItem(item.key, "item_description", e.target.value)}
                      placeholder={"Description\n-Sub-item detail line 1\n-Sub-item detail line 2"}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Materials Code</Label>
                        <Input className="h-8 text-xs" value={item.materials_code} onChange={e => updateItem(item.key, "materials_code", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Brand</Label>
                        <Input className="h-8 text-xs" value={item.brand} onChange={e => updateItem(item.key, "brand", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Country</Label>
                        <Input className="h-8 text-xs" value={item.country} onChange={e => updateItem(item.key, "country", e.target.value)} />
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <Input className="h-8 text-xs" value={item.unit} onChange={e => updateItem(item.key, "unit", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Qty</Label>
                        <Input className="h-8 text-xs" type="number" min="0.01" step="0.01" value={item.quantity_ordered} onChange={e => updateItem(item.key, "quantity_ordered", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rate (Labor)</Label>
                        <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.unit_rate_labor} onChange={e => updateItem(item.key, "unit_rate_labor", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Rate (Materials)</Label>
                        <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={item.unit_rate_materials} onChange={e => updateItem(item.key, "unit_rate_materials", parseFloat(e.target.value) || 0)} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Amount</Label>
                        <div className="h-8 flex items-center text-xs font-medium">${item.total_price.toLocaleString()}</div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
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
