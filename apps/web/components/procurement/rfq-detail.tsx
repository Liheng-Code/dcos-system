"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, ArrowLeft, Send, XCircle, CheckCircle, Award,
  Plus, Save, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
  const [actionLoading, setActionLoading] = useState("");

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
  const [quoteItems, setQuoteItems] = useState<(PRItemSummary & { unit_price: number; total: number })[]>([]);

  const fetchDetail = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("procurement_rfqs").select("*").eq("id", id).single(),
      supabase.from("procurement_rfq_suppliers").select("*, procurement_suppliers(supplier_name)").eq("rfq_id", id),
      supabase.from("procurement_quotations").select("*, procurement_quotation_items(*), procurement_suppliers(supplier_name)").eq("rfq_id", id),
    ]).then(([rfqRes, supRes, quoRes]) => {
      if (rfqRes.data) setRfq(rfqRes.data as RFQRecord);
      if (supRes.data) setInvitedSuppliers(supRes.data as unknown as RFQSupplier[]);
      if (quoRes.data) {
        setQuotations(quoRes.data as unknown as Quotation[]);
      }

      if (rfqRes.data) {
        const prId = (rfqRes.data as RFQRecord).pr_id;
        if (prId) {
          supabase.from("procurement_pr_items").select("*").eq("pr_id", prId).order("line_no").then(({ data }) => {
            if (data) setPrItems(data as PRItemSummary[]);
          });
        }
      }

      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleIssue() {
    setActionLoading("issue");
    const supabase = createClient();
    const { error } = await supabase.from("procurement_rfqs").update({
      status: "issued",
      issue_date: new Date().toISOString().slice(0, 10),
    }).eq("id", id);
    if (error) { toast.error(error.message); setActionLoading(""); return; }
    toast.success("RFQ issued");
    fetchDetail();
    setActionLoading("");
  }

  async function handleCancel() {
    if (!confirm("Cancel this RFQ?")) return;
    setActionLoading("cancel");
    const supabase = createClient();
    const { error } = await supabase.from("procurement_rfqs").update({ status: "cancelled" }).eq("id", id);
    if (error) { toast.error(error.message); setActionLoading(""); return; }
    toast.success("RFQ cancelled");
    fetchDetail();
    setActionLoading("");
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
    setQuoteItems(prItems.map(pi => ({ ...pi, unit_price: 0, total: 0 })));
    setShowAddQuotation(true);
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
    const supabase = createClient();

    const totalAmount = quoteItems.reduce((s, qi) => s + (qi.unit_price * qi.quantity), 0);

    const { data: quoResult, error: quoError } = await supabase
      .from("procurement_quotations")
      .insert([{
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
      }])
      .select("id")
      .single();

    if (quoError) { toast.error(quoError.message); setActionLoading(""); return; }

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
      }));

    await supabase.from("procurement_quotation_items").insert(itemInserts);

    await supabase.from("procurement_rfq_suppliers").update({ responded: true }).eq("rfq_id", id).eq("supplier_id", newQuote.supplier_id);

    const quoCount = quotations.length + 1;
    if (quoCount >= 2) {
      await supabase.from("procurement_rfqs").update({ status: "quotations_received" }).eq("id", id);
    } else {
      await supabase.from("procurement_rfqs").update({ status: "quotations_received" }).eq("id", id);
    }

    toast.success("Quotation recorded");
    setShowAddQuotation(false);
    fetchDetail();
    setActionLoading("");
  }

  async function handleEvaluate(quotationId: string, field: string, value: number | null) {
    const supabase = createClient();
    const update: Record<string, number | null | string> = { [field]: value };

    const q = quotations.find(q => q.id === quotationId);
    if (q) {
      const technicalScore = field === "technical_score" ? value : q.technical_score;
      const commercialScore = field === "commercial_score" ? value : q.commercial_score;
      if (technicalScore != null && commercialScore != null) {
        const evaluationMethod = rfq?.evaluation_method ?? "lowest_price";
        if (evaluationMethod === "technical_commercial") {
          update.combined_score = Math.round((technicalScore + commercialScore) / 2);
        } else if (evaluationMethod === "weighted") {
          update.combined_score = Math.round(technicalScore * 0.6 + commercialScore * 0.4);
        }
      }
      update.status = "evaluated";
    }

    const { error } = await supabase.from("procurement_quotations").update(update).eq("id", quotationId);
    if (error) { toast.error(error.message); return; }

    if (rfq?.status === "quotations_received") {
      await supabase.from("procurement_rfqs").update({ status: "under_evaluation" }).eq("id", id);
    }

    toast.success("Score saved");
    fetchDetail();
  }

  async function handleAward(quotationId: string) {
    const reason = prompt("Basis of award / reason:");
    if (reason === null) return;
    setActionLoading("award");
    const supabase = createClient();

    const quotation = quotations.find(q => q.id === quotationId);
    if (!quotation) { setActionLoading(""); return; }

    const { error: rfqError } = await supabase.from("procurement_rfqs").update({
      status: "awarded",
      awarded_supplier_id: quotation.supplier_id,
      award_reason: reason,
      awarded_at: new Date().toISOString(),
    }).eq("id", id);
    if (rfqError) { toast.error(rfqError.message); setActionLoading(""); return; }

    await supabase.from("procurement_quotations").update({ is_awarded: true, status: "awarded" }).eq("id", quotationId);
    await supabase.from("procurement_quotations").update({ is_awarded: false, status: "rejected" }).neq("id", quotationId).eq("rfq_id", id);

    let projectId: string | null = null;
    let wbsNodeId: string | null = null;
    if (rfq?.pr_id) {
      const { data: prData } = await supabase.from("procurement_prs").select("project_id, wbs_node_id").eq("id", rfq.pr_id).single();
      if (prData) { projectId = (prData as { project_id: string | null; wbs_node_id: string | null }).project_id; wbsNodeId = (prData as { project_id: string | null; wbs_node_id: string | null }).wbs_node_id; }
    }

    const { data: poResult, error: poError } = await supabase
      .from("procurement_pos")
      .insert([{
        po_number: `PO-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
        supplier_id: quotation.supplier_id,
        project_id: projectId,
        wbs_node_id: wbsNodeId,
        pr_id: rfq?.pr_id ?? null,
        rfq_id: id,
        quotation_id: quotationId,
        currency: quotation.currency,
        total_amount: quotation.total_amount,
        grand_total: quotation.total_amount,
        payment_terms: quotation.payment_terms || null,
        status: "draft",
      }])
      .select("id")
      .single();

    if (poError) { toast.error("RFQ awarded but PO creation failed: " + poError.message); setActionLoading(""); fetchDetail(); return; }

    const poId = (poResult as { id: string }).id;

    const poItemInserts = quotation.procurement_quotation_items.map((qi, idx) => ({
      po_id: poId,
      pr_item_id: qi.pr_item_id ?? null,
      line_no: idx + 1,
      item_code: qi.item_code ?? null,
      item_description: qi.item_description,
      unit: qi.unit,
      quantity_ordered: qi.quantity,
      unit_price: qi.unit_price,
      total_price: qi.total,
    }));

    const { error: itemsError } = await supabase.from("procurement_po_items").insert(poItemInserts);
    if (itemsError) { toast.error("PO created but items failed: " + itemsError.message); }

    toast.success("Supplier awarded! PO created.");
    fetchDetail();
    setActionLoading("");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!rfq) return <div className="py-20 text-center text-muted-foreground">RFQ not found.</div>;

  const canIssue = rfq.status === "draft";
  const canCancel = !["awarded", "cancelled"].includes(rfq.status);
  const canAddQuote = ["issued", "quotations_received", "under_evaluation"].includes(rfq.status) && rfq.status !== "awarded";
  const canAward = ["quotations_received", "under_evaluation"].includes(rfq.status) && quotations.some(q => q.combined_score != null || q.status === "evaluated");
  const awardedQuote = quotations.find(q => q.is_awarded);

  const bestPrice = Math.min(...quotations.filter(q => q.total_amount > 0).map(q => q.total_amount));

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
          {canIssue && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleIssue} disabled={actionLoading === "issue"}>
              {actionLoading === "issue" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
              Issue RFQ
            </Button>
          )}
          {canCancel && (
            <Button size="sm" variant="outline" className="text-red-600" onClick={handleCancel} disabled={actionLoading === "cancel"}>
              {actionLoading === "cancel" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Cancel
            </Button>
          )}
        </div>
      </div>

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
                    <td className="px-3 py-2 text-sm text-right font-medium">${(qi.unit_price * qi.quantity).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td colSpan={3} className="px-3 py-2 text-sm text-right">Total</td>
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

      {quotations.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Quotation Comparison</h3>
              {canAward && (
                <span className="text-xs text-muted-foreground">Enter scores and click Award to select winner</span>
              )}
            </div>

            {prItems.length > 0 && (
              <div className="overflow-x-auto mb-4">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground min-w-[160px]">Item</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Qty</th>
                      {quotations.map(q => (
                        <th key={q.id} className={`text-right px-3 py-2 text-xs font-semibold ${q.is_awarded ? "text-emerald-600" : "text-muted-foreground"}`}>
                          <div className="flex items-center justify-end gap-1">
                            {q.procurement_suppliers?.supplier_name ?? "Supplier"}
                            {q.is_awarded && <Award className="h-3 w-3 text-emerald-600" />}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prItems.map(pi => {
                      const qiGroups = quotations.map(q => q.procurement_quotation_items.find((qi: QuotationItem) => qi.pr_item_id === pi.id));
                      return (
                        <tr key={pi.id} className="border-b last:border-0">
                          <td className="px-3 py-2 text-sm">{pi.item_description}</td>
                          <td className="px-3 py-2 text-sm text-right">{pi.quantity} {pi.unit}</td>
                          {qiGroups.map((qi, idx) => {
                            if (!qi) return <td key={quotations[idx].id} className="px-3 py-2 text-sm text-right text-muted-foreground">—</td>;
                            const isLowest = quotations[idx].total_amount > 0 && qi.total === Math.min(...quotations.filter(q => q.total_amount > 0).map(q => q.total_amount));
                            return (
                              <td key={quotations[idx].id} className={`px-3 py-2 text-sm text-right ${isLowest ? "font-bold text-emerald-600" : ""}`}>
                                ${qi.unit_price.toLocaleString()}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="px-3 py-2 text-sm">Total</td>
                      <td className="px-3 py-2 text-sm" />
                      {quotations.map(q => {
                        const isBest = q.total_amount === bestPrice;
                        return (
                          <td key={q.id} className={`px-3 py-2 text-sm text-right ${isBest ? "text-emerald-600" : ""}`}>
                            ${q.total_amount.toLocaleString()}
                            {isBest && <span className="ml-1 text-xs">★</span>}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {["weighted", "technical_commercial"].includes(rfq.evaluation_method) && (
              <div className="space-y-3 mt-4 border-t pt-4">
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
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Action</th>
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
                            <Input className="h-8 w-20 ml-auto text-xs text-right" type="number" min="0" max="100" value={q.technical_score ?? ""} onChange={e => handleEvaluate(q.id, "technical_score", e.target.value ? parseFloat(e.target.value) : null)} />
                          </td>
                          <td className="px-3 py-2 text-sm text-right">
                            <Input className="h-8 w-20 ml-auto text-xs text-right" type="number" min="0" max="100" value={q.commercial_score ?? ""} onChange={e => handleEvaluate(q.id, "commercial_score", e.target.value ? parseFloat(e.target.value) : null)} />
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
                          <td className="px-3 py-2 text-right">
                            {!q.is_awarded && canAward && (
                              <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => handleAward(q.id)} disabled={actionLoading === "award"}>
                                {actionLoading === "award" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Award className="h-4 w-4 mr-1" />}
                                Award
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {rfq.evaluation_method === "lowest_price" && (
              <div className="space-y-3 mt-4 border-t pt-4">
                <h4 className="text-sm font-semibold">Lowest Price Evaluation</h4>
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Supplier</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total ($)</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Status</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotations
                      .sort((a, b) => a.total_amount - b.total_amount)
                      .map(q => {
                        const isLowest = q.total_amount === bestPrice;
                        return (
                          <tr key={q.id} className={`border-b last:border-0 ${isLowest ? "bg-emerald-500/5" : ""}`}>
                            <td className="px-3 py-2 text-sm font-medium">{q.procurement_suppliers?.supplier_name ?? "—"}</td>
                            <td className={`px-3 py-2 text-sm text-right ${isLowest ? "font-bold text-emerald-600" : ""}`}>
                              {q.currency} {q.total_amount.toLocaleString()}
                              {isLowest && <span className="ml-1">★ Lowest</span>}
                            </td>
                            <td className="px-3 py-2 text-sm text-right">
                              <Badge variant="outline" className={
                                q.status === "awarded" ? "bg-emerald-500/10 text-emerald-600 border-emerald-200" :
                                q.status === "evaluated" ? "bg-purple-500/10 text-purple-600 border-purple-200" :
                                "bg-gray-500/10 text-gray-500 border-gray-200"
                              }>{q.status}</Badge>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {!q.is_awarded && rfq.status !== "awarded" && (
                                <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => handleAward(q.id)} disabled={actionLoading === "award"}>
                                  {actionLoading === "award" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Award className="h-4 w-4 mr-1" />}
                                  Award
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {awardedQuote && rfq.awarded_supplier_id && (
              <div className="mt-4 border-t pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <span className="font-semibold">Awarded to:</span>
                  <span>{awardedQuote.procurement_suppliers?.supplier_name ?? "—"}</span>
                  <span className="text-muted-foreground">— {rfq.award_reason}</span>
                </div>
                <Button size="sm" variant="outline" onClick={() => {
                  const q = quotations.find(q => q.is_awarded);
                  if (q) {
                    const s = createClient();
                    s.from("procurement_pos").select("id").eq("quotation_id", q.id).single().then(({ data }) => {
                      if (data) router.push(`/dashboard/procurement/po/${(data as { id: string }).id}`);
                    });
                  }
                }}>
                  <ExternalLink className="h-4 w-4 mr-1" /> View PO
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
