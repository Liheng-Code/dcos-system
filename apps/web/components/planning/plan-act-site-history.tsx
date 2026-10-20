"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { proposeFromHistory, DEFAULT_THRESHOLDS, type HistoryStats } from "@/lib/planning/activity-library/productivity-learning";
import { createCalibratedVersion, standardHistoryStats } from "@/lib/planning/activity-library/productivity-learning-service";
import type { ActProductivityStandard } from "@/lib/planning/activity-library/types";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";

const Row = ({ ok, children }: { ok: boolean; children: React.ReactNode }) => (
  <li className="flex items-center gap-2">
    {ok ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-red-500" />}
    <span className={cn(!ok && "text-muted-foreground")}>{children}</span>
  </li>
);

/** Site history behind one standard: how much evidence there is, what it says, and (only when sufficient) a proposal. */
export function PlanActSiteHistory({ std, onCreated }: { std: ActProductivityStandard; onCreated: () => void }) {
  const db = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const ai = useAskAi();

  async function check() {
    setLoading(true);
    try { setStats(await standardHistoryStats(db, std.id)); } catch (e) { toast.error(e instanceof Error ? e.message : "Could not read site history"); } finally { setLoading(false); }
  }

  const proposal = stats
    ? proposeFromHistory({ labour_constant_hr_per_unit: std.labour_constant_hr_per_unit, output_per_day: std.output_per_day, version: std.version }, stats)
    : null;
  const pct = (f: number | null) => (f == null ? "—" : `${f > 0 ? "+" : ""}${Math.round(f * 1000) / 10}%`);
  const th = DEFAULT_THRESHOLDS;

  return (
    <div className="mt-4 rounded-md border border-border p-3 text-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Site history</div>
        <div className="flex gap-2">
          {stats && stats.totalLogs > 0 && <Button size="sm" variant="outline" disabled={ai.busy} onClick={() => void ai.ask({ tool: "suggest_productivity", standardId: std.id })}>{ai.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Explain with AI</Button>}
          <Button size="sm" variant="outline" onClick={check} disabled={loading}>{loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}{stats ? "Refresh" : "Check site history"}</Button>
        </div>
      </div>

      {(ai.message || ai.fresh.length > 0) && (
        <div className="mt-3 space-y-2">
          {ai.message && <p className="text-sm text-muted-foreground">{ai.message}</p>}
          <PlanAiSuggestionList suggestions={ai.fresh} projectId={null} onChanged={() => ai.clear()} />
        </div>
      )}

      {stats && (
        <div className="mt-3 space-y-3">
          {stats.totalLogs === 0 ? (
            <p className="text-muted-foreground">No site logs yet for tasks that used this standard. Logs come from Daily Reporting and Planning › Productivity › Site Records.</p>
          ) : (
            <>
              <ul className="space-y-1">
                <Row ok={stats.checks.enoughLogs}>{stats.kept} usable log{stats.kept === 1 ? "" : "s"} (need {th.minLogs}){stats.totalLogs > stats.usable ? `, ${stats.totalLogs - stats.usable} unusable` : ""}</Row>
                <Row ok={stats.checks.enoughDays}>{stats.days} distinct day{stats.days === 1 ? "" : "s"} (need {th.minDays})</Row>
                <Row ok={stats.checks.enoughPlaces}>{stats.places} place{stats.places === 1 ? "" : "s"} (need {th.minPlaces}: different projects or levels)</Row>
              </ul>
              {stats.medianPi != null && (
                <p>
                  Productivity index (1.00 = as the standard): median <b>{stats.medianPi}</b>, range {stats.minPi}–{stats.maxPi}, spread {stats.spread}
                  {stats.outliers.length > 0 && <span className="text-amber-500"> · {stats.outliers.length} outlier{stats.outliers.length === 1 ? "" : "s"} excluded ({stats.outliers.map((o) => o.pi).join(", ")})</span>}
                  {stats.from && <span className="text-muted-foreground"> · {stats.from} to {stats.to}</span>}
                </p>
              )}
              {!stats.sufficient && <p className="text-amber-500">Not enough evidence to propose a change: {stats.shortfall.join("; ")}.</p>}
            </>
          )}

          {proposal && (
            <div className="rounded-md bg-primary/5 p-3">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase text-muted-foreground"><th /><th>Standard v{std.version}</th><th>Proposed v{proposal.nextVersion}</th><th>Change</th></tr></thead>
                <tbody>
                  <tr><td className="text-muted-foreground">Man-hours per {std.unit}</td><td>{std.labour_constant_hr_per_unit}</td><td className="font-semibold">{proposal.labour_constant_hr_per_unit}</td><td>{pct(proposal.changeFraction)}</td></tr>
                  <tr><td className="text-muted-foreground">Crew output per day</td><td>{std.output_per_day ?? "—"}</td><td className="font-semibold">{proposal.output_per_day ?? "—"}</td><td>{pct(proposal.outputChangeFraction)}</td></tr>
                </tbody>
              </table>
              {proposal.flaggedLarge && <p className="mt-2 text-xs font-semibold text-amber-500">Large change (more than {Math.round(th.largeChange * 100)}%): check the logs before approving.</p>}
              <p className="mt-2 text-xs text-muted-foreground">Creates a draft version. The current version stays in force until a Planning Manager approves the new one in the Norm Library. Existing runs keep the version they used.</p>
              <Button size="sm" className="mt-2" disabled={creating || std.status !== "approved"} title={std.status !== "approved" ? "Approve this standard first: only approved standards are calibrated" : undefined}
                onClick={async () => {
                  setCreating(true);
                  try { await createCalibratedVersion(db, std, proposal); toast.success(`Draft v${proposal.nextVersion} created. Approve it in the Norm Library.`); onCreated(); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } finally { setCreating(false); }
                }}>
                Create proposed version
              </Button>
              {std.status !== "approved" && <p className="mt-1 text-xs text-muted-foreground">This standard is {std.status}; only approved standards can be calibrated.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
