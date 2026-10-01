"use client";

import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { fmtDate } from "./format";
import type { LoadedEmployeeDetail } from "./use-employee-detail";

export function ProbationConfirmDialog({ c }: { c: LoadedEmployeeDetail }) {
  const { profile, profileForm, showConfirmDialog, setShowConfirmDialog, confirming, confirmProbation } = c;
  return (
    <>
      {showConfirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirmDialog(false)}>
          <div className="bg-background rounded-xl shadow-xl w-96 max-w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Confirm Probation</h3>
              <button type="button" onClick={() => setShowConfirmDialog(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Confirm that <strong>{profile?.full_name}</strong> has completed their probation period.
              </p>
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Probation Status</span>
                  <span className="font-medium text-amber-600">Active</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">End Date</span>
                  <span className="font-medium">{fmtDate(profileForm.probation_end_date)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">New Status</span>
                  <span className="font-medium text-emerald-600">Completed</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                This action will mark the employee as probation completed, record the confirmation date, and unlock their leave balance.
              </p>
            </div>
            <div className="mt-5 flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowConfirmDialog(false)}>
                Cancel
              </Button>
              <Button type="button" size="sm" onClick={confirmProbation} disabled={confirming} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
