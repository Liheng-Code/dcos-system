"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Building2,
  Calendar,
  FileText,
  History,
  Send,
  Loader2,
  Bell,
  Edit,
  LogOut,
} from "lucide-react";
import { listOvertimeNotificationsByRecipientIdAndOtRequestIdAndQueuedAtAfter } from "@/lib/hr/hr-queries";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  verified: "bg-purple-100 text-purple-700",
  paid: "bg-cyan-100 text-cyan-700",
  cancelled: "bg-gray-100 text-gray-700",
  needs_revision: "bg-amber-100 text-amber-700",
};

const APPROVAL_LABELS: Record<number, string> = {
  1: "Manager",
  2: "HR",
};

interface Props {
  requestId: string;
  onClose: () => void;
  onStatusChange: () => void;
}

export function OTRequestDetail({ requestId, onClose, onStatusChange }: Props) {
  const router = useRouter();
  const [request, setRequest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [newNotifications, setNewNotifications] = useState(false);
  const [showRevisionOption, setShowRevisionOption] = useState(false);
  const [revisionType, setRevisionType] = useState<"revision" | "reject">("reject");

  const fetchRequest = useCallback(() => {
    fetch(`/api/hr/overtime/${requestId}`)
      .then((r) => r.json())
      .then((d) => { setRequest(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [requestId]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    fetchRequest();
  }, [requestId, fetchRequest]);

  // ── Phase 1.4: Poll for new notifications ─────────────────
  useEffect(() => {
    const supabase = createClient();
    let lastCheck = new Date().toISOString();
    const interval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: rows } = await listOvertimeNotificationsByRecipientIdAndOtRequestIdAndQueuedAtAfter(user.id, requestId, lastCheck);
      if (rows && rows.length > 0) {
        setNewNotifications(true);
        lastCheck = new Date().toISOString();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [requestId]);

  const canApprove = () => {
    if (!request || !userId) return false;
    if (request.status !== "submitted") return false;
    return request.approvals?.some((a: any) => a.approver_id === userId && a.status === "pending");
  };

  const handleApprove = async () => {
    setAction("approve");
    setError(null);
    const res = await fetch(`/api/hr/overtime/${requestId}/approve`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    onStatusChange();
    fetchRequest();
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { setError("Rejection reason is required"); return; }
    setAction("reject");
    setError(null);
    const res = await fetch(`/api/hr/overtime/${requestId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        remarks: rejectReason,
        revision_type: revisionType,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    setShowRejectForm(false);
    setRejectReason("");
    setShowRevisionOption(false);
    setRevisionType("reject");
    onStatusChange();
    fetchRequest();
    if (revisionType === "revision") {
      toast.success("Request sent back for revision.");
    } else {
      toast.success("Request has been rejected.");
    }
  };

  const handleSubmitDraft = async () => {
    setAction("submit");
    setError(null);
    const res = await fetch(`/api/hr/overtime/${requestId}/submit`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    onStatusChange();
    fetchRequest();
  };

  const handleCancel = async () => {
    setAction("cancel");
    setError(null);
    const res = await fetch(`/api/hr/overtime/${requestId}/cancel`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    toast.success("Request withdrawn successfully.");
    onStatusChange();
    fetchRequest();
  };

  const handleClockIn = async () => {
    setAction("clock_in");
    setError(null);
    const res = await fetch(`/api/hr/overtime/${requestId}/clock-in`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    toast.success("Clocked in! Overtime is now in progress.");
    onStatusChange();
    fetchRequest();
  };

  const handleClockOut = async () => {
    setAction("clock_out");
    setError(null);
    const actualHours = prompt("Enter actual OT hours worked (leave blank to use planned hours):");
    if (actualHours !== null && actualHours !== "" && (isNaN(parseFloat(actualHours)) || parseFloat(actualHours) <= 0)) {
      setError("Please enter a valid number of hours");
      setAction(null);
      return;
    }
    const res = await fetch(`/api/hr/overtime/${requestId}/clock-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual_hours: actualHours || null }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    toast.success("Clocked out! Overtime completed.");
    onStatusChange();
    fetchRequest();
  };

  const handleVerify = async () => {
    setAction("verify");
    setError(null);
    const res = await fetch(`/api/hr/overtime/${requestId}/verify`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) { setError(data.error); setAction(null); return; }
    setAction(null);
    onStatusChange();
    fetchRequest();
  };

  const isEmployeeOwner = request?.employee_id === userId;

  if (loading) {
    return <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  if (!request) {
    return <div className="py-8 text-center text-muted-foreground">Request not found</div>;
  }

  const formatDate = (d: string) => new Date(d).toLocaleString();

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      {newNotifications && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          <Bell className="h-4 w-4 shrink-0" />
          New updates available
          <Button variant="ghost" size="sm" className="ml-auto h-auto px-2 py-1 text-xs" onClick={() => { setNewNotifications(false); fetchRequest(); }}>
            Refresh
          </Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg">OT Request Detail</CardTitle>
            <Badge className={STATUS_BADGE[request.status]}>{request.status.replace(/_/g, " ")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Employee</p>
              <p className="text-sm font-medium">{request.employee?.full_name || "Unknown"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Department</p>
              <p className="text-sm font-medium">{request.employee?.department || request.department || "-"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">OT Type</p>
              <p className="text-sm font-medium">{request.ot_type?.replace(/_/g, " ")}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Category</p>
              <p className="text-sm font-medium capitalize">{request.category}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Start</p>
              <p className="text-sm font-medium">{formatDate(request.start_time)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">End</p>
              <p className="text-sm font-medium">{formatDate(request.end_time)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Total Hours</p>
              <p className="text-sm font-medium">{request.hours}h</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Submitted</p>
              <p className="text-sm font-medium">{request.submitted_at ? formatDate(request.submitted_at) : "-"}</p>
            </div>
          </div>

          {request.project && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Project</p>
              <p className="text-sm font-medium">{request.project.project_name} ({request.project.project_code})</p>
            </div>
          )}

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Reason</p>
            <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{request.reason}</p>
          </div>

          {request.remarks && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Remarks</p>
              <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-sm">{request.remarks}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-lg">Approval Timeline</CardTitle></CardHeader>
        <CardContent>
          {request.approvals && request.approvals.length > 0 ? (
            <div className="relative">
              {request.approvals
                .sort((a: any, b: any) => a.approver_level - b.approver_level)
                .map((a: any, idx: number) => {
                  const isCompleted = a.status === "approved";
                  const isRejected = a.status === "rejected" || a.status === "cancelled";
                  const isCurrent = a.status === "pending" && (
                    idx === 0 ||
                    request.approvals
                      .filter((prev: any) => prev.approver_level < a.approver_level)
                      .every((prev: any) => prev.status === "approved")
                  );
                  const isLast = idx === request.approvals.length - 1;
                  const isUserApprover = userId === a.approver_id;
                  return (
                    <div key={a.id} className="relative flex gap-4 pb-6 last:pb-0">
                      {/* Timeline connector */}
                      <div className="flex flex-col items-center">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                          isCompleted
                            ? "border-green-500 bg-green-50"
                            : isRejected
                            ? "border-red-400 bg-red-50"
                            : isCurrent
                            ? "border-amber-500 bg-amber-50"
                            : "border-gray-300 bg-gray-50"
                        }`}>
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : isRejected ? (
                            <XCircle className="h-4 w-4 text-red-500" />
                          ) : isCurrent ? (
                            <Clock className="h-4 w-4 text-amber-600" />
                          ) : (
                            <span className="text-xs font-medium text-gray-400">{a.approver_level}</span>
                          )}
                        </div>
                        {!isLast && (
                          <div className={`mt-1 w-0.5 flex-1 ${
                            isCompleted ? "bg-green-300" : "bg-gray-200"
                          }`} />
                        )}
                      </div>
                      {/* Content */}
                      <div className={`flex-1 min-w-0 pb-1 ${isCurrent ? "bg-amber-50/60 -mx-2 px-2 rounded-lg" : ""}`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">
                            {a.approver?.full_name || "Unknown"}
                            {isUserApprover && <span className="ml-1.5 text-[10px] text-primary font-semibold">(You)</span>}
                          </p>
                          <Badge className={`text-xs shrink-0 ${
                            isCompleted
                              ? "bg-green-100 text-green-700"
                              : isRejected
                              ? "bg-red-100 text-red-700"
                              : isCurrent
                              ? "bg-amber-100 text-amber-700 border border-amber-300"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {a.status === "cancelled" ? "cancelled" : isCurrent ? "Pending your approval" : a.status.replace(/_/g, " ")}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{a.label} (Level {a.approver_level})</p>
                        {a.remarks && (
                          <p className="mt-1 text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1">
                            &ldquo;{a.remarks}&rdquo;
                          </p>
                        )}
                        {a.decided_at && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDate(a.decided_at)}</p>
                        )}
                        {isCurrent && (
                          <p className="mt-0.5 text-xs font-medium text-amber-700">
                            Waiting for {a.label}&rsquo;s approval
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No approvals created yet</p>
          )}
        </CardContent>
      </Card>

      {canApprove() && (
        <Card>
          <CardContent className="p-4">
            {showRejectForm ? (
              <div className="space-y-3">
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="revisionType"
                      checked={revisionType === "reject"}
                      onChange={() => setRevisionType("reject")}
                    />
                    <span className="text-red-600 font-medium">Reject (terminal)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="revisionType"
                      checked={revisionType === "revision"}
                      onChange={() => setRevisionType("revision")}
                    />
                    <span className="text-amber-600 font-medium">Request Revision</span>
                  </label>
                </div>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-y"
                  placeholder="Reason..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button variant="destructive" onClick={handleReject} disabled={action === "reject"} size="sm">
                    {action === "reject" ? "Processing..." : (revisionType === "revision" ? "Request Revision" : "Confirm Rejection")}
                  </Button>
                  <Button variant="outline" onClick={() => { setShowRejectForm(false); setRejectReason(""); }} size="sm">
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button onClick={handleApprove} disabled={action === "approve"} className="gap-2">
                  <CheckCircle2 className="h-4 w-4" />{action === "approve" ? "Approving..." : "Approve"}
                </Button>
                <Button variant="outline" onClick={() => setShowRejectForm(true)} disabled={action !== null} className="gap-2">
                  <XCircle className="h-4 w-4" />Reject / Revise
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(request.status === "draft" || request.status === "needs_revision") && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              {request.status === "needs_revision" && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">This request needs revision</p>
                  <p className="mt-1 text-amber-700">Please review the feedback, make changes, and resubmit.</p>
                </div>
              )}
              <Button onClick={handleSubmitDraft} disabled={action === "submit"} className="gap-2">
                {action === "submit" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {request.status === "needs_revision" ? "Revise & Resubmit" : "Submit for Approval"}
              </Button>
              {request.status === "needs_revision" && (
                <Button
                  variant="outline"
                  onClick={() => router.push(`/dashboard/hr/overtime/edit/${requestId}`)}
                  className="gap-2 ml-2"
                >
                  <Edit className="h-4 w-4" />Edit Request
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {(request.status === "submitted" || request.status === "approved") && isEmployeeOwner && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCancel}
                disabled={action === "cancel"}
                variant="outline"
                className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <XCircle className="h-4 w-4" />{action === "cancel" ? "Withdrawing..." : "Withdraw Request"}
              </Button>
              <p className="text-xs text-muted-foreground">Cancels all pending approvals and notifies approvers.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {request.status === "approved" && isEmployeeOwner && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleClockIn}
                  disabled={action === "clock_in"}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <LogOut className="h-4 w-4" />{action === "clock_in" ? "Clocking In..." : "Clock In (Start OT)"}
                </Button>
                <p className="text-xs text-muted-foreground">Mark the start of your overtime.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {request.status === "approved" && !isEmployeeOwner && (
        <Card>
          <CardContent className="p-4">
            <Button onClick={handleVerify} disabled={action === "verify"} variant="secondary" className="gap-2">
              <CheckCircle2 className="h-4 w-4" />{action === "verify" ? "Verifying..." : "Mark as Verified"}
            </Button>
          </CardContent>
        </Card>
      )}

      {request.status === "in_progress" && isEmployeeOwner && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleClockOut}
                disabled={action === "clock_out"}
                variant="destructive"
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />{action === "clock_out" ? "Clocking Out..." : "Clock Out (End OT)"}
              </Button>
              <p className="text-xs text-muted-foreground">You will be prompted to enter actual hours.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {request.audit_log && request.audit_log.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Audit Trail</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {request.audit_log.map((log: any, i: number) => (
                <div key={log.id ?? i} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
                  <History className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs capitalize">{log.action.replace(/_/g, " ")}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    {log.performer && (
                      <p className="text-xs text-muted-foreground mt-1">
                        by <span className="font-medium text-foreground">{log.performer.full_name}</span>
                      </p>
                    )}
                    {log.details && Object.keys(log.details).length > 0 && (
                      <details className="mt-1">
                        <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
                          View details
                        </summary>
                        <pre className="mt-1 text-[11px] text-muted-foreground bg-muted/50 p-2 rounded overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Button variant="ghost" onClick={onClose} className="w-full">Close</Button>
    </div>
  );
}
