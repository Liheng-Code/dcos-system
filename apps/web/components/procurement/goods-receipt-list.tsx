"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface DeliveryNote {
  id: string;
  po_id: string;
  supplier_id: string;
  delivery_note_ref: string | null;
  delivery_date: string;
  status: string;
  remarks: string | null;
  created_at: string;
}

interface DeliveryNoteWithPO extends DeliveryNote {
  procurement_pos: { po_number: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-500/10 text-gray-500 border-gray-200",
  in_transit: "bg-blue-500/10 text-blue-600 border-blue-200",
  delivered: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  partially_delivered: "bg-amber-500/10 text-amber-600 border-amber-200",
  accepted: "bg-emerald-500/10 text-emerald-600 border-emerald-200",
  rejected: "bg-red-500/10 text-red-600 border-red-200",
};

export function GoodsReceiptList() {
  const router = useRouter();
  const [dns, setDns] = useState<DeliveryNoteWithPO[]>([]);
  const [loading, setLoading] = useState(true);

  function fetchDeliveryNotes() {
    const supabase = createClient();
    supabase.from("procurement_delivery_notes").select("*, procurement_pos!procurement_delivery_notes_po_id_fkey(po_number)").order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setDns(data as DeliveryNoteWithPO[]);
      setLoading(false);
    });
  }

  useEffect(() => { fetchDeliveryNotes(); }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div />
        <Button onClick={() => router.push("/dashboard/procurement/goods-receipt/new")} className="gap-2"><Plus className="h-4 w-4" /> Record Goods Receipt</Button>
      </div>

      <div className="rounded-lg border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PO#</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">DN Ref</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Delivery Date</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Remarks</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody>
            {dns.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No goods receipts recorded.</td></tr>
            ) : dns.map(dn => (
              <tr key={dn.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium">{dn.procurement_pos?.po_number ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{dn.delivery_note_ref ?? "—"}</td>
                <td className="px-4 py-3 text-sm">{dn.delivery_date}</td>
                <td className="px-4 py-3"><Badge className={STATUS_COLORS[dn.status] ?? ""} variant="outline">{dn.status.replace(/_/g, " ")}</Badge></td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{dn.remarks ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
