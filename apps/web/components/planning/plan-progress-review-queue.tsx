"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, HardHat, Loader2, ShieldCheck, XCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { decideProgressReview, listWbsTaskProgressReviewsByProjectIdWithStatusPending } from "@/lib/planning/planning-queries";
import { useProject } from "@/components/dashboard/project-context";
import { cn } from "@/lib/utils";

interface ReviewRow {
  id: string;
  wbs_task_id: string;
  proposed_progress: number;
  previous_progress: number;
  proposed_by: string | null;
  proposed_at: string;
  comment: string | null;
  task_code: string | null;
  task_name: string | null;
  proposer_name: string | null;
  daily_report_id: string | null;
  report_date: string | null;
  weather_conditions: string | null;
}

/** Completion Plan 2.2 — the planner's queue for pending progress-review requests. */
export function PlanProgressReviewQueue() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectDraft, setRejectDraft] = useState<Record<string, string>>({});
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  async function load() {
    if (!selectedProjectId) { setRows([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await listWbsTaskProgressReviewsByProjectIdWithStatusPending(selectedProjectId);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    type RawRow = Omit<ReviewRow, "task_code" | "task_name" | "proposer_name" | "report_date" | "weather_conditions"> & {
      wbs_tasks: { task_code: string; task_name: string } | null;
      site_daily_reports: { report_date: string; weather_conditions: string | null } | null;
      profiles: { full_name: string | null } | null;
    };
    setRows(
      ((data ?? []) as unknown as RawRow[]).map((r) => ({
        ...r,
        task_code: r.wbs_tasks?.task_code ?? null,
        task_name: r.wbs_tasks?.task_name ?? null,
        proposer_name: r.profiles?.full_name ?? null,
        daily_report_id: r.daily_report_id ?? null,
        report_date: r.site_daily_reports?.report_date ?? null,
        weather_conditions: r.site_daily_reports?.weather_conditions ?? null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  async function decide(reviewId: string, decision: "confirmed" | "rejected", comment?: string) {
    setBusyId(reviewId);
    try {
      const { error } = await decideProgressReview({
        p_review_id: reviewId,
        p_decision: decision,
        p_comment: comment ?? null,
      });
      if (error) throw new Error(error.message);
      toast.success(decision === "confirmed" ? "Progress confirmed" : "Progress rejected");
      setRows((prev) => prev.filter((r) => r.id !== reviewId));
      setRejectingId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to decide review");
    } finally {
      setBusyId(null);
    }
  }

  if (projectLoading || loading) {
    return <div className="flex h-60 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!selectedProjectId) {
    return <div className="flex h-60 items-center justify-center text-sm text-muted-foreground">Select a project to review pending progress changes.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Progress Reviews</h2>
        {rows.length > 0 && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">{rows.length} pending</span>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No pending progress changes — you&apos;re all caught up.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    <span className="font-mono text-muted-foreground">{r.task_code}</span>{" "}
                    {r.task_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {r.proposer_name ?? "Someone"} proposed changing progress from{" "}
                    <strong className="text-foreground">{r.previous_progress}%</strong> to{" "}
                    <strong className={cn(r.proposed_progress > r.previous_progress ? "text-emerald-600" : "text-amber-600")}>{r.proposed_progress}%</strong>
                  </p>
                  {r.daily_report_id && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <Link
                        href="/dashboard/site/daily-reports"
                        target="_blank"
                        className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <HardHat className="h-3 w-3 text-blue-600" />
                        Site Daily Report ({r.report_date ?? "Report"})
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </Link>
                      {r.weather_conditions && (
                        <span className="text-[10px] text-muted-foreground">
                          Weather: {r.weather_conditions}
                        </span>
                      )}
                    </div>
                  )}
                  {r.comment && <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{r.comment}&rdquo;</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void decide(r.id, "confirmed")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Confirm
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => setRejectingId(rejectingId === r.id ? null : r.id)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Reject
                  </button>
                </div>
              </div>
              {rejectingId === r.id && (
                <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
                  <input
                    value={rejectDraft[r.id] ?? ""}
                    onChange={(e) => setRejectDraft((p) => ({ ...p, [r.id]: e.target.value }))}
                    placeholder="Reason for rejecting (optional)"
                    className="flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                  />
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void decide(r.id, "rejected", rejectDraft[r.id])}
                    className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm rejection
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
