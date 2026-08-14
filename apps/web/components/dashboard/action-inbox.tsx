"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Banknote, CheckCircle2, FileText, Package, ShoppingCart } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type InboxSource = "document" | "pr" | "po" | "claim";

export interface InboxItem {
  id: string;
  source: InboxSource;
  record: string;
  title: string;
  assignee: string | null;
  statusLabel: string;
  agingDays: number;
  href: string;
}

const SOURCE_CONFIG: Record<
  InboxSource,
  { label: string; icon: typeof FileText; badge: string; chip: string }
> = {
  document: {
    label: "Document",
    icon: FileText,
    badge: "bg-purple-50 text-purple-700",
    chip: "bg-purple-100 text-purple-700",
  },
  pr: {
    label: "PR",
    icon: ShoppingCart,
    badge: "bg-amber-50 text-amber-700",
    chip: "bg-amber-100 text-amber-700",
  },
  po: {
    label: "PO",
    icon: Package,
    badge: "bg-blue-50 text-blue-700",
    chip: "bg-blue-100 text-blue-700",
  },
  claim: {
    label: "Claim",
    icon: Banknote,
    badge: "bg-emerald-50 text-emerald-700",
    chip: "bg-emerald-100 text-emerald-700",
  },
};

type InboxFilter = "all" | "documents" | "procurement" | "claims" | "overdue";

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "documents", label: "Documents" },
  { key: "procurement", label: "Procurement" },
  { key: "claims", label: "Claims" },
  { key: "overdue", label: "Overdue" },
];

function agingTone(days: number): { label: string; className: string } {
  if (days >= 10) return { label: `${days}d stale`, className: "bg-red-50 text-red-700" };
  if (days >= 5) return { label: `${days}d aging`, className: "bg-amber-50 text-amber-700" };
  return { label: `${days}d`, className: "bg-muted text-muted-foreground" };
}

export function ActionInbox({ items, loading }: { items: InboxItem[]; loading: boolean }) {
  const [filter, setFilter] = useState<InboxFilter>("all");

  const visible = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "documents") return items.filter((i) => i.source === "document");
    if (filter === "procurement") return items.filter((i) => i.source === "pr" || i.source === "po");
    if (filter === "claims") return items.filter((i) => i.source === "claim");
    return items.filter((i) => i.agingDays >= 5);
  }, [items, filter]);

  const pendingCount = items.filter((i) => i.agingDays >= 5).length;

  return (
    <ChartCard
      title="Action Required"
      description={`${items.length} items need your action · ${pendingCount} aging`}
      gradient="from-rose-500 to-pink-600"
      loading={loading}
      empty={items.length === 0}
      emptyText="Nothing needs your attention right now"
      className="h-full"
      action={
        <Link
          href="/dashboard/account"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-md px-2 py-1 text-[11px] font-medium transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          <p className="text-xs text-muted-foreground">Nothing in this view</p>
        </div>
      ) : (
        <div className="-mx-4 divide-y divide-border">
          {visible.map((item) => {
            const config = SOURCE_CONFIG[item.source];
            const Icon = config.icon;
            const aging = agingTone(item.agingDays);
            return (
              <Link
                key={`${item.source}-${item.id}`}
                href={item.href}
                className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
              >
                <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", config.badge)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{item.record}</span>
                    <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium", config.chip)}>
                      {config.label}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.title}
                    {item.assignee ? ` · ${item.assignee}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <Badge variant="outline" className={cn("text-[10px] font-medium", aging.className)}>
                    {aging.label}
                  </Badge>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{item.statusLabel}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </ChartCard>
  );
}
