"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useProject } from "@/components/dashboard/project-context";
import { listTemplates } from "@/lib/planning/activity-library/library-service";
import {
  commitGeneration, inferLevelType, listLevelNodes, listRuns, previewGeneration,
  type GenerationPreview, type LevelNode, type RunRow,
} from "@/lib/planning/activity-library/generation-service";
import type { ActTemplate } from "@/lib/planning/activity-library/types";
import { CodeChip, EmptyNote } from "./plan-act-shared";
import { PlanActivityScenarios } from "./plan-activity-scenarios";
import type { ScenarioVariant } from "@/lib/planning/activity-library/scenario-compare";
import { ConfidencePill, REASON_LABEL } from "./plan-act-confidence";

const selectCls = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

const ATTRIBUTES: { key: string; label: string; options: string[] }[] = [
  { key: "project_type", label: "Project type", options: ["high_rise", "low_rise", "infrastructure", "industrial"] },
  { key: "structure_type", label: "Structure type", options: ["reinforced_concrete", "steel", "precast", "timber"] },
  { key: "formwork_type", label: "Formwork type", options: ["aluminum", "conventional", "steel_form", "tunnel_form"] },
  { key: "building_component", label: "Building component", options: ["typical_floor", "transfer_floor", "podium", "basement"] },
];

export function PlanActivityGenerate() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { selectedProjectId } = useProject();
  const [templates, setTemplates] = useState<ActTemplate[]>([]);
  const [nodes, setNodes] = useState<LevelNode[]>([]);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [attrs, setAttrs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<GenerationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [linkLevels, setLinkLevels] = useState(true);
  const [compareOpen, setCompareOpen] = useState(false);
  const [scenario, setScenario] = useState<{ name: string; variant: ScenarioVariant } | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const t = (await listTemplates(supabase)).filter((x) => x.status === "active");
        if (!live) return;
        setTemplates(t);
        setTemplateId((cur) => cur || t[0]?.id || "");
      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load templates"); }
    })();
    return () => { live = false; };
  }, [supabase]);

  useEffect(() => {
    if (!selectedProjectId) return;
    let live = true;
    (async () => {
      try {
        const [n, r] = await Promise.all([listLevelNodes(supabase, selectedProjectId), listRuns(supabase, selectedProjectId)]);
        if (!live) return;
        setNodes(n); setRuns(r); setPicked(new Set()); setPreview(null);
      } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load project levels"); }
    })();
    return () => { live = false; };
  }, [supabase, selectedProjectId]);

  const template = templates.find((t) => t.id === templateId);
  const toggle = (id: string) => { setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); setPreview(null); };
  const selectByType = (types: string[]) => { setPicked(new Set(nodes.filter((n) => { const lt = inferLevelType(n); return lt && types.includes(lt); }).map((n) => n.id))); setPreview(null); };

  const baseRequest = { projectId: selectedProjectId, templateId, nodeIds: [...picked], attributes: attrs, linkLevels };

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
    if (!selectedProjectId || !templateId || picked.size === 0) { toast.error("Choose a template and at least one level"); return; }
    setBusy(true);
    try {
      setPreview(await previewGeneration(supabase, { projectId: selectedProjectId, templateId, nodeIds: [...picked], attributes: attrs, linkLevels, variant: scenario?.variant }));
      setForce(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Preview failed"); } finally { setBusy(false); }
  }

  async function generate() {
    if (!preview) return;
    setBusy(true);
    try {
      const id = await commitGeneration(supabase, preview);
      toast.success("Draft activities generated");
      router.push(`/dashboard/planning/activity-library/runs/${id}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Generation failed"); setBusy(false); }
  }

  if (!selectedProjectId) return <div className="p-6"><EmptyNote>Select a project in the header to generate activities.</EmptyNote></div>;

  const notApplicable = preview && !preview.applicability.applicable;

  return (
    <div className="grid h-full min-h-0 grid-cols-[360px_1fr]">
      <aside className="space-y-5 overflow-y-auto border-r border-border bg-card p-5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground">Template</label>
          <select className={selectCls} value={templateId} onChange={(e) => { setTemplateId(e.target.value); setPreview(null); }}>
            {templates.length === 0 && <option value="">No active templates</option>}
            {templates.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
          </select>
          {template && <p className="mt-1 text-xs text-muted-foreground">v{template.version}</p>}
        </div>

        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">Project attributes (for template applicability)</div>
          <div className="space-y-2">
            {ATTRIBUTES.map((a) => (
              <select key={a.key} className={selectCls} value={attrs[a.key] ?? ""} onChange={(e) => { setAttrs({ ...attrs, [a.key]: e.target.value }); setPreview(null); }}>
                <option value="">{a.label}…</option>
                {a.options.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
              </select>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-muted-foreground">
            <span>Levels ({picked.size}/{nodes.length})</span>
            <span className="space-x-2">
              <button className="text-primary" onClick={() => selectByType(["typical"])}>Typical</button>
              <button className="text-primary" onClick={() => { setPicked(new Set(nodes.map((n) => n.id))); setPreview(null); }}>All</button>
              <button className="text-primary" onClick={() => { setPicked(new Set()); setPreview(null); }}>None</button>
            </span>
          </div>
          {nodes.length === 0 ? <EmptyNote>This project has no level nodes in its WBS.</EmptyNote> : (
            <div className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border border-border p-1">
              {nodes.map((n) => (
                <label key={n.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted">
                  <input type="checkbox" checked={picked.has(n.id)} onChange={() => toggle(n.id)} />
                  <span className="flex-1">{n.wbs_name}</span>
                  <span className="text-xs text-muted-foreground">{inferLevelType(n) ?? ""}</span>
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
        <Button className="w-full" variant="outline" disabled={!templateId || picked.size === 0} onClick={() => setCompareOpen(true)}>Compare scenarios</Button>

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
                ["Skipped (exist)", preview.result.counts.warnings, "text-muted-foreground"],
              ].map(([l, v, c]) => (
                <div key={l as string} className="rounded-lg border border-border bg-card p-3 text-center"><div className={`font-mono text-2xl font-bold ${c}`}>{v}</div><div className="text-xs text-muted-foreground">{l}</div></div>
              ))}
            </div>

            {notApplicable && (
              <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Template conditions not met:{" "}
                {preview.applicability.results.filter((r) => !r.matched).map((r) => `${r.rule.attribute} ${r.rule.operator} ${r.rule.values.join("|")}${r.missing ? " (not set)" : ""}`).join("; ")}.
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

            <div className="mt-5 flex justify-end">
              <Button disabled={busy || preview.result.tasks.length === 0 || (!!notApplicable && !force)} onClick={generate}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Generate {preview.result.tasks.length} draft activities
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
