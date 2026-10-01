"use client";

import { useEffect, useState } from "react";
import { getProjectCodeSequenceWithPrefixP } from "@/lib/naming/naming-queries";
import { Loader2, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";

interface NamingProjectCodeGenProps {
  projectName: string;
  projectCode: string;
  shortName: string;
  onProjectCodeChange: (value: string) => void;
  onShortNameChange: (value: string) => void;
}

export function NamingProjectCodeGen({
  projectName,
  projectCode,
  shortName,
  onProjectCodeChange,
  onShortNameChange,
}: NamingProjectCodeGenProps) {
  const [loading, setLoading] = useState(true);
  const [override, setOverride] = useState(false);
  const [nextSeq, setNextSeq] = useState(0);

  useEffect(() => {
    getProjectCodeSequenceWithPrefixP().then(({ data }) => {
      if (data) setNextSeq((data.last_sequence as number) + 1);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!override) {
      const seq = String(nextSeq).padStart(3, "0");
      onProjectCodeChange(`P${seq}-${shortName}`);
    }
  }, [nextSeq, shortName, override, onProjectCodeChange]);

  useEffect(() => {
    if (!override && projectName && !shortName) {
      const suggested = projectName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, 6);
      if (suggested) onShortNameChange(suggested);
    }
  }, [projectName, override, shortName, onShortNameChange]);

  const codeValid = /^P\d{3}-[A-Z0-9]{1,6}$/.test(projectCode);
  const shortValid = /^[A-Z0-9]{1,6}$/.test(shortName);

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reserving project code...</div>;
  }

  return (
    <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium text-primary">Naming Convention Template</span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="naming_project_code">Project Code</Label>
          <div className="flex items-center gap-2">
            <input
              id="naming_project_code"
              value={projectCode}
              onChange={(e) => onProjectCodeChange(e.target.value.toUpperCase())}
              readOnly={!override}
              className={`w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-hidden ${
                override ? "bg-background" : "bg-muted/50"
              } ${codeValid ? "border-primary/30" : "border-destructive/30"} focus:border-primary`}
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={override}
                onChange={(e) => setOverride(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-foreground"
              />
              Override
            </label>
          </div>
          {!override && (
            <p className="text-xs text-muted-foreground">
              Auto-generated from sequence counter. Next: <strong className="font-mono">P{String(nextSeq).padStart(3, "0")}-[ShortName]</strong>
            </p>
          )}
          {override && !codeValid && (
            <p className="text-xs text-destructive">Format: P[NNN]-[XXXXXX] (e.g. P003-HTBT)</p>
          )}
        </div>
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
