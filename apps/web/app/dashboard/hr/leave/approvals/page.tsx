"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckSquare } from "lucide-react";
import { format } from "date-fns";
import LeaveRequestDetail from "@/components/hr/leave/leave-request-detail";
import { insertLeaveTaskAlert } from "@/lib/hr/leave";

interface LeaveRequest {
  id: string;
  leave_type_id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  reason: string;
  approver_1_id: string;
  approver_2_id: string;
  approver_1_status: string;
  approver_2_status: string;
  profiles: { full_name: string; employee_id: string };
  leave_types: { leave_name: string };
}

const STATUS_COLORS: Record<string, string> = {
  submitted:            "bg-amber-100 text-amber-700",
  pending_cancellation: "bg-orange-100 text-orange-700",
};

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [rejectFormReqId, setRejectFormReqId] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id || "";
    setCurrentUserId(uid);

    const { data } = await supabase
      .from("leave_requests")
      .select(`
        id, leave_type_id, employee_id, start_date, end_date, days_requested, status, reason,
        approver_1_id, approver_2_id, approver_1_status, approver_2_status,
        profiles!leave_requests_employee_id_fkey(full_name, employee_id),
        leave_types(leave_name)
      `)
      .or(`approver_1_id.eq."${uid}",approver_2_id.eq."${uid}"`)
      .in("status", ["submitted", "pending_cancellation"])
      .order("start_date", { ascending: true });

    const raw = (data || []) as unknown as LeaveRequest[];

    // Cancellation requests: any involved approver can act
    // Sequential chain for new requests: user sees only the step they need to act on
    const filtered = raw.filter((req) => {
      if (req.status === "pending_cancellation") return true;
      if (req.approver_1_id === uid) return req.approver_1_status === "pending";
      if (req.approver_2_id === uid) return req.approver_1_status === "approved" && req.approver_2_status === "pending";
      return false;
    });

    setRequests(filtered);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Inline actions ────────────────────────────────────────

  const queueNotification = async (eventType: string, recipientId: string, subject: string, body: string, requestId: string) => {
    const supabase = createClient();
    const { data: rec } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", recipientId)
      .single();
    await supabase.from("leave_notifications").insert({
      leave_request_id: requestId,
      event_type: eventType,
      recipient_id: recipientId,
      recipient_email: rec?.email,
      recipient_name: rec?.full_name,
      subject,
      body,
    });
  };

  const handleInlineApprove = async (req: LeaveRequest) => {
    setActionLoading(req.id);
    setActionError(null);
    const supabase = createClient();

    try {
      const now = new Date().toISOString();
      const isApprover1 = req.approver_1_id === currentUserId;
      const isApprover2 = req.approver_2_id === currentUserId;
      let updates: Record<string, any> = {};
      let isFinalApproval = false;

      if (isApprover1) {
        updates = { approver_1_status: "approved", approver_1_date: now, approver_1_notes: "" };
        isFinalApproval = !req.approver_2_id;
        if (!isFinalApproval) {
          await queueNotification(
            "request_submitted", req.approver_2_id,
            `Leave Request from ${req.profiles.full_name}`,
            `${req.profiles.full_name}'s leave request requires your approval.`,
            req.id
          );
          await insertLeaveTaskAlert(supabase, {
            recipientId: req.approver_2_id,
            alertType: "leave_pending_approval",
            title: `Leave Request from ${req.profiles.full_name}`,
            body: `${req.profiles.full_name}'s leave request requires your approval.`,
            leaveRequestId: req.id,
          });
        }
      } else if (isApprover2) {
        updates = { approver_2_status: "approved", approver_2_date: now };
        isFinalApproval = true;
      }

      if (isFinalApproval) {
        updates.status = "approved";
        const { data: balance } = await supabase
          .from("leave_balances")
          .select("id, carried_over_days, allocated_days, used_days, remaining_days")
          .eq("employee_id", req.employee_id)
          .eq("leave_type_id", req.leave_type_id)
          .eq("fiscal_year", new Date().getFullYear())
          .single();

        if (balance) {
          let remaining = req.days_requested;
          let newCarried = balance.carried_over_days;
          let newAllocated = balance.allocated_days;

          if (newCarried >= remaining) {
            newCarried -= remaining;
            remaining = 0;
          } else {
            remaining -= newCarried;
            newCarried = 0;
            newAllocated -= remaining;
          }

          await supabase.from("leave_balances").update({
            carried_over_days: Math.max(newCarried, 0),
            allocated_days: Math.max(newAllocated, 0),
            used_days: balance.used_days + req.days_requested,
            remaining_days: Math.max(balance.remaining_days - req.days_requested, 0),
            last_updated: now,
          }).eq("id", balance.id);
        }

        const approvedBody = `Your ${req.leave_types.leave_name} request for ${req.days_requested} day(s) from ${format(new Date(req.start_date), "dd MMM yyyy")} has been approved.`;
        await queueNotification(
          "request_approved", req.employee_id,
          "Your Leave Request Has Been Approved",
          approvedBody,
          req.id
        );
        await insertLeaveTaskAlert(supabase, {
          recipientId: req.employee_id,
          alertType: "leave_request_approved",
          title: "Your Leave Request Has Been Approved",
          body: approvedBody,
          leaveRequestId: req.id,
        });
      }

      await supabase.from("leave_requests").update(updates).eq("id", req.id);
      fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to approve request.");
    } finally {
      setActionLoading(null);
    }
  };

  const handleInlineReject = async (req: LeaveRequest) => {
    if (!rejectNotes.trim()) { setActionError("Please provide a reason for rejection."); return; }
    setActionLoading(req.id);
    setActionError(null);
    const supabase = createClient();

    try {
      const now = new Date().toISOString();
      const isApprover1 = req.approver_1_id === currentUserId;
      const updates = isApprover1
        ? { status: "rejected", approver_1_status: "rejected", approver_1_date: now, approver_1_notes: rejectNotes }
        : { status: "rejected", approver_2_status: "rejected", approver_2_date: now, approver_2_notes: rejectNotes };

      await supabase.from("leave_requests").update(updates).eq("id", req.id);

      const rejectedBody = `Your ${req.leave_types.leave_name} request has been rejected. Reason: ${rejectNotes}`;
      await queueNotification(
        "request_rejected", req.employee_id,
        "Your Leave Request Has Been Rejected",
        rejectedBody,
        req.id
      );
      await insertLeaveTaskAlert(supabase, {
        recipientId: req.employee_id,
        alertType: "leave_request_rejected",
        title: "Your Leave Request Has Been Rejected",
        body: rejectedBody,
        leaveRequestId: req.id,
      });

      setRejectFormReqId(null);
      setRejectNotes("");
      fetchData();
    } catch (err: any) {
      setActionError(err.message || "Failed to reject request.");
    } finally {
      setActionLoading(null);
    }
  };

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
      <div className="leave-page-header">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Approvals</h2>
          <p className="text-muted-foreground">Leave requests awaiting your decision</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center">
              <CheckSquare className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actionError && (
                <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
                  {actionError}
                </div>
              )}
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-border p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{req.profiles.full_name}</p>
                        <span className="text-xs text-muted-foreground">{req.profiles.employee_id}</span>
                        <Badge variant="outline" className="text-xs">{req.leave_types.leave_name}</Badge>
                        <Badge className={`text-xs ${STATUS_COLORS[req.status] || "bg-gray-100 text-gray-600"}`}>
                          {req.status.replace(/_/g, " ").toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{req.reason}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(new Date(req.start_date), "dd MMM")} — {format(new Date(req.end_date), "dd MMM yyyy")} · {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="ml-4 flex-shrink-0" onClick={() => setDetailId(req.id)}>
                      View Details
                    </Button>
                  </div>

                  {/* Inline reject form */}
                  {rejectFormReqId === req.id ? (
                    <div className="mt-3 space-y-2 p-3 rounded-lg border border-red-200 bg-red-50">
                      <p className="text-sm font-medium text-red-700">Reason for rejection</p>
                      <textarea
                        className="w-full rounded border border-red-200 bg-white px-3 py-2 text-sm resize-none"
                        rows={3}
                        value={rejectNotes}
                        onChange={(e) => { setRejectNotes(e.target.value); setActionError(null); }}
                        placeholder="Required — explain why the request is rejected"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleInlineReject(req)}
                          disabled={actionLoading === req.id}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {actionLoading === req.id ? "Rejecting..." : "Confirm Rejection"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setRejectFormReqId(null); setRejectNotes(""); }}
                          disabled={actionLoading === req.id}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleInlineApprove(req); }}
                        disabled={actionLoading === req.id}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {actionLoading === req.id ? "Processing..." : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={(e) => { e.stopPropagation(); setRejectFormReqId(req.id); setRejectNotes(""); setActionError(null); }}
                        disabled={actionLoading === req.id}
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
