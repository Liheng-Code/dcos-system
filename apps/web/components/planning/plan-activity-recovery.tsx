"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Copy, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { changeListText, DEFAULT_RECOVERY_SETTINGS, type RecoveryAnalysis, type RecoverySettings, type Scenario } from "@/lib/planning/activity-library/recovery-engine";
import {
  adoptRecoveryScenario, applyRecoveryScenario, APPLY_READY, listRecoveryScenarios, loadRecoveryInputs, saveRecoveryScenario, setScenarioStatus,
  type OpenDelay, type RecoveryInputs, type SavedScenario, type TargetSpec,
} from "@/lib/planning/activity-library/recovery-service";
import { recoveryEffectiveness } from "@/lib/planning/activity-library/recovery-effectiveness";
import { getProjectStartDate, runProjectSchedule } from "@/lib/planning/project-schedule";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";
import { EmptyNote } from "./plan-act-shared";

interface Result {
  analysis: RecoveryAnalysis; settings: RecoverySettings; targetFinish: string | null; baselineFinish: string | null; tasks: number; elapsedMs: number; delays: OpenDelay[];
}

const RISK_STYLE = { low: "bg-emerald-500/15 text-emerald-500", medium: "bg-amber-500/15 text-amber-500", high: "bg-red-500/15 text-red-500" } as const;
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

const fmt = (d: string | null) => d ?? "—";

const REVISION_LABEL: Record<string, string> = {
  draft: "draft revision", submitted_internal: "submitted for approval", approved_internal: "approved internally",
  submitted_client: "submitted to the client", approved_client: "approved by the client", rejected: "revision rejected",
};
const LEVER_STATE = { held: "text-emerald-500", slipped: "text-amber-500", removed: "text-red-500", missing: "text-muted-foreground" } as const;

/**
 * Recovery scenarios: what is the smallest set of changes that brings the forecast back to a target, per family of levers
 * (crews, method changes, expediting, overlapping). Every figure is measured with the CPM engine on the live programme.
 * Nothing here changes the programme directly: a saved scenario is adopted as a draft programme revision, and its changes
 * reach the live programme only after that revision is approved (doc 35 F2).
 */
