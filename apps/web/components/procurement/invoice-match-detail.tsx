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
import { getInvoiceMatchById, listPoItemsByPoId, listPos, listSuppliers, transitionInvoiceMatch } from "@/lib/procurement/procurement-queries";
import { availableTransitions, procErrorMessage } from "@/lib/procurement/procurement-transitions";
import { useProcurementPermissions } from "@/components/procurement/use-procurement-permissions";
import { ReasonDialog } from "@/components/procurement/reason-dialog";

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
  created_by: string | null;
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
  const { can, userId } = useProcurementPermissions(["invoice"]);
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
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

  async function runTransition(to: "approved" | "rejected", reason?: string): Promise<boolean> {
    setActionLoading(to === "approved" ? "approve" : "reject");
    const { error } = await transitionInvoiceMatch(id, to, reason);
    setActionLoading("");
    if (error) { toast.error(procErrorMessage(error)); return false; }
    toast.success(to === "approved" ? "Invoice approved — PO closed" : "Invoice rejected");
    fetchDetail();
    return true;
  }

  function handleApprove() {
    if (!match) return;
    // A variance needs an explanation before approval (unless one is already stored).
    if (match.variance_amount !== 0 && !match.variance_reason) { setDialog("approve"); return; }
    void runTransition("approved");
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!match) return <div className="py-20 text-center text-muted-foreground">Invoice match not found.</div>;

  const transitions = availableTransitions("invoice_match", match.status, { can, userId, createdBy: match.created_by });
  const canApprove = transitions.some(t => t.to === "approved");
  const canReject = transitions.some(t => t.to === "rejected");

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
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDialog("reject")} disabled={actionLoading === "reject"}>
              {actionLoading === "reject" ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <XCircle className="h-4 w-4 mr-1" />}
              Reject
            </Button>
          )}
        </div>
      </div>

      <ReasonDialog
        open={dialog != null}
        onOpenChange={(o) => { if (!o) setDialog(null); }}
        title={dialog === "approve" ? "Variance explanation" : "Reject invoice"}
        description={dialog === "approve" ? "A variance was detected between the invoice and the PO. Explain it before approving." : "Explain why this invoice is rejected."}
        confirmLabel={dialog === "approve" ? "Approve & Close PO" : "Reject"}
        destructive={dialog === "reject"}
        onConfirm={async (reason) => {
          const ok = await runTransition(dialog === "approve" ? "approved" : "rejected", reason);
          if (ok) setDialog(null);
        }}
      />

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
