"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import { buildPreview, computeBridgeLinks, type MasterRate } from "@/lib/planning/activity-library/bridge-calc";
import {
  applyBridgeLinks,
  countBridgeLinks,
  listManualPairs,
  loadMasterRates,
  refreshTaskWorkFromLinks,
} from "@/lib/planning/activity-library/bridge-calc-service";
import { wbsLevelCanonical, type SavedLocation, type WbsLevel } from "@/lib/planning/activity-library/location-map";
import { listLevelGfa, listSavedLocations, listWbsLevels } from "@/lib/planning/activity-library/location-map-service";
import type { BridgeBoqLine, BridgeRule } from "@/lib/planning/activity-library/qs-bridge";
import { CodeChip, EmptyNote } from "./plan-act-shared";

const WG_LABEL: Record<string, string> = {
  EW: "Earthwork", FD: "Foundation", ST: "Structural", WP: "Waterproofing", AR: "Architectural",
  M1: "MEP first fix", M2: "MEP second fix", ME: "MEP", QA: "Testing & inspection",
};

const fmtQty = (n: number) => (n >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toLocaleString());

/** Per-level quantities and one-crew durations from the BOQ, and Apply (doc 21, Phase 3). */
export function PlanBridgeQuantities({ projectId, lines, rules }: { projectId: string; lines: BridgeBoqLine[]; rules: BridgeRule[] }) {
  const db = useMemo(() => createClient(), []);
  const { canEditSchedule } = usePlanningPermissions();
  const [ctx, setCtx] = useState<{
    levels: WbsLevel[]; saved: SavedLocation[]; gfa: Map<string, number>; rates: MasterRate[]; manual: Set<string>;
    applied: { count: number; at: string | null };
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [levels, saved, gfa, rates, manual, applied] = await Promise.all([
        listWbsLevels(db, projectId), listSavedLocations(db, projectId), listLevelGfa(db, projectId),
        loadMasterRates(db), listManualPairs(db, projectId), countBridgeLinks(db, projectId),
      ]);
      setCtx({ levels, saved, gfa, rates, manual, applied });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, [db, projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const calc = useMemo(
    () => (ctx ? computeBridgeLinks(lines, rules, ctx.saved, ctx.levels, ctx.gfa, ctx.manual) : null),
    [ctx, lines, rules],
  );
  const rows = useMemo(() => (calc && ctx ? buildPreview(calc.quantities, ctx.rates) : []), [calc, ctx]);
  const columns = useMemo(() => {
    if (!ctx || !calc) return [];
    const used = new Set(calc.quantities.map((q) => q.wbs_node_id));
    return ctx.levels
      .filter((l) => used.has(l.id))
      .sort((a, b) => (wbsLevelCanonical(a)?.rank ?? 5000) - (wbsLevelCanonical(b)?.rank ?? 5000) || a.wbs_code.localeCompare(b.wbs_code));
  }, [ctx, calc]);

  async function handleApply() {
    if (!calc || !ctx) return;
    if (!confirm(`Write ${calc.links.length} BOQ quantity links for ${columns.length} levels? This replaces the project's previous QS Bridge links; links a planner confirmed by hand are kept.`)) return;
    setBusy(true);
    try {
      const n = await applyBridgeLinks(db, projectId, calc.links);
      const r = await refreshTaskWorkFromLinks(db, projectId, ctx.rates);
      toast.success(
        `${n} quantity links written.` +
        (r.updated ? ` Task Work updated on ${r.updated} existing activities.` : "") +
        (r.keptManual ? ` ${r.keptManual} kept their hand-entered quantity.` : ""),
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply");
    } finally {
      setBusy(false);
    }
  }

  if (!ctx || !calc) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const confirmedLocations = ctx.saved.filter((s) => s.status === "confirmed").length;
  if (confirmedLocations === 0) {
    return <EmptyNote>No BOQ location is confirmed yet. Confirm the floors on the <b>Location map</b> tab first: only confirmed locations put quantities on levels.</EmptyNote>;
  }

  const groups = new Map<string, typeof rows>();
  for (const r of rows) groups.set(r.rate.work_group ?? "", [...(groups.get(r.rate.work_group ?? "") ?? []), r]);
  const noRate = rows.filter((r) => r.rate.duration_basis === "quantity" && r.rate.output_per_day == null).length;
  const draft = rows.filter((r) => r.rate.norm_status === "draft").length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-muted px-2 py-0.5">{calc.links.length} links from BOQ to {columns.length} levels</span>
        {calc.unallocatedLines > 0 && (
          <span className="rounded bg-amber-100 px-2 py-0.5 font-semibold text-amber-700" title={[...calc.unallocatedByLocation.entries()].map(([k, v]) => `${k}: ${v}`).join("\n")}>
            {calc.unallocatedLines} driver lines at unconfirmed locations
          </span>
        )}
        {calc.skippedManual > 0 && <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-700">{calc.skippedManual} level/metric pairs kept as linked by hand</span>}
        {draft > 0 && <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600">{draft} activities use a draft productivity standard</span>}
        {noRate > 0 && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">{noRate} without a productivity standard</span>}
        <span className="text-muted-foreground">
          {ctx.applied.count > 0 ? `Last applied ${new Date(ctx.applied.at ?? "").toLocaleString()} (${ctx.applied.count} links)` : "Not applied yet"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {ctx.applied.count > 0 && (
            <Link href="/dashboard/planning/activity-library/generate" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              Generate activities <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {canEditSchedule && (
            <Button size="sm" className="h-8 rounded-lg" disabled={busy || calc.links.length === 0} onClick={() => void handleApply()}>
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
              Apply quantities
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Quantity per level from the confirmed location map and the bridge rules; days are for <b>one crew</b> at the productivity standard generation would use (crews and dates are set later in Task Work / the schedule).
      </p>

      {rows.length === 0 ? <EmptyNote>No bridged quantity reaches a confirmed level yet.</EmptyNote> : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse bg-card text-xs">
            <thead>
              <tr className="bg-muted/50 text-[10px] font-semibold uppercase text-muted-foreground">
                <th className="sticky left-0 z-10 min-w-[260px] bg-muted px-3 py-2 text-left">Activity · metric · rate</th>
                {columns.map((l) => (
                  <th key={l.id} className="min-w-[78px] px-2 py-2 text-right">
                    <div>{wbsLevelCanonical(l)?.code ?? l.wbs_code}</div>
                    <div className="font-normal normal-case text-muted-foreground/80">{l.wbs_code}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...groups.entries()].map(([wg, list]) => (
                <GroupRows key={wg || "none"} label={WG_LABEL[wg] ?? (wg || "No work group")} rows={list} columns={columns} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GroupRows({ label, rows, columns }: { label: string; rows: ReturnType<typeof buildPreview>; columns: WbsLevel[] }) {
  return (
    <>
      <tr className="border-t border-border bg-muted/30">
        <td colSpan={columns.length + 1} className="sticky left-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</td>
      </tr>
      {rows.map(({ rate, cells }) => (
        <tr key={`${rate.master_id}|${rate.metric}`} className="border-t border-border">
          <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
            <div className="flex items-center gap-2"><CodeChip code={rate.master_code} /> <span className="truncate">{rate.master_name}</span></div>
            <div className="text-[10px] text-muted-foreground">
              <span className="font-mono">{rate.metric}</span>
              {" · "}
              {rate.duration_basis !== "quantity"
                ? <span>{rate.duration_basis} duration</span>
                : rate.output_per_day == null
                  ? <span className="inline-flex items-center gap-0.5 text-amber-600"><AlertTriangle className="h-2.5 w-2.5" /> no productivity standard</span>
                  : <span>{Math.round(rate.output_per_day * 100) / 100} {rate.unit}/day · {rate.norm_code}{rate.norm_status === "draft" ? " (draft)" : ""}</span>}
            </div>
          </td>
          {columns.map((l) => {
            const c = cells.get(l.id);
            return (
              <td key={l.id} className={cn("px-2 py-1.5 text-right tabular-nums", !c && "text-muted-foreground/40")} title={c ? `${c.lines} BOQ line${c.lines === 1 ? "" : "s"}` : undefined}>
                {c ? (
                  <>
                    <div className="font-semibold">{c.days != null ? `${c.days} d` : "—"}</div>
                    <div className="text-[10px] text-muted-foreground">{fmtQty(c.quantity)} {c.unit}</div>
                  </>
                ) : "·"}
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}
