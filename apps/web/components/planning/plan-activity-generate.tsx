"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { listTemplates } from "@/lib/planning/activity-library/library-service";
import {
  GENERATE_STATUSES, canGenerateFrom, commitGeneration, inferLevelType, listLevelNodes, listRuns, previewGeneration,
  type GenerationPreview, type LevelNode, type RunRow,
} from "@/lib/planning/activity-library/generation-service";
import type { ActTemplate } from "@/lib/planning/activity-library/types";
import { CodeChip, EmptyNote } from "./plan-act-shared";
import { valueLabel } from "./plan-act-master-editors";
import { PlanActivityScenarios } from "./plan-activity-scenarios";
import type { ScenarioVariant } from "@/lib/planning/activity-library/scenario-compare";
import { ConfidencePill, REASON_LABEL } from "./plan-act-confidence";
import { loadProjectKind } from "@/lib/planning/activity-steps-service";
import { buildingTypeLabel, sectorLabel } from "@/lib/project-categories";
import { groupBySectorFit, sectorListFit, type ProjectKind } from "@/lib/template-fit";
import { partLabel } from "@/lib/planning/activity-library/part-labels";
import { settingsHref } from "@/lib/project/projects/project-routes";
import { cn } from "@/lib/utils";
import { PlanActivityGenerateKit } from "./plan-activity-generate-kit";
import { PlanningChoicesFields, usePlanningChoices } from "./plan-planning-choices";
import { describeUnmet, effectiveChoices } from "@/lib/planning/activity-library/planning-choices";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

type Mode = "kit" | "single";
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "kit", label: "By kit", hint: "Whole building in one run: every level gets the templates of its part" },
  { id: "single", label: "Single template", hint: "One template on the levels you pick, with what-if scenarios" },
];

