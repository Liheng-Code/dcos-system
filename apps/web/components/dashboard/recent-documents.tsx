"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { cn } from "@/lib/utils";

interface RecentDocumentItem {
  id: string;
  document_number: string;
  title: string;
  status: string;
  current_revision: number;
  updated_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-500/10 text-gray-600",
  submitted: "bg-blue-500/10 text-blue-600",
  under_review: "bg-amber-500/10 text-amber-600",
  approved: "bg-emerald-500/10 text-emerald-600",
  approved_with_comment: "bg-teal-500/10 text-teal-600",
  rejected: "bg-red-500/10 text-red-600",
  ifc: "bg-green-500/10 text-green-700",
  superseded: "bg-gray-400/10 text-gray-500",
  archived: "bg-gray-400/10 text-gray-500",
};

export function RecentDocuments({ items }: { items: RecentDocumentItem[] }) {
  return (
    <ChartCard
      title="Recent Documents"
      description="Latest updates on this project"
      gradient="from-purple-500 to-violet-600"
      empty={items.length === 0}
      emptyText="No documents yet"
      className="h-full"
    >
      <div className="-mx-4 divide-y divide-border">
        {items.map((doc) => (
          <Link
            key={doc.id}
            href="/dashboard/documents"
            className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{doc.document_number}</p>
              <p className="truncate text-xs text-muted-foreground">
                {doc.title} {doc.current_revision > 0 && `· Rev ${doc.current_revision}`}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                STATUS_COLORS[doc.status] ?? "bg-gray-500/10 text-gray-500"
              )}
            >
              {doc.status.replace(/_/g, " ")}
            </span>
          </Link>
        ))}
      </div>
    </ChartCard>
  );
}