export function PlanActivityRecovery() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [mode, setMode] = useState<TargetSpec["mode"]>("earlier");
  const [days, setDays] = useState("15");
  const [date, setDate] = useState("");
  const [crewPct, setCrewPct] = useState(String(DEFAULT_RECOVERY_SETTINGS.maxCompression * 100));
  const [expPct, setExpPct] = useState(String(DEFAULT_RECOVERY_SETTINGS.expediteCompression * 100));
  const [minDur, setMinDur] = useState(String(DEFAULT_RECOVERY_SETTINGS.minDurationWd));
  const [fastTrack, setFastTrack] = useState(true);
  // calendar what-if (doc 35 F4)
  const [calOn, setCalOn] = useState(false);
  const [calSat, setCalSat] = useState(false);
  const [calSun, setCalSun] = useState(true);
  const [calFrom, setCalFrom] = useState("");
  const [calTo, setCalTo] = useState("");
  const [otPct, setOtPct] = useState("0");
  const [acting, setActing] = useState<string | null>(null);
  const [now, setNow] = useState<RecoveryInputs | null>(null);
  const { canEditSchedule } = usePlanningPermissions();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const ai = useAskAi();

  const loadSaved = useCallback(async () => {
    if (!selectedProjectId) return;
    try {
      const list = await listRecoveryScenarios(db, selectedProjectId);
      setSaved(list);
      // effectiveness of applied scenarios needs the programme as it is now (doc 35 F3)
      if (list.some((x) => x.applied_at)) setNow(await loadRecoveryInputs(db, selectedProjectId));
    } catch { /* optional list */ }
  }, [db, selectedProjectId]);

  async function adopt(s: SavedScenario) {
    if (!selectedProjectId) return;
    setActing(s.id);
    try {
      const r = await adoptRecoveryScenario(db, selectedProjectId, s);
      toast.success(`Draft revision R${r.revision_number} created. Submit it for approval in Comparison › Manage Schedules; the programme changes only after approval.`);
      await loadSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not adopt"); } finally { setActing(null); }
  }

  async function applyNow(s: SavedScenario) {
    if (!selectedProjectId) return;
    if (!window.confirm(`Write the ${s.levers.length} change(s) of "${s.name}" into the live programme and recalculate the dates?`)) return;
    setActing(s.id);
    try {
      const r = await applyRecoveryScenario(db, selectedProjectId, s);
      const start = await getProjectStartDate(selectedProjectId);
      if (start) await runProjectSchedule(selectedProjectId, start);
      toast.success(`Applied ${r.applied.length} change(s)${r.skipped.length ? `, skipped ${r.skipped.length} (${r.skipped.map((x) => `${x.code ?? x.kind}: ${x.reason}`).join("; ")})` : ""}. ${start ? "Dates recalculated." : "The project has no start date: run Calculate in the Gantt."}`);
      await loadSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not apply"); } finally { setActing(null); }
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadSaved() sets state after awaiting
  useEffect(() => { void loadSaved(); setResult(null); }, [loadSaved]);

  const spec = (): TargetSpec => (mode === "baseline" ? { mode } : mode === "earlier" ? { mode, days: Math.max(1, Math.trunc(Number(days) || 1)) } : { mode, date });

  async function analyse() {
    if (!selectedProjectId) return;
    if (mode === "date" && !date) { toast.error("Choose a target date"); return; }
    if (calOn && (!calFrom || !calTo || calTo < calFrom)) { toast.error("Choose the calendar window (from and to)"); return; }
    setBusy(true); setResult(null); ai.clear();
    try {
      const res = await fetch("/api/planning/recovery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId, target: spec(),
          settings: { maxCompression: Number(crewPct) / 100, expediteCompression: Number(expPct) / 100, minDurationWd: Number(minDur) || 3, allowFastTrack: fastTrack },
          calendar: calOn && calFrom && calTo
            ? { from: calFrom, to: calTo, extraWeekdays: [...(calSun ? [0] : []), ...(calSat ? [6] : [])], overtimePct: Math.min(50, Math.max(0, Number(otPct) || 0)) }
            : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Analysis failed (${res.status})`);
      setResult(json as Result);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Analysis failed"); } finally { setBusy(false); }
  }

  async function save(s: Scenario) {
    if (!result || !selectedProjectId) return;
    try {
      await saveRecoveryScenario(db, selectedProjectId, s, { targetFinish: result.targetFinish, forecastFinish: result.analysis.liveFinish, settings: result.settings });
      toast.success("Saved for discussion. The programme is unchanged.");
      await loadSaved();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not save"); }
  }

  async function copy(s: Scenario) {
    try { await navigator.clipboard.writeText(changeListText(s, result?.targetFinish ?? null)); toast.success("Change list copied"); }
    catch { toast.error("Could not copy"); }
  }

  if (!selectedProjectId) return <div className="p-6"><EmptyNote>Select a project in the header.</EmptyNote></div>;

  const a = result?.analysis;
  const delays = result?.delays ?? [];
  const delayedTasks = new Map(delays.flatMap((d) => d.taskIds.map((t) => [t, d] as const)));

  return (
    <div className="space-y-6 p-6">
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 max-w-3xl text-xs text-muted-foreground">
          Finds the smallest set of changes that brings the forecast finish back to a target, for each kind of lever. Every figure is measured by re-running the programme logic, not estimated.
          Nothing here changes the programme until a scenario is adopted, approved as a programme revision and applied.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">Recover to</span>
            <select className={sel} value={mode} onChange={(e) => setMode(e.target.value as TargetSpec["mode"])}>
              <option value="earlier">N working days earlier than forecast</option><option value="baseline">The baseline finish</option><option value="date">A date</option>
            </select></label>
          {mode === "earlier" && <label className="text-xs"><span className="mb-1 block text-muted-foreground">Working days</span><Input className="w-24" type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} /></label>}
          {mode === "date" && <label className="text-xs"><span className="mb-1 block text-muted-foreground">Target finish</span><Input className="w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">Crews may cut (%)</span><Input className="w-24" type="number" value={crewPct} onChange={(e) => setCrewPct(e.target.value)} /></label>
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">Expediting may cut (%)</span><Input className="w-24" type="number" value={expPct} onChange={(e) => setExpPct(e.target.value)} /></label>
          <label className="text-xs"><span className="mb-1 block text-muted-foreground">Ignore shorter than (wd)</span><Input className="w-24" type="number" value={minDur} onChange={(e) => setMinDur(e.target.value)} /></label>
          <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={fastTrack} onChange={(e) => setFastTrack(e.target.checked)} /> Allow overlapping</label>
          <Button onClick={analyse} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Find recovery options</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 pb-2 text-sm font-medium"><input type="checkbox" checked={calOn} onChange={(e) => setCalOn(e.target.checked)} /> Also try a calendar change</label>
          {calOn && (
            <>
              <label className="text-xs"><span className="mb-1 block text-muted-foreground">From</span><Input className="w-40" type="date" value={calFrom} onChange={(e) => setCalFrom(e.target.value)} /></label>
              <label className="text-xs"><span className="mb-1 block text-muted-foreground">To</span><Input className="w-40" type="date" value={calTo} min={calFrom || undefined} onChange={(e) => setCalTo(e.target.value)} /></label>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={calSun} onChange={(e) => setCalSun(e.target.checked)} /> Work Sundays</label>
              <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" checked={calSat} onChange={(e) => setCalSat(e.target.checked)} /> Work Saturdays</label>
              <label className="text-xs"><span className="mb-1 block text-muted-foreground">Overtime on critical work (%)</span><Input className="w-24" type="number" min={0} max={50} value={otPct} onChange={(e) => setOtPct(e.target.value)} /></label>
              <span className="pb-2 text-xs text-muted-foreground">Only days the calendar does not already work; holidays stay off.</span>
            </>
          )}
        </div>
        {busy && <p className="mt-3 text-sm text-muted-foreground">Measuring every option against the programme. On a large programme this can take up to a minute.</p>}
      </section>

      {a && !a.ok && <EmptyNote>The programme has circular links ({a.cycle?.slice(0, 4).join(" → ")}…), so recovery cannot be calculated. Fix the links first.</EmptyNote>}

      {a && a.ok && result && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            {[
              ["Forecast finish", fmt(a.liveFinish)], ["Baseline finish", fmt(result.baselineFinish)], ["Target finish", fmt(a.targetFinish)],
              ["Working days to recover", String(Math.max(0, a.gapWd))], ["Critical activities", String(a.criticalCount)], ["Activities", String(result.tasks)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg border border-border bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">{l}</div><div className="mt-1 font-mono text-lg font-semibold">{v}</div></div>
            ))}
          </div>

          <section className="rounded-lg border border-border bg-card p-3">
            <div className="flex flex-wrap items-baseline gap-3">
              <h3 className="text-sm font-semibold">Logged delays</h3>
              {delays.length === 0 ? <span className="text-xs text-muted-foreground">None open in the delay register, so the options below come from the forecast against the target, not from recorded causes.</span> : (
                <span className="text-xs text-muted-foreground">{delays.length} open or disputed · {Math.round(delays.reduce((n, d) => n + d.impactDays, 0) * 100) / 100} wd total impact</span>
              )}
            </div>
            {delays.length > 0 && (
              <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
                {delays.slice(0, 6).map((d) => (
                  <li key={d.id} className="flex items-baseline gap-2"><span className="font-mono text-xs text-primary">{d.code ?? "—"}</span><span className="flex-1 truncate">{d.cause ?? d.description ?? "—"}</span><span className="font-mono text-xs">{d.impactDays} wd</span><span className="text-[10px] uppercase text-muted-foreground">{d.delayType?.replace("_", " ") ?? ""}</span></li>
                ))}
              </ul>
            )}
          </section>

          {a.gapWd > 0 && (a.finishDrivers ?? []).length > 0 && (
            <section className="rounded-lg border border-border bg-card p-3 text-sm">
              <h3 className="text-sm font-semibold">What sets the finish</h3>
              <ul className="mt-1 space-y-0.5 text-xs">
                {a.finishDrivers.map((d) => (
                  <li key={d.id}>
                    <span className="font-mono text-primary">{d.code}</span> {d.name}
                    <span className="text-muted-foreground">
                      {" · "}
                      {[
                        d.constraintType ? `${d.constraintType.replaceAll("_", " ")}${d.constraintDate ? ` ${d.constraintDate}` : ""}` : null,
                        d.predecessors === 0 ? "no predecessors" : `${d.predecessors} predecessor${d.predecessors === 1 ? "" : "s"}`,
                        d.anchored ? "started or manually scheduled" : null,
                      ].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
              {a.finishDrivers.some((d) => d.constraintType || d.predecessors === 0 || d.anchored) && (
                <p className="mt-1 text-xs text-amber-500">
                  A date held by a constraint, an activity without predecessors, or fixed (started / manual) work cannot be recovered by crews, methods or calendars.
                  Link these activities to the work they follow, or review the constraint, then analyse again.
                </p>
              )}
            </section>
          )}

          {a.gapWd <= 0 ? (
            <EmptyNote>The forecast already meets the target ({fmt(a.targetFinish)}), so there is nothing to recover. Try a nearer target.</EmptyNote>
          ) : a.scenarios.length === 0 ? (
            <EmptyNote>
              No change the engine can measure shortens the programme. Levers available on the critical path: crews {a.candidates.crew}, expediting {a.candidates.expedite}, method changes {a.candidates.method}, overlaps {a.candidates.fasttrack}.
              Review the critical path by hand, or relax the limits above.
            </EmptyNote>
          ) : (
            <>
              <div className="space-y-4">
                {a.scenarios.map((s) => (
                  <section key={s.key} className="rounded-lg border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{s.key}</span>
                      <h3 className="text-sm font-semibold">{s.name}</h3>
                      <span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold uppercase", RISK_STYLE[s.risk])}>{s.risk} risk</span>
                      {s.meetsTarget
                        ? <span className="inline-flex items-center gap-1 text-sm text-emerald-500"><Check className="h-4 w-4" /> meets the target</span>
                        : <span className="inline-flex items-center gap-1 text-sm text-amber-500"><X className="h-4 w-4" /> {s.remainingGapWd} wd still missing</span>}
                      <div className="ml-auto flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => void copy(s)}><Copy className="mr-1 h-4 w-4" /> Copy change list</Button>
                        <Button size="sm" disabled={s.recoveredWd <= 0} title={s.recoveredWd <= 0 ? "It does not bring the finish forward" : undefined} onClick={() => void save(s)}>Save for discussion</Button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
                    {s.recoveredWd <= 0 && (
                      <p className="mt-1 text-xs text-amber-500">This change does not bring the finish forward: the finish is set by work it cannot move (see “What sets the finish” below).</p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-6 text-sm">
                      <span>Finish <b className="font-mono">{s.finish}</b></span><span>Recovers <b className="font-mono">{s.recoveredWd} wd</b></span><span>{s.levers.length} change{s.levers.length === 1 ? "" : "s"}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Needs: {s.resourceNote}</p>
                    <table className="mt-3 w-full border-collapse text-sm">
                      <thead><tr className="text-left text-[11px] uppercase text-muted-foreground"><th className="py-1">#</th><th>Activity</th><th>Change</th><th className="text-right">Recovers</th></tr></thead>
                      <tbody>
                        {s.levers.map((l, i) => (
                          <tr key={i} className="border-t border-border">
                            <td className="py-1.5 pr-2 text-muted-foreground">{i + 1}</td>
                            <td className="pr-3"><span className="font-mono text-xs text-primary">{l.code}</span> {l.name}</td>
                            <td className="pr-3">{l.label}{delayedTasks.has(l.taskId) && <span className="ml-2 rounded bg-amber-500/15 px-1.5 text-[10px] font-semibold text-amber-500" title={delayedTasks.get(l.taskId)?.cause ?? ""}>delay logged: {delayedTasks.get(l.taskId)?.cause ?? delayedTasks.get(l.taskId)?.code ?? "see register"}</span>}</td>
                            <td className="text-right font-mono">{l.gainWd > 0 ? `+${l.gainWd} wd` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                ))}
              </div>

              <section className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" /> AI recommendation</span>
                  <span className="text-xs text-muted-foreground">Compares the scenarios above in words. It cannot change them.</span>
                  <Button size="sm" variant="outline" className="ml-auto" disabled={ai.busy} onClick={() => void ai.ask({ tool: "suggest_recovery_plan", projectId: selectedProjectId, target: spec() })}>
                    {ai.busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}Ask AI to recommend
                  </Button>
                </div>
                {ai.busy && <p className="mt-2 text-sm text-muted-foreground">Calculating the scenarios and asking the assistant: this can take a minute.</p>}
                {ai.message && <p className="mt-2 text-sm text-muted-foreground">{ai.message}</p>}
                {ai.fresh.length > 0 && <div className="mt-3"><PlanAiSuggestionList suggestions={ai.fresh} projectId={selectedProjectId} onChanged={() => { ai.clear(); void loadSaved(); }} /></div>}
              </section>
            </>
          )}
          <p className="text-xs text-muted-foreground">Analysis took {Math.round(result.elapsedMs / 100) / 10} s. Levers on the critical path: crews {a.candidates.crew}, expediting {a.candidates.expedite}, method changes {a.candidates.method}, overlaps {a.candidates.fasttrack}.</p>
        </>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">Saved scenarios</h3>
        {saved.length === 0 ? <EmptyNote>Nothing saved yet.</EmptyNote> : (
          <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
            <thead><tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
              <th className="px-3 py-2">Scenario</th><th className="px-3 py-2">Target</th><th className="px-3 py-2">Finish</th><th className="px-3 py-2">Recovers</th><th className="px-3 py-2">Risk</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {saved.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-3 py-1.5">{s.name}<div className="text-xs text-muted-foreground">{s.levers.length} change(s) · {s.resource_note}</div></td>
                  <td className="px-3 py-1.5">{fmt(s.target_finish)}</td><td className="px-3 py-1.5">{fmt(s.scenario_finish)}{!s.meets_target && <span className="ml-1 text-xs text-amber-500">+{s.remaining_gap_wd} wd short</span>}</td>
                  <td className="px-3 py-1.5">{s.recovered_wd} wd</td>
                  <td className="px-3 py-1.5"><span className={cn("rounded px-2 py-0.5 text-[11px] font-semibold uppercase", RISK_STYLE[s.risk])}>{s.risk}</span></td>
                  <td className="px-3 py-1.5 text-xs">
                    <span className="font-semibold uppercase">{s.applied_at ? "applied" : s.status}</span>
                    {s.revision && <div className="text-muted-foreground">R{s.revision.revision_number} · {REVISION_LABEL[s.revision.status] ?? s.revision.status}</div>}
                    {s.status === "adopted" && !s.revision_id && <div className="text-muted-foreground">marked by hand (before revisions)</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {acting === s.id && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
                    {canEditSchedule && s.status === "proposed" && (
                      <>
                        <Button size="sm" variant="outline" disabled={!!acting} onClick={() => void adopt(s)} title="Creates a draft programme revision with this scenario's dates, for approval">Adopt</Button>
                        <Button size="sm" variant="ghost" disabled={!!acting} onClick={async () => { try { await setScenarioStatus(db, s.id, "dismissed"); await loadSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Dismiss</Button>
                      </>
                    )}
                    {s.status === "adopted" && s.revision && !s.applied_at && (
                      APPLY_READY.has(s.revision.status)
                        ? canEditSchedule && <Button size="sm" disabled={!!acting} onClick={() => void applyNow(s)}>Apply to programme</Button>
                        : <Link href="/dashboard/planning/comparison" className="text-xs text-primary hover:underline">{s.revision.status === "rejected" ? "Revision rejected" : "Approve in Comparison"}</Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Adopt creates a draft programme revision with the scenario&apos;s dates; submit and approve it in Comparison › Manage Schedules. Only then can the changes be applied to the live programme, which recalculates the dates. Started activities are skipped.
        </p>
        {now && saved.some((x) => x.applied_at) && (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-semibold">Did the recovery work?</h3>
            {saved.filter((x) => x.applied_at).map((x) => {
              const e = recoveryEffectiveness(x, now.tasks, now.cal);
              return (
                <section key={x.id} className="rounded-lg border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-baseline gap-4">
                    <b>{x.name}</b>
                    <span>Planned <b className="font-mono">{e.plannedWd} wd</b></span>
                    <span>Achieved <b className={cn("font-mono", e.achievedWd != null && e.achievedWd < e.plannedWd ? "text-amber-500" : "text-emerald-500")}>{e.achievedWd ?? "—"} wd</b>{e.achievedPct != null && <span className="text-muted-foreground"> ({e.achievedPct}%)</span>}</span>
                    <span className="text-xs text-muted-foreground">forecast {fmt(e.forecastBefore)} when applied → {fmt(e.forecastNow)} now</span>
                    <span className="text-xs text-muted-foreground">{e.held} change(s) still in the programme, {e.slipped} not</span>
                  </div>
                  <ul className="mt-2 grid gap-0.5 text-xs md:grid-cols-2">
                    {e.levers.map((l, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={cn("w-16 shrink-0 font-semibold uppercase", LEVER_STATE[l.state])}>{l.state}</span>
                        <span className="truncate"><span className="font-mono text-primary">{l.code}</span> {l.label}
                          {l.nowWd != null && l.plannedWd != null && l.state !== "held" && <span className="text-muted-foreground"> · now {l.nowWd} wd</span>}
                          {l.daysPlanned != null && <span className="text-muted-foreground"> · {l.daysHeld} of {l.daysPlanned} days in the calendar</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1 text-[11px] text-muted-foreground">Achieved counts everything that moved the forecast since the change was applied (progress, delays, other edits), not only this recovery.</p>
                </section>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
