"use client";

import { useEffect, useState } from "react";
import { listActiveSuppliersUnordered, listDeliveryNoteColumns, listPos, listPrApprovalStatuses } from "@/lib/procurement/procurement-service";
import { Loader2, DollarSign, TrendingUp, Truck, Clock, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface KPI {
  label: string;
  value: string;
  icon: typeof DollarSign;
  color: string;
  sub: string;
}

interface SpendBySupplier {
  name: string;
  total: number;
  count: number;
}

export function ProcurementAnalytics() {
  const [loading, setLoading] = useState(true);
  const [totalSpend, setTotalSpend] = useState(0);
  const [poCount, setPoCount] = useState(0);
  const [prCount, setPrCount] = useState(0);
  const [pendingPRs, setPendingPRs] = useState(0);
  const [approvedPRs, setApprovedPRs] = useState(0);
  const [closedPRs, setClosedPRs] = useState(0);
  const [deliveredPOs, setDeliveredPOs] = useState(0);
  const [deliveredOnTime, setDeliveredOnTime] = useState(0);
  const [deliveredLate, setDeliveredLate] = useState(0);
  const [topSuppliers, setTopSuppliers] = useState<SpendBySupplier[]>([]);
  const [qualifiedSuppliers, setQualifiedSuppliers] = useState(0);
  const [overduePOs, setOverduePOs] = useState(0);

  useEffect(() => {
    Promise.all([
      listPos("grand_total, status, delivery_date_expected"),
      listPrApprovalStatuses(),
      listActiveSuppliersUnordered("id, supplier_name, status"),
      listDeliveryNoteColumns("delivery_date, status, po_id, procurement_pos(delivery_date_expected)"),
    ]).then(([poRes, prRes, supRes, dnRes]) => {
      if (poRes.data) {
        const pos = poRes.data as { grand_total: number | null; status: string; delivery_date_expected: string | null }[];
        const spend = pos.reduce((s, p) => s + (p.grand_total ?? 0), 0);
        setTotalSpend(spend);
        setPoCount(pos.length);
        setDeliveredPOs(pos.filter(p => p.status === "delivered" || p.status === "closed" || p.status === "under_invoice_match").length);
        setOverduePOs(pos.filter(p => p.status === "issued" && p.delivery_date_expected && new Date(p.delivery_date_expected) < new Date()).length);
      }

      if (prRes.data) {
        const prs = prRes.data as { approval_status: string }[];
        setPrCount(prs.length);
        setPendingPRs(prs.filter(p => p.approval_status === "submitted" || p.approval_status === "under_budget_review").length);
        setApprovedPRs(prs.filter(p => p.approval_status === "approved" || p.approval_status === "closed").length);
        setClosedPRs(prs.filter(p => p.approval_status === "closed").length);
      }

      if (supRes.data) {
        setQualifiedSuppliers(supRes.data.length);
        const supList = supRes.data as { id: string; supplier_name: string; status: string }[];

        listPos("supplier_id, grand_total").then(({ data }) => {
          if (data) {
            const pos = data as { supplier_id: string; grand_total: number | null }[];
            const map = new Map<string, { total: number; count: number }>();
            for (const po of pos) {
              if (!po.supplier_id) continue;
              const curr = map.get(po.supplier_id) ?? { total: 0, count: 0 };
              curr.total += po.grand_total ?? 0;
              curr.count += 1;
              map.set(po.supplier_id, curr);
            }
            const sorted = Array.from(map.entries())
              .map(([id, v]) => ({ name: supList.find(s => s.id === id)?.supplier_name ?? "Unknown", total: v.total, count: v.count }))
              .sort((a, b) => b.total - a.total)
              .slice(0, 5);
            setTopSuppliers(sorted);
          }
        });
      }

      if (dnRes.data) {
        const dns = dnRes.data as unknown as { delivery_date: string; status: string; procurement_pos: { delivery_date_expected: string } | null }[];
        let onTime = 0;
        let late = 0;
        for (const dn of dns) {
          if (dn.status === "delivered" || dn.status === "accepted") {
            const expected = dn.procurement_pos?.delivery_date_expected;
            if (expected && new Date(dn.delivery_date) <= new Date(expected)) onTime++;
            else if (expected) late++;
          }
        }
        setDeliveredOnTime(onTime);
        setDeliveredLate(late);
      }

      setLoading(false);
    });
  }, []);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  const onTimeRate = deliveredOnTime + deliveredLate > 0 ? Math.round((deliveredOnTime / (deliveredOnTime + deliveredLate)) * 100) : 0;
  const approveRate = prCount > 0 ? Math.round((approvedPRs / prCount) * 100) : 0;
  const deliverRate = poCount > 0 ? Math.round((deliveredPOs / poCount) * 100) : 0;
  const avgSpend = poCount > 0 ? Math.round(totalSpend / poCount) : 0;

  const kpis: KPI[] = [
    { label: "Total Spend", value: `$${totalSpend.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", sub: `Across ${poCount} POs` },
    { label: "Pending Approvals", value: String(pendingPRs), icon: Clock, color: "text-amber-600", sub: `${prCount} total PRs` },
    { label: "On-Time Delivery", value: `${onTimeRate}%`, icon: CheckCircle, color: onTimeRate >= 80 ? "text-emerald-600" : "text-red-600", sub: `${deliveredOnTime} of ${deliveredOnTime + deliveredLate} deliveries` },
    { label: "Active Suppliers", value: String(qualifiedSuppliers), icon: Truck, color: "text-blue-600", sub: `${overduePOs} overdue POs` },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {kpis.map(kpi => (
          <Card key={kpi.label}>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
                  <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                </div>
                <kpi.icon className={`h-8 w-8 ${kpi.color} opacity-30`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top Suppliers by Spend</h3>
            {topSuppliers.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No spend data.</p>
            ) : (
              <div className="space-y-3">
                {topSuppliers.map((s, i) => {
                  const pct = totalSpend > 0 ? Math.round((s.total / totalSpend) * 100) : 0;
                  return (
                    <div key={s.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{i + 1}. {s.name}</span>
                        <span className="text-muted-foreground">${s.total.toLocaleString()} ({s.count} POs)</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Quick Insights</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center pb-2 border-b">
                <span>PRs Approved Rate</span>
                <span className="font-semibold">{approveRate}%</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span>POs Delivered</span>
                <span className="font-semibold">{deliverRate}%</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b">
                <span>Overdue Deliveries</span>
                <span className="font-semibold text-red-600">{overduePOs}</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Avg Spend per PO</span>
                <span className="font-semibold">${avgSpend.toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
