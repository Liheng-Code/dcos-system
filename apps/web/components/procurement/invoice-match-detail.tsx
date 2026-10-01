"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Loader2, ArrowLeft, CheckCircle, XCircle,
  FileSpreadsheet, Calculator, Package,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getInvoiceMatchById, listPoItemsByPoId, listPos, listSuppliers, updateInvoiceMatchById, updatePoById } from "@/lib/procurement/procurement-service";

interface InvoiceMatch {
  id: string;
  po_id: string;
  supplier_id: string;
  invoice_ref: string;
  invoice_date: string;
  invoice_amount: number;
  matched_gr_amount: number;
  matched_po_amount: number;
  variance_amount: number;
  variance_reason: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface POItem {
  id: string;
  line_no: number;
  item_description: string;
  unit: string;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_accepted: number;
  unit_price: number;
  total_price: number;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-500 border-gray-200",
  matched: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  variance_detected: "bg-red-500/10 text-red-600 border-red-200",
  approved: "bg-blue-500/10 text-blue-600 border-blue-200",
  rejected: "bg-orange-500/10 text-orange-600 border-orange-200",
};

export function InvoiceMatchDetail({ id }: { id: string }) {
  const router = useRouter();
  const [match, setMatch] = useState<InvoiceMatch | null>(null);
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [supplierName, setSupplierName] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");

  const fetchDetail = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      getInvoiceMatchById(id),
      listSuppliers(),
      listPos("id, po_number"),
    ]).then(([matchRes, supRes, poRes]) => {
      if (matchRes.error) { setLoading(false); return; }
      const m = matchRes.data as InvoiceMatch;
      setMatch(m);

      if (supRes.data) {
        const s = (supRes.data as { id: string; supplier_name: string }[]).find(s => s.id === m.supplier_id);
        if (s) setSupplierName(s.supplier_name);
      }
      if (poRes.data) {
        const p = (poRes.data as { id: string; po_number: string }[]).find(p => p.id === m.po_id);
        if (p) setPoNumber(p.po_number);
      }

      listPoItemsByPoId(m.po_id, "*").then(({ data }) => {
        if (data) setPoItems(data as POItem[]);
      });

      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleApprove() {
    if (!match) return;
    const reason = match.variance_amount !== 0 && !match.variance_reason
      ? prompt("Variance detected — enter explanation before approving:")
      : null;
    if (reason === "") return;
    if (match.variance_amount !== 0 && !match.variance_reason && reason === null) return;

    setActionLoading("approve");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const update: Record<string, string | null> = {
      status: "approved",
      variance_reason: reason || match.variance_reason || null,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    };

    const { error } = await updateInvoiceMatchById(update, id);
    if (error) { toast.error(error.message); setActionLoading(""); return; }

    await updatePoById({ status: "closed" }, match.po_id);

    toast.success("Invoice approved — PO closed");
    fetchDetail();
    setActionLoading("");
  }

  async function handleReject() {
    if (!match) return;
    const reason = prompt("Reason for rejection:");
    if (!reason) return;

    setActionLoading("reject");
    const supabase = createClient();
    const { error } = await updateInvoiceMatchById({
      status: "rejected",
      variance_reason: reason,
    }, id);
    if (error) { toast.error(error.message); setActionLoading(""); return; }

    toast.success("Invoice rejected");
    fetchDetail();
    setActionLoading("");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!match) return <div className="py-20 text-center text-muted-foreground">Invoice match not found.</div>;

  const canApprove = match.status === "matched" || match.status === "variance_detected";
  const canReject = match.status === "matched" || match.status === "variance_detected" || match.status === "pending";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/procurement/invoice-matches")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{match.invoice_ref}</h1>
          <Badge className={STATUS_COLORS[match.status] ?? ""} variant="outline">
            {match.status.replace(/_/g, " ")}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={handleApprove} disabled={actionLoading === "approve"}>
              {actionLoading === "approve" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
              Approve & Close PO
            </Button>
          )}
          {canReject && (
            <Button size="sm" variant="outline" className="text-red-600" onClick={handleReject} disabled={actionLoading === "reject"}>
              {actionLoading === "reject" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Reject
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Invoice Details
            </h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">PO</span><p className="font-medium">{poNumber || "—"}</p></div>
              <div><span className="text-muted-foreground">Supplier</span><p className="font-medium">{supplierName || "—"}</p></div>
              <div><span className="text-muted-foreground">Invoice Date</span><p className="font-medium">{match.invoice_date}</p></div>
              <div><span className="text-muted-foreground">Invoice Ref</span><p className="font-medium">{match.invoice_ref}</p></div>
            </div>
            {match.notes && <div className="text-sm"><span className="text-muted-foreground">Notes</span><p>{match.notes}</p></div>}
            {match.variance_reason && <div className="text-sm"><span className="text-muted-foreground">Variance Reason</span><p>{match.variance_reason}</p></div>}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Calculator className="h-4 w-4" /> 3-Way Match
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Package className="h-3 w-3" /> PO Amount
                </span>
                <span className="font-semibold">${match.matched_po_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">GR Amount (accepted)</span>
                <span className="font-semibold">${match.matched_gr_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Invoice Amount</span>
                <span className="font-semibold">${match.invoice_amount.toLocaleString()}</span>
              </div>
              <hr />
              <div className="flex justify-between items-center text-base font-bold">
                <span>Variance</span>
                <span className={Math.abs(match.variance_amount) > 0 ? "text-red-600" : "text-emerald-600"}>
                  ${match.variance_amount.toLocaleString()}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {match.approved_at && (
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Approval</h3>
            <div className="text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Approved At</span><span>{new Date(match.approved_at).toLocaleString()}</span></div>
            </div>
          </CardContent>
        </Card>
      )}

      {poItems.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3">PO Items — Qty Comparison</h3>
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">#</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Ordered</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Delivered</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Accepted</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Unit Price</th>
                  <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {poItems.map(item => {
                  const qtyMatch = item.quantity_ordered === item.quantity_accepted;
                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-sm">{item.line_no}</td>
                      <td className="px-3 py-2 text-sm">{item.item_description}</td>
                      <td className="px-3 py-2 text-sm text-right">{item.quantity_ordered}</td>
                      <td className="px-3 py-2 text-sm text-right">{item.quantity_delivered}</td>
                      <td className={`px-3 py-2 text-sm text-right font-medium ${qtyMatch ? "text-emerald-600" : "text-amber-600"}`}>
                        {item.quantity_accepted}
                        {!qtyMatch && <span className="ml-1 text-xs">⚠</span>}
                      </td>
                      <td className="px-3 py-2 text-sm text-right">${item.unit_price.toLocaleString()}</td>
                      <td className="px-3 py-2 text-sm text-right">${item.total_price.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
