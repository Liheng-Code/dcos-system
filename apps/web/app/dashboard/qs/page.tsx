"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  BookOpen, DollarSign, Loader2, BarChart2, Shield,
  Briefcase, History, AlertTriangle, Activity, ArrowRight, Ruler,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { KPICard } from "@/components/ui/kpi-card";
import { useProject } from "@/components/dashboard/project-context";
import { ContingencyRegister } from "@/components/qs/contingency-register";
import { CurrencySettings } from "@/components/qs/currency-settings";
import { QsAuditLog } from "@/components/qs/audit-log";
import { CostControl } from "@/components/qs/cost-control";
import { PortfolioView } from "@/components/qs/portfolio-view";
import {
  getBoqList,
  getVariationOrders,
  getContingencyBalance,
  getProgressClaims,
  getBudgetSummary,
  getQsAuditLog,
  type QsVariationOrder,
  type QsProgressClaim,
  type BudgetSummary,
  type QsAuditEntry,
} from "@/lib/qs-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "cost-control", label: "Cost Control"       },
  { id: "contingency",  label: "Contingency"         },
  { id: "portfolio",    label: "Portfolio"           },
  { id: "audit",        label: "Audit Log"           },
  { id: "currency",     label: "Currency"            },
] as const;

type Tab = (typeof TABS)[number]["id"];

const QUICK_ACCESS = [
  { id: "boq",         label: "Bill of Quantities", icon: BookOpen,       desc: "Manage project BOQs, items, and pricing",   color: "bg-emerald-50 text-emerald-600", href: "/dashboard/qs/boq" },
  { id: "cost-control", label: "Cost Control",       icon: BarChart2,      desc: "Budget vs actual, revisions, transactions", color: "bg-blue-50 text-blue-600" },
  { id: "contingency",  label: "Contingency",         icon: Shield,         desc: "Contingency reserve and drawdowns",         color: "bg-amber-50 text-amber-600" },
  { id: "portfolio",    label: "Portfolio",           icon: Briefcase,      desc: "Cross-project cost analytics and EVM",      color: "bg-purple-50 text-purple-600" },
  { id: "audit",        label: "Audit Log",           icon: History,        desc: "Track changes across all QS records",       color: "bg-slate-50 text-slate-600" },
  { id: "currency",     label: "Currency",            icon: DollarSign,     desc: "Multi-currency and exchange rates",         color: "bg-cyan-50 text-cyan-600" },
  { id: "qto",          label: "Quantity Take-off",   icon: Ruler,          desc: "Measure drawings and build net quantities", color: "bg-teal-50 text-teal-600", href: "/dashboard/qto" },
] as const;

interface QsDashboardData {
  boqCount: number;
  totalBoqValue: number;
  voCount: number;
  approvedVoCount: number;
  approvedVoValue: number;
  contingencyBudget: number;
  contingencyApproved: number;
  contingencyPending: number;
  contingencyBalance: number;
  claimCount: number;
  pendingClaimCount: number;
  totalClaimValue: number;
  budgetVariance: number;
  budgetVariancePct: number;
  totalActual: number;
  recentActivity: QsAuditEntry[];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatCurrencyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${Math.round(value)}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getTableLabel(table: string): string {
  const labels: Record<string, string> = {
    qs_variation_orders: "Variation",
    qs_progress_claims: "Claim",
    qs_retention_ledger: "Retention",
    qs_contingency_drawdowns: "Contingency",
    qs_budget_revisions: "Budget Revision",
    qs_boq: "BOQ",
    qs_boq_sections: "BOQ Section",
    qs_boq_items: "BOQ Item",
    qs_cost_transactions: "Cost Transaction",
    qs_vo_items: "VO Item",
    qs_claim_items: "Claim Item",
    qs_cost_baseline: "Cost Baseline",
  };
  return labels[table] ?? table.replace("qs_", "").replace(/_/g, " ");
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    INSERT: "created",
    UPDATE: "updated",
    DELETE: "deleted",
  };
  return labels[action] ?? action.toLowerCase();
}

export default function QsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <QsContent />
    </Suspense>
  );
}

function QsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [checking, setChecking] = useState(true);
  const tabParam = searchParams.get("tab") as Tab | null;
  const activeTab = tabParam && TABS.some((t) => t.id === tabParam) ? tabParam : null;
  const [tab, setTab] = useState<Tab | null>(activeTab);
  const { selectedProjectId: projectId, selectedProject } = useProject();
  const projectName = selectedProject?.project_name ?? projectId;

  const [dashboardData, setDashboardData] = useState<QsDashboardData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.push("/"); return; }
      setChecking(false);
    });
  }, [router]);

  useEffect(() => {
    if (!projectId) { setDashboardData(null); setDataLoading(false); return; }

    setDataLoading(true);
    Promise.all([
      getBoqList(projectId),
      getVariationOrders(projectId),
      getContingencyBalance(projectId),
      getProgressClaims(projectId),
      getBudgetSummary(projectId),
      getQsAuditLog(projectId, 5),
    ]).then(([boqsData, vos, contingency, claims, budget, audit]) => {
      const totalBoqValue = boqsData.reduce((s, b) => s + Number(b.total_amount), 0);
      const approvedVos = vos.filter((v) => v.status === "approved" || v.status === "implemented");
      const pendingClaims = claims.filter((c) => c.status === "submitted" || c.status === "client_reviewed");
      const totalClaimValue = claims.reduce((s, c) => s + Number(c.current_payment_due), 0);

      setDashboardData({
        boqCount: boqsData.length,
        totalBoqValue,
        voCount: vos.length,
        approvedVoCount: approvedVos.length,
        approvedVoValue: approvedVos.reduce((s, v) => s + Number(v.total_amount), 0),
        contingencyBudget: contingency.contingencyBudget,
        contingencyApproved: contingency.approved,
        contingencyPending: contingency.pending,
        contingencyBalance: contingency.balance,
        claimCount: claims.length,
        pendingClaimCount: pendingClaims.length,
        totalClaimValue,
        budgetVariance: budget.variance,
        budgetVariancePct: budget.variancePct,
        totalActual: budget.totalActual,
        recentActivity: audit,
      });
      setDataLoading(false);
    }).catch((error) => {
      toast.error(error instanceof Error ? error.message : "Failed to load QS data");
      setDataLoading(false);
    });
  }, [projectId]);

  useEffect(() => {
    setTab(activeTab);
  }, [activeTab]);

  if (checking) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tab && projectId) {
    return (
      <div className="flex h-full flex-col">
        <div className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
              <DollarSign className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Quantity Surveying</h1>
              <p className="text-sm text-muted-foreground">
                Cost control, BOQ management, budget tracking, and QS reporting
              </p>
            </div>
          </div>
          <div className="mt-3">
            <Button variant="ghost" size="sm" className="gap-1.5 -ml-2 text-muted-foreground hover:text-foreground" onClick={() => { router.push("/dashboard/qs"); setTab(null); }}>
              <ArrowRight className="h-4 w-4 rotate-180" />
              Back to Dashboard
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <>
            {tab === "cost-control" && <CostControl         projectId={projectId} projectName={projectName} />}
            {tab === "contingency"   && <ContingencyRegister projectId={projectId} />}
            {tab === "portfolio"    && <PortfolioView />}
            {tab === "audit"        && <QsAuditLog          projectId={projectId} />}
            {tab === "currency"     && <CurrencySettings    projectId={projectId} />}
          </>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
            <DollarSign className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Quantity Surveying</h1>
            <p className="text-sm text-muted-foreground">
              Cost control, BOQ management, budget tracking, and QS reporting
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {!projectId ? (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            Select a project to view QS data.
          </div>
        ) : dataLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dashboardData ? (
          <div className="space-y-8">
            {/* KPI Stats Row */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KPICard
                label="Total BOQ Value"
                value={formatCurrencyShort(dashboardData.totalBoqValue)}
                icon={DollarSign}
                iconBg="bg-emerald-50"
                iconColor="text-emerald-600"
                subtitle={`${dashboardData.boqCount} BOQ${dashboardData.boqCount !== 1 ? "s" : ""}`}
              />
              <KPICard
                label="Approved Variations"
                value={dashboardData.approvedVoCount}
                icon={BarChart2}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                subtitle={dashboardData.approvedVoCount > 0 ? `Worth ${formatCurrencyShort(dashboardData.approvedVoValue)}` : "No approved variations"}
              />
              <KPICard
                label="Contingency Used"
                value={dashboardData.contingencyBudget > 0 ? `${Math.round((dashboardData.contingencyApproved / dashboardData.contingencyBudget) * 100)}%` : "—"}
                icon={Shield}
                iconBg="bg-amber-50"
                iconColor="text-amber-600"
                subtitle={`${formatCurrencyShort(dashboardData.contingencyBalance)} remaining`}
                trend={dashboardData.contingencyApproved > 0 ? ((dashboardData.contingencyApproved / dashboardData.contingencyBudget) > 0.75 ? "down" : "up") as "up" | "down" : undefined}
                trendLabel={dashboardData.contingencyApproved > 0 ? `${formatCurrencyShort(dashboardData.contingencyApproved)} drawn` : undefined}
              />
              <KPICard
                label="Active Claims"
                value={dashboardData.pendingClaimCount}
                icon={Activity}
                iconBg="bg-red-50"
                iconColor="text-red-600"
                subtitle={dashboardData.totalClaimValue > 0 ? `${formatCurrencyShort(dashboardData.totalClaimValue)} total claimed` : "No active claims"}
              />
            </div>

            {/* Quick Access Card Grid */}
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Quick Access</h2>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {QUICK_ACCESS.map((m) => (
                  <Link key={m.id} href={"href" in m && m.href ? m.href : `/dashboard/qs?tab=${m.id}`} onClick={() => { if (!("href" in m) || !m.href) setTab(m.id as Tab); }}>
                    <Card className="transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer h-full">
                      <CardContent className="flex items-center gap-4 p-5">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${m.color}`}>
                          <m.icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{m.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{m.desc}</p>
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>

            {/* Alerts + Recent Activity */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Attention Required */}
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <h3 className="text-sm font-semibold">Attention Required</h3>
                  </div>
                  {dashboardData.pendingClaimCount === 0 && dashboardData.contingencyPending === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">All clear — no items need attention.</p>
                  ) : (
                    <div className="space-y-2">
                      {dashboardData.pendingClaimCount > 0 && (
                        <Link href="/dashboard/qs/claims" className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">{dashboardData.pendingClaimCount}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Pending Claims</p>
                            <p className="text-xs text-muted-foreground">{dashboardData.pendingClaimCount} claim{dashboardData.pendingClaimCount !== 1 ? "s" : ""} awaiting review or certification</p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                        </Link>
                      )}
                      {dashboardData.contingencyPending > 0 && (
                        <Link href="/dashboard/qs?tab=contingency" className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xs font-bold">{Math.round(dashboardData.contingencyPending)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Pending Drawdowns</p>
                            <p className="text-xs text-muted-foreground">{formatCurrencyShort(dashboardData.contingencyPending)} in contingency drawdowns pending approval</p>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                        </Link>
                      )}
                      {dashboardData.budgetVariance < 0 && (
                        <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm">
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 text-xs font-bold">!</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium">Budget Overrun</p>
                            <p className="text-xs text-muted-foreground">{formatCurrencyShort(Math.abs(dashboardData.budgetVariance))} overspent ({dashboardData.budgetVariancePct.toFixed(1)}% over budget)</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Recent Activity</h3>
                  </div>
                  {dashboardData.recentActivity.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No recent activity recorded.</p>
                  ) : (
                    <div className="space-y-2">
                      {dashboardData.recentActivity.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-3 rounded-lg border border-border/60 p-3 text-sm">
                          <div className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                            entry.action === "INSERT" ? "bg-emerald-100 text-emerald-600" :
                            entry.action === "UPDATE" ? "bg-blue-100 text-blue-600" :
                            "bg-red-100 text-red-600",
                          )}>
                            {entry.action === "INSERT" ? "+" : entry.action === "UPDATE" ? "~" : "—"}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">
                              {getTableLabel(entry.table_name)} <span className="text-muted-foreground font-normal">{getActionLabel(entry.action)}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">{formatDate(entry.changed_at)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Cost Position Summary */}
            {dashboardData.totalActual > 0 && (
              <Card>
                <CardContent className="p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Cost Position</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums">{formatCurrencyShort(dashboardData.totalBoqValue)}</p>
                      <p className="text-xs text-muted-foreground">Budget</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold tabular-nums">{formatCurrencyShort(dashboardData.totalActual)}</p>
                      <p className="text-xs text-muted-foreground">Actual Spent</p>
                    </div>
                    <div className="text-center">
                      <p className={cn("text-lg font-bold tabular-nums", dashboardData.budgetVariance >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {dashboardData.budgetVariance >= 0 ? "+" : ""}{formatCurrencyShort(dashboardData.budgetVariance)}
                      </p>
                      <p className="text-xs text-muted-foreground">Variance</p>
                    </div>
                    <div className="text-center">
                      <p className={cn("text-lg font-bold tabular-nums", dashboardData.budgetVariancePct >= 0 ? "text-emerald-600" : "text-red-600")}>
                        {dashboardData.budgetVariancePct >= 0 ? "+" : ""}{dashboardData.budgetVariancePct.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">Variance %</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
