"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Link2, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { useProject } from "@/components/dashboard/project-context";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { suggestBoqMatches, type BoqCandidate, type BoqMatchSuggestion } from "@/lib/planning/boq-matching";
import { listBoqCandidates, listTasksForMapping, writeTaskQuantity, type TaskMappingData } from "@/lib/planning/boq-mapping-service";
import { cn } from "@/lib/utils";

const SOURCE_LABEL: Record<BoqCandidate["source"], string> = { tender_boq: "Tender BOQ", qs_boq: "Project BOQ" };

function defaultReason(c: BoqCandidate): string {
  return `Matched from ${SOURCE_LABEL[c.source]} item ${c.code ?? c.id.slice(0, 8)} via the BOQ mapping tool.`;
}

export function PlanBoqMapping() {
  const { selectedProjectId, loading: projectLoading } = useProject();
  const { can, loaded: permsLoaded } = usePlanningPermissions();
  const canEdit = can("task_work", "edit") || can("task_work", "can_create");

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TaskMappingData | null>(null);
  const [candidates, setCandidates] = useState<BoqCandidate[]>([]);
  const [search, setSearch] = useState("");
  const [showMapped, setShowMapped] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [overrideQuery, setOverrideQuery] = useState("");

  const load = useCallback(async () => {
    if (!selectedProjectId) { setData(null); setLoading(false); return; }
    setLoading(true);
    try {
      const [d, c] = await Promise.all([listTasksForMapping(selectedProjectId), listBoqCandidates(selectedProjectId)]);
      setData(d);
      setCandidates(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() flips its own loading flag
  useEffect(() => { void load(); }, [load]);

  const candidatesById = useMemo(() => new Map(candidates.map((c) => [c.id, c])), [candidates]);

  const suggestions = useMemo(() => {
    if (!data) return new Map<string, BoqMatchSuggestion[]>();
    return suggestBoqMatches(data.tasks, candidates, { topN: 3, minScore: 0.2 });
  }, [data, candidates]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.tasks
      .filter((t) => showMapped || !data.currentLinks.has(t.id))
      .filter((t) => !q || `${t.taskCode} ${t.taskName}`.toLowerCase().includes(q))
      .map((t) => ({ task: t, link: data.currentLinks.get(t.id) ?? null, top: suggestions.get(t.id) ?? [] }));
  }, [data, suggestions, search, showMapped]);

  const totals = useMemo(() => {
    if (!data) return { total: 0, mapped: 0, suggested: 0 };
    const total = data.tasks.length;
    const mapped = data.currentLinks.size;
    const suggested = data.tasks.filter((t) => !data.currentLinks.has(t.id) && (suggestions.get(t.id)?.length ?? 0) > 0).length;
    return { total, mapped, suggested };
  }, [data, suggestions]);

  async function apply(taskId: string, candidate: BoqCandidate, reason: string) {
    setBusyTaskId(taskId);
    try {
      await writeTaskQuantity({
        taskId,
        quantity: candidate.quantity,
        quantityUnit: candidate.unit,
        quantitySource: candidate.source === "tender_boq" ? "tender_boq" : "boq",
        tenderBoqItemId: candidate.source === "tender_boq" ? candidate.id : null,
        qsBoqItemId: candidate.source === "qs_boq" ? candidate.id : null,
        reason,
      });
      toast.success(`Linked to ${candidate.code ?? "BOQ item"}`);
      setOverrideFor(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyTaskId(null);
    }
  }

  if (projectLoading || !permsLoaded || loading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!selectedProjectId) return <p className="py-10 text-center text-sm text-muted-foreground">Select a project from the sidebar to map BOQ quantities.</p>;
  if (!can("task_work", "view")) return <p className="py-10 text-center text-sm text-muted-foreground">You do not have access to task work.</p>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Tasks</p>
          <p className="text-xl font-bold tabular-nums">{totals.total}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-[11px] text-muted-foreground">Traceable to a BOQ line</p>
          <p className="text-xl font-bold tabular-nums">{totals.mapped} <span className="text-xs font-normal text-muted-foreground">({totals.total ? Math.round((totals.mapped / totals.total) * 100) : 0}%)</span></p>
        </div>
        <div className={cn("rounded-lg border bg-card p-3", totals.suggested > 0 ? "border-amber-500/40" : "border-border")}>
          <p className="text-[11px] text-muted-foreground">Unmapped with a suggestion</p>
          <p className={cn("text-xl font-bold tabular-nums", totals.suggested > 0 && "text-amber-400")}>{totals.suggested}</p>
        </div>
      </div>

      {candidates.length === 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          This project has no BOQ lines with a measured quantity yet (neither its own BOQ nor a linked tender BOQ). Import one via CSV on the Task Work page, or ask QS to price the BOQ first.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input className="w-full rounded-md border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-primary" placeholder="Search task code or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showMapped} onChange={(e) => setShowMapped(e.target.checked)} /> Show already-mapped tasks
        </label>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-2 py-2 font-medium">Task</th>
              <th className="px-2 py-2 font-medium">Current link</th>
              <th className="px-2 py-2 font-medium">Best suggestion</th>
              <th className="w-40 px-2 py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ task, link, top }) => {
              const linkedCandidate = link ? candidatesById.get(link.candidateId) : null;
              const best = top[0];
              return (
                <tr key={task.id} className="border-b border-border last:border-0 align-top">
                  <td className="max-w-[240px] px-2 py-2">
                    <span className="block truncate font-medium" title={task.taskName}>{task.taskCode}</span>
                    <span className="block truncate text-muted-foreground" title={task.taskName}>{task.taskName}</span>
                    {task.levelLabel && <span className="text-[10px] text-muted-foreground">Level: {task.levelLabel}</span>}
                  </td>
                  <td className="px-2 py-2">
                    {linkedCandidate ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        <Link2 className="h-3 w-3" /> {linkedCandidate.code ?? "—"} · {SOURCE_LABEL[linkedCandidate.source]}
                      </span>
                    ) : <span className="text-muted-foreground">— none —</span>}
                  </td>
                  <td className="max-w-[320px] px-2 py-2">
                    {best ? (
                      <div>
                        <span className="block truncate font-medium" title={best.candidate.description}>{best.candidate.code ?? "—"} — {best.candidate.description}</span>
                        <span className="text-muted-foreground">
                          {Math.round(best.score * 100)}% match · {best.candidate.quantity.toLocaleString()} {best.candidate.unit} · {SOURCE_LABEL[best.candidate.source]}
                        </span>
                        {best.reasons.length > 0 && <span className="block text-[10px] text-muted-foreground">{best.reasons.join(" · ")}</span>}
                      </div>
                    ) : <span className="text-muted-foreground">No suggestion above the confidence threshold</span>}
                  </td>
                  <td className="px-2 py-2">
                    {canEdit && (
                      <div className="flex flex-col gap-1">
                        {best && (
                          <button type="button" disabled={busyTaskId === task.id}
                            onClick={() => apply(task.id, best.candidate, defaultReason(best.candidate))}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50">
                            {busyTaskId === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Apply
                          </button>
                        )}
                        <button type="button" onClick={() => { setOverrideFor(task.id); setOverrideQuery(""); }}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted">
                          <ChevronDown className="h-3 w-3" /> Choose different…
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{showMapped ? "No tasks match the search." : "Every task is either mapped or excluded — try “Show already-mapped tasks”."}</p>}
      </div>

      {overrideFor && (
        <OverrideDialog
          taskLabel={data?.tasks.find((t) => t.id === overrideFor)?.taskCode ?? ""}
          candidates={candidates}
          query={overrideQuery}
          onQueryChange={setOverrideQuery}
          busy={busyTaskId === overrideFor}
          onClose={() => setOverrideFor(null)}
          onPick={(c, reason) => apply(overrideFor, c, reason)}
        />
      )}
    </div>
  );
}

function OverrideDialog({
  taskLabel, candidates, query, onQueryChange, busy, onClose, onPick,
}: {
  taskLabel: string;
  candidates: BoqCandidate[];
  query: string;
  onQueryChange: (q: string) => void;
  busy: boolean;
  onClose: () => void;
  onPick: (c: BoqCandidate, reason: string) => void;
}) {
  const [picked, setPicked] = useState<BoqCandidate | null>(null);
  const [reason, setReason] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = candidates.filter((c) => !q || `${c.code ?? ""} ${c.description}`.toLowerCase().includes(q)).slice(0, 100);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-[640px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="border-b border-border bg-muted px-4 py-3">
          <h2 className="text-sm font-bold text-foreground">Choose a BOQ line for {taskLabel}</h2>
          <p className="text-[11px] text-muted-foreground">A manual pick is never applied silently — confirm below, with a reason.</p>
        </div>
        <div className="border-b border-border p-3">
          <input autoFocus className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs outline-none focus:border-primary" placeholder="Search BOQ code or description…" value={query} onChange={(e) => onQueryChange(e.target.value)} />
        </div>
        <div className="flex-1 overflow-y-auto text-xs">
          {filtered.map((c) => (
            <label key={c.id} className={cn("flex cursor-pointer items-start gap-2 border-b border-border px-3 py-2 last:border-0 hover:bg-muted/40", picked?.id === c.id && "bg-primary/10")}>
              <input type="radio" className="mt-1" checked={picked?.id === c.id} onChange={() => { setPicked(c); setReason(defaultReason(c)); }} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">{c.code ?? "—"} <span className="font-normal text-muted-foreground">— {c.description}</span></span>
                <span className="text-muted-foreground">{c.quantity.toLocaleString()} {c.unit} · {SOURCE_LABEL[c.source]}</span>
              </span>
            </label>
          ))}
          {filtered.length === 0 && <p className="px-3 py-6 text-center text-muted-foreground">No BOQ lines match.</p>}
        </div>
        {picked && (
          <div className="border-t border-border p-3">
            <label className="mb-1 block text-[11px] font-medium text-muted-foreground">Reason</label>
            <textarea className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-border bg-muted/40 px-4 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">Cancel</button>
          <button type="button" disabled={busy || !picked || !reason.trim()} onClick={() => picked && onPick(picked, reason.trim())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Link this item
          </button>
        </div>
      </div>
    </div>
  );
}
