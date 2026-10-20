"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { bridgeCoverage, type BridgeBoqLine, type BridgeRule, type UnmappedGroup } from "@/lib/planning/activity-library/qs-bridge";
import {
  canManageLibraries,
  deleteBridgeRule,
  listBridgeRules,
  listProjectBoqLines,
  loadMastersByMetric,
  saveBridgeRule,
  type BridgeRuleDraft,
} from "@/lib/planning/activity-library/qs-bridge-service";
import { CodeChip, EmptyNote } from "./plan-act-shared";
import { PlanLocationMap } from "./plan-location-map";
import { PlanBridgeQuantities } from "./plan-bridge-quantities";

type Tab = "coverage" | "locations" | "quantities" | "rules";

const TAB_LABEL: Record<Tab, string> = {
  coverage: "Project BOQ coverage",
  locations: "Location map",
  quantities: "Quantities & durations",
  rules: "Bridge rules",
};

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString() : (Math.round(n * 100) / 100).toLocaleString());

const blankRule = (sort: number): BridgeRuleDraft => ({
  role: "driver",
  metric_code: "",
  metric_unit: "",
  unit_factor: 1,
  match_discipline: null,
  match_section: null,
  match_sub_section: null,
  match_sub_element: null,
  match_unit: null,
  note: null,
  is_active: true,
  sort_order: sort,
});

