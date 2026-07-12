"use client";

import { useState } from "react";
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

  async function handleConvert() {
    setConverting(true);

    // 1. Update project type from tender to awarded
    const { error } = await supabase
      .from("projects")
      .update({ project_type: "awarded", project_status: "draft" })
      .eq("id", project.id);

    if (error) {
      toast.error(error.message);
      setConverting(false);
      return;
    }

    // 2. Fetch the updated project
    const { data: updated } = await supabase
      .from("projects")
      .select("*")
      .eq("id", project.id)
      .single();

    if (updated) {
      setConvertedProject(updated as Project);
      toast.success("Project converted to post-contract. Complete the setup wizard.");
      setStep("wizard");
    }

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
            <h2 className="text-lg font-semibold">Convert to Post-Contract</h2>
            <p className="text-sm text-muted-foreground">
              Convert this awarded tender into an execution project.
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

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
                <p className="text-xs text-muted-foreground">Same project, now in execution phase</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              This will change the project type from <strong>Tender</strong> to <strong>Awarded</strong> and open the post-contract setup wizard to configure WBS, calendar, numbering, approvals, and other execution-phase settings.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">What happens next:</p>
            <ul className="space-y-1.5">
              {[
                "Project type changes from Tender to Awarded",
                "Post-contract setup wizard opens",
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
            Convert & Setup
          </Button>
        </div>
      </div>
    </div>
  );
}
