"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

export interface YearEndPreviewRow {
  employee_id: string;
  employee_name: string;
  department: string;
  leave_type_name: string;
  current_remaining: number;
  service_years: number | null;
  entitlement_days: number;
  carry_forward: number;
  expired_days: number;
  opening_balance: number;
  blocking_reason: string | null;
  warning_reason: string | null;
  existing_next_year_balance: boolean;
}

export interface YearEndPreview {
  currentYear: number;
  nextYear: number;
  canRun: boolean;
  hasExistingLogs: boolean;
  hasNextYearBalances: boolean;
  runnableRows: number;
  rows: YearEndPreviewRow[];
  totals: {
    employees: number;
    balances: number;
    entitlementDays: number;
    carryForward: number;
    expiredDays: number;
    openingBalance: number;
  };
}

interface YearEndRunWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: YearEndPreview | null;
  onConfirm: () => Promise<{ success: boolean; message: string }>;
}

const STEP_LABELS = ["Summary", "Issues", "Confirm & Run"];

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEP_LABELS.map((label, index) => {
        const stepNumber = index + 1;
        const isActive = stepNumber === step;
        const isDone = stepNumber < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                isDone ? "bg-primary text-primary-foreground" : isActive ? "bg-primary/15 text-primary border border-primary" : "bg-muted text-muted-foreground",
              )}
            >
              {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : stepNumber}
            </div>
            <span className={cn("text-xs font-medium", isActive ? "text-foreground" : "text-muted-foreground")}>{label}</span>
            {stepNumber < STEP_LABELS.length && <div className="h-px w-6 bg-border" />}
          </div>
        );
      })}
    </div>
  );
}

export function YearEndRunWizard({ open, onOpenChange, preview, onConfirm }: YearEndRunWizardProps) {
  const [step, setStep] = useState(1);
  const [issuesAcknowledged, setIssuesAcknowledged] = useState(false);
  const [finalAcknowledged, setFinalAcknowledged] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Reset the wizard whenever it transitions from closed to open (adjusting
  // state during render instead of an effect, per React's guidance).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(1);
      setIssuesAcknowledged(false);
      setFinalAcknowledged(false);
      setRunning(false);
      setResult(null);
    }
  }

  if (!preview) return null;

  const blockedRows = preview.rows.filter((row) => row.blocking_reason != null);
  const skippedRows = preview.rows.filter((row) => row.blocking_reason == null && row.existing_next_year_balance);
  const warningRows = preview.rows.filter((row) => row.blocking_reason == null && !row.existing_next_year_balance && row.warning_reason != null);
  const hasIssues = blockedRows.length > 0 || skippedRows.length > 0 || warningRows.length > 0;

  const handleConfirm = async () => {
    setRunning(true);
    setResult(null);
    const outcome = await onConfirm();
    setResult(outcome);
    setRunning(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Year-End Run — {preview.currentYear} → {preview.nextYear}</DialogTitle>
          <DialogDescription>
            Step {step} of {STEP_LABELS.length}: {STEP_LABELS[step - 1]}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator step={step} />

        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Review the totals below before continuing. These reflect every leave balance that will be generated for {preview.nextYear}.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Employees</p>
                <p className="text-lg font-semibold">{preview.totals.employees}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Entitlement</p>
                <p className="text-lg font-semibold">{preview.totals.entitlementDays}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Carryover</p>
                <p className="text-lg font-semibold">{preview.totals.carryForward}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Expired</p>
                <p className="text-lg font-semibold">{preview.totals.expiredDays}</p>
              </div>
              <div className="rounded-md border border-border px-3 py-2">
                <p className="text-xs text-muted-foreground">Bring Forward</p>
                <p className="text-lg font-semibold">{preview.totals.openingBalance}</p>
              </div>
            </div>
            {!preview.canRun && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {preview.rows.length === 0
                  ? "No eligible employees or leave types were found for the year-end preview."
                  : preview.runnableRows === 0
                  ? "All next-year balances already exist for the selected staff."
                  : "Resolve the blocked preview rows before running year-end."}
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            {!hasIssues ? (
              <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                No issues found — all {preview.runnableRows} rows are ready to process.
              </div>
            ) : (
              <>
                {blockedRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                      {blockedRows.length} row{blockedRows.length === 1 ? "" : "s"} blocked — these must be resolved outside this wizard before you can continue.
                    </div>
                    <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {blockedRows.map((row) => (
                            <tr key={`${row.employee_id}-${row.leave_type_name}`} className="border-b border-border last:border-0">
                              <td className="py-2 px-3">{row.employee_name}</td>
                              <td className="py-2 px-3 text-muted-foreground">{row.leave_type_name}</td>
                              <td className="py-2 px-3 text-red-600">{row.blocking_reason}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {(warningRows.length > 0 || skippedRows.length > 0) && (
                  <div className="space-y-2">
                    <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                      {warningRows.length > 0 && `${warningRows.length} row${warningRows.length === 1 ? "" : "s"} with warnings`}
                      {warningRows.length > 0 && skippedRows.length > 0 && "; "}
                      {skippedRows.length > 0 && `${skippedRows.length} row${skippedRows.length === 1 ? "" : "s"} skipped (balance already exists for ${preview.nextYear})`}
                    </div>
                    <div className="rounded-md border border-border overflow-hidden max-h-40 overflow-y-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {[...warningRows, ...skippedRows].map((row) => (
                            <tr key={`${row.employee_id}-${row.leave_type_name}`} className="border-b border-border last:border-0">
                              <td className="py-2 px-3">{row.employee_name}</td>
                              <td className="py-2 px-3 text-muted-foreground">{row.leave_type_name}</td>
                              <td className="py-2 px-3 text-amber-700">
                                {row.existing_next_year_balance ? `Skipped; next-year balance already exists` : row.warning_reason}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {blockedRows.length === 0 && (
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox checked={issuesAcknowledged} onCheckedChange={(c) => setIssuesAcknowledged(Boolean(c))} className="mt-0.5" />
                    <span>I&apos;ve reviewed the warnings/skipped rows above and want to proceed.</span>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            {!result && (
              <>
                <div className="rounded-md border border-border px-4 py-3 text-sm">
                  This will generate <span className="font-semibold">{preview.runnableRows}</span> new leave balances for{" "}
                  <span className="font-semibold">{preview.totals.employees}</span> employees for {preview.nextYear}. This action cannot be undone from this screen.
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <Checkbox checked={finalAcknowledged} onCheckedChange={(c) => setFinalAcknowledged(Boolean(c))} className="mt-0.5" />
                  <span>I understand this will generate new-year leave balances and cannot be undone.</span>
                </label>
              </>
            )}
            {result && (
              <div
                className={cn(
                  "rounded-md px-4 py-3 text-sm flex items-start gap-2",
                  result.success ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700",
                )}
              >
                {result.success ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
                <span>{result.message}</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step > 1 && !result && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={running}>
              Back
            </Button>
          )}
          {step < 3 && (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 1 && !preview.canRun) ||
                (step === 2 && blockedRows.length > 0) ||
                (step === 2 && hasIssues && blockedRows.length === 0 && !issuesAcknowledged)
              }
            >
              Next
            </Button>
          )}
          {step === 3 && !result && (
            <Button onClick={handleConfirm} disabled={!finalAcknowledged || running} className="gap-2">
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              {running ? "Processing..." : "Confirm & Run Year-End"}
            </Button>
          )}
          {step === 3 && result && (
            result.success ? (
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setResult(null)}>Try Again</Button>
                <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              </>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
