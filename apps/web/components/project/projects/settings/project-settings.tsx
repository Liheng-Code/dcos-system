"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Users } from "lucide-react";
import type { Project } from "@/lib/project/projects/project-types";
import { SETTINGS_SECTIONS, projectHref } from "@/lib/project/projects/project-routes";
import { ContractSection, GeneralSection } from "@/components/project/projects/settings/project-sections";
import {
  ApprovalsSection, BudgetSection, CalendarSection, NotificationsSection, NumberingSection, WbsSection,
} from "@/components/project/projects/settings/setup-sections";

interface ProjectSettingsProps {
  project: Project;
  onProjectUpdated: (project: Project) => void;
  /** Section to scroll to (?section=), e.g. from a Setup health "Fix" link. */
  section: string | null;
}

// Every setting on one page, each section saved on its own (replaces the 11-step setup wizard).
export function ProjectSettings({ project, onProjectUpdated, section }: ProjectSettingsProps) {
  useEffect(() => {
    if (!section || !SETTINGS_SECTIONS.some((s) => s.id === section)) return;
    // Sections render their content after loading; wait a frame so the target has its height.
    const t = setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    return () => clearTimeout(t);
  }, [section]);

  const props = { project, onProjectUpdated };
  return (
    <div className="flex gap-6">
      <nav className="sticky top-0 hidden h-fit w-48 shrink-0 space-y-0.5 lg:block" aria-label="Settings sections">
        {SETTINGS_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            onClick={(e) => { e.preventDefault(); document.getElementById(s.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
            className={`block rounded-md px-3 py-1.5 text-sm hover:bg-muted ${section === s.id ? "bg-muted font-medium" : "text-muted-foreground"}`}
          >
            {s.label}
          </a>
        ))}
        <Link href={projectHref(project.project_code, "team")} className="mt-3 flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted">
          <Users className="h-3.5 w-3.5" /> Team & stakeholders
        </Link>
      </nav>
      <div className="min-w-0 flex-1 space-y-5">
        <GeneralSection {...props} />
        <ContractSection {...props} />
        <CalendarSection project={project} />
        <WbsSection project={project} />
        <NumberingSection project={project} />
        <ApprovalsSection project={project} />
        <BudgetSection project={project} />
        <NotificationsSection project={project} />
      </div>
    </div>
  );
}

