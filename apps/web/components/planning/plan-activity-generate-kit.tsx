"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { listTemplates } from "@/lib/planning/activity-library/library-service";
import {
  commitKitGeneration, createSiteNode, inferLevelType, listLevelNodes, listRuns, loadActivityCounts, previewKitGeneration,
  type KitPreview, type LevelNode, type RunRow,
} from "@/lib/planning/activity-library/generation-service";
import { listKitItems, listKits, listScopeTree, listTemplateConditions, type ScopeTreeRow } from "@/lib/planning/activity-library/kit-service";
import { evaluateApplicability } from "@/lib/planning/activity-library/applicability";
import type { ApplicabilityRule } from "@/lib/planning/activity-library/types";
import {
  codesToOverrides, loadGenerationProfile, overridesToCodes, saveGenerationProfile, startingKit, topUpScope, type GenerationProfile,
} from "@/lib/planning/activity-library/generation-profile";
import { assignTemplates, groupScope, pickTemplateVersion, recommendedKit, type Kit, type KitItem } from "@/lib/planning/activity-library/kit-plan";
import { partLabel } from "@/lib/planning/activity-library/part-labels";
import type { ActTemplate } from "@/lib/planning/activity-library/types";
import { loadProjectKind } from "@/lib/planning/activity-steps-service";
import { buildingTypeLabel, sectorLabel } from "@/lib/project-categories";
import { settingsHref } from "@/lib/project/projects/project-routes";
import { groupBySectorFit, type ProjectKind } from "@/lib/template-fit";
import { useProject } from "@/components/dashboard/project-context";
import { CodeChip, EmptyNote, STATUS_LABEL } from "./plan-act-shared";
import { ConfidencePill, REASON_LABEL } from "./plan-act-confidence";
import { valueLabel } from "./plan-act-master-editors";
import { PlanningChoicesFields, usePlanningChoices } from "./plan-planning-choices";
import { describeUnmet, effectiveChoices } from "@/lib/planning/activity-library/planning-choices";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

const MAX_ROWS = 300;

/**
 * Generate › By kit: the project's WBS as a tree (building or route › levels / chainage sections), each row with
 * the templates of its part from the kit, one preview and one run for the whole scope (Generate plan G3).
 */
