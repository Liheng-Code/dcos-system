"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Users } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────
interface OnLeaveEntry {
  id: string;
  employee_name: string;
  employee_id: string;
  department: string;
  leave_type: string;
  leave_type_color: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  is_half_day: boolean;
  half_day_period: string | null;
}

interface LeaveType {
  id: string;
  leave_name: string;
  color: string;
}

// ── Status config ───────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "approved", label: "Approved" },
  { value: "submitted", label: "Submitted" },
] as const;

const STATUS_BADGE: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  submitted: "bg-amber-100 text-amber-700",
};

// ── Page ────────────────────────────────────────────────────────
export default function WhoIsOnLeavePage() {
  const today = format(new Date(), "yyyy-MM-dd");
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [deptFilter, setDeptFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("approved");

  const [entries, setEntries] = useState<OnLeaveEntry[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch filter options on mount
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("profiles").select("department").not("department", "is", null),
      supabase.from("leave_types").select("id, leave_name, color").eq("is_active", true),
    ]).then(([deptRes, typeRes]) => {
      if (!deptRes.error) {
        const depts = [...new Set(deptRes.data.map((r: any) => r.department).filter(Boolean))].sort() as string[];
        setDepartments(depts);
      }
      if (!typeRes.error) setLeaveTypes(typeRes.data as LeaveType[]);
    });
  }, []);

  // Fetch leave requests
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const supabase = createClient();

    try {
      let query = supabase
        .from("leave_requests")
        .select(`
          id, start_date, end_date, days_requested, status, is_half_day, half_day_period,
          profiles!leave_requests_employee_id_fkey(full_name, employee_id, department),
          leave_types(leave_name, color)
        `)
        .in("status", statusFilter ? [statusFilter] : ["approved", "submitted"])
        .lte("start_date", endDate)
        .gte("end_date", startDate);

      if (deptFilter) {
        query = query.eq("profiles!leave_requests_employee_id_fkey.department", deptFilter);
      }
      if (typeFilter) {
        query = query.eq("leave_type_id", typeFilter);
      }

      const { data, error: fetchError } = await query.order("start_date");

      if (fetchError) {
        setError(fetchError.message);
        setEntries([]);
      } else {
        setEntries(
          (data || []).map((r: any) => ({
            id: r.id,
            employee_name: r.profiles?.full_name || "—",
            employee_id: r.profiles?.employee_id || "—",
            department: r.profiles?.department || "—",
            leave_type: r.leave_types?.leave_name || "—",
            leave_type_color: r.leave_types?.color || "gray",
            start_date: r.start_date,
            end_date: r.end_date,
            days_requested: r.days_requested,
            status: r.status,
            is_half_day: r.is_half_day || false,
            half_day_period: r.half_day_period || null,
          })),
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      setEntries([]);
    }
    setLoading(false);
  }, [startDate, endDate, deptFilter, typeFilter, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Stats
  const stats = useMemo(() => {
    const byDept = new Map<string, number>();
    entries.forEach((e) => byDept.set(e.department, (byDept.get(e.department) || 0) + 1));
    return { total: entries.length, byDept };
  }, [entries]);

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="leave-page-header">
        <h2 className="text-2xl font-bold tracking-tight">Who's on Leave</h2>
        <p className="text-muted-foreground">
          Employees on leave from {format(new Date(startDate), "dd MMM yyyy")} to {format(new Date(endDate), "dd MMM yyyy")}
        </p>
      </div>

      {/* ── Filters ── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-4">
          <Field label="From">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </Field>
          <Field label="Department">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </Field>
          <Field label="Leave Type">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">All Types</option>
              {leaveTypes.map((lt) => (
                <option key={lt.id} value={lt.id}>{lt.leave_name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>
          <Button variant="outline" size="sm" className="border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" onClick={() => { setStartDate(today); setEndDate(today); setDeptFilter(""); setTypeFilter(""); setStatusFilter("approved"); }}>
            Reset
          </Button>
        </CardContent>
      </Card>

      {/* ── Stats ── */}
      {!loading && !error && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{stats.total}</span>
          <span className="text-muted-foreground">staff on leave</span>
          <span className="mx-1 text-muted-foreground/40">|</span>
          {Array.from(stats.byDept.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([dept, count]) => (
              <Badge key={dept} variant="outline" className="gap-1">
                {dept}
                <span className="font-semibold">{count}</span>
              </Badge>
            ))}
        </div>
      )}

      {/* ── Content ── */}
      <Card>
        <CardContent className="pt-4">
          {error ? (
            <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="mx-auto mb-3 h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No one is on leave in this period</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Leave Type</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">From</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">To</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Days</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium">{e.employee_name}</p>
                        <p className="text-xs text-muted-foreground">{e.employee_id}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{e.department}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: COLOR_HEX[e.leave_type_color] ?? COLOR_HEX.gray }}
                          />
                          {e.leave_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(e.start_date), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {format(new Date(e.end_date), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">
                        {e.is_half_day ? `${e.days_requested} (${e.half_day_period === "morning" ? "AM" : "PM"})` : e.days_requested}
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={cn("text-xs", STATUS_BADGE[e.status] || "bg-gray-100 text-gray-700")}>
                          {e.status.toUpperCase()}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ── Constants ───────────────────────────────────────────────────
const COLOR_HEX: Record<string, string> = {
  blue: "#3B82F6", red: "#EF4444", green: "#22C55E", purple: "#A855F7",
  amber: "#F59E0B", cyan: "#06B6D4", pink: "#EC4899", indigo: "#6366F1",
  emerald: "#10B981", teal: "#14B8A6", orange: "#F97316", gray: "#9CA3AF",
};
