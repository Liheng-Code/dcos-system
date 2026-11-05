"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { insertRfq, insertRfqSuppliers, listActiveSuppliers, listApprovedPrs, listPrItemsByPrId } from "@/lib/procurement/procurement-queries";
import { AlertTriangle, ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { bangkokToday } from "@/lib/procurement/sealed-bids";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { procErrorMessage } from "@/lib/procurement/procurement-transitions";
import { createClient } from "@/lib/supabase/client";
import { suppliersMatchingTrade, type ApprovedTrade } from "@/lib/procurement/rfq-trade-rules";
import { getPrPackage, listActiveApprovedTrades, type PrPackage } from "@/lib/procurement/rfq-trade-service";

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
  // Bidders by trade: the source PR's package trade against the suppliers' active approved trades (soft filter)
  const db = useMemo(() => createClient(), []);
  const [prPackage, setPrPackage] = useState<PrPackage | null>(null);
  const [trades, setTrades] = useState<ApprovedTrade[]>([]);
  const [tradeOnly, setTradeOnly] = useState(false);
  useEffect(() => { listActiveApprovedTrades(db).then(setTrades).catch(() => setTrades([])); }, [db]);
  const matching = useMemo(() => suppliersMatchingTrade(trades, prPackage?.trade_category, bangkokToday()), [trades, prPackage]);
  const shownSuppliers = useMemo(() => {
    const list = tradeOnly && prPackage?.trade_category ? suppliers.filter((x) => matching.has(x.id)) : suppliers;
    return [...list].sort((a, b) => Number(matching.has(b.id)) - Number(matching.has(a.id)));
  }, [suppliers, matching, tradeOnly, prPackage]);

  useEffect(() => {
    Promise.all([
      listApprovedPrs(),
      listActiveSuppliers("id, supplier_name, pq_status, pq_expires_at"),
    ]).then(([prRes, supRes]) => {
      if (prRes.data) setPrs(prRes.data as PRSummary[]);
      if (supRes.data) {
        const rows = supRes.data as Supplier[];
        setSuppliers(rows.sort((a, b) => Number(isSupplierSelectable(b)) - Number(isSupplierSelectable(a)) || a.supplier_name.localeCompare(b.supplier_name)));
      }
    });
  }, []);

  async function loadPRItems(prId: string) {
    const { data } = await listPrItemsByPrId(prId, "id, line_no, item_code, item_description, unit, quantity");
    if (data) setPrItems(data as PRItem[]);
    else setPrItems([]);
  }

  function handlePRSelect(prId: string) {
    setForm(prev => ({ ...prev, pr_id: prId }));
    if (prId) loadPRItems(prId);
    setPrPackage(null);
    if (prId) getPrPackage(db, prId).then(setPrPackage).catch(() => setPrPackage(null));
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
    if (!form.response_deadline) { toast.error("Response deadline is required"); return; }
    if (form.response_deadline < bangkokToday()) { toast.error("Response deadline cannot be in the past"); return; }

    setSaving(true);

    const { data: rfqResult, error: rfqError } = await insertRfq({
        pr_id: form.pr_id,
        response_deadline: form.response_deadline,
        evaluation_method: form.evaluation_method,
        status: "draft",
        notes: form.notes || null,
      });

    if (rfqError) { toast.error(procErrorMessage(rfqError)); setSaving(false); return; }

    const rfqId = (rfqResult as { id: string }).id;

    const supplierInserts = selectedSuppliers.map(supId => ({
      rfq_id: rfqId,
      supplier_id: supId,
    }));

    const { error: supErr } = await insertRfqSuppliers(supplierInserts);
    if (supErr) { toast.error(procErrorMessage(supErr)); setSaving(false); return; }

    const createdNumber = (rfqResult as { rfq_number?: string }).rfq_number;
    toast.success(createdNumber ? `RFQ ${createdNumber} created` : "RFQ created");
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
              <Label>Response Deadline *</Label>
              <Input type="date" required min={bangkokToday()} value={form.response_deadline} onChange={e => setForm(prev => ({ ...prev, response_deadline: e.target.value }))} />
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
            {prPackage && (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <span>
                  Package <span className="font-mono">{prPackage.code}</span> {prPackage.name}
                  {prPackage.trade_category
                    ? <>: trade <span className="font-medium">{prPackage.trade_category}</span>, {matching.size} supplier{matching.size === 1 ? "" : "s"} approved for it</>
                    : <>: no trade set on the package</>}
                </span>
                {prPackage.trade_category && (
                  <label className="ml-auto flex items-center gap-1.5">
                    <input type="checkbox" className="h-3.5 w-3.5" checked={tradeOnly} onChange={(e) => setTradeOnly(e.target.checked)} /> Matching trade only
                  </label>
                )}
              </div>
            )}
            {suppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No active suppliers found.</p>
            ) : (
              <div className="max-h-64 overflow-y-auto space-y-2">
                {shownSuppliers.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">No supplier holds an active approved trade for this package. Add trades in Pre-Qualification, or clear the filter.</p>}
                {shownSuppliers.map(s => {
                  const selectable = isSupplierSelectable(s);
                  return (
                  <label key={s.id} className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${selectable ? "cursor-pointer hover:bg-muted/30" : "cursor-not-allowed bg-muted/40 text-muted-foreground"}`}>
                    <input type="checkbox" className="h-4 w-4" disabled={!selectable} checked={selectedSuppliers.includes(s.id)} onChange={() => toggleSupplier(s.id)} />
                    <span className="flex-1">{s.supplier_name}</span>
                    {matching.has(s.id) && <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">Trade match</span>}
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
