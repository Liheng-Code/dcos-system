"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { suggestNextCode } from "@/lib/planning/activity-library/activity-chips-rules";
import {
  listActivitiesUsingChip, listCoordinationItems, listMaterialsLibrary, listShopDrawingTypes, setCoordinationItemActive, setShopDrawingTypeActive,
  upsertCoordinationItem, upsertShopDrawingType,
  type ChipKind, type CoordinationItem, type MaterialListRow, type ShopDrawingType, type UsingActivity, type WithUsage,
} from "@/lib/planning/activity-library/activity-chips-service";
import type { Division } from "@/lib/planning/activity-library/activity-database-service";
import { errorMessage, SELECT_CLS } from "./activity-database-shared";

function TableError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm">
      <p className="text-destructive">{message}</p>
      <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
    </div>
  );
}
function TableSkeleton() {
  return <div className="space-y-1">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>;
}

function UsedByCell({ db, kind, refId, onOpenActivity }: { db: SupabaseClient; kind: ChipKind; refId: string; onOpenActivity: (id: string) => void }) {
  const [rows, setRows] = useState<UsingActivity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    listActivitiesUsingChip(db, kind, refId)
      .then((r) => { if (live) setRows(r); })
      .catch((e) => { if (live) setError(errorMessage(e, "Failed to load")); });
    return () => { live = false; };
  }, [db, kind, refId]);
  if (error) return <span className="text-sm text-destructive">{error}</span>;
  if (!rows) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (rows.length === 0) return <span className="text-sm text-muted-foreground">No current activity uses this item.</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((a) => (
        <button
          key={a.id} type="button" onClick={() => onOpenActivity(a.id)}
          className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:border-primary hover:text-primary"
        >
          <span className="font-mono text-muted-foreground">{a.visible_code ?? a.code}</span> {a.name}
        </button>
      ))}
    </div>
  );
}

const usedByBadge = (n: number) => <Badge variant={n > 0 ? "default" : "secondary"}>{n} {n === 1 ? "activity" : "activities"}</Badge>;

/** Loads rows with a stale-while-revalidate key, error and retry. */
function useRows<T>(load: () => Promise<T[]>, key: string, failure: string) {
  const [state, setState] = useState<{ key: string; rows: T[]; error: string | null } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    load()
      .then((rows) => { if (live) setState({ key, rows, error: null }); })
      .catch((e) => { if (live) setState({ key, rows: [], error: errorMessage(e, failure) }); });
    return () => { live = false; };
  }, [load, key, retry, failure]);
  return { loaded: state?.key === key ? state : null, retry: () => { setState(null); setRetry((n) => n + 1); } };
}

// ---------------------------------------------------------------- Material (read-only)

