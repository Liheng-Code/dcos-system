"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Notification {
  id: string;
  record_type: string;
  record_id: string;
  event_type: string;
  title: string;
  message: string | null;
  is_read: boolean;
  created_at: string;
}

export function ProcurementNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = useCallback(() => {
    const supabase = createClient();
    supabase.from("procurement_notifications").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      if (data) setNotifications(data as Notification[]);
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  async function markAllRead() {
    const supabase = createClient();
    const ids = notifications.filter(n => !n.is_read).map(n => n.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("procurement_notifications").update({ is_read: true }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    toast.success("All marked as read");
  }

  async function toggleRead(id: string) {
    const n = notifications.find(x => x.id === id);
    if (!n) return;
    const supabase = createClient();
    await supabase.from("procurement_notifications").update({ is_read: !n.is_read }).eq("id", id);
    setNotifications(prev => prev.map(x => x.id === id ? { ...x, is_read: !x.is_read } : x));
  }

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

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
          {notifications.map(n => (
            <div
              key={n.id}
              className={`rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50 ${n.is_read ? "bg-background" : "bg-muted/20 border-primary/20"}`}
              onClick={() => toggleRead(n.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.is_read ? "" : "font-semibold"}`}>{n.title}</p>
                  {n.message && <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.message}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!n.is_read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  <span className="text-xs text-muted-foreground">{new Date(n.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
