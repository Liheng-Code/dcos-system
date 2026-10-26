"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minimize2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { getMasterImageUrl, type Division } from "@/lib/planning/activity-library/activity-database-service";
import type { CsiSection } from "@/lib/csi-divisions";
import {
  deleteOrDeactivateWorkItem, getWorkItemDetail, listWorkItemUnits, updateWorkItem, uploadWorkItemImage, workItemUsage, type WorkItemDetail,
} from "@/lib/planning/activity-library/boq-item-service";
import { usageBlockers, workItemLabel, type WorkItemUsage } from "@/lib/planning/activity-library/boq-item-rules";
import { BoqItemActivitiesTab } from "./boq-item-activities-tab";
import { BoqItemCreateDialog } from "./boq-item-create-dialog";
import { BoqItemDetailsTab, boqDetailsSchema, type BoqDetailsValues } from "./boq-item-details-tab";
import { errorMessage } from "./activity-database-shared";

/** One BOQ row of the list the dialog was opened from; prev / next move within it. */
export interface BoqListItem { id: string; code: string; name?: string | null; description: string; unit: string }

interface Props {
  db: SupabaseClient;
  workItemId: string;
  list: BoqListItem[];
  divisions: Division[];
  sections: CsiSection[];
  canManage: boolean;
  onNavigate: (id: string) => void;
  onClose: () => void;
  /** Tab to open first. */
  initialTab?: "details" | "activities";
  /** Something changed (save, link, delete, create): the lists behind the dialog should refresh. */
  onChanged: () => void;
}

const toValues = (d: WorkItemDetail): BoqDetailsValues => ({
  name: d.name ?? d.description, description: d.description, unit: d.unit, csi_division_code: d.csi_division_code ?? "", csi_section_code: d.csi_section_code ?? "",
});

