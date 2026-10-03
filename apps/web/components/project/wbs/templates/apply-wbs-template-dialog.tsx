"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronDown, ChevronRight, LayoutTemplate, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { inferLevelType, type LevelItem, type LevelTemplate, type LevelType } from "@/lib/level-library";
import { listLevelTemplates } from "@/lib/level-library-queries";
import {
  applyTemplateSelection,
  expandWbsTemplate,
  type TemplateSelection,
  nodeKeys,
  templateStats,
  type ApplyBuilding,
  type ApplyLevel,
  type ExpandedTemplate,
  type SrcNode,
} from "@/lib/project/wbs/wbs-template";
import { applyWbsTemplate, getProjectWbsTemplateId, listWbsTemplates, loadProjectWbsSource, type WbsTemplate } from "@/lib/project/wbs/wbs-template-queries";
import { LevelItemsEditor } from "@/components/project/wbs/levels/level-items-editor";
import { TemplateSelectionTree } from "./template-selection-tree";

const field = "h-8 rounded-md border border-border bg-background px-2 text-sm";

type ProjectNode = SrcNode & { level_type?: string | null; floor_height_m?: number | null };

interface BuildingRow {
  rowId: string;
  existingNodeId: string | null;
  parentKey: string | null | undefined; // undefined = template anchor
  code: string;
  name: string;
  include: boolean;
  existingLevels: ApplyLevel[];
  levelSource: "existing" | "template";
  levelTemplateId: string;
  draft: LevelItem[];
  open: boolean;
}

interface ApplyWbsTemplateDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}

let rowSeq = 0;

/**
 * Copies a WBS template into the project: fixed sections + for every chosen building and level the
 * floor block for the level's type. Anything already in the project is skipped; the template is not changed.
 */
