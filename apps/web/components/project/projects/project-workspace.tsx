"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProject } from "@/components/dashboard/project-context";
import { getProjectByCode } from "@/lib/project/projects/projects-queries";
import type { Project } from "@/lib/project/projects/project-types";
import { PROJECTS_PATH, listViewForType, projectHref, settingsHref, type SettingsSectionId } from "@/lib/project/projects/project-routes";
import { PrecontractDetail } from "@/components/project/projects/precontract-detail";
import { PostcontractDetail } from "@/components/project/projects/postcontract-detail";
import { GuidedSetup } from "@/components/project/projects/settings/guided-setup";
import { ProjectStakeholdersTab } from "@/components/project/projects/project-stakeholders-tab";
import { readLastListQuery } from "@/components/project/projects/project-list-memory";

// Old edit-wizard step numbers (e.g. bookmarked ?step= links) → the Settings section that replaced them.
const STEP_TO_SECTION: Record<number, SettingsSectionId> = {
  1: "general", 2: "contract", 5: "calendar", 6: "wbs", 7: "numbering", 8: "approvals", 9: "budget", 10: "notifications",
};

interface ProjectWorkspaceProps {
  code: string;
  /** Second URL segment: a tab (post-contract), a section (tender), "team" or "edit". */
  tab: string | null;
}

// One project, addressed by /dashboard/projects/[code]/[tab]. Mount with key={code}.
export function ProjectWorkspace({ code, tab }: ProjectWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSelectedProjectId, refreshProjects } = useProject();
  const [project, setProject] = useState<Project | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    getProjectByCode(code).then(({ data }) => {
      if (data) setProject(data as Project);
      else setMissing(true);
    });
  }, [code]);

  // The edit wizards are gone. The old /edit URL goes to Settings (awarded) or to the tender's
  // Registration section in edit mode.
  const redirectEdit = !!project && tab === "edit";
  const editStep = Number(searchParams.get("step"));
  useEffect(() => {
    if (!redirectEdit || !project) return;
    if (project.project_type === "tender") router.replace(`${projectHref(project.project_code, "registration")}?edit=1`);
    else if (editStep === 3 || editStep === 4) router.replace(projectHref(project.project_code, "team"));
    else router.replace(settingsHref(project.project_code, STEP_TO_SECTION[editStep]));
  }, [redirectEdit, project, editStep, router]);

  // Opening a project makes it the current one, so module pages reached from here show it.
  const projectId = project?.id;
  useEffect(() => {
    if (projectId) setSelectedProjectId(projectId);
  }, [projectId, setSelectedProjectId]);

  if (missing) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">No project with code <span className="font-mono">{code}</span>.</p>
        <Button variant="outline" size="sm" asChild>
          <Link href={PROJECTS_PATH}><ChevronLeft className="mr-1 h-4 w-4" /> All projects</Link>
        </Button>
      </div>
    );
  }

  if (!project || redirectEdit) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isTender = project.project_type === "tender";
  const home = projectHref(project.project_code);
  const backToList = () => router.push(`${PROJECTS_PATH}?${readLastListQuery() ?? `view=${listViewForType(project.project_type, project.project_status)}`}`);
  // Switching tabs replaces the entry, so Back leaves the project instead of stepping through tabs.
  const openTab = (next: string) => router.replace(projectHref(project.project_code, next), { scroll: false });

  function handleUpdate(updated: Project) {
    // An award converts the tender in place (same id and code), so the view switches by itself.
    setProject(updated);
    refreshProjects();
  }

  // Short optional setup after creating an awarded project.
  if (!isTender && tab === "setup") {
    return (
      <div className="px-4 py-6 sm:px-6">
        <GuidedSetup project={project} onDone={() => router.push(home)} />
      </div>
    );
  }

  // Tenders have no tab bar (their sections are the lifecycle steps), so Team is its own page.
  if (isTender && tab === "team") {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <Button variant="ghost" size="sm" className="rounded-lg" asChild>
            <Link href={home}><ChevronLeft className="mr-1 h-4 w-4" /> Back</Link>
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{project.project_name}</h2>
            <p className="text-xs text-muted-foreground">{project.project_code} — Team & Stakeholders</p>
          </div>
        </div>
        <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-6">
          <ProjectStakeholdersTab projectId={project.id} />
        </div>
      </div>
    );
  }

  return isTender ? (
    <PrecontractDetail
      project={project}
      onBack={backToList}
      onUpdate={handleUpdate}
      section={tab}
      onSectionChange={openTab}
      startEditing={searchParams.get("edit") === "1"}
    />
  ) : (
    <PostcontractDetail
      project={project}
      onBack={backToList}
      onUpdate={handleUpdate}
      tab={tab}
      onTabChange={openTab}
      settingsSection={searchParams.get("section")}
    />
  );
}
