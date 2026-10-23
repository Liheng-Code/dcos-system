"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Copy, ExternalLink, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteMaster, duplicateMaster, getMasterDetail, getMasterImageUrl, updateMasterDetails, uploadMasterImage,
  type Division, type MasterDetail, type MasterDetailsPatch,
} from "@/lib/planning/activity-library/activity-database-service";
import type { ActivityType } from "@/lib/planning/activity-library/activity-database-import";
import { canArchive } from "@/lib/planning/activity-library/catalogue-rules";
import { loadLibraryTree, setMasterStatus, type LibraryTree } from "@/lib/planning/activity-library/library-service";
import { ActStatusPill } from "../plan-act-shared";
import { PlanActMasterForm } from "../plan-act-master-form";
import { ActivityBoqsTab } from "./activity-boqs-tab";
import { ActivityDetailsTab, detailsSchema, type DetailsValues } from "./activity-details-tab";
import { ActivityLogicTab } from "./activity-logic-tab";
import { errorMessage, type ActivityListItem } from "./activity-database-shared";

interface Props {
  db: SupabaseClient;
  activityId: string;
  /** The list the user opened the activity from; prev / next move within it. */
  list: ActivityListItem[];
  divisions: Division[];
  canManage: boolean;
  onNavigate: (id: string) => void;
  onClose: () => void;
  /** Something changed (save, BOQ link, duplicate, delete): the lists behind the dialog should refresh. */
  onChanged: () => void;
}

const num = (s: string): number | null => (s.trim() === "" ? null : Number(s));
const str = (v: number | null): string => (v === null ? "" : String(v));

function toValues(d: MasterDetail): DetailsValues {
  const m = d.master;
  return {
    name: m.name, description: m.description ?? "", default_unit: m.default_unit ?? "", activity_type: m.activity_type ?? "",
    visible_code: m.visible_code ?? "", trade: m.trade ?? "", division_id: m.division_id ?? "",
    min_pct: str(m.min_duration_pct), max_pct: str(m.max_duration_pct),
  };
}

