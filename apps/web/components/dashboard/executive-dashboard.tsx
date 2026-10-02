"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { countHseIncidents, countProjectsWithProjectTypeTender, countProjectsWithProjectTypeTenderOfId, listDocuments, listDocumentsOrderedByCreatedAt, listProcurementPos, listProcurementPrs, listWbsTasks } from "@/lib/dashboard/dashboard-queries";
import { KPICard } from "@/components/ui/kpi-card";
import {
  HardHat, ListChecks, FileText, AlertTriangle, Package,
  DollarSign, Clock, Loader2, TrendingDown, Handshake,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WhoIsOnLeaveToday } from "@/components/hr/leave/who-is-on-leave-today";
import { BarChart } from "@/components/report-kit/charts/bar-chart";
import { getProjectCostAnalytics } from "@/lib/evm-service";

interface KpiData {
  preContractProjects: number;
  postContractProjects: number;
  totalTasks: number;
  taskNotStarted: number;
  taskInProgress: number;
  taskCompleted: number;
  totalDocuments: number;
  docPendingReview: number;
  hseIncidents: number;
  pendingPRs: number;
  pendingPOs: number;
}

interface QsKpi {
  portfolioBudget: number;
  portfolioActual: number;
  portfolioEac: number;
  atRiskProjects: number;
}

interface RecentDoc {
  id: string;
  document_number: string;
  title: string;
  status: string;
  created_at: string;
}

