"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { AlertCircle, ChevronRight, ClipboardCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useMiniApp } from "@/lib/telegram/miniapp-context";

// Mirrors PendingApprovalRow (apps/web/lib/hr/leave.ts:151-160), returned by
// getPendingApprovalsForApprover and wrapped as `{ approvals: [...] }` by
// apps/web/app/api/telegram/miniapp/leave/pending-approvals/route.ts:18.
// Note: there is no submission-date field on this row — the query behind it
// (leave.ts:166-175) never selects a created_at/submitted_at column, so it
// isn't rendered here.
interface PendingApproval {
  id: string;
  employee_name: string;
  employee_code: string | null;
  leave_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  reason: string | null;
}

export default function LeaveApprovalsPage() {
  const router = useRouter();
  const { initData } = useMiniApp();
  const [approvals, setApprovals] = useState<PendingApproval[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/miniapp/leave/pending-approvals", {
        headers: { Authorization: `tma ${initData}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      setApprovals(body.approvals ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    fetchApprovals();
  };

  // BackButton: returns to the leave menu, matching the Apply screen's
  // wiring (leave-apply-form.tsx:320-332).
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;
    const onBack = () => router.push("/telegram-app/leave");
    webApp.BackButton.show();
    webApp.BackButton.onClick(onBack);
    return () => {
      webApp.BackButton.offClick(onBack);
      webApp.BackButton.hide();
    };
  }, [router]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="px-1 text-lg font-semibold">Pending Approvals</h1>

      {loading && (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      )}

      {!loading && error && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <p className="text-sm text-[var(--tg-hint-color)]">Couldn&apos;t load pending approvals.</p>
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && approvals && approvals.length === 0 && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <ClipboardCheck className="h-8 w-8 text-[var(--tg-hint-color)]" />
            <p className="text-sm text-[var(--tg-hint-color)]">No requests are awaiting your approval.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && approvals && approvals.length > 0 && (
        <div className="flex flex-col gap-3">
          {approvals.map((req) => (
            <button
              key={req.id}
              type="button"
              onClick={() => router.push(`/telegram-app/leave/approvals/${req.id}`)}
              className="text-left"
            >
              <Card gradient={false} className="active:bg-[var(--tg-secondary-bg-color)]">
                <CardContent className="flex items-center gap-2 py-1">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{req.employee_name}</p>
                      <p className="shrink-0 text-xs text-[var(--tg-hint-color)]">
                        {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <p className="text-xs text-[var(--tg-hint-color)]">
                      {req.leave_name} · {format(parseISO(req.start_date), "dd MMM")} –{" "}
                      {format(parseISO(req.end_date), "dd MMM yyyy")}
                    </p>
                    {req.reason && (
                      <p className="mt-0.5 truncate text-xs text-[var(--tg-hint-color)]">{req.reason}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--tg-hint-color)]" />
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
