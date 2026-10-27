"use client";

import { useSearchParams } from "next/navigation";
import { EvmDashboard } from "@/components/qs/evm-dashboard";
// The S-curve is the shared project S-curve (doc 33); the hand-typed qs_cost_baseline curve (cost-scurve.tsx) is retired.
import { ProjectScurveCard } from "@/components/project/scurve/project-scurve-card";

const SUB_TAB_IDS = ["dashboard", "scurve"] as const;
type SubTab = (typeof SUB_TAB_IDS)[number];

interface Props {
  projectId: string;
}

export function EvmView({ projectId }: Props) {
  const searchParams = useSearchParams();
  const subParam = searchParams.get("sub") as SubTab | null;
  const subTab: SubTab = subParam && SUB_TAB_IDS.includes(subParam) ? subParam : "dashboard";

  return (
    <div className="space-y-4">
      {subTab === "dashboard" && <EvmDashboard projectId={projectId} />}
      {subTab === "scurve"    && <ProjectScurveCard projectId={projectId} />}
    </div>
  );
}
