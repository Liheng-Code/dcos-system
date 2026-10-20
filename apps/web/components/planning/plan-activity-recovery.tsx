"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Loader2, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { changeListText, DEFAULT_RECOVERY_SETTINGS, type RecoveryAnalysis, type RecoverySettings, type Scenario } from "@/lib/planning/activity-library/recovery-engine";
import { listRecoveryScenarios, saveRecoveryScenario, setScenarioStatus, type OpenDelay, type SavedScenario, type TargetSpec } from "@/lib/planning/activity-library/recovery-service";
import { PlanAiSuggestionList, useAskAi } from "./plan-ai-suggestions";
import { EmptyNote } from "./plan-act-shared";

interface Result {
  analysis: RecoveryAnalysis; settings: RecoverySettings; targetFinish: string | null; baselineFinish: string | null; tasks: number; elapsedMs: number; delays: OpenDelay[];
}

const RISK_STYLE = { low: "bg-emerald-500/15 text-emerald-500", medium: "bg-amber-500/15 text-amber-500", high: "bg-red-500/15 text-red-500" } as const;
const sel = "h-9 rounded-md border border-input bg-background px-2 text-sm";

const fmt = (d: string | null) => d ?? "—";

/**
 * Recovery scenarios: what is the smallest set of changes that brings the forecast back to a target, per family of levers
 * (crews, method changes, expediting, overlapping). Every figure is measured with the CPM engine on the live programme.
 * Advisory: nothing here changes the programme. A planner compares, saves what is worth discussing and decides.
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
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const ai = useAskAi();

  const loadSaved = useCallback(async () => {
    if (!selectedProjectId) return;
    try { setSaved(await listRecoveryScenarios(db, selectedProjectId)); } catch { /* optional list */ }
  }, [db, selectedProjectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loadSaved() sets state after awaiting
  useEffect(() => { void loadSaved(); setResult(null); }, [loadSaved]);

  const spec = (): TargetSpec => (mode === "baseline" ? { mode } : mode === "earlier" ? { mode, days: Math.max(1, Math.trunc(Number(days) || 1)) } : { mode, date });

  async function analyse() {
    if (!selectedProjectId) return;
    if (mode === "date" && !date) { toast.error("Choose a target date"); return; }
    setBusy(true); setResult(null); ai.clear();
    try {
      const res = await fetch("/api/planning/recovery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId, target: spec(),
          settings: { maxCompression: Number(crewPct) / 100, expediteCompression: Number(expPct) / 100, minDurationWd: Number(minDur) || 3, allowFastTrack: fastTrack },
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
          This is advice for comparison: nothing here changes the programme.
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
                        <Button size="sm" onClick={() => void save(s)}>Save for discussion</Button>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
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
                            <td className="text-right font-mono">+{l.gainWd} wd</td>
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
                  <td className="px-3 py-1.5 text-xs font-semibold uppercase">{s.status}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {s.status === "proposed" && (
                      <>
                        <Button size="sm" variant="outline" onClick={async () => { try { await setScenarioStatus(db, s.id, "adopted", "Applied to the programme by the planner"); await loadSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Mark adopted</Button>
                        <Button size="sm" variant="ghost" onClick={async () => { try { await setScenarioStatus(db, s.id, "dismissed"); await loadSaved(); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); } }}>Dismiss</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs text-muted-foreground">“Mark adopted” only records that you applied the change in the programme yourself; it does not edit any activity.</p>
      </section>
    </div>
  );
}
