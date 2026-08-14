"use client";

import { FileText, Handshake, HardHat, Package, AlertTriangle, ListChecks } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { KPICard } from "@/components/ui/kpi-card";
import type { PortfolioKpis } from "@/lib/control-room-service";

interface PortfolioBandProps {
  kpis: PortfolioKpis | null;
  loading: boolean;
}

export function PortfolioBand({ kpis, loading }: PortfolioBandProps) {
  const chips = kpis
    ? [
        { label: "Tender projects", value: kpis.preContractProjects, icon: Handshake, href: "/dashboard/projects", gradient: "from-amber-500 to-orange-600" },
        { label: "Awarded projects", value: kpis.postContractProjects, icon: HardHat, href: "/dashboard/projects", gradient: "from-emerald-500 to-teal-600" },
        { label: "Tasks", value: kpis.totalTasks, icon: ListChecks, href: "/dashboard/tasks", gradient: "from-indigo-500 to-violet-600" },
        { label: "Documents", value: kpis.totalDocuments, icon: FileText, href: "/dashboard/documents", gradient: "from-sky-500 to-blue-600" },
        { label: "HSE incidents", value: kpis.hseIncidents, icon: AlertTriangle, href: "/dashboard/hse", gradient: "from-orange-500 to-red-600" },
        { label: "Pending procurement", value: kpis.pendingPRs + kpis.pendingPOs, icon: Package, href: "/dashboard/procurement", gradient: "from-cyan-500 to-sky-600" },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-center">
        <p className="text-sm text-slate-500">
          Select a project from the switcher to open its <span className="font-medium text-slate-700">Control Room</span>.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {loading || !kpis
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-border bg-card p-4">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="mt-3 h-7 w-1/2" />
                <Skeleton className="mt-4 h-3 w-3/4" />
              </div>
            ))
          : chips.map((chip) => (
              <KPICard
                key={chip.label}
                label={chip.label}
                value={chip.value}
                icon={chip.icon}
                gradient={chip.gradient}
                href={chip.href}
              />
            ))}
      </div>
    </div>
  );
}
