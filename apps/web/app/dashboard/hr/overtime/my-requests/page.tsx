"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OTRequestDetail } from "@/components/hr/overtime/ot-request-detail";
import { toast } from "sonner";
import { Plus, Clock, FileText, Eye, Send, XCircle, LogOut, Loader2 } from "lucide-react";

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

export default function OTMyRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [confirmWithdrawId, setConfirmWithdrawId] = useState<string | null>(null);
  const [clockActionId, setClockActionId] = useState<string | null>(null);

  const handleWithdraw = async (id: string) => {
    setWithdrawingId(id);
    const res = await fetch(`/api/hr/overtime/${id}/cancel`, { method: "POST" });
    const data = await res.json();
    setWithdrawingId(null);
    setConfirmWithdrawId(null);
    if (!res.ok) {
      alert(data.error || "Failed to withdraw");
      return;
    }
    toast.success("Request withdrawn successfully.");
    fetchRequests();
  };

  const handleClockIn = async (id: string) => {
    setClockActionId(id);
    const res = await fetch(`/api/hr/overtime/${id}/clock-in`, { method: "POST" });
    const data = await res.json();
    setClockActionId(null);
    if (!res.ok) { alert(data.error || "Failed to clock in"); return; }
    toast.success("Clocked in! OT in progress.");
    fetchRequests();
  };

  const handleClockOut = async (id: string) => {
    const actualHours = prompt("Enter actual OT hours (leave blank for planned):");
    if (actualHours !== null && actualHours !== "" && (isNaN(parseFloat(actualHours)) || parseFloat(actualHours) <= 0)) {
      alert("Invalid hours");
      return;
    }
    setClockActionId(id);
    const res = await fetch(`/api/hr/overtime/${id}/clock-out`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actual_hours: actualHours || null }),
    });
    const data = await res.json();
    setClockActionId(null);
    if (!res.ok) { alert(data.error || "Failed to clock out"); return; }
    toast.success("Clocked out! OT completed.");
    fetchRequests();
  };

  const handleSubmitDraft = async (id: string) => {
    setSubmittingId(id);
    const res = await fetch(`/api/hr/overtime/${id}/submit`, { method: "POST" });
    const data = await res.json();
    setSubmittingId(null);
    if (!res.ok) {
      alert(data.error || "Failed to submit");
      return;
    }
    fetchRequests();
  };

  const fetchRequests = () => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      supabase
        .from("overtime_requests")
        .select("*, approvals:overtime_approvals(approver_level, status, label, approver_id, approver:profiles!overtime_approvals_approver_id_fkey(full_name))")
        .eq("employee_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (data) setRequests(data);
          setLoading(false);
        });
    });
  };

  useEffect(() => { fetchRequests() }, []);

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

  const formatDate = (d: string) => new Date(d).toLocaleDateString();

  const getStageText = (req: any): string => {
    if (req.status !== "submitted" || !req.approvals) return "";
    const sorted = [...req.approvals].sort((a: any, b: any) => a.approver_level - b.approver_level);
    for (const a of sorted) {
      if (a.status === "pending") return `Pending: ${a.label}`;
    }
    return "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-bold tracking-tight">My OT Requests</h1>
          <p className="text-muted-foreground">View and track your overtime requests</p>
        </div>
        <Link href="/dashboard/hr/overtime/apply">
          <Button className="gap-2"><Plus className="h-4 w-4" />New Request</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-3 p-6">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded bg-muted" />)}</div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Clock className="h-12 w-12 text-muted-foreground/50" />
              <p className="text-muted-foreground">You haven&apos;t made any OT requests yet</p>
              <Link href="/dashboard/hr/overtime/apply">
                <Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Create First Request</Button>
              </Link>
            </div>
          ) : (
            <div className="divide-y">
              <div className="hidden grid-cols-12 gap-4 px-6 py-3 text-xs font-medium text-muted-foreground md:grid">
                <div className="col-span-3">Date</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1">Hours</div>
                <div className="col-span-3">Reason</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-1" />
              </div>
              {requests.map((req: any) => {
                const stage = getStageText(req);
                return (
                <div key={req.id} className="grid grid-cols-12 gap-4 px-6 py-4 text-sm items-center hover:bg-muted/30 transition-colors">
                  <div className="col-span-3">{formatDate(req.start_time)}</div>
                  <div className="col-span-2 capitalize">{req.ot_type.replace(/_/g, " ")}</div>
                  <div className="col-span-1 font-medium">{req.hours}h</div>
                  <div className="col-span-3 truncate text-muted-foreground">{req.reason}</div>
                  <div className="col-span-2">
                    <div className="flex flex-col gap-0.5">
                      <Badge className={`text-xs w-fit ${STATUS_BADGE[req.status] || ""}`}>
                        {req.status.replace(/_/g, " ")}
                      </Badge>
                      {stage && (
                        <span className="text-[10px] text-amber-600 font-medium">{stage}</span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end gap-1">
                    {(req.status === "draft" || req.status === "needs_revision") && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSubmitDraft(req.id)}
                        disabled={submittingId === req.id}
                        className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        title={req.status === "needs_revision" ? "Revise & Resubmit" : "Submit for Approval"}
                      >
                        {submittingId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    )}
                    {(req.status === "submitted" || req.status === "approved") && (
                      <>
                        {confirmWithdrawId === req.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleWithdraw(req.id)}
                              disabled={withdrawingId === req.id}
                              className="h-7 text-xs px-2"
                            >
                              {withdrawingId === req.id ? "..." : "Confirm"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmWithdrawId(null)}
                              className="h-7 text-xs px-2"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirmWithdrawId(req.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Withdraw request"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </>
                    )}
                    {req.status === "approved" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClockIn(req.id)}
                        disabled={clockActionId === req.id}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Clock in (start OT)"
                      >
                        {clockActionId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      </Button>
                    )}
                    {req.status === "in_progress" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleClockOut(req.id)}
                        disabled={clockActionId === req.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Clock out (end OT)"
                      >
                        {clockActionId === req.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => setSelectedId(req.id)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
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
