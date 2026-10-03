"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, Layers, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { validateLevelItems, type LevelItem, type LevelTemplate } from "@/lib/level-library";
import { deleteLevelTemplate, listLevelTemplates, saveLevelTemplate } from "@/lib/level-library-queries";
import { LevelItemsEditor } from "@/components/project/wbs/levels/level-items-editor";

interface Draft {
  id: string | null;
  template_name: string;
  description: string;
  building_type: string;
  is_active: boolean;
  items: LevelItem[];
}

const blankDraft = (): Draft => ({ id: null, template_name: "", description: "", building_type: "", is_active: true, items: [] });

const toDraft = (t: LevelTemplate): Draft => ({
  id: t.id,
  template_name: t.template_name,
  description: t.description ?? "",
  building_type: t.building_type ?? "",
  is_active: t.is_active,
  items: t.items.map((i) => ({ ...i })),
});

const field = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-hidden focus:border-primary";

/**
 * Master Libraries > Level Templates. A template is an ordered level list that projects copy
 * into a building (see apply-level-template-dialog.tsx); editing it here never changes projects.
 */
export function LevelTemplateEditor() {
  const [templates, setTemplates] = useState<LevelTemplate[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const applyLoaded = useCallback((list: LevelTemplate[], selectId?: string | null) => {
    setTemplates(list);
    const pick = list.find((t) => t.id === selectId) ?? list[0];
    setDraft(pick ? toDraft(pick) : blankDraft());
    setDirty(false);
  }, []);

  async function load(selectId?: string | null) {
    try {
      applyLoaded(await listLevelTemplates(), selectId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to load level templates");
    }
  }

  useEffect(() => {
    let cancelled = false;
    listLevelTemplates()
      .then((list) => { if (!cancelled) applyLoaded(list); })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Unable to load level templates"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [applyLoaded]);

  const current = useMemo(() => templates.find((t) => t.id === draft?.id) ?? null, [templates, draft?.id]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
    setDirty(true);
  }

  function select(next: Draft) {
    if (dirty && !confirm("Discard unsaved changes to this template?")) return;
    setDraft(next);
    setDirty(false);
  }

  async function save() {
    if (!draft) return;
    if (!draft.template_name.trim()) { toast.error("Template name is required"); return; }
    const errors = validateLevelItems(draft.items);
    if (errors.length) { toast.error(errors[0]); return; }
    setSaving(true);
    try {
      const id = await saveLevelTemplate({
        id: draft.id,
        template_name: draft.template_name,
        description: draft.description || null,
        building_type: draft.building_type || null,
        is_active: draft.is_active,
        items: draft.items,
      });
      toast.success(draft.id ? "Template saved (projects that used it are not changed)" : "Template created");
      await load(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save template");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!draft?.id) return;
    if (!confirm(`Delete template "${draft.template_name}"? Levels already copied into projects stay as they are.`)) return;
    try {
      await deleteLevelTemplate(draft.id);
      toast.success("Template deleted");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to delete template");
    }
  }

  if (loading) {
    return <div className="flex flex-1 items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 lg:flex-row lg:items-start">
      <aside className="shrink-0 space-y-2 lg:sticky lg:top-0 lg:w-64">
        <Button size="sm" variant="outline" className="w-full" onClick={() => select(blankDraft())}>
          <Plus className="mr-1.5 h-3.5 w-3.5" /> New template
        </Button>
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => select(toDraft(t))}
            className={cn(
              "w-full rounded-lg border px-3 py-2 text-left transition-colors",
              draft?.id === t.id ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/50",
            )}
          >
            <p className="truncate text-sm font-medium">{t.template_name}</p>
            <p className="text-xs text-muted-foreground">
              {t.items.length} levels · v{t.version}{t.is_active ? "" : " · inactive"}
            </p>
          </button>
        ))}
      </aside>

      {draft && (
        <section className="min-w-0 flex-1 space-y-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">{draft.id ? "Edit level template" : "New level template"}</h2>
              {current && <span className="text-xs text-muted-foreground">version {current.version}</span>}
            </div>
            <div className="flex items-center gap-2">
              {draft.id && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => select({ ...draft, id: null, template_name: `${draft.template_name} (copy)` })}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Duplicate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={remove}>
                    <Trash2 className="mr-1.5 h-3.5 w-3.5 text-destructive" /> Delete
                  </Button>
                </>
              )}
              <Button size="sm" onClick={save} disabled={saving || (!dirty && !!draft.id)}>
                {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />} Save
              </Button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              Template name *
              <input value={draft.template_name} onChange={(e) => patch({ template_name: e.target.value })} placeholder="e.g. Typical Condo 20F" className={field} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              Building type
              <input value={draft.building_type} onChange={(e) => patch({ building_type: e.target.value })} placeholder="e.g. Condominium" className={field} />
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              Description
              <input value={draft.description} onChange={(e) => patch({ description: e.target.value })} className={field} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={draft.is_active} onChange={(e) => patch({ is_active: e.target.checked })} />
              Active (offered when applying levels to a building)
            </label>
          </div>

          <LevelItemsEditor items={draft.items} onChange={(items) => patch({ items })} />

          <p className="text-xs text-muted-foreground">
            Projects get a copy of this list when it is applied to a building. Saving here creates a new version for future use;
            levels already copied into projects are not changed.
          </p>
        </section>
      )}
    </div>
  );
}
