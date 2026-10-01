"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, FileSpreadsheet, HardHat, History, MoreHorizontal, Plus, Search, Upload,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlSubconRateFormDialog } from "@/components/qs/dwl-subcon-rate-form-dialog";
import { DwlSupplierFormDialog } from "@/components/qs/dwl-supplier-form-dialog";
import { DwlSubconRateImportDialog } from "@/components/qs/dwl-subcon-rate-import-dialog";
import type { DwlSubconRateRow } from "@/components/qs/dwl-types";
import { getProfileById, listDwlVSubconRatesOrderedBySubcontractorNameAndItemDescriptionAndRateYear } from "@/lib/qs/qs-queries";

const V_COLUMNS =
  "price_id, tenant_id, resource_id, resource_code, item_description, unit, trade, " +
  "subcontractor_id, subcontractor_name, subcontractor_code, rate, currency, rate_type, " +
  "effective_date, rate_year, scope_notes, source_type, created_at";

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function DwlSubcontractorRatesListPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [tenantId, setTenantId] = useState<string>("");
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<DwlSubconRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [tradeFilter, setTradeFilter] = useState<string>("all");
  const [yearFilter, setYearFilter] = useState<string>("all");

  const [showRateForm, setShowRateForm] = useState(false);
  const [showSubcontractorForm, setShowSubcontractorForm] = useState(false);
  const [showImport, setShowImport] = useState(false);

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
    const { data, error } = await listDwlVSubconRatesOrderedBySubcontractorNameAndItemDescriptionAndRateYear(V_COLUMNS);
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as DwlSubconRateRow[]);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const trades = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.trade) set.add(r.trade);
    return Array.from(set).sort();
  }, [rows]);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) set.add(r.rate_year);
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (tradeFilter !== "all") result = result.filter((r) => r.trade === tradeFilter);
    if (yearFilter !== "all") result = result.filter((r) => String(r.rate_year) === yearFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          (r.subcontractor_name?.toLowerCase().includes(q) ?? false) ||
          (r.subcontractor_code?.toLowerCase().includes(q) ?? false) ||
          (r.trade?.toLowerCase().includes(q) ?? false) ||
          r.item_description.toLowerCase().includes(q) ||
          (r.scope_notes?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [rows, tradeFilter, yearFilter, search]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");

  function handleExcelExport() {
    const data = filtered.map((r) => ({
      Year: r.rate_year,
      Subcontractor: r.subcontractor_name ?? "",
      "Subcontractor Code": r.subcontractor_code ?? "",
      Trade: r.trade ?? "",
      "Item Description": r.item_description,
      "Rate Type": r.rate_type ?? "",
      Unit: r.unit,
      "Commercial Rate": r.rate,
      Currency: r.currency,
      "Scope Notes": r.scope_notes ?? "",
      "Effective Date": r.effective_date,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Subcontractor Rates");
    XLSX.writeFile(wb, `Subcontractor_Trade_Rates_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <HardHat className="h-5 w-5 text-muted-foreground" /> Subcontractor Trade Rates Library
            <Badge variant="secondary">{rows.length} Commercial Rate{rows.length === 1 ? "" : "s"}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Historical specialist subcontractor rates tracked across tender packages.
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
            onClick={() => setShowRateForm(true)}
            disabled={!tenantId || !canCreate}
            title={!canCreate ? "You lack create permission on QS libraries" : undefined}
          >
            <Plus className="h-3.5 w-3.5" /> Add Trade Rate
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="bg-foreground text-background hover:bg-foreground/90"
            onClick={() => setShowSubcontractorForm(true)}
            disabled={!tenantId || !canCreate}
          >
            <Plus className="h-3.5 w-3.5" /> New Subcontractor
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subcontractor, trade or work package description..."
            className="pl-8"
          />
        </div>
        <select value={tradeFilter} onChange={(e) => setTradeFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Trades</option>
          {trades.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
          <option value="all">All Years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load subcontractor rates: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <HardHat className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0
              ? "No commercial rates recorded yet. Register a subcontractor, then \"Add Trade Rate\"."
              : "No rates match your search or filters."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">Year</TableHead>
                <TableHead className="w-44">Subcontractor</TableHead>
                <TableHead className="w-40">Trade</TableHead>
                <TableHead>Scope Description</TableHead>
                <TableHead className="w-24">Rate Type</TableHead>
                <TableHead className="w-16">Unit</TableHead>
                <TableHead className="w-28 text-right">Commercial Rate</TableHead>
                <TableHead className="w-28">Effective Date</TableHead>
                <TableHead className="w-16 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.price_id}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">{r.rate_year}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium">{r.subcontractor_name ?? "—"}</div>
                    {r.subcontractor_code && <span className="font-mono text-xs text-muted-foreground">{r.subcontractor_code}</span>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.trade ?? "—"}</TableCell>
                  <TableCell className="text-sm">
                    <div className="line-clamp-2">{r.item_description}</div>
                    {r.scope_notes && <span className="line-clamp-1 text-xs text-muted-foreground">{r.scope_notes}</span>}
                  </TableCell>
                  <TableCell>
                    {r.rate_type ? <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">{r.rate_type}</Badge> : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.unit}</TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">{formatMoney(r.rate, r.currency)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatDate(r.effective_date)}</TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Actions for ${r.resource_code}`} />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/qs/dwl-resources?q=${encodeURIComponent(r.resource_code)}`)}>
                          <History /> Price history
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DwlSubconRateFormDialog
        open={showRateForm}
        onOpenChange={setShowRateForm}
        tenantId={tenantId}
        userId={userId}
        onSaved={() => void loadData()}
      />
      <DwlSupplierFormDialog
        open={showSubcontractorForm}
        onOpenChange={setShowSubcontractorForm}
        tenantId={tenantId}
        userId={userId}
        vendorKind="subcontractor"
        onSaved={() => void loadData()}
      />
      <DwlSubconRateImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        tenantId={tenantId}
        userId={userId}
        onImported={() => void loadData()}
      />
    </div>
  );
}
