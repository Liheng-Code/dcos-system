"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Project } from "@/lib/project/projects/project-types";
import { projectHref } from "@/lib/project/projects/project-routes";
import { ProjectStakeholdersTab } from "@/components/project/projects/project-stakeholders-tab";
import { CalendarSection, WbsSection } from "@/components/project/projects/settings/setup-sections";

const STEPS = [
  { id: "team", title: "Team", hint: "Who works on this project." },
  { id: "calendar", title: "Calendar", hint: "Working days for the programme. The company default is already filled in." },
  { id: "wbs", title: "WBS", hint: "How the work breakdown structure will be built." },
] as const;

interface GuidedSetupProps {
  project: Project;
  onDone: () => void;
}

// Optional, short setup right after creating a project. Every step can be skipped; each saves
// on its own, and everything stays editable in Settings.
export function GuidedSetup({ project, onDone }: GuidedSetupProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const next = () => (step < STEPS.length - 1 ? setStep(step + 1) : onDone());
  const guided = { guided: true, onSaved: next };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Set up {project.project_name}</h2>
          <p className="text-sm text-muted-foreground">Optional. Skip anything; it can all be changed later in Settings.</p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link href={projectHref(project.project_code)}>Skip setup</Link>
        </Button>
      </div>

      <ol className="flex items-center gap-2" aria-label="Setup steps">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(i)}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm",
                i === step ? "border-primary bg-primary/5 font-medium" : i < step ? "border-emerald-200 text-emerald-700" : "border-border text-muted-foreground",
              )}
            >
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px]", i < step ? "bg-emerald-600 text-white" : "bg-muted")}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              {s.title}
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{current.hint}</p>
        {current.id === "team" && (
          <div className="rounded-xl border border-border bg-card p-5">
            <ProjectStakeholdersTab projectId={project.id} />
          </div>
        )}
        {current.id === "calendar" && <CalendarSection project={project} mode={guided} />}
        {current.id === "wbs" && <WbsSection project={project} mode={guided} />}
      </div>

      <div className="flex justify-between">
        <Button variant="outline" onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
        <Button variant={current.id === "team" ? "default" : "ghost"} onClick={next}>
          {current.id === "team" ? "Continue" : step === STEPS.length - 1 ? "Skip and finish" : "Skip"}
        </Button>
      </div>
    </div>
  );
}
