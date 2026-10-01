"use client";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { Toggle } from "./toggle";
import { HOLIDAY_YEARS, inputCls, labelCls } from "./constants";
import type { LeaveAdminController } from "./use-leave-admin";

export function HolidayFormDialog({ c }: { c: LeaveAdminController }) {
  const { showHolidayForm, setShowHolidayForm, editingHoliday, holidayForm, setHolidayForm, holidaySaving, holidayError, saveHoliday } = c;
  return (
    <>
      {showHolidayForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h3 className="text-base font-semibold">
                {editingHoliday ? "Edit public holiday" : "Add public holiday"}
              </h3>
              <button onClick={() => setShowHolidayForm(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Date | Year */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Date</label>
                  <input
                    type="date"
                    className={inputCls}
                    value={holidayForm.holiday_date}
                    onChange={(e) => setHolidayForm((f) => ({ ...f, holiday_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={labelCls}>Year</label>
                  <select
                    className={inputCls}
                    value={holidayForm.year}
                    onChange={(e) => setHolidayForm((f) => ({ ...f, year: Number(e.target.value) }))}
                  >
                    {HOLIDAY_YEARS.map((yr) => (
                      <option key={yr} value={yr}>{yr}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className={labelCls}>Holiday Name</label>
                <input
                  className={inputCls}
                  value={holidayForm.holiday_name}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, holiday_name: e.target.value }))}
                  placeholder="e.g. National Independence Day"
                />
              </div>

              {/* Note (optional) */}
              <div>
                <label className={labelCls}>Note <span className="text-muted-foreground font-normal">(optional)</span></label>
                <textarea
                  rows={2}
                  className={inputCls}
                  value={holidayForm.note}
                  onChange={(e) => setHolidayForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g. Subject to official government announcement"
                />
              </div>

              {/* Active toggle */}
              <div className="flex items-center justify-between pt-1">
                <span className="text-sm font-medium text-foreground">Active</span>
                <Toggle
                  checked={holidayForm.is_active}
                  onChange={(v) => setHolidayForm((f) => ({ ...f, is_active: v }))}
                />
              </div>

              {holidayError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{holidayError}</p>
              )}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowHolidayForm(false)}>Cancel</Button>
              <Button onClick={saveHoliday} disabled={holidaySaving}>
                {holidaySaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
