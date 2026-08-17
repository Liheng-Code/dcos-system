"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckSquare, Loader2, XCircle, ChevronRight } from "lucide-react";
import { format } from "date-fns";

interface PendingPeriod {
  id: string;
  label: string | null;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
  status: string;
  rejection_comment: string | null;
  employee_count: number;
  total_net: number;
}

interface AdvanceResponse {
  success: boolean;
  status?: string;
  message?: string;
}

const AWAITING_STATUSES = ["calculated", "hr_reviewed", "finance_verified"];

const STAGE_CONFIG: Record<string, { stageName: string; toStatus: string; action: string; badgeClass: string }> = {
  calculated:        { stageName: "Awaiting HR Review",       toStatus: "hr_reviewed",       action: "submitted_for_hr_review", badgeClass: "bg-blue-100 text-blue-700" },
  hr_reviewed:       { stageName: "Awaiting Finance Verify",  toStatus: "finance_verified",  action: "submitted_to_finance",    badgeClass: "bg-indigo-100 text-indigo-700" },
  finance_verified:  { stageName: "Awaiting Director Approval", toStatus: "director_approved", action: "submitted_to_director", badgeClass: "bg-violet-100 text-violet-700" },
};

function fmt(n: number) {
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function periodLabel(p: PendingPeriod) {
  return p.label ?? `${p.period_year}-${String(p.period_month).padStart(2, "0")}`;
}

export default function PayrollApprovalsPage() {
  const [periods, setPeriods] = useState<PendingPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectFormId, setRejectFormId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();

    const { data: periodRows } = await supabase
      .from("payroll_periods")
      .select("id, label, period_year, period_month, start_date, end_date, status, rejection_comment")
      .in("status", AWAITING_STATUSES)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    const periodsRaw = (periodRows ?? []) as Omit<PendingPeriod, "employee_count" | "total_net">[];

    if (periodsRaw.length === 0) {
      setPeriods([]);
      setLoading(false);
      return;
    }

    const periodIds = periodsRaw.map((p) => p.id);
    const { data: entryRows } = await supabase
      .from("payroll_entries")
      .select("period_id, net_salary")
      .in("period_id", periodIds);

    const agg: Record<string, { count: number; net: number }> = {};
    for (const e of (entryRows ?? []) as { period_id: string; net_salary: number }[]) {
      if (!agg[e.period_id]) agg[e.period_id] = { count: 0, net: 0 };
      agg[e.period_id].count += 1;
      agg[e.period_id].net += Number(e.net_salary) || 0;
    }

    setPeriods(
      periodsRaw.map((p) => ({
        ...p,
        employee_count: agg[p.id]?.count ?? 0,
        total_net: agg[p.id]?.net ?? 0,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void fetchData(); }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchData]);

  async function callAdvance(period: PendingPeriod, toStatus: string, action: string, comment?: string): Promise<boolean> {
    setActionLoading(period.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/hr/payroll/${period.id}/advance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, action, ...(comment ? { comment } : {}) }),
      });
      const body = await res.json().catch(() => ({ success: false, message: "Unexpected server response" })) as AdvanceResponse;
      if (!res.ok || !body.success) {
        const message = body.message || "Failed to update payroll status";
        setActionError(message);
        toast.error(message);
        return false;
      }
      toast.success(`Payroll ${body.status?.replace(/_/g, " ")}`);
      return true;
    } finally {
      setActionLoading(null);
    }
  }

  async function handleApprove(period: PendingPeriod) {
    const stage = STAGE_CONFIG[period.status];
    if (!stage) return;
    const ok = await callAdvance(period, stage.toStatus, stage.action);
    if (ok) fetchData();
  }

  async function handleReject(period: PendingPeriod) {
    if (!rejectComment.trim()) { setActionError("Please provide a reason for rejection."); return; }
    const ok = await callAdvance(period, "calculated", "payroll_rejected", rejectComment.trim());
    if (ok) {
      setRejectFormId(null);
      setRejectComment("");
      fetchData();
    }
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h2 className="text-2xl font-bold tracking-tight">Payroll Approvals</h2>
        <p className="text-muted-foreground">Payroll periods awaiting HR review, finance verification, or director approval</p>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading...
            </div>
          ) : periods.length === 0 ? (
            <div className="py-10 text-center">
              <CheckSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No payroll periods awaiting approval</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actionError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
                  {actionError}
                </div>
              )}
              {periods.map((period) => {
                const stage = STAGE_CONFIG[period.status];
                return (
                  <div key={period.id} className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{periodLabel(period)}</p>
                          {stage && (
                            <Badge className={cn("text-xs", stage.badgeClass)}>{stage.stageName}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {format(new Date(`${period.start_date}T00:00:00`), "d MMM")} – {format(new Date(`${period.end_date}T00:00:00`), "d MMM yyyy")}
                          {" · "}
                          {period.employee_count} employee{period.employee_count !== 1 ? "s" : ""}
                          {" · "}
                          Net Total: <span className="font-semibold text-emerald-600">{fmt(period.total_net)}</span>
                        </p>
                        {period.rejection_comment && period.status === "calculated" && (
                          <p className="text-xs text-red-600 mt-1">Previously rejected: {period.rejection_comment}</p>
                        )}
                      </div>
                      <Link href={`/dashboard/hr/payroll/run?period=${period.id}`} className="text-muted-foreground hover:text-primary transition-colors shrink-0">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </div>

                    {rejectFormId === period.id ? (
                      <div className="mt-3 space-y-2 p-3 rounded-lg border border-red-200 bg-red-50">
                        <p className="text-sm font-medium text-red-700">Reason for rejection</p>
                        <textarea
                          className="w-full rounded border border-red-200 bg-white px-3 py-2 text-sm resize-none"
                          rows={3}
                          value={rejectComment}
                          onChange={(e) => { setRejectComment(e.target.value); setActionError(null); }}
                          placeholder="Required — explain why the payroll is sent back to Calculated"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleReject(period)}
                            disabled={actionLoading === period.id}
                            className="bg-red-600 hover:bg-red-700 gap-1.5"
                          >
                            {actionLoading === period.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                            Confirm Rejection
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => { setRejectFormId(null); setRejectComment(""); setActionError(null); }}
                            disabled={actionLoading === period.id}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(period)}
                          disabled={actionLoading === period.id}
                          className="bg-green-600 hover:bg-green-700 gap-1.5"
                        >
                          {actionLoading === period.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckSquare className="h-3.5 w-3.5" />}
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setRejectFormId(period.id); setRejectComment(""); setActionError(null); }}
                          disabled={actionLoading === period.id}
                          className="text-red-600 border-red-200 hover:bg-red-50"
                        >
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
