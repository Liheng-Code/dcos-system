"use client";

import { Fragment, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PO {
  id: string;
  po_number: string;
  status: string;
  grand_total: number | null;
  delivery_date_expected: string | null;
  created_at: string;
}

interface POItem {
  id: string;
  item_description: string;
  quantity_ordered: number;
  quantity_delivered: number;
  quantity_accepted: number;
  unit_price: number;
  total_price: number;
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

export function SupplierPOView({ supplierId }: { supplierId: string }) {
  const [pos, setPos] = useState<PO[]>([]);
  const [items, setItems] = useState<Record<string, POItem[]>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supplierId) return;
    setLoading(true);
    const supabase = createClient();
    supabase.from("procurement_pos").select("*").eq("supplier_id", supplierId).order("created_at", { ascending: false }).then(({ data }) => {
      if (data) setPos(data as PO[]);
      setLoading(false);
    });
  }, [supplierId]);

  function toggleExpand(poId: string) {
    if (expanded === poId) { setExpanded(null); return; }
    setExpanded(poId);
    if (!items[poId]) {
      const supabase = createClient();
      supabase.from("procurement_po_items").select("*").eq("po_id", poId).order("line_no").then(({ data }) => {
        if (data) setItems(prev => ({ ...prev, [poId]: data as POItem[] }));
      });
    }
  }

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (pos.length === 0) return <div className="rounded-xl border border-dashed py-12 text-center text-muted-foreground">No purchase orders for this supplier.</div>;

  return (
    <div className="rounded-lg border">
      <table className="w-full">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PO#</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
            <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expected Delivery</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
          </tr>
        </thead>
        <tbody>
          {pos.map(po => (
            <Fragment key={po.id}>
              <tr className="border-b last:border-0 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => toggleExpand(po.id)}>
                <td className="px-4 py-3 text-sm font-medium">{po.po_number}</td>
                <td className="px-4 py-3"><Badge className={STATUS_COLORS[po.status] ?? ""} variant="outline">{po.status.replace(/_/g, " ")}</Badge></td>
                <td className="px-4 py-3 text-sm">{po.delivery_date_expected ?? "—"}</td>
                <td className="px-4 py-3 text-sm text-right">{po.grand_total != null ? `$${Number(po.grand_total).toLocaleString()}` : "—"}</td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button></td>
              </tr>
              {expanded === po.id && (
                <tr key={`${po.id}-items`}>
                  <td colSpan={5} className="px-4 py-3 bg-muted/20">
                    {!items[po.id] ? (
                      <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-muted-foreground text-xs">
                            <th className="text-left py-1 pr-4">Item</th>
                            <th className="text-right py-1 pr-4">Ordered</th>
                            <th className="text-right py-1 pr-4">Delivered</th>
                            <th className="text-right py-1 pr-4">Accepted</th>
                            <th className="text-right py-1 pr-4">Unit Price</th>
                            <th className="text-right py-1">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items[po.id].map(item => (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="py-1 pr-4">{item.item_description}</td>
                              <td className="text-right py-1 pr-4">{item.quantity_ordered}</td>
                              <td className="text-right py-1 pr-4">{item.quantity_delivered}</td>
                              <td className="text-right py-1 pr-4">{item.quantity_accepted}</td>
                              <td className="text-right py-1 pr-4">${Number(item.unit_price).toLocaleString()}</td>
                              <td className="text-right py-1">${Number(item.total_price).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>          ))}
        </tbody>
      </table>
    </div>
  );
}
