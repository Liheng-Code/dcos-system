"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { listLeaveBalancesByEmployeeIdAndFiscalYearOrderedByLeaveTypesLeaveName, listLeaveRequestsByEmployeeIdAndStartDateFrom } from "@/lib/hr/hr-queries";

interface BalanceRow {
  id: string;
  leave_type_id: string;
  fiscal_year: number;
  allocated_days: number;
  used_days: number;
  carried_over_days: number;
  remaining_days: number;
  last_updated: string;
  leave_types: {
    leave_name: string;
    leave_code: string;
    is_paid: boolean;
    carryover_allowed: boolean;
    carryover_expiry_month: number;
  };
}

interface LeaveHistoryRow {
  id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  leave_types: { leave_name: string };
}

const STATUS_COLORS: Record<string, string> = {
  approved:             "bg-green-100 text-green-700",
  submitted:            "bg-amber-100 text-amber-700",
  rejected:             "bg-red-100 text-red-700",
  withdrawn:            "bg-purple-100 text-purple-700",
  pending_cancellation: "bg-orange-100 text-orange-700",
  draft:                "bg-gray-100 text-gray-600",
};

export default function LeaveBalancePage() {
  const [balances, setBalances] = useState<BalanceRow[]>([]);
  const [history, setHistory] = useState<LeaveHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      const uid = data.user.id;

      Promise.all([
        listLeaveBalancesByEmployeeIdAndFiscalYearOrderedByLeaveTypesLeaveName(uid, currentYear),

        listLeaveRequestsByEmployeeIdAndStartDateFrom(uid, `${currentYear}-01-01`),
      ]).then(([balRes, histRes]) => {
        setBalances(balRes.data || []);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setHistory((histRes.data || []) as any);
        setLoading(false);
      });
    });
  }, []);

  const getPctUsed = (row: BalanceRow) => {
    const total = row.allocated_days + row.carried_over_days;
    if (total === 0) return 0;
    return Math.min((row.used_days / total) * 100, 100);
  };

  return (
    <div className="space-y-6">
      <div className="leave-page-header">
        <h2 className="text-2xl font-bold tracking-tight">My Leave Balance</h2>
        <p className="text-muted-foreground">Year {currentYear} — your entitlement and usage</p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading balance data...</p>
      ) : balances.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No leave balance records found for {currentYear}. Contact HR to have your balance set up.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {balances.map((row) => (
            <Card key={row.id} className="overflow-hidden">
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-base">{row.leave_types.leave_name}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {row.leave_types.is_paid ? "Paid" : "Unpaid"}
                    {row.leave_types.carryover_allowed && " · Carryover allowed"}
                  </p>
                </div>
                <span className="text-2xl font-bold">{row.remaining_days}</span>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Progress bar */}
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${getPctUsed(row) > 80 ? "bg-red-500" : getPctUsed(row) > 50 ? "bg-amber-500" : "bg-green-500"}`}
                    style={{ width: `${getPctUsed(row)}%` }}
                  />
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground">Allocated</p>
                    <p className="font-bold text-sm mt-0.5">{row.allocated_days}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground">Used</p>
                    <p className="font-bold text-sm mt-0.5">{row.used_days}</p>
                  </div>
                  <div className="bg-muted/50 rounded p-2">
                    <p className="text-muted-foreground">Remaining</p>
                    <p className="font-bold text-sm mt-0.5 text-green-700">{row.remaining_days}</p>
                  </div>
                </div>

                {/* Carryover info */}
                {row.carried_over_days > 0 && (
                  <div className="flex items-center justify-between text-xs bg-blue-50 border border-blue-200 rounded px-3 py-1.5">
                    <span className="text-blue-700">
                      {row.carried_over_days} day{row.carried_over_days !== 1 ? "s" : ""} carried over (used first)
                    </span>
                    {row.leave_types.carryover_expiry_month && (
                      <span className="text-blue-500">
                        Expires: {new Date(currentYear, row.leave_types.carryover_expiry_month - 1, 1).toLocaleString("default", { month: "short" })} {currentYear}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Leave History */}
      <div>
        <h3 className="text-lg font-semibold mb-3">Leave History {currentYear}</h3>
        {history.length === 0 ? (
          <p className="text-muted-foreground text-sm">No leave requests this year.</p>
        ) : (
          <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 to-indigo-600" />
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  <th className="text-left font-medium py-3 px-4">Leave Type</th>
                  <th className="text-left font-medium py-3 px-4">Dates</th>
                  <th className="text-center font-medium py-3 px-4">Days</th>
                  <th className="text-left font-medium py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((req) => (
                  <tr key={req.id} className="border-b border-border hover:bg-muted/30">
                    <td className="py-3 px-4 font-medium">{req.leave_types.leave_name}</td>
                    <td className="py-3 px-4 text-muted-foreground">
                      {format(new Date(req.start_date), "dd MMM")} — {format(new Date(req.end_date), "dd MMM yyyy")}
                    </td>
                    <td className="py-3 px-4 text-center">{req.days_requested}</td>
                    <td className="py-3 px-4">
                      <Badge className={`text-xs ${STATUS_COLORS[req.status] || "bg-gray-100 text-gray-600"}`}>
                        {req.status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
