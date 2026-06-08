"use client";

import { useProject } from "@/components/dashboard/project-context";
import { Loader2, HardHat } from "lucide-react";

export function ProjectSwitcher() {
  const { projects, selectedProjectId, setSelectedProjectId, loading } = useProject();

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 min-w-[180px]">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <HardHat className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <select
        value={selectedProjectId}
        onChange={(e) => setSelectedProjectId(e.target.value)}
        className="h-8 min-w-[200px] rounded-lg border border-border bg-background pl-7 pr-3 text-sm outline-hidden focus:border-primary appearance-none cursor-pointer"
      >
        <option value="">All Projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.project_code} — {p.project_name}
          </option>
        ))}
      </select>
    </div>
  );
}
