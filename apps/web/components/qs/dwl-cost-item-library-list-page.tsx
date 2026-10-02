"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { AlertTriangle, Blocks, ClipboardList, FileDown, FileSpreadsheet, Plus, Scale, Search, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { downloadCsv, fmtCsvNum } from "@/lib/csv-export";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlCostItemDetail } from "@/components/qs/dwl-cost-item-detail";
import { DwlCostItemCreateDialog } from "@/components/qs/dwl-cost-item-create-dialog";
import { DwlCostItemImportDialog } from "@/components/qs/dwl-cost-item-import-dialog";
import type { DwlAssemblyCostingSummaryRow } from "@/components/qs/dwl-types";
import { useTenderPermissions } from "@/hooks/use-tender-permissions";
import { AssignLibraryToBoqDialog } from "@/components/qs/tenders/cost-estimation/assign-library-to-boq-dialog";
import { getProfileById, listDwlVAssemblyCostingSummary } from "@/lib/qs/qs-queries";

const V_COLUMNS =
  "assembly_id, code, element_group, description, unit, daily_output, overhead_pct, risk_pct, profit_pct, vat_pct, " +
  "discipline, guardrail_note, version_label, status, created_by_name, updated_at, " +
  "material_base_cost, waste_cost, material_total_cost, " +
  "crew_cost_per_day, equipment_cost_per_day, labor_cost_per_unit, equipment_cost_per_unit, " +
  "direct_installed_cost, target_tender_rate";

