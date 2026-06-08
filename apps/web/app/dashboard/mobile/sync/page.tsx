"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Clock, CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function SyncStatusPage() {
  const supabase = useMemo(() => createClient(), []);
  const [sessions, setSessions] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("mobile_sync_sessions").select("*").order("started_at", { ascending: false }).limit(20),
      supabase.from("mobile_sync_queue").select("*").order("created_at", { ascending: false }).limit(20),
    ]).then(([s, q]) => {
      if (s.data) setSessions(s.data);
      if (q.data) setQueue(q.data);
      setLoading(false);
    });
  }, [supabase]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sync Status</h1>
        <p className="text-sm text-muted-foreground">Recent sync sessions and pending queue items</p>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Sync Sessions</h2>
        {sessions.length === 0 ? (
          <div className="rounded-lg border border-border px-6 py-8 text-center text-sm text-muted-foreground">No sync sessions</div>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                {s.status === "completed" ? <CheckCircle className="h-4 w-4 text-emerald-500" /> :
                 s.status === "failed" ? <XCircle className="h-4 w-4 text-red-500" /> :
                 s.status === "conflict" ? <AlertTriangle className="h-4 w-4 text-amber-500" /> :
                 <Clock className="h-4 w-4 text-blue-500" />}
                <span>{s.status}</span>
                <span className="text-xs text-muted-foreground">{s.records_uploaded || 0} up / {s.records_downloaded || 0} down</span>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(s.started_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sync Queue</h2>
        {queue.length === 0 ? (
          <div className="rounded-lg border border-border px-6 py-8 text-center text-sm text-muted-foreground">Queue is empty</div>
        ) : (
          <div className="space-y-1">
            {queue.map((q) => (
              <div key={q.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                <div className={cn(
                  "h-2 w-2 rounded-full",
                  q.status === "synced" ? "bg-emerald-500" :
                  q.status === "failed" ? "bg-red-500" : "bg-amber-500"
                )} />
                <span className="font-mono text-xs">{q.operation}</span>
                <span className="text-xs">{q.table_name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{new Date(q.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