export function PlanActivityGenerateKit() {
  const router = useRouter();
  const db = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject } = useProject();
  const [kits, setKits] = useState<Kit[]>([]);
  const [templates, setTemplates] = useState<ActTemplate[]>([]);
  const [kitId, setKitId] = useState("");
  const [kitItems, setKitItems] = useState<KitItem[]>([]);
  const [nodes, setNodes] = useState<LevelNode[]>([]);
  const [tree, setTree] = useState<ScopeTreeRow[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [projectKind, setProjectKind] = useState<ProjectKind>({});
  // the planner's planning choices; suggestions fill the rest (planning-choices.ts)
  const [picks, setPicks] = useState<Record<string, string>>({});
  const catalogue = usePlanningChoices();
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // template ids per node chosen by the planner; a node without an entry follows the kit
  const [overrides, setOverrides] = useState<Record<string, string[]>>({});
  const [linkLevels, setLinkLevels] = useState(true);
  const [preview, setPreview] = useState<KitPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const itemsSeq = useRef(0);
  // conditions of every template: pick between a part's alternatives (pitched / flat roof...) by the planning choices
  const [conditions, setConditions] = useState<Record<string, ApplicabilityRule[]>>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [addingSite, setAddingSite] = useState(false);
  // G6: what Generate last used for the project, the applied WBS template's kit, activities Generate already made per row
  const [profile, setProfile] = useState<GenerationProfile | null>(null);
  const [wbsKitCode, setWbsKitCode] = useState<string | null>(null);
  const [pendingOverrides, setPendingOverrides] = useState<Record<string, string[]> | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let live = true;
    Promise.all([listKits(db), listTemplates(db), listTemplateConditions(db)])
      .then(([k, t, c]) => { if (live) { setKits(k.filter((x) => x.status !== "superseded" && x.status !== "archived")); setTemplates(t); setConditions(c); } })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load kits"));
    return () => { live = false; };
  }, [db]);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    Promise.all([
      listLevelNodes(db, selectedProjectId, { includeSite: true }), listScopeTree(db, selectedProjectId), listRuns(db, selectedProjectId),
      loadProjectKind(db, selectedProjectId), loadGenerationProfile(db, selectedProjectId),
    ])
      .then(async ([n, t, r, kind, prof]) => {
        const c = await loadActivityCounts(db, selectedProjectId, n.map((x) => x.id), t);
        if (!live) return;
        setNodes(n); setTree(t); setRuns(r); setProjectKind(kind); setCounts(c);
        // top-up: rows Generate already filled start unticked
        setPicked(new Set(topUpScope(n.map((x) => x.id), c).picked));
        setProfile(prof.profile); setWbsKitCode(prof.wbsKitCode);
        setKitId(""); setPicks(prof.profile?.picks ?? {}); setLinkLevels(prof.profile?.link_levels ?? true);
        setOverrides({}); setPendingOverrides(prof.profile?.overrides ?? null); setPreview(null);
      })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load the project WBS"));
    return () => { live = false; };
  }, [db, selectedProjectId, reloadKey]);

  const recommended = useMemo(() => recommendedKit(kits, projectKind), [kits, projectKind]);
  const starting = useMemo(() => startingKit(kits, profile?.kit_code, wbsKitCode, recommended), [kits, profile, wbsKitCode, recommended]);
  const effectiveKitId = kitId || starting?.id || "";
  const kitSource = kitId ? null : profile?.kit_code && starting?.code === profile.kit_code ? "remembered"
    : wbsKitCode && starting?.code === wbsKitCode ? "WBS template" : starting ? "best fit" : null;

  // remembered row overrides are stored as template codes: map them once templates and nodes are loaded
  useEffect(() => {
    if (!pendingOverrides || templates.length === 0 || nodes.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off restore of the saved profile
    setOverrides(codesToOverrides(pendingOverrides, templates, new Set(nodes.map((n) => n.id))));
    setPendingOverrides(null);
  }, [pendingOverrides, templates, nodes]);
  const kit = kits.find((k) => k.id === effectiveKitId) ?? null;

  useEffect(() => {
    const seq = ++itemsSeq.current;
    if (!effectiveKitId) return;
    listKitItems(db, effectiveKitId)
      .then((rows) => { if (seq === itemsSeq.current) { setKitItems(rows); setPreview(null); } })
      .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to load the kit"));
  }, [db, effectiveKitId]);

  const attributes = useMemo(() => effectiveChoices(catalogue, projectKind, picks), [catalogue, projectKind, picks]);
  const parts = useMemo(() => nodes.map((n) => ({ id: n.id, part: inferLevelType(n) })), [nodes]);
  const fromKit = useMemo(
    () => assignTemplates(parts, kit ? kitItems : [], projectKind.buildingType, templates,
      (t) => evaluateApplicability(conditions[t.id] ?? [], attributes).applicable),
    [parts, kit, kitItems, projectKind.buildingType, templates, conditions, attributes],
  );
  const hasSite = nodes.some((n) => n.level_type === "site");
  const kitHasSite = !!kit && kitItems.some((i) => i.part === "site");
  const assigned = (id: string) => overrides[id] ?? fromKit[id] ?? [];
  const groups = useMemo(() => groupScope(nodes, tree), [nodes, tree]);
  const templateById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  // one entry per code (the version Generate uses), for adding a template to a row
  const pickable = useMemo(() => [...new Set(templates.map((t) => t.code))].map((c) => pickTemplateVersion(templates, c)).filter((t): t is ActTemplate => !!t), [templates]);

  const scope = nodes.filter((n) => picked.has(n.id) && assigned(n.id).length > 0);
  const withActivities = nodes.filter((n) => (counts[n.id] ?? 0) > 0);
  const onlyMissing = withActivities.length > 0 && withActivities.every((n) => !picked.has(n.id));
  const unassigned = nodes.filter((n) => picked.has(n.id) && assigned(n.id).length === 0);

  const changed = () => setPreview(null);
  const toggle = (ids: string[], on: boolean) => { setPicked((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }); changed(); };
  const setRow = (id: string, next: string[]) => { setOverrides((o) => ({ ...o, [id]: next })); changed(); };
  const resetRow = (id: string) => { setOverrides((o) => { const n = { ...o }; delete n[id]; return n; }); changed(); };

  async function addSite() {
    if (!selectedProjectId) return;
    setAddingSite(true);
    try {
      await createSiteNode(db, selectedProjectId);
      toast.success("External Works node added to the WBS");
      setReloadKey((k) => k + 1);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not add the node"); } finally { setAddingSite(false); }
  }

  async function runPreview() {
    if (!selectedProjectId || scope.length === 0) { toast.error("Tick at least one level that has a template"); return; }
    setBusy(true);
    try {
      setPreview(await previewKitGeneration(db, {
        projectId: selectedProjectId,
        kit: kit ? { id: kit.id, code: kit.code, version: kit.version, status: kit.status } : null,
        assignments: Object.fromEntries(scope.map((n) => [n.id, assigned(n.id)])),
        attributes, linkLevels,
      }));
      setForce(false);
      // remember the kit, choices and row overrides for the next run (needs planning edit rights; non-fatal)
      saveGenerationProfile(db, selectedProjectId, {
        kit_code: kit?.code ?? null, picks, overrides: overridesToCodes(overrides, templates), link_levels: linkLevels,
      }).catch(() => undefined);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Preview failed"); } finally { setBusy(false); }
  }

  async function generate() {
    if (!preview) return;
    setBusy(true);
    try {
      const { runId, steps, stepsError } = await commitKitGeneration(db, preview);
      toast.success("Draft activities generated" + (steps && steps.applied > 0 ? `; ${steps.applied} got their step template (${steps.steps} steps)` : ""));
      if (stepsError) toast.warning(`Activities were generated, but their step templates could not be added: ${stepsError}. Use Step Templates › Apply to Activities.`);
      router.push(`/dashboard/planning/activity-library/runs/${runId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); setBusy(false); }
  }

  if (!selectedProjectId) return <div className="p-6"><EmptyNote>Select a project in the header to generate activities.</EmptyNote></div>;

  const notApplicable = preview?.groups.filter((g) => !g.applicability.applicable) ?? [];
  const nodeName = new Map(nodes.map((n) => [n.id, n.wbs_name]));
  const templateOfItem = (tid: string) => preview?.groups.find((g) => g.input.template.id === tid)?.templateCode ?? "";

  return (
    <div className="grid h-full min-h-0 grid-cols-[440px_1fr]">
      <aside className="space-y-5 overflow-y-auto border-r border-border bg-card p-5">
        <div className="rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
          {projectKind.sector || projectKind.buildingType ? (
            <><span className="font-medium">{sectorLabel(projectKind.sector) || "No sector"}</span>
              {projectKind.buildingType && <> · <span className="font-medium">{buildingTypeLabel(projectKind.buildingType)}</span></>}
              <span className="block text-muted-foreground">From the project&apos;s settings.</span></>
          ) : (
            <span className="text-amber-700">
              This project has no sector or building type yet, so no kit can be recommended. Set them in the project&apos;s{" "}
              {selectedProject ? <Link className="font-medium underline" href={settingsHref(selectedProject.project_code)}>Settings</Link> : "Settings"}.
            </span>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Kit</span>
            <Link href="/dashboard/planning/activity-library/kits" className="font-normal text-primary hover:underline">Open Kits</Link>
          </div>
          <select className={selectCls} value={effectiveKitId} onChange={(e) => { setKitId(e.target.value); setOverrides({}); }}>
            {kits.length === 0 && <option value="">No kits</option>}
            {groupBySectorFit(kits, projectKind).map((g) => {
              const options = g.items.map((k) => <option key={k.id} value={k.id}>{k.code} — {k.name} (v{k.version}, {STATUS_LABEL[k.status].toLowerCase()})</option>);
              return g.label ? <optgroup key={g.label} label={g.label}>{options}</optgroup> : options;
            })}
          </select>
          {kitSource && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {kitSource === "remembered" ? `Kit and choices remembered from the last run${profile?.updated_at ? ` (${new Date(profile.updated_at).toLocaleDateString()})` : ""}.`
                : kitSource === "WBS template" ? "Kit of the WBS template this project was built from." : "Best fit for the project's building type."}
            </p>
          )}
          {kit && kit.status !== "active" && kit.status !== "approved" && (
            <p className="mt-1 text-xs text-amber-700">Draft kit: preview it now; a Planning Manager approves it (and its templates) before activities are generated.</p>
          )}
        </div>

        <PlanningChoicesFields catalogue={catalogue} kind={projectKind} picks={picks} onChange={(p) => { setPicks(p); changed(); }} />

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Scope ({picked.size}/{nodes.length})</span>
            {withActivities.length > 0 && (
              <label className="ml-auto mr-3 flex items-center gap-1 font-normal" title="Rows Generate already filled are left out; an activity that exists is never created twice anyway">
                <input type="checkbox" checked={onlyMissing} onChange={(e) => {
                  setPicked(new Set(e.target.checked ? nodes.filter((n) => !((counts[n.id] ?? 0) > 0)).map((n) => n.id) : nodes.map((n) => n.id)));
                  changed();
                }} />
                Only what is missing
              </label>
            )}
            <span className="space-x-2 font-normal">
              <button className="text-primary" onClick={() => toggle(nodes.map((n) => n.id), true)}>All</button>
              <button className="text-primary" onClick={() => toggle(nodes.map((n) => n.id), false)}>None</button>
            </span>
          </div>
          {nodes.length === 0 ? <EmptyNote>This project has no levels or chainage sections in its WBS.</EmptyNote> : (
            <div className="space-y-2">
              {groups.map((g) => {
                const ids = g.nodes.map((n) => n.id);
                const all = ids.every((id) => picked.has(id));
                return (
                  <div key={g.key} className="rounded-md border border-border">
                    <label className="flex cursor-pointer items-center gap-2 border-b border-border bg-muted/40 px-2 py-1.5 text-sm font-medium">
                      <input type="checkbox" checked={all} onChange={() => toggle(ids, !all)} />
                      <span className="flex-1 truncate">{g.label}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">{ids.filter((id) => picked.has(id)).length}/{ids.length}</span>
                    </label>
                    {g.nodes.map((n) => {
                      const tids = assigned(n.id);
                      const part = inferLevelType(n);
                      const own = overrides[n.id] !== undefined;
                      return (
                        <div key={n.id} className={cn("border-b border-border px-2 py-1.5 last:border-b-0", !picked.has(n.id) && "opacity-50")}>
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle([n.id], !picked.has(n.id))} />
                            <span className="flex-1 truncate">{n.wbs_name}</span>
                            {(counts[n.id] ?? 0) > 0 && <span className="rounded bg-muted px-1 text-[10px] text-muted-foreground" title="Activities Generate already created on this row">{counts[n.id]} generated</span>}
                            <span className="text-[11px] text-muted-foreground">{partLabel(part, projectKind) || "no level type"}</span>
                          </label>
                          <div className="mt-1 flex flex-wrap items-center gap-1 pl-6">
                            {tids.map((tid) => {
                              const t = templateById.get(tid);
                              return (
                                <span key={tid} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]", t && t.status === "draft" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-border bg-background")}
                                  title={t ? `${t.name} · v${t.version} ${t.status}` : tid}>
                                  {t?.code ?? "?"}
                                  <button type="button" aria-label="Remove template" onClick={() => setRow(n.id, tids.filter((x) => x !== tid))}><X className="h-3 w-3" /></button>
                                </span>
                              );
                            })}
                            {tids.length === 0 && <span className="text-[11px] text-amber-700">No template in the kit for this part</span>}
                            <select className="h-6 rounded border border-input bg-background px-1 text-[11px]" value=""
                              onChange={(e) => { const t = e.target.value; if (t && !tids.includes(t)) setRow(n.id, [...tids, t]); }}>
                              <option value="">+ template</option>
                              <optgroup label="Made for this part">
                                {pickable.filter((t) => part && t.applies_to_level_types?.includes(part)).map((t) => <option key={t.id} value={t.id}>{t.code}{t.status === "draft" ? " (draft)" : ""}</option>)}
                              </optgroup>
                              <optgroup label="Other templates">
                                {pickable.filter((t) => !part || !t.applies_to_level_types?.includes(part)).map((t) => <option key={t.id} value={t.id}>{t.code}{t.status === "draft" ? " (draft)" : ""}</option>)}
                              </optgroup>
                            </select>
                            {own && <button type="button" className="inline-flex items-center gap-0.5 text-[11px] text-primary" onClick={() => resetRow(n.id)}><RotateCcw className="h-3 w-3" /> kit</button>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
          {kitHasSite && !hasSite && nodes.length > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-md border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground">
              <span>The kit has external works, but the WBS has no External Works node.</span>
              <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" disabled={addingSite} onClick={() => void addSite()}>Add node</Button>
            </div>
          )}
          {unassigned.length > 0 && <p className="mt-1 text-[11px] text-amber-700">{unassigned.length} ticked level{unassigned.length === 1 ? " has" : "s have"} no template and will be left out.</p>}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={linkLevels} onChange={(e) => { setLinkLevels(e.target.checked); changed(); }} />
          Link consecutive levels when a template defines it
        </label>

        <Button className="w-full" onClick={runPreview} disabled={busy || scope.length === 0}>
          {busy && !preview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Preview {scope.length} level{scope.length === 1 ? "" : "s"}
        </Button>

        {runs.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Previous runs</div>
            {runs.slice(0, 8).map((r) => (
              <button key={r.id} className="mb-1 flex w-full items-center justify-between rounded-md border border-border px-3 py-1.5 text-left text-sm hover:border-primary"
                onClick={() => router.push(`/dashboard/planning/activity-library/runs/${r.id}`)}>
                <span className="font-mono text-xs text-primary">#{r.run_no}{r.kit_id && r.library_snapshot?.kit?.code ? ` · ${r.library_snapshot.kit.code}` : ""}</span>
                <span className="text-xs text-muted-foreground">{r.total_count} · {r.low_count + r.review_count} to review</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="min-h-0 overflow-auto p-6">
        {!preview ? (
          <EmptyNote>Check the templates on each level, then preview. One run covers the whole scope; nothing is written until you press Generate.</EmptyNote>
        ) : (
          <>
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ["Activities", preview.counts.total, ""],
                ["High confidence", preview.counts.high, "text-emerald-600"],
                ["Review", preview.counts.review, "text-amber-600"],
                ["Low / missing data", preview.counts.low, "text-red-600"],
                ["Skipped (already there)", preview.counts.warnings, "text-muted-foreground"],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-lg border border-border bg-card p-3 text-center"><div className={`font-mono text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
              ))}
            </div>

            <div className="mb-4 overflow-hidden rounded-lg border border-border bg-card text-sm">
              <div className="border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase text-muted-foreground">Templates in this run</div>
              {preview.groups.map((g) => (
                <div key={g.input.template.id} className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5 last:border-b-0">
                  <CodeChip code={g.templateCode} />
                  <span className="text-xs text-muted-foreground">v{g.input.template.version} · {g.templateStatus}</span>
                  <span className="flex-1 truncate text-xs">{g.nodes.map((n) => n.wbs_name).join(", ")}</span>
                  <span className="text-xs tabular-nums">{g.result.tasks.length} activities</span>
                </div>
              ))}
            </div>

            {preview.blockers.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Preview only: {preview.blockers.join("; ")}. A Planning Manager approves drafts in Activity Library › Kits and › Templates; then this scope can be generated.
              </div>
            )}
            {notApplicable.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Template conditions not met:{" "}
                {notApplicable.map((g) => `${g.templateCode} needs ${describeUnmet(g.applicability.results, catalogue, (a, v) => valueLabel(a, v, catalogue)).join(", ")}`).join("; ")}.
                Their activities are marked low confidence; set the planning choices on the left, or
                <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> generate anyway</label>
              </div>
            )}

            <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
              <thead><tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                <th className="px-3 py-2">Level</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Template</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2">Reasons</th>
              </tr></thead>
              <tbody>
                {preview.items.slice(0, MAX_ROWS).map((it, i) => {
                  const t = preview.tasks[i];
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-3 py-1.5">{nodeName.get(it.node_id)}</td>
                      <td className="px-3 py-1.5"><CodeChip code={t.task_code.split("@")[0]} /> <span className="text-muted-foreground">{t.task_name}</span></td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{templateOfItem(it.template_id)}</td>
                      <td className="px-3 py-1.5">{it.quantity != null ? `${it.quantity} ${it.unit ?? ""}` : "—"}</td>
                      <td className="px-3 py-1.5">{it.duration_days != null ? `${it.duration_days} d` : "—"}</td>
                      <td className="px-3 py-1.5"><ConfidencePill value={it.confidence} /></td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{it.reasons.map((r) => REASON_LABEL[r]).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.items.length > MAX_ROWS && <p className="mt-2 text-xs text-muted-foreground">Showing the first {MAX_ROWS} of {preview.items.length}.</p>}
            {preview.skipped.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {preview.skipped.length} skipped because the level already has them
                {preview.skipped.some((s) => s.reason === "master") && <> ({preview.skipped.filter((s) => s.reason === "master").length} from the same activity master, e.g. added by a WBS template)</>}.
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <Button disabled={busy || preview.tasks.length === 0 || preview.blockers.length > 0 || (notApplicable.length > 0 && !force)} onClick={generate}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {preview.blockers.length > 0 ? "Preview only (drafts)" : `Generate ${preview.tasks.length} draft activities in one run`}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
