"use client";

import { useEffect, useMemo, useState } from "react";
import { BookmarkPlus, Layers, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { planLevelApply, validateLevelItems, type LevelItem, type LevelTemplate } from "@/lib/level-library";
import {
  applyLevelsToBuilding,
  listBuildingLevelCodes,
  listLevelTemplates,
  saveLevelTemplate,
} from "@/lib/level-library-queries";
import { LevelItemsEditor } from "./level-items-editor";

export interface BuildingRef { id: string; wbs_code: string; wbs_name: string }

interface ApplyLevelTemplateDialogProps {
  /** Buildings the levels can go under; a picker is shown when there is more than one. */
  buildings: BuildingRef[];
  initialBuildingId?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}

/**
 * Copies a level template into one building. The template's levels are loaded into a local
 * draft the user can change freely; only the draft is written to the project (wbs_nodes), so the
 * template itself is never modified.
 */
export function ApplyLevelTemplateDialog({ buildings, initialBuildingId, open, onOpenChange, onApplied }: ApplyLevelTemplateDialogProps) {
  const [buildingId, setBuildingId] = useState<string>(initialBuildingId ?? buildings[0]?.id ?? "");
  const building = buildings.find((b) => b.id === buildingId) ?? buildings[0];
  const [templates, setTemplates] = useState<LevelTemplate[]>([]);
  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [draft, setDraft] = useState<LevelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listLevelTemplates({ activeOnly: true })
      .then((tpls) => {
        if (cancelled) return;
        setTemplates(tpls);
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Unable to load level templates"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  // Codes already under the chosen building (skipped on apply).
  const currentBuildingId = building?.id;
  useEffect(() => {
    if (!open || !currentBuildingId) return;
    let cancelled = false;
    listBuildingLevelCodes(currentBuildingId)
      .then((codes) => { if (!cancelled) setExistingCodes(codes); })
      .catch(() => { if (!cancelled) setExistingCodes([]); });
    return () => { cancelled = true; };
  }, [open, currentBuildingId]);

  const template = templates.find((t) => t.id === templateId) ?? null;
  const plan = useMemo(() => planLevelApply(existingCodes, draft), [existingCodes, draft]);
  const errors = useMemo(() => (draft.length ? validateLevelItems(draft) : []), [draft]);

  function chooseTemplate(id: string) {
    if (draft.length && !confirm("Replace the current list with this template's levels?")) return;
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    // A copy: edits below change only this draft, never the template.
    setDraft(t ? t.items.map((i) => ({ ...i })) : []);
  }

  if (!building) return null;

  async function apply() {
    if (!building) return;
    if (errors.length) { toast.error(errors[0]); return; }
    if (plan.toCreate.length === 0) { toast.error("Nothing to create: every level is already in this building."); return; }
    setApplying(true);
    try {
      const result = await applyLevelsToBuilding(building.id, template?.id ?? null, draft);
      toast.success(
        `${result.created.length} level${result.created.length === 1 ? "" : "s"} added to ${building.wbs_code}` +
          (result.skipped.length ? ` · ${result.skipped.length} skipped (already there)` : ""),
      );
      onApplied();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to add levels");
    } finally {
      setApplying(false);
    }
  }

  async function saveAsTemplate() {
    if (!newTemplateName?.trim()) { toast.error("Enter a name for the new template"); return; }
    if (errors.length || draft.length === 0) { toast.error(errors[0] ?? "Add at least one level."); return; }
    try {
      await saveLevelTemplate({ template_name: newTemplateName.trim(), items: draft });
      toast.success(`Template "${newTemplateName.trim()}" created`);
      setNewTemplateName(null);
      setTemplates(await listLevelTemplates({ activeOnly: true }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save template");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" /> Add levels to {building.wbs_code} · {building.wbs_name}
          </DialogTitle>
          <DialogDescription>
            Pick a template, then adjust the list for this building. Your changes apply to this project only; the template stays unchanged.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              {buildings.length > 1 && (
                <label className="min-w-[200px] space-y-1 text-xs font-medium">
                  Building
                  <select
                    value={building.id}
                    onChange={(e) => setBuildingId(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                  >
                    {buildings.map((b) => <option key={b.id} value={b.id}>{b.wbs_code} · {b.wbs_name}</option>)}
                  </select>
                </label>
              )}
              <label className="min-w-[240px] flex-1 space-y-1 text-xs font-medium">
                Level template
                <select
                  value={templateId}
                  onChange={(e) => chooseTemplate(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="">— Start from an empty list —</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.template_name} ({t.items.length} levels, v{t.version})</option>
                  ))}
                </select>
              </label>
              {existingCodes.length > 0 && (
                <p className="pb-2 text-xs text-muted-foreground">This building already has {existingCodes.length} child node{existingCodes.length === 1 ? "" : "s"}; matching codes are skipped.</p>
              )}
            </div>

            <LevelItemsEditor items={draft} onChange={setDraft} existingCodes={existingCodes} />

            {errors.length > 0 && <p className="text-xs text-destructive">{errors[0]}</p>}

            {newTemplateName !== null && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-border p-3">
                <input
                  autoFocus
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="New template name"
                  className="h-8 min-w-[220px] flex-1 rounded-md border border-border bg-background px-2 text-sm"
                />
                <Button size="sm" onClick={saveAsTemplate}>Save template</Button>
                <Button size="sm" variant="ghost" onClick={() => setNewTemplateName(null)}>Cancel</Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading || draft.length === 0 || newTemplateName !== null}
            onClick={() => setNewTemplateName(template ? `${template.template_name} (${building.wbs_code})` : "")}
          >
            <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" /> Save list as new template
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {plan.toCreate.length} to add{plan.skipped.length ? ` · ${plan.skipped.length} skipped` : ""}
            </span>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button size="sm" onClick={apply} disabled={applying || loading || plan.toCreate.length === 0 || errors.length > 0}>
              {applying && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Add {plan.toCreate.length} level{plan.toCreate.length === 1 ? "" : "s"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
