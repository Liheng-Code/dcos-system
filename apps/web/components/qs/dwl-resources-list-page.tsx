"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import { AlertTriangle, DollarSign, Download, FileSpreadsheet, Package, Plus, Search, Pencil, Trash2, Loader2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
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

export default function DwlResourcesListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();
  const searchParams = useSearchParams();

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

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [resResult, priceResult] = await Promise.all([
      supabase
        .from("dwl_resources")
        .select("id, tenant_id, code, category, description, unit, spec_reference, is_active, created_by, created_at, updated_at")
        .order("code"),
      supabase
        .from("dwl_v_current_prices")
        .select("resource_id, code, description, unit, unit_price, currency, valid_from, quote_valid_until, source_type, supplier_name, is_expired"),
    ]);

    if (resResult.error) {
      setErrorMsg(resResult.error.message);
      setLoading(false);
      return;
    }
    if (priceResult.error) {
      setErrorMsg(priceResult.error.message);
      setLoading(false);
      return;
    }

    const priceByResource = new Map<string, DwlCurrentPrice>();
    for (const p of (priceResult.data ?? []) as DwlCurrentPrice[]) {
      priceByResource.set(p.resource_id, p);
    }

    const merged: DwlResourceRow[] = (resResult.data ?? []).map((r) => ({
      resource: r as DwlResource,
      price: priceByResource.get((r as DwlResource).id) ?? null,
    }));

    setRows(merged);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let result = rows;
    if (categoryFilter !== "all") {
      result = result.filter((r) => r.resource.category === categoryFilter);
    }
    if (activeFilter === "active") result = result.filter((r) => r.resource.is_active);
    if (activeFilter === "inactive") result = result.filter((r) => !r.resource.is_active);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.resource.code.toLowerCase().includes(q) ||
          cleanDescription(r.resource.description).toLowerCase().includes(q) ||
          r.resource.description.toLowerCase().includes(q) ||
          (r.price?.supplier_name && r.price.supplier_name.toLowerCase().includes(q))
      );
    }
    return result;
  }, [rows, categoryFilter, activeFilter, search]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  function exportRows() {
    return filtered.map(({ resource, price }) => ({
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

  function handleExcelExport() {
    const data = exportRows();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Price History");
    XLSX.writeFile(wb, `Price_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleCsvExport() {
    const data = exportRows();
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
      setRows((prev) => prev.filter((r) => r.resource.id !== id));
      setConfirmDeleteId(null);
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
          <h1 className="text-2xl font-semibold tracking-tight">Resource Master</h1>
          <p className="text-sm text-muted-foreground">
            Level 1: materials, labor, equipment &amp; subcontract resources with their current price. Full price history is in Price Analytics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={filtered.length === 0}>
            <Download className="h-3.5 w-3.5" /> CSV Export
          </Button>
          {canCreate && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={!tenantLoaded || !tenantId}>
              <Upload className="h-3.5 w-3.5" /> Import (Excel/CSV)
            </Button>
          )}
          <Button
            onClick={() => setShowResourceForm(true)}
            size="sm"
            disabled={!tenantLoaded || !tenantId || !canCreate}
            title={!canCreate ? "You do not have permission to add resources" : undefined}
          >
            <Plus className="h-4 w-4" /> Add Resource
          </Button>
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
          onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
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
          onChange={(e) => setActiveFilter(e.target.value as ActiveFilter)}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All Status</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground">{filtered.length} resources</span>
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
            {rows.length === 0
              ? "No resources in the cost library yet."
              : "No resources match your search or filters."}
          </p>
          {rows.length === 0 && canCreate && (
            <Button size="sm" onClick={() => setShowResourceForm(true)} disabled={!tenantId}>
              <Plus className="h-4 w-4" /> Add the first resource
            </Button>
          )}
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
                <TableHead className="w-24 text-center">Actions</TableHead>
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
                    <div className="flex gap-1 justify-center">
                      {canEdit && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="Edit resource"
                          onClick={() => setEditResource(resource)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="Delete resource"
                          disabled={deletingId === resource.id}
                          onClick={() => setConfirmDeleteId(resource.id)}
                        >
                          {deletingId === resource.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      )}
                      {canCreate && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!tenantId}
                          title="Add a new price (append-only)"
                          onClick={() => setPriceFormResource(resource)}
                        >
                          <DollarSign className="h-3.5 w-3.5" /> Price
                        </Button>
                      )}
                    </div>
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
