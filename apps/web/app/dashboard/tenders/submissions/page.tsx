"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, DollarSign, FileSearch } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function SubmissionsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("tender_submissions").select("*, tender_register!inner(tender_no, title)")
      .order("submitted_date", { ascending: false }).then(({ data }) => {
      if (data) setSubmissions(data);
      setLoading(false);
    });
  }, [supabase]);

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Submissions</h1>
        <p className="text-sm text-muted-foreground">Bidder submissions and pricing</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <DollarSign className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-2xl font-bold">{submissions.length}</p>
              <p className="text-xs text-muted-foreground">Total Submissions</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileSearch className="h-5 w-5 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold">{submissions.filter((s) => s.submission_status === "responsive").length}</p>
              <p className="text-xs text-muted-foreground">Responsive</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <FileSearch className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-2xl font-bold">{submissions.filter((s) => s.submission_status === "evaluated" || s.submission_status === "shortlisted").length}</p>
              <p className="text-xs text-muted-foreground">Evaluated</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {submissions.length === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">No submissions yet</div>
      ) : (
        <div className="space-y-2">
          {submissions.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center gap-4 p-3">
                <div className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs font-medium",
                  s.submission_status === "submitted" ? "bg-blue-50 text-blue-600" :
                  s.submission_status === "responsive" ? "bg-emerald-50 text-emerald-600" :
                  s.submission_status === "evaluated" ? "bg-purple-50 text-purple-600" : "bg-gray-50 text-gray-600"
                )}>{s.submission_status === "submitted" ? "S" : s.submission_status === "responsive" ? "R" : s.submission_status === "evaluated" ? "E" : "W"}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{s.bidder_name}</p>
                  <p className="text-xs text-muted-foreground">{s.tender_register?.tender_no} — {s.tender_register?.title}</p>
                </div>
                <p className="text-sm font-semibold">${Number(s.bid_amount).toLocaleString()}</p>
                <span className="text-xs text-muted-foreground">{new Date(s.submitted_date).toLocaleDateString()}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
