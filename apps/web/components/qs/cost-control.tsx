"use client";

import { useState } from "react";
import { BudgetView } from "@/components/qs/budget-view";
import { BudgetRevisions } from "@/components/qs/budget-revisions";
import { CostEntry } from "@/components/qs/cost-entry";
import { cn } from "@/lib/utils";

const SUB_TABS = [
  { id: "variance",  label: "Budget & Variance" },
  { id: "revisions", label: "Budget Revisions"   },
  { id: "costs",     label: "Cost Transactions"  },
] as const;

type SubTab = (typeof SUB_TABS)[number]["id"];

interface Props {
  projectId: string;
  projectName?: string;
}

export function CostControl({ projectId, projectName }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("variance");

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              subTab === t.id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-800",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === "variance"  && <BudgetView       projectId={projectId} projectName={projectName} />}
      {subTab === "revisions" && <BudgetRevisions  projectId={projectId} />}
      {subTab === "costs"     && <CostEntry        projectId={projectId} />}
    </div>
  );
}
