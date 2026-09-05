"use client";

import { useState } from "react";
import { ControlRoom } from "@/components/dashboard/control-room";
import { useProject } from "@/components/dashboard/project-context";
import { CostDashboard } from "@/components/qs/cost-control";
import { ProgressDashboard } from "@/components/dashboard/progress-dashboard";
import { AdminDashboardWidget } from "@/components/administration/admin-dashboard-widget";
import { cn } from "@/lib/utils";

type DashboardTab = "executive" | "cost" | "progress";

export default function DashboardPage() {
  const [tab, setTab] = useState<DashboardTab>("executive");
  const { selectedProjectId, selectedProject } = useProject();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Project Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {tab === "executive" ? "Project control room — actions, schedule and cost health" : tab === "cost" ? "Project-specific cost, cash flow, and commercial controls" : "Execution status, schedule health, and delivery priorities"}
          </p>
        </div>
        <div className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setTab("executive")}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "executive" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
          >
            Executive Dashboard
          </button>
          <button
            type="button"
            onClick={() => setTab("cost")}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "cost" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
          >
            Cost Dashboard
          </button>
          <button
            type="button"
            onClick={() => setTab("progress")}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "progress" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-800")}
          >
            Progress Dashboard
          </button>
        </div>
      </div>
      {tab === "executive" ? (
        <>
          <ControlRoom
            projectId={selectedProjectId || null}
            projectName={selectedProject?.project_name}
            projectCode={selectedProject?.project_code}
            projectProgress={selectedProject?.progress_percentage}
          />
          {/* USR-11 — Admin Dashboard Widget. Self-gated: renders nothing for non-admin/HR
              viewers, so it's safe to always mount here. */}
          <AdminDashboardWidget />
        </>
      ) : tab === "cost" && selectedProjectId ? (
        <CostDashboard projectId={selectedProjectId} projectName={selectedProject?.project_name} />
      ) : tab === "progress" && selectedProjectId ? (
        <ProgressDashboard projectId={selectedProjectId} projectName={selectedProject?.project_name} projectProgress={selectedProject?.progress_percentage} />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">
          Select a project from the project switcher to view its {tab === "progress" ? "Progress" : "Cost"} Dashboard.
        </div>
      )}
    </div>
  );
}
