"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, ArrowLeft, Send, CheckCircle, XCircle, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface PORecord {
  id: string;
  po_number: string;
  supplier_id: string;
  project_id: string | null;
  pr_id: string | null;
  delivery_date_expected: string | null;
  delivery_address: string | null;
  currency: string;
  total_amount: number | null;
  tax_amount: number | null;
  grand_total: number | null;
  payment_terms: string | null;
  delivery_terms: string | null;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  issued_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface POItem {
  id: string;
  line_no: number;
  item_code: string | null;
  item_description: string;
  unit: string;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_accepted: number;
  unit_price: number;
  total_price: number;
  delivery_date_expected: string | null;
}

interface Supplier {
  id: string;
  supplier_name: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-500 border-gray-200",
  submitted: "bg-blue-500/10 text-blue-600 border-blue-200",
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  issued: "bg-indigo-500/10 text-indigo-600 border-indigo-200",
  partially_delivered: "bg-amber-500/10 text-amber-600 border-amber-200",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  closed: "bg-slate-500/10 text-slate-600 border-slate-200",
  on_hold: "bg-orange-500/10 text-orange-600 border-orange-200",
  cancelled: "bg-red-500/10 text-red-600 border-red-200",
};

const STATUS_ACTIONS: Record<string, { label: string; nextStatus: string; icon: LucideIcon; color: string }[]> = {
  draft: [
    { label: "Submit for Approval", nextStatus: "submitted", icon: Send, color: "bg-blue-600 hover:bg-blue-700" },
  ],
  submitted: [
    { label: "Approve", nextStatus: "approved", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700" },
    { label: "Reject", nextStatus: "cancelled", icon: XCircle, color: "bg-red-600 hover:bg-red-700" },
  ],
  approved: [
    { label: "Issue to Supplier", nextStatus: "issued", icon: Send, color: "bg-indigo-600 hover:bg-indigo-700" },
  ],
  issued: [],
  partially_delivered: [],
  delivered: [
    { label: "Close PO", nextStatus: "closed", icon: CheckCircle, color: "bg-emerald-600 hover:bg-emerald-700" },
  ],
  closed: [],
  on_hold: [],
  cancelled: [],
};

interface PODetailProps {
  id: string;
}

export function PODetail({ id }: PODetailProps) {
  const router = useRouter();
  const [po, setPo] = useState<PORecord | null>(null);
  const [items, setItems] = useState<POItem[]>([]);
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchDetail = useCallback(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("procurement_pos").select("*").eq("id", id).single(),
      supabase.from("procurement_po_items").select("*").eq("po_id", id).order("line_no"),
      supabase.from("procurement_suppliers").select("id, supplier_name"),
    ]).then(([poRes, itemsRes, supRes]) => {
      if (poRes.data) setPo(poRes.data as PORecord);
      if (itemsRes.data) setItems(itemsRes.data as POItem[]);
      if (supRes.data) {
        const map: Record<string, string> = {};
        for (const s of supRes.data as Supplier[]) map[s.id] = s.supplier_name;
        setSuppliers(map);
      }
      setLoading(false);
    });
  }, [id]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  async function handleAction(nextStatus: string) {
    const supabase = createClient();
    const update: Record<string, string | null> = { status: nextStatus };

    if (nextStatus === "approved") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        (update as Record<string, string>).approved_by = user.id;
        (update as Record<string, string>).approved_at = new Date().toISOString();
      }
    }
    if (nextStatus === "issued") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) (update as Record<string, string>).issued_by = user.id;
      (update as Record<string, string>).issued_date = new Date().toISOString().split("T")[0];
    }

    const { error } = await supabase.from("procurement_pos").update(update).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success(`PO ${nextStatus.replace(/_/g, " ")}`);
    fetchDetail();
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  if (!po) return <div className="py-20 text-center text-muted-foreground">PO not found.</div>;

  const possibleActions = STATUS_ACTIONS[po.status] ?? [];
  const supplierName = suppliers[po.supplier_id] ?? "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push("/dashboard/procurement/po")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{po.po_number}</h1>
          <Badge className={STATUS_COLORS[po.status] ?? ""} variant="outline">{po.status.replace(/_/g, " ")}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {possibleActions.map(action => (
            <Button key={action.nextStatus} className={action.color} size="sm" onClick={() => handleAction(action.nextStatus)}>
              <action.icon className="h-4 w-4 mr-1" /> {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Details</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Supplier</span><p className="font-medium">{supplierName}</p></div>
              <div><span className="text-muted-foreground">Currency</span><p className="font-medium">{po.currency}</p></div>
              <div><span className="text-muted-foreground">Expected Delivery</span><p className="font-medium">{po.delivery_date_expected ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Delivery Address</span><p className="font-medium">{po.delivery_address ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Payment Terms</span><p className="font-medium">{po.payment_terms ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Delivery Terms</span><p className="font-medium">{po.delivery_terms ?? "—"}</p></div>
              <div><span className="text-muted-foreground">Total Amount</span><p className="font-bold">${po.grand_total?.toLocaleString() ?? "—"}</p></div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 space-y-3">
            <h3 className="font-semibold text-sm">Timeline</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{new Date(po.created_at).toLocaleString()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Last Updated</span><span>{new Date(po.updated_at).toLocaleString()}</span></div>
              {po.approved_at && <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span>{new Date(po.approved_at).toLocaleString()}</span></div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5">
          <h3 className="font-semibold text-sm mb-3">Items</h3>
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
              {items.map(item => (
                <tr key={item.id} className="border-b last:border-0">
                  <td className="px-3 py-2 text-sm">{item.line_no}</td>
                  <td className="px-3 py-2 text-sm">{item.item_description}</td>
                  <td className="px-3 py-2 text-sm text-right">{item.quantity_ordered} {item.unit}</td>
                  <td className="px-3 py-2 text-sm text-right">{item.quantity_delivered}</td>
                  <td className="px-3 py-2 text-sm text-right">{item.quantity_accepted}</td>
                  <td className="px-3 py-2 text-sm text-right">${item.unit_price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-sm text-right font-medium">${item.total_price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td colSpan={6} className="px-3 py-2 text-sm text-right">Grand Total</td>
                <td className="px-3 py-2 text-sm text-right">${items.reduce((s, i) => s + i.total_price, 0).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
