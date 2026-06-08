"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { WbsTaskAlertRecord } from "@/components/wbs/wbs-types";

interface TaskAlertsContextValue {
  alerts: WbsTaskAlertRecord[];
  unreadCount: number;
  unreadTaskIds: Set<string>;
  loading: boolean;
  refresh: () => Promise<void>;
  markRead: (alertId: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  markTaskRead: (taskId: string) => Promise<void>;
}

const TaskAlertsContext = createContext<TaskAlertsContextValue | null>(null);

let warnedMissingTaskAlertsTable = false;

function isMissingTaskAlertsTable(message: string) {
  return message.includes("Could not find the table 'public.task_alerts' in the schema cache") || message.toLowerCase().includes("schema cache");
}

export function TaskAlertsProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => createClient(), []);
  const [alerts, setAlerts] = useState<WbsTaskAlertRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const unreadTaskIds = useMemo(
    () => new Set(alerts.filter((a) => !a.read_at).map((a) => a.wbs_task_id)),
    [alerts],
  );

  const refresh = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    const currentUserId = authData.user?.id ?? null;
    setUserId(currentUserId);
    if (!currentUserId) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("task_alerts")
      .select("*")
      .eq("recipient_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(20);

    const { count } = await supabase
      .from("task_alerts")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", currentUserId)
      .is("read_at", null);

    if (error) {
      if (isMissingTaskAlertsTable(error.message)) {
        if (!warnedMissingTaskAlertsTable) {
          warnedMissingTaskAlertsTable = true;
          console.warn("Task alerts table is not available yet. Skipping alert loading until the migration is applied.");
        }
        setAlerts([]);
        setUnreadCount(0);
      } else {
        console.error("Task alerts load failed:", error.message);
      }
    } else if (data) {
      setAlerts(data as WbsTaskAlertRecord[]);
      setUnreadCount(count ?? 0);
    }
    setLoading(false);
  }, [supabase]);

  const markRead = useCallback(async (alertId: string) => {
    if (!userId) return;
    const readAt = new Date().toISOString();
    setAlerts((prev) => prev.map((alert) => (alert.id === alertId ? { ...alert, read_at: readAt } : alert)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    await supabase.from("task_alerts").update({ read_at: readAt }).eq("id", alertId).eq("recipient_id", userId);
  }, [supabase, userId]);

  const markAllRead = useCallback(async () => {
    if (!userId || unreadCount === 0) return;
    const readAt = new Date().toISOString();
    setAlerts((prev) => prev.map((alert) => (alert.read_at ? alert : { ...alert, read_at: readAt })));
    setUnreadCount(0);
    await supabase.from("task_alerts").update({ read_at: readAt }).eq("recipient_id", userId).is("read_at", null);
  }, [supabase, unreadCount, userId]);

  const markTaskRead = useCallback(async (taskId: string) => {
    if (!userId) return;
    const unread = alerts.filter((a) => a.wbs_task_id === taskId && !a.read_at);
    if (unread.length === 0) return;
    const readAt = new Date().toISOString();
    const ids = unread.map((a) => a.id);
    setAlerts((prev) => prev.map((a) => (ids.includes(a.id) ? { ...a, read_at: readAt } : a)));
    setUnreadCount((prev) => Math.max(0, prev - unread.length));
    await supabase.from("task_alerts").update({ read_at: readAt }).in("id", ids).eq("recipient_id", userId);
  }, [alerts, supabase, userId]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    void (async () => {
      await refresh();
      if (cancelled) return;

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id ?? null;
      if (!currentUserId) return;

      channel = supabase
        .channel(`task-alerts-${currentUserId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "task_alerts", filter: `recipient_id=eq.${currentUserId}` },
          () => { void refresh(); },
        )
        .subscribe();
    })();

    const onFocus = () => { void refresh(); };
    const interval = window.setInterval(() => { void refresh(); }, 15000);
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.clearInterval(interval);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [refresh, supabase]);

  return (
    <TaskAlertsContext.Provider value={{ alerts, unreadCount, unreadTaskIds, loading, refresh, markRead, markAllRead, markTaskRead }}>
      {children}
    </TaskAlertsContext.Provider>
  );
}

export function useTaskAlerts() {
  const context = useContext(TaskAlertsContext);
  if (!context) {
    throw new Error("useTaskAlerts must be used within a TaskAlertsProvider");
  }
  return context;
}
