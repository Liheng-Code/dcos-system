"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// payroll_notifications has no dedicated is_read column (unlike procurement_notifications /
// overtime_notifications). The only nullable status column is `sent_at` — treated here as the
// read/unread marker: unread while null, "read" once stamped. See
// supabase/migrations/20260618000004_payroll_enhancements.sql (§4).
interface PayrollNotification {
  id: string;
  period_id: string | null;
  event_type: string;
  subject: string | null;
  body: string | null;
  queued_at: string;
  sent_at: string | null;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  period_created:         { label: "Period Created",       color: "bg-gray-100 text-gray-700" },
  payroll_calculated:     { label: "Calculated",            color: "bg-blue-100 text-blue-700" },
  submitted_to_finance:   { label: "Submitted to Finance",  color: "bg-indigo-100 text-indigo-700" },
  submitted_to_director:  { label: "Submitted to Director", color: "bg-violet-100 text-violet-700" },
  director_approved:      { label: "Director Approved",     color: "bg-amber-100 text-amber-700" },
  payroll_locked:         { label: "Locked",                color: "bg-orange-100 text-orange-700" },
  payroll_exported:       { label: "Exported",              color: "bg-cyan-100 text-cyan-700" },
  payroll_paid:           { label: "Paid",                  color: "bg-emerald-100 text-emerald-700" },
  payroll_rejected:       { label: "Rejected",               color: "bg-red-100 text-red-700" },
};

export function PayrollNotificationsList() {
  const [notifications, setNotifications] = useState<PayrollNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { setLoading(false); return; }
      supabase
        .from("payroll_notifications")
        .select("id, period_id, event_type, subject, body, queued_at, sent_at")
        .eq("recipient_id", data.user.id)
        .order("queued_at", { ascending: false })
        .limit(50)
        .then(({ data: rows }) => {
          if (rows) setNotifications(rows as PayrollNotification[]);
          setLoading(false);
        });
    });
  }, []);

  useEffect(() => {
    fetchNotifications();
    // Poll for new payroll notifications every 30s while the page is open.
    const interval = window.setInterval(fetchNotifications, 30000);
    return () => window.clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.sent_at).length;

  async function markAllRead() {
    const supabase = createClient();
    const ids = notifications.filter((n) => !n.sent_at).map((n) => n.id);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from("payroll_notifications").update({ sent_at: now }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    setNotifications((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, sent_at: now } : n)));
    toast.success("All marked as read");
  }

  async function toggleRead(id: string) {
    const n = notifications.find((x) => x.id === id);
    if (!n) return;
    const supabase = createClient();
    const nextSentAt = n.sent_at ? null : new Date().toISOString();
    await supabase.from("payroll_notifications").update({ sent_at: nextSentAt }).eq("id", id);
    setNotifications((prev) => prev.map((x) => (x.id === id ? { ...x, sent_at: nextSentAt } : x)));
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          <span className="font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <Badge className="bg-primary text-primary-foreground">{unreadCount} unread</Badge>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllRead}>
            <CheckCheck className="h-4 w-4 mr-1" /> Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center text-muted-foreground">No notifications yet.</div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const evt = EVENT_LABELS[n.event_type] ?? { label: n.event_type.replace(/_/g, " "), color: "bg-gray-100 text-gray-600" };
            const isRead = !!n.sent_at;
            return (
              <div
                key={n.id}
                className={`rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${isRead ? "bg-background" : "bg-muted/20 border-primary/20"}`}
                onClick={() => toggleRead(n.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge className={`text-xs ${evt.color}`}>{evt.label}</Badge>
                    </div>
                    {n.subject && <p className={`text-sm ${isRead ? "" : "font-semibold"}`}>{n.subject}</p>}
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(n.queued_at), { addSuffix: true })}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
