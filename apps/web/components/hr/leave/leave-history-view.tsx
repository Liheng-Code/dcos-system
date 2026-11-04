"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLOR_HEX } from "@/components/hr/leave/admin/constants";
import type { EmployeeLeaveHistory } from "@/lib/hr/employee-leave-history";

const LEAVE_STATUS: Record<string, string> = {
  draft: "border-gray-200 bg-gray-50 text-gray-600",
  submitted: "border-blue-200 bg-blue-50 text-blue-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-red-200 bg-red-50 text-red-700",
  cancelled: "border-slate-200 bg-slate-100 text-slate-600",
  withdrawn: "border-slate-200 bg-slate-100 text-slate-600",
  pending_cancellation: "border-amber-200 bg-amber-50 text-amber-700",
};

function labelize(v: string | null | undefined) {
  if (!v) return "—";
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDays(n: number) {
  return Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function approverLine(name: string | null, status: string | null, date: string | null) {
  if (!name) return null;
  return `${name} (${labelize(status ?? "pending")}${date ? ` · ${fmtDate(date)}` : ""})`;
}

// One employee's leave balances and requests, filtered to a year ("all" = every year).
export function LeaveHistoryView({ history, year }: { history: EmployeeLeaveHistory; year: number | "all" }) {
  const balances = history.balances.filter((b) => year === "all" || b.fiscal_year === year);
  const requests = history.requests.filter((r) => year === "all" || r.start_date.startsWith(String(year)));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Leave Balances</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {balances.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No leave balances for this period.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Year</th>
                    <th className="px-4 py-2.5 text-left font-medium">Leave Type</th>
                    <th className="px-4 py-2.5 text-right font-medium">Allocated</th>
                    <th className="px-4 py-2.5 text-right font-medium">Carried Over</th>
                    <th className="px-4 py-2.5 text-right font-medium">Used</th>
                    <th className="px-4 py-2.5 text-right font-medium">Remaining</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {balances.map((b) => (
                    <tr key={b.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">{b.fiscal_year}</td>
                      <td className="px-4 py-3 font-medium">{b.leave_name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDays(b.allocated_days)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {fmtDays(b.carried_over_days)}
                        {b.carryover_forfeited && <span className="ml-1 text-xs text-red-600">(forfeited)</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtDays(b.used_days)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{fmtDays(b.remaining_days)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Leave Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <CalendarDays className="h-8 w-8 opacity-30" />
              <p className="text-sm">No leave requests for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Leave Type</th>
                    <th className="px-4 py-2.5 text-left font-medium">Dates</th>
                    <th className="px-4 py-2.5 text-right font-medium">Days</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-left font-medium">Approvers</th>
                    <th className="px-4 py-2.5 text-left font-medium">Reason</th>
                    <th className="px-4 py-2.5 text-left font-medium">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {requests.map((r) => {
                    const approvers = [
                      approverLine(r.approver_1_name, r.approver_1_status, r.approver_1_date),
                      approverLine(r.approver_2_name, r.approver_2_status, r.approver_2_date),
                    ].filter((a): a is string => a != null);
                    return (
                      <tr key={r.id} className="align-top hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">
                          <span className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COLOR_HEX[r.leave_color ?? ""] ?? COLOR_HEX.blue }} />
                            {r.leave_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {r.start_date === r.end_date ? fmtDate(r.start_date) : `${fmtDate(r.start_date)} – ${fmtDate(r.end_date)}`}
                          {r.is_half_day && <span className="block text-xs">Half day{r.half_day_period ? ` (${r.half_day_period})` : ""}</span>}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtDays(r.days_requested)}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-xs", LEAVE_STATUS[r.status])}>{labelize(r.status)}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {approvers.length === 0 ? "—" : approvers.map((a) => <span key={a} className="block">{a}</span>)}
                        </td>
                        <td className="px-4 py-3 max-w-xs text-muted-foreground">
                          <span className="line-clamp-2">{r.reason || "—"}</span>
                          {r.cancellation_reason && <span className="block text-xs text-red-600">Cancelled: {r.cancellation_reason}</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(r.submission_date ?? r.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