function formatMoney(v: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

export default function DwlCostItemLibraryListPage() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [rows, setRows] = useState<DwlAssemblyCostingSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [tenantId, setTenantId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (!uid) return;
      const { data: profile } = await getProfileById(uid, "company_id");
      if (profile?.company_id) setTenantId(profile.company_id as string);
    })();
  }, [supabase]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await listDwlVAssemblyCostingSummary(V_COLUMNS);
    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as unknown as DwlAssemblyCostingSummaryRow[];
    setRows(list);
    setLoading(false);
    setSelectedId((prev) => prev ?? list[0]?.assembly_id ?? null);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadList(); }, [loadList]);

  const groups = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.element_group);
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let result = rows;
    if (groupFilter !== "all") result = result.filter((r) => r.element_group === groupFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter((r) => r.code.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    return result;
  }, [rows, groupFilter, search]);

  const canView = !permsLoaded || can("qs_libraries", "view");
  const canCreate = can("qs_libraries", "can_create");
  const { can: canTender } = useTenderPermissions();
  const canAssign = canTender("tender_boq", "can_create");
  const [showAssign, setShowAssign] = useState(false);

  // One selection drives both Compare (2–3 items) and Assign to Tender BOQ (any number).
  function toggleCompare(id: string) {
    setCompareIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => compareIds.has(r.assembly_id));
  function toggleAllVisible() {
    setCompareIds((prev) => {
      const next = new Set(prev);
      for (const r of filtered) {
        if (allVisibleSelected) next.delete(r.assembly_id);
        else next.add(r.assembly_id);
      }
      return next;
    });
  }

  // Assign the ticked items, or the item open in the detail panel when nothing is ticked.
  const assignIds = compareIds.size > 0 ? [...compareIds] : selectedId ? [selectedId] : [];

  const compareRows = useMemo(() => rows.filter((r) => compareIds.has(r.assembly_id)), [rows, compareIds]);

  function exportRows() {
    return filtered.map((r) => ({
      Code: r.code,
      Name: r.description.split(" — ")[0],
      Category: r.element_group,
      Discipline: r.discipline ?? "",
      Unit: r.unit,
      Status: r.status ?? "",
      "Direct Cost": r.direct_installed_cost,
      "Tender Cost": r.target_tender_rate,
      Material: r.material_total_cost,
      Labour: r.labor_cost_per_unit,
      Equipment: r.equipment_cost_per_unit,
      "Overhead %": Math.round((r.overhead_pct ?? 0) * 10000) / 100,
      "Risk %": Math.round((r.risk_pct ?? 0) * 10000) / 100,
      "Profit %": Math.round((r.profit_pct ?? 0) * 10000) / 100,
      "VAT %": Math.round((r.vat_pct ?? 0) * 10000) / 100,
      Version: r.version_label ?? "",
      "Registered By": r.created_by_name ?? "",
      Updated: r.updated_at ? r.updated_at.slice(0, 10) : "",
    }));
  }

  function handleExcelExport() {
    const data = exportRows();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Cost Item Library");
    XLSX.writeFile(wb, `Cost_Item_Library_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function handleCsvExport() {
    const data = exportRows();
    const header = Object.keys(data[0] ?? {});
    const dataRows = data.map((r) => header.map((h) => {
      const v = (r as Record<string, string | number>)[h];
      return typeof v === "number" ? fmtCsvNum(v) : String(v ?? "");
    }));
    downloadCsv(`Cost_Item_Library_${new Date().toISOString().slice(0, 10)}.csv`, [header, ...dataRows]);
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
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Blocks className="h-5 w-5 text-muted-foreground" /> Cost Item Library
          <Badge variant="secondary">{rows.length}</Badge>
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {compareIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCompare(true)}
              disabled={compareIds.size < 2 || compareIds.size > 3}
              title={compareIds.size > 3 ? "Compare up to 3 items" : undefined}
            >
              <Scale className="h-3.5 w-3.5" /> Compare ({compareIds.size})
            </Button>
          )}
          {canAssign && (
            <Button size="sm" variant="outline" onClick={() => setShowAssign(true)} disabled={assignIds.length === 0}>
              <ClipboardList className="h-3.5 w-3.5" /> Assign to Tender BOQ ({assignIds.length})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={filtered.length === 0}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel Export
          </Button>
          <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={filtered.length === 0}>
            <FileDown className="h-3.5 w-3.5" /> CSV Export
          </Button>
          {canCreate && (
            <Button variant="outline" size="sm" onClick={() => setShowImport(true)} disabled={!tenantId}>
              <Upload className="h-3.5 w-3.5" /> Import (Excel/CSV)
            </Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={() => setShowCreate(true)} disabled={!tenantId}>
              <Plus className="h-3.5 w-3.5" /> New Cost Item
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
        {/* Left browse panel */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or code..." className="pl-8" />
          </div>
          <select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
            <option value="all">All Categories ({rows.length})</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          {filtered.length > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAllVisible} aria-label="Select all shown" />
                Select all shown
              </label>
              {compareIds.size > 0 && (
                <button type="button" className="hover:text-foreground" onClick={() => setCompareIds(new Set())}>
                  Clear ({compareIds.size})
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
            </div>
          ) : errorMsg ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-destructive/30 p-6 text-center">
              <AlertTriangle className="h-6 w-6 text-destructive/60" />
              <p className="text-xs text-muted-foreground">{errorMsg}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border p-8 text-center">
              <Blocks className="h-6 w-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {rows.length === 0 ? "No cost items yet — create an assembly under Direct Works Assemblies." : "No items match your search."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 overflow-y-auto" style={{ maxHeight: "70vh" }}>
              {filtered.map((r) => (
                <button
                  key={r.assembly_id}
                  type="button"
                  onClick={() => setSelectedId(r.assembly_id)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    r.assembly_id === selectedId ? "border-emerald-300 bg-emerald-50/60" : "border-border hover:bg-accent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={compareIds.has(r.assembly_id)} onCheckedChange={() => toggleCompare(r.assembly_id)} aria-label={`Select ${r.code}`} />
                      <Badge variant="outline" className="font-mono text-[10px]">{r.code}</Badge>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{r.version_label}</span>
                  </div>
                  <p className="mt-1 line-clamp-1 text-sm font-medium">{r.description.split(" — ")[0]}</p>
                  <div className="mt-1.5 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Direct: {formatMoney(r.direct_installed_cost)}/{r.unit}</span>
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700">
                      Tender Cost: {formatMoney(r.target_tender_rate)}/{r.unit}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right detail panel */}
        <div>
          {selectedId ? (
            <DwlCostItemDetail assemblyId={selectedId} onChanged={() => void loadList()} />
          ) : (
            <div className="flex h-full min-h-[300px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
              Select a cost item to view its detail.
            </div>
          )}
        </div>
      </div>

      {showCompare && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl overflow-x-auto rounded-lg border border-border bg-background p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold">Compare Cost Items</h3>
              <Button variant="outline" size="sm" onClick={() => setShowCompare(false)}>Close</Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-3">Metric</th>
                  {compareRows.map((r) => <th key={r.assembly_id} className="py-1.5 pr-3 font-medium text-foreground">{r.code}</th>)}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Material", get: (r: DwlAssemblyCostingSummaryRow) => formatMoney(r.material_total_cost) },
                  { label: "Labor", get: (r: DwlAssemblyCostingSummaryRow) => formatMoney(r.labor_cost_per_unit) },
                  { label: "Equipment", get: (r: DwlAssemblyCostingSummaryRow) => formatMoney(r.equipment_cost_per_unit) },
                  { label: "Direct Installed Cost", get: (r: DwlAssemblyCostingSummaryRow) => formatMoney(r.direct_installed_cost) },
                  { label: "Target Tender Rate", get: (r: DwlAssemblyCostingSummaryRow) => formatMoney(r.target_tender_rate) },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3 text-muted-foreground">{row.label}</td>
                    {compareRows.map((r) => <td key={r.assembly_id} className="py-1.5 pr-3 font-mono">{row.get(r)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DwlCostItemCreateDialog
        open={showCreate}
        onOpenChange={setShowCreate}
        tenantId={tenantId}
        userId={userId}
        onCreated={(newAssemblyId) => {
          void loadList();
          setSelectedId(newAssemblyId);
        }}
      />

      <AssignLibraryToBoqDialog
        open={showAssign}
        onOpenChange={setShowAssign}
        preselectedIds={assignIds}
        onAssigned={() => setCompareIds(new Set())}
      />

      <DwlCostItemImportDialog
        open={showImport}
        onOpenChange={setShowImport}
        tenantId={tenantId}
        userId={userId}
        onImported={() => void loadList()}
      />
    </div>
  );
}
