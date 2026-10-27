"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProject } from "@/components/dashboard/project-context";
import { createClient } from "@/lib/supabase/client";
import { listCsiDivisions, listCsiSections, type CsiDivision, type CsiSection } from "@/lib/csi-divisions";
import { canManageLibraries } from "@/lib/planning/activity-library/qs-bridge-service";
import { getProjectReadiness, type ProjectReadiness, type ReadinessSource } from "@/lib/planning/boq-programme/readiness-service";
import { previewBoqProgramme, type ProgrammePreview } from "@/lib/planning/boq-programme/boq-programme-service";
import { loadPreviewContext, type PreviewContext } from "@/lib/planning/boq-programme/preview-context";
import { getLineTarget } from "@/lib/planning/boq-programme/line-targets";
import {
  defaultReadinessSource, filterSortBlocking, fixKind, reasonCounts, REASON_LABEL, REASONS, STAGE_ORDER, type BlockingSort,
} from "@/lib/planning/boq-programme/readiness-view";
import type { BlockingLine, ReadinessReason } from "@/lib/planning/boq-programme/readiness";
import { BoqProgrammePreview, DateField } from "./boq-programme-preview";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BoqItemDetailDialog } from "@/components/planning/activity-database/boq-item-detail-dialog";
import { SELECT_CLS } from "@/components/planning/activity-database/activity-database-shared";
import { cn } from "@/lib/utils";

const QS_BRIDGE_HREF = "/dashboard/planning/activity-library/qs-bridge";
const PAGE = 200;

const errorText = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

function ProgressRow({ label, pct, lines, total }: { label: string; pct: number; lines: number; total: number }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground"><span className="font-medium text-foreground">{v.toFixed(1)}%</span> by value · {lines.toLocaleString()} of {total.toLocaleString()} lines</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full", v >= 100 ? "bg-primary" : "bg-primary/70")} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