export function ApplyWbsTemplateDialog({ projectId, open, onOpenChange, onApplied }: ApplyWbsTemplateDialogProps) {
  const [templates, setTemplates] = useState<WbsTemplate[]>([]);
  const [levelTemplates, setLevelTemplates] = useState<LevelTemplate[]>([]);
  const [projectNodes, setProjectNodes] = useState<ProjectNode[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [rows, setRows] = useState<BuildingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  // What is unticked in "Choose what to import" (this import only; the template is not changed).
  const [selection, setSelection] = useState<TemplateSelection>({});
  // Both sections start collapsed with a one-line summary; expand to change them.
  const [showSelection, setShowSelection] = useState(false);
  const [showBuildings, setShowBuildings] = useState(false);

  const template = templates.find((t) => t.id === templateId) ?? null;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([listWbsTemplates({ activeOnly: true }), listLevelTemplates({ activeOnly: true }), loadProjectWbsSource(projectId), getProjectWbsTemplateId(projectId)])
      .then(([tpls, lts, src, chosen]) => {
        if (cancelled) return;
        setTemplates(tpls);
        setLevelTemplates(lts);
        setProjectNodes(src.nodes as ProjectNode[]);
        const pick = tpls.find((t) => t.id === chosen) ?? tpls[0] ?? null;
        setTemplateId(pick?.id ?? "");
        setRows(initialRows(src.nodes as ProjectNode[], pick, lts));
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Unable to load WBS templates"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  function chooseTemplate(id: string) {
    setTemplateId(id);
    setSelection({});
    const t = templates.find((x) => x.id === id) ?? null;
    // New buildings follow the template's default level template.
    setRows((prev) => prev.map((r) => (r.existingNodeId || !t?.default_level_template_id ? r : withLevelTemplate(r, t.default_level_template_id, levelTemplates))));
  }

  function patchRow(rowId: string, patch: Partial<BuildingRow>) {
    setRows((prev) => prev.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)));
  }

  function addBuilding() {
    const n = rows.filter((r) => !r.existingNodeId).length + 1;
    const base: BuildingRow = {
      rowId: `row-${++rowSeq}`, existingNodeId: null, parentKey: undefined, code: `B${String(n).padStart(2, "0")}`,
      name: `Building ${String.fromCharCode(64 + n)}`, include: true, existingLevels: [], levelSource: "template",
      levelTemplateId: "", draft: [], open: true,
    };
    setRows((prev) => [...prev, template?.default_level_template_id ? withLevelTemplate(base, template.default_level_template_id, levelTemplates) : base]);
  }

  const buildings: ApplyBuilding[] = useMemo(() => rows.filter((r) => r.include).map((r) => {
    const existingCodes = new Set(r.existingLevels.map((l) => l.level_code.toUpperCase()));
    const levels: ApplyLevel[] = r.levelSource === "existing"
      ? r.existingLevels
      : r.draft.map((l) => ({ ...l, existing: existingCodes.has(l.level_code.trim().toUpperCase()), source_level_template_id: r.levelTemplateId || null }));
    return { code: r.code, name: r.name, parentKey: r.parentKey, existing: !!r.existingNodeId, levels };
  }), [rows]);

  const selected = useMemo(() => (template ? applyTemplateSelection(template.doc, selection) : null), [template, selection]);

  const preview = useMemo((): { expanded: ExpandedTemplate | null; error: string | null } => {
    if (!template) return { expanded: null, error: null };
    try {
      return { expanded: expandWbsTemplate(selected!.doc, buildings), error: null };
    } catch (e) {
      return { expanded: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [template, selected, buildings]);

  const existingKeys = useMemo(() => new Set(nodeKeys(projectNodes).values()), [projectNodes]);

  // Collapsed view: "B01 · Building A — Asian Convention, 8 levels; ..."
  const included = rows.filter((r) => r.include);
  const levelCount = (r: BuildingRow) => (r.levelSource === "existing" ? r.existingLevels.length : r.draft.length);
  const buildingSummary = included.map((r) => {
    const source = r.levelSource === "existing"
      ? "existing levels"
      : levelTemplates.find((t) => t.id === r.levelTemplateId)?.template_name ?? "custom list";
    return `${r.code} · ${r.name} — ${source}, ${levelCount(r)} level${levelCount(r) === 1 ? "" : "s"}`;
  }).join("; ");
  const buildingsWithoutLevels = included.filter((r) => levelCount(r) === 0).map((r) => r.code);
  const newNodes = preview.expanded?.payload.nodes.filter((n) => !existingKeys.has(n.key)).length ?? 0;

  async function apply() {
    if (!template || !preview.expanded) return;
    setApplying(true);
    try {
      const r = await applyWbsTemplate(projectId, template.id, preview.expanded);
      toast.success(
        `Added ${r.nodes_created} WBS nodes and ${r.tasks_created} activities` +
          (r.nodes_skipped + r.tasks_skipped > 0 ? ` · ${r.nodes_skipped + r.tasks_skipped} already in the project` : "") +
          (r.deps_linked ? ` · ${r.deps_linked} links` : ""),
      );
      onApplied();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to apply template");
    } finally {
      setApplying(false);
    }
  }

  const stats = template ? templateStats(template.doc) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4" /> Apply WBS template</DialogTitle>
          <DialogDescription>Copy a company WBS into this project. The template stays unchanged.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : templates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No WBS templates yet. Use <strong>Save as template</strong> on a project&apos;s WBS, or create one in Master Libraries › WBS Templates.
          </p>
        ) : (
          <div className="space-y-4">
            <label className="block space-y-1 text-xs font-medium">
              WBS template
              <select value={templateId} onChange={(e) => chooseTemplate(e.target.value)} className={cn(field, "h-9 w-full")}>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.template_name} (v{t.version})</option>)}
              </select>
            </label>
            {stats && (
              <p className="text-xs text-muted-foreground">
                {stats.sectionTasks} activities · {stats.blocks.length} floor block{stats.blocks.length === 1 ? "" : "s"}
              </p>
            )}

            {template && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setShowSelection((v) => !v)}
                  className="flex items-center gap-1 text-sm font-medium"
                >
                  {showSelection ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  Choose what to import
                </button>
                {showSelection && <TemplateSelectionTree doc={template.doc} selection={selection} onChange={setSelection} />}
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button type="button" onClick={() => setShowBuildings((v) => !v)} className="flex min-w-0 items-center gap-1 text-left text-sm font-medium">
                  {showBuildings ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  Buildings and levels
                  {!showBuildings && (
                    <span className="truncate text-xs font-normal text-muted-foreground">
                      — {buildingSummary || "none: only the fixed sections will be added"}
                    </span>
                  )}
                </button>
                <Button size="sm" variant="outline" onClick={() => { addBuilding(); setShowBuildings(true); }}><Plus className="mr-1 h-3.5 w-3.5" /> Add building</Button>
              </div>
              {!showBuildings && buildingsWithoutLevels.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {buildingsWithoutLevels.join(", ")}: no levels selected.
                </p>
              )}
              {showBuildings && rows.length === 0 && <p className="text-xs text-muted-foreground">No buildings: only the fixed sections will be added.</p>}
              {showBuildings && rows.map((r) => (
                <div key={r.rowId} className={cn("rounded-lg border border-border", !r.include && "opacity-60")}>
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <input type="checkbox" checked={r.include} onChange={(e) => patchRow(r.rowId, { include: e.target.checked })} />
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {r.existingNodeId ? (
                      <span className="text-sm"><span className="font-mono">{r.code}</span> · {r.name} <span className="text-xs text-muted-foreground">(existing)</span></span>
                    ) : (
                      <>
                        <input value={r.code} onChange={(e) => patchRow(r.rowId, { code: e.target.value.toUpperCase() })} className={cn(field, "w-20 font-mono")} />
                        <input value={r.name} onChange={(e) => patchRow(r.rowId, { name: e.target.value })} className={cn(field, "w-48")} />
                      </>
                    )}
                    <select
                      value={r.levelSource === "existing" ? "__existing" : r.levelTemplateId}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__existing") patchRow(r.rowId, { levelSource: "existing" });
                        // Show the chosen list straight away so the levels can be checked and edited.
                        else setRows((prev) => prev.map((x) => (x.rowId === r.rowId ? { ...withLevelTemplate(x, v, levelTemplates), open: true } : x)));
                      }}
                      className={cn(field, "ml-auto")}
                    >
                      {r.existingNodeId && <option value="__existing">Existing levels ({r.existingLevels.length})</option>}
                      <option value="">Custom level list</option>
                      {levelTemplates.map((t) => <option key={t.id} value={t.id}>{t.template_name} ({t.items.length})</option>)}
                    </select>
                    {r.levelSource === "template" && (
                      <button type="button" onClick={() => patchRow(r.rowId, { open: !r.open })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        {r.open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />} {r.draft.length} levels
                      </button>
                    )}
                    {!r.existingNodeId && (
                      <button type="button" onClick={() => setRows((prev) => prev.filter((x) => x.rowId !== r.rowId))} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label="Remove building">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {r.levelSource === "template" && r.open && (
                    <div className="border-t border-border p-3">
                      <LevelItemsEditor
                        items={r.draft}
                        onChange={(draft) => patchRow(r.rowId, { draft })}
                        existingCodes={r.existingLevels.map((l) => l.level_code)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {preview.error ? (
              <p className="text-xs text-destructive">{preview.error}</p>
            ) : preview.expanded && (
              <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs">
                Adds <strong>{newNodes}</strong> nodes · <strong>{preview.expanded.payload.tasks.length}</strong> activities
                {selected && selected.droppedLinks > 0 && (
                  <span className="text-amber-700 dark:text-amber-300"> · {selected.droppedLinks} link{selected.droppedLinks === 1 ? "" : "s"} left out</span>
                )}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={apply} disabled={applying || loading || !preview.expanded || !!preview.error}>
            {applying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Apply template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function withLevelTemplate(r: BuildingRow, levelTemplateId: string, levelTemplates: LevelTemplate[]): BuildingRow {
  const lt = levelTemplates.find((t) => t.id === levelTemplateId);
  // A copy: editing the list never changes the level template.
  return { ...r, levelSource: "template", levelTemplateId, draft: lt ? lt.items.map((i) => ({ ...i })) : r.levelSource === "template" ? r.draft : [] };
}

function initialRows(nodes: ProjectNode[], template: WbsTemplate | null, levelTemplates: LevelTemplate[]): BuildingRow[] {
  const keys = nodeKeys(nodes);
  const buildings = nodes.filter((n) => n.node_type === "building").sort((a, b) => (keys.get(a.id) ?? "").localeCompare(keys.get(b.id) ?? "", undefined, { numeric: true }));
  const rows: BuildingRow[] = buildings.map((b) => {
    const existingLevels: ApplyLevel[] = nodes
      .filter((n) => n.parent_id === b.id && n.node_type === "level")
      .sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0))
      .map((n) => ({
        level_code: n.wbs_code, level_name: n.wbs_name,
        level_type: (n.level_type as LevelType | null) ?? inferLevelType(n.wbs_code),
        floor_height_m: n.floor_height_m ?? null, typical_gfa_m2: null, existing: true,
      }));
    const row: BuildingRow = {
      rowId: `row-${++rowSeq}`, existingNodeId: b.id, parentKey: b.parent_id ? keys.get(b.parent_id) ?? null : null,
      code: b.wbs_code, name: b.wbs_name, include: true, existingLevels,
      levelSource: existingLevels.length ? "existing" : "template", levelTemplateId: "", draft: [], open: false,
    };
    return existingLevels.length === 0 && template?.default_level_template_id
      ? withLevelTemplate(row, template.default_level_template_id, levelTemplates)
      : row;
  });
  if (rows.length === 0) {
    const row: BuildingRow = {
      rowId: `row-${++rowSeq}`, existingNodeId: null, parentKey: undefined, code: "B01", name: "Building A",
      include: true, existingLevels: [], levelSource: "template", levelTemplateId: "", draft: [], open: false,
    };
    rows.push(template?.default_level_template_id ? withLevelTemplate(row, template.default_level_template_id, levelTemplates) : row);
  }
  return rows;
}
