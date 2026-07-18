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

function PhaseBadge({ type }: { type: string }) {
  return (
    <span
      className={cn(
        "shrink-0 inline-flex items-center rounded-full border px-1.5 py-0 text-[9px] font-medium leading-4",
        TYPE_BADGE[type] ?? TYPE_BADGE.internal,
      )}
    >
      {TYPE_LABEL[type] ?? type}
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
      <SelectTrigger className="h-8 w-[700px] max-w-[80vw] pl-7 relative overflow-hidden">
        <HardHat className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <SelectValue placeholder="All Projects">
          {() =>
            selectedProject ? (
              <span className="flex items-center gap-1.5 truncate">
                <PhaseBadge type={selectedProject.project_type} />
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
      <SelectContent className="max-w-[740px]">
        <SelectItem value="">All Projects</SelectItem>
        {sorted.map((p) => (
          <SelectItem key={p.id} value={p.id}>
            <span className="flex items-center gap-1.5 truncate max-w-[400px]">
              <PhaseBadge type={p.project_type} />
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
