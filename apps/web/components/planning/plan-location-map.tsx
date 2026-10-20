"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCheck, EyeOff, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { usePlanningPermissions } from "@/hooks/use-planning-permissions";
import type { BridgeBoqLine } from "@/lib/planning/activity-library/qs-bridge";
import {
  canonicalLevel,
  isProjectWideLabel,
  locationKey,
  suggestLocationMap,
  wbsLevelCanonical,
  type BoqLocation,
  type LocationRow,
  type LocationStatus,
  type SavedLocation,
  type SplitRule,
  type WbsLevel,
} from "@/lib/planning/activity-library/location-map";
import {
  clearLocation,
  listLevelGfa,
  listSavedLocations,
  listWbsLevels,
  saveLocations,
  type LocationDecision,
} from "@/lib/planning/activity-library/location-map-service";
import { EmptyNote } from "./plan-act-shared";

const STATUS: Record<LocationStatus, { label: string; cls: string }> = {
  confirmed: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-700" },
  split: { label: "Split", cls: "bg-emerald-100 text-emerald-700" },
  ignored: { label: "Ignored", cls: "bg-slate-100 text-slate-600" },
  suggested: { label: "Suggested", cls: "bg-sky-100 text-sky-700" },
  unmatched: { label: "Choose a level", cls: "bg-amber-100 text-amber-700" },
  ambiguous: { label: "Several match", cls: "bg-amber-100 text-amber-700" },
  project_wide: { label: "Project-wide", cls: "bg-amber-100 text-amber-700" },
};

const SPLIT_LABEL: Record<SplitRule, string> = {
  none: "Not per level (does not drive durations)",
  equal: "Share equally over the building's levels",
  gfa: "Share by each level's GFA",
};

