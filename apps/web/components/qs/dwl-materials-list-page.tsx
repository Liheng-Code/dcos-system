"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, Camera, Eye, FileDown, FileSpreadsheet, History,
  ImageOff, LayoutGrid, Loader2, MoreHorizontal, Network, Package, Pencil, Plus,
  Search, Table2, Tags, Trash2, Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { downloadCsv, fmtCsvNum } from "@/lib/csv-export";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { useQsLibrarySearch } from "@/hooks/use-qs-library-search";
import { QsSearchIndexRefreshButton } from "@/components/qs/qs-search-index-refresh-button";
import { DwlMaterialFormDialog } from "@/components/qs/dwl-material-form-dialog";
import { DwlMaterialCategoryDialog } from "@/components/qs/dwl-material-category-dialog";
import { DwlMaterialImportDialog } from "@/components/qs/dwl-material-import-dialog";
import { DwlMaterialDuplicatesDialog } from "@/components/qs/dwl-material-duplicates-dialog";
import type { DwlMaterialCategory, DwlMaterialDivision, DwlMaterialRow } from "@/components/qs/dwl-types";
import { deleteDwlResourceByIdReturning, getProfileById, listDwlMaterialCategoriesOrderedBySortOrderAndName, listDwlMaterialDivisionsOrderedBySortOrderAndCode, listDwlMaterialPhotosByResourceIds, listDwlVMaterialsOrderedByCode } from "@/lib/qs/qs-queries";

type StatusFilter = "active" | "inactive" | "all";
type ViewMode = "cards" | "table";
type Density = "visual" | "dense";

function formatMoney(value: number | null, currency: string | null) {
  if (value == null) return null;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(value);
  } catch {
    return `${currency ?? "USD"} ${value.toFixed(4)}`;
  }
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// Display-only cleanup for legacy-migration text — strips the leading
// "Material component (migrated) for " boilerplate and the trailing
// "(source: qs_cost_items.code='03 20 13')" note that some seeded/migrated
// rows carry in material_name/description — never touches the stored data.
function cleanLabel(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/^material component \(migrated\) for\s*/i, "")
    .replace(/\s*\(source:[^)]*\)/gi, "")
    .trim();
}

// Cosmetic only — the underlying stored unit stays the locked DWL_UNITS
// token (e.g. "m2"); this only affects how it is displayed on the card.
function prettyUnit(unit: string): string {
  if (unit === "m2") return "m²";
  if (unit === "m3") return "m³";
  return unit;
}

// dwl_v_materials column list — kept explicit so a later additive view change
// does not silently pull unexpected columns. Extended (DCOS-DS-12-012,
// migration 20260910000025) with category / budget code / application scope
// / photo_count trailing columns.
const V_COLUMNS =
  "resource_id, code, category, material_name, description, unit, spec_reference, is_active, created_at, updated_at, " +
  "subcategory, discipline, material_type, brand, model, manufacturer, standard, grade, color_finish, application_element, " +
  "lifecycle_status, tags, legacy_code, tech_spec_summary, density, compressive_strength, effective_date, dimension, thickness, " +
  "current_unit_price, current_currency, current_price_valid_from, current_price_is_expired, current_supplier_name, " +
  "current_spec_code, current_spec_name, current_spec_revision_no, current_spec_status, " +
  "current_effective_unit_cost, current_price_status, " +
  "category_id, category_name, budget_code_id, budget_code, application_scope, photo_count";

