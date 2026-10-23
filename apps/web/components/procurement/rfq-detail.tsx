"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, ArrowLeft, Send, XCircle, Ban,
  Plus, Save, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { getPoByQuotationId, getRfqById, insertQuotation, insertQuotationItems, listPrItemsByPrId, listQuotationsByRfqId, listRfqSuppliersByRfqId, scoreQuotation, transitionRfq, updateRfqSuppliersByRfqIdAndSupplierId } from "@/lib/procurement/procurement-queries";
import { bangkokToday, bidsOpenAt, isBidsOpen } from "@/lib/procurement/sealed-bids";
import { availableTransitions, procErrorMessage, type ProcTransition } from "@/lib/procurement/procurement-transitions";
import { ReasonDialog } from "@/components/procurement/reason-dialog";
import { RfqComparison } from "@/components/procurement/rfq-comparison";
import { useProcurementPermissions } from "@/components/procurement/use-procurement-permissions";

interface RFQRecord {
  id: string;
  pr_id: string | null;
  rfq_number: string;
  issue_date: string | null;
  response_deadline: string | null;
  evaluation_method: string;
  status: string;
  awarded_supplier_id: string | null;
  award_reason: string | null;
  awarded_at: string | null;
  status_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface RFQSupplier {
  id: string;
  supplier_id: string;
  invited_at: string;
  responded: boolean;
  procurement_suppliers: { supplier_name: string } | null;
}

interface QuotationItem {
  id: string;
  line_no: number;
  item_code: string | null;
  item_description: string;
  unit: string;
  quantity: number;
  unit_price: number;
  total: number;
  delivery_date: string | null;
  pr_item_id: string | null;
}

interface Quotation {
  id: string;
  supplier_id: string;
  quotation_ref: string | null;
  received_at: string | null;
  currency: string;
  valid_until: string | null;
  payment_terms: string | null;
  delivery_lead_time: number | null;
  total_amount: number;
  technical_score: number | null;
  commercial_score: number | null;
  combined_score: number | null;
  evaluation_notes: string | null;
  is_awarded: boolean;
  status: string;
  procurement_quotation_items: QuotationItem[];
  procurement_suppliers: { supplier_name: string } | null;
}

interface PRItemSummary {
  id: string;
  line_no: number;
  item_code: string | null;
  item_description: string;
  unit: string;
  quantity: number;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  issued: "bg-blue-500/10 text-blue-600 border-blue-200",
  quotations_received: "bg-amber-500/10 text-amber-600 border-amber-200",
  under_evaluation: "bg-purple-500/10 text-purple-600 border-purple-200",
  awarded: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  rejected_all: "bg-red-500/10 text-red-600 border-red-200",
  cancelled: "bg-gray-500/10 text-gray-500 border-gray-200",
};

export function RFQDetail({ id }: { id: string }) {
  const router = useRouter();
  const [rfq, setRfq] = useState<RFQRecord | null>(null);
  const [invitedSuppliers, setInvitedSuppliers] = useState<RFQSupplier[]>([]);
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [prItems, setPrItems] = useState<PRItemSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionLoading, setActionLoading] = useState("");
  const { can, userId } = useProcurementPermissions(["rfq"]);
  const [pending, setPending] = useState<ProcTransition | null>(null);

  const [showAddQuotation, setShowAddQuotation] = useState(false);
  const [newQuote, setNewQuote] = useState({
    supplier_id: "",
    quotation_ref: "",
    currency: "USD",
    valid_until: "",
    payment_terms: "",
    delivery_lead_time: "",
    received_at: new Date().toISOString().slice(0, 10),
  });
  const [quoteItems, setQuoteItems] = useState<(PRItemSummary & { unit_price: number; total: number; lead_time_days: string; notes: string })[]>([]);