/** Generate from BOQ (doc 24, phase 1): how ready the project BOQ is to drive a programme, and what blocks it. */
export function BoqProgrammeView() {
  const db = useMemo(() => createClient(), []);
  const router = useRouter();
  const { selectedProjectId, selectedProject, setSelectedProjectId, loading: projectLoading } = useProject();
  // Deep link from the QS bid approval / award: ?project=<id>&source=tender|contract
  const params = useSearchParams();
  const linkedProject = params.get("project");
  const linkedSource = params.get("source");
  useEffect(() => {
    if (linkedProject && linkedProject !== selectedProjectId) setSelectedProjectId(linkedProject);
    // only when the link changes, so the user can still switch project afterwards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedProject]);
  const [source, setSource] = useState<ReadinessSource | null>(linkedSource === "tender" || linkedSource === "contract" ? linkedSource : null);
  const effectiveSource: ReadinessSource = source ?? defaultReadinessSource(selectedProject?.project_status);
  const [state, setState] = useState<{ key: string; data: ProjectReadiness | null; error: string | null } | null>(null);
  const [tick, setTick] = useState(0);
  const [currency, setCurrency] = useState<string>("");
  const [reason, setReason] = useState<ReadinessReason | "all">("all");
  const [sort, setSort] = useState<BlockingSort>("amount_desc");
  const [shown, setShown] = useState(PAGE);
  const [busyLine, setBusyLine] = useState<string | null>(null);
  const [crew, setCrew] = useState("4");
  const [start, setStart] = useState("");
  const [plan, setPlan] = useState<{ preview: ProgrammePreview; ctx: PreviewContext; run: number; params: string; tick: number } | null>(null);
  const [runCounter, setRunCounter] = useState(0);
  const [projectHasStart, setProjectHasStart] = useState(false);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [confirmAnyway, setConfirmAnyway] = useState(false);

  const [divisions, setDivisions] = useState<CsiDivision[]>([]);
  const [sections, setSections] = useState<CsiSection[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [boqId, setBoqId] = useState<string | null>(null);
  useEffect(() => {
    listCsiDivisions(db).then(setDivisions).catch(() => setDivisions([]));
    listCsiSections(db).then(setSections).catch(() => setSections([]));
    void canManageLibraries(db).then(setCanManage);
  }, [db]);

  useEffect(() => {
    if (!selectedProjectId) return;
    db.from("projects").select("currency, start_date").eq("id", selectedProjectId).maybeSingle().then(({ data }) => {
      const p = data as { currency: string | null; start_date: string | null } | null;
      setCurrency(p?.currency ?? "");
      setStart(p?.start_date ?? "");
      setProjectHasStart(!!p?.start_date);
    });
  }, [db, selectedProjectId]);

  const key = `${selectedProjectId}|${effectiveSource}|${tick}`;
  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    try { setState({ key, data: await getProjectReadiness(db, selectedProjectId, { source: effectiveSource }), error: null }); }
    catch (e) { setState({ key, data: null, error: errorText(e, "Could not load the readiness report") }); }
  }, [db, selectedProjectId, effectiveSource, key]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const loaded = state?.key === key ? state : null;
  const report = loaded?.data ?? null;
  const money = (n: number) => `${currency ? `${currency} ` : ""}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  const blocking = useMemo(() => (report ? filterSortBlocking(report.blocking, reason, sort) : []), [report, reason, sort]);
  const counts = useMemo(() => (report ? reasonCounts(report.blocking) : null), [report]);
  const isReady = !!report && report.totalLines > 0 && report.blocking.length === 0;

  const crewNumber = Number(crew);
  const crewValid = Number.isInteger(crewNumber) && crewNumber > 0;

  /** What the preview was built from: a change in any of these makes it out of date. */
  const previewParams = `${effectiveSource}|${crew}|${start}`;

  async function runPreview() {
    if (!selectedProjectId || !crewValid) return;
    setPlanning(true);
    setPlanError(null);
    try {
      const preview = await previewBoqProgramme(db, selectedProjectId, { source: effectiveSource, defaultCrew: crewNumber });
      const ctx = await loadPreviewContext(db, selectedProjectId, preview);
      setPlan({ preview, ctx, run: runCounter + 1, params: previewParams, tick });
      setRunCounter((n) => n + 1);
    } catch (e) { setPlanError(errorText(e, "Could not build the preview")); } finally { setPlanning(false); }
  }

  async function fix(line: BlockingLine) {
    const kind = fixKind(line.primary);
    setBusyLine(line.lineId);
    try {
      const target = await getLineTarget(db, effectiveSource, line.lineId);
      if (kind === "mapping") {
        if (target.tenderId) router.push(`/dashboard/tenders/cost-estimation?tender=${target.tenderId}&tab=boq_mapping`);
        else toast.message("Contract lines are mapped to a BOQ item in the QS BOQ.");
      } else if (target.workItemId) {
        setBoqId(target.workItemId);
      } else {
        toast.error("This line is not mapped to a BOQ item yet.");
      }
    } catch (e) { toast.error(errorText(e, "Could not open the fix")); } finally { setBusyLine(null); }
  }

  if (projectLoading) return <Skeleton className="h-48 w-full" />;
  if (!selectedProjectId) {
    return <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">Select a project in the header to see how ready its BOQ is for a programme.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5" role="group" aria-label="BOQ source">
          {(["tender", "contract"] as const).map((s) => (
            <Button key={s} size="sm" variant={effectiveSource === s ? "default" : "ghost"} onClick={() => { setSource(s); setReason("all"); setShown(PAGE); }}>
              {s === "tender" ? "Tender BOQ" : "Contract BOQ"}
            </Button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => { setState(null); setTick((n) => n + 1); }}><RefreshCw className="mr-1 h-4 w-4" /> Refresh</Button>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <Label className="mb-1 block text-xs text-muted-foreground">Default crew (workers)</Label>
          <Input type="number" min={1} step={1} className="w-32" value={crew} onChange={(e) => setCrew(e.target.value)} aria-invalid={!crewValid} />
          {!crewValid && <p className="mt-1 text-xs text-destructive">Whole number above 0</p>}
        </div>
        <DateField label="Project start date" value={start} onChange={setStart} required hint="This project has no start date. Enter one to commit." />
        <Button disabled={!report || planning || !crewValid} onClick={() => (report && report.blocking.length === 0 ? void runPreview() : setConfirmAnyway(true))}>
          {planning && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Preview programme
        </Button>
        {report && report.blocking.length > 0 && <span className="text-xs text-muted-foreground">Not fully ready: lines that block will be left out or flagged.</span>}
      </div>
      {planError && (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-4 text-sm"><p className="text-destructive">{planError}</p><Button size="sm" variant="outline" onClick={() => void runPreview()}>Retry</Button></div>
      )}
      {plan && plan.preview.projectId === selectedProjectId && (
        <BoqProgrammePreview
          key={plan.run} stale={plan.params !== previewParams || plan.tick !== tick} projectHasStart={projectHasStart} db={db} projectId={selectedProjectId} preview={plan.preview} ctx={plan.ctx} divisions={divisions}
          projectStart={start} money={money} onCommitted={() => { setState(null); setTick((n) => n + 1); }}
        />
      )}
      <AlertDialog open={confirmAnyway} onOpenChange={setConfirmAnyway}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Preview before the BOQ is ready?</AlertDialogTitle>
            <AlertDialogDescription>{report?.blocking.length.toLocaleString()} BOQ line{report?.blocking.length === 1 ? "" : "s"} still block the programme. The preview will leave them out or flag them with warnings.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runPreview()}>Preview anyway</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!loaded ? (
        <div className="space-y-3"><Skeleton className="h-40 w-full" /><Skeleton className="h-64 w-full" /></div>
      ) : loaded.error || !report ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm">
          <p className="text-destructive">{loaded.error}</p>
          <Button size="sm" variant="outline" onClick={() => { setState(null); setTick((n) => n + 1); }}>Retry</Button>
        </div>
      ) : report.totalLines === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          This project has no {effectiveSource === "tender" ? "tender" : "contract"} BOQ lines yet. Switch the source above to check the other BOQ.
        </p>
      ) : (
        <>
          <section className="space-y-4 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-primary">Programme readiness</h2>
                <p className="text-sm text-muted-foreground">{report.totalLines.toLocaleString()} lines · total BOQ value {money(report.totalValue)}</p>
              </div>
              {isReady ? (
                <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Ready</Badge>
              ) : (
                <Badge variant="secondary">{report.ready.lines.toLocaleString()} of {report.totalLines.toLocaleString()} lines ready ({report.ready.pct.toFixed(1)}% by value)</Badge>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {STAGE_ORDER.map((s) => <ProgressRow key={s.key} label={s.label} pct={report.stages[s.key].pct} lines={report.stages[s.key].lines} total={report.totalLines} />)}
            </div>
          </section>

          {report.blocking.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-sm font-semibold text-primary">Blocking lines ({blocking.length.toLocaleString()}{reason !== "all" ? ` of ${report.blocking.length.toLocaleString()}` : ""})</h2>
                <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
                  Reason
                  <select className={`${SELECT_CLS} w-56`} value={reason} onChange={(e) => { setReason(e.target.value as ReadinessReason | "all"); setShown(PAGE); }}>
                    <option value="all">All reasons</option>
                    {REASONS.filter((r) => (counts?.[r] ?? 0) > 0).map((r) => <option key={r} value={r}>{REASON_LABEL[r]} ({counts?.[r]})</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  Sort
                  <select className={`${SELECT_CLS} w-44`} value={sort} onChange={(e) => setSort(e.target.value as BlockingSort)}>
                    <option value="amount_desc">Amount, high to low</option>
                    <option value="amount_asc">Amount, low to high</option>
                    <option value="code">Item code</option>
                  </select>
                </label>
              </div>
              <div className="overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Item code</TableHead><TableHead>Description</TableHead><TableHead className="text-right">Amount</TableHead>
                      <TableHead>Reasons</TableHead><TableHead className="w-40 text-right">Fix</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {blocking.slice(0, shown).map((l) => {
                      const kind = fixKind(l.primary);
                      return (
                        <TableRow key={l.lineId}>
                          <TableCell className="font-mono text-xs">{l.itemCode}</TableCell>
                          <TableCell className="max-w-md truncate" title={l.description}>{l.description}</TableCell>
                          <TableCell className="text-right tabular-nums">{money(l.amount)}</TableCell>
                          <TableCell><div className="flex flex-wrap gap-1">{l.reasons.map((r) => <Badge key={r} variant={r === l.primary ? "default" : "secondary"}>{REASON_LABEL[r]}</Badge>)}</div></TableCell>
                          <TableCell className="text-right">
                            {kind === "location" ? (
                              <Button size="sm" variant="outline" render={<Link href={QS_BRIDGE_HREF} />}>Open QS Bridge</Button>
                            ) : kind === "mapping" && effectiveSource === "contract" ? (
                              <span className="text-xs text-muted-foreground">Map it in the QS BOQ</span>
                            ) : (
                              <Button size="sm" variant="outline" disabled={busyLine === l.lineId} onClick={() => void fix(l)}>
                                {busyLine === l.lineId && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}{kind === "mapping" ? "Open tender" : "Open BOQ item"}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              {shown < blocking.length && <div className="flex justify-center"><Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAGE)}>Show more ({blocking.length - shown} left)</Button></div>}
            </section>
          )}
        </>
      )}

      {boqId && (
        <BoqItemDetailDialog
          db={db} workItemId={boqId} list={[]} divisions={divisions} sections={sections} canManage={canManage} initialTab="activities"
          onNavigate={setBoqId} onClose={() => setBoqId(null)} onChanged={() => setTick((n) => n + 1)}
        />
      )}
    </div>
  );
}