export function ExecutiveDashboard() {
  const [kpi, setKpi]       = useState<KpiData | null>(null);
  const [qsKpi, setQsKpi]   = useState<QsKpi | null>(null);
  const [recentDocs, setRecentDocs] = useState<RecentDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const prevKpiRef = useRef<KpiData | null>(null);

  function trendDiff(current: number, previous?: number) {
    if (previous === undefined) return undefined;
    const diff = current - previous;
    if (diff > 0) return { trend: "up" as const, trendLabel: `+${diff}` };
    if (diff < 0) return { trend: "down" as const, trendLabel: `${diff}` };
    return { trend: "flat" as const, trendLabel: "0" };
  }

  function inverseTrendDiff(current: number, previous?: number) {
    const t = trendDiff(current, previous);
    if (!t) return undefined;
    if (t.trend === "up") return { ...t, trend: "down" as const };
    if (t.trend === "down") return { ...t, trend: "up" as const };
    return t;
  }

  const taskBarData = useMemo(() => kpi ? [{
    status: "Tasks",
    "Not Started": kpi.taskNotStarted,
    "In Progress": kpi.taskInProgress,
    Completed: kpi.taskCompleted,
  }] : [], [kpi]);

  const taskBarSeries = useMemo(() => [
    { dataKey: "Not Started", name: "Not Started", color: "#9ca3af" },
    { dataKey: "In Progress", name: "In Progress", color: "#3b82f6" },
    { dataKey: "Completed", name: "Completed", color: "#10b981" },
  ], []);

  useEffect(() => {
    Promise.all([
      countProjectsWithProjectTypeTender(),
      countProjectsWithProjectTypeTenderOfId(),
      listWbsTasks(),
      listDocuments(),
      countHseIncidents(),
      listProcurementPrs(),
      listProcurementPos(),
      listDocumentsOrderedByCreatedAt(),
    ]).then(([preRes, postRes, taskRes, docRes, hseRes, prRes, poRes, recentRes]) => {
      const tasks = taskRes.data ?? [];
      const docs = docRes.data ?? [];
      const prs = prRes.data ?? [];

      const newKpi: KpiData = {
        preContractProjects: preRes.count ?? 0,
        postContractProjects: postRes.count ?? 0,
        totalTasks: tasks.length,
        taskNotStarted: tasks.filter((t: any) => t.status === "not_started").length,
        taskInProgress: tasks.filter((t: any) => t.status === "in_progress").length,
        taskCompleted: tasks.filter((t: any) => t.status === "completed").length,
        totalDocuments: docs.length,
        docPendingReview: docs.filter((d: any) => d.status === "submitted" || d.status === "under_review").length,
        hseIncidents: hseRes.count ?? 0,
        pendingPRs: prs.filter((p: any) => ["draft", "submitted", "under_budget_review"].includes(p.approval_status)).length,
        pendingPOs: (poRes.data ?? []).filter((p: any) => p.status === "issued" || p.status === "submitted").length,
      };
      prevKpiRef.current = kpi;
      setKpi(newKpi);
      if (recentRes.data) setRecentDocs(recentRes.data as RecentDoc[]);
      setLoading(false);
    });

    getProjectCostAnalytics().then((projects) => {
      const portfolioBudget = projects.reduce((s, p) => s + p.budget, 0);
      const portfolioActual = projects.reduce((s, p) => s + p.actual, 0);
      const portfolioEac    = projects.reduce((s, p) => s + (p.evm?.eac ?? p.budget), 0);
      const atRiskProjects  = projects.filter((p) => p.evm && (p.evm.cpi ?? 1) < 0.95).length;
      setQsKpi({ portfolioBudget, portfolioActual, portfolioEac, atRiskProjects });
    }).catch(() => {/* QS data unavailable — fail silently */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!kpi) return null;

  /* eslint-disable react-hooks/refs */
  const p = prevKpiRef.current;
  const preContractTrend = p ? trendDiff(kpi.preContractProjects, p.preContractProjects) : undefined;
  const postContractTrend = p ? trendDiff(kpi.postContractProjects, p.postContractProjects) : undefined;
  const tasksTrend = p ? trendDiff(kpi.totalTasks, p.totalTasks) : undefined;
  const docsTrend = p ? trendDiff(kpi.totalDocuments, p.totalDocuments) : undefined;
  const hseTrend = p ? inverseTrendDiff(kpi.hseIncidents, p.hseIncidents) : undefined;
  const procurementTrend = p
    ? inverseTrendDiff(kpi.pendingPRs + kpi.pendingPOs, p.pendingPRs + p.pendingPOs)
    : undefined;
  /* eslint-enable react-hooks/refs */

  const taskCompletionRate = kpi.totalTasks > 0 ? Math.round((kpi.taskCompleted / kpi.totalTasks) * 100) : 0;

  const STATUS_COLORS: Record<string, string> = {
    draft: "bg-gray-500/10 text-gray-500",
    submitted: "bg-blue-500/10 text-blue-600",
    under_review: "bg-amber-500/10 text-amber-600",
    approved: "bg-emerald-500/10 text-emerald-600",
    rejected: "bg-red-500/10 text-red-600",
    ifc: "bg-green-500/10 text-green-600",
  };

  return (
    <div className="space-y-6">
      {/* Row 1: Module KPI cards with trends */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KPICard
          label="Pre-Contract"
          value={kpi.preContractProjects}
          icon={Handshake}
          iconColor="text-amber-600" iconBg="bg-amber-50"
          subtitle="Tender projects"
          {...(preContractTrend ?? {})}
        />
        <KPICard
          label="Post-Contract"
          value={kpi.postContractProjects}
          icon={HardHat}
          iconColor="text-emerald-600" iconBg="bg-emerald-50"
          subtitle="Awarded projects"
          {...(postContractTrend ?? {})}
        />
        <KPICard
          label="Total Tasks"
          value={kpi.totalTasks}
          icon={ListChecks}
          iconColor="text-indigo-600" iconBg="bg-indigo-50"
          subtitle={`${taskCompletionRate}% complete`}
          {...(tasksTrend ?? {})}
        />
        <KPICard
          label="Documents"
          value={kpi.totalDocuments}
          icon={FileText}
          iconColor="text-purple-600" iconBg="bg-purple-50"
          subtitle={`${kpi.docPendingReview} pending review`}
          {...(docsTrend ?? {})}
        />
        <KPICard
          label="HSE Incidents"
          value={kpi.hseIncidents}
          icon={AlertTriangle}
          iconColor="text-red-600" iconBg="bg-red-50"
          {...(hseTrend ?? {})}
        />
        <KPICard
          label="Pending Procurement"
          value={kpi.pendingPRs + kpi.pendingPOs}
          icon={Package}
          iconColor="text-amber-600" iconBg="bg-amber-50"
          subtitle={`${kpi.pendingPRs} PRs, ${kpi.pendingPOs} POs`}
          {...(procurementTrend ?? {})}
        />
      </div>

      {/* Row 1b: QS / Commercial KPIs */}
      {qsKpi && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KPICard
            label="Portfolio Budget"
            value={`$${(qsKpi.portfolioBudget / 1_000_000).toFixed(1)}M`}
            icon={DollarSign}
            iconColor="text-emerald-600" iconBg="bg-emerald-50"
            subtitle="Total BOQ across projects"
          />
          <KPICard
            label="Spent to Date"
            value={`$${(qsKpi.portfolioActual / 1_000_000).toFixed(1)}M`}
            icon={DollarSign}
            iconColor="text-blue-600" iconBg="bg-blue-50"
            subtitle={`${qsKpi.portfolioBudget > 0 ? Math.round(qsKpi.portfolioActual / qsKpi.portfolioBudget * 100) : 0}% of budget`}
          />
          <KPICard
            label="Portfolio EAC"
            value={`$${(qsKpi.portfolioEac / 1_000_000).toFixed(1)}M`}
            icon={TrendingDown}
            iconColor="text-amber-600" iconBg="bg-amber-50"
            subtitle="Estimate at completion"
          />
          <KPICard
            label="At-Risk Projects"
            value={qsKpi.atRiskProjects}
            icon={AlertTriangle}
            iconColor="text-red-600" iconBg="bg-red-50"
            subtitle="CPI < 0.95"
          />
        </div>
      )}

      {/* Row 2: Task breakdown + document status */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Task Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <BarChart
              data={taskBarData}
              series={taskBarSeries}
              xKey="status"
              stacked
              height={200}
              formatTooltip={(val) => `${val} tasks`}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">Recent Documents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recent documents</p>
              ) : (
                recentDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 text-sm">
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.document_number}</p>
                      <p className="text-xs text-muted-foreground truncate">{doc.title}</p>
                    </div>
                    <span className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium capitalize shrink-0",
                      STATUS_COLORS[doc.status] ?? "bg-gray-500/10 text-gray-500",
                    )}>
                      {doc.status.replace(/_/g, " ")}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Who's on Leave Today (compact) */}
      <WhoIsOnLeaveToday compact />

      {/* Row 4: Quick links to module dashboards */}
      <div className="rounded-lg border border-border bg-muted/20 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Quick Access</p>
        <div className="flex flex-wrap gap-3">
          {[
            { href: "/dashboard/projects", label: "Projects", icon: HardHat, color: "bg-blue-50 text-blue-600" },
            { href: "/dashboard/tasks", label: "Tasks", icon: ListChecks, color: "bg-indigo-50 text-indigo-600" },
            { href: "/dashboard/documents", label: "Documents", icon: FileText, color: "bg-purple-50 text-purple-600" },
            { href: "/dashboard/procurement", label: "Procurement", icon: Package, color: "bg-amber-50 text-amber-600" },
            { href: "/dashboard/hse", label: "HSE", icon: AlertTriangle, color: "bg-red-50 text-red-600" },
            { href: "/dashboard/planning", label: "Planning", icon: Clock, color: "bg-teal-50 text-teal-600" },
            { href: "/dashboard/site", label: "Site", icon: HardHat, color: "bg-orange-50 text-orange-600" },
            { href: "/dashboard/account", label: "Finance", icon: DollarSign, color: "bg-green-50 text-green-600" },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors",
              )}
            >
              <div className={cn("flex h-6 w-6 items-center justify-center rounded", link.color)}>
                <link.icon className="h-3.5 w-3.5" />
              </div>
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
