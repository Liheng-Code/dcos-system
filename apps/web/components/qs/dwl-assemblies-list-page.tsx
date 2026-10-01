"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Blocks, Loader2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlAssemblyFormDialog } from "@/components/qs/dwl-assembly-form-dialog";
import { DwlAssemblyItemFormDialog } from "@/components/qs/dwl-assembly-item-form-dialog";
import type {
  DwlAssembly,
  DwlAssemblyItem,
  DwlAssemblyItemRow,
  DwlAssemblyRate,
  DwlAssemblyRow,
} from "@/components/qs/dwl-types";
import { deleteDwlAssemblyByIdReturning, deleteDwlAssemblyItemById, getProfileById, listDwlAssemblies, listDwlAssemblyItemsByAssemblyId, listDwlVAssemblyRates, listDwlVWorkItemRatesByWorkItemIds } from "@/lib/qs/qs-queries";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

export default function DwlAssembliesListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();
  const searchParams = useSearchParams();

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantLoaded, setTenantLoaded] = useState(false);

  const [rows, setRows] = useState<DwlAssemblyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-filled when arriving from a Cost Item's "Open in Assembly Builder" link.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [groupFilter, setGroupFilter] = useState<string>("all");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailLines, setDetailLines] = useState<DwlAssemblyItemRow[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailNote, setDetailNote] = useState<string | null>(null);

  const [showAssemblyForm, setShowAssemblyForm] = useState(false);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<DwlAssemblyItem | null>(null);
  const [editingAssembly, setEditingAssembly] = useState<DwlAssembly | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [confirmDeleteAssemblyId, setConfirmDeleteAssemblyId] = useState<string | null>(null);
  const [deletingAssemblyId, setDeletingAssemblyId] = useState<string | null>(null);

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
    const [asmResult, rateResult] = await Promise.all([
      listDwlAssemblies(),
      listDwlVAssemblyRates(),
    ]);

    if (asmResult.error) {
      setErrorMsg(asmResult.error.message);
      setLoading(false);
      return;
    }
    if (rateResult.error) {
      setErrorMsg(rateResult.error.message);
      setLoading(false);
      return;
    }

    const rateByAssembly = new Map<string, DwlAssemblyRate>();
    for (const r of (rateResult.data ?? []) as DwlAssemblyRate[]) {
      rateByAssembly.set(r.assembly_id, r);
    }
    const merged: DwlAssemblyRow[] = (asmResult.data ?? []).map((a) => ({
      assembly: a as DwlAssembly,
      rate: rateByAssembly.get((a as DwlAssembly).id) ?? null,
    }));
    setRows(merged);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadList(); }, [loadList]);

  const groupOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.assembly.element_group));
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (groupFilter !== "all") result = result.filter((r) => r.assembly.element_group === groupFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) => r.assembly.code.toLowerCase().includes(q) || r.assembly.description.toLowerCase().includes(q)
      );
    }
    return result;
  }, [rows, groupFilter, search]);

  const selectedRow = useMemo(() => rows.find((r) => r.assembly.id === selectedId) ?? null, [rows, selectedId]);

  const loadDetail = useCallback(
    async (assembly: DwlAssembly) => {
      setDetailLoading(true);
      setDetailNote(null);

      const itemsResult = await listDwlAssemblyItemsByAssemblyId(assembly.id, "id, tenant_id, assembly_id, work_item_id, qty_per_unit, basis_note, sort_order, dwl_work_items!inner(code, description, unit)");

      if (itemsResult.error) {
        setDetailNote(itemsResult.error.message);
        setDetailLoading(false);
        return;
      }

      type RawItem = DwlAssemblyItem & { dwl_work_items: { code: string; description: string; unit: string } };
      const rawItems = (itemsResult.data ?? []) as unknown as RawItem[];
      const workItemIds = rawItems.map((r) => r.work_item_id);

      const rateResult = workItemIds.length
        ? await listDwlVWorkItemRatesByWorkItemIds(workItemIds)
        : { data: [], error: null };

      if (rateResult.error) {
        setDetailNote(rateResult.error.message);
        setDetailLoading(false);
        return;
      }

      const rateByWorkItem = new Map<string, { net_direct_rate: number; has_expired_price: boolean }>();
      for (const r of (rateResult.data ?? []) as { work_item_id: string; net_direct_rate: number; has_expired_price: boolean }[]) {
        rateByWorkItem.set(r.work_item_id, r);
      }

      const merged: DwlAssemblyItemRow[] = rawItems.map((row) => {
        const rate = rateByWorkItem.get(row.work_item_id);
        return {
          item: {
            id: row.id,
            tenant_id: row.tenant_id,
            assembly_id: row.assembly_id,
            work_item_id: row.work_item_id,
            qty_per_unit: row.qty_per_unit,
            basis_note: row.basis_note,
            sort_order: row.sort_order,
          },
          workItem: {
            code: row.dwl_work_items.code,
            description: row.dwl_work_items.description,
            unit: row.dwl_work_items.unit,
            net_direct_rate: rate?.net_direct_rate ?? null,
            has_expired_price: rate?.has_expired_price ?? false,
          },
        };
      });

      setDetailLines(merged);
      setDetailLoading(false);

      const unpriced = merged.filter((l) => l.workItem.net_direct_rate === null).length;
      if (unpriced > 0) {
        setDetailNote(
          `${unpriced} line(s) reference a work item with no computed rate (no recipe lines yet) and are excluded from the assembly rate below.`
        );
      }
    },
    [supabase]
  );

  useEffect(() => {
    if (selectedRow) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadDetail(selectedRow.assembly);
    } else {
      setDetailLines([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRow?.assembly.id]);

  const lineSum = useMemo(
    () => detailLines.reduce((sum, l) => sum + (l.workItem.net_direct_rate ?? 0) * l.item.qty_per_unit, 0),
    [detailLines]
  );

  async function handleDeleteItem(row: DwlAssemblyItemRow) {
    if (!confirm(`Delete the assembly line for ${row.workItem.code}?`)) return;
    setDeletingItemId(row.item.id);
    const { error } = await deleteDwlAssemblyItemById(row.item.id);
    setDeletingItemId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Assembly item deleted");
    if (selectedRow) void loadDetail(selectedRow.assembly);
    void loadList();
  }

  async function handleDeleteAssembly(id: string) {
    setDeletingAssemblyId(id);
    const { data, error } = await deleteDwlAssemblyByIdReturning(id);
    setDeletingAssemblyId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.error("Delete was blocked by row-level security. Contact your administrator.");
      return;
    }
    toast.success("Assembly deleted");
    setConfirmDeleteAssemblyId(null);
    if (selectedId === id) setSelectedId(null);
    void loadList();
  }

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  const nextSortOrder = useMemo(() => {
    if (detailLines.length === 0) return 10;
    return Math.max(...detailLines.map((l) => l.item.sort_order)) + 10;
  }, [detailLines]);

  const editingItemWorkItem = useMemo(() => {
    if (!editingItem) return null;
    const row = detailLines.find((l) => l.item.id === editingItem.id);
    return row ? { code: row.workItem.code, description: row.workItem.description, unit: row.workItem.unit } : null;
  }, [editingItem, detailLines]);

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
            <Link href="/dashboard/qs/dwl-work-items" className="text-primary hover:underline">Rate Build-Up (work items)</Link>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Direct Works Cost Library — Assembly Builder</h1>
          <p className="text-sm text-muted-foreground">
            Level 3: complete building elements priced as recipes of Level 2 work items, using design ratios. Advanced editor — use it for assemblies built from several work items.
          </p>
        </div>
        <Button
          onClick={() => setShowAssemblyForm(true)}
          size="sm"
          disabled={!tenantLoaded || !tenantId || !canCreate}
          title={!canCreate ? "You do not have permission to add assemblies" : undefined}
        >
          <Plus className="h-4 w-4" /> Add Assembly
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left: assembly list */}
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
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              <option value="all">All Element Groups</option>
              {groupOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => void loadList()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">{filtered.length} assemblies</span>
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive/60" />
              <p className="text-sm text-muted-foreground">Failed to load assemblies: {errorMsg}</p>
              <Button size="sm" variant="outline" onClick={() => void loadList()}>
                Retry
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <Blocks className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {rows.length === 0
                  ? "No assemblies in the cost library yet — this level is not populated yet."
                  : "No assemblies match your search or filters."}
              </p>
              {rows.length === 0 && canCreate && (
                <Button size="sm" onClick={() => setShowAssemblyForm(true)} disabled={!tenantId}>
                  <Plus className="h-4 w-4" /> Add the first assembly
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-32">Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-24 text-right">Rate</TableHead>
                    <TableHead className="w-20 text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow
                      key={row.assembly.id}
                      onClick={() => setSelectedId(row.assembly.id)}
                      className={cn("cursor-pointer", selectedId === row.assembly.id && "bg-muted/50")}
                    >
                      <TableCell className="font-mono text-xs font-medium">{row.assembly.code}</TableCell>
                      <TableCell className="text-xs">
                        <div className="line-clamp-2">{row.assembly.description}</div>
                        <span className="text-[10px] text-muted-foreground">{row.assembly.element_group}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium">
                        {row.rate ? formatMoney(row.rate.net_direct_rate) : <span className="font-sans text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingAssembly(row.assembly); setShowAssemblyForm(true); }}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                              title="Edit assembly"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteAssemblyId(row.assembly.id); }}
                              disabled={deletingAssemblyId === row.assembly.id}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                              title="Delete assembly"
                            >
                              {deletingAssemblyId === row.assembly.id ? (
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

        {/* Right: assembly builder detail */}
        <div className="lg:col-span-3">
          {!selectedRow ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
              <Blocks className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Select an assembly on the left to build or review its rate.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">{selectedRow.assembly.code}</span>
                    <Badge variant="outline">{selectedRow.assembly.element_group}</Badge>
                    {selectedRow.rate?.has_expired_price && <Badge variant="destructive">Has expired price</Badge>}
                  </div>
                  <p className="mt-1 text-sm">{selectedRow.assembly.description}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Measurement rule: {selectedRow.assembly.measurement_rule}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-muted-foreground">Net Direct Rate / {selectedRow.assembly.unit}</p>
                  <p className="text-2xl font-semibold tabular-nums">
                    {selectedRow.rate ? formatMoney(selectedRow.rate.net_direct_rate) : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Assembly items (design ratios)</p>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!tenantId || !canCreate}
                  title={!canCreate ? "You do not have permission to add assembly items" : undefined}
                  onClick={() => {
                    setEditingItem(null);
                    setShowItemForm(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Item
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
                  <p className="text-sm text-muted-foreground">No item lines yet — this assembly has no computed rate.</p>
                  {canCreate && (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingItem(null);
                        setShowItemForm(true);
                      }}
                    >
                      <Plus className="h-4 w-4" /> Add the first item
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {detailNote && (
                    <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      {detailNote}
                    </p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-28">Work Item</TableHead>
                          <TableHead>Description / Basis</TableHead>
                          <TableHead className="w-24 text-right">Design Ratio</TableHead>
                          <TableHead className="w-24 text-right">WI Rate</TableHead>
                          <TableHead className="w-24 text-right">Contribution</TableHead>
                          <TableHead className="w-24 text-center">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailLines.map((line) => (
                          <TableRow key={line.item.id}>
                            <TableCell className="font-mono text-xs font-medium">
                              {line.workItem.code}
                              {line.workItem.has_expired_price && (
                                <Badge variant="destructive" className="ml-1.5">
                                  Expired
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              <div>{line.workItem.description}</div>
                              <div className="text-[11px] italic text-muted-foreground">{line.item.basis_note}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs">{line.item.qty_per_unit}</TableCell>
                            <TableCell className="text-right font-mono text-xs">
                              {line.workItem.net_direct_rate !== null ? formatMoney(line.workItem.net_direct_rate) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium">
                              {line.workItem.net_direct_rate !== null
                                ? formatMoney(line.workItem.net_direct_rate * line.item.qty_per_unit)
                                : "—"}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                {canEdit && (
                                  <button
                                    onClick={() => {
                                      setEditingItem(line.item);
                                      setShowItemForm(true);
                                    }}
                                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    onClick={() => void handleDeleteItem(line)}
                                    disabled={deletingItemId === line.item.id}
                                    className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                  >
                                    {deletingItemId === line.item.id ? (
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
                    <span className="text-muted-foreground">Sum of items:</span>
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

      <DwlAssemblyFormDialog
        open={showAssemblyForm}
        onOpenChange={(open) => {
          setShowAssemblyForm(open);
          if (!open) setEditingAssembly(null);
        }}
        tenantId={tenantId}
        userId={userId}
        editItem={editingAssembly}
        onCreated={(newId) => {
          void loadList();
          setSelectedId(newId);
        }}
        onSaved={() => {
          void loadList();
          if (selectedId) {
            const updated = rows.find((r) => r.assembly.id === selectedId);
            if (updated) void loadDetail(updated.assembly);
          }
        }}
      />

      <DwlAssemblyItemFormDialog
        open={showItemForm}
        onOpenChange={(open) => {
          setShowItemForm(open);
          if (!open) setEditingItem(null);
        }}
        tenantId={tenantId}
        assembly={selectedRow?.assembly ?? null}
        editingItem={editingItem}
        editingItemWorkItem={editingItemWorkItem}
        nextSortOrder={nextSortOrder}
        onSaved={() => {
          if (selectedRow) void loadDetail(selectedRow.assembly);
          void loadList();
        }}
      />

      {confirmDeleteAssemblyId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-background border border-border p-6 shadow-lg w-full max-w-sm">
            <h3 className="text-lg font-semibold">Delete Assembly</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete this assembly? All item lines will also be removed. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteAssemblyId(null)}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deletingAssemblyId === confirmDeleteAssemblyId}
                onClick={() => void handleDeleteAssembly(confirmDeleteAssemblyId)}
              >
                {deletingAssemblyId === confirmDeleteAssemblyId && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
