"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { WhoIsOnLeaveToday } from "@/components/hr/leave/who-is-on-leave-today";

export interface AttentionItem {
  id: string;
  code: string;
  name: string;
  progress: number;
  status: string;
  delayStatus: string;
  endDate: string | null;
  owner: string | null;
  href: string;
}

const DELAY_BADGE: Record<string, { label: string; className: string }> = {
  blocked: { label: "Blocked", className: "bg-red-50 text-red-700" },
  delayed: { label: "Delayed", className: "bg-amber-50 text-amber-700" },
  risk: { label: "At risk", className: "bg-orange-50 text-orange-700" },
};

export function NeedsAttention({ items }: { items: AttentionItem[] }) {
  const overdue = items.filter(
    (t) => t.endDate && t.endDate < new Date().toISOString().slice(0, 10) && t.progress < 100
  ).length;

  return (
    <Card className="relative flex h-full flex-col" gradient="from-amber-500 to-orange-600">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          Work fronts at risk
          <Badge variant="secondary" className="ml-auto text-[10px]">
            {items.length} · {overdue} overdue
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-3">
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">All work fronts on track</p>
        ) : (
          items.map((item) => {
            const delay = item.delayStatus ? DELAY_BADGE[item.delayStatus] : null;
            const isOverdue =
              !!item.endDate && item.endDate < new Date().toISOString().slice(0, 10) && item.progress < 100;
            return (
              <Link
                key={item.id}
                href={item.href}
                className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {item.code} <span className="text-muted-foreground">· {item.name}</span>
                  </p>
                  {(delay || isOverdue) && (
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        isOverdue
                          ? "bg-red-50 text-red-700"
                          : delay?.className ?? "bg-muted text-muted-foreground"
                      )}
                    >
                      {isOverdue ? "Overdue" : delay?.label ?? item.delayStatus}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, item.progress)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium tabular-nums text-muted-foreground">
                    {item.progress.toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {item.owner ?? "Unassigned"}
                  {item.endDate ? ` · due ${new Date(item.endDate).toLocaleDateString()}` : ""}
                </p>
              </Link>
            );
          })
        )}

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            On leave today
          </p>
          <WhoIsOnLeaveToday compact />
        </div>
      </CardContent>
    </Card>
  );
}
