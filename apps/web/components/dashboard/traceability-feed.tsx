"use client";

import Link from "next/link";
import { ArrowRight, Ban, CheckCircle2, FileClock, Send } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { cn } from "@/lib/utils";

export interface ActivityItem {
  id: string;
  kind: "approved" | "rejected" | "submitted";
  label: string;
  record: string;
  title: string;
  at: string;
}

const KIND_CONFIG = {
  approved: { icon: CheckCircle2, color: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rejected: { icon: Ban, color: "bg-red-50 text-red-700", dot: "bg-red-500" },
  submitted: { icon: Send, color: "bg-blue-50 text-blue-700", dot: "bg-blue-500" },
} as const;

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function TraceabilityFeed({ items }: { items: ActivityItem[] }) {
  return (
    <ChartCard
      title="Activity"
      description="Approvals, rejections and submissions · last 14 days"
      gradient="from-blue-500 to-cyan-500"
      empty={items.length === 0}
      emptyText="No activity in the last 14 days"
      className="h-full"
      action={
        <Link
          href="/dashboard/account"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Audit <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="-mx-4 divide-y divide-border">
        {items.map((item) => {
          const config = KIND_CONFIG[item.kind];
          const Icon = config.icon;
          return (
            <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
              <div className="relative mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg">
                <div className={cn("absolute inset-0 rounded-lg", config.color)} />
                <Icon className="relative h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="font-medium">{item.record}</span>{" "}
                  <span className="text-muted-foreground">· {item.title}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{item.label}</p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground">{timeAgo(item.at)}</span>
            </div>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileClock className="h-3.5 w-3.5" /> Showing {items.length} most recent events
        </div>
      )}
    </ChartCard>
  );
}
