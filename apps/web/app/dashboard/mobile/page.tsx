"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Smartphone, RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export default function MobileDashboardPage() {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState({ devices: 0, activeDevices: 0, pendingSync: 0, recentSessions: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("mobile_device_registrations").select("id", { count: "exact", head: true }),
      supabase.from("mobile_device_registrations").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("mobile_sync_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.from("mobile_sync_sessions").select("id", { count: "exact", head: true }).gte("started_at", new Date(Date.now() - 86400000).toISOString()),
    ]).then(([d, a, q, s]) => {
      setStats({
        devices: d.count ?? 0,
        activeDevices: a.count ?? 0,
        pendingSync: q.count ?? 0,
        recentSessions: s.count ?? 0,
      });
      setLoading(false);
    });
  }, [supabase]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mobile Field Application</h1>
        <p className="text-sm text-muted-foreground">Device management, sync status, and offline infrastructure</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.devices}</p>
              <p className="text-xs text-muted-foreground">Registered Devices</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.activeDevices}</p>
              <p className="text-xs text-muted-foreground">Active Devices</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <RefreshCw className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.pendingSync}</p>
              <p className="text-xs text-muted-foreground">Pending Sync Items</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.recentSessions}</p>
              <p className="text-xs text-muted-foreground">Syncs (24h)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
        <Smartphone className="mx-auto h-12 w-12 mb-3 text-muted-foreground/50" />
        <p className="font-semibold mb-1">Mobile Field App Infrastructure Ready</p>
        <p>Sync tables, device registration, and conflict resolution are set up.</p>
        <p className="text-xs mt-2">The mobile app client connects via the REST API using the sync queue protocol.</p>
      </div>
    </div>
  );
}
