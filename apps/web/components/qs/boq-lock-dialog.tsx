"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { checkBoqForLock, updateBoqBaselineStatus } from "@/lib/qs/qs-service";
import { BoqLockValidationError, sortBoqIssues, summarizeBoqIssues, type BoqIssue } from "@/lib/qs/qs-boq-validation";
import { cn } from "@/lib/utils";

const MAX_ROWS = 200;

interface BoqLockDialogProps {
  projectId: string;
  boqId: string;
  canApprove: boolean;
  onClose: () => void;
  onLocked: () => void;
}

// Mounted only while open (see boq-builder.tsx), so state starts fresh each time.
// Errors block the lock; warnings are shown but do not.
export function BoqLockDialog({ projectId, boqId, canApprove, onClose, onLocked }: BoqLockDialogProps) {
  const [issues, setIssues] = useState<BoqIssue[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    checkBoqForLock(boqId)
      .then((result) => { if (!cancelled) setIssues(result); })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to validate BOQ"); });
    return () => { cancelled = true; };
  }, [boqId]);

  const sorted = useMemo(() => (issues ? sortBoqIssues(issues) : []), [issues]);
  const { errors, warnings } = useMemo(() => summarizeBoqIssues(issues ?? []), [issues]);
  const blocked = errors > 0;

  async function handleConfirm() {
    setSaving(true);
    try {
      await updateBoqBaselineStatus(projectId, "locked", boqId);
      toast.success("BOQ baseline locked");
      onLocked();
      onClose();
    } catch (e) {
      // The data can change between the check and the click; the service re-validates.
      if (e instanceof BoqLockValidationError) setIssues(e.issues);
      toast.error(e instanceof Error ? e.message : "Failed to lock BOQ baseline");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Lock BOQ Baseline</DialogTitle>
          <DialogDescription>
            Locking freezes every section and item in this BOQ. Errors must be fixed first; warnings can be reviewed and accepted.
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
        ) : issues === null ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="flex items-center gap-4 text-sm">
              {issues.length === 0 ? (
                <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> No issues found — ready to lock.
                </span>
              ) : (
                <>
                  <span className={cn("font-medium", errors > 0 ? "text-red-600" : "text-muted-foreground")}>
                    {errors} error{errors !== 1 ? "s" : ""}
                  </span>
                  <span className={cn("font-medium", warnings > 0 ? "text-amber-600" : "text-muted-foreground")}>
                    {warnings} warning{warnings !== 1 ? "s" : ""}
                  </span>
                </>
              )}
            </div>

            {sorted.length > 0 && (
              <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Level</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sorted.slice(0, MAX_ROWS).map((issue, i) => (
                      <TableRow key={`${issue.rule}-${issue.itemId ?? "boq"}-${i}`}>
                        <TableCell>
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            issue.level === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700",
                          )}>
                            {issue.level === "error" && <AlertTriangle className="h-3 w-3" />}
                            {issue.level === "error" ? "Error" : "Warning"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs">{issue.itemLabel || "—"}</TableCell>
                        <TableCell className="max-w-[140px] truncate text-xs text-muted-foreground">{issue.sectionTitle || "—"}</TableCell>
                        <TableCell className="text-xs">{issue.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {sorted.length > MAX_ROWS && (
                  <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    Showing the first {MAX_ROWS} of {sorted.length} findings (errors first).
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => void handleConfirm()}
            disabled={saving || issues === null || blocked || !canApprove}
            title={blocked ? "Fix all errors before locking" : !canApprove ? "You do not have permission to lock a baseline" : undefined}
          >
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Lock className="mr-1.5 h-4 w-4" />}
            {warnings > 0 && !blocked ? "Lock with warnings" : "Lock Baseline"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
