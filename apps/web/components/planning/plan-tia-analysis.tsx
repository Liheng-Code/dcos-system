"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Timer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  deleteTiaScenario,
  listTiaScenarios,
  loadTiaContext,
  runTia,
  saveTiaScenario,
  type FragnetActivity,
  type TiaResult,
  type TiaScenarioRow,
  type TiaTask,
} from "@/lib/planning/tia-service";
import type { WorkCalendar } from "@/lib/planning/work-calendar";

interface TaskOption { id: string; task_code: string; task_name: string; }
interface DelayOption { id: string; delay_code: string; description: string; }

interface FragRow {
  localId: string;
  name: string;
  durationWd: string;
  deps: string; // comma-separated fragment localIds or real task ids
}

let fragCounter = 0;
function newFragRow(): FragRow {
  fragCounter += 1;
  return { localId: `F${fragCounter}`, name: "", durationWd: "1", deps: "" };
}

/** Completion Plan 3.1 — Time Impact Analysis: build a fragnet, run it against the live schedule, save the scenario. */
export function PlanTiaAnalysis() {
  const { selectedProjectId } = useProject();
  const [taskOptions, setTaskOptions] = useState<TaskOption[]>([]);
  const [delayOptions, setDelayOptions] = useState<DelayOption[]>([]);
  const [scenarios, setScenarios] = useState<TiaScenarioRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [scenarioName, setScenarioName] = useState("");
  const [delayId, setDelayId] = useState("");
  const [fragRows, setFragRows] = useState<FragRow[]>([newFragRow()]);
  const [impactedIds, setImpactedIds] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tasksCache, setTasksCache] = useState<TiaTask[] | null>(null);
  const [calCache, setCalCache] = useState<WorkCalendar | null>(null);
  const [dataDateCache, setDataDateCache] = useState<string>("");
  const [result, setResult] = useState<TiaResult | null>(null);

  async function load() {
    if (!selectedProjectId) { setLoading(false); return; }
    setLoading(true);
    const supabase = createClient();
    const [taskRes, delayRes, scenarioRows] = await Promise.all([
      supabase.from("wbs_tasks").select("id, task_code, task_name").eq("project_id", selectedProjectId).order("task_code").limit(500),
      supabase.from("delay_register").select("id, delay_code, description").eq("project_id", selectedProjectId).order("created_at", { ascending: false }),
      listTiaScenarios(selectedProjectId).catch(() => [] as TiaScenarioRow[]),
    ]);
    if (taskRes.data) setTaskOptions(taskRes.data as TaskOption[]);
    if (delayRes.data) setDelayOptions(delayRes.data as DelayOption[]);
    setScenarios(scenarioRows);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  function updateFragRow(localId: string, patch: Partial<FragRow>) {
    setFragRows((prev) => prev.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
  }

  async function runAnalysis() {
    if (!selectedProjectId) return;
    if (fragRows.every((r) => !r.name.trim())) { toast.error("Add at least one fragnet activity"); return; }
    if (impactedIds.length === 0) { toast.error("Select at least one impacted activity"); return; }
    setRunning(true);
    try {
      const ctx = tasksCache && calCache ? { tasks: tasksCache, cal: calCache, dataDate: dataDateCache } : await loadTiaContext(selectedProjectId);
      setTasksCache(ctx.tasks);
      setCalCache(ctx.cal);
      setDataDateCache(ctx.dataDate);

      const fragnet: FragnetActivity[] = fragRows
        .filter((r) => r.name.trim())
        .map((r) => ({
          id: r.localId,
          name: r.name.trim(),
          durationWd: Math.max(0, parseInt(r.durationWd, 10) || 0),
          deps: r.deps
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map((predId) => ({ predId, type: "fs" as const, lag: 0 })),
        }));

      const r = runTia({ tasks: ctx.tasks, cal: ctx.cal, dataDate: ctx.dataDate, fragnet, impactedActivityIds: impactedIds });
      setResult(r);
      if (!r.ok) toast.error(`Circular dependency in fragnet: ${r.cycle.join(" -> ")}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function saveScenario() {
    if (!selectedProjectId || !result || !tasksCache || !calCache) return;
    if (!scenarioName.trim()) { toast.error("Name the scenario before saving"); return; }
    setSaving(true);
    try {
      const fragnet: FragnetActivity[] = fragRows
        .filter((r) => r.name.trim())
        .map((r) => ({
          id: r.localId,
          name: r.name.trim(),
          durationWd: Math.max(0, parseInt(r.durationWd, 10) || 0),
          deps: r.deps.split(",").map((s) => s.trim()).filter(Boolean).map((predId) => ({ predId, type: "fs" as const, lag: 0 })),
        }));
      await saveTiaScenario(
        selectedProjectId,
        scenarioName.trim(),
        delayId || null,
        { tasks: tasksCache, cal: calCache, dataDate: dataDateCache, fragnet, impactedActivityIds: impactedIds },
        result,
      );
      toast.success("Scenario saved");
      setScenarioName("");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function removeScenario(id: string) {
    try {
      await deleteTiaScenario(id);
      setScenarios((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading) return <div className="flex h-40 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  if (!selectedProjectId) return <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Select a project.</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-2">
            <Timer className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Time Impact Analysis — build a fragnet</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Model the delaying event as a small chain of activities (a &ldquo;fragnet&rdquo;), link it onto the real activities it
            impacted, and compare the base schedule to the impacted one. Nothing here touches the live programme —
            it is a calculation only, saved as a scenario.
          </p>

          <div className="space-y-2">
            <Label className="text-xs">Fragnet activities</Label>
            {fragRows.map((r) => (
              <div key={r.localId} className="flex items-center gap-2">
                <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">{r.localId}</span>
                <Input
                  placeholder="Activity name (e.g. Redesign foundation)"
                  value={r.name}
                  onChange={(e) => updateFragRow(r.localId, { name: e.target.value })}
                  className="flex-1"
                />
                <Input
                  type="number" min="0"
                  placeholder="wd"
                  value={r.durationWd}
                  onChange={(e) => updateFragRow(r.localId, { durationWd: e.target.value })}
                  className="w-16"
                />
                <Input
                  placeholder="Predecessors (F1, task id…)"
                  value={r.deps}
                  onChange={(e) => updateFragRow(r.localId, { deps: e.target.value })}
                  className="w-56"
                />
                <Button
                  variant="ghost" size="sm"
                  onClick={() => setFragRows((prev) => (prev.length > 1 ? prev.filter((x) => x.localId !== r.localId) : prev))}
                >
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setFragRows((prev) => [...prev, newFragRow()])}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add fragnet activity
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Impacted activities (get an FS link from the fragnet&apos;s tail)</Label>
            <div className="max-h-32 overflow-y-auto rounded-md border border-input p-2 space-y-1">
              {taskOptions.map((t) => (
                <label key={t.id} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={impactedIds.includes(t.id)}
                    onChange={(e) =>
                      setImpactedIds((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)))
                    }
                  />
                  <span className="font-mono text-muted-foreground">{t.task_code}</span> {t.task_name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button disabled={running} onClick={() => void runAnalysis()}>
              {running ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              Run Analysis
            </Button>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Result</span>
            </div>
            {!result.ok ? (
              <p className="text-sm text-red-600">Circular dependency: {result.cycle.join(" -> ")}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-4 text-sm">
                  <span>Base finish: <strong>{result.baseFinish ?? "—"}</strong></span>
                  <span>Impacted finish: <strong>{result.impactedFinish ?? "—"}</strong></span>
                  <span className={cn("font-semibold", result.slipWd > 0 ? "text-red-600" : "text-emerald-600")}>
                    EOT: {result.slipWd} working day{result.slipWd === 1 ? "" : "s"}
                  </span>
                  {result.criticalPathChanged && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                      <TriangleAlert className="h-3.5 w-3.5" /> Critical path changed
                    </span>
                  )}
                </div>

                {result.milestones.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/30 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                          <th className="px-2 py-1.5">Milestone</th>
                          <th className="px-2 py-1.5">Base</th>
                          <th className="px-2 py-1.5">Impacted</th>
                          <th className="px-2 py-1.5 text-right">Slip (wd)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.milestones.map((m) => (
                          <tr key={m.taskId} className="border-b border-border/60 last:border-0">
                            <td className="px-2 py-1.5"><span className="font-mono text-muted-foreground">{m.task_code}</span> {m.task_name}</td>
                            <td className="px-2 py-1.5">{m.baseFinish ?? "—"}</td>
                            <td className="px-2 py-1.5 font-medium">{m.impactedFinish ?? "—"}</td>
                            <td className="px-2 py-1.5 text-right">{m.slipWd}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">{result.setbacks.length} activity(ies) pushed past their baseline by this fragment.</p>

                <div className="flex items-end gap-2 border-t border-border pt-3">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Scenario name</Label>
                    <Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="e.g. Late steel delivery — Oct 2026" />
                  </div>
                  <div className="w-56 space-y-1">
                    <Label className="text-xs">Link to delay (optional)</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                      value={delayId}
                      onChange={(e) => setDelayId(e.target.value)}
                    >
                      <option value="">None</option>
                      {delayOptions.map((d) => <option key={d.id} value={d.id}>{d.delay_code} — {d.description}</option>)}
                    </select>
                  </div>
                  <Button disabled={saving} onClick={() => void saveScenario()}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save Scenario
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4">
          <p className="mb-2 text-sm font-semibold">Saved scenarios</p>
          {scenarios.length === 0 ? (
            <p className="text-xs text-muted-foreground">No scenarios saved yet.</p>
          ) : (
            <div className="space-y-1.5">
              {scenarios.map((s) => (
                <div key={s.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                  <div>
                    <span className="font-medium">{s.name}</span>{" "}
                    <span className="text-muted-foreground">
                      — {s.slip_wd ?? 0} wd slip, data date {s.data_date}, {new Date(s.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => void removeScenario(s.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
