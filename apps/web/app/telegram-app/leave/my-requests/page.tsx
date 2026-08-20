"use client";

import { useCallback, useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertCircle, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMiniApp } from "@/lib/telegram/miniapp-context";

// Shape matches getMyLeaveRequests's return type (apps/web/lib/hr/leave.ts).
interface LeaveRequest {
  id: string;
  leave_name: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  is_half_day: boolean;
  pending_approver_name: string | null;
}

// Mirrors the status -> color convention used in
// apps/web/app/dashboard/hr/leave/my-requests/page.tsx (read-only reference,
// not imported from there).
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
  withdrawn: "bg-purple-100 text-purple-700",
  pending_cancellation: "bg-orange-100 text-orange-700",
};

export default function MyLeaveRequestsPage() {
  const { initData } = useMiniApp();
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch("/api/telegram/miniapp/leave/my-requests", {
        headers: { Authorization: `tma ${initData}` },
      });
      if (!res.ok) throw new Error("Request failed");
      const body = await res.json();
      setRequests(body.requests ?? []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [initData]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    fetchRequests();
  };

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 p-4">
      <h1 className="px-1 text-lg font-semibold">My Requests</h1>

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
            <p className="text-sm text-[var(--tg-hint-color)]">Couldn&apos;t load your leave requests.</p>
            <Button size="sm" onClick={handleRetry}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {!loading && !error && requests && requests.length === 0 && (
        <Card gradient={false}>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <Calendar className="h-8 w-8 text-[var(--tg-hint-color)]" />
            <p className="text-sm text-[var(--tg-hint-color)]">No leave requests yet.</p>
          </CardContent>
        </Card>
      )}

      {!loading && !error && requests && requests.length > 0 && (
        <div className="flex flex-col gap-3">
          {requests.map((req) => (
            <Card key={req.id} gradient={false}>
              <CardContent className="flex flex-col gap-1.5 py-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="text-xs">
                    {req.leave_name}
                  </Badge>
                  <Badge className={cn("text-xs", STATUS_COLORS[req.status] ?? "bg-gray-100 text-gray-600")}>
                    {req.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                  {req.is_half_day && (
                    <Badge variant="outline" className="text-xs text-blue-600">
                      Half-day
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-[var(--tg-hint-color)]">
                  {format(parseISO(req.start_date), "dd MMM")} – {format(parseISO(req.end_date), "dd MMM yyyy")} ·{" "}
                  {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                </p>
                {req.pending_approver_name && (
                  <p className="text-xs text-red-600">Pending approval from {req.pending_approver_name}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
