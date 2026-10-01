"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import type { LeaveAdminController } from "./use-leave-admin";

export function HolidayDeleteDialog({ c }: { c: LeaveAdminController }) {
  const { deletingHoliday, setDeletingHoliday, holidayDeleteError, holidayDeleteLoading, deleteHoliday } = c;
  return (
    <>
      {deletingHoliday && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-100">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Delete public holiday</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delete <span className="font-medium text-foreground">{deletingHoliday.holiday_name}</span> (
                    {new Date(deletingHoliday.holiday_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })})?
                    This cannot be undone.
                  </p>
                </div>
              </div>
              {holidayDeleteError && (
                <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{holidayDeleteError}</p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setDeletingHoliday(null)} disabled={holidayDeleteLoading}>Cancel</Button>
              <Button onClick={deleteHoliday} disabled={holidayDeleteLoading} className="bg-red-600 hover:bg-red-700 text-white">
                {holidayDeleteLoading ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
