"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { activateProject } from "@/lib/project-setup-service";
import { getProjectById } from "@/lib/project/projects/projects-queries";
import type { Project } from "@/lib/project/projects/project-types";
import { projectHref, settingsHref } from "@/lib/project/projects/project-routes";
import { checklistRecord, setupChecklist, type SetupCheckItem } from "@/lib/project/projects/setup-checklist";
import { loadSetupFacts } from "@/lib/project/projects/overview-queries";

interface SetupHealthCardProps {
  project: Project;
  onUpdated: (project: Project) => void;
}

// What is missing before activation, each item linking to where it is fixed. Hidden once the
// project is active and fully set up.
export function SetupHealthCard({ project, onUpdated }: SetupHealthCardProps) {
  const [items, setItems] = useState<SetupCheckItem[] | null>(null);
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    loadSetupFacts(project.id).then((facts) =>
      setItems(setupChecklist({
        ...facts,
        category: project.category,
        clientId: project.client_id,
        projectManagerId: project.project_manager_id,
      })),
    );
  }, [project.id, project.category, project.client_id, project.project_manager_id]);

  if (!items) return null;
  const isActive = project.project_status === "active";
  const missing = items.filter((i) => !i.ok);
  if (isActive && !missing.length) return null;

  async function handleActivate() {
    setActivating(true);
    try {
      const { data: { user } } = await createClient().auth.getUser();
      if (!user) { toast.error("Your session has expired. Sign in again to activate."); return; }
      await activateProject(project.id, user.id, checklistRecord(items!));
      const { data } = await getProjectById(project.id);
      onUpdated((data as Project | null) ?? { ...project, project_status: "active" });
      toast.success("Project activated");
    } catch (err) {
      toast.error(`Not activated: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setActivating(false);
    }
  }

  const fixHref = (item: SetupCheckItem) =>
    item.fix.tab === "team" ? projectHref(project.project_code, "team") : settingsHref(project.project_code, item.fix.section);

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/40 dark:border-amber-900 dark:bg-amber-950/20">
      <div className="flex items-center justify-between gap-2 border-b border-amber-200 px-5 py-3 dark:border-amber-900">
        <h3 className="text-sm font-semibold">{isActive ? "Setup gaps" : "Ready to activate?"}</h3>
        <span className="text-xs text-muted-foreground">{items.length - missing.length} of {items.length} done</span>
      </div>
      {missing.length > 0 ? (
        <ul className="divide-y divide-amber-200/60 dark:divide-amber-900/60">
          {missing.map((item) => (
            <li key={item.key}>
              <Link href={fixHref(item)} className="flex items-center gap-2 px-5 py-2 text-sm hover:bg-amber-100/50 dark:hover:bg-amber-900/20">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span className="flex-1">{item.label}</span>
                <span className="flex items-center text-xs font-medium text-primary">Fix <ChevronRight className="h-3 w-3" /></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-2 px-5 py-3 text-sm">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Everything required is set up.
        </p>
      )}
      {!isActive && (
        <div className="px-5 py-3">
          <Button className="w-full" disabled={missing.length > 0 || activating} onClick={handleActivate}>
            {activating && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Activate project
          </Button>
          {missing.length > 0 && <p className="mt-1.5 text-center text-xs text-muted-foreground">Complete the items above to activate.</p>}
        </div>
      )}
    </section>
  );
}
