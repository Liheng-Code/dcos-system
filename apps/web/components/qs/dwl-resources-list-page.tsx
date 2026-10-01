"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  AlertTriangle, ChevronLeft, ChevronRight, DollarSign, Download, ExternalLink, FileSpreadsheet, Loader2, MoreHorizontal,
  Package, Pencil, Plus, Search, Trash2, Upload,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { downloadCsv, fmtCsvNum } from "@/lib/csv-export";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlResourceFormDialog } from "@/components/qs/dwl-resource-form-dialog";
import { DwlPriceFormDialog } from "@/components/qs/dwl-price-form-dialog";
import { DwlResourceImportDialog } from "@/components/qs/dwl-resource-import-dialog";
import {
  DWL_CATEGORIES,
  dwlDisplayResourceDescription,
  type DwlCategory,
  type DwlCurrentPrice,
  type DwlResource,
  type DwlResourceRow,
} from "@/components/qs/dwl-types";

type ActiveFilter = "active" | "inactive" | "all";
type CategoryFilter = DwlCategory | "all";

const CATEGORY_BADGE_CLASS: Record<DwlCategory, string> = {
  material: "bg-blue-50 text-blue-700 border-blue-200",
  labor: "bg-violet-50 text-violet-700 border-violet-200",
  equipment: "bg-orange-50 text-orange-700 border-orange-200",
  subcon: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(4)}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const cleanDescription = dwlDisplayResourceDescription;

// Each resource type is created and maintained in its own tab; this page is
// the cross-type register (search, current price, add price).
const TYPED_TAB: Record<DwlCategory, { label: string; href: string }> = {
  material: { label: "Material Master", href: "/dashboard/qs/dwl-materials" },
  labor: { label: "Labor Rates", href: "/dashboard/qs/dwl-labor-rates" },
  equipment: { label: "Equipment Rates", href: "/dashboard/qs/dwl-equipment-rates" },
  subcon: { label: "Subcontractor Rates", href: "/dashboard/qs/dwl-subcontractor-rates" },
};

// Server-side paging: the register holds every resource type and would
// otherwise hit PostgREST's 1000-row cap.
const PAGE_SIZE = 50;
const RESOURCE_COLUMNS = "id, tenant_id, code, category, description, unit, spec_reference, is_active, created_by, created_at, updated_at";

