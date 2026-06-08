"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Smartphone, CheckCircle, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function MobileDevicesPage() {
  const supabase = useMemo(() => createClient(), []);
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("mobile_device_registrations").select("*").order("registered_at", { ascending: false }).then(({ data }) => {
      if (data) setDevices(data);
      setLoading(false);
    });
  }, [supabase]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Registered Devices</h1>
        <p className="text-sm text-muted-foreground">Field devices connected to the platform</p>
      </div>

      {devices.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          No devices registered yet
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((d) => (
            <Card key={d.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Smartphone className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{d.device_name}</p>
                  <p className="text-xs text-muted-foreground">{d.device_type} · v{d.app_version || "—"} · {d.os_version || "—"}</p>
                </div>
                {d.is_active ? (
                  <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><CheckCircle className="h-3 w-3" /> Active</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs text-red-600"><XCircle className="h-3 w-3" /> Inactive</span>
                )}
                <span className="text-xs text-muted-foreground">{d.last_sync_at ? new Date(d.last_sync_at).toLocaleString() : "Never synced"}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