  const fetchDetail = useCallback(() => {
    Promise.all([
      getRfqById(id, "*"),
      listRfqSuppliersByRfqId(id),
      listQuotationsByRfqId(id),
    ]).then(([rfqRes, supRes, quoRes]) => {
      if (rfqRes.data) setRfq(rfqRes.data as RFQRecord);
      if (supRes.data) setInvitedSuppliers(supRes.data as unknown as RFQSupplier[]);
      if (quoRes.data) {
        setQuotations(quoRes.data as unknown as Quotation[]);
      }

      if (rfqRes.data) {
        const prId = (rfqRes.data as RFQRecord).pr_id;
        if (prId) {
          listPrItemsByPrId(prId, "*").then(({ data }) => {
            if (data) setPrItems(data as PRItemSummary[]);
          });
        }
      }

      setRefreshKey((k) => k + 1);
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function runTransition(t: ProcTransition, reason?: string): Promise<boolean> {
    setActionLoading(t.to);
    const { error } = await transitionRfq(id, t.to, reason);
    setActionLoading("");
    if (error) { toast.error(procErrorMessage(error)); return false; }
    toast.success(`RFQ ${t.to.replace(/_/g, " ")}`);
    fetchDetail();
    return true;
  }

  function handleActionClick(t: ProcTransition) {
    if (t.reasonRequired) { setPending(t); return; }
    void runTransition(t);
  }

  function initQuoteFromSupplier(supplierId: string) {
    const sup = invitedSuppliers.find(s => s.supplier_id === supplierId);
    if (!sup) return;
    setNewQuote({
      supplier_id: supplierId,
      quotation_ref: "",
      currency: "USD",
      valid_until: "",
      payment_terms: "",
      delivery_lead_time: "",
      received_at: new Date().toISOString().slice(0, 10),
    });
    setQuoteItems(prItems.map(pi => ({ ...pi, unit_price: 0, total: 0, lead_time_days: "", notes: "" })));
    setShowAddQuotation(true);
  }

  function updateQuoteItemText(prItemId: string, field: "lead_time_days" | "notes", value: string) {
    setQuoteItems(prev => prev.map(qi => qi.id === prItemId ? { ...qi, [field]: value } : qi));
  }

  function updateQuoteItem(prItemId: string, field: string, value: number) {
    setQuoteItems(prev => prev.map(qi => {
      if (qi.id !== prItemId) return qi;
      const updated = { ...qi, [field]: value };
      if (field === "unit_price" || field === "quantity") {
        updated.total = updated.unit_price * updated.quantity;
      }
      return updated;
    }));
  }

  async function saveQuotation() {
    if (!newQuote.supplier_id) { toast.error("Select supplier"); return; }
    if (quoteItems.length === 0 || quoteItems.every(qi => qi.unit_price <= 0)) {
      toast.error("Enter unit prices for at least one item");
      return;
    }

    setActionLoading("saveQuote");

    const totalAmount = quoteItems.reduce((s, qi) => s + (qi.unit_price * qi.quantity), 0);

    const { data: quoResult, error: quoError } = await insertQuotation({
        rfq_id: id,
        supplier_id: newQuote.supplier_id,
        quotation_ref: newQuote.quotation_ref || null,
        currency: newQuote.currency,
        received_at: newQuote.received_at ? new Date(newQuote.received_at).toISOString() : null,
        valid_until: newQuote.valid_until || null,
        payment_terms: newQuote.payment_terms || null,
        delivery_lead_time: newQuote.delivery_lead_time ? parseInt(newQuote.delivery_lead_time) : null,
        total_amount: totalAmount,
        status: "pending",
      });

    if (quoError) { toast.error(procErrorMessage(quoError)); setActionLoading(""); return; }

    const quotationId = (quoResult as { id: string }).id;

    const itemInserts = quoteItems
      .filter(qi => qi.unit_price > 0)
      .map((qi, idx) => ({
        quotation_id: quotationId,
        pr_item_id: qi.id,
        line_no: idx + 1,
        item_code: qi.item_code,
        item_description: qi.item_description,
        unit: qi.unit,
        quantity: qi.quantity,
        unit_price: qi.unit_price,
        total: qi.unit_price * qi.quantity,
        lead_time_days: qi.lead_time_days !== "" && Number(qi.lead_time_days) >= 0 ? Math.round(Number(qi.lead_time_days)) : null,
        notes: qi.notes.trim() || null,
      }));

    await insertQuotationItems(itemInserts);

    await updateRfqSuppliersByRfqIdAndSupplierId({ responded: true }, id, newQuote.supplier_id);

    // Only the first recorded quotation moves an issued RFQ on; repeating the edge would error.
    if (rfq?.status === "issued") {
      const { error: stError } = await transitionRfq(id, "quotations_received");
      if (stError) toast.error(procErrorMessage(stError));
    }

    toast.success("Quotation recorded");
    setShowAddQuotation(false);
    fetchDetail();
    setActionLoading("");
  }

  async function handleEvaluate(quotationId: string, field: "technical_score" | "commercial_score", value: number | null) {
    const q = quotations.find(q => q.id === quotationId);
    if (!q) return;
    if (value != null && (value < 0 || value > 100)) { toast.error("Score must be between 0 and 100"); return; }
    const technical = field === "technical_score" ? value : q.technical_score;
    const commercial = field === "commercial_score" ? value : q.commercial_score;
    if (technical === q.technical_score && commercial === q.commercial_score) return;

    // The server computes the combined score and moves the RFQ to under_evaluation.
    const { error } = await scoreQuotation(quotationId, technical, commercial);
    if (error) { toast.error(procErrorMessage(error)); fetchDetail(); return; }

    toast.success("Score saved");
    fetchDetail();
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!rfq) return <div className="py-20 text-center text-muted-foreground">RFQ not found.</div>;

  const transitions = availableTransitions("rfq", rfq.status, { can, userId });
  // Sealed bids: amounts stay hidden until the end of the deadline day (Bangkok). The database enforces it;
  // this only drives the messaging and hides controls that would be rejected.
  const sealedUntil = !isBidsOpen(rfq.response_deadline, rfq.status) ? bidsOpenAt(rfq.response_deadline) : null;
  const todayText = bangkokToday();
  const issueBlocked = !rfq.response_deadline
    ? "Set a response deadline before issuing this RFQ."
    : rfq.response_deadline < todayText
      ? "The response deadline is in the past. Set a deadline of today or later before issuing."
      : null;
  const canAddQuote = ["issued", "quotations_received", "under_evaluation"].includes(rfq.status) && rfq.status !== "awarded";
  const canAward = ["quotations_received", "under_evaluation"].includes(rfq.status) && can("rfq", "approve");
  const awardedQuote = quotations.find(q => q.is_awarded);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/procurement/rfq")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{rfq.rfq_number}</h1>
          <Badge className={STATUS_COLORS[rfq.status] ?? ""} variant="outline">
            {rfq.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {transitions.map(t => {
            const Icon = t.to === "issued" ? Send : t.to === "cancelled" ? Ban : XCircle;
            const outline = t.to !== "issued";
            return (
              <Button
                key={t.to}
                size="sm"
                variant={outline ? "outline" : "default"}
                className={outline ? "text-red-600" : "bg-blue-600 hover:bg-blue-700"}
                onClick={() => handleActionClick(t)}
                disabled={actionLoading === t.to || (t.to === "issued" && issueBlocked != null)}
                title={t.to === "issued" && issueBlocked ? issueBlocked : undefined}
              >
                {actionLoading === t.to ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Icon className="h-4 w-4 mr-1" />}
                {t.label}
              </Button>
            );
          })}
        </div>
      </div>

      {rfq.status === "draft" && issueBlocked && transitions.some(t => t.to === "issued") && (
        <p className="text-sm text-amber-700">{issueBlocked}</p>
      )}
      {rfq.status_reason && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {rfq.status === "cancelled" ? "Cancelled" : rfq.status === "rejected_all" ? "All quotations rejected" : "Note"}: {rfq.status_reason}
        </div>
      )}

      <ReasonDialog
        open={pending != null}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={pending?.label ?? ""}
        minLength={pending?.minReasonLength}
        confirmLabel={pending?.label ?? "Confirm"}
        destructive
        onConfirm={async (reason) => {
          if (!pending) return;
          const ok = await runTransition(pending, reason);
          if (ok) setPending(null);
        }}
      />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Source PR</span><p className="font-medium">{rfq.pr_id ? "Linked" : "—"}</p></div>
              <div><span className="text-muted-foreground">Evaluation Method</span><p className="font-medium capitalize">{rfq.evaluation_method.replace(/_/g, " ")}</p></div>
              <div><span className="text-muted-foreground">Issue Date</span><p className="font-medium">{rfq.issue_date ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Response Deadline</span><p className="font-medium">{rfq.response_deadline ?? "—"}</p></div>
              {rfq.award_reason && (
                <div className="col-span-2"><span className="text-muted-foreground">Award Reason</span><p className="font-medium">{rfq.award_reason}</p></div>
              )}
            </div>
            {rfq.notes && <div className="text-sm"><span className="text-muted-foreground">Notes</span><p>{rfq.notes}</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(rfq.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Updated</span><span>{new Date(rfq.updated_at).toLocaleString()}</span></div>
              {rfq.awarded_at && <div className="flex justify-between"><span className="text-muted-foreground">Awarded</span><span>{new Date(rfq.awarded_at).toLocaleString()}</span></div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="font-semibold text-sm mb-3">Invited Suppliers</h3>
          {invitedSuppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No suppliers invited.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Supplier</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Invited At</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Responded</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {invitedSuppliers.map(s => {
                  const hasQuote = quotations.some(q => q.supplier_id === s.supplier_id);
                  return (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-sm">{s.procurement_suppliers?.supplier_name ?? "—"}</td>
                      <td className="px-3 py-2 text-sm">{new Date(s.invited_at).toLocaleDateString()}</td>
                      <td className="px-3 py-2">
                        {s.responded ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Responded</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-200">Pending</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!hasQuote && canAddQuote && (
                          <Button variant="ghost" size="sm" onClick={() => initQuoteFromSupplier(s.supplier_id)}>
                            <Plus className="h-3 w-3 mr-1" /> Add Quote
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {showAddQuotation && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">New Quotation</h3>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddQuotation(false)}>Cancel</Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Quotation Ref</Label>
                <Input value={newQuote.quotation_ref} onChange={e => setNewQuote(prev => ({ ...prev, quotation_ref: e.target.value }))} placeholder="Supplier ref" />
              </div>
              <div className="space-y-1.5">
                <Label>Currency</Label>
                <Input value={newQuote.currency} onChange={e => setNewQuote(prev => ({ ...prev, currency: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valid Until</Label>
                <Input type="date" value={newQuote.valid_until} onChange={e => setNewQuote(prev => ({ ...prev, valid_until: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms</Label>
                <Input value={newQuote.payment_terms} onChange={e => setNewQuote(prev => ({ ...prev, payment_terms: e.target.value }))} placeholder="Net 30" />
              </div>
              <div className="space-y-1.5">
                <Label>Delivery Lead (days)</Label>
                <Input type="number" min="1" value={newQuote.delivery_lead_time} onChange={e => setNewQuote(prev => ({ ...prev, delivery_lead_time: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Received Date</Label>
                <Input type="date" value={newQuote.received_at} onChange={e => setNewQuote(prev => ({ ...prev, received_at: e.target.value }))} />
              </div>
            </div>
            <h4 className="text-sm font-semibold">Pricing</h4>
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Item</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit Price</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Lead time (days)</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Notes</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {quoteItems.map(qi => (
                  <tr key={qi.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-sm">{qi.item_description}</td>
                    <td className="px-3 py-2 text-sm text-right">{qi.quantity} {qi.unit}</td>
                    <td className="px-3 py-2 text-sm text-right">
                      <Input className="h-8 w-28 ml-auto text-xs text-right" type="number" min="0" step="0.01" value={qi.unit_price || ""} onChange={e => updateQuoteItem(qi.id, "unit_price", parseFloat(e.target.value) || 0)} />
                    </td>
                    <td className="px-3 py-2 text-sm text-right">
                      <Input className="h-8 w-20 ml-auto text-xs text-right" type="number" min="0" step="1" value={qi.lead_time_days} onChange={e => updateQuoteItemText(qi.id, "lead_time_days", e.target.value)} />
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <Input className="h-8 min-w-32 text-xs" value={qi.notes} onChange={e => updateQuoteItemText(qi.id, "notes", e.target.value)} placeholder="Notes" />
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-medium">${(qi.unit_price * qi.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td colSpan={5} className="px-3 py-2 text-sm text-right">Total</td>
                  <td className="px-3 py-2 text-sm text-right">${quoteItems.reduce((s, qi) => s + qi.unit_price * qi.quantity, 0).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
            <div className="flex justify-end">
              <Button onClick={saveQuotation} disabled={actionLoading === "saveQuote"} className="gap-2">
                {actionLoading === "saveQuote" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Record Quotation
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <RfqComparison rfqId={id} canAward={canAward} refreshKey={refreshKey} onAwarded={fetchDetail} sealedUntil={sealedUntil} />

      {awardedQuote && rfq.awarded_supplier_id && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => {
            getPoByQuotationId(awardedQuote.id).then(({ data }) => {
              if (data) router.push(`/dashboard/procurement/po/${(data as { id: string }).id}`);
            });
          }}>
            <ExternalLink className="h-4 w-4 mr-1" /> View PO
          </Button>
        </div>
      )}

      {!sealedUntil && quotations.length > 0 && ["weighted", "technical_commercial"].includes(rfq.evaluation_method) && (
        <Card>
          <CardContent className="pt-5">
              <div className="space-y-3">
                <h4 className="text-sm font-semibold">Scoring & Evaluation</h4>
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Supplier</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total ($)</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Technical (0-100)</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Commercial (0-100)</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Combined</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations.map(q => {
                      const bestScore = Math.max(...quotations.filter(q2 => q2.combined_score != null).map(q2 => q2.combined_score ?? 0));
                      const isBestScored = q.combined_score != null && q.combined_score >= bestScore && q.total_amount > 0;
                      return (
                        <tr key={q.id} className="border-b last:border-0">
                          <td className="px-3 py-2 text-sm font-medium">{q.procurement_suppliers?.supplier_name ?? "—"}</td>
                          <td className="px-3 py-2 text-sm text-right">{q.currency} {q.total_amount.toLocaleString()}</td>
                          <td className="px-3 py-2 text-sm text-right">
                            <Input key={`${q.id}-t-${q.technical_score}`} className="h-8 w-20 ml-auto text-xs text-right" type="number" min="0" max="100" defaultValue={q.technical_score ?? ""} onBlur={e => handleEvaluate(q.id, "technical_score", e.target.value ? parseFloat(e.target.value) : null)} />
                          </td>
                          <td className="px-3 py-2 text-sm text-right">
                            <Input key={`${q.id}-c-${q.commercial_score}`} className="h-8 w-20 ml-auto text-xs text-right" type="number" min="0" max="100" defaultValue={q.commercial_score ?? ""} onBlur={e => handleEvaluate(q.id, "commercial_score", e.target.value ? parseFloat(e.target.value) : null)} />
                          </td>
                          <td className={`px-3 py-2 text-sm text-right font-bold ${isBestScored ? "text-emerald-600" : ""}`}>
                            {q.combined_score != null ? q.combined_score : "—"}
                          </td>
                          <td className="px-3 py-2 text-sm text-right">
                            <Badge variant="outline" className={
                              q.status === "awarded" ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" :
                              q.status === "evaluated" ? "bg-purple-500/10 text-purple-600 border-purple-200" :
                              "bg-gray-500/10 text-gray-500 border-gray-200"
                            }>
                              {q.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
