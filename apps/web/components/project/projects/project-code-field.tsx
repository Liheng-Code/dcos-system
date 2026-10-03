"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { peekNextProjectCode } from "@/lib/project/projects/projects-queries";

interface ProjectCodeFieldProps {
  /** The saved project's code; empty for a project not created yet. */
  code?: string | null;
  className?: string;
  inputClassName?: string;
}

/** Read-only project code. New projects show the next code, which the database assigns on save. */
export function ProjectCodeField({ code, className, inputClassName }: ProjectCodeFieldProps) {
  const [next, setNext] = useState<string | null>(null);

  useEffect(() => {
    if (code) return;
    peekNextProjectCode().then(({ data }) => setNext((data as string | null) ?? null));
  }, [code]);

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs font-medium">Project Code</Label>
      <input
        readOnly
        value={code || next || ""}
        placeholder="Assigned on save"
        className={cn("w-full cursor-default rounded-lg border border-border bg-muted/50 px-3 py-2 font-mono text-sm outline-hidden", inputClassName)}
      />
      {!code && <p className="text-xs text-muted-foreground">Assigned automatically when the project is saved.</p>}
    </div>
  );
}
