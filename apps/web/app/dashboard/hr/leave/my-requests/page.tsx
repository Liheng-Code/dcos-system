"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Plus } from "lucide-react";
import { format } from "date-fns";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import LeaveRequestDetail from "@/components/hr/leave/leave-request-detail";
import { listLeaveRequestsByEmployeeId, listProfilesByIds } from "@/lib/hr/hr-queries";

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  reason: string;
  submission_date: string;
  is_half_day: boolean;
  approver_1_id: string;
  approver_1_status: string;
  approver_2_id: string;
  approver_2_status: string;
  leave_types: { leave_name: string };
}

function getPendingApproverId(req: LeaveRequest): string | null {
  if (req.status !== "submitted" && req.status !== "pending_cancellation") return null;
  if (req.approver_1_status === "pending") return req.approver_1_id;
  if (req.approver_1_status === "approved" && req.approver_2_status === "pending") return req.approver_2_id;
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  draft:                "bg-gray-100 text-gray-600",
  submitted:            "bg-amber-100 text-amber-700",
  approved:             "bg-green-100 text-green-700",
  rejected:             "bg-red-100 text-red-700",
  cancelled:            "bg-gray-100 text-gray-500",
  withdrawn:            "bg-purple-100 text-purple-700",
  pending_cancellation: "bg-orange-100 text-orange-700",
};

function MyRequestsContent() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [approverMap, setApproverMap] = useState<Record<string, { full_name: string; employee_id: string }>>({});
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const typeFilter = searchParams.get("type");

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    const { data } = await listLeaveRequestsByEmployeeId(uid);

    const requests = (data || []) as unknown as LeaveRequest[];
    setRequests(requests);

    // Fetch approver profiles
    const approverIds = new Set<string>();
    for (const r of requests) {
      if (r.approver_1_id) approverIds.add(r.approver_1_id);
      if (r.approver_2_id) approverIds.add(r.approver_2_id);
    }
    if (approverIds.size > 0) {
      const { data: profiles } = await listProfilesByIds([...approverIds]);
      const map: Record<string, { full_name: string; employee_id: string }> = {};
      for (const p of profiles || []) {
        map[p.id] = { full_name: p.full_name, employee_id: p.employee_id };
      }
      setApproverMap(map);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = typeFilter
    ? requests.filter((r) => r.leave_type_id === typeFilter)
    : requests;

  const filterLabel = typeFilter
    ? requests.find((r) => r.leave_type_id === typeFilter)?.leave_types.leave_name
    : null;

  if (detailId) {
    return (
      <div className="max-w-2xl mt-4">
        <LeaveRequestDetail
          requestId={detailId}
          onClose={() => setDetailId(null)}
          onStatusChange={() => { setDetailId(null); fetchData(); }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="leave-page-header flex items-center justify-between">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">My Requests</h2>
          <p className="text-muted-foreground">Your leave request history</p>
        </div>
        <Button onClick={() => router.push("/dashboard/hr/leave/apply")} className="gap-2">
          <Plus className="h-4 w-4" /> New Request
        </Button>
      </div>

      {/* Active filter chip */}
      {typeFilter && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by:</span>
          <Badge variant="outline" className="text-xs">
            {filterLabel ?? "Leave Type"}
          </Badge>
          <Link
            href="/dashboard/hr/leave/my-requests"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear ×
          </Link>
        </div>
      )}

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center">
              <Calendar className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">
                {typeFilter && requests.length > 0
                  ? "No requests found for this leave type."
                  : "No leave requests yet"}
              </p>
              {!typeFilter && (
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => router.push("/dashboard/hr/leave/apply")}
                >
                  Apply for leave
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => setDetailId(req.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {req.leave_types.leave_name}
                      </Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[req.status] || "bg-gray-100 text-gray-600"}`}>
                        {req.status.replace(/_/g, " ").toUpperCase()}
                      </Badge>
                      {req.is_half_day && (
                        <Badge variant="outline" className="text-xs text-blue-600">Half-day</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 truncate">{req.reason}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(req.start_date), "dd MMM")} —{" "}
                      {format(new Date(req.end_date), "dd MMM yyyy")} ·{" "}
                      {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {(() => {
                    const approverId = getPendingApproverId(req);
                    if (!approverId) return null;
                    const approver = approverMap[approverId];
                    if (!approver) return null;
                    return (
                      <div className="ml-4 flex-shrink-0 text-right text-xs leading-relaxed">
                        <p className="text-muted-foreground">Pending Approval from:</p>
                        <p className="font-semibold text-red-600">{approver.full_name}</p>
                        <p className="text-red-400">{approver.employee_id}</p>
                      </div>
                    );
                  })()}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function MyRequestsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">Loading...</div>}>
      <MyRequestsContent />
    </Suspense>
  );
}
