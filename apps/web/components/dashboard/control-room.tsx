"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getControlRoomData,
  getPortfolioKpis,
  type ControlRoomData,
  type PortfolioKpis,
} from "@/lib/control-room-service";
import type { InboxItem } from "@/components/dashboard/action-inbox";
import type { AttentionItem } from "@/components/dashboard/needs-attention";
import type { ActivityItem } from "@/components/dashboard/traceability-feed";
import { ProjectHealthStrip } from "@/components/dashboard/project-health-strip";
import { ActionInbox } from "@/components/dashboard/action-inbox";
import { NeedsAttention } from "@/components/dashboard/needs-attention";
import { HealthGrid } from "@/components/dashboard/health-grid";
import { TraceabilityFeed } from "@/components/dashboard/traceability-feed";
import { RecentDocuments } from "@/components/dashboard/recent-documents";
import { PortfolioBand } from "@/components/dashboard/portfolio-band";

export interface ControlRoomProps {
  projectId: string | null;
  projectName?: string;
  projectCode?: string;
  projectProgress?: number;
}

const dayMs = 86_400_000;

function agingDays(dateStr?: string | null): number {
  if (!dateStr) return 0;
  const start = new Date(dateStr).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((Date.now() - start) / dayMs));
}

const DOC_INBOX_STATUSES = ["submitted", "under_review"];

