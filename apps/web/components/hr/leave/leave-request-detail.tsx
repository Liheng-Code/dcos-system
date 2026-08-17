"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { format, eachDayOfInterval, parseISO } from "date-fns";
import { insertLeaveTaskAlert } from "@/lib/hr/leave";

interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  is_half_day: boolean;
  half_day_period: string;
  reason: string;
  status: string;
  submission_date: string;
  approver_1_id: string;
  approver_1_status: string;
  approver_1_date: string;
  approver_1_notes: string;
  approver_2_id: string;
  approver_2_status: string;
  approver_2_date: string;
  approver_2_notes: string;
  cancellation_reason: string;
  profiles: { full_name: string; employee_id: string; email: string };
  leave_types: { leave_name: string; is_paid: boolean };
}

interface Comment {
  id: string;
  comment_text: string;
  is_internal: boolean;
  created_at: string;
  profiles: { full_name: string };
}

interface Props {
  requestId: string;
  onClose: () => void;
  onStatusChange: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  draft:                "bg-gray-100 text-gray-700",
  submitted:            "bg-amber-100 text-amber-700",
  approved:             "bg-green-100 text-green-700",
  rejected:             "bg-red-100 text-red-700",
  cancelled:            "bg-gray-100 text-gray-500",
  withdrawn:            "bg-purple-100 text-purple-700",
  pending_cancellation: "bg-orange-100 text-orange-700",
};

