"use client";

import { useRouter } from "next/navigation";
import { BarChart2, Scale, DollarSign, CalendarRange, Clock, Receipt, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const reports = [
  { href: "/dashboard/account/reports/trial-balance", label: "Trial Balance", icon: Scale, desc: "Account balances with debit/credit totals" },
  { href: "/dashboard/account/reports/profit-loss", label: "Profit & Loss", icon: TrendingUp, desc: "Income and expense summary" },
  { href: "/dashboard/account/reports/balance-sheet", label: "Balance Sheet", icon: BarChart2, desc: "Assets, liabilities, and equity" },
  { href: "/dashboard/account/reports/cash-flow", label: "Cash Flow Forecast", icon: DollarSign, desc: "Projected inflows and outflows" },
  { href: "/dashboard/account/reports/ap-aging", label: "AP Aging", icon: Clock, desc: "Supplier invoice aging buckets" },
  { href: "/dashboard/account/reports/ar-aging", label: "AR Aging", icon: Receipt, desc: "Client invoice aging buckets" },
  { href: "/dashboard/account/reports/budget-vs-actual", label: "Budget vs Actual", icon: CalendarRange, desc: "Budget consumption by project" },
] as const;

export default function ReportsPage() {
  const router = useRouter();
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <BarChart2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Account Reports</h1>
            <p className="text-sm text-muted-foreground">Financial reports and analysis</p>
          </div>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(r => (
            <Card key={r.href} className="cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => router.push(r.href)}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50">
                    <r.icon className="h-4 w-4 text-emerald-600" />
                  </div>
                  <CardTitle className="text-sm">{r.label}</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">{r.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
