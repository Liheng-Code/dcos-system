"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Calendar } from "lucide-react";

interface YearEndLog {
  id: string;
  run_date: string;
  from_year: number;
  to_year: number;
  days_carried: number;
  days_expired: number;
  profiles: { full_name: string } | null;
}

interface YearEndPreviewRow {
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

interface YearEndPreview {
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

export default function YearEndAdminPage() {
  const [logs, setLogs] = useState<YearEndLog[]>([]);
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewSearch, setPreviewSearch] = useState("");
  const [previewDepartment, setPreviewDepartment] = useState("");
  const [previewLeaveType, setPreviewLeaveType] = useState("");
  const [previewStatus, setPreviewStatus] = useState("");

  const previewDepartments = useMemo(() => {
    return Array.from(new Set((preview?.rows ?? []).map((row) => row.department).filter(Boolean))).sort();
  }, [preview]);

  const previewLeaveTypes = useMemo(() => {
    return Array.from(new Set((preview?.rows ?? []).map((row) => row.leave_type_name).filter(Boolean))).sort();
  }, [preview]);

  const filteredPreviewRows = useMemo(() => {
    const search = previewSearch.trim().toLowerCase();
    return (preview?.rows ?? []).filter((row) => {
      const status = row.blocking_reason ? "blocked" : row.existing_next_year_balance ? "skipped" : row.warning_reason ? "warning" : "ready";
      return (
        (!search || row.employee_name.toLowerCase().includes(search) || row.leave_type_name.toLowerCase().includes(search)) &&
        (!previewDepartment || row.department === previewDepartment) &&
        (!previewLeaveType || row.leave_type_name === previewLeaveType) &&
        (!previewStatus || status === previewStatus)
      );
    });
  }, [preview, previewDepartment, previewLeaveType, previewSearch, previewStatus]);

  const refreshLogs = async () => {
    const { data } = await createClient()
      .from("leave_year_end_logs")
      .select("*, profiles(full_name)")
      .order("run_date", { ascending: false })
      .limit(20);
    setLogs(data || []);
  };

  const refreshPreview = async () => {
    setPreviewLoading(true);
    setMessage(null);
    const res = await fetch("/api/hr/leave/year-end");
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unable to load year-end preview." })) as { error?: string };
      setMessage(`Error: ${body.error || "Unable to load year-end preview."}`);
      setPreview(null);
    } else {
      setPreview(await res.json() as YearEndPreview);
    }
    setPreviewLoading(false);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void Promise.all([refreshLogs(), refreshPreview()]).finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const runYearEnd = async () => {
    setRunning(true);
    setMessage(null);
    const res = await fetch("/api/hr/leave/year-end", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: new Date().getFullYear() }),
    });
    const body = await res.json().catch(() => ({ error: "Year-end processing failed." })) as { error?: string; message?: string };
    if (!res.ok) {
      setMessage(`Error: ${body.error || "Year-end processing failed."}`);
    } else {
      setMessage(body.message || "Year-end processing complete.");
      await Promise.all([refreshLogs(), refreshPreview()]);
    }
    setRunning(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/hr/leave"
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Back to E-Leave"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Year-End Run</h2>
            <p className="text-muted-foreground">Generate next-year leave opening balances</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-3">
          <Button onClick={refreshPreview} disabled={previewLoading || running} variant="outline" size="sm">
            {previewLoading ? "Loading Preview..." : "Refresh Preview"}
          </Button>
          <Button onClick={runYearEnd} disabled={running || previewLoading || !preview?.canRun} className="gap-2" size="sm">
            <Calendar className="h-4 w-4" />
            {running ? "Processing..." : `Confirm Year-End for ${new Date().getFullYear()} -> ${new Date().getFullYear() + 1}`}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4">
          {message && (
            <div className={`rounded-md px-4 py-3 text-sm ${message.startsWith("Error") ? "bg-red-50 border border-red-200 text-red-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
              {message}
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Employees</p>
              <p className="text-lg font-semibold">{preview?.totals.employees ?? 0}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Entitlement</p>
              <p className="text-lg font-semibold">{preview?.totals.entitlementDays ?? 0}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Carryover</p>
              <p className="text-lg font-semibold">{preview?.totals.carryForward ?? 0}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Expired</p>
              <p className="text-lg font-semibold">{preview?.totals.expiredDays ?? 0}</p>
            </div>
            <div className="rounded-md border border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">Bring Forward</p>
              <p className="text-lg font-semibold">{preview?.totals.openingBalance ?? 0}</p>
            </div>
          </div>
          {preview && !preview.canRun && (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {preview.rows.length === 0
                ? "No eligible employees or leave types were found for the year-end preview."
                : preview.runnableRows === 0
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
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search employee or leave type"
              className="h-9 w-56 rounded-md border border-input bg-background px-3 text-sm"
            />
            <select
              value={previewDepartment}
              onChange={(e) => setPreviewDepartment(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Departments</option>
              {previewDepartments.map((department) => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <select
              value={previewLeaveType}
              onChange={(e) => setPreviewLeaveType(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Leave Types</option>
              {previewLeaveTypes.map((leaveType) => (
                <option key={leaveType} value={leaveType}>{leaveType}</option>
              ))}
            </select>
            <select
              value={previewStatus}
              onChange={(e) => setPreviewStatus(e.target.value)}
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
                setPreviewSearch("");
                setPreviewDepartment("");
                setPreviewLeaveType("");
                setPreviewStatus("");
              }}
            >
              Reset
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
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
              {previewLoading ? (
                <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">Loading preview...</td></tr>
              ) : !preview || preview.rows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No current-year balances found</td></tr>
              ) : filteredPreviewRows.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-6 text-muted-foreground">No preview rows match the selected filters</td></tr>
              ) : filteredPreviewRows.map((row) => (
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

      <div>
        <h3 className="text-base font-semibold mb-3">Processing History</h3>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
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
                {logs.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No year-end runs recorded</td></tr>
                ) : logs.map((log) => (
                  <tr key={log.id} className="border-b border-border">
                    <td className="py-3 px-4 text-muted-foreground">{new Date(log.run_date).toLocaleDateString()}</td>
                    <td className="py-3 px-4">{log.from_year} {"->"} {log.to_year}</td>
                    <td className="py-3 px-4">{log.profiles?.full_name || "-"}</td>
                    <td className="py-3 px-4 text-center text-green-700 font-medium">{log.days_carried}</td>
                    <td className="py-3 px-4 text-center text-red-600 font-medium">{log.days_expired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