/** Planning <-> QS bridge (doc 21): which QS elements feed which activity quantity metric, and how well a project's BOQ is covered. */
export function PlanQsBridge() {
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [tab, setTab] = useState<Tab>("coverage");
  const [rules, setRules] = useState<BridgeRule[] | null>(null);
  const [mastersByMetric, setMastersByMetric] = useState<Map<string, string[]>>(new Map());
  const [lines, setLines] = useState<BridgeBoqLine[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [editing, setEditing] = useState<BridgeRuleDraft | null>(null);

  const loadRules = useCallback(async () => {
    try {
      const [r, m, can] = await Promise.all([listBridgeRules(db), loadMastersByMetric(db), canManageLibraries(db)]);
      setRules(r);
      setMastersByMetric(m);
      setCanEdit(can);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load bridge rules");
    }
  }, [db]);

  const loadLines = useCallback(async () => {
    if (!selectedProjectId) { setLines([]); return; }
    setLines(null);
    try { setLines(await listProjectBoqLines(db, selectedProjectId)); } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load BOQ"); setLines([]); }
  }, [db, selectedProjectId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- loaders set state after awaiting
  useEffect(() => { void loadRules(); }, [loadRules]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loaders set state after awaiting
  useEffect(() => { void loadLines(); }, [loadLines]);

  const coverage = useMemo(
    () => (rules && lines ? bridgeCoverage(lines, rules, mastersByMetric) : null),
    [rules, lines, mastersByMetric],
  );

  function ruleFromGroup(g: UnmappedGroup): BridgeRuleDraft {
    return {
      ...blankRule((rules?.length ?? 0) * 10 + 1000),
      match_discipline: g.discipline,
      match_sub_section: g.sub_section,
      match_sub_element: g.sub_element,
      match_unit: g.unit,
    };
  }

  async function handleSave(r: BridgeRuleDraft) {
    try {
      await saveBridgeRule(db, r);
      toast.success("Bridge rule saved");
      setEditing(null);
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save rule");
    }
  }

  async function handleDelete(r: BridgeRule) {
    if (!confirm("Delete this bridge rule? BOQ lines it matched become unmapped.")) return;
    try {
      await deleteBridgeRule(db, r.id);
      await loadRules();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete rule");
    }
  }

  if (!rules) return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["coverage", "locations", "quantities", "rules"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold",
              tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t === "rules" ? `${TAB_LABEL.rules} (${rules.length})` : TAB_LABEL[t]}
          </button>
        ))}
        <p className="ml-2 text-xs text-muted-foreground">
          A BOQ line&apos;s Element Library classification picks its rule; the rule converts the quantity into the metric an Activity Master measures. Duration then = quantity at the level ÷ productivity.
        </p>
      </div>

      {tab === "locations" ? (
        !selectedProjectId ? <EmptyNote>Select a project in the header.</EmptyNote>
        : !lines ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : <PlanLocationMap projectId={selectedProjectId} lines={lines} />
      ) : tab === "quantities" ? (
        !selectedProjectId ? <EmptyNote>Select a project in the header.</EmptyNote>
        : !lines ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : <PlanBridgeQuantities projectId={selectedProjectId} lines={lines} rules={rules} />
      ) : tab === "coverage" ? (
        !selectedProjectId ? <EmptyNote>Select a project in the header to check its BOQ.</EmptyNote>
        : !coverage ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : coverage.totalLines === 0 ? <EmptyNote>This project has no tender BOQ lines.</EmptyNote>
        : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="BOQ lines" value={coverage.totalLines} />
              <Stat label="Feed a metric" value={coverage.driverLines} tone="good" />
              <Stat label="Excluded (not drivers)" value={coverage.excludedLines} />
              <Stat label="Unmapped" value={coverage.unmappedLines} tone={coverage.unmappedLines ? "warn" : undefined} />
              <Stat label="Unit mismatch" value={coverage.mismatchLines} tone={coverage.mismatchLines ? "bad" : undefined} />
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Quantity by metric (whole project)</h3>
              <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                    <th className="px-3 py-2">Metric</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2 text-right">BOQ lines</th><th className="px-3 py-2">Used by activity</th>
                  </tr>
                </thead>
                <tbody>
                  {coverage.metrics.map((m) => (
                    <tr key={m.metric} className="border-t border-border">
                      <td className="px-3 py-1.5 font-mono text-xs">{m.metric}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{fmt(m.quantity)} {m.unit}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{m.lines}</td>
                      <td className="px-3 py-1.5">
                        {m.masters.length > 0
                          ? <span className="flex flex-wrap gap-2">{m.masters.map((c) => <CodeChip key={c} code={c} />)}</span>
                          : <span className="inline-flex items-center gap-1 text-xs text-amber-600"><AlertTriangle className="h-3 w-3" /> No Activity Master measures this yet</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Lines no rule covers</h3>
              {coverage.unmapped.length === 0 ? <EmptyNote>Every BOQ line feeds a metric or is excluded.</EmptyNote> : (
                <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                      <th className="px-3 py-2">Discipline › Section</th><th className="px-3 py-2">Sub Section › Sub Element</th>
                      <th className="px-3 py-2 text-right">Lines</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2">Problem</th><th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.unmapped.map((g) => (
                      <tr key={g.key} className="border-t border-border">
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">{[g.discipline, g.section].filter(Boolean).join(" › ") || "—"}</td>
                        <td className="px-3 py-1.5">{[g.sub_section, g.sub_element].filter(Boolean).join(" › ") || <span className="text-muted-foreground">not classified</span>}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{g.lines}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(g.quantity)} {g.unit}</td>
                        <td className="px-3 py-1.5 text-xs">
                          {g.status === "unit_mismatch"
                            ? <span className="text-red-600">Unit {g.unit} but rule expects {g.expectedUnit}</span>
                            : <span className="text-amber-600">No rule</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {canEdit && (g.sub_section || g.sub_element) && (
                            <Button size="sm" variant="outline" className="h-7 rounded-md text-xs" onClick={() => setEditing(ruleFromGroup(g))}>
                              <Plus className="mr-1 h-3 w-3" /> Rule
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )
      ) : (
        <section className="space-y-2">
          {canEdit && (
            <Button size="sm" className="rounded-lg" onClick={() => setEditing(blankRule((rules.at(-1)?.sort_order ?? 0) + 10))}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New rule
            </Button>
          )}
          <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
            <thead>
              <tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                <th className="px-3 py-2">When the BOQ line is</th><th className="px-3 py-2">Unit</th><th className="px-3 py-2">It feeds</th>
                <th className="px-3 py-2 text-right">× factor</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Note</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className={cn("border-t border-border", !r.is_active && "opacity-50")}>
                  <td className="px-3 py-1.5">
                    {[r.match_sub_section, r.match_sub_element].filter(Boolean).join(" › ")}
                    {(r.match_discipline || r.match_section) && (
                      <div className="text-[10px] text-muted-foreground">{[r.match_discipline, r.match_section].filter(Boolean).join(" › ")}</div>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs">{r.match_unit ?? "any"}</td>
                  <td className="px-3 py-1.5">
                    {r.role === "excluded"
                      ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">Excluded</span>
                      : <span className="font-mono text-xs">{r.metric_code} <span className="text-muted-foreground">({r.metric_unit})</span></span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.role === "excluded" ? "" : r.unit_factor}</td>
                  <td className="px-3 py-1.5">
                    {r.metric_code && (mastersByMetric.get(r.metric_code) ?? []).map((c) => <CodeChip key={c} code={c} />)}
                    {r.role === "driver" && r.metric_code && !mastersByMetric.has(r.metric_code) && <span className="text-xs text-amber-600">none yet</span>}
                  </td>
                  <td className="max-w-[260px] truncate px-3 py-1.5 text-xs text-muted-foreground" title={r.note ?? ""}>{r.note}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    {canEdit && (
                      <>
                        <button type="button" className="mr-2 text-muted-foreground hover:text-foreground" onClick={() => setEditing({ ...r })}><Pencil className="h-3.5 w-3.5" /></button>
                        <button type="button" className="text-muted-foreground hover:text-red-500" onClick={() => void handleDelete(r)}><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!canEdit && <p className="text-xs text-muted-foreground">Only Master Library managers can change bridge rules.</p>}
        </section>
      )}

      {editing && (
        <RuleDialog
          rule={editing}
          metrics={[...new Set([...rules.map((r) => r.metric_code).filter((m): m is string => !!m), ...mastersByMetric.keys()])].sort()}
          onClose={() => setEditing(null)}
          onSave={(r) => void handleSave(r)}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-lg font-semibold tabular-nums", tone === "good" && "text-emerald-600", tone === "warn" && "text-amber-600", tone === "bad" && "text-red-600")}>{value}</div>
    </div>
  );
}

function RuleDialog({ rule, metrics, onClose, onSave }: { rule: BridgeRuleDraft; metrics: string[]; onClose: () => void; onSave: (r: BridgeRuleDraft) => void }) {
  const [r, setR] = useState<BridgeRuleDraft>(rule);
  const set = <K extends keyof BridgeRuleDraft>(k: K, v: BridgeRuleDraft[K]) => setR((p) => ({ ...p, [k]: v }));
  const input = "w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-primary";
  const valid = (r.match_sub_section?.trim() || r.match_sub_element?.trim()) && (r.role === "excluded" || (r.metric_code?.trim() && r.metric_unit?.trim() && r.unit_factor > 0));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{r.id ? "Edit bridge rule" : "New bridge rule"}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Match on the BOQ line&apos;s Element Library fields. Leave a field empty to accept any value; the most specific matching rule wins.</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Discipline</span><input className={input} value={r.match_discipline ?? ""} onChange={(e) => set("match_discipline", e.target.value)} /></label>
            <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Section</span><input className={input} value={r.match_section ?? ""} onChange={(e) => set("match_section", e.target.value)} /></label>
            <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Sub Section</span><input className={input} value={r.match_sub_section ?? ""} onChange={(e) => set("match_sub_section", e.target.value)} /></label>
            <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Sub Element</span><input className={input} value={r.match_sub_element ?? ""} onChange={(e) => set("match_sub_element", e.target.value)} /></label>
            <label className="space-y-1"><span className="text-[11px] text-muted-foreground">BOQ unit</span><input className={input} value={r.match_unit ?? ""} onChange={(e) => set("match_unit", e.target.value)} placeholder="any" /></label>
            <label className="space-y-1">
              <span className="text-[11px] text-muted-foreground">Role</span>
              <select className={input} value={r.role} onChange={(e) => set("role", e.target.value as BridgeRuleDraft["role"])}>
                <option value="driver">Feeds a metric</option>
                <option value="excluded">Excluded (not a duration driver)</option>
              </select>
            </label>
          </div>
          {r.role === "driver" && (
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-1 space-y-1">
                <span className="text-[11px] text-muted-foreground">Metric</span>
                <input className={input} list="bridge-metrics" value={r.metric_code ?? ""} onChange={(e) => set("metric_code", e.target.value)} />
                <datalist id="bridge-metrics">{metrics.map((m) => <option key={m} value={m} />)}</datalist>
              </label>
              <label className="space-y-1"><span className="text-[11px] text-muted-foreground">Metric unit</span><input className={input} value={r.metric_unit ?? ""} onChange={(e) => set("metric_unit", e.target.value)} placeholder="t, m², m³" /></label>
              <label className="space-y-1"><span className="text-[11px] text-muted-foreground">× factor</span><input type="number" step="any" min={0} className={input} value={r.unit_factor} onChange={(e) => set("unit_factor", Number(e.target.value) || 0)} /></label>
            </div>
          )}
          <label className="block space-y-1"><span className="text-[11px] text-muted-foreground">Note (state any assumption, e.g. a split)</span><input className={input} value={r.note ?? ""} onChange={(e) => set("note", e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={r.is_active} onChange={(e) => set("is_active", e.target.checked)} /> Active</label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={() => onSave(r)}>Save rule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
