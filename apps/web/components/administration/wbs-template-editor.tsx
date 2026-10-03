"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, FileSpreadsheet, Loader2, Network, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LevelTemplate } from "@/lib/level-library";
import { listLevelTemplates } from "@/lib/level-library-queries";
import { masterWbsRowsToSrc, parseMasterWbsRows, readMasterWbsWorkbook } from "@/lib/project/wbs/master-wbs-sheet";
import {
  addTemplateNode,
  addTemplateTask,
  emptyPart,
  emptyWbsTemplateDoc,
  FLOOR_BLOCK_LABELS,
  FLOOR_BLOCK_TYPES,
  getPart,
  moveTemplateNode,
  projectWbsToTemplate,
  removeFloorBlock,
  removeTemplateNode,
  removeTemplateTask,
  suggestBlocks,
  suggestContainer,
  templateStats,
  updateTemplateNode,
  updateTemplateTask,
  type FloorBlockType,
  type SrcNode,
  type SrcTask,
  type TemplatePartId,
  type ToTemplateOptions,
  type TplNode,
  type WbsTemplateDoc,
} from "@/lib/project/wbs/wbs-template";
import { deleteWbsTemplate, listWbsTemplates, saveWbsTemplate, type WbsTemplate } from "@/lib/project/wbs/wbs-template-queries";
import { FloorBlockPicker } from "@/components/project/wbs/templates/floor-block-picker";

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary";
const cell = "h-8 w-full rounded-md border border-border bg-background px-2 text-sm outline-hidden focus:border-primary";

interface Draft {
  id: string | null;
  template_name: string;
  template_desc: string;
  template_category: string;
  is_active: boolean;
  source: WbsTemplate["source"];
  default_level_template_id: string;
  doc: WbsTemplateDoc;
}

const blankDraft = (): Draft => ({
  id: null, template_name: "", template_desc: "", template_category: "", is_active: true, source: "manual",
  default_level_template_id: "", doc: emptyWbsTemplateDoc(),
});

const toDraft = (t: WbsTemplate): Draft => ({
  id: t.id, template_name: t.template_name, template_desc: t.template_desc ?? "", template_category: t.template_category ?? "",
  is_active: t.is_active, source: t.source, default_level_template_id: t.default_level_template_id ?? "", doc: t.doc,
});

/**
 * Master Libraries › WBS Templates. A template is a full WBS (fixed sections + per-floor blocks with
 * activities) that projects copy via "Apply WBS template"; editing it here never changes projects.
 */
