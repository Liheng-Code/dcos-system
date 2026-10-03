"use client";

import { useEffect, useState } from "react";
import { BookmarkPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { LevelTemplate } from "@/lib/level-library";
import { listLevelTemplates } from "@/lib/level-library-queries";
import { projectWbsToTemplate, suggestBlocks, suggestContainer, type SrcNode, type SrcTask, type ToTemplateOptions } from "@/lib/project/wbs/wbs-template";
import { loadProjectWbsSource, saveWbsTemplate } from "@/lib/project/wbs/wbs-template-queries";
import { FloorBlockPicker } from "./floor-block-picker";

const field = "h-9 w-full rounded-lg border border-border bg-background px-3 text-sm";

interface SaveAsWbsTemplateDialogProps {
  projectId: string;
  projectName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Captures this project's WBS (nodes + activities, no dates) as a new WBS template. */
export function SaveAsWbsTemplateDialog({ projectId, projectName, open, onOpenChange }: SaveAsWbsTemplateDialogProps) {
  const [src, setSrc] = useState<{ nodes: SrcNode[]; tasks: SrcTask[] } | null>(null);
  const [options, setOptions] = useState<ToTemplateOptions>({ containerId: null, blocks: {} });
  const [levelTemplates, setLevelTemplates] = useState<LevelTemplate[]>([]);
  const [name, setName] = useState(projectName ? `${projectName} WBS` : "");
  const [desc, setDesc] = useState("");
  const [levelTemplateId, setLevelTemplateId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([loadProjectWbsSource(projectId), listLevelTemplates({ activeOnly: true })])
      .then(([source, lts]) => {
        if (cancelled) return;
        setSrc(source);
        setLevelTemplates(lts);
        const containerId = suggestContainer(source.nodes);
        const floors = containerId ? source.nodes.filter((n) => n.parent_id === containerId) : [];
        setOptions({ containerId, blocks: suggestBlocks(floors) });
      })
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Unable to read this project's WBS"));
    return () => { cancelled = true; };
  }, [open, projectId]);

  async function save() {
    if (!src) return;
    if (!name.trim()) { toast.error("Enter a template name"); return; }
    const { doc } = projectWbsToTemplate(src, options);
    if (doc.sections.nodes.length === 0 && !doc.floor_blocks.typical) { toast.error("Nothing to save: this WBS is empty"); return; }
    setSaving(true);
    try {
      await saveWbsTemplate({
        template_name: name.trim(),
        template_desc: desc.trim() || null,
        source: "project",
        default_level_template_id: levelTemplateId || null,
        doc,
      });
      toast.success(`WBS template "${name.trim()}" saved. Find it in Master Libraries › WBS Templates.`);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to save template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BookmarkPlus className="h-4 w-4" /> Save WBS as template</DialogTitle>
          <DialogDescription>
            Stores this project&apos;s breakdown and activities (durations, disciplines, links; no dates) as a company template.
            Pick one floor per block; on other projects each level gets the block for its type. This project is not changed.
          </DialogDescription>
        </DialogHeader>

        {!src ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium">
                Template name *
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mixed-use 7F" className={field} />
              </label>
              <label className="space-y-1 text-xs font-medium">
                Default level template
                <select value={levelTemplateId} onChange={(e) => setLevelTemplateId(e.target.value)} className={field}>
                  <option value="">— None —</option>
                  {levelTemplates.map((t) => <option key={t.id} value={t.id}>{t.template_name} ({t.items.length} levels)</option>)}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium sm:col-span-2">
                Description
                <input value={desc} onChange={(e) => setDesc(e.target.value)} className={field} />
              </label>
            </div>
            <FloorBlockPicker src={src} value={options} onChange={setOptions} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={!src || saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
