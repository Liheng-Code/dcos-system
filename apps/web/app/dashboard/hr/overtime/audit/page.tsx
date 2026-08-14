"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2, Search, Clock, User, CheckCircle2, XCircle,
  Send, FileText, DollarSign, Lock, PlusCircle, ExternalLink,
} from "lucide-react";
import { format } from "date-fns";

interface AuditEvent {
  id: string;
  ot_request_id: string | null;
  action: string;
  performed_by: string;
  details: Record<string, unknown> | null;
  created_at: string;
  performer_name: string;
}

const ACTION_LABELS: Record<string, string> = {
  created:          "Created",
  edited:           "Edited",
  submitted:        "Submitted",
  approved:         "Approved",
  rejected:         "Rejected",
  verified:         "Verified",
  completed:        "Completed",
  paid:             "Paid",
  cancelled:        "Cancelled",
  cost_allocated:   "Cost Allocated",
  payroll_transfer: "Payroll Transfer",
};

const ACTION_ICONS: Record<string, typeof Clock> = {
  created:        PlusCircle,
  submitted:      Send,
  approved:       CheckCircle2,
  rejected:       XCircle,
  verified:       FileText,
  paid:           DollarSign,
  cancelled:      Lock,
  cost_allocated: DollarSign,
};

const ACTION_COLORS: Record<string, string> = {
  created:        "border-blue-200 bg-blue-50 text-blue-700",
  edited:         "border-gray-200 bg-gray-50 text-gray-600",
  submitted:      "border-yellow-200 bg-yellow-50 text-yellow-700",
  approved:       "border-green-200 bg-green-50 text-green-700",
  rejected:       "border-red-200 bg-red-50 text-red-700",
  verified:       "border-purple-200 bg-purple-50 text-purple-700",
  completed:      "border-emerald-200 bg-emerald-50 text-emerald-700",
  paid:           "border-cyan-200 bg-cyan-50 text-cyan-700",
  cancelled:      "border-gray-200 bg-gray-50 text-gray-600",
  cost_allocated: "border-orange-200 bg-orange-50 text-orange-700",
};

export default function OtAuditPage() {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("overtime_audit_log")
      .select(`
        id, ot_request_id, action, performed_by, details, created_at,
        performer:profiles!overtime_audit_log_performed_by_fkey(full_name)
      `)
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) { console.error(error); setLoading(false); return; }
        setEvents(((data ?? []) as any[]).map((e) => ({
          id: e.id,
          ot_request_id: e.ot_request_id,
          action: e.action,
          performed_by: e.performed_by,
          details: e.details,
          created_at: e.created_at,
          performer_name: e.performer?.full_name ?? e.performed_by,
        })));
        setLoading(false);
      });
  }, []);

  const uniqueActions = [...new Set(events.map((e) => e.action))].sort();

  const filtered = events.filter((e) => {
    if (actionFilter && e.action !== actionFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !e.performer_name.toLowerCase().includes(q) &&
        !e.action.toLowerCase().includes(q) &&
        !JSON.stringify(e.details ?? {}).toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">OT Audit Log</h2>
        <p className="text-muted-foreground text-sm">Complete record of all overtime workflow events</p>
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
                className="h-8 w-44 pl-8 text-xs"
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
                ? "No audit events yet. OT workflow transitions will appear here."
                : "No events match your filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs text-muted-foreground">
                    <th className="px-4 py-2.5 text-left font-medium">Date & Time</th>
                    <th className="px-4 py-2.5 text-left font-medium">Performer</th>
                    <th className="px-4 py-2.5 text-left font-medium">Action</th>
                    <th className="px-4 py-2.5 text-left font-medium">Request</th>
                    <th className="px-4 py-2.5 text-left font-medium">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((event) => {
                    const Icon = ACTION_ICONS[event.action] ?? Clock;
                    const colorClass = ACTION_COLORS[event.action] ?? "border-gray-200 bg-gray-50 text-gray-600";
                    const detailStr = event.details ? JSON.stringify(event.details) : null;
                    return (
                      <tr key={event.id} className="hover:bg-muted/20">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-xs text-muted-foreground">{format(new Date(event.created_at), "d MMM yyyy")}</p>
                          <p className="text-xs font-medium">{format(new Date(event.created_at), "HH:mm:ss")}</p>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <p className="text-xs font-medium">{event.performer_name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={cn("text-[10px] flex items-center gap-1 w-fit", colorClass)}>
                            <Icon className="h-3 w-3" />
                            {ACTION_LABELS[event.action] ?? event.action}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {event.ot_request_id ? (
                            <Link
                              href={`/dashboard/hr/overtime/${event.ot_request_id}`}
                              className="flex items-center gap-1 text-xs text-primary hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </Link>
                          ) : (
                            <span className="text-muted-foreground text-xs">{"\u2014"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {detailStr ? (
                            <details className="group">
                              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground list-none flex items-center gap-1">
                                <span className="group-open:rotate-90 inline-block transition-transform">{"\u25B6"}</span>
                                View payload
                              </summary>
                              <pre className="mt-1 text-xs text-muted-foreground bg-muted/50 p-2 rounded max-w-64 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                                {JSON.stringify(event.details, null, 2)}
                              </pre>
                            </details>
                          ) : (
                            <span className="text-muted-foreground text-xs">{"\u2014"}</span>
                          )}
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