export function ControlRoom({
  projectId,
  projectName,
  projectCode,
  projectProgress = 0,
}: ControlRoomProps) {
  const [data, setData] = useState<ControlRoomData | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (projectId) {
        setPortfolio(null);
        setData(await getControlRoomData(projectId));
      } else {
        setData(null);
        setPortfolio(await getPortfolioKpis());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const metrics = useMemo(() => {
    if (!data) return null;
    const tasks = data.tasks;
    const complete = tasks.filter((t) => t.status === "closed" || Number(t.progress) >= 100).length;
    const active = tasks.filter((t) => t.status === "in_progress").length;
    const notStarted = tasks.filter((t) => t.status === "open").length;
    const atRisk = tasks.filter(
      (t) =>
        ["risk", "delayed", "blocked"].includes(t.delay_status) ||
        (!!t.end_date && t.end_date < today && Number(t.progress) < 100)
    ).length;
    const progress = tasks.length
      ? tasks.reduce((sum, t) => sum + Number(t.progress), 0) / tasks.length
      : projectProgress;
    return { total: tasks.length, complete, active, notStarted, atRisk, progress };
  }, [data, projectProgress, today]);

  const attention = useMemo<AttentionItem[]>(() => {
    if (!data) return [];
    return data.tasks
      .filter(
        (t) =>
          ["risk", "delayed", "blocked"].includes(t.delay_status) ||
          (!!t.end_date && t.end_date < today && Number(t.progress) < 100)
      )
      .sort((a, b) => (a.end_date ?? "").localeCompare(b.end_date ?? ""))
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        code: t.task_code,
        name: t.task_name,
        progress: Number(t.progress),
        status: t.status,
        delayStatus: t.delay_status,
        endDate: t.end_date,
        owner: t.owner_name,
        href: "/dashboard/planning",
      }));
  }, [data, today]);

  const inbox = useMemo<InboxItem[]>(() => {
    if (!data) return [];
    const items: InboxItem[] = [
      ...data.documents
        .filter((d) => DOC_INBOX_STATUSES.includes(d.status))
        .map((d) => ({
          id: d.id,
          source: "document" as const,
          record: d.document_number,
          title: d.title,
          assignee: null,
          statusLabel: d.status === "under_review" ? "Under review" : "Awaiting review",
          agingDays: agingDays(d.updated_at),
          href: "/dashboard/documents",
        })),
      ...data.prs
        .filter((p) => p.approval_status === "submitted" || p.approval_status === "under_budget_review")
        .map((p) => ({
          id: p.id,
          source: "pr" as const,
          record: p.pr_number,
          title: p.approval_status === "under_budget_review" ? "Awaiting budget review" : "Awaiting approval",
          assignee: p.profiles?.[0]?.full_name ?? null,
          statusLabel: p.approval_status === "under_budget_review" ? "Budget review" : "Submitted",
          agingDays: agingDays(p.updated_at),
          href: "/dashboard/procurement",
        })),
      ...data.pos
        .filter((o) => o.status === "submitted" || o.status === "approved")
        .map((o) => ({
          id: o.id,
          source: "po" as const,
          record: o.po_number,
          title: o.status === "submitted" ? "Awaiting approval" : "Awaiting issue",
          assignee: null,
          statusLabel: o.status === "submitted" ? "Submitted" : "Approved",
          agingDays: agingDays(o.updated_at),
          href: "/dashboard/procurement",
        })),
      ...data.claims
        .filter((c) => c.status === "submitted")
        .map((c) => ({
          id: c.id,
          source: "claim" as const,
          record: `Claim #${c.claim_number}`,
          title: "Awaiting certification",
          assignee: null,
          statusLabel: "Submitted",
          agingDays: agingDays(c.submitted_at),
          href: "/dashboard/account",
        })),
    ];
    return items.sort((a, b) => b.agingDays - a.agingDays);
  }, [data]);

  const activity = useMemo<ActivityItem[]>(() => {
    if (!data) return [];
    const events: ActivityItem[] = [];

    for (const d of data.documents) {
      if (d.status === "approved" || d.status === "ifc") {
        events.push({
          id: `doc-${d.id}`,
          kind: "approved" as const,
          label: d.status === "ifc" ? "Issued for construction" : "Approved",
          record: d.document_number,
          title: d.title,
          at: d.updated_at,
        });
      } else if (d.status === "rejected") {
        events.push({
          id: `doc-${d.id}`,
          kind: "rejected" as const,
          label: "Rejected",
          record: d.document_number,
          title: d.title,
          at: d.updated_at,
        });
      }
    }

    for (const c of data.claims) {
      if (c.status === "submitted" && c.submitted_at) {
        events.push({
          id: `claim-${c.id}`,
          kind: "submitted" as const,
          label: "Submitted for certification",
          record: `Claim #${c.claim_number}`,
          title: `Period ending ${new Date(c.period_end).toLocaleDateString()}`,
          at: c.submitted_at,
        });
      }
    }

    return events
      .filter((e) => agingDays(e.at) <= 14)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 10);
  }, [data]);

  const recentDocs = useMemo(() => data?.documents.slice(0, 6) ?? [], [data]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-red-200 bg-red-50/50 py-16 text-center">
        <AlertTriangle className="h-6 w-6 text-red-500" />
        <p className="text-sm text-red-700">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!projectId) {
    return <PortfolioBand kpis={portfolio} loading={loading} />;
  }

  if (!data || !metrics) return null;

  const scurveData = data.snapshots
    .filter((s) => s.snapshot_date)
    .map((s) => ({
      date: new Date(s.snapshot_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      Planned: s.planned_progress ?? 0,
      Actual: s.actual_progress ?? 0,
    }));

  return (
    <div className="space-y-6">
      <ProjectHealthStrip
        projectName={projectName}
        projectCode={projectCode}
        progress={metrics.progress}
        metrics={metrics}
        evm={data.costAnalytics?.evm ?? null}
        budget={data.costAnalytics?.budget ?? 0}
        actual={data.costAnalytics?.actual ?? 0}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ActionInbox items={inbox} loading={false} />
        </div>
        <NeedsAttention items={attention} />
      </div>

      <HealthGrid
        projectId={projectId}
        scurveData={scurveData}
        loading={loading}
        metrics={metrics}
        costAnalytics={data.costAnalytics}
        onRefresh={load}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TraceabilityFeed items={activity} />
        </div>
        <RecentDocuments items={recentDocs} />
      </div>
    </div>
  );
}
