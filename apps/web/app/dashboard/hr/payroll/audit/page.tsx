"use client";

import { useEffect, useState } from "react";
import { listPayrollAuditLog } from "@/lib/hr/hr-queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, Search, Clock, User, FileText, Lock, Send, PlayCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";

interface AuditEvent {
  id: string;
  period_id: string | null;
  user_id: string;
  role_at_time: string | null;
  action: string;
  record_type: string;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  created_at: string;
  user_name: string;
  period_label: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  payroll_calculated:           "Payroll Calculated",
  submitted_for_hr_review:      "Submitted for HR Review",
  submitted_to_finance:         "Submitted to Finance",
  submitted_to_director:        "Submitted to Director",
  director_approved:            "Director Approved",
  payroll_locked:               "Payroll Locked",
  payroll_exported:             "Exported to Finance",
  payroll_marked_paid:          "Marked as Paid",
  payroll_rejected:             "Payroll Rejected",
  salary_structure_changed:     "Salary Structure Changed",
  employee_tax_profile_changed: "Tax Profile Updated",
  employee_nssf_profile_changed:"NSSF Profile Updated",
};

const ACTION_ICONS: Record<string, typeof Clock> = {
  payroll_calculated:      PlayCircle,
  submitted_for_hr_review: Send,
  submitted_to_finance:    Send,
  submitted_to_director:   Send,
  director_approved:       CheckCircle2,
  payroll_locked:          Lock,
  payroll_exported:        FileText,
  payroll_marked_paid:     CheckCircle2,
};

const ACTION_COLORS: Record<string, string> = {
  payroll_calculated:      "border-blue-200 bg-blue-50 text-blue-700",
  submitted_for_hr_review: "border-indigo-200 bg-indigo-50 text-indigo-700",
  submitted_to_finance:    "border-violet-200 bg-violet-50 text-violet-700",
  submitted_to_director:   "border-amber-200 bg-amber-50 text-amber-700",
  director_approved:       "border-emerald-200 bg-emerald-50 text-emerald-700",
  payroll_locked:          "border-orange-200 bg-orange-50 text-orange-700",
  payroll_exported:        "border-cyan-200 bg-cyan-50 text-cyan-700",
  payroll_marked_paid:     "border-green-200 bg-green-50 text-green-700",
  payroll_rejected:        "border-red-200 bg-red-50 text-red-700",
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PayrollAuditPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    listPayrollAuditLog()
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setEvents(((data ?? []) as any[]).map((e) => ({
          id: e.id,
          period_id: e.period_id,
          user_id: e.user_id,
          role_at_time: e.role_at_time,
          action: e.action,
          record_type: e.record_type,
          old_value: e.old_value,
          new_value: e.new_value,
          reason: e.reason,
          ip_address: e.ip_address,
          created_at: e.created_at,
          user_name: e.profiles?.full_name ?? e.user_id,
          period_label: e.payroll_periods?.label ?? (e.payroll_periods ? `${e.payroll_periods.period_year}-${String(e.payroll_periods.period_month).padStart(2, "0")}` : null),
        })));
        setLoading(false);
      });
  }, []);

  const uniqueActions = [...new Set(events.map((e) => e.action))].sort();

  const filtered = events.filter((e) => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!e.user_name.toLowerCase().includes(q) && !(e.period_label ?? "").toLowerCase().includes(q) && !e.action.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">Payroll Audit Log</h2>
        <p className="text-muted-foreground text-sm">Complete record of all payroll workflow events</p>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold">Audit Timeline</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-8 w-52 pl-8 text-xs"
              />
            </div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">All actions</option>
              {uniqueActions.map((a) => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
            </select>
            {(search || actionFilter) && (
              <button onClick={() => { setSearch(""); setActionFilter(""); }} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Clear</button>
            )}
            <span className="shrink-0 text-xs text-muted-foreground">
              {filtered.length} of {events.length}
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {events.length === 0
                ? "No audit events yet. Workflow transitions will appear here once payroll runs are processed."
                : "No events match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Date & Time</th>
                    <th className="px-4 py-2.5 text-left font-medium">User</th>
                    <th className="px-4 py-2.5 text-left font-medium">Action</th>
                    <th className="px-4 py-2.5 text-left font-medium">Period</th>
                    <th className="px-4 py-2.5 text-left font-medium">Change</th>
                    <th className="px-4 py-2.5 text-left font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((event) => {
                    const Icon = ACTION_ICONS[event.action] ?? Clock;
                    const colorClass = ACTION_COLORS[event.action] ?? "border-gray-200 bg-gray-50 text-gray-600";
                    const oldStatus = event.old_value?.status as string | undefined;
                    const newStatus = event.new_value?.status as string | undefined;
                    return (
                      <tr key={event.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs text-muted-foreground">{format(new Date(event.created_at), "d MMM yyyy")}</p>
                          <p className="text-xs font-medium">{format(new Date(event.created_at), "HH:mm:ss")}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{event.user_name}</p>
                              {event.role_at_time && <p className="text-[10px] text-muted-foreground">{event.role_at_time}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-[10px] flex items-center gap-1 w-fit", colorClass)}>
                            <Icon className="h-3 w-3" />
                            {ACTION_LABELS[event.action] ?? event.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {event.period_label ?? "—"}
                        </td>
                        <td className="px-4 py-3">
                          {oldStatus && newStatus ? (
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-muted-foreground capitalize">{oldStatus.replace(/_/g, " ")}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium capitalize">{newStatus.replace(/_/g, " ")}</span>
                            </div>
                          ) : event.new_value ? (
                            <p className="text-xs text-muted-foreground truncate max-w-32">
                              {JSON.stringify(event.new_value).slice(0, 60)}…
                            </p>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {event.reason ?? "—"}
                        </td>
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