export function WbsTemplateEditor() {
  const [templates, setTemplates] = useState<WbsTemplate[]>([]);
  const [levelTemplates, setLevelTemplates] = useState<LevelTemplate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState<{ fileName: string; src: { nodes: SrcNode[]; tasks: SrcTask[] }; options: ToTemplateOptions; name: string } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  function applyLoaded(list: WbsTemplate[], selectId?: string | null) {
    setTemplates(list);
    const pick = list.find((t) => t.id === selectId) ?? list[0];
    setDraft(pick ? toDraft(pick) : blankDraft());
    setDirty(false);
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([listWbsTemplates(), listLevelTemplates({ activeOnly: true })])
      .then(([list, lts]) => {
        if (cancelled) return;
        setLevelTemplates(lts);
        applyLoaded(list);
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Unable to load WBS templates"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function reload(selectId?: string | null) {
    try {
      applyLoaded(await listWbsTemplates(), selectId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load WBS templates");
    }
  }

  function patch(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }

  function select(next: Draft) {
    if (dirty && !confirm("Discard unsaved changes to this template?")) return;
    setImporting(null);
    setDraft(next);
    setDirty(false);
  }

  async function save(d: Draft) {
    if (!d.template_name.trim()) { toast.error("Template name is required"); return; }
    setSaving(true);
    try {
      const id = await saveWbsTemplate({
        id: d.id, template_name: d.template_name, template_desc: d.template_desc || null,
        template_category: d.template_category || null, is_active: d.is_active, source: d.source,
        default_level_template_id: d.default_level_template_id || null, doc: d.doc,
      });
      toast.success(d.id ? "Template saved (projects that used it are not changed)" : "Template created");
      setImporting(null);
      await reload(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save template");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    if (!confirm(`Delete WBS template "${draft.template_name}"? Projects that already used it keep their WBS.`)) return;
    try {
      await deleteWbsTemplate(draft.id);
      toast.success("Template deleted");
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete template");
    }
  }

  async function importFile(file: File) {
    try {
      const { raw } = readMasterWbsWorkbook(await file.arrayBuffer());
      const src = masterWbsRowsToSrc(parseMasterWbsRows(raw));
      if (src.nodes.length === 0) { toast.error("No usable WBS rows found in that file"); return; }
      const containerId = suggestContainer(src.nodes);
      const options = { containerId, blocks: containerId ? suggestBlocks(src.nodes.filter((n) => n.parent_id === containerId)) : {} };
      if (dirty && !confirm("Discard unsaved changes to this template?")) return;
      setDirty(false);
      setImporting({ fileName: file.name, src: { nodes: src.nodes, tasks: src.tasks }, options, name: file.name.replace(/\.[^.]+$/, "") });
    } catch (error) {
      toast.error("Couldn't read that file: " + (error instanceof Error ? error.message : "unknown error"));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 lg:flex-row lg:items-start">
      <aside className="shrink-0 space-y-2 lg:sticky lg:top-0 lg:w-64">
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} />
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => select(blankDraft())}><Plus className="mr-1 h-3.5 w-3.5" /> New</Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}><FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel</Button>
        </div>
        {templates.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            No WBS templates yet. Import a Master WBS Excel sheet, or open a project&apos;s WBS and use <strong>Save as template</strong>.
          </p>
        )}
        {templates.map((t) => {
          const s = templateStats(t.doc);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => select(toDraft(t))}
              className={cn("w-full rounded-lg border px-3 py-2 text-left transition-colors",
                !importing && draft?.id === t.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50")}
            >
              <p className="truncate text-sm font-medium">{t.template_name}</p>
              <p className="text-xs text-muted-foreground">
                {s.sectionTasks + s.blocks.reduce((n, b) => n + b.tasks, 0)} activities · {s.blocks.length} floor block{s.blocks.length === 1 ? "" : "s"} · v{t.version}
                {t.is_active ? "" : " · inactive"}
              </p>
            </button>
          );
        })}
      </aside>

      {importing ? (
        <section className="min-w-0 flex-1 space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><FileSpreadsheet className="h-4 w-4" /> New template from {importing.fileName}</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setImporting(null)}>Cancel</Button>
              <Button
                size="sm"
                disabled={saving}
                onClick={() => save({ ...blankDraft(), template_name: importing.name, source: "excel", doc: projectWbsToTemplate(importing.src, importing.options).doc })}
              >
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Create template
              </Button>
            </div>
          </div>
          <label className="block space-y-1 text-xs font-medium">
            Template name *
            <input value={importing.name} onChange={(e) => setImporting({ ...importing, name: e.target.value })} className={field} />
          </label>
          <FloorBlockPicker src={importing.src} value={importing.options} onChange={(options) => setImporting({ ...importing, options })} />
          <p className="text-xs text-muted-foreground">Dates in the sheet are not stored; durations, disciplines and links are.</p>
        </section>
      ) : draft && (
        <section className="min-w-0 flex-1 space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Network className="h-4 w-4 text-muted-foreground" /> {draft.id ? "Edit WBS template" : "New WBS template"}
              {draft.id && <span className="text-xs font-normal text-muted-foreground">version {templates.find((t) => t.id === draft.id)?.version}</span>}
            </h2>
            <div className="flex items-center gap-2">
              {draft.id && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => select({ ...draft, id: null, template_name: `${draft.template_name} (copy)` })}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={remove}><Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" /> Delete</Button>
                </>
              )}
              <Button size="sm" onClick={() => save(draft)} disabled={saving || (!dirty && !!draft.id)}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Template name *
              <input value={draft.template_name} onChange={(e) => patch({ template_name: e.target.value })} className={field} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Default level template
              <select value={draft.default_level_template_id} onChange={(e) => patch({ default_level_template_id: e.target.value })} className={field}>
                <option value="">— None —</option>
                {levelTemplates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              Category
              <input value={draft.template_category} onChange={(e) => patch({ template_category: e.target.value })} placeholder="e.g. Mixed-use" className={field} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Description
              <input value={draft.template_desc} onChange={(e) => patch({ template_desc: e.target.value })} className={field} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
              Active (offered in Apply WBS template)
            </label>
          </div>

          <TemplateDocEditor doc={draft.doc} onChange={(doc) => patch({ doc })} />

          <p className="text-xs text-muted-foreground">
            Projects get a copy when the template is applied. Saving creates a new version for future use; projects that already used it are not changed.
          </p>
        </section>
      )}
    </div>
  );
}

// ── Document editor: parts → node tree + activities ─────────────────────────

function TemplateDocEditor({ doc, onChange }: { doc: WbsTemplateDoc; onChange: (doc: WbsTemplateDoc) => void }) {
  const [partId, setPartId] = useState<TemplatePartId>("sections");
  const [selected, setSelected] = useState<string>("");
  const activePart: TemplatePartId = partId === "sections" || doc.floor_blocks[partId] ? partId : "sections";
  const part = getPart(doc, activePart) ?? emptyPart();
  const isBlock = activePart !== "sections";
  const missingBlocks = FLOOR_BLOCK_TYPES.filter((t) => !doc.floor_blocks[t]);

  const ordered = useMemo(() => {
    const byParent = new Map<string, TplNode[]>();
    for (const n of part.nodes) byParent.set(n.parent_key, [...(byParent.get(n.parent_key) ?? []), n]);
    const out: { node: TplNode; depth: number }[] = [];
    const walk = (parent: string, depth: number) => {
      for (const n of [...(byParent.get(parent) ?? [])].sort((a, b) => a.sort_order - b.sort_order)) {
        out.push({ node: n, depth });
        walk(n.key, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }, [part.nodes]);

  const node = part.nodes.find((n) => n.key === selected) ?? null;
  const nodeKey = node ? node.key : isBlock && selected === "" ? "" : null;
  const tasks = nodeKey === null ? [] : part.tasks.filter((t) => t.node_key === nodeKey).sort((a, b) => a.sort_order - b.sort_order);

  function switchPart(id: TemplatePartId) {
    setPartId(id);
    setSelected("");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 border-b border-border">
        {(["sections", ...FLOOR_BLOCK_TYPES.filter((t) => doc.floor_blocks[t])] as TemplatePartId[]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => switchPart(id)}
            className={cn("-mb-px border-b-2 px-3 py-1.5 text-xs font-medium",
              activePart === id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {id === "sections" ? "Fixed sections" : `${FLOOR_BLOCK_LABELS[id]} block`}
            <span className="ml-1 text-muted-foreground">({getPart(doc, id)?.tasks.length ?? 0})</span>
          </button>
        ))}
        {missingBlocks.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const t = e.target.value as FloorBlockType;
              if (!t) return;
              onChange({ ...doc, floor_blocks: { ...doc.floor_blocks, [t]: emptyPart() } });
              switchPart(t);
            }}
            className="ml-auto h-7 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">+ Add floor block…</option>
            {missingBlocks.map((t) => <option key={t} value={t}>{FLOOR_BLOCK_LABELS[t]}</option>)}
          </select>
        )}
      </div>

      {activePart === "sections" ? (
        <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          Buildings are created under
          <select
            value={doc.building_anchor_key ?? ""}
            onChange={(e) => onChange({ ...doc, building_anchor_key: e.target.value || null })}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs"
          >
            <option value="">Project root</option>
            {ordered.map(({ node: n }) => <option key={n.key} value={n.key}>{n.key} · {n.wbs_name}</option>)}
          </select>
          ; every level of a building gets the floor block for its type (Typical when a type has no block).
        </label>
      ) : (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>This block is added under every {activePart === "typical" ? "level without its own block" : `${activePart} level`}.</span>
          <button
            type="button"
            className="text-destructive hover:underline"
            onClick={() => { if (confirm(`Remove the ${FLOOR_BLOCK_LABELS[activePart]} block?`)) { onChange(removeFloorBlock(doc, activePart)); switchPart("sections"); } }}
          >
            Remove block
          </button>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-2 rounded-lg border border-border p-2">
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { const r = addTemplateNode(doc, activePart, "", "New package"); onChange(r.doc); setSelected(r.key); }}>
              <Plus className="mr-1 h-3 w-3" /> Top-level
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!node} onClick={() => { if (!node) return; const r = addTemplateNode(doc, activePart, node.key, "New package"); onChange(r.doc); setSelected(r.key); }}>
              <Plus className="mr-1 h-3 w-3" /> Child
            </Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!node} onClick={() => node && onChange(moveTemplateNode(doc, activePart, node.key, -1))} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={!node} onClick={() => node && onChange(moveTemplateNode(doc, activePart, node.key, 1))} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
            <Button
              size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={!node} aria-label="Delete node"
              onClick={() => { if (node && confirm(`Delete "${node.wbs_name}" with its sub-packages and activities?`)) { onChange(removeTemplateNode(doc, activePart, node.key)); setSelected(""); } }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="max-h-[420px] overflow-y-auto text-sm">
            {isBlock && (
              <button type="button" onClick={() => setSelected("")} className={cn("block w-full rounded px-2 py-1 text-left text-xs italic", selected === "" ? "bg-primary/10" : "hover:bg-muted")}>
                (the level itself)
              </button>
            )}
            {ordered.length === 0 && <p className="px-2 py-3 text-xs text-muted-foreground">No packages yet.</p>}
            {ordered.map(({ node: n, depth }) => (
              <button
                key={n.key}
                type="button"
                onClick={() => setSelected(n.key)}
                style={{ paddingLeft: 8 + depth * 14 }}
                className={cn("block w-full truncate rounded py-1 pr-2 text-left", selected === n.key ? "bg-primary/10" : "hover:bg-muted",
                  activePart === "sections" && doc.building_anchor_key === n.key && "font-semibold")}
              >
                <span className="font-mono text-xs text-muted-foreground">{n.wbs_code}</span> {n.wbs_name}
                <span className="ml-1 text-[11px] text-muted-foreground">({part.tasks.filter((t) => t.node_key === n.key).length})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border p-2">
          {nodeKey === null ? (
            <p className="px-2 py-6 text-center text-xs text-muted-foreground">Select a package to edit it and its activities.</p>
          ) : (
            <>
              {node && (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem]">
                  <input value={node.wbs_name} onChange={(e) => onChange(updateTemplateNode(doc, activePart, node.key, { wbs_name: e.target.value }))} className={cell} aria-label="Package name" />
                  <select value={node.node_type} onChange={(e) => onChange(updateTemplateNode(doc, activePart, node.key, { node_type: e.target.value }))} className={cell} aria-label="Node type">
                    {["phase", "task_group", "discipline", "zone", "area", "element", "system"].map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Activities ({tasks.length})</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onChange(addTemplateTask(doc, activePart, nodeKey, "New activity"))}>
                  <Plus className="mr-1 h-3 w-3" /> Activity
                </Button>
              </div>
              <div className="max-h-[380px] overflow-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="px-1 py-1 text-left">Activity</th>
                      <th className="w-28 px-1 py-1 text-left">Discipline</th>
                      <th className="w-20 px-1 py-1 text-left">Days</th>
                      <th className="w-24 px-1 py-1 text-left">Links</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {tasks.map((t) => (
                      <tr key={t.key} className="border-t border-border">
                        <td className="px-1 py-1"><input value={t.task_name} onChange={(e) => onChange(updateTemplateTask(doc, activePart, t.key, { task_name: e.target.value }))} className={cell} /></td>
                        <td className="px-1 py-1"><input value={t.discipline ?? ""} onChange={(e) => onChange(updateTemplateTask(doc, activePart, t.key, { discipline: e.target.value || null }))} className={cell} /></td>
                        <td className="px-1 py-1"><input type="number" min={0} value={t.duration_days ?? ""} onChange={(e) => onChange(updateTemplateTask(doc, activePart, t.key, { duration_days: e.target.value === "" ? null : Number(e.target.value) }))} className={cell} /></td>
                        <td className="px-1 py-1 text-xs text-muted-foreground" title={t.predecessors.map((p) => `${p.key} (${p.scope.replace("_", " ")} ${p.type.toUpperCase()}${p.lag ? ` ${p.lag > 0 ? "+" : ""}${p.lag}d` : ""})`).join("\n")}>
                          {t.predecessors.length ? `${t.predecessors.length} link${t.predecessors.length === 1 ? "" : "s"}` : "—"}
                          {t.predecessors.length > 0 && (
                            <button type="button" className="ml-1 text-destructive hover:underline" onClick={() => onChange(updateTemplateTask(doc, activePart, t.key, { predecessors: [] }))}>clear</button>
                          )}
                        </td>
                        <td className="px-1 py-1">
                          <button type="button" onClick={() => onChange(removeTemplateTask(doc, activePart, t.key))} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label="Delete activity">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
