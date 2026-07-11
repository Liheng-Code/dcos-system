"use client";

import { useState, useMemo } from "react";
import { Loader2, WandSparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface EmployeeProfile {
  id: string;
  gender: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  phone: string | null;
  address: string | null;
  grade: string | null;
  join_date: string | null;
  probation_status: string | null;
  probation_end_date: string | null;
  avatar_url: string | null;
}

interface StatusSets {
  hasPayrollProfile: Set<string>;
  hasTaxProfile: Set<string>;
  hasNSSFProfile: Set<string>;
  hasBankAccount: Set<string>;
}

interface FieldDef {
  key: string;
  label: string;
  group: string;
  statusSetKey?: keyof StatusSets;
}

const FIELD_DEFS: FieldDef[] = [
  { key: "gender", label: "Gender", group: "Personal" },
  { key: "date_of_birth", label: "Date of Birth", group: "Personal" },
  { key: "nationality", label: "Nationality", group: "Personal" },
  { key: "phone", label: "Phone", group: "Personal" },
  { key: "address", label: "Address", group: "Personal" },
  { key: "grade", label: "Grade", group: "Employment" },
  { key: "join_date", label: "Join Date", group: "Employment" },
  { key: "probation_status", label: "Probation Status", group: "Employment" },
  { key: "probation_end_date", label: "Probation End Date", group: "Employment" },
  { key: "avatar_url", label: "Avatar URL", group: "Avatar" },
  { key: "payroll_profile", label: "Payroll Profile", group: "Payroll", statusSetKey: "hasPayrollProfile" },
  { key: "tax_profile", label: "Tax Profile (TOS)", group: "Tax", statusSetKey: "hasTaxProfile" },
  { key: "nssf_profile", label: "NSSF Profile", group: "NSSF", statusSetKey: "hasNSSFProfile" },
  { key: "bank_account", label: "Bank Account", group: "Bank", statusSetKey: "hasBankAccount" },
];

const GROUPS = ["Personal", "Employment", "Avatar", "Payroll", "Tax", "NSSF", "Bank"] as const;

type FillResult = {
  updated: number;
  fields_filled: Record<string, number>;
  error?: string;
  skipped_fields?: string[];
};

export function FillMissingDialog({
  open,
  onOpenChange,
  profiles,
  filteredIds,
  statusSets,
  onComplete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: EmployeeProfile[];
  filteredIds?: string[];
  statusSets?: StatusSets;
  onComplete?: () => void;
}) {
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set(FIELD_DEFS.map((f) => f.key)));
  const [scope, setScope] = useState<"all" | "filtered">("all");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FillResult | null>(null);

  const targetIds = useMemo(() => {
    if (scope === "filtered" && filteredIds && filteredIds.length > 0) return filteredIds;
    return undefined;
  }, [scope, filteredIds]);

  const targetProfiles = useMemo(() => {
    if (!targetIds) return profiles;
    const idSet = new Set(targetIds);
    return profiles.filter((p) => idSet.has(p.id));
  }, [profiles, targetIds]);

  const missingCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const field of FIELD_DEFS) {
      counts[field.key] = targetProfiles.filter((p) => {
        if (field.statusSetKey && statusSets) {
          const set = statusSets[field.statusSetKey];
          return !set || !set.has(p.id);
        }
        const val = (p as unknown as Record<string, unknown>)[field.key];
        return val === null || val === undefined || val === "";
      }).length;
    }
    return counts;
  }, [targetProfiles, statusSets]);

  const isMissing = (key: string) => missingCounts[key] > 0;

  const allSelected = FIELD_DEFS.every((f) => selectedFields.has(f.key));
  const someSelected = FIELD_DEFS.some((f) => selectedFields.has(f.key));

  function toggleAll() {
    if (allSelected) {
      setSelectedFields(new Set());
    } else {
      setSelectedFields(new Set(FIELD_DEFS.map((f) => f.key)));
    }
  }

  function toggleField(key: string) {
    const next = new Set(selectedFields);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedFields(next);
  }

  async function handleGenerate() {
    const fields = FIELD_DEFS.map((f) => f.key).filter((k) => selectedFields.has(k));
    if (fields.length === 0) return;

    setRunning(true);
    setResult(null);

    try {
      const res = await fetch("/api/hr/employees/fill-missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_ids: targetIds && targetIds.length > 0 ? targetIds : undefined,
          fields,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to fill missing data");
      setResult(data);
      onComplete?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setResult({ updated: -1, fields_filled: {}, error: message });
    } finally {
      setRunning(false);
    }
  }

  const totalMissing = Object.values(missingCounts).reduce((a, b) => a + b, 0);
  const canRun = someSelected && totalMissing > 0 && !running;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Fill Missing Information</DialogTitle>
          <DialogDescription>
            Auto-generate realistic data for empty fields across employee profiles.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4 py-4">
            {result.updated >= 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                <p className="text-lg font-semibold text-emerald-800">Complete</p>
                <p className="text-sm text-emerald-700">
                  Updated {result.updated} profile{result.updated !== 1 ? "s" : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(result.fields_filled).filter(([, c]) => c > 0).map(([field, count]) => (
                    <span key={field} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700">
                      {field.replace(/_/g, " ")}: {count}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                <AlertCircle className="h-10 w-10 text-red-600" />
                <p className="text-lg font-semibold text-red-800">Error</p>
                <p className="text-sm text-red-700">{result.error ?? "Failed to fill missing data. Try again."}</p>
              </div>
            )}
          </div>
        ) : (
          <>
            {filteredIds && filteredIds.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-border px-4 py-2.5 text-sm">
                <span className="text-muted-foreground">Scope:</span>
                <button
                  type="button"
                  onClick={() => setScope("all")}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                    scope === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  All ({profiles.length})
                </button>
                <button
                  type="button"
                  onClick={() => setScope("filtered")}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                    scope === "filtered"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80",
                  )}
                >
                  Filtered ({filteredIds.length})
                </button>
              </div>
            )}

            <div className="max-h-[320px] space-y-1 overflow-y-auto">
              <div className="flex items-center gap-2 px-1 py-1.5">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  className="data-checked:bg-muted-foreground data-checked:border-muted-foreground"
                />
                <button type="button" onClick={toggleAll} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                  {allSelected ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="border-t" />
              {GROUPS.map((group) => {
                const groupFields = FIELD_DEFS.filter((f) => f.group === group);
                return (
                  <div key={group}>
                    <p className="px-1 py-1.5 text-xs font-semibold text-muted-foreground">{group}</p>
                    {groupFields.map((field) => {
                      const count = missingCounts[field.key];
                      return (
                        <label
                          key={field.key}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50",
                            !isMissing(field.key) && "opacity-40",
                          )}
                        >
                          <Checkbox
                            checked={selectedFields.has(field.key)}
                            onCheckedChange={() => toggleField(field.key)}
                            disabled={!isMissing(field.key)}
                          />
                          <span className="flex-1">{field.label}</span>
                          {count > 0 ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                              {count} missing
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-600">complete</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-2.5 text-sm">
              <span className="text-muted-foreground">
                {selectedFields.size} field{selectedFields.size !== 1 ? "s" : ""} selected
              </span>
              <span className="font-medium">{totalMissing} empty values to fill</span>
            </div>
          </>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="default" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={!canRun}>
                {running ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Filling...
                  </>
                ) : (
                  <>
                    <WandSparkles className="mr-2 h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
