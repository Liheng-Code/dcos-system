"use client";

import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WbsNodeData, type WbsNodeRecord } from "@/components/project/wbs/wbs-types";

interface WbsSummaryViewProps {
  node: WbsNodeData;
  nodeRecord: WbsNodeRecord | null;
}

const CHECKLIST_ITEMS = [
  "WBS code approved",
  "Responsible team assigned",
  "Schedule baseline linked",
  "BOQ cost linked",
  "Document folder ready",
];

export function WbsSummaryView({ node, nodeRecord }: WbsSummaryViewProps) {
  const checklistCompleted = useMemo(() => {
    const hasBudget = (node.budget_cost ?? nodeRecord?.budget_cost) != null;
    const hasHours = (node.planned_hours ?? nodeRecord?.planned_hours) != null;
    if (hasBudget && hasHours) return 4;
    if (hasBudget || hasHours) return 3;
    return 2;
  }, [node, nodeRecord]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">WBS Node Summary</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Node Type</span>
              <b className="capitalize">{node.node_type}</b>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Roll-up Progress</span>
              <b>{node.progress_percent}%</b>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Status</span>
              <span className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                node.status === "active" ? "bg-emerald-50 text-emerald-700" :
                node.status === "on_hold" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600",
              )}>
                {node.status === "active" ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {node.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Budget Cost</span>
              <b>{node.budget_cost != null ? `$${node.budget_cost.toLocaleString()}` : "—"}</b>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Actual Cost</span>
              <b>{node.actual_cost != null ? `$${node.actual_cost.toLocaleString()}` : "—"}</b>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Planned Hours</span>
              <b>{node.planned_hours != null ? `${node.planned_hours}h` : "—"}</b>
            </div>
            <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
              <span className="text-slate-500">Actual Hours</span>
              <b>{node.actual_hours != null ? `${node.actual_hours}h` : "—"}</b>
            </div>
            {nodeRecord?.full_path && (
              <div className="flex justify-between rounded-lg bg-slate-50 p-2.5">
                <span className="text-slate-500">Path</span>
                <b className="font-mono text-[10px]">{nodeRecord.full_path}</b>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-xl border-slate-200 shadow-sm">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Control Checklist</h3>
          <div className="space-y-1">
            {CHECKLIST_ITEMS.map((item, i) => (
              <div key={item} className="flex items-center gap-2 border-b border-slate-100 py-2 text-xs">
                <CheckCircle2 className={cn("h-3.5 w-3.5 shrink-0", i < checklistCompleted ? "text-slate-900" : "text-slate-300")} />
                {item}
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
            <div className="flex items-center gap-1.5 text-xs text-amber-700">
              <Clock className="h-3.5 w-3.5" />
              <span>{checklistCompleted < CHECKLIST_ITEMS.length ? `${CHECKLIST_ITEMS.length - checklistCompleted} items remaining` : "All checklist items completed"}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
