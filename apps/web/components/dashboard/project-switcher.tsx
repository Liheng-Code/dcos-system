"use client";

import { useProject } from "@/components/dashboard/project-context";
import { Loader2, HardHat } from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const TYPE_BADGE: Record<string, string> = {
  tender: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
  awarded: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
  internal: "bg-muted text-muted-foreground border-border",
};

const TYPE_LABEL: Record<string, string> = {
  tender: "Tender",
  awarded: "Awarded",
  internal: "Internal",
};

// Tenders and awarded projects are kept in one list (an awarded project IS the
// same row the tender used to be), so we sort by phase instead of splitting
// into separate pickers — this keeps the two visually apart without hiding
// either from the other.
const TYPE_ORDER: Record<string, number> = { tender: 0, awarded: 1, internal: 2 };

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  on_hold: {
    label: "On Hold",
    className: "bg-orange-50 text-orange-700 border-orange-200",
  },
  completed: {
    label: "Completed",
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
  archived: {
    label: "Archived",
    className: "bg-slate-100 text-slate-600 border-slate-300",
  },
};

function PhaseBadge({ type, status }: { type: string; status?: string }) {
  const statusInfo = status ? STATUS_BADGE[status] : undefined;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <span
        className={cn(
          "shrink-0 inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium leading-4",
          TYPE_BADGE[type] ?? TYPE_BADGE.internal,
        )}
      >
        {TYPE_LABEL[type] ?? type}
      </span>
      {statusInfo && (
        <span
          className={cn(
            "shrink-0 inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium leading-4",
            statusInfo.className,
          )}
        >
          {statusInfo.label}
        </span>
      )}
    </span>
  );
}

export function ProjectSwitcher() {
  const { projects, selectedProjectId, selectedProject, setSelectedProjectId, loading } = useProject();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 min-w-[180px]">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const sorted = [...projects].sort((a, b) => {
    const orderDiff = (TYPE_ORDER[a.project_type] ?? 99) - (TYPE_ORDER[b.project_type] ?? 99);
    return orderDiff !== 0 ? orderDiff : a.project_name.localeCompare(b.project_name);
  });

  return (
    <Select value={selectedProjectId} onValueChange={(value) => setSelectedProjectId((value as string) ?? "")}>
      {/* Sized to the selected project's name (truncated only past the max); the list grows to its longest name. */}
      <SelectTrigger className="relative h-8 w-auto min-w-[240px] max-w-[min(720px,55vw)] overflow-hidden pl-7">
        <HardHat className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <SelectValue placeholder="All Projects" className="min-w-0">
          {() =>
            selectedProject ? (
              <span className="flex items-center gap-1.5 truncate">
                <PhaseBadge type={selectedProject.project_type} status={selectedProject.project_status} />
                <span className="truncate">
                  {selectedProject.project_code} — {selectedProject.project_name}
                </span>
              </span>
            ) : (
              "All Projects"
            )
          }
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-auto min-w-(--anchor-width) max-w-[min(90vw,56rem)]">
        <SelectItem value="">All Projects</SelectItem>
        {sorted.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
              <PhaseBadge type={p.project_type} status={p.project_status} />
              <span className="truncate">
                {p.project_code} — {p.project_name}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
