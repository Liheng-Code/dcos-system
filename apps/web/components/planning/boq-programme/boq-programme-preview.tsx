"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { CsiDivision } from "@/lib/csi-divisions";
import { commitBoqProgramme, type CommitProgrammeResult, type ProgrammePreview } from "@/lib/planning/boq-programme/boq-programme-service";
import type { PlannedTask } from "@/lib/planning/boq-programme/boq-programme-planner";
import { loadLineInfo, type LineInfo, type PreviewContext } from "@/lib/planning/boq-programme/preview-context";
import {
  cleanResourceName, CONFIDENCE_LABEL, filterTasks, groupPreview, groupWarnings, NO_FILTERS, ROW_KIND_LABEL, rowKind, SKIP_REASON, valueMatches,
  WARNING_LABEL, type PreviewFilters, type RowKind,
} from "@/lib/planning/boq-programme/preview-view";
import { SELECT_CLS } from "@/components/planning/activity-database/activity-database-shared";
import { cn } from "@/lib/utils";

const KIND_CLS: Record<RowKind, string> = {
  create: "bg-green-500/15 text-green-700 dark:text-green-400",
  update: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  unchanged: "bg-muted text-muted-foreground",
  skipped: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

const num = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d });
const errorText = (e: unknown, fb: string) => (e instanceof Error ? e.message : fb);

