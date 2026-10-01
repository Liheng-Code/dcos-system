"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { listOvertimeNotificationsByRecipientId, updateOvertimeNotificationsByIds } from "@/lib/hr/hr-queries";

interface Notification {
  id: string;
  event_type: string;
  body: string | null;
  subject: string | null;
  sent_at: string | null;
  queued_at: string;
  is_read: boolean;
  overtime_requests: {
    id: string;
    ot_type: string;
    hours: number;
  } | null;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  request_submitted:        { label: "Submitted",      color: "bg-blue-100 text-blue-700" },
  request_approved:         { label: "Approved",       color: "bg-green-100 text-green-700" },
  request_rejected:         { label: "Rejected",       color: "bg-red-100 text-red-700" },
  request_verified:         { label: "Verified",       color: "bg-purple-100 text-purple-700" },
  request_paid:             { label: "Paid",           color: "bg-cyan-100 text-cyan-700" },
  request_cancelled:        { label: "Cancelled",      color: "bg-gray-100 text-gray-700" },
  request_needs_revision:   { label: "Needs Revision", color: "bg-amber-100 text-amber-700" },
};

export default function OtNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;

      const { data: rows } = await listOvertimeNotificationsByRecipientId(data.user.id);

      setNotifications((rows || []) as any);
      setLoading(false);

      // Mark unread notifications as read
      const unreadIds = (rows || [])
        .filter((n: any) => !n.is_read)
        .map((n: any) => n.id);
      if (unreadIds.length > 0) {
        updateOvertimeNotificationsByIds({ is_read: true }, unreadIds)
          .then(() => {});
      }
    });
  }, []);

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="-ml-56">
          <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground">Overtime activity and status updates</p>
          {unread > 0 && (
            <p className="text-xs text-muted-foreground mt-0.5">{unread} unread</p>
          )}
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
                const req = n.overtime_requests;
                const isPending = !n.sent_at;
                return (
                  <div key={n.id} className={`flex gap-3 py-4 px-2 ${!n.is_read ? "bg-blue-50/40 border-l-2 border-l-blue-400" : ""}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Badge className={`text-xs ${evt.color}`}>{evt.label}</Badge>
                        {req && (
                          <span className="text-xs text-muted-foreground">
                            {req.ot_type.replace(/_/g, " ")} · {req.hours}h
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
                      {req && (
                        <Link
                          href={`/dashboard/hr/overtime/${req.id}`}
                          className="text-xs text-primary hover:underline mt-1 inline-block"
                        >
                          View request
                        </Link>
                      )}
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
