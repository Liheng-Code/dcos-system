"use client";

import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { ProjectCodeField } from "@/components/project/projects/project-code-field";

interface NamingProjectCodeGenProps {
  projectName: string;
  /** The saved project's code; empty for a new project (the database assigns PJR-YYYY-NNN on save). */
  projectCode: string;
  shortName: string;
  onShortNameChange: (value: string) => void;
}

export function NamingProjectCodeGen({
  projectName,
  projectCode,
  shortName,
  onShortNameChange,
}: NamingProjectCodeGenProps) {
  useEffect(() => {
    if (projectName && !shortName) {
      const suggested = projectName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      if (suggested) onShortNameChange(suggested);
    }
  }, [projectName, shortName, onShortNameChange]);

  const shortValid = /^[A-Z0-9]{1,6}$/.test(shortName);

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">Naming Convention Template</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <ProjectCodeField code={projectCode} className="space-y-1.5" inputClassName="rounded-xl py-2.5" />
        <div className="space-y-1.5">
          <Label htmlFor="naming_short_name">Short Name *</Label>
          <input
            id="naming_short_name"
            value={shortName}
            onChange={(e) => onShortNameChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            className={`w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-hidden focus:border-primary ${
              shortValid ? "border-border" : "border-destructive/30"
            }`}
            placeholder="Max 6 chars"
            maxLength={6}
          />
          {!shortValid && shortName && (
            <p className="text-xs text-destructive">Max 6 uppercase alphanumeric characters</p>
          )}
          {!shortName && projectName && (
            <p className="text-xs text-muted-foreground">
              Suggested: <strong className="font-mono">{projectName.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)}</strong>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
