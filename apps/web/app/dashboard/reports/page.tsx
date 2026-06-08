"use client";

import { FileText, BarChart2, TrendingUp, DollarSign, Package, AlertTriangle, HardHat, Clock, ClipboardList, Loader2 } from "lucide-react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REPORT_GROUPS = [
  {
    title: "Executive",
    reports: [
      { href: "/dashboard", label: "Executive Dashboard", icon: BarChart2, desc: "Cross-module KPIs and trends", color: "bg-blue-50 text-blue-600" },
    ],
  },
  {
    title: "Financial",
    reports: [
      { href: "/dashboard/account/reports/trial-balance", label: "Trial Balance", icon: DollarSign, desc: "General ledger trial balance", color: "bg-emerald-50 text-emerald-600" },
      { href: "/dashboard/account/reports/profit-loss", label: "Profit & Loss", icon: TrendingUp, desc: "Income and expense summary", color: "bg-emerald-50 text-emerald-600" },
      { href: "/dashboard/account/reports/balance-sheet", label: "Balance Sheet", icon: FileText, desc: "Assets, liabilities, equity", color: "bg-emerald-50 text-emerald-600" },
      { href: "/dashboard/account/reports/cash-flow", label: "Cash Flow", icon: DollarSign, desc: "Cash flow forecast", color: "bg-emerald-50 text-emerald-600" },
      { href: "/dashboard/account/reports/ap-aging", label: "AP Aging", icon: Clock, desc: "Supplier invoice aging", color: "bg-emerald-50 text-emerald-600" },
      { href: "/dashboard/account/reports/ar-aging", label: "AR Aging", icon: Clock, desc: "Client invoice aging", color: "bg-emerald-50 text-emerald-600" },
      { href: "/dashboard/account/reports/budget-vs-actual", label: "Budget vs Actual", icon: TrendingUp, desc: "Budget variance analysis", color: "bg-emerald-50 text-emerald-600" },
    ],
  },
  {
    title: "Planning & Schedule",
    reports: [
      { href: "/dashboard/planning/reports", label: "Schedule Reports", icon: Clock, desc: "Delay analysis, milestones", color: "bg-teal-50 text-teal-600" },
      { href: "/dashboard/planning/comparison", label: "Plan Comparison", icon: BarChart2, desc: "Baseline vs planned variance", color: "bg-teal-50 text-teal-600" },
    ],
  },
  {
    title: "Operations",
    reports: [
      { href: "/dashboard/procurement", label: "Procurement Status", icon: Package, desc: "PR/PO status overview", color: "bg-amber-50 text-amber-600" },
      { href: "/dashboard/hse", label: "HSE Dashboard", icon: AlertTriangle, desc: "Safety metrics and incidents", color: "bg-red-50 text-red-600" },
      { href: "/dashboard/site", label: "Site Dashboard", icon: HardHat, desc: "Daily reports and progress", color: "bg-orange-50 text-orange-600" },
      { href: "/dashboard/documents/controller", label: "Document Status", icon: ClipboardList, desc: "Document control KPIs", color: "bg-purple-50 text-purple-600" },
    ],
  },
];

export default function ReportsHubPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
        <p className="text-sm text-muted-foreground">Consolidated report listing across all modules</p>
      </div>

      {REPORT_GROUPS.map((group) => (
        <div key={group.title} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {group.reports.map((report) => (
              <Link key={report.href} href={report.href}>
                <Card className="h-full transition-colors hover:bg-muted/50 cursor-pointer">
                  <CardContent className="flex items-start gap-3 p-4">
                    <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", report.color)}>
                      <report.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{report.label}</p>
                      <p className="text-xs text-muted-foreground">{report.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
