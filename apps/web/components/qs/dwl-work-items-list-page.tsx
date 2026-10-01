"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ClipboardList, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlWorkItemFormDialog } from "@/components/qs/dwl-work-item-form-dialog";
import { DwlRecipeLineFormDialog } from "@/components/qs/dwl-recipe-line-form-dialog";
import type {
  DwlWorkItem,
  DwlWorkItemExplosionLine,
  DwlWorkItemRate,
  DwlWorkItemResource,
  DwlWorkItemRow,
} from "@/components/qs/dwl-types";
import { deleteDwlWorkItemByIdReturning, deleteDwlWorkItemResourceById, getProfileById, listDwlVWorkItemExplosionByWorkItemCode, listDwlVWorkItemRates, listDwlWorkItemResourcesByWorkItemId, listDwlWorkItemsOrderedByCode } from "@/lib/qs/qs-queries";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

// A recipe line as rendered in the detail panel: the explosion view's
// computed columns (line_cost, is_expired, unit_price, source_type) merged
// with the raw dwl_work_item_resources row (needed only for its id, to
// support edit/delete — dwl_work_item_resources is normal CRUD, not
// append-only, unlike dwl_resource_prices).
interface DetailLine {
  explosion: DwlWorkItemExplosionLine;
  raw: DwlWorkItemResource | null;
}

