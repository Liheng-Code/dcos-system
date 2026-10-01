"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { listLeaveNotificationsByRecipientId } from "@/lib/hr/hr-queries";

interface Notification {
  id: string;
  event_type: string;
  body: string | null;
  subject: string | null;
  sent_at: string | null;
  queued_at: string;
  leave_requests: {
    start_date: string;
    end_date: string;
    leave_types: { leave_name: string };
  } | null;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  request_submitted:     { label: "Submitted",           color: "bg-blue-100 text-blue-700" },
  request_approved:      { label: "Approved",            color: "bg-green-100 text-green-700" },
  request_rejected:      { label: "Rejected",            color: "bg-red-100 text-red-700" },
  request_withdrawn:     { label: "Withdrawn",           color: "bg-purple-100 text-purple-700" },
  cancellation_requested:{ label: "Cancel Requested",    color: "bg-orange-100 text-orange-700" },
  cancellation_approved: { label: "Cancel Approved",     color: "bg-green-100 text-green-700" },
  cancellation_denied:   { label: "Cancel Denied",       color: "bg-red-100 text-red-700" },
};

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;

      const { data: rows } = await listLeaveNotificationsByRecipientId(data.user.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setNotifications((rows || []) as any);
      setLoading(false);
    });
  }, []);

  const pending = notifications.filter((n) => !n.sent_at).length;

  return (
    <div className="space-y-6">
      <div className="leave-page-header flex items-center gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">
            Leave activity and status updates
            {pending > 0 && <span className="text-red-600 font-medium"> · {pending} pending</span>}
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loading ? (
            <div className="py-8 text-center text-muted-foreground">Loading...</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center">
              <Bell className="h-12 w-12 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-muted-foreground">No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map((n) => {
                const evt = EVENT_LABELS[n.event_type] || { label: n.event_type, color: "bg-gray-100 text-gray-600" };
                const req = n.leave_requests;
                const isPending = !n.sent_at;
                return (
                  <div key={n.id} className={`flex gap-3 py-4 px-2 ${isPending ? "bg-blue-50/40" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs ${evt.color}`}>{evt.label}</Badge>
                        {req && (
                          <span className="text-xs text-muted-foreground">
                            {(req.leave_types as { leave_name: string })?.leave_name} ·{" "}
                            {format(new Date(req.start_date), "dd MMM")} – {format(new Date(req.end_date), "dd MMM yyyy")}
                          </span>
                        )}
                        {isPending && (
                          <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">Queued</Badge>
                        )}
                      </div>
                      {n.subject && <p className="text-sm font-medium">{n.subject}</p>}
                      {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(n.queued_at), { addSuffix: true })}
                      </p>
                    </div>
                    {isPending && <div className="mt-2 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
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