function Stat({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-xl font-semibold tabular-nums">{value}{icon}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Expanded row: BOQ lines, resource hours, predecessors, and current vs new values for updates. */
function RowDetail({
  db, preview, task, ctx, byKey, money,
}: { db: SupabaseClient; preview: ProgrammePreview; task: PlannedTask; ctx: PreviewContext; byKey: Map<string, PlannedTask>; money: (n: number) => string }) {
  const [info, setInfo] = useState<Map<string, LineInfo> | null>(null);
  useEffect(() => {
    let live = true;
    loadLineInfo(db, preview.source, task.boqLines.map((l) => l.lineId)).then((m) => { if (live) setInfo(m); }).catch(() => { if (live) setInfo(new Map()); });
    return () => { live = false; };
  }, [db, preview.source, task.boqLines]);
  const current = task.existingTaskId ? ctx.existing.get(task.existingTaskId) : undefined;
  const kind = rowKind(task);

  return (
    <div className="grid gap-4 p-3 text-sm lg:grid-cols-2">
      <div className="space-y-1 lg:col-span-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">BOQ lines</div>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-2">Item</th><th className="pr-2">Description</th><th className="pr-2 text-right">Share %</th><th className="pr-2 text-right">Qty</th><th className="text-right">Amount</th></tr></thead>
          <tbody>
            {task.boqLines.map((l) => (
              <tr key={l.lineId} className="border-t border-border/60">
                <td className="py-1 pr-2 font-mono">{info?.get(l.lineId)?.itemCode ?? (info ? "" : "...")}</td>
                <td className="max-w-md truncate pr-2" title={info?.get(l.lineId)?.description}>{info?.get(l.lineId)?.description ?? ""}</td>
                <td className="pr-2 text-right tabular-nums">{num(l.sharePct, 2)}</td>
                <td className="pr-2 text-right tabular-nums">{num(l.quantity, 3)}</td>
                <td className="text-right tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-primary">Resource hours</div>
        {task.resourceHours.length === 0 ? <p className="text-xs text-muted-foreground">None.</p> : task.resourceHours.map((h) => (
          <div key={h.resourceId} className="flex justify-between gap-2 text-xs"><span>{h.kind === "labor" ? "M" : "E"} {cleanResourceName(h.name)}</span><span className="tabular-nums">{num(h.hours)} h</span></div>
        ))}
      </div>
      <div className="space-y-1">
        {kind === "update" || kind === "unchanged" ? (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Current vs new</div>
            <div className="text-xs">Duration: {current?.durationDays != null ? `${num(current.durationDays)} d` : "-"} to <span className="font-medium">{num(task.durationDays)} d</span></div>
            <div className="text-xs">Budget: {current?.budget != null ? money(current.budget) : "-"} to <span className="font-medium">{money(task.budget)}</span></div>
            {task.alsoMapped.length > 0 && <div className="text-xs text-muted-foreground">Also mapped by {task.alsoMapped.length} other task{task.alsoMapped.length === 1 ? "" : "s"} (not touched).</div>}
          </>
        ) : (
          <>
            <div className="text-xs font-semibold uppercase tracking-wide text-primary">Predecessors</div>
            {task.predecessors.length === 0 ? <p className="text-xs text-muted-foreground">{task.action === "create" ? "None." : SKIP_REASON[task.action as "skip_started" | "skip_locked"]}</p> : task.predecessors.map((p, i) => (
              <div key={i} className="text-xs">{(p.key && byKey.get(p.key)?.name) || "Existing task"} <span className="text-muted-foreground">({p.type.toUpperCase()}{p.lagDays ? ` ${p.lagDays > 0 ? "+" : ""}${p.lagDays}d` : ""})</span></div>
            ))}
          </>
        )}
        {task.warnings.length > 0 && <div className="pt-1 text-xs text-amber-700 dark:text-amber-400">{task.warnings.map((w) => WARNING_LABEL[w]).join("; ")}</div>}
      </div>
    </div>
  );
}

/** Preview of the programme the BOQ would create, with filters, warnings and the commit flow. */
export function BoqProgrammePreview({
  db, projectId, preview, ctx, divisions, projectStart, money, onCommitted, stale, projectHasStart,
}: {
  /** The source, crew, start date or readiness changed since this preview was built. */
  stale: boolean;
  /** projects.start_date is already set. */
  projectHasStart: boolean;
  db: SupabaseClient; projectId: string; preview: ProgrammePreview; ctx: PreviewContext; divisions: CsiDivision[];
  projectStart: string; money: (n: number) => string; onCommitted: () => void;
}) {
  const [filters, setFilters] = useState<PreviewFilters>(NO_FILTERS);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [warnOpen, setWarnOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitProgrammeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = preview.startedTaskCount;
  const [scheduleOpt, setScheduleOpt] = useState(started === 0);
  const [setStartOpt, setSetStartOpt] = useState(!projectHasStart);

  const toggle = (s: Set<string>, k: string) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; };
  const byKey = useMemo(() => new Map(preview.tasks.map((t) => [t.key, t])), [preview.tasks]);
  const kinds = useMemo(() => {
    const c: Record<RowKind, number> = { create: 0, update: 0, unchanged: 0, skipped: 0 };
    for (const t of preview.tasks) c[rowKind(t)]++;
    return c;
  }, [preview.tasks]);
  const filtered = useMemo(() => filterTasks(preview.tasks, filters), [preview.tasks, filters]);
  const groups = useMemo(() => groupPreview(filtered, ctx.floorOrder, ctx.nodeName, ctx.masterDivision), [filtered, ctx]);
  const warnGroups = useMemo(() => groupWarnings(preview.warnings), [preview.warnings]);
  const divName = (code: string) => (code ? `Division ${code} - ${divisions.find((d) => d.code === code)?.name ?? ""}`.trim() : "No division");
  const t = preview.totals;
  const topResources = useMemo(() => [...t.hoursByResource].sort((a, b) => b.hours - a.hours).slice(0, 5), [t.hoursByResource]);
  const matches = valueMatches(t.valueDriven + t.valueSkipped, t.valueTotal);
  const taskName = (key: string | undefined) => (key ? byKey.get(key)?.name : undefined);

  async function commit() {
    setCommitting(true);
    setError(null);
    try {
      const r = await commitBoqProgramme(db, projectId, preview, { projectStart, schedule: scheduleOpt, setProjectStart: scheduleOpt && setStartOpt });
      setResult(r);
      setConfirm(false);
      toast.success("Programme committed");
      onCommitted();
    } catch (e) { setError(errorText(e, "Could not commit the programme")); setConfirm(false); } finally { setCommitting(false); }
  }

  if (result) {
    const s = result.schedule;
    const c = result.commit;
    return (
      <section className="space-y-3 rounded-lg border border-border bg-card p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-primary"><CheckCircle2 className="h-4 w-4" /> Programme committed</h2>
        <p className="text-sm">
          {c.created} created, {c.updated} updated, {c.skippedStarted + c.skippedLocked + c.skippedFlagged} skipped
          ({c.skippedStarted} started, {c.skippedLocked} locked, {c.skippedFlagged} flagged), {c.cleared} cleared, {c.keptManualWork} kept manual work.
        </p>
        {s.ran ? (
          <p className="text-sm">
            Schedule: {s.start} to <span className="font-medium">{s.finish}</span>, {s.workingDays.toLocaleString()} working days, {s.criticalCount} critical task{s.criticalCount === 1 ? "" : "s"}, {s.changed} dated
            {s.projectStartUpdated ? "; the project start date was updated." : "."}
          </p>
        ) : (
          <div className={s.reason === "cycle" || s.reason === "error" ? "text-sm text-destructive" : "text-sm text-amber-700 dark:text-amber-400"}>
            <p>{s.note}</p>
            {s.cycle && s.cycle.length > 0 && <p className="mt-1 text-xs">Tasks in the loop: {s.cycle.map((id) => byKey.get(id)?.name ?? id).join(" > ")}</p>}
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" render={<Link href="/dashboard/planning/gantt" />}>Open Gantt</Button>
          <Button size="sm" variant="outline" render={<Link href="/dashboard/planning/sheet" />}>Open Sheet</Button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Tasks to create" value={kinds.create} sub={`${kinds.update} to update, ${kinds.unchanged} unchanged`} />
        <Stat label="Skipped" value={kinds.skipped} sub={`${t.counts.skip_started} started, ${t.counts.skip_locked} locked · ${preview.clear.length} cleared`} />
        <Stat
          label="Value driven" value={money(t.valueDriven)} sub={`+ ${money(t.valueSkipped)} skipped = ${money(t.valueDriven + t.valueSkipped)} of ${money(t.valueTotal)} BOQ total`}
          icon={matches ? <CheckCircle2 className="h-4 w-4 text-green-600" aria-label="Matches the BOQ total" /> : <AlertTriangle className="h-4 w-4 text-amber-600" aria-label="Does not match the BOQ total" />}
        />
        <Stat label="Labour man-hours" value={num(t.laborHours, 0)} sub={`${num(t.equipmentHours, 0)} equipment hours · ${num(t.hoursSkipped, 0)} h skipped`} />
      </div>
      {topResources.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">Top resources by hours</div>
          <div className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {topResources.map((r) => <div key={r.resourceId} className="flex justify-between gap-2"><span className="truncate">{r.kind === "labor" ? "M" : "E"} {cleanResourceName(r.name)}</span><span className="tabular-nums text-muted-foreground">{num(r.hours, 0)} h</span></div>)}
          </div>
        </div>
      )}

      {warnGroups.length > 0 && (
        <section className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"><AlertTriangle className="h-3.5 w-3.5" /> Warnings ({preview.warnings.length})</div>
          {warnGroups.map((g) => (
            <div key={g.code}>
              <button type="button" className="flex w-full items-center gap-2 text-left text-sm" aria-expanded={warnOpen === g.code} onClick={() => setWarnOpen(warnOpen === g.code ? null : g.code)}>
                {warnOpen === g.code ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="flex-1">{WARNING_LABEL[g.code]}</span><Badge variant="secondary">{g.count}</Badge>
              </button>
              {warnOpen === g.code && (
                <ul className="ml-6 mt-1 max-h-48 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                  {g.items.slice(0, 200).map((w, i) => <li key={i}>{taskName(w.taskKey) ? `${taskName(w.taskKey)}: ` : ""}{w.message}</li>)}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Input className="w-56" placeholder="Search activity or code..." value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} aria-label="Search" />
        <select className={`${SELECT_CLS} w-40`} value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value as PreviewFilters["kind"] })} aria-label="Action">
          <option value="all">All actions</option>
          {(Object.keys(ROW_KIND_LABEL) as RowKind[]).map((k) => <option key={k} value={k}>{ROW_KIND_LABEL[k]} ({kinds[k]})</option>)}
        </select>
        <select className={`${SELECT_CLS} w-40`} value={filters.confidence} onChange={(e) => setFilters({ ...filters, confidence: e.target.value as PreviewFilters["confidence"] })} aria-label="Confidence">
          <option value="all">All confidence</option>
          {(Object.keys(CONFIDENCE_LABEL) as (keyof typeof CONFIDENCE_LABEL)[]).map((c) => <option key={c} value={c}>{CONFIDENCE_LABEL[c]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.warningsOnly} onChange={(e) => setFilters({ ...filters, warningsOnly: e.target.checked })} /> Has warnings</label>
        <span className="text-sm text-muted-foreground">{filtered.length.toLocaleString()} of {preview.tasks.length.toLocaleString()} tasks</span>
        <Button className="ml-auto" disabled={stale || !projectStart || committing || kinds.create + kinds.update === 0} onClick={() => setConfirm(true)}
          title={stale ? "Out of date: preview again" : !projectStart ? "Enter a project start date first" : undefined}>
          Commit programme
        </Button>
      </div>
      {stale && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">Out of date, preview again. The source, crew, start date or BOQ readiness changed after this preview was built.</p>}
      {error && <p className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No tasks match the filters.</p>
      ) : groups.map((f) => (
        <section key={f.nodeId} className="overflow-hidden rounded-lg border border-border">
          <button type="button" className="flex w-full items-center gap-2 bg-muted/50 px-4 py-2 text-left text-sm font-semibold" aria-expanded={!collapsed.has(f.nodeId)} onClick={() => setCollapsed(toggle(collapsed, f.nodeId))}>
            {collapsed.has(f.nodeId) ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="flex-1">{f.name}</span><Badge variant="secondary">{f.count}</Badge>
          </button>
          {!collapsed.has(f.nodeId) && f.divisions.map((d) => {
            const dKey = `${f.nodeId}|${d.code}`;
            return (
              <div key={dKey}>
                <button type="button" className="flex w-full items-center gap-2 border-t border-border/60 px-6 py-1.5 text-left text-xs font-medium text-muted-foreground" aria-expanded={!collapsed.has(dKey)} onClick={() => setCollapsed(toggle(collapsed, dKey))}>
                  {collapsed.has(dKey) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  <span className="flex-1">{divName(d.code)}</span><span>{d.tasks.length}</span>
                </button>
                {!collapsed.has(dKey) && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8" /><TableHead className="w-24">Action</TableHead><TableHead>Activity</TableHead><TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Duration</TableHead><TableHead className="text-right">Crew</TableHead><TableHead className="text-right">Man-hours</TableHead>
                        <TableHead className="text-right">Budget</TableHead><TableHead>Confidence</TableHead><TableHead className="w-8" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {d.tasks.map((task) => {
                        const k = rowKind(task);
                        const isOpen = open.has(task.key);
                        return (
                          <Fragment key={task.key}>
                            <TableRow className="cursor-pointer" onClick={() => setOpen(toggle(open, task.key))} aria-expanded={isOpen}>
                              <TableCell>{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                              <TableCell><span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", KIND_CLS[k])} title={k === "skipped" ? SKIP_REASON[task.action as "skip_started" | "skip_locked"] : undefined}>{ROW_KIND_LABEL[k]}</span></TableCell>
                              <TableCell><span className="font-mono text-xs text-muted-foreground">{task.visibleCode ?? task.masterCode}</span> {task.name}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(task.quantity, 2)} {task.unit ?? ""}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(task.durationDays)} d <span className="text-xs text-muted-foreground">({task.basis === "labour" ? "labour" : task.basis === "days_per_unit" ? "days/unit" : "default"})</span></TableCell>
                              <TableCell className="text-right tabular-nums">{task.crewSize}</TableCell>
                              <TableCell className="text-right tabular-nums">{num(task.labourHours, 0)}</TableCell>
                              <TableCell className="text-right tabular-nums">{money(task.budget)}</TableCell>
                              <TableCell><Badge variant={task.confidence === "high" ? "default" : "secondary"}>{CONFIDENCE_LABEL[task.confidence]}</Badge></TableCell>
                              <TableCell>{task.warnings.length > 0 && <AlertTriangle className="h-4 w-4 text-amber-600" aria-label={task.warnings.map((w) => WARNING_LABEL[w]).join("; ")} />}</TableCell>
                            </TableRow>
                            {isOpen && <TableRow className="bg-muted/30 hover:bg-muted/30"><TableCell colSpan={10} className="p-0"><RowDetail db={db} preview={preview} task={task} ctx={ctx} byKey={byKey} money={money} /></TableCell></TableRow>}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </div>
            );
          })}
        </section>
      ))}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit this programme?</AlertDialogTitle>
            <AlertDialogDescription>
              This updates {kinds.update} existing task{kinds.update === 1 ? "" : "s"}&apos; duration and budget and creates {kinds.create} task{kinds.create === 1 ? "" : "s"}. Started and locked tasks keep their duration and budget.
              {preview.clear.length > 0 ? ` ${preview.clear.length} task${preview.clear.length === 1 ? "" : "s"} that no longer receive BOQ lines will have their BOQ links cleared.` : ""}
              {scheduleOpt ? ` Scheduling re-calculates the dates of all auto-scheduled tasks in the project from ${projectStart}.` : ""}
            </AlertDialogDescription>
            <div className="space-y-3 pt-2 text-sm">
              <label className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={scheduleOpt} disabled={committing} onChange={(e) => setScheduleOpt(e.target.checked)} />
                <span>
                  Schedule dates after commit
                  {started > 0 && <span className="block text-xs text-muted-foreground">{started} task{started === 1 ? " has" : "s have"} already started; scheduling re-dates every auto-scheduled task in the project.</span>}
                </span>
              </label>
              <label className={cn("flex items-start gap-2", !scheduleOpt && "opacity-50")}>
                <input type="checkbox" className="mt-1" checked={scheduleOpt && setStartOpt} disabled={committing || !scheduleOpt} onChange={(e) => setSetStartOpt(e.target.checked)} />
                <span>
                  Set project start date to {projectStart}
                  {projectHasStart && <span className="block text-xs text-muted-foreground">The project already has a start date; leave this off to keep it.</span>}
                </span>
              </label>
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={committing}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={committing} onClick={(e) => { e.preventDefault(); void commit(); }}>
              {committing && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Commit
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Label + date input used by the options bar. */
export function DateField({ label, value, onChange, hint, required }: { label: string; value: string; onChange: (v: string) => void; hint?: string; required?: boolean }) {
  return (
    <div>
      <Label className="mb-1 block text-xs text-muted-foreground">{label}{required && !value ? " (required)" : ""}</Label>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="w-44" aria-invalid={required && !value} />
      {hint && !value && <p className="mt-1 max-w-48 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