export default function DwlWorkItemsListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();
  const searchParams = useSearchParams();

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantLoaded, setTenantLoaded] = useState(false);

  const [rows, setRows] = useState<DwlWorkItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-filled when arriving from a Cost Item's "Open in Rate Build-Up" link.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [sectionFilter, setSectionFilter] = useState<string>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<DetailLine[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [showWorkItemForm, setShowWorkItemForm] = useState(false);
  const [showLineForm, setShowLineForm] = useState(false);
  const [editingLine, setEditingLine] = useState<DwlWorkItemResource | null>(null);
  const [editingWorkItem, setEditingWorkItem] = useState<DwlWorkItem | null>(null);
  const [deletingLineId, setDeletingLineId] = useState<string | null>(null);
  const [confirmDeleteWorkItemId, setConfirmDeleteWorkItemId] = useState<string | null>(null);
  const [deletingWorkItemId, setDeletingWorkItemId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setTenantLoaded(true);
        return;
      }
      const { data: profile, error } = await getProfileById(uid, "company_id");
      if (!error && profile?.company_id) setTenantId(profile.company_id as string);
      setTenantLoaded(true);
    });
  }, [supabase]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [wiResult, rateResult] = await Promise.all([
      listDwlWorkItemsOrderedByCode(),
      listDwlVWorkItemRates(),
    ]);

    if (wiResult.error) {
      setErrorMsg(wiResult.error.message);
      setLoading(false);
      return;
    }
    if (rateResult.error) {
      setErrorMsg(rateResult.error.message);
      setLoading(false);
      return;
    }

    const rateByWorkItem = new Map<string, DwlWorkItemRate>();
    for (const r of (rateResult.data ?? []) as DwlWorkItemRate[]) {
      rateByWorkItem.set(r.work_item_id, r);
    }
    const merged: DwlWorkItemRow[] = (wiResult.data ?? []).map((wi) => ({
      workItem: wi as DwlWorkItem,
      rate: rateByWorkItem.get((wi as DwlWorkItem).id) ?? null,
    }));
    setRows(merged);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadList(); }, [loadList]);

  const sectionOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.workItem.boq_section));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (sectionFilter !== "all") result = result.filter((r) => r.workItem.boq_section === sectionFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) => r.workItem.code.toLowerCase().includes(q) || r.workItem.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, sectionFilter, search]);

  const selectedRow = useMemo(() => rows.find((r) => r.workItem.id === selectedId) ?? null, [rows, selectedId]);

  const loadDetail = useCallback(
    async (workItem: DwlWorkItem) => {
      setDetailLoading(true);
      setDetailError(null);
      const [explosionResult, rawResult] = await Promise.all([
        listDwlVWorkItemExplosionByWorkItemCode(workItem.code),
        listDwlWorkItemResourcesByWorkItemId(workItem.id),
      ]);

      if (explosionResult.error) {
        setDetailError(explosionResult.error.message);
        setDetailLoading(false);
        return;
      }
      if (rawResult.error) {
        setDetailError(rawResult.error.message);
        setDetailLoading(false);
        return;
      }

      const rawByCode = new Map<string, DwlWorkItemResource>();
      for (const row of (rawResult.data ?? []) as unknown as (DwlWorkItemResource & { dwl_resources: { code: string } })[]) {
        rawByCode.set(row.dwl_resources.code, {
          id: row.id,
          tenant_id: row.tenant_id,
          work_item_id: row.work_item_id,
          resource_id: row.resource_id,
          consumption: row.consumption,
          waste_pct: row.waste_pct,
          basis_note: row.basis_note,
          sort_order: row.sort_order,
        });
      }

      const merged: DetailLine[] = ((explosionResult.data ?? []) as DwlWorkItemExplosionLine[]).map((line) => ({
        explosion: line,
        raw: rawByCode.get(line.resource_code) ?? null,
      }));
      setDetailLines(merged);
      setDetailLoading(false);

      // Recipe lines whose resource has no explosion row (inactive/unpriced
      // resource) are silently excluded from dwl_v_work_item_explosion by
      // design — surface that gap rather than hide it.
      const rawCount = rawResult.data?.length ?? 0;
      if (rawCount > merged.length) {
        setDetailError(
          `${rawCount - merged.length} recipe line(s) reference an inactive or unpriced resource and are excluded from the rate below.`
        );
      }
    },
    [supabase]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (selectedRow) void loadDetail(selectedRow.workItem);
    else setDetailLines([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.workItem.id]);

  const lineSum = useMemo(
    () => detailLines.reduce((sum, l) => sum + l.explosion.line_cost, 0),
    [detailLines]
  );

  async function handleDeleteLine(line: DetailLine) {
    if (!line.raw) return;
    if (!confirm(`Delete the recipe line for ${line.explosion.resource_code}?`)) return;
    setDeletingLineId(line.raw.id);
    const { error } = await deleteDwlWorkItemResourceById(line.raw.id);
    setDeletingLineId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Recipe line deleted");
    if (selectedRow) void loadDetail(selectedRow.workItem);
    void loadList();
  }

  async function handleDeleteWorkItem(id: string) {
    setDeletingWorkItemId(id);
    const { data, error } = await deleteDwlWorkItemByIdReturning(id);
    setDeletingWorkItemId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Delete was blocked by row-level security. Contact your administrator.");
      return;
    }
    toast.success("Work item deleted");
    setConfirmDeleteWorkItemId(null);
    if (selectedId === id) setSelectedId(null);
    void loadList();
  }

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  const nextSortOrder = useMemo(() => {
    if (detailLines.length === 0) return 10;
    return Math.max(...detailLines.map((l) => l.raw?.sort_order ?? l.explosion.sort_order)) + 10;
  }, [detailLines]);

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Direct Works Cost Library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-3 text-xs">
            <Link href="/dashboard/qs/dwl-cost-items" className="text-muted-foreground hover:text-foreground">← Cost Item Library</Link>
            <Link href="/dashboard/qs/dwl-assemblies" className="text-primary hover:underline">Assembly Builder</Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct Works Cost Library — Rate Build-Up</h1>
          <p className="text-sm text-muted-foreground">
            Level 2: work items priced as recipes of Level 1 resources. Select a work item to see why it costs what it costs. Advanced editor.
          </p>
        </div>
        <Button
          onClick={() => setShowWorkItemForm(true)}
          size="sm"
          disabled={!tenantLoaded || !tenantId || !canCreate}
          title={!canCreate ? "You do not have permission to add work items" : undefined}
        >
          <Plus className="h-4 w-4" /> Add Work Item
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: work item list */}
        <div className="flex flex-col gap-3 lg:col-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code or description…"
                className="pl-8"
              />
            </div>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="all">All Sections</option>
              {sectionOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => void loadList()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} items</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">Failed to load work items: {errorMsg}</p>
              <Button size="sm" variant="outline" onClick={() => void loadList()}>
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {rows.length === 0 ? "No work items in the cost library yet." : "No work items match your search or filters."}
              </p>
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-28">Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24 text-right">Rate</TableHead>
                    <TableHead className="w-20 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.workItem.id}
                      onClick={() => setSelectedId(row.workItem.id)}
                      className={cn("cursor-pointer", selectedId === row.workItem.id && "bg-muted/50")}
                    >
                      <TableCell className="font-mono text-xs font-medium">{row.workItem.code}</TableCell>
                      <TableCell className="text-xs">
                        <div className="line-clamp-2">{row.workItem.description}</div>
                        <span className="text-[10px] text-muted-foreground">
                          {row.workItem.boq_section} · {row.rate?.recipe_lines ?? 0} line{row.rate?.recipe_lines === 1 ? "" : "s"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium">
                        {row.rate ? formatMoney(row.rate.net_direct_rate) : <span className="font-sans text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingWorkItem(row.workItem); setShowWorkItemForm(true); }}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Edit work item"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteWorkItemId(row.workItem.id); }}
                              disabled={deletingWorkItemId === row.workItem.id}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Delete work item"
                            >
                              {deletingWorkItemId === row.workItem.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Trash2 className="h-3 w-3" />
                              )}
                            </button>
                          )}
                          {row.rate?.has_expired_price && <Badge variant="destructive">!</Badge>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Right: rate build-up detail */}
        <div className="lg:col-span-3">
          {!selectedRow ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Select a work item on the left to see its rate build-up.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{selectedRow.workItem.code}</span>
                    <Badge variant="outline">{selectedRow.workItem.boq_section}</Badge>
                    {selectedRow.rate?.has_expired_price && <Badge variant="destructive">Has expired price</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{selectedRow.workItem.description}</p>
                  {selectedRow.workItem.method_note && (
                    <p className="mt-0.5 text-xs text-muted-foreground">Method: {selectedRow.workItem.method_note}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted-foreground">Net Direct Rate / {selectedRow.workItem.unit}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {selectedRow.rate ? formatMoney(selectedRow.rate.net_direct_rate) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Recipe (explosion)</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!tenantId || !canCreate}
                  title={!canCreate ? "You do not have permission to add recipe lines" : undefined}
                  onClick={() => {
                    setEditingLine(null);
                    setShowLineForm(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Line
                </Button>
              </div>

              {detailLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : detailLines.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
                  <p className="text-sm text-muted-foreground">No recipe lines yet — this work item has no computed rate.</p>
                  {canCreate && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingLine(null);
                        setShowLineForm(true);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Add the first line
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {detailError && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      {detailError}
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Resource</TableHead>
                          <TableHead>Description / Basis</TableHead>
                          <TableHead className="w-16 text-right">Qty</TableHead>
                          <TableHead className="w-14 text-right">Waste</TableHead>
                          <TableHead className="w-20 text-right">Unit $</TableHead>
                          <TableHead className="w-24 text-right">Line Cost</TableHead>
                          <TableHead className="w-24 text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailLines.map((line) => (
                          <TableRow key={line.explosion.resource_code}>
                            <TableCell className="font-mono text-xs font-medium">
                              {line.explosion.resource_code}
                              {line.explosion.is_expired && (
                                <Badge variant="destructive" className="ml-1.5">
                                  Expired
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>{line.explosion.resource_desc}</div>
                              <div className="text-[11px] italic text-muted-foreground">{line.explosion.basis_note}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {line.explosion.consumption} {line.explosion.resource_unit}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {(line.explosion.waste_pct * 100).toFixed(1)}%
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{formatMoney(line.explosion.unit_price)}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium">
                              {formatMoney(line.explosion.line_cost)}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canEdit && line.raw && (
                                  <button
                                    onClick={() => {
                                      setEditingLine(line.raw);
                                      setShowLineForm(true);
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                {canDelete && line.raw && (
                                  <button
                                    onClick={() => void handleDeleteLine(line)}
                                    disabled={deletingLineId === line.raw.id}
                                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  >
                                    {deletingLineId === line.raw.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="h-3 w-3" />
                                    )}
                                  </button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-end gap-2 text-xs">
                    <span className="text-muted-foreground">Sum of lines:</span>
                    <span className="font-mono font-medium">{formatMoney(lineSum)}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        selectedRow.rate && Math.abs(lineSum - selectedRow.rate.net_direct_rate) < 0.01
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {selectedRow.rate && Math.abs(lineSum - selectedRow.rate.net_direct_rate) < 0.01
                        ? "Reconciles with header rate"
                        : "Does not match header rate"}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <DwlWorkItemFormDialog
        open={showWorkItemForm}
        onOpenChange={(open) => {
          setShowWorkItemForm(open);
          if (!open) setEditingWorkItem(null);
        }}
        tenantId={tenantId}
        userId={userId}
        editItem={editingWorkItem}
        onCreated={(newId) => {
          void loadList();
          setSelectedId(newId);
        }}
        onSaved={() => {
          void loadList();
          if (selectedId) {
            const updated = rows.find((r) => r.workItem.id === selectedId);
            if (updated) void loadDetail(updated.workItem);
          }
        }}
      />

      <DwlRecipeLineFormDialog
        open={showLineForm}
        onOpenChange={(open) => {
          setShowLineForm(open);
          if (!open) setEditingLine(null);
        }}
        tenantId={tenantId}
        workItem={selectedRow?.workItem ?? null}
        editingLine={editingLine}
        nextSortOrder={nextSortOrder}
        onSaved={() => {
          if (selectedRow) void loadDetail(selectedRow.workItem);
          void loadList();
        }}
      />

      {confirmDeleteWorkItemId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-background border border-border p-6 shadow-lg w-full max-w-sm">
            <h3 className="text-lg font-semibold">Delete Work Item</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete this work item? All recipe lines will also be removed. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteWorkItemId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deletingWorkItemId === confirmDeleteWorkItemId}
                onClick={() => void handleDeleteWorkItem(confirmDeleteWorkItemId)}
              >
                {deletingWorkItemId === confirmDeleteWorkItemId && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
