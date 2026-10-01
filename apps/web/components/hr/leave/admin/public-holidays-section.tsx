"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { HOLIDAY_YEARS, DAYS_OF_WEEK } from "./constants";
import type { LeaveAdminController } from "./use-leave-admin";

export function PublicHolidaysSection({ c }: { c: LeaveAdminController }) {
  const { activeSection, holidays, selectedYear, setSelectedYear, holidayLoading, setDeletingHoliday, setHolidayDeleteError, openCreateHoliday, openEditHoliday } = c;
  return (
    <>
      {activeSection === "public_holidays" && (
        <div className="space-y-4">
          {/* Toolbar: year selector + add button */}
          <div className="flex items-center justify-between">
            <div className="flex gap-1">
              {HOLIDAY_YEARS.map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    selectedYear === yr
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
            <Button onClick={openCreateHoliday} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Holiday
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left font-medium py-3 px-4">Date</th>
                  <th className="text-left font-medium py-3 px-4">Day</th>
                  <th className="text-left font-medium py-3 px-4">Holiday Name</th>
                  <th className="text-center font-medium py-3 px-4">Status</th>
                  <th className="text-center font-medium py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {holidayLoading ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : holidays.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No public holidays configured for {selectedYear}.</td></tr>
                ) : holidays.map((h) => {
                  const d = new Date(h.holiday_date);
                  return (
                    <tr key={h.id} className="border-b border-border hover:bg-muted/30">
                      <td className="py-3 px-4 font-medium">
                        {d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{DAYS_OF_WEEK[d.getDay()]}</td>
                      <td className="py-3 px-4">{h.holiday_name}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={`text-xs ${h.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {h.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openEditHoliday(h)}
                            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => { setDeletingHoliday(h); setHolidayDeleteError(null); }}
                            className="text-muted-foreground hover:text-red-600 transition-colors p-1 rounded hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {holidays.filter(h => h.is_active).length} active public holiday{holidays.filter(h => h.is_active).length !== 1 ? "s" : ""} in {selectedYear}.
            Lunar-based holidays (Pchum Ben, Water Festival) may shift by ±1 day pending official announcement.
          </p>
        </div>
      )}
    </>
  );
}