export default function LeaveRequestDetail({ requestId, onClose, onStatusChange }: Props) {
  const [request, setRequest] = useState<LeaveRequest | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [showRejectForm, setShowRejectForm] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [newComment, setNewComment] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });

    Promise.all([
      supabase
        .from("leave_requests")
        .select(`
          *,
          profiles!leave_requests_employee_id_fkey(full_name, employee_id, email),
          leave_types(leave_name, is_paid)
        `)
        .eq("id", requestId)
        .single(),
      supabase
        .from("leave_request_comments")
        .select("*, profiles(full_name)")
        .eq("leave_request_id", requestId)
        .order("created_at"),
    ]).then(([reqRes, commRes]) => {
      if (reqRes.data) setRequest(reqRes.data);
      if (commRes.data) setComments(commRes.data);
      setLoading(false);
    });
  }, [requestId]);

  // ── Helpers ───────────────────────────────────────────────
  const isApprover1 = request?.approver_1_id === currentUserId;
  const isApprover2 = request?.approver_2_id === currentUserId;
  const isEmployee = request?.employee_id === currentUserId;
  const canApproveReject =
    (isApprover1 && request?.approver_1_status === "pending") ||
    (isApprover2 && request?.approver_1_status === "approved" && request?.approver_2_status === "pending");

  const queueNotification = async (eventType: string, recipientId: string, subject: string, body: string) => {
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

  // ── Attendance Sync Helpers ──────────────────────────────
  const syncAttendanceForLeave = async (supabase: ReturnType<typeof createClient>, employeeId: string, startDate: string, endDate: string) => {
    const dates = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
    const records = dates.map((d) => ({
      employee_id: employeeId,
      attendance_date: format(d, "yyyy-MM-dd"),
      attendance_type: "LEAVE",
      verified: true,
    }));
    // Upsert to handle partial overlaps safely
    for (const rec of records) {
      await supabase.from("attendance_records").upsert(rec, {
        onConflict: "employee_id, attendance_date",
        ignoreDuplicates: false,
      });
    }
  };

  const rollbackAttendanceForLeave = async (supabase: ReturnType<typeof createClient>, employeeId: string, startDate: string, endDate: string) => {
    const dates = eachDayOfInterval({ start: parseISO(startDate), end: parseISO(endDate) });
    const dateStrings = dates.map((d) => format(d, "yyyy-MM-dd"));
    await supabase
      .from("attendance_records")
      .delete()
      .eq("employee_id", employeeId)
      .in("attendance_date", dateStrings)
      .eq("attendance_type", "LEAVE");
  };

  // ── Approve ───────────────────────────────────────────────
  const handleApprove = async () => {
    if (!request) return;
    setActionLoading(true);
    setActionError(null);
    const supabase = createClient();

    try {
      const now = new Date().toISOString();
      let updates: Record<string, any> = {};
      let isFinalApproval = false;

      if (isApprover1) {
        updates = { approver_1_status: "approved", approver_1_date: now };
        // If no approver_2 configured, this is final
        isFinalApproval = !request.approver_2_id;
        if (!isFinalApproval) {
          // Notify approver_2
          const pendingBody = `${request.profiles.full_name}'s leave request requires your approval.`;
          await queueNotification(
            "request_submitted",
            request.approver_2_id,
            `Leave Request from ${request.profiles.full_name}`,
            pendingBody
          );
          await insertLeaveTaskAlert(supabase, {
            recipientId: request.approver_2_id,
            alertType: "leave_pending_approval",
            title: `Leave Request from ${request.profiles.full_name}`,
            body: pendingBody,
            leaveRequestId: requestId,
          });
        }
      } else if (isApprover2) {
        updates = { approver_2_status: "approved", approver_2_date: now };
        isFinalApproval = true;
      }

      if (isFinalApproval) {
        updates.status = "approved";
        // Deduct balance: carried-over days first, then allocated
        const { data: balance } = await supabase
          .from("leave_balances")
          .select("id, carried_over_days, allocated_days, used_days, remaining_days")
          .eq("employee_id", request.employee_id)
          .eq("leave_type_id", request.leave_type_id)
          .eq("fiscal_year", new Date().getFullYear())
          .single();

        if (balance) {
          let remaining = request.days_requested;
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

          await supabase
            .from("leave_balances")
            .update({
              carried_over_days: Math.max(newCarried, 0),
              allocated_days: Math.max(newAllocated, 0),
              used_days: balance.used_days + request.days_requested,
              remaining_days: Math.max(balance.remaining_days - request.days_requested, 0),
              last_updated: now,
            })
            .eq("id", balance.id);
        }

        // Sync attendance: mark leave dates as LEAVE type
        await syncAttendanceForLeave(supabase, request.employee_id, request.start_date, request.end_date);

        // Notify employee ②
        const approvedBody = `Your ${request.leave_types.leave_name} request for ${request.days_requested} day(s) from ${format(new Date(request.start_date), "dd MMM yyyy")} has been approved.`;
        await queueNotification(
          "request_approved",
          request.employee_id,
          "Your Leave Request Has Been Approved",
          approvedBody
        );
        await insertLeaveTaskAlert(supabase, {
          recipientId: request.employee_id,
          alertType: "leave_request_approved",
          title: "Your Leave Request Has Been Approved",
          body: approvedBody,
          leaveRequestId: requestId,
        });
      }

      await supabase.from("leave_requests").update(updates).eq("id", requestId);
      onStatusChange();
      onClose();
    } catch (err: any) {
      setActionError(err.message || "Failed to approve request.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Reject ────────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectNotes.trim()) { setActionError("Please provide a reason for rejection."); return; }
    if (!request) return;
    setActionLoading(true);
    setActionError(null);
    const supabase = createClient();

    try {
      const now = new Date().toISOString();
      const updates = isApprover1
        ? { status: "rejected", approver_1_status: "rejected", approver_1_date: now, approver_1_notes: rejectNotes }
        : { status: "rejected", approver_2_status: "rejected", approver_2_date: now, approver_2_notes: rejectNotes };

      await supabase.from("leave_requests").update(updates).eq("id", requestId);

      // Notify employee ③
      const rejectedBody = `Your ${request.leave_types.leave_name} request has been rejected. Reason: ${rejectNotes}`;
      await queueNotification(
        "request_rejected",
        request.employee_id,
        "Your Leave Request Has Been Rejected",
        rejectedBody
      );
      await insertLeaveTaskAlert(supabase, {
        recipientId: request.employee_id,
        alertType: "leave_request_rejected",
        title: "Your Leave Request Has Been Rejected",
        body: rejectedBody,
        leaveRequestId: requestId,
      });

      onStatusChange();
      onClose();
    } catch (err: any) {
      setActionError(err.message || "Failed to reject request.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Withdraw (employee withdraws a submitted request) ─────
  const handleWithdraw = async () => {
    if (!request) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/hr/leave/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to withdraw request.");

      onStatusChange();
      onClose();
    } catch (err: any) {
      setActionError(err.message || "Failed to withdraw request.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Request Cancellation (employee cancels an approved leave) ──
  const handleRequestCancellation = async () => {
    if (!cancelReason.trim()) { setActionError("Please provide a reason for cancellation."); return; }
    if (!request) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch("/api/hr/leave/cancel-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, reason: cancelReason }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to request cancellation.");

      onStatusChange();
      onClose();
    } catch (err: any) {
      setActionError(err.message || "Failed to request cancellation.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Approve/Reject cancellation (approver action on pending_cancellation) ──
  const handleCancellationDecision = async (approve: boolean) => {
    if (!request) return;
    setActionLoading(true);
    setActionError(null);
    const supabase = createClient();

    try {
      if (approve) {
        await supabase.from("leave_requests").update({
          status: "withdrawn",
          cancellation_approved_by: currentUserId,
          payroll_reversal_needed: true,
        }).eq("id", requestId);

        // Restore balance (carried-over first)
        const { data: balance } = await supabase
          .from("leave_balances")
          .select("id, carried_over_days, allocated_days, used_days, remaining_days")
          .eq("employee_id", request.employee_id)
          .eq("leave_type_id", request.leave_type_id)
          .eq("fiscal_year", new Date().getFullYear())
          .single();

        if (balance) {
          // Return days to remaining (simplified — full carryover logic would check original deduction)
          await supabase.from("leave_balances").update({
            used_days: Math.max(balance.used_days - request.days_requested, 0),
            remaining_days: balance.remaining_days + request.days_requested,
            last_updated: new Date().toISOString(),
          }).eq("id", balance.id);
        }

        // Rollback attendance records marked as LEAVE for these dates
        await rollbackAttendanceForLeave(supabase, request.employee_id, request.start_date, request.end_date);

        // Notify approver ⑥ + employee
        await queueNotification("cancellation_approved", currentUserId, "Leave Cancellation Processed", "You approved a leave cancellation.");
        await queueNotification("request_withdrawn", request.employee_id, "Your Leave Has Been Cancelled", `Your ${request.leave_types.leave_name} leave cancellation has been approved. ${request.days_requested} day(s) returned to your balance. Attendance records have been rolled back.`);
      } else {
        // Reject cancellation — revert to approved
        await supabase.from("leave_requests").update({ status: "approved" }).eq("id", requestId);
        await queueNotification("cancellation_denied", request.employee_id, "Leave Cancellation Was Denied", `Your request to cancel your ${request.leave_types.leave_name} leave was denied. Your leave remains approved.`);
      }

      onStatusChange();
      onClose();
    } catch (err: any) {
      setActionError(err.message || "Failed to process cancellation decision.");
    } finally {
      setActionLoading(false);
    }
  };

  // ── Add Comment ───────────────────────────────────────────
  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    const supabase = createClient();
    await supabase.from("leave_request_comments").insert({
      leave_request_id: requestId,
      commented_by: currentUserId,
      comment_text: newComment,
      is_internal: isInternal,
    });
    setNewComment("");
    // Refresh comments
    const { data } = await supabase
      .from("leave_request_comments")
      .select("*, profiles(full_name)")
      .eq("leave_request_id", requestId)
      .order("created_at");
    setComments(data || []);
  };

  if (loading || !request) {
    return <div className="p-6 text-center text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">{request.profiles.full_name}</h2>
          <p className="text-sm text-muted-foreground">{request.profiles.employee_id}</p>
        </div>
        <Badge className={`text-xs px-3 py-1 ${STATUS_COLORS[request.status] || "bg-gray-100 text-gray-700"}`}>
          {request.status.replace(/_/g, " ").toUpperCase()}
        </Badge>
      </div>

      {/* Details */}
      <Card>
        <CardContent className="pt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-muted-foreground">Leave Type</p>
              <p className="font-medium">{request.leave_types.leave_name}
                <span className="text-muted-foreground ml-1 text-xs">({request.leave_types.is_paid ? "Paid" : "Unpaid"})</span>
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Days Requested</p>
              <p className="font-medium">
                {request.days_requested} day{request.days_requested !== 1 ? "s" : ""}
                {request.is_half_day && <span className="text-muted-foreground ml-1 text-xs">({request.half_day_period})</span>}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Start Date</p>
              <p className="font-medium">{format(new Date(request.start_date), "dd MMM yyyy")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">End Date</p>
              <p className="font-medium">{format(new Date(request.end_date), "dd MMM yyyy")}</p>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground">Reason</p>
            <p className="mt-1">{request.reason}</p>
          </div>
          {request.cancellation_reason && (
            <div className="p-3 rounded bg-orange-50 border border-orange-200">
              <p className="text-xs font-medium text-orange-700">Cancellation Reason</p>
              <p className="text-sm mt-0.5 text-orange-800">{request.cancellation_reason}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Approval trail */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Approval Trail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between py-1 border-b border-border">
            <span className="text-muted-foreground">Approver 1</span>
            <div className="flex items-center gap-2">
              <span>{request.approver_1_id ? "(assigned)" : "—"}</span>
              {request.approver_1_status && (
                <Badge className={`text-xs ${request.approver_1_status === "approved" ? "bg-green-100 text-green-700" : request.approver_1_status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                  {request.approver_1_status}
                </Badge>
              )}
              {request.approver_1_date && (
                <span className="text-xs text-muted-foreground">{format(new Date(request.approver_1_date), "dd MMM")}</span>
              )}
            </div>
          </div>
          {request.approver_1_notes && (
            <p className="text-xs text-muted-foreground pl-2">Note: {request.approver_1_notes}</p>
          )}
          {request.approver_2_id && (
            <div className="flex items-center justify-between py-1">
              <span className="text-muted-foreground">Approver 2</span>
              <div className="flex items-center gap-2">
                {request.approver_2_status && (
                  <Badge className={`text-xs ${request.approver_2_status === "approved" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                    {request.approver_2_status}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action error */}
      {actionError && (
        <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Approver actions */}
      {canApproveReject && !showRejectForm && (
        <div className="flex gap-3">
          <Button onClick={handleApprove} disabled={actionLoading} className="flex-1 bg-green-600 hover:bg-green-700">
            {actionLoading ? "Processing..." : "Approve"}
          </Button>
          <Button variant="outline" onClick={() => setShowRejectForm(true)} disabled={actionLoading} className="flex-1 text-red-600 border-red-200 hover:bg-red-50">
            Reject
          </Button>
        </div>
      )}

      {canApproveReject && showRejectForm && (
        <div className="space-y-3 p-4 rounded-lg border border-red-200 bg-red-50">
          <p className="text-sm font-medium text-red-700">Reason for rejection</p>
          <textarea
            className="w-full rounded border border-red-200 bg-white px-3 py-2 text-sm resize-none"
            rows={3}
            value={rejectNotes}
            onChange={(e) => setRejectNotes(e.target.value)}
            placeholder="Required — explain why the request is rejected"
          />
          <div className="flex gap-2">
            <Button onClick={handleReject} disabled={actionLoading} className="bg-red-600 hover:bg-red-700 text-sm">
              Confirm Rejection
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowRejectForm(false); setRejectNotes(""); }}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Cancellation approval (approver sees this when status = pending_cancellation) */}
      {request.status === "pending_cancellation" && canApproveReject && (
        <div className="p-4 rounded-lg border border-orange-200 bg-orange-50 space-y-2">
          <p className="text-sm font-medium text-orange-700">Employee requests cancellation of this approved leave</p>
          <div className="flex gap-2">
            <Button onClick={() => handleCancellationDecision(true)} disabled={actionLoading} className="bg-orange-600 hover:bg-orange-700 text-sm">
              Approve Cancellation
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleCancellationDecision(false)} disabled={actionLoading}>
              Deny Cancellation
            </Button>
          </div>
        </div>
      )}

      {/* Employee actions */}
      {isEmployee && request.status === "submitted" && (
        <Button variant="outline" onClick={handleWithdraw} disabled={actionLoading} className="w-full text-purple-600 border-purple-200 hover:bg-purple-50">
          Withdraw Request
        </Button>
      )}

      {isEmployee && request.status === "approved" && !showCancelForm && (
        <Button variant="outline" onClick={() => setShowCancelForm(true)} disabled={actionLoading} className="w-full">
          Request Cancellation
        </Button>
      )}

      {isEmployee && showCancelForm && (
        <div className="space-y-3 p-4 rounded-lg border border-border">
          <p className="text-sm font-medium">Reason for cancellation</p>
          <textarea
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm resize-none"
            rows={2}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Why do you need to cancel this leave?"
          />
          <div className="flex gap-2">
            <Button onClick={handleRequestCancellation} disabled={actionLoading} size="sm">
              Submit Cancellation Request
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setShowCancelForm(false); setCancelReason(""); }}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Comments</h3>
        {comments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className={`text-sm px-3 py-2 rounded-lg border ${c.is_internal ? "bg-yellow-50 border-yellow-200" : "bg-muted/40 border-border"}`}>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span className="font-medium">{c.profiles.full_name}</span>
                  <span>{format(new Date(c.created_at), "dd MMM HH:mm")}</span>
                </div>
                <p>{c.comment_text}</p>
                {c.is_internal && <span className="text-xs text-yellow-700">Internal note</span>}
              </div>
            ))}
          </div>
        )}
        <div className="space-y-2">
          <textarea
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm resize-none"
            rows={2}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} className="h-3 w-3" />
              Internal note (HR only)
            </label>
            <Button size="sm" variant="outline" onClick={handleAddComment} disabled={!newComment.trim()}>
              Add Comment
            </Button>
          </div>
        </div>
      </div>

      <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose}>
        Close
      </Button>
    </div>
  );
}