export default function DwlMaterialsListPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<DwlMaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [categories, setCategories] = useState<DwlMaterialCategory[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [disciplineFilter, setDisciplineFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [divisions, setDivisions] = useState<DwlMaterialDivision[]>([]);
  const [divisionFilter, setDivisionFilter] = useState<string>("all");
  const [elementFilter, setElementFilter] = useState<string>("all");

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [density, setDensity] = useState<Density>("visual");
  const dense = density === "dense";

  const [showMaterialForm, setShowMaterialForm] = useState(false);
  const [editRow, setEditRow] = useState<DwlMaterialRow | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Resolve the current user's tenant_id from profiles.company_id — same
  // pattern used by dwl-resources-list-page.tsx. tenant_id is never
  // accepted from user input.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: profile, error } = await getProfileById(uid, "company_id");
      if (!error && profile?.company_id) setTenantId(profile.company_id as string);
    });
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await listDwlVMaterialsOrderedByCode(V_COLUMNS);
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as DwlMaterialRow[]);
    setLoading(false);
  }, [supabase]);

  const loadCategories = useCallback(async () => {
    const { data, error } = await listDwlMaterialCategoriesOrderedBySortOrderAndName("id, group_name, name, division_code, sort_order, is_active, created_at, updated_at");
    if (!error) setCategories((data ?? []) as DwlMaterialCategory[]);
    const { data: divisionRows } = await listDwlMaterialDivisionsOrderedBySortOrderAndCode();
    setDivisions((divisionRows ?? []) as DwlMaterialDivision[]);
  }, [supabase]);

  // "Open in Material Master" on the Material Divisions page links here with ?division=09.
  useEffect(() => {
    const division = new URLSearchParams(window.location.search).get("division");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (division) setDivisionFilter(division);
  }, []);

  // A material takes its division from its category.
  const divisionOfCategory = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) if (c.division_code) map.set(c.id, c.division_code);
    return map;
  }, [categories]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); void loadCategories(); }, [loadData, loadCategories]);

  // Resolve one thumbnail per material that has photos, batched in a single
  // round-trip rather than per-card, kept intentionally simple.
  useEffect(() => {
    const ids = rows.filter((r) => r.photo_count > 0).map((r) => r.resource_id);
    if (ids.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await listDwlMaterialPhotosByResourceIds(ids);
      if (cancelled || !data) return;
      const firstByResource = new Map<string, string>();
      for (const p of data as { resource_id: string; storage_path: string }[]) {
        if (!firstByResource.has(p.resource_id)) firstByResource.set(p.resource_id, p.storage_path);
      }
      const paths = Array.from(firstByResource.values());
      if (paths.length === 0) return;
      const { data: signedList } = await supabase.storage.from("material-photos").createSignedUrls(paths, 3600);
      const pathToUrl = new Map<string, string>();
      for (const s of signedList ?? []) {
        if (s.signedUrl && s.path) pathToUrl.set(s.path, s.signedUrl);
      }
      const next: Record<string, string> = {};
      for (const [rid, path] of firstByResource) {
        const url = pathToUrl.get(path);
        if (url) next[rid] = url;
      }
      if (!cancelled) setPhotoUrls(next);
    })();
    return () => { cancelled = true; };
  }, [rows, supabase]);

  const disciplines = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.discipline) set.add(r.discipline);
    return Array.from(set).sort();
  }, [rows]);

  const elements = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.application_element) set.add(r.application_element);
    return Array.from(set).sort();
  }, [rows]);

  // Hybrid search (typo-tolerant + meaning-based). Ranked hits come first; the
  // plain substring filter below still applies, so nothing it found is lost.
  const librarySearch = useQsLibrarySearch(search, ["resource"]);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter === "active") result = result.filter((r) => r.is_active);
    if (statusFilter === "inactive") result = result.filter((r) => !r.is_active);
    if (disciplineFilter !== "all") result = result.filter((r) => r.discipline === disciplineFilter);
    if (categoryFilter !== "all") result = result.filter((r) => r.category_id === categoryFilter);
    if (divisionFilter !== "all") result = result.filter((r) => r.category_id != null && divisionOfCategory.get(r.category_id) === divisionFilter);
    if (elementFilter !== "all") result = result.filter((r) => r.application_element === elementFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const ranks = librarySearch.ranks;
      result = result.filter(
        (r) =>
          (ranks?.has(r.resource_id) ?? false) ||
          r.code.toLowerCase().includes(q) ||
          r.material_name.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.grade?.toLowerCase().includes(q) ?? false) ||
          (r.brand?.toLowerCase().includes(q) ?? false) ||
          (r.budget_code?.toLowerCase().includes(q) ?? false) ||
          (r.legacy_code?.toLowerCase().includes(q) ?? false) ||
          (r.current_supplier_name?.toLowerCase().includes(q) ?? false) ||
          (r.tags?.some((t) => t.toLowerCase().includes(q)) ?? false)
      );
      if (ranks) {
        const rankOf = (id: string) => ranks.get(id) ?? Number.MAX_SAFE_INTEGER;
        result = [...result].sort((a, b) => rankOf(a.resource_id) - rankOf(b.resource_id));
      }
    }
    return result;
  }, [rows, statusFilter, disciplineFilter, categoryFilter, divisionFilter, divisionOfCategory, elementFilter, search, librarySearch.ranks]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  function openCreate() {
    setEditRow(null);
    setShowMaterialForm(true);
  }

  function openEdit(row: DwlMaterialRow) {
    setEditRow(row);
    setShowMaterialForm(true);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const { data, error } = await deleteDwlResourceByIdReturning(id);
      if (error) {
        if (error.code === "23503") {
          throw new Error("Cannot delete — this material has price history or other linked records. Deactivate it instead (set Status to Inactive) to keep it out of active use.");
        }
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error("Delete was blocked by row-level security. Contact your administrator.");
      }
      toast.success("Material deleted");
      setConfirmDeleteId(null);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete material");
    } finally {
      setDeletingId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selectedIds.has(r.resource_id));
  const someFilteredSelected = filtered.some((r) => selectedIds.has(r.resource_id));

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const r of filtered) next.delete(r.resource_id);
      } else {
        for (const r of filtered) next.add(r.resource_id);
      }
      return next;
    });
  }

  async function handleBulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkDeleting(true);
    let deleted = 0;
    let blocked = 0;
    let failed = 0;
    for (const id of ids) {
      const { data, error } = await deleteDwlResourceByIdReturning(id);
      if (error) {
        if (error.code === "23503") blocked++;
        else failed++;
      } else if (data && data.length > 0) {
        deleted++;
      } else {
        blocked++;
      }
    }
    if (deleted > 0) toast.success(`Deleted ${deleted} material${deleted === 1 ? "" : "s"}.`);
    if (blocked > 0) toast.warning(`${blocked} material${blocked === 1 ? "" : "s"} could not be deleted — linked to price history or blocked by permissions. Deactivate ${blocked === 1 ? "it" : "them"} instead.`);
    if (failed > 0) toast.error(`${failed} material${failed === 1 ? "" : "s"} failed to delete.`);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setBulkDeleting(false);
    await loadData();
  }

  // Export columns follow the Material Register / import template, so an
  // exported file can be edited and re-imported. The trailing columns are
  // read-only context that the import ignores.
  const EXPORT_HEADER = [
    "Code", "Material Name", "Category", "Type", "Specification", "Standard", "Grade", "Size", "Thickness", "Density",
    "Compressive Strength", "Colour / Finish", "Unit", "Effective Date", "Cost Code", "Brand", "Manufacturer",
    "Discipline", "Application", "Specific Element", "Supplier", "Effective Rate", "Currency", "Status", "Updated",
  ];

  function exportRow(r: DwlMaterialRow): (string | number)[] {
    return [
      r.code, cleanLabel(r.material_name), r.category_name ?? "", r.material_type ?? "", cleanLabel(r.tech_spec_summary),
      r.standard ?? "", r.grade ?? "", r.dimension ?? "", r.thickness ?? "", r.density ?? "", r.compressive_strength ?? "",
      r.color_finish ?? "", r.unit, r.effective_date ?? "", r.budget_code ?? "", r.brand ?? "", r.manufacturer ?? "",
      r.discipline ?? "", r.application_scope ?? "", r.application_element ?? "", r.current_supplier_name ?? "",
      r.current_effective_unit_cost ?? "", r.current_currency ?? "", r.is_active ? "Active" : "Inactive", r.updated_at,
    ];
  }

  function handleExcelExport() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([EXPORT_HEADER, ...filtered.map(exportRow)]);
    ws["!cols"] = EXPORT_HEADER.map((k) => ({ wch: Math.max(k.length + 2, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, "Materials");
    XLSX.writeFile(wb, `Material_Master_Catalog_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleCsvExport() {
    const dataRows = filtered.map((r) => exportRow(r).map((v, i) => (EXPORT_HEADER[i] === "Effective Rate" ? fmtCsvNum(r.current_effective_unit_cost) : String(v))));
    downloadCsv(`Material_Master_Catalog_${new Date().toISOString().slice(0, 10)}.csv`, [EXPORT_HEADER, ...dataRows]);
  }

  if (permsLoaded && !canView) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-20 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">You do not have permission to view the Cost &amp; Rate Library.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Package className="h-5 w-5 text-muted-foreground" /> Material Master Catalog
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {rows.length} Items — specification, classification, cost code and current effective rate.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-800"
            onClick={() => setShowCategoryDialog(true)}
          >
            <Tags className="h-3.5 w-3.5" /> Manage Categories
            <Badge variant="secondary" className="ml-1">{categories.length}</Badge>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/qs/dwl-material-divisions"><Network className="h-3.5 w-3.5" /> Divisions</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={filtered.length === 0}>
            <FileDown className="h-3.5 w-3.5" /> CSV Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDuplicates(true)}>
            Duplicates
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-3.5 w-3.5" /> Import (Excel/CSV)
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!tenantId || !canCreate} title={!canCreate ? "You lack create permission on QS libraries" : undefined}>
            <Plus className="h-3.5 w-3.5" /> New Material
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, spec, use, code, brand... (typos OK)"
            className="pl-8"
          />
          {librarySearch.searching && (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        {canEdit && <QsSearchIndexRefreshButton />}
        <select value={divisionFilter} onChange={(e) => setDivisionFilter(e.target.value)} className="h-8 max-w-56 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Divisions</option>
          {divisions.filter((d) => d.is_active && categories.some((c) => c.division_code === d.code)).map((d) => (
            <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
          ))}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Categories ({rows.length})</option>
          {categories.filter((c) => c.is_active).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select value={elementFilter} onChange={(e) => setElementFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Elements ({elements.length})</option>
          {elements.map((el) => <option key={el} value={el}>{el}</option>)}
        </select>
        <select value={disciplineFilter} onChange={(e) => setDisciplineFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Disciplines</option>
          {disciplines.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All Status</option>
        </select>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-input">
            <button type="button" onClick={() => setDensity("visual")} className={cn("px-2.5 py-1 text-xs font-medium", !dense ? "bg-accent" : "text-muted-foreground")}>Visual</button>
            <button type="button" onClick={() => setDensity("dense")} className={cn("px-2.5 py-1 text-xs font-medium", dense ? "bg-accent" : "text-muted-foreground")}>Dense</button>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-input">
            <button type="button" onClick={() => setViewMode("cards")} className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-medium", viewMode === "cards" ? "bg-accent" : "text-muted-foreground")}>
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button type="button" onClick={() => setViewMode("table")} className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-medium", viewMode === "table" ? "bg-accent" : "text-muted-foreground")}>
              <Table2 className="h-3.5 w-3.5" /> Table
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className={cn("grid gap-4", viewMode === "cards" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1")}>
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className={viewMode === "cards" ? "h-64 w-full" : "h-9 w-full"} />
          ))}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load materials: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No materials recorded yet. Create one with \"New Material\", or import the Cost & Rate Library template."
              : "No materials match your search or filters."}
          </p>
          {rows.length === 0 && (
            <Button size="sm" onClick={openCreate} disabled={!tenantId || !canCreate}>
              <Plus className="h-3.5 w-3.5" /> New Material
            </Button>
          )}
        </div>
      ) : viewMode === "cards" ? (
        <div className={cn("grid gap-4", dense && "gap-3", "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}>
          {filtered.map((r) => (
            <MaterialCard
              key={r.resource_id}
              row={r}
              dense={dense}
              photoUrl={photoUrls[r.resource_id]}
              onEdit={() => openEdit(r)}
              onDelete={() => setConfirmDeleteId(r.resource_id)}
              canEdit={canEdit}
              canDelete={canDelete}
              deleting={deletingId === r.resource_id}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {viewMode === "table" && canDelete && selectedIds.size > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-border bg-accent/50 px-3 py-1.5">
              <span className="text-xs font-medium">{selectedIds.size} selected</span>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear</Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmBulkDelete(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete Selected
                </Button>
              </div>
            </div>
          )}
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                {canDelete && (
                  <TableHead className="w-8">
                    <Checkbox
                      checked={allFilteredSelected}
                      indeterminate={!allFilteredSelected && someFilteredSelected}
                      onCheckedChange={toggleSelectAllFiltered}
                      aria-label="Select all"
                    />
                  </TableHead>
                )}
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Material</TableHead>
                <TableHead className="w-28">Category</TableHead>
                <TableHead className="w-32">Specification</TableHead>
                <TableHead className="w-14">Unit</TableHead>
                <TableHead className="w-28 text-right">Effective</TableHead>
                <TableHead className="w-24">Cost Code</TableHead>
                <TableHead className="w-36">Supplier</TableHead>
                <TableHead className="w-24">Updated</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-16 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.resource_id} className={cn(!r.is_active && "opacity-50", dense && "[&>td]:py-1")}>
                  {canDelete && (
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(r.resource_id)}
                        onCheckedChange={() => toggleSelected(r.resource_id)}
                        aria-label={`Select ${r.code}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-xs font-medium">
                    {r.code}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="line-clamp-2" title={cleanLabel(r.description)}>{cleanLabel(r.material_name)}</span>
                    {r.subcategory && <span className="text-xs text-muted-foreground">{r.subcategory}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.category_name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.current_spec_code ? (
                      <span title={r.current_spec_name ?? undefined}>
                        {r.current_spec_code}
                        {r.current_spec_revision_no && ` ${r.current_spec_revision_no}`}
                      </span>
                    ) : r.tech_spec_summary ? (
                      <span className="line-clamp-2" title={cleanLabel(r.tech_spec_summary)}>{cleanLabel(r.tech_spec_summary)}</span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.unit}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">
                    {formatMoney(r.current_effective_unit_cost, r.current_currency) ?? <span className="font-sans font-normal text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.budget_code ?? "—"}</TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">{r.current_supplier_name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDate(r.updated_at)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {!r.is_active && <Badge variant="secondary">Inactive</Badge>}
                      {r.current_price_is_expired && <Badge variant="destructive">Quote expired</Badge>}
                      {r.is_active && r.current_unit_price == null && <Badge variant="outline">No price</Badge>}
                      {r.current_price_status && r.current_price_status !== "approved" && (
                        <Badge variant="outline">{r.current_price_status}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Actions for ${r.code}`} />}
                        disabled={deletingId === r.resource_id}
                      >
                        {deletingId === r.resource_id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <MoreHorizontal className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/qs/dwl-materials/${r.resource_id}`)}>
                          <Eye /> View detail
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/qs/dwl-resources?q=${encodeURIComponent(r.code)}`)}>
                          <History /> Price history
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => openEdit(r)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => setConfirmDeleteId(r.resource_id)}>
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
        </div>
      )}

      <DwlMaterialFormDialog
        open={showMaterialForm}
        onOpenChange={setShowMaterialForm}
        tenantId={tenantId}
        userId={userId}
        editRow={editRow}
        onSaved={() => void loadData()}
      />
      <DwlMaterialCategoryDialog
        open={showCategoryDialog}
        onOpenChange={setShowCategoryDialog}
        onChanged={() => { void loadCategories(); void loadData(); }}
      />
      <DwlMaterialDuplicatesDialog open={showDuplicates} onOpenChange={setShowDuplicates} />
      <DwlMaterialImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        tenantId={tenantId}
        userId={userId}
        onImported={() => void loadData()}
      />

      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete {selectedIds.size} Material{selectedIds.size === 1 ? "" : "s"}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete {selectedIds.size} selected material{selectedIds.size === 1 ? "" : "s"}? This action cannot be undone.
              Materials with price history cannot be deleted — deactivate them instead.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmBulkDelete(false)} disabled={bulkDeleting}>
                Cancel
              </Button>
              <Button variant="destructive" size="sm" disabled={bulkDeleting} onClick={() => void handleBulkDelete()}>
                {bulkDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <h3 className="text-lg font-semibold">Delete Material</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this material? This action cannot be undone. Materials with
              price history cannot be deleted — deactivate them instead.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deletingId === confirmDeleteId}
                onClick={() => void handleDelete(confirmDeleteId)}
              >
                {deletingId === confirmDeleteId && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MaterialCard({
  row, dense, photoUrl, onEdit, onDelete, canEdit, canDelete, deleting,
}: {
  row: DwlMaterialRow;
  dense: boolean;
  photoUrl: string | undefined;
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  deleting: boolean;
}) {
  const rate = row.current_effective_unit_cost ?? row.current_unit_price;
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="relative aspect-[4/3] w-full bg-muted">
        {photoUrl ? (
          <>
            <img src={photoUrl} alt={cleanLabel(row.material_name)} className="h-full w-full object-cover" />
            <Badge variant="secondary" className="absolute bottom-2 left-2 gap-1">
              <Camera className="h-3 w-3" /> {row.photo_count} Photo{row.photo_count === 1 ? "" : "s"}
            </Badge>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            <ImageOff className="h-6 w-6 text-muted-foreground/50" />
            <p className="text-xs font-medium text-muted-foreground">No Photo Captured</p>
            <p className="text-[11px] text-muted-foreground/80">Attach site inspection sample</p>
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Camera className="h-3.5 w-3.5" /> Capture Photo
            </Button>
          </div>
        )}
      </div>

      <div className={cn("flex flex-1 flex-col gap-1.5", dense ? "p-3" : "p-4")}>
        <div className="flex items-center justify-between gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium">{row.code}</span>
          <Badge
            variant="outline"
            className={row.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-muted text-muted-foreground"}
          >
            {row.is_active ? "ACTIVE" : "INACTIVE"}
          </Badge>
        </div>

        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{cleanLabel(row.material_name)}</h3>
        <p className="line-clamp-1 text-xs text-muted-foreground">
          {cleanLabel(row.tech_spec_summary || row.grade || row.standard || row.description)}
        </p>

        <div className="flex flex-wrap gap-1 pt-0.5">
          {row.category_name && <Badge variant="secondary" className="text-[10px]">{row.category_name}</Badge>}
          {row.application_element && <Badge variant="secondary" className="text-[10px]">{row.application_element}</Badge>}
          <Badge variant="secondary" className="text-[10px]">{prettyUnit(row.unit)}</Badge>
        </div>

        <div className="mt-1 border-t border-border pt-2">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Effective Rate</p>
              <p className="text-sm font-semibold">
                {rate != null ? `${formatMoney(rate, row.current_currency)} /${prettyUnit(row.unit)}` : "—"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Cost Code</p>
              <p className="font-mono text-sm">{row.budget_code ?? "—"}</p>
            </div>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            {canEdit && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Edit material" onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Delete material" disabled={deleting} onClick={onDelete}>
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" title="View price history">
              <Link href={`/dashboard/qs/dwl-resources?q=${encodeURIComponent(row.code)}`}>
                <History className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/qs/dwl-materials/${row.resource_id}`}>
                <Eye className="h-3.5 w-3.5" /> Details
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