/** BOQ location (building + level label) -> WBS level node, per project. Doc 21 Phase 2. */
export function PlanLocationMap({ projectId, lines }: { projectId: string; lines: BridgeBoqLine[] }) {
  const db = useMemo(() => createClient(), []);
  const { canEditSchedule } = usePlanningPermissions();
  const [levels, setLevels] = useState<WbsLevel[] | null>(null);
  const [saved, setSaved] = useState<SavedLocation[]>([]);
  const [gfa, setGfa] = useState<Map<string, number>>(new Map());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [l, s, g] = await Promise.all([listWbsLevels(db, projectId), listSavedLocations(db, projectId), listLevelGfa(db, projectId)]);
      setLevels(l);
      setSaved(s);
      setGfa(g);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load the location map");
      setLevels([]);
    }
  }, [db, projectId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const locations = useMemo<BoqLocation[]>(() => {
    const m = new Map<string, BoqLocation>();
    for (const l of lines) {
      const k = locationKey(l.building_code, l.level);
      const cur = m.get(k) ?? { building_code: l.building_code ?? "", qs_level_label: l.level ?? "", lines: 0 };
      cur.lines++;
      m.set(k, cur);
    }
    const rank = (label: string) => canonicalLevel(label)?.rank ?? 5000;
    return [...m.values()].sort((a, b) => a.building_code.localeCompare(b.building_code) || rank(a.qs_level_label) - rank(b.qs_level_label) || a.qs_level_label.localeCompare(b.qs_level_label));
  }, [lines]);

  const rows = useMemo(() => (levels ? suggestLocationMap(locations, levels, saved) : []), [locations, levels, saved]);

  const levelById = useMemo(() => new Map((levels ?? []).map((l) => [l.id, l])), [levels]);
  const sortedLevels = useMemo(
    () => [...(levels ?? [])].sort((a, b) => (wbsLevelCanonical(a)?.rank ?? 5000) - (wbsLevelCanonical(b)?.rank ?? 5000) || a.wbs_code.localeCompare(b.wbs_code)),
    [levels],
  );
  const mappedNodes = new Set(rows.map((r) => r.wbs_node_id).filter(Boolean));
  const levelsWithoutBoq = sortedLevels.filter((l) => !mappedNodes.has(l.id));
  const suggested = rows.filter((r) => r.status === "suggested");
  const open = rows.filter((r) => r.status === "unmatched" || r.status === "ambiguous" || r.status === "project_wide").length;

  async function persist(decisions: LocationDecision[], msg?: string) {
    setBusy(true);
    try {
      await saveLocations(db, projectId, decisions);
      if (msg) toast.success(msg);
      setSaved(await listSavedLocations(db, projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function reset(r: LocationRow) {
    setBusy(true);
    try {
      await clearLocation(db, projectId, r.building_code, r.qs_level_label);
      setSaved(await listSavedLocations(db, projectId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setBusy(false);
    }
  }

  const decision = (r: LocationRow, patch: Partial<LocationDecision>): LocationDecision => ({
    building_code: r.building_code,
    qs_level_label: r.qs_level_label,
    wbs_node_id: r.wbs_node_id,
    status: "confirmed",
    split_rule: r.split_rule,
    ...patch,
  });

  if (!levels) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (locations.length === 0) return <EmptyNote>This project has no tender BOQ lines.</EmptyNote>;
  if (levels.length === 0) return <EmptyNote>This project has no WBS level nodes yet. Build the WBS (levels under a building) first.</EmptyNote>;

  const readOnly = !canEditSchedule;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs text-muted-foreground">
          Which WBS level each BOQ location is. Levels are read as the company standard (B01, G00, M01, L01…, R00); only <b>confirmed</b> rows are used to put quantities on floors.
        </p>
        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", open ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
          {open ? `${open} need a decision` : "All locations decided"}
        </span>
        {!readOnly && suggested.length > 0 && (
          <Button
            size="sm"
            className="ml-auto h-8 rounded-lg"
            disabled={busy}
            onClick={() => void persist(suggested.map((r) => decision(r, {})), `Confirmed ${suggested.length} suggested levels`)}
          >
            <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Confirm {suggested.length} suggestions
          </Button>
        )}
      </div>

      <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
        <thead>
          <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
            <th className="px-3 py-2">BOQ location</th><th className="px-3 py-2">Reads as</th><th className="px-3 py-2 text-right">Lines</th>
            <th className="px-3 py-2">WBS level</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const projectWide = isProjectWideLabel(r.qs_level_label);
            const options = r.candidates.length > 0 ? sortedLevels.filter((l) => r.candidates.includes(l.id)) : sortedLevels;
            return (
              <tr key={r.key} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <span className="font-mono text-xs">{r.building_code || "—"} · {r.qs_level_label || "(blank)"}</span>
                </td>
                <td className="px-3 py-1.5 font-mono text-xs">{r.canonical ?? <span className="text-muted-foreground">?</span>}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{r.lines}</td>
                <td className="px-3 py-1.5">
                  {projectWide ? (
                    <select
                      disabled={readOnly || busy || r.status === "ignored"}
                      value={r.split_rule}
                      onChange={(e) => void persist([decision(r, { wbs_node_id: null, split_rule: e.target.value as SplitRule, status: "confirmed" })])}
                      className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-60"
                    >
                      {(Object.keys(SPLIT_LABEL) as SplitRule[]).map((s) => (
                        <option key={s} value={s} disabled={s === "gfa" && gfa.size === 0}>{SPLIT_LABEL[s]}{s === "gfa" && gfa.size === 0 ? " (no GFA recorded)" : ""}</option>
                      ))}
                    </select>
                  ) : (
                    <select
                      disabled={readOnly || busy || r.status === "ignored"}
                      value={r.wbs_node_id ?? ""}
                      onChange={(e) => { if (e.target.value) void persist([decision(r, { wbs_node_id: e.target.value, split_rule: "none" })]); }}
                      className={cn(
                        "w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-primary disabled:opacity-60",
                        r.status === "suggested" ? "border-sky-300" : "border-border",
                      )}
                    >
                      <option value="">Choose a level…</option>
                      {options.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.wbs_code} · {l.wbs_name}{wbsLevelCanonical(l) ? ` (${wbsLevelCanonical(l)!.code})` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", STATUS[r.status].cls)}>{STATUS[r.status].label}</span>
                  {r.status === "confirmed" && r.wbs_node_id && levelById.get(r.wbs_node_id) && r.canonical && wbsLevelCanonical(levelById.get(r.wbs_node_id)!)?.code !== r.canonical && (
                    <div className="mt-0.5 text-[10px] text-amber-600">Reads {r.canonical} but mapped to another level</div>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right">
                  {!readOnly && (
                    <>
                      {r.status === "suggested" && (
                        <button type="button" disabled={busy} title="Confirm" className="mr-2 text-sky-700 hover:text-sky-900" onClick={() => void persist([decision(r, {})])}>
                          <CheckCheck className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {r.status !== "ignored" && (
                        <button
                          type="button"
                          disabled={busy}
                          title="Ignore: these BOQ lines never drive durations"
                          className="mr-2 text-muted-foreground hover:text-foreground"
                          onClick={() => void persist([decision(r, { status: "ignored", wbs_node_id: null, split_rule: "none" })])}
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {(r.status === "confirmed" || r.status === "split" || r.status === "ignored") && (
                        <button type="button" disabled={busy} title="Undo the decision" className="text-muted-foreground hover:text-foreground" onClick={() => void reset(r)}>
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {levelsWithoutBoq.length > 0 && (
        <p className="text-xs text-muted-foreground">
          WBS levels no BOQ location points to (their activities will have no BOQ quantity):{" "}
          {levelsWithoutBoq.map((l) => `${l.wbs_code} ${l.wbs_name}`).join(", ")}
        </p>
      )}
      {readOnly && <p className="text-xs text-muted-foreground">You need Schedule edit permission to change the location map.</p>}
    </div>
  );
}
