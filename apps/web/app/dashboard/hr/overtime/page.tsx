"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Calendar,
  DollarSign,
  TrendingUp,
  Plus,
  ArrowRight,
} from "lucide-react";

interface DashboardData {
  pending: number;
  approved: number;
  today_hours: number;
  monthly_hours: number;
  by_department: Record<string, number>;
  recent: any[];
}

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
};

export default function OTDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return; }
      fetch("/api/hr/overtime/dashboard")
        .then((r) => r.json())
        .then((d) => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-muted" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><div className="h-16 animate-pulse rounded bg-muted" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="-ml-56">
          <h1 className="text-2xl font-bold tracking-tight">OT Dashboard</h1>
          <p className="text-muted-foreground">Overtime Management Overview</p>
        </div>
        <Link href="/dashboard/hr/overtime/apply">
          <Button className="gap-2"><Plus className="h-4 w-4" />New OT Request</Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-yellow-50 p-3 text-yellow-600"><AlertCircle className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Pending</p><p className="text-2xl font-bold">{data?.pending ?? 0}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-green-50 p-3 text-green-600"><CheckCircle2 className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Approved</p><p className="text-2xl font-bold">{data?.approved ?? 0}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-blue-50 p-3 text-blue-600"><Clock className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Today&apos;s OT</p><p className="text-2xl font-bold">{data?.today_hours ?? 0}h</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-4 p-6">
            <div className="rounded-lg bg-purple-50 p-3 text-purple-600"><DollarSign className="h-6 w-6" /></div>
            <div><p className="text-sm text-muted-foreground">Monthly Hours</p><p className="text-2xl font-bold">{data?.monthly_hours ?? 0}h</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-lg">OT by Department</CardTitle></CardHeader>
          <CardContent>
            {data?.by_department && Object.keys(data.by_department).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(data.by_department)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([dept, hrs]) => (
                    <div key={dept} className="flex items-center justify-between">
                      <span className="text-sm font-medium">{dept}</span>
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min((hrs / Math.max(...Object.values(data.by_department))) * 100, 100)}%` }}
                          />
                        </div>
                        <span className="w-12 text-right text-sm text-muted-foreground">{hrs}h</span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No OT data yet</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Recent Requests</CardTitle></CardHeader>
          <CardContent>
            {data?.recent && data.recent.length > 0 ? (
              <div className="space-y-3">
                {data.recent.map((req: any) => (
                  <Link key={req.id} href={`/dashboard/hr/overtime/${req.id}`}>
                    <div className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{req.employee?.full_name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{req.ot_type} &middot; {req.hours}h</p>
                      </div>
                      <Badge className={`text-xs ${STATUS_BADGE[req.status] || ""}`}>
                        {req.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </Link>
                ))}
                <Link href="/dashboard/hr/overtime/my-requests">
                  <Button variant="ghost" size="sm" className="w-full gap-2">
                    View All <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Clock className="h-10 w-10 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">No overtime requests yet</p>
                <Link href="/dashboard/hr/overtime/apply">
                  <Button variant="outline" size="sm" className="gap-2"><Plus className="h-4 w-4" />Create First Request</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
