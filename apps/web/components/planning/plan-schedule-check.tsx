"use client";

// Planning > Schedule Check (doc 35 Q3): the 14 DCMA checks on the selected project's programme,
// the findings that carry over between runs, and the project's gate on baseline / revision submission.

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MinusCircle, PlayCircle, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import {
  acceptScheduleFinding,
  getLatestScheduleCheck,
  getQaqcGate,
  listScheduleFindings,
  runScheduleCheck,
  setQaqcGate,
  type QaqcFinding,
  type QaqcGate,
  type QaqcRunSummary,
} from "@/lib/planning/schedule-qaqc-service";
import type { QaqcCheckResult } from "@dcos/scheduling-engine";

const fmtMetric = (r: Pick<QaqcCheckResult, "metric" | "unit">) =>
  r.unit === "%" ? `${r.metric}%` : r.unit === "index" ? r.metric.toFixed(2) : String(r.metric);
const fmtLimit = (r: Pick<QaqcCheckResult, "threshold" | "unit" | "comparator">) =>
  `${r.comparator === "max" ? "≤" : "≥"} ${r.unit === "%" ? `${r.threshold}%` : r.unit === "index" ? r.threshold.toFixed(2) : r.threshold}`;

export function PlanScheduleCheck() {
  const { selectedProjectId: projectId } = useProject();
  const [run, setRun] = useState<QaqcRunSummary | null>(null);
  const [findings, setFindings] = useState<QaqcFinding[]>([]);
  const [gate, setGate] = useState<QaqcGate>("warn");
  const [codes, setCodes] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const reload = useCallback(async () => {
    if (!projectId) return;
    const [latest, list, g, taskRes] = await Promise.all([
      getLatestScheduleCheck(projectId),
      listScheduleFindings(projectId),
      getQaqcGate(projectId),
      createClient().from("wbs_tasks").select("id, task_code").eq("project_id", projectId).limit(5000),
    ]);
    setRun(latest);
    setFindings(list);
    setGate(g);
    setCodes(new Map(((taskRes.data ?? []) as { id: string; task_code: string | null }[]).map((t) => [t.id, t.task_code ?? t.id.slice(0, 8)])));
  }, [projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading the selected project's check data
    reload()
      .catch((e) => !cancelled && toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [projectId, reload]);

  async function runCheck() {
    if (!projectId) return;
    setRunning(true);
    try {
      const outcome = await runScheduleCheck(projectId);
      const failed = outcome.results.filter((r) => !r.pass);
      toast[failed.length ? "warning" : "success"](
        failed.length ? `${failed.length} of 14 checks failed` : "All 14 checks passed",
      );
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function changeGate(next: QaqcGate) {
    if (!projectId) return;
    try {
      await setQaqcGate(projectId, next);
      setGate(next);
      toast.success(next === "block" ? "Critical findings now block baseline and revision submission" : "Findings now only warn");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function accept(f: QaqcFinding) {
    try {
      await acceptScheduleFinding(f.id, reason.trim());
      toast.success(`Finding "${f.check_name}" accepted`);
      setAccepting(null);
      setReason("");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (!projectId) return <p className="text-sm text-muted-foreground">Select a project first.</p>;
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  const results = (run?.results ?? []) as QaqcCheckResult[];
  const affectedText = (ids: string[]) => ids.slice(0, 30).map((id) => codes.get(id) ?? id.slice(0, 8)).join(", ") + (ids.length > 30 ? ` … and ${ids.length - 30} more` : "");

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">DCMA 14-point schedule check</p>
          <p className="text-xs text-muted-foreground">
            {run
              ? `Last run ${new Date(run.created_at).toLocaleString()} · data date ${run.data_date ?? "-"} · ${run.task_count} activities · ${run.passed} passed, ${run.failed} failed · engine ${run.engine_version}`
              : "Not run yet for this project."}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Before a baseline or revision is submitted</span>
          <select
            value={gate}
            onChange={(e) => void changeGate(e.target.value as QaqcGate)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs"
          >
            <option value="warn">Warn only</option>
            <option value="block">Block on critical findings</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void runCheck()}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />}
          Run check
        </button>
      </div>

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Check</th>
                <th className="px-3 py-2 text-right">Result</th>
                <th className="px-3 py-2 text-right">Limit</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.code} className="border-t border-border align-top">
                  <td className="px-3 py-2 tabular-nums">{r.number}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{r.name}</span>
                    {r.severity === "critical" && <span className="ml-1.5 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700 dark:bg-red-950 dark:text-red-300">critical</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.notApplicable ? "-" : fmtMetric(r)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtLimit(r)}</td>
                  <td className="px-3 py-2">
                    {r.notApplicable ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><MinusCircle className="h-3.5 w-3.5" /> N/A</span>
                    ) : r.pass ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Pass</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400"><XCircle className="h-3.5 w-3.5" /> Fail</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {r.message}
                    {r.affected.length > 0 && (
                      <button type="button" className="ml-1 font-medium text-foreground underline" onClick={() => setOpen(open === r.code ? null : r.code)}>
                        {open === r.code ? "hide" : `${r.affected.length} activities`}
                      </button>
                    )}
                    {open === r.code && <p className="mt-1 font-mono text-[11px] text-foreground">{affectedText(r.affected)}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Findings</h3>
          <span className="text-xs text-muted-foreground">Stay until the check passes or someone with programme approval accepts them</span>
        </div>
        {findings.length === 0 ? (
          <p className="text-xs text-muted-foreground">No open findings.</p>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className={cn("rounded-lg border px-3 py-2 text-xs",
                f.status === "accepted" ? "border-border bg-muted/30" : f.severity === "critical" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{f.check_number}. {f.check_name}</span>
                  <span className="rounded bg-background/60 px-1.5 text-[10px] font-semibold uppercase">{f.status === "accepted" ? "accepted" : f.severity}</span>
                  <span className="text-muted-foreground">since {new Date(f.last_seen_at).toLocaleDateString()}</span>
                  {f.status === "open" && (
                    <button type="button" className="ml-auto font-medium underline" onClick={() => { setAccepting(accepting === f.id ? null : f.id); setReason(""); }}>
                      Accept…
                    </button>
                  )}
                </div>
                <p className="mt-1">{f.message}</p>
                {f.status === "accepted" && f.accept_reason && <p className="mt-1 text-muted-foreground">Accepted: {f.accept_reason}</p>}
                {accepting === f.id && (
                  <div className="mt-2 flex gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Why this is acceptable (at least 10 characters)"
                      className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1"
                    />
                    <button
                      type="button"
                      disabled={reason.trim().length < 10}
                      onClick={() => void accept(f)}
                      className="rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
