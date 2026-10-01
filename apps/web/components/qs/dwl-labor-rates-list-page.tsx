"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle, Calculator, FileSpreadsheet, History, MoreHorizontal, Pencil, Plus, Search, Upload, Users, Wallet, Wrench,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlLaborRateFormDialog } from "@/components/qs/dwl-labor-rate-form-dialog";
import { DwlLaborRateImportDialog } from "@/components/qs/dwl-labor-rate-import-dialog";
import { DWL_LABOR_BUILD_UP_DEFAULTS, dwlDisplayResourceDescription, type DwlLaborRateRow } from "@/components/qs/dwl-types";
import { getProfileById, listDwlVLaborRatesWithIsActive, upsertDwlLaborRateAttributes } from "@/lib/qs/qs-queries";

const V_COLUMNS =
  "resource_id, code, description, unit, spec_reference, is_active, created_at, updated_at, " +
  "skill_level, standard_productivity_note, daily_basic_rate, overtime_rate_per_hr, currency, valid_from, price_status, " +
  "all_in_enabled, ot_allowance_pct, nssf_employer_pct, other_statutory_pct, meal_per_day, transport_per_day, " +
  "accommodation_per_day, ppe_tools_per_day, all_in_daily_rate, costing_rate";

const SKILL_BADGE_CLASS: Record<string, string> = {
  "General Helper": "bg-slate-50 text-slate-700 border-slate-200",
  Skilled: "bg-blue-50 text-blue-700 border-blue-200",
  Master: "bg-violet-50 text-violet-700 border-violet-200",
  Foreman: "bg-amber-50 text-amber-700 border-amber-200",
};

function formatMoney(value: number | null, currency: string | null) {
  if (value == null) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", minimumFractionDigits: 2 }).format(value);
  } catch {
    return `${currency ?? "USD"} ${value.toFixed(2)}`;
  }
}

function shiftUnitLabel(unit: string) {
  if (unit === "day") return "Day (8 hrs)";
  if (unit === "month") return "Month (8 hrs)";
  if (unit === "hr") return "Hour";
  return unit;
}

