"use client";

import { useEffect, useState } from "react";
import { listActiveSuppliersUnordered, listDeliveryNoteColumns, listGoodsReceipts, listPos, listRfqSuppliers } from "@/lib/procurement/procurement-queries";
import { Loader2, TrendingUp, Truck, Clock, Star, XCircle, CheckCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface SupplierPerf {
  id: string;
  supplier_name: string;
  total_pos: number;
  total_spend: number;
  on_time_deliveries: number;
  late_deliveries: number;
  accepted_qty: number;
  rejected_qty: number;
  rfq_responses: number;
  rfq_invited: number;
  performance_score: number | null;
}

export function SupplierPerformance() {
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<SupplierPerf[]>([]);

  useEffect(() => {

    Promise.all([
      listActiveSuppliersUnordered("id, supplier_name, performance_score"),
      listPos("supplier_id, grand_total, status"),
      listDeliveryNoteColumns("delivery_date, status, po_id, supplier_id, procurement_pos(delivery_date_expected)"),
      listGoodsReceipts(),
      listRfqSuppliers(),
    ]).then(([supRes, poRes, dnRes, grRes, rfqRes]) => {
      if (!supRes.data) { setLoading(false); return; }

      const supList = supRes.data as { id: string; supplier_name: string; performance_score: number | null }[];
      const poList = poRes.data as { supplier_id: string; grand_total: number | null; status: string }[] | null;
      const dnList = dnRes.data as unknown as { delivery_date: string; status: string; supplier_id: string; procurement_pos: { delivery_date_expected: string } | null }[] | null;
      const grList = grRes.data as unknown as { quantity_accepted: number; quantity_rejected: number; procurement_po_items: { po_id: string; procurement_pos: { supplier_id: string } } }[] | null;
      const rfqList = rfqRes.data as { supplier_id: string; responded: boolean }[] | null;

      const perf: SupplierPerf[] = supList.map(sup => {
        const supplierPos = poList?.filter(p => p.supplier_id === sup.id) ?? [];
        const supplierDns = dnList?.filter(d => d.supplier_id === sup.id) ?? [];
        const supplierPOIds = new Set(supplierPos.map(p => p.supplier_id));

        let onTime = 0, late = 0;
        for (const dn of supplierDns) {
          if (dn.status === "delivered" || dn.status === "accepted") {
            const expected = dn.procurement_pos?.delivery_date_expected;
            if (expected && new Date(dn.delivery_date) <= new Date(expected)) onTime++;
            else if (expected) late++;
          }
        }

        const supplierGrs = grList?.filter(g => {
          try { return (g as any).procurement_po_items?.procurement_pos?.supplier_id === sup.id; }
          catch { return false; }
        }) ?? [];
        const accepted = supplierGrs.reduce((s, g) => s + g.quantity_accepted, 0);
        const rejected = supplierGrs.reduce((s, g) => s + g.quantity_rejected, 0);

        const supplierRfqs = rfqList?.filter(r => r.supplier_id === sup.id) ?? [];
        const responses = supplierRfqs.filter(r => r.responded).length;

        return {
          id: sup.id,
          supplier_name: sup.supplier_name,
          total_pos: supplierPos.length,
          total_spend: supplierPos.reduce((s, p) => s + (p.grand_total ?? 0), 0),
          on_time_deliveries: onTime,
          late_deliveries: late,
          accepted_qty: accepted,
          rejected_qty: rejected,
          rfq_responses: responses,
          rfq_invited: supplierRfqs.length,
          performance_score: sup.performance_score,
        };
      });

      setSuppliers(perf);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      {suppliers.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No supplier data available.</p>
      ) : (
        <div className="grid gap-4">
          {suppliers.map(s => {
            const onTimeRate = s.on_time_deliveries + s.late_deliveries > 0 ? Math.round((s.on_time_deliveries / (s.on_time_deliveries + s.late_deliveries)) * 100) : null;
            const acceptRate = s.accepted_qty + s.rejected_qty > 0 ? Math.round((s.accepted_qty / (s.accepted_qty + s.rejected_qty)) * 100) : null;
            const rfqRate = s.rfq_invited > 0 ? Math.round((s.rfq_responses / s.rfq_invited) * 100) : null;

            const scoreItems = [
              onTimeRate != null ? { label: "On-Time", value: onTimeRate, color: onTimeRate >= 80 ? "text-emerald-600" : onTimeRate >= 50 ? "text-amber-600" : "text-red-600" } : null,
              acceptRate != null ? { label: "Quality", value: acceptRate, color: acceptRate >= 95 ? "text-emerald-600" : acceptRate >= 80 ? "text-amber-600" : "text-red-600" } : null,
              rfqRate != null ? { label: "Responsiveness", value: rfqRate, color: rfqRate >= 80 ? "text-emerald-600" : rfqRate >= 50 ? "text-amber-600" : "text-red-600" } : null,
            ].filter(Boolean) as { label: string; value: number; color: string }[];

            return (
              <Card key={s.id}>
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold">{s.supplier_name}</h3>
                      <p className="text-xs text-muted-foreground">
                        {s.total_pos} POs · ${s.total_spend.toLocaleString()} total spend
                      </p>
                    </div>
                    {s.performance_score != null && (
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-500/10">
                        <Star className="h-3 w-3 mr-1" />
                        {s.performance_score}/100
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm">
                    {scoreItems.map(item => (
                      <div key={item.label} className="rounded-lg border p-3 text-center">
                        <p className={`text-lg font-bold ${item.color}`}>{item.value}%</p>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-lg font-bold">{s.rfq_responses}/{s.rfq_invited}</p>
                      <p className="text-xs text-muted-foreground">RFQ Responses</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-lg font-bold">{s.accepted_qty}</p>
                      <p className="text-xs text-muted-foreground">Accepted Qty</p>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <p className="text-lg font-bold text-red-600">{s.rejected_qty}</p>
                      <p className="text-xs text-muted-foreground">Rejected Qty</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
