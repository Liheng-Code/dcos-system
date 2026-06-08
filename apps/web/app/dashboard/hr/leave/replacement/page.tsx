"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Plus } from "lucide-react";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import LeaveRequestDetail from "@/components/hr/leave/leave-request-detail";

interface LeaveRequest {
  id: string;
  start_date: string;
  end_date: string;
  days_requested: number;
  status: string;
  reason: string;
  profiles: { full_name: string };
}

const STATUS_COLORS: Record<string, string> = {
  submitted: "bg-amber-100 text-amber-700",
  approved:  "bg-green-100 text-green-700",
  rejected:  "bg-red-100 text-red-700",
  withdrawn: "bg-purple-100 text-purple-700",
};

export default function ReplacementLeavePage() {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const router = useRouter();

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;

    // Get replacement leave type IDs
    const { data: replacementTypes } = await supabase
      .from("leave_types")
      .select("id")
      .eq("is_replacement_leave", true);

    if (!replacementTypes?.length) { setLoading(false); return; }
    const typeIds = replacementTypes.map((t) => t.id);

    const { data } = await supabase
      .from("leave_requests")
      .select("id, start_date, end_date, days_requested, status, reason, profiles(full_name)")
      .eq("employee_id", uid)
      .in("leave_type_id", typeIds)
      .order("start_date", { ascending: false });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setRequests((data || []) as any);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <div className="flex items-center gap-3">
          <RefreshCw className="h-6 w-6 text-muted-foreground" />
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Replacement Leave</h2>
            <p className="text-muted-foreground">Compensation for working on rest days or public holidays</p>
          </div>
        </div>
        <Button onClick={() => router.push("/dashboard/hr/leave/apply")} className="gap-2">
          <Plus className="h-4 w-4" /> Apply
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : requests.length === 0 ? (
            <div className="py-10 text-center">
              <RefreshCw className="h-10 w-10 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No replacement leave requests found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between rounded-lg border border-border p-4 hover:bg-muted/30 cursor-pointer"
                  onClick={() => setDetailId(req.id)}
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-xs ${STATUS_COLORS[req.status] || "bg-gray-100 text-gray-600"}`}>
                        {req.status.toUpperCase()}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{req.reason}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {format(new Date(req.start_date), "dd MMM")} — {format(new Date(req.end_date), "dd MMM yyyy")} · {req.days_requested} day{req.days_requested !== 1 ? "s" : ""}
                    </p>
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
