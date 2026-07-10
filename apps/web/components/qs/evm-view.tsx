"use client";

import { useState } from "react";
import { Activity, TrendingUp } from "lucide-react";
import { EvmDashboard } from "@/components/qs/evm-dashboard";
import { CostScurve } from "@/components/qs/cost-scurve";
import { cn } from "@/lib/utils";

const SUB_TABS = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "scurve",    label: "S-Curve",   icon: TrendingUp },
] as const;

type SubTab = (typeof SUB_TABS)[number]["id"];

interface Props {
  projectId: string;
}

export function EvmView({ projectId }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("dashboard");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              subTab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-800",
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "dashboard" && <EvmDashboard projectId={projectId} />}
      {subTab === "scurve"    && <CostScurve   projectId={projectId} />}
    </div>
  );
}
