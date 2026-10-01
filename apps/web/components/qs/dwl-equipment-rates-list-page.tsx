"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  AlertTriangle, FileSpreadsheet, Fuel, History, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, Truck, Upload, UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlEquipmentRateFormDialog } from "@/components/qs/dwl-equipment-rate-form-dialog";
import { DwlEquipmentRateImportDialog } from "@/components/qs/dwl-equipment-rate-import-dialog";
import {
  DWL_EQUIPMENT_RATE_BASES, DWL_EQUIPMENT_RATE_BASIS_LABEL, dwlDisplayResourceDescription, type DwlEquipmentRateRow,
} from "@/components/qs/dwl-types";
import { deleteDwlResourceByIdReturning, getProfileById, listDwlVEquipmentRatesWithIsActive } from "@/lib/qs/qs-queries";

const V_COLUMNS =
  "resource_id, code, description, unit, spec_reference, is_active, created_at, updated_at, ownership, rate_basis, " +
  "operator_included, fuel_included, fuel_l_per_day, min_hire_qty, mobilisation_cost, capacity_model, notes, " +
  "rate, currency, valid_from, quote_valid_until, is_expired, source_type, supplier_name, price_status";

function formatMoney(value: number | null, currency: string | null) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency ?? "USD"} ${value.toFixed(2)}`;
  }
}

function basisLabel(r: DwlEquipmentRateRow) {
  if (!r.rate_basis) return r.unit;
  return r.rate_basis === "unit_output" ? `per ${r.unit}` : DWL_EQUIPMENT_RATE_BASIS_LABEL[r.rate_basis].replace("Per ", "per ");
}

export default function DwlEquipmentRatesListPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [rows, setRows] = useState<DwlEquipmentRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [basisFilter, setBasisFilter] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editRow, setEditRow] = useState<DwlEquipmentRateRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
    const { data, error } = await listDwlVEquipmentRatesWithIsActive(V_COLUMNS);
    if (error) { setErrorMsg(error.message); setLoading(false); return; }
    setRows((data ?? []) as unknown as DwlEquipmentRateRow[]);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    let list = rows;
    if (basisFilter !== "all") list = list.filter((r) => r.rate_basis === basisFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) =>
        r.code.toLowerCase().includes(q)
        || dwlDisplayResourceDescription(r.description).toLowerCase().includes(q)
        || (r.capacity_model ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [rows, search, basisFilter]);

  const hiredCount = rows.filter((r) => r.ownership === "hired").length;
  const ownedCount = rows.filter((r) => r.ownership === "owned").length;
  const noRateCount = rows.filter((r) => r.rate == null).length;

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit");
  const canDelete = can("qs_libraries", "delete");

  async function handleDelete(r: DwlEquipmentRateRow) {
    if (!window.confirm(`Delete ${r.code} — ${dwlDisplayResourceDescription(r.description)}? Its price history is deleted too.`)) return;
    setDeletingId(r.resource_id);
    const { data, error } = await deleteDwlResourceByIdReturning(r.resource_id);
    setDeletingId(null);
    if (error) {
      toast.error(/foreign key|violates/i.test(error.message)
        ? `${r.code} is used by a cost item or work item — remove it there first, or mark it inactive.`
        : error.message);
      return;
    }
    if (!data || data.length === 0) { toast.error("Not deleted — you may not have permission."); return; }
    toast.success(`${r.code} deleted`);
    void loadData();
  }

  function handleExcelExport() {
    const data = filtered.map((r) => ({
      Code: r.code,
      Description: dwlDisplayResourceDescription(r.description),
      Ownership: r.ownership ?? "",
      "Rate Basis": r.rate_basis ?? "",
      "Unit of Output": r.rate_basis === "unit_output" ? r.unit : "",
      Rate: r.rate ?? "",
      Currency: r.currency ?? "",
      "Operator Included": r.operator_included ? "Yes" : "No",
      "Fuel Included": r.fuel_included ? "Yes" : "No",
      "Fuel L/day": r.fuel_l_per_day ?? "",
      "Minimum Hire": r.min_hire_qty ?? "",
      Mobilisation: r.mobilisation_cost ?? "",
      "Capacity / Model": r.capacity_model ?? "",
      Notes: r.notes ?? "",
      Supplier: r.supplier_name ?? "",
      "Price Date": r.valid_from ?? "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length + 2, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Equipment Rates");
    XLSX.writeFile(wb, `Equipment_Rates_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <Truck className="h-5 w-5 text-muted-foreground" /> Equipment &amp; Plant Rates
          </h1>
          <p className="text-sm text-muted-foreground">
            Hire and ownership rates for plant and tools — per hour, day, week, month or unit of output — with operator,
            fuel, minimum hire and mobilisation terms.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          {canCreate && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={!tenantId}>
              <Upload className="h-3.5 w-3.5" /> Import (Excel/CSV)
            </Button>
          )}
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { setEditRow(null); setShowForm(true); }}
            disabled={!tenantId || !canCreate}
            title={!canCreate ? "You do not have permission to add equipment" : undefined}
          >
            <Plus className="h-3.5 w-3.5" /> Add Equipment
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Plant items", rows.length, "Active equipment resources"],
          ["Hired", hiredCount, "Rental rates"],
          ["Company-owned", ownedCount, "Internal plant rates"],
          ["No current rate", noRateCount, "Need a price"],
        ].map(([label, n, hint]) => (
          <div key={label as string} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{n}</p>
            <p className="text-xs text-muted-foreground">{hint}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search code, equipment, capacity…" className="pl-8" />
        </div>
        <select value={basisFilter} onChange={(e) => setBasisFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All rate bases</option>
          {DWL_EQUIPMENT_RATE_BASES.map((b) => <option key={b} value={b}>{DWL_EQUIPMENT_RATE_BASIS_LABEL[b]}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load equipment rates: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Truck className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">{rows.length === 0 ? "No equipment registered yet." : "No equipment matches your filters."}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Code</TableHead>
                <TableHead>Equipment</TableHead>
                <TableHead className="w-24">Ownership</TableHead>
                <TableHead className="w-32">Rate Basis</TableHead>
                <TableHead className="w-28 text-right">Rate</TableHead>
                <TableHead className="w-40">Includes</TableHead>
                <TableHead className="w-28">Min. Hire / Mob.</TableHead>
                <TableHead className="w-24">Price Date</TableHead>
                <TableHead className="w-16 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.resource_id}>
                  <TableCell className="font-mono text-xs font-medium">{r.code}</TableCell>
                  <TableCell className="text-sm">
                    <span className="font-medium">{dwlDisplayResourceDescription(r.description)}</span>
                    {r.capacity_model && <span className="block text-xs text-muted-foreground">{r.capacity_model}</span>}
                  </TableCell>
                  <TableCell className="text-xs capitalize text-muted-foreground">{r.ownership ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{basisLabel(r)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">
                    {r.rate != null ? formatMoney(r.rate, r.currency) : <Badge variant="outline">No rate</Badge>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.operator_included && <Badge variant="outline" className="gap-1 text-[10px]"><UserRound className="h-3 w-3" />Operator</Badge>}
                      {r.fuel_included
                        ? <Badge variant="outline" className="gap-1 text-[10px]"><Fuel className="h-3 w-3" />Fuel</Badge>
                        : r.fuel_l_per_day != null && <span className="text-[10px] text-muted-foreground">+ fuel {r.fuel_l_per_day} L/day</span>}
                      {!r.operator_included && !r.fuel_included && r.fuel_l_per_day == null && <span className="text-xs text-muted-foreground">Dry hire</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.min_hire_qty != null ? `${r.min_hire_qty} ${r.unit}` : "—"}
                    {r.mobilisation_cost != null && <span className="block">Mob. {formatMoney(r.mobilisation_cost, r.currency)}</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.valid_from ?? "—"}
                    {r.is_expired && <Badge variant="destructive" className="mt-0.5 block w-fit text-[10px]">Quote expired</Badge>}
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Actions for ${r.code}`} />}
                        disabled={deletingId === r.resource_id}
                      >
                        {deletingId === r.resource_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/qs/dwl-resources?q=${encodeURIComponent(r.code)}`)}>
                          <History /> Price history
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => { setEditRow(r); setShowForm(true); }}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                        )}
                        {canDelete && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive" onClick={() => void handleDelete(r)}>
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

      <DwlEquipmentRateFormDialog
        open={showForm}
        onOpenChange={(o) => { setShowForm(o); if (!o) setEditRow(null); }}
        tenantId={tenantId}
        userId={userId}
        editRow={editRow}
        onSaved={() => void loadData()}
      />
      <DwlEquipmentRateImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        tenantId={tenantId}
        userId={userId}
        existing={rows}
        onImported={() => void loadData()}
      />
    </div>
  );
}
