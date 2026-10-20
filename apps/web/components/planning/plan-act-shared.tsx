"use client";

import { cn } from "@/lib/utils";
import { STATUS_TRANSITIONS, type LibraryStatus } from "@/lib/planning/activity-library/types";

const STATUS_STYLE: Record<LibraryStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  under_review: "bg-amber-50 text-amber-700",
  approved: "bg-sky-50 text-sky-700",
  active: "bg-emerald-50 text-emerald-700",
  superseded: "bg-slate-100 text-slate-400 line-through",
  archived: "bg-slate-100 text-slate-400",
};

export const STATUS_LABEL: Record<LibraryStatus, string> = {
  draft: "Draft",
  under_review: "Under review",
  approved: "Approved",
  active: "Active",
  superseded: "Superseded",
  archived: "Archived",
};

export function ActStatusPill({ status }: { status: LibraryStatus }) {
  return (
    <span className={cn("inline-flex rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide", STATUS_STYLE[status])}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function CodeChip({ code }: { code: string }) {
  return <span className="font-mono text-xs font-medium text-primary">{code}</span>;
}

/** Next lifecycle moves offered for a status (the database trigger is the authority). */
export function nextStatuses(status: LibraryStatus): LibraryStatus[] {
  return STATUS_TRANSITIONS[status];
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{children}</div>;
}
