"use client";

import type { Project } from "@/lib/project/projects/project-types";
import { AttentionPanel } from "@/components/project/projects/overview/attention-panel";
import { KeyFactsCard } from "@/components/project/projects/overview/key-facts-card";
import { SetupHealthCard } from "@/components/project/projects/overview/setup-health-card";
import { CommercialStrip } from "@/components/project/projects/overview/commercial";

interface ProjectOverviewProps {
  project: Project;
  onUpdated: (project: Project) => void;
}

// A live project's home: what needs action first, then the facts and the money.
export function ProjectOverview({ project, onUpdated }: ProjectOverviewProps) {
  return (
    <div className="space-y-5">
      {/* Phone order: setup, attention, facts. From lg: attention on the left, the rest on the right. */}
      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className="empty:hidden lg:col-start-3 lg:row-start-1">
          <SetupHealthCard project={project} onUpdated={onUpdated} />
        </div>
        <div className="lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <AttentionPanel projectId={project.id} />
        </div>
        <div className="lg:col-start-3 lg:row-start-2">
          <KeyFactsCard project={project} onUpdated={onUpdated} />
        </div>
      </div>
      <CommercialStrip project={project} />
    </div>
  );
}
