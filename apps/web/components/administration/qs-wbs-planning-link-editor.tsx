"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getQsWbsTemplateDetails, getQsWbsTemplates, type QsWbsTemplate, type QsWbsTemplateItem } from "@/lib/qs/tender-cost-service";
import {
  deactivateQsPlanningTemplateLink,
  listQsPlanningTemplateLinks,
  saveQsPlanningTemplateLink,
  type QsPlanningTemplateLink,
} from "@/lib/qs/qs-wbs-template-planning-links";
import { listWbsTemplates, type WbsTemplate } from "@/lib/project/wbs/wbs-template-queries";

const input = "h-9 rounded-md border border-border bg-background px-3 text-sm";

/** Admin screen for explicitly pairing the separate QS and Planning template catalogs. */
export function QsWbsPlanningLinkEditor() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qsTemplates, setQsTemplates] = useState<QsWbsTemplate[]>([]);
  const [planningTemplates, setPlanningTemplates] = useState<WbsTemplate[]>([]);
  const [links, setLinks] = useState<QsPlanningTemplateLink[]>([]);
  const [selectedQsId, setSelectedQsId] = useState("");
  const [selectedPlanningId, setSelectedPlanningId] = useState("");
  const [qsItems, setQsItems] = useState<QsWbsTemplateItem[]>([]);
  const [selectedQsItemId, setSelectedQsItemId] = useState("");
  const [mappingKind, setMappingKind] = useState<"template" | "scope_node" | "location">("template");
  const [selectedPlanningNodeKey, setSelectedPlanningNodeKey] = useState("");

  const selectedQs = useMemo(() => qsTemplates.find((template) => template.id === selectedQsId) ?? null, [qsTemplates, selectedQsId]);
  const selectedPlanning = useMemo(() => planningTemplates.find((template) => template.id === selectedPlanningId) ?? null, [planningTemplates, selectedPlanningId]);
  const planningNodeOptions = useMemo(() => {
    if (!selectedPlanning) return [];
    const options: Array<{ key: string; name: string }> = [];
    for (const node of selectedPlanning.doc.sections.nodes) options.push({ key: `sections:${node.key}`, name: `Sections · ${node.wbs_name}` });
    for (const [block, part] of Object.entries(selectedPlanning.doc.floor_blocks)) {
      for (const node of part?.nodes ?? []) options.push({ key: `floor_blocks.${block}:${node.key}`, name: `${block} floors · ${node.wbs_name}` });
    }
    return options;
  }, [selectedPlanning]);

  const loadCatalogs = useCallback(async () => {
    setLoading(true);
    try {
      const [qs, planning] = await Promise.all([getQsWbsTemplates(), listWbsTemplates({ activeOnly: true })]);
      setQsTemplates(qs);
      setPlanningTemplates(planning);
      setSelectedQsId((current) => current || qs[0]?.id || "");
      setSelectedPlanningId((current) => planning.some((template) => template.id === current) ? current : planning[0]?.id || "");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLinks = useCallback(async () => {
    if (!selectedQsId) { setLinks([]); return; }
    try {
      setLinks(await listQsPlanningTemplateLinks(selectedQsId));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, [selectedQsId]);

  useEffect(() => { void loadCatalogs(); }, [loadCatalogs]);
  useEffect(() => { void loadLinks(); }, [loadLinks]);
  useEffect(() => {
    if (!selectedQsId) { setQsItems([]); setSelectedQsItemId(""); return; }
    getQsWbsTemplateDetails(selectedQsId).then(({ items }) => {
      setQsItems(items);
      setSelectedQsItemId((current) => items.some((item) => item.id === current) ? current : items[0]?.id ?? "");
    }).catch((error) => toast.error(error instanceof Error ? error.message : String(error)));
  }, [selectedQsId]);
  useEffect(() => {
    if (!planningNodeOptions.some((node) => node.key === selectedPlanningNodeKey)) {
      setSelectedPlanningNodeKey(planningNodeOptions[0]?.key ?? "");
    }
  }, [planningNodeOptions, selectedPlanningNodeKey]);

  async function createLink() {
    if (!selectedQsId || !selectedPlanningId) return;
    setSaving(true);
    try {
      await saveQsPlanningTemplateLink({
        qs_template_id: selectedQsId,
        planning_template_id: selectedPlanningId,
        mapping_kind: mappingKind,
        qs_template_item_id: mappingKind === "scope_node" ? selectedQsItemId : null,
        planning_node_key: mappingKind === "template" ? null : selectedPlanningNodeKey,
        status: "suggested",
      });
      toast.success("Planning template mapping added as a suggestion.");
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function setLinkStatus(link: QsPlanningTemplateLink, status: "approved" | "suggested") {
    setSaving(true);
    try {
      await saveQsPlanningTemplateLink({
        id: link.id,
        qs_template_id: link.qs_template_id,
        planning_template_id: link.planning_template_id,
        mapping_kind: link.mapping_kind,
        qs_template_item_id: link.qs_template_item_id,
        planning_node_key: link.planning_node_key,
        status,
        note: link.note,
      });
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(link: QsPlanningTemplateLink) {
    setSaving(true);
    try {
      await deactivateQsPlanningTemplateLink(link.id);
      toast.success("Association removed.");
      await loadLinks();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">QS ↔ Planning WBS Template Links</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Pair an estimate scaffold with a delivery WBS template. Associations pin both library versions; this does not apply or alter a project WBS.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadCatalogs()} disabled={loading}>
          <RefreshCw className="mr-2 h-4 w-4" /> Refresh
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading template libraries…</div>
      ) : (
        <>
          <section className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2 xl:grid-cols-3 xl:items-end">
            <label className="grid gap-1.5 text-xs font-medium">
              QS estimate scaffold
              <select className={input} value={selectedQsId} onChange={(event) => setSelectedQsId(event.target.value)} disabled={qsTemplates.length === 0}>
                {qsTemplates.map((template) => <option key={template.id} value={template.id}>{template.title} · v{template.version}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Planning delivery template
              <select className={input} value={selectedPlanningId} onChange={(event) => setSelectedPlanningId(event.target.value)} disabled={planningTemplates.length === 0}>
                {planningTemplates.map((template) => <option key={template.id} value={template.id}>{template.template_name} · v{template.version}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-xs font-medium">
              Mapping level
              <select className={input} value={mappingKind} onChange={(event) => setMappingKind(event.target.value as typeof mappingKind)}>
                <option value="template">Template association</option>
                <option value="scope_node">QS item → Planning node</option>
                <option value="location">Location pattern → Planning node</option>
              </select>
            </label>
            {mappingKind === "scope_node" && (
              <label className="grid gap-1.5 text-xs font-medium">
                QS scope item
                <select className={input} value={selectedQsItemId} onChange={(event) => setSelectedQsItemId(event.target.value)} disabled={qsItems.length === 0}>
                  {qsItems.map((item) => <option key={item.id} value={item.id}>{item.item_code} · {item.section}{item.sub_section ? ` / ${item.sub_section}` : ""}{item.sub_element ? ` / ${item.sub_element}` : ""}</option>)}
                </select>
              </label>
            )}
            {mappingKind !== "template" && (
              <label className="grid gap-1.5 text-xs font-medium">
                Planning template node
                <select className={input} value={selectedPlanningNodeKey} onChange={(event) => setSelectedPlanningNodeKey(event.target.value)} disabled={planningNodeOptions.length === 0}>
                  {planningNodeOptions.map((node) => <option key={node.key} value={node.key}>{node.name} · {node.key}</option>)}
                </select>
              </label>
            )}
            <Button onClick={() => void createLink()} disabled={saving || !selectedQsId || !selectedPlanningId || (mappingKind === "scope_node" && !selectedQsItemId) || (mappingKind !== "template" && !selectedPlanningNodeKey)}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add mapping
            </Button>
          </section>

          <section className="overflow-hidden rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Associations for {selectedQs?.title ?? "selected QS template"}</h3>
              <p className="mt-1 text-xs text-muted-foreground">Approve links only after QS and Planning confirm the scope relationship.</p>
            </div>
            {links.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">No Planning template links have been added.</div>
            ) : (
              <div className="divide-y">
                {links.map((link) => {
                  const planning = planningTemplates.find((template) => template.id === link.planning_template_id);
                  const stale = !selectedQs || link.qs_template_version !== selectedQs.version || !planning || link.planning_template_version !== planning.version;
                  return (
                    <div key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{planning?.template_name ?? "Inactive or missing Planning template"}</div>
                          <div className="text-xs text-muted-foreground">
                            {link.mapping_kind === "template" ? "Whole-template association" : `${link.mapping_kind === "scope_node" ? qsItems.find((item) => item.id === link.qs_template_item_id)?.item_code ?? "QS item" : "Location pattern"} → ${link.planning_node_key}`}
                          </div>
                          <div className="text-xs text-muted-foreground">Pinned QS v{link.qs_template_version} · Planning v{link.planning_template_version}</div>
                        </div>
                        <Badge variant="outline">{link.mapping_kind}</Badge>
                        <Badge variant={link.status === "approved" ? "default" : "secondary"}>{link.status}</Badge>
                        {stale && <Badge variant="destructive">Version changed</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {link.status !== "approved" && <Button size="sm" variant="outline" disabled={saving || stale} onClick={() => void setLinkStatus(link, "approved")}>Approve</Button>}
                        {link.status === "approved" && <Button size="sm" variant="ghost" disabled={saving} onClick={() => void setLinkStatus(link, "suggested")}>Reopen</Button>}
                        <Button size="icon" variant="ghost" aria-label="Remove association" disabled={saving} onClick={() => void removeLink(link)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