export function BoqItemDetailDialog(props: Props) {
  const [tab, setTab] = useState<string>(props.initialTab ?? "details");
  const [guard, setGuard] = useState<(() => void) | null>(null);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const attempt = (fn: () => void) => { if (dirty) setGuard(() => fn); else fn(); };
  const idx = props.list.findIndex((a) => a.id === props.workItemId);
  const prev = idx > 0 ? props.list[idx - 1] : null;
  const next = idx >= 0 && idx < props.list.length - 1 ? props.list[idx + 1] : null;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) attempt(props.onClose); }}>
        <DialogContent className={cn("flex flex-col gap-0 p-0", expanded ? "h-screen w-screen max-w-none sm:max-w-none rounded-none" : "h-[92vh] sm:max-w-6xl")}>
          <DetailBody
            key={props.workItemId} {...props} tab={tab} setTab={setTab} setDirty={setDirty} expanded={expanded} onToggleExpand={() => setExpanded((e) => !e)}
            position={idx >= 0 ? `${idx + 1} of ${props.list.length}` : null}
            onPrev={prev ? () => attempt(() => props.onNavigate(prev.id)) : null}
            onNext={next ? () => attempt(() => props.onNavigate(next.id)) : null}
            guardRun={attempt}
          />
        </DialogContent>
      </Dialog>
      <AlertDialog open={guard !== null} onOpenChange={(o) => { if (!o) setGuard(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>The edits on the Details tab have not been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { const fn = guard; setGuard(null); setDirty(false); fn?.(); }}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

type DeleteState = { usage: WorkItemUsage; blockers: string[] };

function DetailBody({
  db, workItemId, divisions, sections, canManage, onChanged, onNavigate, onClose, tab, setTab, setDirty, position, onPrev, onNext, guardRun, list, expanded, onToggleExpand,
}: Props & {
  tab: string; setTab: (t: string) => void; setDirty: (d: boolean) => void; position: string | null;
  onPrev: (() => void) | null; onNext: (() => void) | null; guardRun: (fn: () => void) => void; expanded: boolean; onToggleExpand: () => void;
}) {
  const [item, setItem] = useState<WorkItemDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(true);
  const [units, setUnits] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<DeleteState | null>(null);
  const [creating, setCreating] = useState(false);

  const form = useForm<BoqDetailsValues>({
    resolver: zodResolver(boqDetailsSchema),
    defaultValues: { name: "", description: "", unit: "", csi_division_code: "", csi_section_code: "" },
  });
  const isDirty = form.formState.isDirty;
  useEffect(() => { setDirty(isDirty); }, [isDirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const load = useCallback(async () => {
    try {
      const d = await getWorkItemDetail(db, workItemId);
      if (!d) { setLoadError("BOQ item not found. It may have been deleted."); return; }
      setItem(d);
      setLoadError(null);
      form.reset(toValues(d));
      listWorkItemUnits(db, d.unit).then(setUnits).catch(() => setUnits([d.unit]));
      setImageLoading(!!d.image_path);
      try { setImageUrl(await getMasterImageUrl(db, d.image_path)); } finally { setImageLoading(false); }
    } catch (e) { setLoadError(errorMessage(e, "Failed to load the BOQ item")); }
  }, [db, workItemId, form]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  async function save(v: BoqDetailsValues) {
    if (!item) return;
    setSaving(true);
    try {
      await updateWorkItem(db, item.id, {
        name: v.name, description: v.description, unit: v.unit, csi_division_code: v.csi_division_code || null, csi_section_code: v.csi_division_code ? v.csi_section_code || null : null,
      });
      toast.success("Changes saved");
      setEditing(false);
      await load();
      onChanged();
    } catch (e) {
      const msg = errorMessage(e, "Could not save");
      if (/section/i.test(msg)) form.setError("csi_section_code", { message: msg });
      else if (/division/i.test(msg)) form.setError("csi_division_code", { message: msg });
      else if (/unit/i.test(msg)) form.setError("unit", { message: msg });
      else if (/name/i.test(msg)) form.setError("name", { message: msg });
      toast.error(msg);
    } finally { setSaving(false); }
  }

  async function startDelete() {
    if (!item) return;
    setBusy(true);
    try {
      const usage = await workItemUsage(db, item.id);
      setDel({ usage, blockers: usageBlockers(usage) });
    } catch (e) { toast.error(errorMessage(e, "Could not check where this BOQ item is used")); } finally { setBusy(false); }
  }

  async function finishDelete(mode: "delete" | "deactivate") {
    if (!item) return;
    setBusy(true);
    try {
      await deleteOrDeactivateWorkItem(db, item.id, mode);
      toast.success(mode === "delete" ? `${item.code} deleted` : `${item.code} deactivated`);
      setDel(null);
      setDirty(false);
      onChanged();
      if (mode === "deactivate") { await load(); return; }
      const i = list.findIndex((a) => a.id === item.id);
      const other = list[i + 1] ?? list[i - 1];
      if (other) onNavigate(other.id); else onClose();
    } catch (e) { toast.error(errorMessage(e, mode === "delete" ? "Could not delete" : "Could not deactivate")); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4 pr-14">
        <div className="min-w-0">
          <DialogTitle className="truncate text-lg leading-tight">{item ? workItemLabel(item) : "BOQ item"}</DialogTitle>
          <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {item ? <><span className="font-mono">{item.code}</span><span>·</span><span>{item.unit}</span></> : "Loading..."}
            {position && <span className="text-muted-foreground">({position})</span>}
          </DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="icon" variant="ghost" aria-label="Previous BOQ item" disabled={!onPrev} onClick={() => onPrev?.()}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Next BOQ item" disabled={!onNext} onClick={() => onNext?.()}><ChevronRight className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" aria-label={expanded ? "Restore size" : "Expand"} onClick={onToggleExpand}>
            {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {loadError ? (
          <div className="space-y-2 rounded-md border border-dashed border-border p-8 text-center text-sm">
            <p className="text-destructive">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : !item ? (
          <div className="space-y-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="w-fit">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="activities">Master Activities</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="pt-2">
              <form id="boq-details-form" onSubmit={form.handleSubmit(save)} noValidate>
                <BoqItemDetailsTab
                  form={form} divisions={divisions} sections={sections} units={units} canEdit={canManage} editing={editing} onToggleEdit={() => setEditing((e) => !e)}
                  imageUrl={imageUrl} imageLoading={imageLoading} inactive={!item.is_active}
                  onUploadImage={async (file) => {
                    try {
                      await uploadWorkItemImage(db, item.id, file);
                      toast.success("Image uploaded");
                      setImageLoading(true);
                      try { setImageUrl(await getMasterImageUrl(db, (await getWorkItemDetail(db, item.id))?.image_path ?? null)); } finally { setImageLoading(false); }
                      onChanged();
                    } catch (e) { toast.error(errorMessage(e, "Could not upload the image")); }
                  }}
                />
              </form>
            </TabsContent>
            <TabsContent value="activities" className="pt-2">
              <BoqItemActivitiesTab db={db} item={item} divisions={divisions} canManage={canManage} onChanged={onChanged} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy || !item} onClick={() => guardRun(() => setCreating(true))}><Plus className="mr-1 h-4 w-4" /> Add BOQ</Button>
              <Button type="button" size="sm" variant="destructive" disabled={busy || !item} onClick={() => void startDelete()}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
            </>
          )}
        </div>
        {canManage && (
          <Button type="submit" form="boq-details-form" size="sm" disabled={!isDirty || saving || !item}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save Changes
          </Button>
        )}
      </div>

      {creating && (
        <BoqItemCreateDialog
          db={db} divisions={divisions} defaultDivision={item?.csi_division_code ?? null} onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); onChanged(); onNavigate(id); }}
        />
      )}

      <AlertDialog open={del !== null} onOpenChange={(o) => { if (!o) setDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{del && del.blockers.length > 0 ? "This BOQ item cannot be deleted" : "Delete this BOQ item?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {del && del.blockers.length > 0
                ? `${item?.code ?? "This item"} is used by ${del.blockers.join(", ")}. You can deactivate it instead: it stays on existing records but disappears from pickers.`
                : del && del.usage.activityLinks > 0
                  ? `${item?.code ?? "This item"} will be removed from the cost library and unlinked from ${del.usage.activityLinks} master activit${del.usage.activityLinks === 1 ? "y" : "ies"}, together with its manpower and equipment lines. This cannot be undone.`
                  : `${item?.code ?? "This item"} and its manpower and equipment lines will be permanently removed. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {del && del.blockers.length > 0 ? (
              item?.is_active ? <AlertDialogAction disabled={busy} onClick={() => void finishDelete("deactivate")}>Deactivate</AlertDialogAction> : null
            ) : (
              <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void finishDelete("delete")}>Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
