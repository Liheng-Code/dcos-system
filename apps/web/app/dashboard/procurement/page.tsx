"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Loader2, FileText, Package, Building2, CheckSquare, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import Link from "next/link";

export default function ProcurementDashboardPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [stats, setStats] = useState({ pendingPR: 0, pendingPO: 0, supplierCount: 0, overdueDeliveries: 0, pqExpiring: 0 });

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);

      supabase.from("procurement_prs").select("id", { count: "exact", head: true }).in("approval_status", ["submitted", "under_budget_review"]).then(({ count }) => setStats(s => ({ ...s, pendingPR: count ?? 0 })));
      supabase.from("procurement_pos").select("id", { count: "exact", head: true }).in("status", ["submitted", "approved"]).then(({ count }) => setStats(s => ({ ...s, pendingPO: count ?? 0 })));
      supabase.from("procurement_suppliers").select("id", { count: "exact", head: true }).then(({ count }) => setStats(s => ({ ...s, supplierCount: count ?? 0 })));
      supabase.from("procurement_suppliers").select("id", { count: "exact", head: true }).eq("pq_status", "approved").lte("pq_expires_at", new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)).then(({ count }) => setStats(s => ({ ...s, pqExpiring: count ?? 0 })));
      supabase.from("procurement_delivery_notes").select("id", { count: "exact", head: true }).eq("status", "in_transit").then(({ count }) => setStats(s => ({ ...s, overdueDeliveries: count ?? 0 })));
    });
  }, [router]);

  if (checking) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const cards = [
    { label: "Pending PRs", value: stats.pendingPR, icon: FileText, href: "/dashboard/procurement/pr", color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Pending POs", value: stats.pendingPO, icon: Package, href: "/dashboard/procurement/po", color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Suppliers", value: stats.supplierCount, icon: Building2, href: "/dashboard/procurement/suppliers", color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "PQ Expiring", value: stats.pqExpiring, icon: ShieldCheck, href: "/dashboard/procurement/prequalification", color: "text-orange-600", bg: "bg-orange-50" },
    { label: "In Transit", value: stats.overdueDeliveries, icon: TrendingUp, href: "/dashboard/procurement/goods-receipt", color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Procurement</h1>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href}>
            <Card className="rounded-xl hover:shadow-md hover:border-primary/20 transition-all cursor-pointer">
              <CardContent className="pt-5 pb-5 px-5">
                <div className="flex items-center justify-between">
                  <div className={`rounded-lg p-2.5 ${c.bg}`}><c.icon className={`h-5 w-5 ${c.color}`} /></div>
                </div>
                <p className="mt-3 text-2xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card className="rounded-xl">
          <CardContent className="pt-5 pb-5 px-5">
            <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link href="/dashboard/procurement/pr/new" className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
                <FileText className="h-4 w-4 text-muted-foreground" /> Create Purchase Requisition
              </Link>
              <Link href="/dashboard/procurement/po/new" className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
                <Package className="h-4 w-4 text-muted-foreground" /> Create Purchase Order
              </Link>
              <Link href="/dashboard/procurement/goods-receipt/new" className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
                <CheckSquare className="h-4 w-4 text-muted-foreground" /> Record Goods Receipt
              </Link>
              <Link href="/dashboard/procurement/suppliers" className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
                <Building2 className="h-4 w-4 text-muted-foreground" /> Manage Suppliers
              </Link>
              <Link href="/dashboard/procurement/prequalification" className="flex items-center gap-3 rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted transition-colors">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" /> Supplier Prequalification
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl">
          <CardContent className="pt-5 pb-5 px-5">
            <h3 className="font-semibold text-sm mb-3">Attention Required</h3>
            {stats.pendingPR === 0 && stats.pendingPO === 0 && stats.overdueDeliveries === 0 && stats.pqExpiring === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">All clear — no pending items.</p>
            ) : (
              <div className="space-y-2">
                {stats.pendingPR > 0 && (
                  <Link href="/dashboard/procurement/pr" className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium hover:bg-amber-100 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-amber-600" /> {stats.pendingPR} PR(s) awaiting approval
                  </Link>
                )}
                {stats.pendingPO > 0 && (
                  <Link href="/dashboard/procurement/po" className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium hover:bg-blue-100 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-blue-600" /> {stats.pendingPO} PO(s) awaiting approval
                  </Link>
                )}
                {stats.overdueDeliveries > 0 && (
                  <Link href="/dashboard/procurement/goods-receipt" className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm font-medium hover:bg-purple-100 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-purple-600" /> {stats.overdueDeliveries} delivery(ies) in transit
                  </Link>
                )}
                {stats.pqExpiring > 0 && (
                  <Link href="/dashboard/procurement/prequalification" className="flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium hover:bg-orange-100 transition-colors">
                    <AlertTriangle className="h-4 w-4 text-orange-600" /> {stats.pqExpiring} supplier PQ approval(s) expiring
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
