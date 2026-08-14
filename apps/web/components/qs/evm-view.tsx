"use client";

import { useSearchParams } from "next/navigation";
import { EvmDashboard } from "@/components/qs/evm-dashboard";
import { CostScurve } from "@/components/qs/cost-scurve";

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
      {subTab === "scurve"    && <CostScurve   projectId={projectId} />}
    </div>
  );
}
