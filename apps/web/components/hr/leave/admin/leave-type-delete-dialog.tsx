"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { LeaveAdminController } from "./use-leave-admin";

export function LeaveTypeDeleteDialog({ c }: { c: LeaveAdminController }) {
  const { deletingType, setDeletingType, deleteError, deleteLoading, deleteType } = c;
  return (
    <>
      {deletingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground">Delete leave type</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Are you sure you want to delete{" "}
                    <span className="font-medium text-foreground">{deletingType.leave_name}</span>?
                    This will fail if any leave requests or balances reference this type.
                  </p>
                </div>
              </div>

              {deleteError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {deleteError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingType(null)} disabled={deleteLoading}>
                Cancel
              </Button>
              <Button
                onClick={deleteType}
                disabled={deleteLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