export default function DwlLaborRatesListPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { can, loaded: permsLoaded } = useQsPermissions();
  const [applyingDefaults, setApplyingDefaults] = useState(false);

  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [rows, setRows] = useState<DwlLaborRateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editRow, setEditRow] = useState<DwlLaborRateRow | null>(null);

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
    const { data, error } = await listDwlVLaborRatesWithIsActive(V_COLUMNS);
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    setRows((data ?? []) as unknown as DwlLaborRateRow[]);
    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) => r.code.toLowerCase().includes(q) || dwlDisplayResourceDescription(r.description).toLowerCase().includes(q)
    );
  }, [rows, search]);

  const skilledCount = useMemo(() => rows.filter((r) => r.skill_level && r.skill_level !== "General Helper").length, [rows]);
  const avgDailyWage = useMemo(() => {
    const dayRates = rows.filter((r) => r.unit === "day" && r.daily_basic_rate != null).map((r) => r.daily_basic_rate as number);
    if (dayRates.length === 0) return null;
    return dayRates.reduce((s, v) => s + v, 0) / dayRates.length;
  }, [rows]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const canEdit = can("qs_libraries", "edit") || canCreate;
  const allInCount = useMemo(() => rows.filter((r) => r.all_in_enabled).length, [rows]);
  const pendingDefaults = useMemo(() => rows.filter((r) => r.unit === "day" && !r.all_in_enabled && r.daily_basic_rate != null), [rows]);

  // Bulk: switch every day-rate trade without a build-up to the Cambodia defaults.
  async function applyDefaultsToAll() {
    if (!tenantId || pendingDefaults.length === 0) return;
    const d = DWL_LABOR_BUILD_UP_DEFAULTS;
    const ok = window.confirm(
      `Apply the Cambodia all-in build-up (OT ${d.ot_allowance_pct * 100}%, NSSF ${d.nssf_employer_pct * 100}%, seniority ${d.other_statutory_pct * 100}%, ` +
      `meals $${d.meal_per_day}, transport $${d.transport_per_day}, PPE $${d.ppe_tools_per_day}/day) to ${pendingDefaults.length} day-rate trade(s)?\n\n` +
      "Cost items that use these trades will be re-priced with the all-in rate. Trades that already have a build-up are not changed."
    );
    if (!ok) return;
    setApplyingDefaults(true);
    const { error } = await upsertDwlLaborRateAttributes(pendingDefaults.map((r) => ({
        resource_id: r.resource_id,
        tenant_id: tenantId,
        skill_level: r.skill_level,
        standard_productivity_note: r.standard_productivity_note,
        all_in_enabled: true,
        ...d,
        updated_by: userId,
      })));
    setApplyingDefaults(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`All-in build-up applied to ${pendingDefaults.length} trade(s)`);
    void loadData();
  }

  function handleExcelExport() {
    const data = filtered.map((r) => ({
      "Labor Code": r.code,
      "Trade Description": dwlDisplayResourceDescription(r.description),
      "Skill Level": r.skill_level ?? "",
      "Shift Unit": shiftUnitLabel(r.unit),
      "Daily Basic Rate": r.daily_basic_rate ?? "",
      "Overtime Rate / hr": r.overtime_rate_per_hr ?? "",
      Currency: r.currency ?? "",
      "Standard Productivity": r.standard_productivity_note ?? "",
      Status: r.price_status ?? "",
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Labor Rates");
    XLSX.writeFile(wb, `Direct_Labor_Rates_${new Date().toISOString().slice(0, 10)}.xlsx`);
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
            <Wrench className="h-5 w-5 text-muted-foreground" /> Direct Labor Wages &amp; Productivity Library
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">Standard Productivity Base</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            Trade labor wage constants, standard output rates, and overtime multipliers for unit rate analysis.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          {canEdit && pendingDefaults.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => void applyDefaultsToAll()} disabled={!tenantId || applyingDefaults}
              title="Apply the Cambodia all-in build-up to every day-rate trade that has none">
              <Calculator className="h-3.5 w-3.5" /> Apply all-in defaults ({pendingDefaults.length})
            </Button>
          )}
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
            title={!canCreate ? "You do not have permission to add labor rates" : undefined}
          >
            <Plus className="h-3.5 w-3.5" /> Add Labor Rate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Total Trades</p>
            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xl font-semibold">{rows.length}</p>
          <p className="text-xs text-muted-foreground">Active trade crafts</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Skilled Craftsmen</p>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xl font-semibold">{skilledCount}</p>
          <p className="text-xs text-muted-foreground">Certified &amp; master trades</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Avg Daily Wage</p>
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xl font-semibold text-emerald-700">{avgDailyWage != null ? formatMoney(avgDailyWage, "USD") : "—"}</p>
          <p className="text-xs text-muted-foreground">8-hour standard shift</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">All-in Costing</p>
            <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xl font-semibold">{allInCount}</p>
          <p className="text-xs text-muted-foreground">Trades costed at the all-in rate</p>
        </div>
      </div>

      <div className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search trade, skill, code…" className="pl-8" />
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load labor rates: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>Retry</Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Wrench className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {rows.length === 0 ? "No labor rates registered yet." : "No trades match your search."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Labor Code</TableHead>
                <TableHead>Trade Description</TableHead>
                <TableHead className="w-28">Skill Level</TableHead>
                <TableHead className="w-28">Shift Unit</TableHead>
                <TableHead className="w-28 text-right">Daily Basic Rate</TableHead>
                <TableHead className="w-28 text-right">Overtime Rate / hr</TableHead>
                <TableHead className="w-28 text-right" title="Rate cost items use: all-in when the build-up is on, else basic">Costing Rate</TableHead>
                <TableHead>Standard Productivity</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-16 text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.resource_id}>
                  <TableCell className="font-mono text-xs font-medium">{r.code}</TableCell>
                  <TableCell className="text-sm font-medium">{dwlDisplayResourceDescription(r.description)}</TableCell>
                  <TableCell>
                    {r.skill_level && (
                      <span className={cn("inline-flex rounded-full border px-1.5 py-0.5 text-[10px] font-medium", SKILL_BADGE_CLASS[r.skill_level])}>
                        {r.skill_level}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{shiftUnitLabel(r.unit)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-medium">{formatMoney(r.daily_basic_rate, r.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{formatMoney(r.overtime_rate_per_hr, r.currency)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    <span className={cn(r.all_in_enabled && "font-medium text-emerald-700")}>{formatMoney(r.costing_rate, r.currency)}</span>
                    <span className="block text-[10px] text-muted-foreground">{r.all_in_enabled ? "all-in" : "basic"}</span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.standard_productivity_note ?? "—"}</TableCell>
                  <TableCell>
                    {r.price_status ? (
                      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 capitalize">{r.price_status}</Badge>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label={`Actions for ${r.code}`} />}>
                        <MoreHorizontal className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => router.push(`/dashboard/qs/dwl-resources?q=${encodeURIComponent(r.code)}`)}>
                          <History /> Price history
                        </DropdownMenuItem>
                        {canEdit && (
                          <DropdownMenuItem onClick={() => { setEditRow(r); setShowForm(true); }}>
                            <Pencil /> Edit rate &amp; build-up
                          </DropdownMenuItem>
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

      <DwlLaborRateFormDialog
        open={showForm}
        onOpenChange={(o) => { setShowForm(o); if (!o) setEditRow(null); }}
        tenantId={tenantId}
        userId={userId}
        editRow={editRow}
        onSaved={() => void loadData()}
      />

      <DwlLaborRateImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        tenantId={tenantId}
        userId={userId}
        onImported={() => void loadData()}
      />
    </div>
  );
}