/** Generate: by kit (one run per building, default) or one template at a time (with scenarios). */
export function PlanActivityGenerate() {
  const [mode, setMode] = useState<Mode>("kit");
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-5 py-2">
        {MODES.map((m) => (
          <button key={m.id} type="button" title={m.hint} onClick={() => setMode(m.id)}
            className={cn("rounded-md px-3 py-1 text-sm", mode === m.id ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground hover:text-foreground")}>
            {m.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground">{MODES.find((m) => m.id === mode)?.hint}</span>
      </div>
      <div className="min-h-0 flex-1">{mode === "kit" ? <PlanActivityGenerateKit /> : <GenerateSingle />}</div>
    </div>
  );
}

function GenerateSingle() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId, selectedProject } = useProject();
  const [templates, setTemplates] = useState<ActTemplate[]>([]);
  const [nodes, setNodes] = useState<LevelNode[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  // the planner's planning choices; suggestions fill the rest (planning-choices.ts)
  const [picks, setPicks] = useState<Record<string, string>>({});
  const catalogue = usePlanningChoices();
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [linkLevels, setLinkLevels] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [scenario, setScenario] = useState<{ name: string; variant: ScenarioVariant } | null>(null);
  // The project's sector / building type: applicability attributes and template recommendation.
  const [projectKind, setProjectKind] = useState<ProjectKind>({});

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const t = (await listTemplates(supabase)).filter((x) => (GENERATE_STATUSES as readonly string[]).includes(x.status));
        if (!live) return;
        setTemplates(t);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load templates"); }
    })();
    return () => { live = false; };
  }, [supabase]);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    (async () => {
      try {
        const [n, r, kind] = await Promise.all([
          listLevelNodes(supabase, selectedProjectId, { includeSite: true }), listRuns(supabase, selectedProjectId), loadProjectKind(supabase, selectedProjectId),
        ]);
        if (!live) return;
        setNodes(n); setRuns(r); setPicked(new Set()); setPreview(null); setProjectKind(kind);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load project levels"); }
    })();
    return () => { live = false; };
  }, [supabase, selectedProjectId]);

  // level types present in the project, bottom up, for the quick-select chips (named in the project's own words)
  const typesPresent = useMemo(() => {
    const order = ["basement", "ground", "podium", "mezzanine", "typical", "roof", "segment"];
    const set = new Set(nodes.map((n) => inferLevelType(n)).filter((t): t is string => !!t));
    return order.filter((t) => set.has(t));
  }, [nodes]);
  // Until the planner picks one: the best fit for the project, for a part it has (lowest part first),
  // one that can generate before a draft.
  const best = useMemo(() => {
    const partRank = (t: ActTemplate) => {
      const i = Math.min(...(t.applies_to_level_types ?? []).map((lt) => typesPresent.indexOf(lt)).filter((x) => x >= 0));
      return Number.isFinite(i) ? i : 99;
    };
    return [...templates].sort((a, b) =>
      sectorListFit(b, projectKind) - sectorListFit(a, projectKind)
      || partRank(a) - partRank(b)
      || Number(canGenerateFrom(b.status)) - Number(canGenerateFrom(a.status)))[0];
  }, [templates, projectKind, typesPresent]);
  const effectiveTemplateId = templateId || best?.id || "";
  const template = templates.find((t) => t.id === effectiveTemplateId);
  const isDraft = !!template && !canGenerateFrom(template.status);
  const attributes = useMemo(
    () => effectiveChoices(catalogue, projectKind, picks),
    [catalogue, projectKind, picks],
  );
  const toggle = (id: string) => { setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); setPreview(null); };
  const selectByType = (types: string[]) => { setPicked(new Set(nodes.filter((n) => { const lt = inferLevelType(n); return lt && types.includes(lt); }).map((n) => n.id))); setPreview(null); };

  const baseRequest = { projectId: selectedProjectId, templateId: effectiveTemplateId, nodeIds: [...picked], attributes, linkLevels };

  async function applyScenario(variant: ScenarioVariant, name: string) {
    setScenario({ name, variant });
    setBusy(true);
    try {
      setPreview(await previewGeneration(supabase, { ...baseRequest, variant }));
      setForce(false);
      toast.success(`Scenario "${name}" applied to the preview`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Preview failed"); } finally { setBusy(false); }
  }

  async function runPreview() {
    if (!selectedProjectId || !effectiveTemplateId || picked.size === 0) { toast.error("Choose a template and at least one level"); return; }
    setBusy(true);
    try {
      setPreview(await previewGeneration(supabase, { ...baseRequest, projectId: selectedProjectId, variant: scenario?.variant }));
      setForce(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Preview failed"); } finally { setBusy(false); }
  }

  async function generate() {
    if (!preview) return;
    setBusy(true);
    try {
      const { runId, steps, stepsError } = await commitGeneration(supabase, preview);
      toast.success(
        "Draft activities generated" +
        (steps && steps.applied > 0 ? `; ${steps.applied} got their step template (${steps.steps} steps)` : ""),
      );
      if (stepsError) toast.warning(`Activities were generated, but their step templates could not be added: ${stepsError}. Use Step Templates › Apply to Activities.`);
      router.push(`/dashboard/planning/activity-library/runs/${runId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); setBusy(false); }
  }

  if (!selectedProjectId) return <div className="p-6"><EmptyNote>Select a project in the header to generate activities.</EmptyNote></div>;

  const notApplicable = preview && !preview.applicability.applicable;

  return (
    <div className="grid h-full min-h-0 grid-cols-[360px_1fr]">
      <aside className="space-y-5 overflow-y-auto border-r border-border bg-card p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Template</label>
          <select className={selectCls} value={effectiveTemplateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null); }}>
            {templates.length === 0 && <option value="">No templates</option>}
            {groupBySectorFit(templates, projectKind).map((g) => {
              const options = g.items.map((t) => (
                <option key={t.id} value={t.id}>{t.code} — {t.name}{canGenerateFrom(t.status) ? "" : " (draft, preview only)"}</option>
              ));
              return g.label ? <optgroup key={g.label} label={g.label}>{options}</optgroup> : options;
            })}
          </select>
          {template && (
            <p className="mt-1 text-xs text-muted-foreground">
              v{template.version} · {template.status}
              {template.applies_to_level_types?.length ? <> · for {template.applies_to_level_types.map((t) => partLabel(t, projectKind)).join(", ")}</> : null}
            </p>
          )}
          {isDraft && (
            <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
              Draft template: you can preview it, but a Planning Manager must approve it (Activity Library › Templates) before activities are generated.
            </p>
          )}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Project category</div>
          <div className="mb-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs">
            {projectKind.sector || projectKind.buildingType ? (
              <>
                <span className="font-medium">{sectorLabel(projectKind.sector) || "No sector"}</span>
                {projectKind.buildingType && <> · <span className="font-medium">{buildingTypeLabel(projectKind.buildingType)}</span></>}
                <span className="block text-muted-foreground">From the project&apos;s settings.</span>
              </>
            ) : (
              <span className="text-amber-700">
                This project has no sector or building type yet. Set them in the project&apos;s{" "}
                {selectedProject ? <Link className="font-medium underline" href={settingsHref(selectedProject.project_code)}>Settings</Link> : "Settings"}{" "}
                so templates can be matched.
              </span>
            )}
          </div>
          <PlanningChoicesFields catalogue={catalogue} kind={projectKind} picks={picks} onChange={(p) => { setPicks(p); setPreview(null); }} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>{nodes.some((n) => n.node_type === "segment") ? "Levels & chainage sections" : "Levels"} ({picked.size}/{nodes.length})</span>
            <span className="space-x-2">
              <button className="text-primary" onClick={() => { setPicked(new Set(nodes.map((n) => n.id))); setPreview(null); }}>All</button>
              <button className="text-primary" onClick={() => { setPicked(new Set()); setPreview(null); }}>None</button>
            </span>
          </div>
          {typesPresent.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1">
              {template?.applies_to_level_types?.length ? (
                <button className="rounded-full border border-primary/50 bg-primary/5 px-2 py-0.5 text-[11px] text-primary"
                  title="Select the levels this template is made for"
                  onClick={() => selectByType(template.applies_to_level_types)}>For this template</button>
              ) : null}
              {typesPresent.map((t) => (
                <button key={t} className="rounded-full border border-border px-2 py-0.5 text-[11px] hover:border-primary hover:text-primary"
                  onClick={() => selectByType([t])}>{partLabel(t, projectKind)}</button>
              ))}
            </div>
          )}
          {nodes.length === 0 ? <EmptyNote>This project has no levels or chainage sections in its WBS.</EmptyNote> : (
            <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {nodes.map((n) => (
                <label key={n.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n.id)} />
                  <span className="flex-1">{n.wbs_name}</span>
                  <span className="text-xs text-muted-foreground">{partLabel(inferLevelType(n), projectKind)}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={linkLevels} onChange={(e) => { setLinkLevels(e.target.checked); setPreview(null); }} />
          Link consecutive levels when the template defines it
        </label>

        <Button className="w-full" onClick={runPreview} disabled={busy}>{busy && !preview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}Preview generation</Button>
        <Button className="w-full" variant="outline" disabled={!effectiveTemplateId || picked.size === 0} onClick={() => setCompareOpen(true)}>Compare scenarios</Button>

        {runs.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-muted-foreground">Previous runs</div>
            {runs.slice(0, 8).map((r) => (
              <button key={r.id} className="mb-1 flex w-full items-center justify-between rounded-md border border-border px-3 py-1.5 text-left text-sm hover:border-primary"
                onClick={() => router.push(`/dashboard/planning/activity-library/runs/${r.id}`)}>
                <span className="font-mono text-xs text-primary">#{r.run_no}</span>
                <span className="text-xs text-muted-foreground">{r.total_count} · {r.low_count + r.review_count} to review</span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="min-h-0 overflow-auto p-6">
        {!preview ? <EmptyNote>Pick a template and levels, then preview. Nothing is written until you press Generate.</EmptyNote> : (
          <>
            {scenario && (
              <div className="mb-4 flex items-center justify-between rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
                <span>What-if scenario applied: <b>{scenario.name}</b> (recorded on the run)</span>
                <Button size="sm" variant="ghost" onClick={() => { setScenario(null); setPreview(null); }}>Clear</Button>
              </div>
            )}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                ["Activities", preview.result.counts.total, ""],
                ["High confidence", preview.result.counts.high, "text-emerald-600"],
                ["Review", preview.result.counts.review, "text-amber-600"],
                ["Low / missing data", preview.result.counts.low, "text-red-600"],
                ["Skipped (already there)", preview.result.counts.warnings, "text-muted-foreground"],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-lg border border-border bg-card p-3 text-center"><div className={`font-mono text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
              ))}
            </div>

            {notApplicable && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Template conditions not met:{" "}
                {describeUnmet(preview.applicability.results, catalogue, (a, v) => valueLabel(a, v, catalogue)).join("; ")}.
                Generated activities will be marked low confidence.
                <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} /> Generate anyway</label>
              </div>
            )}

            <table className="w-full border-collapse overflow-hidden rounded-lg border border-border bg-card text-sm">
              <thead><tr className="bg-muted/50 text-left text-[11px] font-semibold uppercase text-muted-foreground">
                <th className="px-3 py-2">Level</th><th className="px-3 py-2">Activity</th><th className="px-3 py-2">Qty</th><th className="px-3 py-2">Duration</th><th className="px-3 py-2">Confidence</th><th className="px-3 py-2">Resources</th><th className="px-3 py-2">Reasons</th>
              </tr></thead>
              <tbody>
                {preview.result.items.slice(0, 200).map((it, i) => {
                  const t = preview.result.tasks[i];
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-3 py-1.5">{preview.nodes.find((n) => n.id === it.node_id)?.wbs_name}</td>
                      <td className="px-3 py-1.5"><CodeChip code={t.task_code.split("@")[0]} /> <span className="text-muted-foreground">{t.task_name}</span></td>
                      <td className="px-3 py-1.5">{it.quantity != null ? `${it.quantity} ${it.unit ?? ""}` : "—"}</td>
                      <td className="px-3 py-1.5">{it.duration_days != null ? `${it.duration_days} d` : "—"}</td>
                      <td className="px-3 py-1.5"><ConfidencePill value={it.confidence} /></td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{resourceSummary(preview, it.norm_id)}</td>
                      <td className="px-3 py-1.5 text-xs text-muted-foreground">{it.reasons.map((r) => REASON_LABEL[r]).join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {preview.result.items.length > 200 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 200 of {preview.result.items.length}.</p>}
            {preview.result.skipped.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {preview.result.skipped.length} skipped because the level already has them
                {preview.result.skipped.some((s) => s.reason === "master") && <> ({preview.result.skipped.filter((s) => s.reason === "master").length} from the same activity master, e.g. added by a WBS template)</>}.
              </p>
            )}

            <div className="mt-5 flex justify-end">
              <Button disabled={busy || preview.result.tasks.length === 0 || (!!notApplicable && !force) || !canGenerateFrom(preview.templateStatus)}
                title={canGenerateFrom(preview.templateStatus) ? undefined : "Draft template: approve it in Activity Library › Templates first"}
                onClick={generate}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {canGenerateFrom(preview.templateStatus) ? `Generate ${preview.result.tasks.length} draft activities` : "Preview only (draft template)"}
              </Button>
            </div>
          </>
        )}
      </section>
      {compareOpen && <PlanActivityScenarios request={baseRequest} onUse={(v, n) => void applyScenario(v, n)} onClose={() => setCompareOpen(false)} />}
    </div>
  );
}

/** Short resource line for a preview row: crew size and the non-optional equipment of its standard. */
function resourceSummary(preview: GenerationPreview, normId: string | null): string {
  if (!normId) return "—";
  for (const ctx of Object.values(preview.input.contexts)) {
    const std = ctx.standards.find((x) => x.id === normId);
    if (!std) continue;
    const crew = std.resources.filter((r) => r.kind === "labor" && r.allocation_rule === "per_crew").reduce((a, r) => a + r.workers_per_crew, 0);
    const equipment = std.resources.filter((r) => r.kind === "equipment" && !r.is_optional).map((r) => r.role_label);
    return [crew ? `crew ${crew}` : null, ...equipment].filter(Boolean).join(", ") || "—";
  }
  return "—";
}
