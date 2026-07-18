"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { X, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Project } from "@/components/projects/project-edit-sheet";
import { ProjectSetupWizard } from "@/components/projects/project-setup-wizard";

interface AwardConversionDialogProps {
  project: Project;
  onClose: () => void;
  onConvert: (project: Project) => void;
}

export function AwardConversionDialog({ project, onClose, onConvert }: AwardConversionDialogProps) {
  const supabase = createClient();
  const [converting, setConverting] = useState(false);
  const [step, setStep] = useState<"confirm" | "wizard">("confirm");
  const [convertedProject, setConvertedProject] = useState<Project | null>(null);

  const [newProjectCode, setNewProjectCode] = useState(project.project_code);
  const [copyWbs, setCopyWbs] = useState(true);
  const [tenderWbsCount, setTenderWbsCount] = useState<number | null>(null);
  const [alreadyLinked, setAlreadyLinked] = useState<Project | null>(null);
  const [checkingGuards, setCheckingGuards] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCheckingGuards(true);
    Promise.all([
      supabase.from("projects").select("*").eq("source_tender_project_id", project.id).maybeSingle(),
      supabase.from("wbs_nodes").select("id", { count: "exact", head: true }).eq("project_id", project.id),
    ]).then(([linkedRes, wbsRes]) => {
      if (cancelled) return;
      setAlreadyLinked((linkedRes.data as Project | null) ?? null);
      setTenderWbsCount(wbsRes.count ?? 0);
      setCheckingGuards(false);
    });
    return () => { cancelled = true; };
  }, [project.id, supabase]);

  async function handleConvert() {
    if (!newProjectCode.trim()) {
      toast.error("Enter a project code for the post-contract project");
      return;
    }
    setConverting(true);

    // 1. Create a brand-new post-contract project row, linked back to the tender.
    //    The tender's own row (project.id) is never mutated.
    const {
      id: _oldId, project_code: _oldCode, project_type: _oldType, project_status: _oldStatus,
      created_at: _createdAt, updated_at: _updatedAt, source_tender_project_id: _oldLink,
      ...copyable
    } = project;

    const { data: created, error: insertErr } = await supabase
      .from("projects")
      .insert({
        ...copyable,
        project_code: newProjectCode.trim(),
        project_type: "awarded",
        project_status: "draft",
        source_tender_project_id: project.id,
      })
      .select()
      .single();

    if (insertErr) {
      toast.error(insertErr.message);
      setConverting(false);
      return;
    }

    // 2. Record the award outcome on the tender's own (untouched) precontract details.
    await supabase
      .from("project_precontract_details")
      .update({ award_status: "awarded", award_date: new Date().toISOString().slice(0, 10) })
      .eq("project_id", project.id);

    // 3. Optionally carry the tender's preliminary WBS structure into the new project.
    if (copyWbs && (tenderWbsCount ?? 0) > 0) {
      const { error: cloneErr } = await supabase.rpc("clone_wbs_nodes_between_projects", {
        p_source_project_id: project.id,
        p_target_project_id: created.id,
      });
      if (cloneErr) toast.error(`Project created, but WBS copy failed: ${cloneErr.message}`);
    }

    setConvertedProject(created as Project);
    toast.success(`Post-contract project ${created.project_code} created and assigned.`);
    setStep("wizard");
    setConverting(false);
  }

  if (step === "wizard" && convertedProject) {
    return (
      <ProjectSetupWizard
        project={convertedProject}
        onClose={onClose}
        onSave={(p) => {
          toast.success("Post-contract project setup completed");
          onConvert(p);
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold">Assign to Post-Contract Project</h2>
            <p className="text-sm text-muted-foreground">
              Create a new execution project linked to this awarded tender.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {checkingGuards ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : alreadyLinked ? (
          <div className="px-6 py-5 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-emerald-800">
                This tender has already been assigned to post-contract project{" "}
                <strong>{alreadyLinked.project_code} — {alreadyLinked.project_name}</strong>.
              </p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => onConvert(alreadyLinked)}>
                <ArrowRight className="h-4 w-4 mr-1.5" /> Back to Project List
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg border border-border p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <span className="text-xs font-bold">T</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Pre-Contract Project</p>
                    <p className="text-xs text-muted-foreground">{project.project_code} — {project.project_name}</p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground mx-auto" />
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Post-Contract Project</p>
                    <p className="text-xs text-muted-foreground">New linked project — original tender record is preserved separately</p>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new_code">Project Code for Post-Contract Project</Label>
                <input
                  id="new_code" value={newProjectCode} onChange={(e) => setNewProjectCode(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono outline-hidden focus:border-primary"
                />
                <p className="text-xs text-muted-foreground">
                  Must be different from the tender&apos;s code ({project.project_code}) — project codes are unique.
                </p>
              </div>

              {(tenderWbsCount ?? 0) > 0 && (
                <label className="flex items-start gap-2 text-sm rounded-lg border border-border p-3 cursor-pointer">
                  <input type="checkbox" checked={copyWbs} onChange={(e) => setCopyWbs(e.target.checked)} className="mt-0.5 h-3.5 w-3.5 rounded border-border accent-foreground" />
                  <span>
                    Copy preliminary WBS structure to the new project
                    <span className="block text-xs text-muted-foreground">
                      {tenderWbsCount} node{tenderWbsCount !== 1 ? "s" : ""} found on the tender project. Structure only —
                      progress and budget actuals are not carried over.
                    </span>
                  </span>
                </label>
              )}

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm text-amber-800">
                  This will create a brand-new post-contract project linked to this tender. The tender project itself
                  will not be changed, and stays available as a historical record.
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">What happens next:</p>
                <ul className="space-y-1.5">
                  {[
                    "A new post-contract project is created with its own project code",
                    "The tender project is preserved unchanged as a historical record",
                    ...(copyWbs && (tenderWbsCount ?? 0) > 0 ? ["Preliminary WBS structure is copied into the new project"] : []),
                    "Post-contract setup wizard opens for the new project",
                    "Configure WBS, calendar, document numbering",
                    "Set up approval flows and budget",
                    "Activate for execution",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t px-6 py-4">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleConvert} disabled={converting}>
                {converting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-1.5" />}
                Create & Assign
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
