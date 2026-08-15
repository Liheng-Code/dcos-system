"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OTRequestDetail } from "@/components/hr/overtime/ot-request-detail";
import { toast } from "sonner";
import { CheckCircle2, XCircle, CheckSquare, AlertCircle } from "lucide-react";

interface ApprovalRow {
  ot_request_id: string;
  approval_id: string;
  status: string;
  approver_level: number;
  overtime_requests: {
    id: string;
    employee_id: string;
    ot_type: string;
    hours: number;
    reason: string;
    status: string;
    start_time: string;
    employee: {
      full_name: string | null;
      employee_id: string | null;
    } | null;
  };
}

type ApprovalRequest = ApprovalRow["overtime_requests"] & {
  ot_request_id: string;
  approval_id: string;
  approval_status: string;
  approver_level: number;
};

export default function OTApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);

  const fetchRequests = () => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      setErrorMessage(null);
      supabase
        .from("overtime_approvals")
        .select(`
          ot_request_id,
          approval_id:id,
          status,
          approver_level,
          overtime_requests!inner(
            id, employee_id, ot_type, hours, reason, status, start_time,
            employee:profiles!overtime_requests_employee_id_fkey(full_name, employee_id)
          )
        `)
        .eq("approver_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            setErrorMessage(error.message);
            setRequests([]);
          }
          if (data) {
            const rows = data as unknown as ApprovalRow[];
            setRequests(rows.map((row) => ({
              ...row.overtime_requests,
              ot_request_id: row.ot_request_id,
              approval_id: row.approval_id,
              approval_status: row.status,
              approver_level: row.approver_level,
            })));
          }
          setLoading(false);
        });
    });
  };

  useEffect(() => { fetchRequests() }, []);

  const handleApprove = async (id: string) => {
    setActionId(id);
    await fetch(`/api/hr/overtime/${id}/approve`, { method: "POST" });
    setActionId(null);
    fetchRequests();
  };

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return;
    setRejectBusy(true);
    const res = await fetch(`/api/hr/overtime/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remarks: rejectReason, revision_type: "reject" }),
    });
    const data = await res.json();
    setRejectBusy(false);
    if (!res.ok) { toast.error(data.error || "Failed to reject"); return; }
    setRejectId(null);
    setRejectReason("");
    toast.success("Request rejected");
    fetchRequests();
  };

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  if (selectedId) {
    return (
      <div className="pt-[5rem]">
        <OTRequestDetail
          requestId={selectedId}
          onClose={() => setSelectedId(null)}
          onStatusChange={fetchRequests}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="-ml-56">
        <h1 className="text-2xl font-bold tracking-tight">OT Approvals</h1>
        <p className="text-muted-foreground">Review and respond to pending overtime requests</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-lg">Pending Approvals</CardTitle></CardHeader>
        <CardContent>
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />)}</div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <CheckSquare className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{req.employee?.full_name || "Unknown"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>{req.ot_type?.replace(/_/g, " ")}</span>
                      <span>&middot;</span>
                      <span>{req.hours}h</span>
                      <span>&middot;</span>
                      <span>{formatDate(req.start_time)}</span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{req.reason}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    {rejectId === req.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          className="w-40 h-8 rounded border border-input bg-background px-2 text-xs"
                          placeholder="Rejection reason..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          autoFocus
                        />
                        <Button size="sm" variant="destructive" onClick={() => handleReject(req.id)} disabled={rejectBusy || !rejectReason.trim()} className="gap-1 text-xs h-8">
                          {rejectBusy ? "..." : "Confirm"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRejectId(null); setRejectReason(""); }} className="h-8 text-xs">
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleApprove(req.id)}
                          disabled={actionId === req.id}
                          className="gap-1"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {actionId === req.id ? "..." : "Approve"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRejectId(req.id)}
                          disabled={actionId === req.id}
                          className="gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        >
                          <XCircle className="h-4 w-4" />Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedId(req.id)}
                          className="gap-1"
                        >
                          Review
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
