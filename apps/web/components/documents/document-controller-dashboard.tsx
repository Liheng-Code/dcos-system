"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { FileText, Send, CheckCircle, XCircle, Clock, AlertTriangle, Eye, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

interface DocCounts {
  draft: number;
  submitted: number;
  under_review: number;
  approved: number;
  rejected: number;
  ifc: number;
}

interface RecentActivity {
  id: string;
  document_id: string;
  action: string;
  created_at: string;
  documents: { document_number: string; title: string }[] | null;
}

export function DocumentControllerDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const [counts, setCounts] = useState<DocCounts>({ draft: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0, ifc: 0 });
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from("documents").select("status"),
      supabase.from("document_audit_log")
        .select("id, document_id, action, created_at, documents:document_id(document_number, title)")
        .order("created_at", { ascending: false })
        .limit(20),
    ]).then(([docsRes, auditRes]) => {
      if (docsRes.data) {
        const acc: DocCounts = { draft: 0, submitted: 0, under_review: 0, approved: 0, rejected: 0, ifc: 0 };
        for (const d of docsRes.data) {
          if (d.status in acc) acc[d.status as keyof DocCounts]++;
        }
        setCounts(acc);
        setTotal(docsRes.data.length);
      }
      if (auditRes.data) setRecentActivity(auditRes.data as RecentActivity[]);
      setLoading(false);
    });
  }, [supabase]);

  const KPI_CARDS = [
    { label: "Total Documents", value: total, icon: FileText, color: "bg-blue-50 text-blue-600" },
    { label: "Pending Review", value: counts.submitted + counts.under_review, icon: Eye, color: "bg-amber-50 text-amber-600" },
    { label: "Approved", value: counts.approved, icon: CheckCircle, color: "bg-emerald-50 text-emerald-600" },
    { label: "Rejected", value: counts.rejected, icon: XCircle, color: "bg-red-50 text-red-600" },
    { label: "Issued (IFC)", value: counts.ifc, icon: Send, color: "bg-green-50 text-green-600" },
    { label: "Draft", value: counts.draft, icon: Clock, color: "bg-gray-50 text-gray-600" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {KPI_CARDS.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg", kpi.color)}>
                <kpi.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold tabular-nums">{kpi.value}</p>
              <p className="text-xs text-muted-foreground">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Pending Actions</h3>
            <Link href="/dashboard/documents?status=submitted" className="text-xs text-primary hover:underline">
              View All
            </Link>
          </div>
          {counts.submitted === 0 && counts.under_review === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No pending actions</p>
          ) : (
            <div className="space-y-2">
              {counts.submitted > 0 && (
                <Link href="/dashboard/documents?status=submitted">
                  <Card className="hover:bg-muted/50 cursor-pointer">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                        <Send className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{counts.submitted} document{counts.submitted > 1 ? "s" : ""} submitted</p>
                        <p className="text-xs text-muted-foreground">Awaiting review assignment</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
              {counts.under_review > 0 && (
                <Link href="/dashboard/documents?status=under_review">
                  <Card className="hover:bg-muted/50 cursor-pointer">
                    <CardContent className="flex items-center gap-3 p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                        <Eye className="h-4 w-4" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{counts.under_review} document{counts.under_review > 1 ? "s" : ""} under review</p>
                        <p className="text-xs text-muted-foreground">Awaiting approval decision</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <Link href="/dashboard/documents/audit-log" className="text-xs text-primary hover:underline">
              Full Log
            </Link>
          </div>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No recent activity</p>
          ) : (
            <div className="space-y-1.5">
              {recentActivity.slice(0, 10).map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
                  {entry.action === "status_change" ? <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" /> :
                   entry.action === "created" ? <FileText className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" /> :
                   <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium capitalize truncate">
                      {entry.action.replace(/_/g, " ")}
                      {entry.documents?.[0] && <> — {entry.documents[0].document_number}</>}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(entry.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