export function ActivityDetailDialog(props: Props) {
  const [tab, setTab] = useState("details");
  const [guard, setGuard] = useState<(() => void) | null>(null);
  const [dirty, setDirty] = useState(false);

  const attempt = (fn: () => void) => { if (dirty) setGuard(() => fn); else fn(); };
  const idx = props.list.findIndex((a) => a.id === props.activityId);
  const prev = idx > 0 ? props.list[idx - 1] : null;
  const next = idx >= 0 && idx < props.list.length - 1 ? props.list[idx + 1] : null;

  return (
    <>
      <Dialog open onOpenChange={(o) => { if (!o) attempt(props.onClose); }}>
        <DialogContent className="flex h-[92vh] flex-col gap-0 p-0 sm:max-w-6xl">
          <DetailBody
            key={props.activityId} {...props} tab={tab} setTab={setTab} setDirty={setDirty}
            position={idx >= 0 ? `${idx + 1} of ${props.list.length}` : null}
            onPrev={prev ? () => attempt(() => props.onNavigate(prev.id)) : null}
            onNext={next ? () => attempt(() => props.onNavigate(next.id)) : null}
            onJump={(id) => attempt(() => props.onNavigate(id))} guardRun={attempt}
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

function DetailBody({
  db, activityId, divisions, canManage, onChanged, onNavigate, onClose, tab, setTab, setDirty, position, onPrev, onNext, onJump, guardRun, list,
}: Props & {
  tab: string; setTab: (t: string) => void; setDirty: (d: boolean) => void; position: string | null;
  onPrev: (() => void) | null; onNext: (() => void) | null; onJump: (id: string) => void;
  /** Runs fn now, or after the user confirms discarding unsaved edits. */
  guardRun: (fn: () => void) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<MasterDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tree, setTree] = useState<LibraryTree | null>(null);
  const [del, setDel] = useState<{ reason: string | null } | null>(null);

  const form = useForm<DetailsValues>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name: "", description: "", default_unit: "", activity_type: "", visible_code: "", trade: "", division_id: "", min_pct: "", max_pct: "" },
  });
  const isDirty = form.formState.isDirty;
  useEffect(() => { setDirty(isDirty); }, [isDirty, setDirty]);
  useEffect(() => () => setDirty(false), [setDirty]);

  const load = useCallback(async () => {
    try {
      const d = await getMasterDetail(db, activityId);
      if (!d) { setLoadError("Activity not found. It may have been deleted."); return; }
      setDetail(d);
      setLoadError(null);
      form.reset(toValues(d));
      setImageUrl(await getMasterImageUrl(db, d.master.image_path));
    } catch (e) { setLoadError(errorMessage(e, "Failed to load the activity")); }
  }, [db, activityId, form]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- load() sets state after awaiting
  useEffect(() => { void load(); }, [load]);

  const editable = detail?.versionedFieldsEditable ?? false;

  async function save(v: DetailsValues) {
    if (!detail) return;
    const patch: MasterDetailsPatch = {
      division_id: v.division_id || null,
      visible_code: v.visible_code.trim().toUpperCase() || null,
      trade: v.trade,
    };
    if (editable) {
      patch.name = v.name;
      patch.description = v.description;
      patch.default_unit = v.default_unit;
      patch.activity_type = (v.activity_type || null) as ActivityType | null;
      patch.min_duration_pct = num(v.min_pct);
      patch.max_duration_pct = num(v.max_pct);
    }
    setSaving(true);
    try {
      await updateMasterDetails(db, detail.master.id, patch);
      toast.success("Changes saved");
      await load();
      onChanged();
    } catch (e) {
      const msg = errorMessage(e, "Could not save");
      if (/visible code/i.test(msg)) form.setError("visible_code", { message: msg });
      else if (/duration/i.test(msg)) form.setError("max_pct", { message: msg });
      else if (/name/i.test(msg)) form.setError("name", { message: msg });
      toast.error(msg);
    } finally { setSaving(false); }
  }

  async function duplicate() {
    if (!detail) return;
    setBusy(true);
    try {
      const r = await duplicateMaster(db, detail.master.id);
      const c = r.copied;
      toast.success(
        `Duplicated as ${r.master.code}: ${c.links} BOQ link${c.links === 1 ? "" : "s"}, ${c.logic} logic rule${c.logic === 1 ? "" : "s"}`,
        r.skippedLogic > 0 ? { description: `${r.skippedLogic} logic rule${r.skippedLogic === 1 ? " was" : "s were"} skipped because the other activity is not a draft.` } : undefined,
      );
      onChanged();
      onNavigate(r.master.id);
    } catch (e) { toast.error(errorMessage(e, "Could not duplicate")); } finally { setBusy(false); }
  }

  async function confirmDelete() {
    if (!detail) return;
    setBusy(true);
    try {
      const r = await deleteMaster(db, detail.master.id);
      if (r.deleted) {
        toast.success(`${detail.master.name} deleted`);
        setDel(null);
        setDirty(false);
        onChanged();
        const i = list.findIndex((a) => a.id === detail.master.id);
        const other = list[i + 1] ?? list[i - 1];
        if (other) onNavigate(other.id); else onClose();
      } else {
        setDel({ reason: r.reason });
      }
    } catch (e) { toast.error(errorMessage(e, "Could not delete")); } finally { setBusy(false); }
  }

  async function archive() {
    if (!detail) return;
    setBusy(true);
    try {
      await setMasterStatus(db, detail.master.id, "archived");
      toast.success(`${detail.master.name} archived`);
      setDel(null);
      setDirty(false);
      onChanged();
      onClose();
    } catch (e) { toast.error(errorMessage(e, "Could not archive")); } finally { setBusy(false); }
  }

  async function startAdd() {
    setBusy(true);
    try { setTree(await loadLibraryTree(db)); } catch (e) { toast.error(errorMessage(e, "Could not open the new activity form")); } finally { setBusy(false); }
  }

  const header = useMemo(() => {
    if (!detail) return null;
    const m = detail.master;
    return { title: m.name, code: m.visible_code ?? m.code, status: m.status, version: m.version };
  }, [detail]);

  return (
    <>
      <div className="flex items-start justify-between gap-3 border-b border-border px-6 py-4 pr-14">
        <div className="min-w-0">
          <DialogTitle className="truncate text-lg leading-tight">{header?.title ?? "Activity"}</DialogTitle>
          <DialogDescription className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            {header ? (
              <>
                <span className="font-mono">{header.code}</span><span>·</span>
                <ActStatusPill status={header.status} /><span>·</span><span>v{header.version}</span>
              </>
            ) : "Loading..."}
            {position && <span className="text-muted-foreground">({position})</span>}
          </DialogDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" size="icon" variant="ghost" aria-label="Previous activity" disabled={!onPrev} onClick={() => onPrev?.()}><ChevronLeft className="h-4 w-4" /></Button>
          <Button type="button" size="icon" variant="ghost" aria-label="Next activity" disabled={!onNext} onClick={() => onNext?.()}><ChevronRight className="h-4 w-4" /></Button>
          <Button type="button" size="sm" variant="outline" onClick={() => guardRun(() => router.push(`/dashboard/planning/activity-library/${activityId}`))}>
            <ExternalLink className="mr-1 h-4 w-4" /> Open full page
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
        {loadError ? (
          <div className="space-y-2 rounded-md border border-dashed border-border p-8 text-center text-sm">
            <p className="text-destructive">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        ) : !detail ? (
          <div className="space-y-3"><Skeleton className="h-9 w-full" /><Skeleton className="h-40 w-full" /><Skeleton className="h-32 w-full" /></div>
        ) : (
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList className="w-fit">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="boqs">BOQs ({detail.workItemCount})</TabsTrigger>
              <TabsTrigger value="logic">Predecessors &amp; Successors</TabsTrigger>
            </TabsList>
            <TabsContent value="details" className="pt-2">
              <form id="activity-details-form" onSubmit={form.handleSubmit(save)} noValidate>
                <ActivityDetailsTab
                  form={form} divisions={divisions} status={detail.master.status} versionedEditable={editable} canEdit={canManage} imageUrl={imageUrl}
                  onUploadImage={async (file) => {
                    try {
                      await uploadMasterImage(db, detail.master.id, file);
                      toast.success("Image uploaded");
                      setImageUrl(await getMasterImageUrl(db, (await getMasterDetail(db, detail.master.id))?.master.image_path ?? null));
                      onChanged();
                    } catch (e) { toast.error(errorMessage(e, "Could not upload the image")); }
                  }}
                />
              </form>
            </TabsContent>
            <TabsContent value="boqs" className="pt-2">
              <ActivityBoqsTab
                db={db} masterId={detail.master.id} editable={editable} canManage={canManage}
                onLinksChanged={() => { void getMasterDetail(db, detail.master.id).then((d) => { if (d) setDetail(d); }); onChanged(); }}
              />
            </TabsContent>
            <TabsContent value="logic" className="pt-2">
              <ActivityLogicTab db={db} masterId={detail.master.id} visibleCode={detail.master.visible_code} onSelectActivity={onJump} />
            </TabsContent>
          </Tabs>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-6 py-3">
        <div className="flex flex-wrap gap-2">
          {canManage && (
            <>
              <Button type="button" size="sm" variant="outline" disabled={busy || !detail} onClick={() => guardRun(() => void startAdd())}><Plus className="mr-1 h-4 w-4" /> Add activity</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy || !detail} onClick={() => guardRun(() => void duplicate())}><Copy className="mr-1 h-4 w-4" /> Duplicate</Button>
              <Button type="button" size="sm" variant="destructive" disabled={busy || !detail} onClick={() => setDel({ reason: null })}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>
            </>
          )}
        </div>
        {canManage && (
          <Button type="submit" form="activity-details-form" size="sm" disabled={!isDirty || saving || !detail}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save Changes
          </Button>
        )}
      </div>

      {tree && (
        <PlanActMasterForm
          tree={tree} onClose={() => setTree(null)}
          onSaved={(m) => { setTree(null); onChanged(); if (m) onNavigate(m.id); }}
        />
      )}

      <AlertDialog open={del !== null} onOpenChange={(o) => { if (!o) setDel(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{del?.reason ? "This activity cannot be deleted" : "Delete this activity?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {del?.reason ?? `${detail?.master.name ?? "This activity"} and its BOQ links, methods and logic will be permanently removed. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {del?.reason ? (
              detail && canArchive(detail.master.status) ? <AlertDialogAction disabled={busy} onClick={() => void archive()}>Archive instead</AlertDialogAction> : null
            ) : (
              <AlertDialogAction variant="destructive" disabled={busy} onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