/** Material tab: QS materials with the number of activities that use each. Managed in the QS cost library, so read-only here. */
export function MaterialLibraryTab({ db, query, refreshKey, onOpenActivity }: { db: SupabaseClient; query: string; refreshKey: number; onOpenActivity: (id: string) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => listMaterialsLibrary(db, { q: query }), [db, query]);
  const { loaded, retry } = useRows<MaterialListRow>(load, `${query}|${refreshKey}`, "Failed to load materials");

  if (!loaded) return <TableSkeleton />;
  if (loaded.error) return <TableError message={loaded.error} onRetry={retry} />;
  if (loaded.rows.length === 0) {
    return <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{query ? "No materials match your search." : "The cost library has no materials yet."}</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{loaded.rows.length.toLocaleString()} material{loaded.rows.length === 1 ? "" : "s"} from the QS cost library. Select a row to see the activities that use it.</p>
      <div className="overflow-auto rounded-lg border border-border">
        <Table>
          <TableHeader><TableRow><TableHead className="w-8" /><TableHead>Code</TableHead><TableHead>Material</TableHead><TableHead>Unit</TableHead><TableHead className="text-right">Used by</TableHead></TableRow></TableHeader>
          <TableBody>
            {loaded.rows.map((m) => {
              const open = openId === m.id;
              return (
                <Fragment key={m.id}>
                  <TableRow className="cursor-pointer" onClick={() => setOpenId(open ? null : m.id)} aria-expanded={open}>
                    <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                    <TableCell className="font-mono text-xs">{m.code}</TableCell>
                    <TableCell>{m.name}</TableCell>
                    <TableCell>{m.unit}</TableCell>
                    <TableCell className="text-right">{usedByBadge(m.usedBy)}</TableCell>
                  </TableRow>
                  {open && (
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableCell /><TableCell colSpan={4}><UsedByCell db={db} kind="material" refId={m.id} onOpenActivity={onOpenActivity} /></TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Shop Drawing / Coordination libraries

const itemSchema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  group: z.string(),
  description: z.string(),
  sort_order: z.string().regex(/^-?\d+$/, "Whole number"),
});
type ItemValues = z.infer<typeof itemSchema>;

type LibraryRow = { id: string; code: string; name: string; group: string | null; description: string | null; is_active: boolean; sort_order: number; usedBy: number };

const sdRow = (r: WithUsage<ShopDrawingType>): LibraryRow => ({ ...r, group: r.csi_division_code });
const coRow = (r: WithUsage<CoordinationItem>): LibraryRow => ({ ...r, group: r.discipline });

function ItemDialog({
  kind, db, row, existingCodes, divisions, onClose, onSaved,
}: {
  kind: "shop_drawing" | "coordination"; db: SupabaseClient; row: LibraryRow | null; existingCodes: string[]; divisions: Division[];
  onClose: () => void; onSaved: () => void;
}) {
  const isSd = kind === "shop_drawing";
  const form = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
    defaultValues: {
      code: row?.code ?? suggestNextCode(existingCodes, isSd ? "SD-" : "CO-", 2), name: row?.name ?? "", group: row?.group ?? "",
      description: row?.description ?? "", sort_order: String(row?.sort_order ?? 0),
    },
  });
  const { register, formState: { errors, isSubmitting } } = form;

  async function submit(v: ItemValues) {
    try {
      const base = { id: row?.id, code: v.code, name: v.name, description: v.description || null, sort_order: Number(v.sort_order) };
      if (isSd) await upsertShopDrawingType(db, { ...base, csi_division_code: v.group || null });
      else await upsertCoordinationItem(db, { ...base, discipline: v.group || null });
      toast.success(row ? "Changes saved" : "Added");
      onSaved();
      onClose();
    } catch (e) {
      const msg = errorMessage(e, "Could not save");
      if (/code/i.test(msg)) form.setError("code", { message: msg });
      toast.error(msg);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{row ? "Edit" : "Add"} {isSd ? "shop drawing type" : "coordination item"}</DialogTitle>
          <DialogDescription>Library items can be linked to any activity from its Details tab.</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-3" noValidate>
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Code</Label>
              <Input {...register("code")} className="font-mono" aria-invalid={!!errors.code} />
              {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div>
              <Label className="mb-1 block text-xs text-muted-foreground">Name</Label>
              <Input {...register("name")} aria-invalid={!!errors.name} />
              {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>}
            </div>
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">{isSd ? "Division" : "Discipline"}</Label>
            {isSd ? (
              <select {...register("group")} className={SELECT_CLS}>
                <option value="">Any division</option>
                {divisions.filter((d) => d.is_active || d.code === row?.group).map((d) => <option key={d.code} value={d.code}>Division {d.code} - {d.name}</option>)}
              </select>
            ) : <Input {...register("group")} placeholder="MEP, Structural, Client..." />}
          </div>
          <div>
            <Label className="mb-1 block text-xs text-muted-foreground">Description</Label>
            <textarea {...register("description")} rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="w-32">
            <Label className="mb-1 block text-xs text-muted-foreground">Sort order</Label>
            <Input {...register("sort_order")} inputMode="numeric" aria-invalid={!!errors.sort_order} />
            {errors.sort_order && <p className="mt-1 text-xs text-destructive">{errors.sort_order.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Shop Drawing and Coordination tabs: library tables with usage counts; managers add, edit and deactivate. */
export function ChipLibraryTab({
  kind, db, canManage, divisions, query, refreshKey, onOpenActivity,
}: {
  kind: "shop_drawing" | "coordination"; db: SupabaseClient; canManage: boolean; divisions: Division[]; query: string; refreshKey: number;
  onOpenActivity: (id: string) => void;
}) {
  const isSd = kind === "shop_drawing";
  const [local, setLocal] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LibraryRow | "new" | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const load = useCallback(
    async () => (isSd ? (await listShopDrawingTypes(db, { q: query })).map(sdRow) : (await listCoordinationItems(db, { q: query })).map(coRow)),
    [db, isSd, query],
  );
  const { loaded, retry } = useRows<LibraryRow>(load, `${kind}|${query}|${refreshKey}|${local}`, "Failed to load the library");
  const divisionName = (code: string | null) => (code ? divisions.find((d) => d.code === code)?.name ?? "" : "");

  async function toggleActive(r: LibraryRow) {
    setBusyId(r.id);
    try {
      if (isSd) await setShopDrawingTypeActive(db, r.id, !r.is_active); else await setCoordinationItemActive(db, r.id, !r.is_active);
      toast.success(`${r.name} ${r.is_active ? "deactivated" : "activated"}`);
      setLocal((n) => n + 1);
    } catch (e) { toast.error(errorMessage(e, "Could not update")); } finally { setBusyId(null); }
  }

  const head = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">
        {loaded && !loaded.error ? `${loaded.rows.length.toLocaleString()} ${isSd ? "shop drawing type" : "coordination item"}${loaded.rows.length === 1 ? "" : "s"}. ` : ""}
        Select a row to see the activities that use it.
      </p>
      {canManage && <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> Add {isSd ? "shop drawing type" : "coordination item"}</Button>}
    </div>
  );
  const cols = canManage ? 7 : 6;

  return (
    <div className="space-y-3">
      {head}
      {!loaded ? <TableSkeleton /> : loaded.error ? <TableError message={loaded.error} onRetry={retry} /> : loaded.rows.length === 0 ? (
        <div className="space-y-2 rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p>{query ? "No items match your search." : "This library is empty."}</p>
          {canManage && !query && <Button size="sm" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> Add the first one</Button>}
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8" /><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>{isSd ? "Division" : "Discipline"}</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Used by</TableHead>{canManage && <TableHead className="w-40 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loaded.rows.map((r) => {
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <TableRow className="cursor-pointer" onClick={() => setOpenId(open ? null : r.id)} aria-expanded={open}>
                      <TableCell>{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{isSd ? (r.group ? `${r.group} ${divisionName(r.group)}`.trim() : "-") : r.group ?? "-"}</TableCell>
                      <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Active" : "Inactive"}</Badge></TableCell>
                      <TableCell className="text-right">{usedByBadge(r.usedBy)}</TableCell>
                      {canManage && (
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => void toggleActive(r)}>{r.is_active ? "Deactivate" : "Activate"}</Button>
                        </TableCell>
                      )}
                    </TableRow>
                    {open && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell /><TableCell colSpan={cols - 1}><UsedByCell db={db} kind={kind} refId={r.id} onOpenActivity={onOpenActivity} /></TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {editing && (
        <ItemDialog
          kind={kind} db={db} row={editing === "new" ? null : editing} divisions={divisions}
          existingCodes={loaded?.rows.map((r) => r.code) ?? []}
          onClose={() => setEditing(null)} onSaved={() => setLocal((n) => n + 1)}
        />
      )}
    </div>
  );
}
