"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";
import type { LeaveAdminController } from "./use-leave-admin";

export function YearEndSection({ c }: { c: LeaveAdminController }) {
  const { activeSection, yearEndLogs, setYearEndWizardOpen, yearEndMsg, carryoverExpiryRunning, yearEndPreview, yearEndPreviewLoading, yearEndPreviewSearch, setYearEndPreviewSearch, yearEndPreviewDepartment, setYearEndPreviewDepartment, yearEndPreviewLeaveType, setYearEndPreviewLeaveType, yearEndPreviewStatus, setYearEndPreviewStatus, yearEndPreviewDepartments, yearEndPreviewLeaveTypes, filteredYearEndPreviewRows, loadYearEndPreview, runCarryoverExpiry } = c;
  return (
    <>
      {activeSection === "year_end" && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="grid grid-cols-[1fr_auto] items-center gap-4">
              <CardTitle className="text-base">Year-End Run</CardTitle>
              <div className="flex flex-wrap justify-end gap-3">
                <Button onClick={loadYearEndPreview} disabled={yearEndPreviewLoading} variant="outline" size="sm">
                  {yearEndPreviewLoading ? "Loading Preview..." : "Refresh Preview"}
                </Button>
                <Button onClick={() => setYearEndWizardOpen(true)} disabled={yearEndPreviewLoading || !yearEndPreview || yearEndPreview.rows.length === 0} className="gap-2" size="sm">
                  <Calendar className="h-4 w-4" />
                  {`Confirm Year-End for ${new Date().getFullYear()} -> ${new Date().getFullYear() + 1}`}
                </Button>
                <Button onClick={runCarryoverExpiry} disabled={carryoverExpiryRunning} variant="outline" className="gap-2" size="sm">
                  <Clock className="h-4 w-4" />
                  {carryoverExpiryRunning ? "Sweeping..." : "Apply Carryover Expiry"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {yearEndMsg && (
                <div className={`rounded-md px-4 py-3 text-sm ${yearEndMsg.startsWith("Error") ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
                  {yearEndMsg}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Employees</p>
                  <p className="text-lg font-semibold">{yearEndPreview?.totals.employees ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Entitlement</p>
                  <p className="text-lg font-semibold">{yearEndPreview?.totals.entitlementDays ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Carryover</p>
                  <p className="text-lg font-semibold">{yearEndPreview?.totals.carryForward ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Expired</p>
                  <p className="text-lg font-semibold">{yearEndPreview?.totals.expiredDays ?? 0}</p>
                </div>
                <div className="rounded-md border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">Bring Forward</p>
                  <p className="text-lg font-semibold">{yearEndPreview?.totals.openingBalance ?? 0}</p>
                </div>
              </div>
              {yearEndPreview && !yearEndPreview.canRun && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {yearEndPreview.rows.length === 0
                    ? "No eligible employees or leave types were found for the year-end preview."
                    : yearEndPreview.runnableRows === 0
                    ? "All next-year balances already exist for the selected staff."
                    : "Resolve the blocked preview rows before running year-end."}
                </div>
              )}
            </CardContent>
          </Card>

          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h3 className="text-base font-semibold">Preview</h3>
              <div className="flex flex-wrap items-end gap-2">
                <input
                  value={yearEndPreviewSearch}
                  onChange={(e) => setYearEndPreviewSearch(e.target.value)}
                  placeholder="Search employee or leave type"
                  className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
                />
                <select
                  value={yearEndPreviewDepartment}
                  onChange={(e) => setYearEndPreviewDepartment(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All Departments</option>
                  {yearEndPreviewDepartments.map((department) => (
                    <option key={department} value={department}>{department}</option>
                  ))}
                </select>
                <select
                  value={yearEndPreviewLeaveType}
                  onChange={(e) => setYearEndPreviewLeaveType(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All Leave Types</option>
                  {yearEndPreviewLeaveTypes.map((leaveType) => (
                    <option key={leaveType} value={leaveType}>{leaveType}</option>
                  ))}
                </select>
                <select
                  value={yearEndPreviewStatus}
                  onChange={(e) => setYearEndPreviewStatus(e.target.value)}
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">All Status</option>
                  <option value="ready">Ready</option>
                  <option value="warning">Warning</option>
                  <option value="skipped">Skipped</option>
                  <option value="blocked">Blocked</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setYearEndPreviewSearch("");
                    setYearEndPreviewDepartment("");
                    setYearEndPreviewLeaveType("");
                    setYearEndPreviewStatus("");
                  }}
                >
                  Reset
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="max-h-[70vh] overflow-y-auto overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left font-medium py-3 px-4">Employee</th>
                    <th className="text-left font-medium py-3 px-4">Department</th>
                    <th className="text-left font-medium py-3 px-4">Leave Type</th>
                    <th className="text-center font-medium py-3 px-4">Service</th>
                    <th className="text-center font-medium py-3 px-4">Entitlement</th>
                    <th className="text-center font-medium py-3 px-4">Remaining</th>
                    <th className="text-center font-medium py-3 px-4">Carryover</th>
                    <th className="text-center font-medium py-3 px-4">Expired</th>
                    <th className="text-center font-medium py-3 px-4">Bring Forward</th>
                    <th className="text-left font-medium py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {yearEndPreviewLoading ? (
                    <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">Loading preview...</td></tr>
                  ) : !yearEndPreview || yearEndPreview.rows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No current-year balances found</td></tr>
                  ) : filteredYearEndPreviewRows.length === 0 ? (
                    <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No preview rows match the selected filters</td></tr>
                  ) : filteredYearEndPreviewRows.map((row) => (
                    <tr key={`${row.employee_id}-${row.leave_type_name}`} className="border-b border-border">
                      <td className="py-3 px-4">{row.employee_name}</td>
                      <td className="py-3 px-4 text-muted-foreground">{row.department}</td>
                      <td className="py-3 px-4">{row.leave_type_name}</td>
                      <td className="py-3 px-4 text-center">{row.service_years ?? "-"}</td>
                      <td className="py-3 px-4 text-center font-medium">{row.entitlement_days}</td>
                      <td className="py-3 px-4 text-center">{row.current_remaining}</td>
                      <td className="py-3 px-4 text-center text-green-700 font-medium">{row.carry_forward}</td>
                      <td className="py-3 px-4 text-center text-red-600 font-medium">{row.expired_days}</td>
                      <td className="py-3 px-4 text-center font-semibold">{row.opening_balance}</td>
                      <td className="py-3 px-4 text-sm">
                        {row.blocking_reason ? (
                          <span className="text-red-600">{row.blocking_reason}</span>
                        ) : row.existing_next_year_balance ? (
                          <span className="text-amber-700">Skipped; next-year balance already exists</span>
                        ) : row.warning_reason ? (
                          <span className="text-amber-700">{row.warning_reason}; fixed entitlement used</span>
                        ) : (
                          <span className="text-green-700">Ready</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold mb-3">Processing History</h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="text-left font-medium py-3 px-4">Date Run</th>
                    <th className="text-left font-medium py-3 px-4">Period</th>
                    <th className="text-left font-medium py-3 px-4">Employee</th>
                    <th className="text-center font-medium py-3 px-4">Carried</th>
                    <th className="text-center font-medium py-3 px-4">Expired</th>
                  </tr>
                </thead>
                <tbody>
                  {yearEndLogs.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No year-end runs recorded</td></tr>
                  ) : yearEndLogs.map((log) => (
                    <tr key={log.id} className="border-b border-border">
                      <td className="py-3 px-4 text-muted-foreground">{new Date(log.run_date).toLocaleDateString()}</td>
                      <td className="py-3 px-4">{log.from_year} → {log.to_year}</td>
                      <td className="py-3 px-4">{log.profiles?.full_name || "—"}</td>
                      <td className="py-3 px-4 text-center text-green-700 font-medium">{log.days_carried}</td>
                      <td className="py-3 px-4 text-center text-red-600 font-medium">{log.days_expired}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