export default function DwlResourcesListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);
  const [tenantLoaded, setTenantLoaded] = useState(false);

  const [rows, setRows] = useState<DwlResourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pre-filled when arriving via a "Price History" link from another module
  // (e.g. Material Master), so the linked-from item is already isolated.
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");

  const [showResourceForm, setShowResourceForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editResource, setEditResource] = useState<DwlResource | null>(null);
  const [priceFormResource, setPriceFormResource] = useState<DwlResource | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Resolve the current user's tenant_id from profiles.company_id — same
  // pattern used by naming-transmittal-create.tsx / inv-service.ts's
  // resolveTenantId(). tenant_id is never accepted from user input.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setTenantLoaded(true);
        return;
      }
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", uid)
        .single();
      if (!error && profile?.company_id) {
        setTenantId(profile.company_id as string);
      }
      setTenantLoaded(true);
    });
  }, [supabase]);

  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 300);
    return () => clearTimeout(id);
  }, [search]);

  // Filters, search and paging run in the database; prices are fetched for the visible page only.
  const buildQuery = useCallback((columns: string, opts?: { count?: boolean }) => {
    let q = supabase.from("dwl_resources").select(columns, opts?.count ? { count: "exact" } : undefined);
    if (categoryFilter !== "all") q = q.eq("category", categoryFilter);
    if (activeFilter === "active") q = q.eq("is_active", true);
    if (activeFilter === "inactive") q = q.eq("is_active", false);
    const term = debouncedSearch.trim().replace(/[%,()]/g, " ");
    if (term) q = q.or(`code.ilike.%${term}%,description.ilike.%${term}%`);
    return q.order("code");
  }, [supabase, categoryFilter, activeFilter, debouncedSearch]);

  const withPrices = useCallback(async (resources: DwlResource[]): Promise<DwlResourceRow[]> => {
    const ids = resources.map((r) => r.id);
    const priceByResource = new Map<string, DwlCurrentPrice>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase
        .from("dwl_v_current_prices")
        .select("resource_id, code, description, unit, unit_price, currency, valid_from, quote_valid_until, source_type, supplier_name, is_expired")
        .in("resource_id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const p of (data ?? []) as DwlCurrentPrice[]) priceByResource.set(p.resource_id, p);
    }
    return resources.map((r) => ({ resource: r, price: priceByResource.get(r.id) ?? null }));
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error, count } = await buildQuery(RESOURCE_COLUMNS, { count: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw new Error(error.message);
      setRows(await withPrices((data ?? []) as unknown as DwlResource[]));
      setTotal(count ?? 0);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Failed to load resources");
    } finally {
      setLoading(false);
    }
  }, [buildQuery, withPrices, page]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = rows;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  // Exports cover every row matching the filters, not just the visible page.
  async function loadAllMatching(): Promise<DwlResourceRow[]> {
    const all: DwlResource[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await buildQuery(RESOURCE_COLUMNS).range(from, from + 999);
      if (error) throw new Error(error.message);
      all.push(...((data ?? []) as unknown as DwlResource[]));
      if (!data || data.length < 1000) break;
    }
    return withPrices(all);
  }

  async function exportRows() {
    const list = await loadAllMatching();
    return list.map(({ resource, price }) => ({
      Code: resource.code,
      Category: resource.category,
      Description: cleanDescription(resource.description),
      Unit: resource.unit,
      Price: price?.unit_price ?? "",
      Currency: price?.currency ?? "",
      Source: price?.source_type ?? "",
      Supplier: price?.supplier_name ?? "",
      "Valid From": price?.valid_from ?? "",
      Status: resource.is_active ? "Active" : "Inactive",
    }));
  }

  async function handleExcelExport() {
    const data = await exportRows();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Price History");
    XLSX.writeFile(wb, `Price_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function handleCsvExport() {
    const data = await exportRows();
    const header = Object.keys(data[0] ?? {});
    const dataRows = data.map((r) => header.map((h) => {
      const v = (r as Record<string, string | number>)[h];
      return typeof v === "number" ? fmtCsvNum(v) : String(v ?? "");
    }));
    downloadCsv(`Price_History_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...dataRows]);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const { data, error } = await supabase.from("dwl_resources").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error("Delete was blocked by row-level security. Contact your administrator.");
      }
      toast.success("Resource deleted");
      setConfirmDeleteId(null);
      void loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete resource");
    } finally {
      setDeletingId(null);
    }
  }

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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">All Resources — Price Register</h1>
          <p className="text-sm text-muted-foreground">
            Every material, labour, equipment and subcontract resource with its current price. Search across types and add
            new prices here; create and maintain each type in its own tab. Full price history is in Price Analytics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleExcelExport()} disabled={total === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => void handleCsvExport()} disabled={total === 0}>
            <Download className="h-3.5 w-3.5" /> CSV Export
          </Button>
          {canCreate && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={!tenantLoaded || !tenantId}>
              <Upload className="h-3.5 w-3.5" /> Import (Excel/CSV)
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size="sm" disabled={!tenantLoaded || !tenantId || !canCreate} title={!canCreate ? "You do not have permission to add resources" : undefined} />}
            >
              <Plus className="h-4 w-4" /> Add Resource
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Create in its own tab</DropdownMenuLabel>
              {DWL_CATEGORIES.map((c) => (
                <DropdownMenuItem key={c.value} onClick={() => router.push(TYPED_TAB[c.value].href)}>
                  <ExternalLink /> {c.label} → {TYPED_TAB[c.value].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or description…"
            className="pl-8"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value as CategoryFilter); setPage(0); }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="all">All Categories</option>
          {DWL_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={activeFilter}
          onChange={(e) => { setActiveFilter(e.target.value as ActiveFilter); setPage(0); }}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All Status</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {total === 0 ? "0 resources" : `${page * PAGE_SIZE + 1}–${Math.min(total, (page + 1) * PAGE_SIZE)} of ${total} resources`}
          </span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)} aria-label="Previous page">
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((p) => p + 1)} aria-label="Next page">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load resources: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {debouncedSearch.trim() || categoryFilter !== "all" || activeFilter !== "active"
              ? "No resources match your search or filters."
              : "No resources in the cost library yet."}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead className="w-24">Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-16">Unit</TableHead>
                <TableHead className="w-28 text-right">Price</TableHead>
                <TableHead className="w-20">Source</TableHead>
                <TableHead className="w-40">Supplier</TableHead>
                <TableHead className="w-24">Valid From</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-16 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(({ resource, price }) => (
                <TableRow key={resource.id} className={cn(!resource.is_active && "opacity-50")}>
                  <TableCell className="font-mono text-xs font-medium">{resource.code}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                        CATEGORY_BADGE_CLASS[resource.category]
                      )}
                    >
                      {resource.category}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm line-clamp-2" title={resource.description}>
                    {cleanDescription(resource.description)}
                    {resource.spec_reference && (
                      <span className="ml-1.5 text-xs text-muted-foreground">({resource.spec_reference})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{resource.unit}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">
                    {price ? formatMoney(price.unit_price, price.currency) : (
                      <span className="font-sans font-normal text-muted-foreground">No price yet</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{price?.source_type ?? "—"}</TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">
                    {price?.supplier_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(price?.valid_from ?? null)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!resource.is_active && <Badge variant="secondary">Inactive</Badge>}
                      {price?.is_expired && <Badge variant="destructive">Expired</Badge>}
                      {resource.is_active && !price && <Badge variant="outline">No price</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Actions for ${resource.code}`} />}
                        disabled={deletingId === resource.id}
                      >
                        {deletingId === resource.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        {canCreate && (
                          <DropdownMenuItem disabled={!tenantId} onClick={() => setPriceFormResource(resource)}>
                            <DollarSign /> Add new price
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => router.push(resource.category === "material"
                            ? `/dashboard/qs/dwl-materials/${resource.id}`
                            : TYPED_TAB[resource.category].href)}
                        >
                          <ExternalLink /> Open in {TYPED_TAB[resource.category].label}
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => setEditResource(resource)}>
                            <Pencil /> Edit code / description / unit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteId(resource.id)}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DwlResourceFormDialog
        open={showResourceForm || editResource !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowResourceForm(false);
            setEditResource(null);
          }
        }}
        tenantId={tenantId}
        userId={userId}
        editResource={editResource}
        onCreated={() => void loadData()}
      />

      <DwlPriceFormDialog
        open={priceFormResource !== null}
        onOpenChange={(open) => {
          if (!open) setPriceFormResource(null);
        }}
        resource={priceFormResource}
        tenantId={tenantId}
        userId={userId}
        onCreated={() => void loadData()}
      />

      <DwlResourceImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        tenantId={tenantId}
        userId={userId}
        onImported={() => void loadData()}
      />

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="rounded-lg bg-background border border-border p-6 shadow-lg w-full max-w-sm">
            <h3 className="text-lg font-semibold">Delete Resource</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Are you sure you want to delete this resource? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deletingId === confirmDeleteId}
                onClick={() => void handleDelete(confirmDeleteId)}
              >
                {deletingId === confirmDeleteId && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
