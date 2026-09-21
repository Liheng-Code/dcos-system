"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, Building2, FileDown, FileSpreadsheet,
  Loader2, Pencil, Plus, Search, Trash2, Upload, X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv-export";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlSupplierFormDialog } from "@/components/qs/dwl-supplier-form-dialog";
import { DwlSupplierImportDialog } from "@/components/qs/dwl-supplier-import-dialog";
import type { DwlSupplierRow } from "@/components/qs/dwl-types";

type StatusFilter = "active" | "inactive" | "all";

const V_COLUMNS =
  "supplier_id, tenant_id, name, contact, rating, is_active, created_at, vendor_kind, " +
  "supplier_code, trading_name, supplier_type, contact_person, position, phone, email, address, " +
  "country, province_city, website, product_categories, payment_terms, delivery_terms, credit_terms, " +
  "lead_time_days, moq, overall_rating, reliability_rating, quality_rating, price_competitiveness, " +
  "lifecycle_status, notes, updated_at, materials_linked";

const RATING_BADGE: Record<string, string> = {
  A: "border-emerald-200 bg-emerald-50 text-emerald-700",
  B: "border-sky-200 bg-sky-50 text-sky-700",
  C: "border-amber-200 bg-amber-50 text-amber-700",
};

export default function DwlSuppliersListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<DwlSupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");

  const [showForm, setShowForm] = useState(false);
  const [editRow, setEditRow] = useState<DwlSupplierRow | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: profile, error } = await supabase.from("profiles").select("company_id").eq("id", uid).single();
      if (!error && profile?.company_id) setTenantId(profile.company_id as string);
    });
  }, [supabase]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase
      .from("dwl_v_suppliers")
      .select(V_COLUMNS)
      .eq("vendor_kind", "material_supplier")
      .order("name");
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as DwlSupplierRow[]);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.supplier_type) set.add(r.supplier_type);
    return Array.from(set).sort();
  }, [rows]);

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.country) set.add(r.country);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter === "active") result = result.filter((r) => r.is_active);
    if (statusFilter === "inactive") result = result.filter((r) => !r.is_active);
    if (typeFilter !== "all") result = result.filter((r) => r.supplier_type === typeFilter);
    if (countryFilter !== "all") result = result.filter((r) => r.country === countryFilter);
    if (ratingFilter !== "all") result = result.filter((r) => r.rating === ratingFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.supplier_code?.toLowerCase().includes(q) ?? false) ||
          (r.trading_name?.toLowerCase().includes(q) ?? false) ||
          (r.contact_person?.toLowerCase().includes(q) ?? false) ||
          (r.phone?.toLowerCase().includes(q) ?? false) ||
          (r.country?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [rows, statusFilter, typeFilter, countryFilter, ratingFilter, search]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  function openCreate() {
    setEditRow(null);
    setShowForm(true);
  }

  function openEdit(row: DwlSupplierRow) {
    setEditRow(row);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const { data, error } = await supabase.from("dwl_suppliers").delete().eq("id", id).select("id");
      if (error) {
        if (error.code === "23503") {
          throw new Error("Cannot delete — this supplier has price history or linked materials. Deactivate it instead (set Status to Inactive) to keep it out of active use.");
        }
        throw new Error(error.message);
      }
      if (!data || data.length === 0) {
        throw new Error("Delete was blocked by row-level security. Contact your administrator.");
      }
      toast.success("Supplier deleted");
      setConfirmDeleteId(null);
      await loadData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete supplier");
    } finally {
      setDeletingId(null);
    }
  }

  function handleExcelExport() {
    const data = filtered.map((r) => ({
      Code: r.supplier_code ?? "",
      "Company Name": r.name,
      "Trading Name": r.trading_name ?? "",
      Type: r.supplier_type ?? "",
      Contact: r.contact_person ?? "",
      Phone: r.phone ?? "",
      Country: r.country ?? "",
      "Payment Terms": r.payment_terms ?? "",
      "Delivery Terms": r.delivery_terms ?? "",
      "Lead Time (Days)": r.lead_time_days ?? "",
      "Star Rating": r.overall_rating ?? "",
      Competitiveness: r.price_competitiveness ?? "",
      "Materials Linked": r.materials_linked,
      Status: r.is_active ? "Active" : "Inactive",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    XLSX.writeFile(wb, `Supplier_Master_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleCsvExport() {
    const header = [
      "Code", "Company Name", "Trading Name", "Type", "Contact", "Phone", "Country",
      "Payment Terms", "Delivery Terms", "Lead Time (Days)", "Star Rating", "Competitiveness",
      "Materials Linked", "Status",
    ];
    const dataRows = filtered.map((r) => [
      r.supplier_code ?? "", r.name, r.trading_name ?? "", r.supplier_type ?? "", r.contact_person ?? "",
      r.phone ?? "", r.country ?? "", r.payment_terms ?? "", r.delivery_terms ?? "",
      String(r.lead_time_days ?? ""), String(r.overall_rating ?? ""), r.price_competitiveness ?? "",
      String(r.materials_linked), r.is_active ? "Active" : "Inactive",
    ]);
    downloadCsv(`Supplier_Master_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...dataRows]);
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
            <Building2 className="h-5 w-5 text-muted-foreground" /> Supplier Master
          </h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} of {rows.length} Vendors — classification, terms and performance rating.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={filtered.length === 0}>
            <FileDown className="h-3.5 w-3.5" /> CSV Export
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
            <Upload className="h-3.5 w-3.5" /> Import (Excel/CSV)
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!tenantId || !canCreate} title={!canCreate ? "You lack create permission on QS libraries" : undefined}>
            <Plus className="h-3.5 w-3.5" /> New Supplier
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter code, name, contact, phone, country..."
            className="pl-8"
          />
        </div>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Countries</option>
          {countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Ratings</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All Status</option>
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load suppliers: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Building2 className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No suppliers registered yet. Create one with \"New Supplier\", or import the Supplier Master template."
              : "No suppliers match your search or filters."}
          </p>
          {rows.length === 0 && (
            <Button size="sm" onClick={openCreate} disabled={!tenantId || !canCreate}>
              <Plus className="h-3.5 w-3.5" /> New Supplier
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="w-28">Type</TableHead>
                <TableHead className="w-32">Contact</TableHead>
                <TableHead className="w-28">Phone</TableHead>
                <TableHead className="w-32">Terms</TableHead>
                <TableHead className="w-20 text-right">Lead Time</TableHead>
                <TableHead className="w-16 text-right">Rating</TableHead>
                <TableHead className="w-24">Competitiveness</TableHead>
                <TableHead className="w-16 text-right">Materials</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead className="w-28 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.supplier_id} className={cn(!r.is_active && "opacity-50")}>
                  <TableCell className="font-mono text-xs font-medium">{r.supplier_code ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    <div>{r.name}</div>
                    {r.trading_name && <span className="text-xs text-muted-foreground">{r.trading_name}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.supplier_type ?? "—"}</TableCell>
                  <TableCell className="truncate text-xs text-muted-foreground">{r.contact_person ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.phone ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.payment_terms ?? "—"}
                    {r.delivery_terms && <div className="text-[11px] text-muted-foreground/70">{r.delivery_terms}</div>}
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {r.lead_time_days != null ? `${r.lead_time_days}d` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline" className={cn("font-mono", RATING_BADGE[r.rating])}>
                      {r.overall_rating != null ? r.overall_rating.toFixed(1) : r.rating}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.price_competitiveness ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{r.materials_linked}</TableCell>
                  <TableCell>
                    {r.is_active ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center gap-1">
                      {canEdit && (
                        <Button variant="outline" size="sm" title="Edit supplier" onClick={() => openEdit(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          variant="outline"
                          size="sm"
                          title="Delete supplier"
                          disabled={deletingId === r.supplier_id}
                          onClick={() => setConfirmDeleteId(r.supplier_id)}
                        >
                          {deletingId === r.supplier_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
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

      <DwlSupplierFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        tenantId={tenantId}
        userId={userId}
        editRow={editRow}
        onSaved={() => void loadData()}
      />
      <DwlSupplierImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        tenantId={tenantId}
        userId={userId}
        onImported={() => void loadData()}
      />

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Delete Supplier</h3>
              <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete this supplier? This action cannot be undone. Suppliers with
              price history or linked materials cannot be deleted — deactivate them instead.
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
