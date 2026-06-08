"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle, ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface PRSummary {
  id: string;
  pr_number: string;
}

interface Supplier {
  id: string;
  supplier_name: string;
  pq_status: string | null;
  pq_expires_at: string | null;
}

interface PRItem {
  id: string;
  line_no: number;
  item_code: string | null;
  item_description: string;
  unit: string;
  quantity: number;
}

export function RFQForm() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [prs, setPrs] = useState<PRSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [prItems, setPrItems] = useState<PRItem[]>([]);
  const [form, setForm] = useState({
    pr_id: "",
    response_deadline: "",
    evaluation_method: "lowest_price",
    notes: "",
  });
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("procurement_prs").select("id, pr_number").in("approval_status", ["approved", "closed"]).order("created_at", { ascending: false }),
      supabase.from("procurement_suppliers").select("id, supplier_name, pq_status, pq_expires_at").eq("status", "active").order("supplier_name"),
    ]).then(([prRes, supRes]) => {
      if (prRes.data) setPrs(prRes.data as PRSummary[]);
      if (supRes.data) {
        const rows = supRes.data as Supplier[];
        setSuppliers(rows.sort((a, b) => Number(isSupplierSelectable(b)) - Number(isSupplierSelectable(a)) || a.supplier_name.localeCompare(b.supplier_name)));
      }
    });
  }, []);

  async function loadPRItems(prId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("procurement_pr_items")
      .select("id, line_no, item_code, item_description, unit, quantity")
      .eq("pr_id", prId)
      .order("line_no");
    if (data) setPrItems(data as PRItem[]);
    else setPrItems([]);
  }

  function handlePRSelect(prId: string) {
    setForm(prev => ({ ...prev, pr_id: prId }));
    if (prId) loadPRItems(prId);
    else setPrItems([]);
  }

  function toggleSupplier(supplierId: string) {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier && !isSupplierSelectable(supplier)) {
      toast.error("Supplier is not prequalified for RFQ invitation");
      return;
    }
    setSelectedSuppliers(prev =>
      prev.includes(supplierId) ? prev.filter(id => id !== supplierId) : [...prev, supplierId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pr_id) { toast.error("Select a source PR"); return; }
    if (selectedSuppliers.length === 0) { toast.error("Select at least one supplier"); return; }

    setSaving(true);
    const supabase = createClient();

    const { data: rfqResult, error: rfqError } = await supabase
      .from("procurement_rfqs")
      .insert([{
        pr_id: form.pr_id,
        response_deadline: form.response_deadline || null,
        evaluation_method: form.evaluation_method,
        status: "draft",
        notes: form.notes || null,
      }])
      .select("id")
      .single();

    if (rfqError) { toast.error(rfqError.message); setSaving(false); return; }

    const rfqId = (rfqResult as { id: string }).id;

    await supabase.from("procurement_rfqs").update({
      rfq_number: `RFQ-${new Date().getFullYear()}-${rfqId.slice(0, 4).toUpperCase()}`,
    }).eq("id", rfqId);

    const supplierInserts = selectedSuppliers.map(supId => ({
      rfq_id: rfqId,
      supplier_id: supId,
    }));

    const { error: supErr } = await supabase.from("procurement_rfq_suppliers").insert(supplierInserts);
    if (supErr) { toast.error(supErr.message); setSaving(false); return; }

    toast.success("RFQ created");
    router.push(`/dashboard/procurement/rfq/${rfqId}`);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
          <h1 className="text-2xl font-semibold tracking-tight">New RFQ</h1>
        </div>
        <Button type="submit" disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Create RFQ
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Details</h3>

            <div className="space-y-1.5">
              <Label>Source PR *</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.pr_id} onChange={e => handlePRSelect(e.target.value)}>
                <option value="">Select PR...</option>
                {prs.map(p => <option key={p.id} value={p.id}>{p.pr_number}</option>)}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Response Deadline</Label>
              <Input type="date" value={form.response_deadline} onChange={e => setForm(prev => ({ ...prev, response_deadline: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label>Evaluation Method</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={form.evaluation_method} onChange={e => setForm(prev => ({ ...prev, evaluation_method: e.target.value }))}>
                <option value="lowest_price">Lowest Price</option>
                <option value="weighted">Weighted Score</option>
                <option value="technical_commercial">Technical &amp; Commercial</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))} placeholder="RFQ notes" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-4">
            <h3 className="font-semibold text-sm">Suppliers to Invite *</h3>
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No active suppliers found.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {suppliers.map(s => {
                  const selectable = isSupplierSelectable(s);
                  return (
                  <label key={s.id} className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${selectable ? "cursor-pointer hover:bg-muted/30" : "cursor-not-allowed bg-muted/40 text-muted-foreground"}`}>
                    <input type="checkbox" className="h-4 w-4" disabled={!selectable} checked={selectedSuppliers.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                    <span className="flex-1">{s.supplier_name}</span>
                    <SupplierPqHint supplier={s} />
                  </label>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {prItems.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3">PR Items</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Code</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit</th>
                </tr>
              </thead>
              <tbody>
                {prItems.map(item => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-sm">{item.line_no}</td>
                    <td className="px-3 py-2 text-sm text-muted-foreground">{item.item_code ?? "—"}</td>
                    <td className="px-3 py-2 text-sm">{item.item_description}</td>
                    <td className="px-3 py-2 text-sm text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-sm text-right">{item.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </form>
  );
}

function isSupplierSelectable(supplier: Supplier) {
  if (supplier.pq_status === "blacklisted" || supplier.pq_status === "suspended" || supplier.pq_status === "expired" || supplier.pq_status === "rejected") return false;
  if (supplier.pq_status === "approved") return !supplier.pq_expires_at || supplier.pq_expires_at >= new Date().toISOString().slice(0, 10);
  return !supplier.pq_status || supplier.pq_status === "not_started";
}

function SupplierPqHint({ supplier }: { supplier: Supplier }) {
  if (supplier.pq_status === "approved") {
    return <span className="text-xs text-emerald-600">Approved{supplier.pq_expires_at ? ` until ${new Date(supplier.pq_expires_at).toLocaleDateString()}` : ""}</span>;
  }
  if (!supplier.pq_status || supplier.pq_status === "not_started") {
    return <span className="flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> Not prequalified</span>;
  }
  return <span className="flex items-center gap-1 text-xs text-red-600"><AlertTriangle className="h-3 w-3" /> {supplier.pq_status.replaceAll("_", " ")}</span>;
}
