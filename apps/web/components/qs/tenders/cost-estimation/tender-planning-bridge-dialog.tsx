"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { Loader2, GitMerge, ArrowRight, ExternalLink, Calendar, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import {
  listBridgeRules,
  listProjectBoqLines,
  listSavedLocations,
  listWbsLevels,
  listLevelGfa,
  loadMasterRates,
  listManualPairs,
  countBridgeLinks,
  applyBridgeLinks,
  refreshTaskWorkFromLinks,
  computeBridgeLinks,
  type BridgeBoqLine,
  type BridgeRule,
  type SavedLocation,
  type WbsLevel,
  type MasterRate,
  type BridgeCalcResult,
} from "@/lib/planning/public";

interface Props {
  tenderId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

const WG_LABEL: Record<string, string> = {
  EW: "Earthwork",
  FD: "Foundation",
  ST: "Structure",
  WP: "Waterproofing",
  AR: "Architecture",
  M1: "MEP 1st Fix",
  M2: "MEP 2nd Fix",
  ME: "MEP",
  QA: "QA & Inspection",
};

export function TenderPlanningBridgeDialog({ tenderId, open, onOpenChange, onSuccess }: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [tenderProject, setTenderProject] = useState<{
    id: string;
    projectId: string | null;
    projectName: string | null;
    projectCode: string | null;
  } | null>(null);

  const [rules, setRules] = useState<BridgeRule[]>([]);
  const [lines, setLines] = useState<BridgeBoqLine[]>([]);
  const [levels, setLevels] = useState<WbsLevel[]>([]);
  const [savedLocs, setSavedLocs] = useState<SavedLocation[]>([]);
  const [gfaByNode, setGfaByNode] = useState<Map<string, number>>(new Map());
  const [rates, setRates] = useState<MasterRate[]>([]);
  const [manualPairs, setManualPairs] = useState<Set<string>>(new Set());
  const [appliedStats, setAppliedStats] = useState<{ count: number; at: string | null }>({ count: 0, at: null });

  // Load tender project and planning context
  const load = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      // 1. Get tender project ID
      const { data: t, error: tErr } = await supabase
        .from("tender_register")
        .select("id, project_id, projects(id, name, project_code)")
        .eq("id", tenderId)
        .single();
      if (tErr) throw new Error(tErr.message);

      // Many-to-one embed: PostgREST returns one object, the generated type says array.
      const proj = t?.projects as unknown as { id: string; name: string; project_code: string } | null;
      setTenderProject({
        id: t.id,
        projectId: t.project_id,
        projectName: proj?.name ?? null,
        projectCode: proj?.project_code ?? null,
      });

      if (!t.project_id) {
        setLoading(false);
        return;
      }

      const pId = t.project_id;

      // 2. Parallel load bridge requirements
      const [r, l, lvls, saved, gfa, mRates, manual, applied] = await Promise.all([
        listBridgeRules(supabase),
        listProjectBoqLines(supabase, pId),
        listWbsLevels(supabase, pId),
        listSavedLocations(supabase, pId),
        listLevelGfa(supabase, pId),
        loadMasterRates(supabase),
        listManualPairs(supabase, pId),
        countBridgeLinks(supabase, pId),
      ]);

      setRules(r);
      setLines(l);
      setLevels(lvls);
      setSavedLocs(saved);
      setGfaByNode(gfa);
      setRates(mRates);
      setManualPairs(manual);
      setAppliedStats(applied);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [open, supabase, tenderId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Compute live bridge calculations
  const calc: BridgeCalcResult | null = useMemo(() => {
    if (!tenderProject?.projectId || lines.length === 0 || rules.length === 0) return null;
    return computeBridgeLinks(lines, rules, savedLocs, levels, gfaByNode, manualPairs);
  }, [tenderProject, lines, rules, savedLocs, levels, gfaByNode, manualPairs]);

  // Summary per master activity
  const activitySummary = useMemo(() => {
    if (!calc || rates.length === 0) return [];
    const rateByMetric = new Map(rates.map((r) => [r.metric, r]));

    const metricTotals = new Map<string, { qty: number; unit: string; levelCount: Set<string> }>();
    for (const q of calc.quantities) {
      const cur = metricTotals.get(q.metric) || { qty: 0, unit: q.unit, levelCount: new Set() };
      cur.qty += q.quantity;
      cur.levelCount.add(q.wbs_node_id);
      metricTotals.set(q.metric, cur);
    }

    return Array.from(metricTotals.entries())
      .map(([metric, dat]) => {
        const rate = rateByMetric.get(metric);
        const normOutput = rate?.output_per_day ?? null;
        const totalDurationDays =
          normOutput && normOutput > 0 ? Math.ceil(dat.qty / normOutput) : null;

        return {
          metric,
          workGroup: rate?.work_group || "ST",
          masterCode: rate?.master_code || metric,
          masterName: rate?.master_name || metric,
          totalQty: dat.qty,
          unit: dat.unit,
          levelCount: dat.levelCount.size,
          outputPerDay: normOutput,
          calculatedDays: totalDurationDays,
        };
      })
      .sort((a, b) => a.workGroup.localeCompare(b.workGroup) || a.masterCode.localeCompare(b.masterCode));
  }, [calc, rates]);

  // Execute Bridge Apply
  async function handleApplyBridge() {
    if (!calc || !tenderProject?.projectId) return;
    setRunning(true);
    try {
      const n = await applyBridgeLinks(supabase, tenderProject.projectId, calc.links);
      const r = await refreshTaskWorkFromLinks(supabase, tenderProject.projectId, rates);

      toast.success(
        `Planning Bridge synced: ${n} quantity links written. Task Work durations updated on ${r.updated} schedule activities!`
      );
      await load();
      if (onSuccess) onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const confirmedLocations = savedLocs.filter((s) => s.status === "confirmed").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <GitMerge className="h-5 w-5 text-blue-600" />
            Sync with Planning Schedule (QS Bridge)
          </DialogTitle>
          <DialogDescription>
            Translate Tender BOQ quantities into schedule tasks and calculated durations based on approved productivity standards.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm text-muted-foreground">Evaluating Planning Bridge rules and locations...</p>
          </div>
        ) : !tenderProject?.projectId ? (
          <div className="p-6 text-center space-y-3">
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <div className="font-semibold text-base">Tender Not Linked to a Project</div>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              This tender does not have a linked Project ID. Please assign this tender to a project in Tender Settings so its BOQ quantities can feed into the project schedule.
            </p>
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {/* Project Link Banner */}
            <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/40">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-semibold text-foreground">Target Project Schedule:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {tenderProject.projectCode}
                </Badge>
                <span className="text-xs font-medium">{tenderProject.projectName}</span>
              </div>
              <Link
                href="/dashboard/planning/activity-library/qs-bridge"
                target="_blank"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
              >
                Open Full QS Bridge <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            {/* Bridge Status Cards */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 text-center">
                <div className="text-2xl font-bold text-blue-600">{calc?.links.length ?? 0}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Matched BOQ Links</div>
              </div>
              <div className="p-3 rounded-lg border bg-emerald-50/50 dark:bg-emerald-950/20 text-center">
                <div className="text-2xl font-bold text-emerald-600">{confirmedLocations} / {levels.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Confirmed Floors (LBS)</div>
              </div>
              <div className="p-3 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20 text-center">
                <div className="text-2xl font-bold text-purple-600">{activitySummary.length}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Calculated Schedule Activities</div>
              </div>
            </div>

            {/* Location Notice if any unallocated */}
            {calc && calc.unallocatedLines > 0 && (
              <div className="p-2.5 rounded-md border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {calc.unallocatedLines} BOQ lines have unconfirmed locations. They will not drive schedule durations until confirmed on the Location Map.
                </span>
              </div>
            )}

            {/* Calculated Activities Preview Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Quantity-Driven Schedule Durations Preview
                </span>
                <span className="text-[11px] text-muted-foreground">
                  {appliedStats.count > 0
                    ? `Last synced: ${new Date(appliedStats.at ?? "").toLocaleString()}`
                    : "Never synced"}
                </span>
              </div>

              <div className="border rounded-md divide-y max-h-60 overflow-y-auto text-xs bg-card">
                {activitySummary.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    No matching activity master rules found for current BOQ lines.
                  </div>
                ) : (
                  activitySummary.map((item) => (
                    <div key={item.metric} className="p-2.5 flex items-center justify-between hover:bg-muted/40">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                            {WG_LABEL[item.workGroup] ?? item.workGroup}
                          </Badge>
                          <span className="font-semibold text-foreground">{item.masterName}</span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Total Qty: <strong className="font-mono text-foreground">{item.totalQty.toLocaleString(undefined, { maximumFractionDigits: 1 })} {item.unit}</strong> across {item.levelCount} levels
                        </div>
                      </div>

                      <div className="text-right">
                        {item.calculatedDays !== null ? (
                          <div className="font-mono font-bold text-foreground">
                            {item.calculatedDays} <span className="text-[11px] font-normal text-muted-foreground">wd (total)</span>
                          </div>
                        ) : (
                          <span className="text-amber-600 text-[11px] font-medium">No standard norm</span>
                        )}
                        <div className="text-[10px] text-muted-foreground">
                          {item.outputPerDay ? `Norm: ${item.outputPerDay} ${item.unit}/day` : "Needs calibration"}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between pt-2 border-t">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={running}>
            Close
          </Button>

          {tenderProject?.projectId && (
            <div className="flex items-center gap-2">
              <Link href="/dashboard/planning/gantt" target="_blank">
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  View Gantt Chart <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
              <Button
                onClick={handleApplyBridge}
                disabled={running || !calc || calc.links.length === 0}
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 font-semibold"
              >
                {running ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Syncing Schedule...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Write Quantities to Schedule
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

