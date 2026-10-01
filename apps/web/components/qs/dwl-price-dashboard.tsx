"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  AlertTriangle,
  Calendar,
  Clock,
  Download,
  Gauge,
  LineChart as LineChartIcon,
  Package,
  Plus,
  RefreshCw,
  Scale,
  Search,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";
import { cn } from "@/lib/utils";
import { useQsPermissions } from "@/hooks/use-qs-permissions";
import { DwlMaterialPriceDialog } from "@/components/qs/dwl-material-price-dialog";
import {
  DWL_EXPIRY_WINDOWS,
  dwlDisplayResourceDescription,
  type DwlCurrentPrice,
  type DwlExpiryWindow,
  type DwlPriceHistoryRow,
  type DwlPriceStatus,
  type DwlSourceType,
} from "@/components/qs/dwl-types";
import { getProfileById, listDwlResourcePricesOrderedByValidFrom, listDwlResourcesWithCategoryMaterial, listDwlSuppliers, listDwlVCurrentPrices } from "@/lib/qs/qs-queries";

const PRICE_COLUMNS =
  "id, tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until, source_type, location, " +
  "notes, quantity, discount, delivery_cost, handling_cost, other_charges, tax_amount, effective_unit_cost, payment_terms, " +
  "delivery_terms, lead_time_days, source_document, quotation_ref, quotation_date, project_code, price_status, approved_by, " +
  "approved_at, submission_id, dwl_quotation_id, created_by, created_at";

const PRICE_STATUS_STYLE: Record<DwlPriceStatus, string> = {
  approved: "border-emerald-300 bg-emerald-50 text-emerald-700",
  active: "border-emerald-300 bg-emerald-50 text-emerald-700",
  submitted: "border-amber-300 bg-amber-50 text-amber-700",
  verified: "border-amber-300 bg-amber-50 text-amber-700",
  draft: "border-border bg-muted text-muted-foreground",
  rejected: "border-destructive/40 bg-destructive/10 text-destructive",
  expired: "border-border bg-muted text-muted-foreground",
  superseded: "border-border bg-muted text-muted-foreground",
  archived: "border-border bg-muted text-muted-foreground",
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
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Whole-day difference between `dateStr` (a date-only string, e.g. from a
// `date` column) and today, both anchored at local midnight so the count
// doesn't drift by timezone or time-of-day.
function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

const SOURCE_LABEL: Record<DwlSourceType, string> = {
  quotation: "Quotation",
  purchase: "Purchase",
  market_survey: "Market Survey",
  estimate: "Estimate",
};

interface GapRow {
  resource_id: string;
  code: string;
  description: string;
  unit: string;
  currency: string;
  quotationPrice: number;
  quotationDate: string;
  purchasePrice: number;
  purchaseDate: string;
  gapAmount: number;
  gapPct: number;
}

export default function DwlPriceDashboard() {
  const supabase = useMemo(() => createClient(), []);
  const { can, loaded: permsLoaded } = useQsPermissions();

  const [activeTab, setActiveTab] = useState<"records" | "expiring" | "trends" | "gaps">("records");

  const [currentPrices, setCurrentPrices] = useState<DwlCurrentPrice[]>([]);
  const [priceHistory, setPriceHistory] = useState<DwlPriceHistoryRow[]>([]);
  const [resources, setResources] = useState<Map<string, { code: string; description: string; unit: string }>>(new Map());
  const [suppliers, setSuppliers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [expiryWindow, setExpiryWindow] = useState<DwlExpiryWindow>(14);

  const [trendSearch, setTrendSearch] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsMaterial, setRecordsMaterial] = useState("all");
  const [recordsSupplier, setRecordsSupplier] = useState("all");
  const [recordsStatus, setRecordsStatus] = useState("all");
  const [showRecordPrice, setShowRecordPrice] = useState(false);
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

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [currentResult, historyResult, supplierResult, resourceResult] = await Promise.all([
      listDwlVCurrentPrices(),
      listDwlResourcePricesOrderedByValidFrom(PRICE_COLUMNS),
      listDwlSuppliers(),
      listDwlResourcesWithCategoryMaterial(),
    ]);

    if (currentResult.error) {
      setErrorMsg(currentResult.error.message);
      setLoading(false);
      return;
    }
    if (historyResult.error) {
      setErrorMsg(historyResult.error.message);
      setLoading(false);
      return;
    }

    setCurrentPrices((currentResult.data ?? []) as DwlCurrentPrice[]);
    setPriceHistory((historyResult.data ?? []) as unknown as DwlPriceHistoryRow[]);

    const supplierMap = new Map<string, string>();
    for (const s of supplierResult.data ?? []) {
      supplierMap.set(s.id as string, s.name as string);
    }
    setSuppliers(supplierMap);

    const resourceMap = new Map<string, { code: string; description: string; unit: string }>();
    for (const r of (resourceResult.data ?? []) as { id: string; code: string; description: string; unit: string }[]) {
      resourceMap.set(r.id, { code: r.code, description: r.description, unit: r.unit });
    }
    setResources(resourceMap);

    setLoading(false);
  }, [supabase]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadData(); }, [loadData]);

  // Effective trend-picker selection: the user's explicit choice, or the
  // first resource once data lands — derived rather than synced via a
  // second effect, so there's no cascading setState-in-effect.
  const effectiveResourceId = selectedResourceId ?? currentPrices[0]?.resource_id ?? null;

  // ── Expiring quotations ────────────────────────────────────────────────
  const withExpiry = useMemo(
    () => currentPrices.filter((p) => p.quote_valid_until),
    [currentPrices]
  );

  const expiredRows = useMemo(
    () => withExpiry.filter((p) => daysUntil(p.quote_valid_until as string) < 0),
    [withExpiry]
  );

  const windowCounts = useMemo(() => {
    const counts = new Map<DwlExpiryWindow, number>();
    for (const w of DWL_EXPIRY_WINDOWS) {
      counts.set(
        w,
        withExpiry.filter((p) => {
          const d = daysUntil(p.quote_valid_until as string);
          return d >= 0 && d <= w;
        }).length
      );
    }
    return counts;
  }, [withExpiry]);

  const expiringRows = useMemo(
    () =>
      withExpiry
        .filter((p) => {
          const d = daysUntil(p.quote_valid_until as string);
          return d >= 0 && d <= expiryWindow;
        })
        .map((p) => ({ ...p, daysUntilExpiry: daysUntil(p.quote_valid_until as string) }))
        .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry),
    [withExpiry, expiryWindow]
  );

  // ── Price trends ─────────────────────────────────────────────────────
  const historyByResource = useMemo(() => {
    const map = new Map<string, DwlPriceHistoryRow[]>();
    for (const row of priceHistory) {
      const list = map.get(row.resource_id) ?? [];
      list.push(row);
      map.set(row.resource_id, list);
    }
    return map;
  }, [priceHistory]);

  const trendReadyResourceIds = useMemo(
    () => new Set([...historyByResource.entries()].filter(([, rows]) => rows.length > 1).map(([id]) => id)),
    [historyByResource]
  );

  const trendPickerOptions = useMemo(() => {
    const q = trendSearch.trim().toLowerCase();
    const filtered = q
      ? currentPrices.filter(
          (p) => p.code.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
        )
      : currentPrices;
    const limited = filtered.slice(0, 200);
    // Keep the currently selected resource in the option list even when the
    // search text would otherwise filter it out. Without this, the native
    // <select> silently falls back to displaying its first remaining option
    // while `effectiveResourceId` (and everything derived from it below —
    // chart, price table) still points at the no-longer-listed resource, so
    // the dropdown and the detail panel show two different resources.
    if (effectiveResourceId && !limited.some((p) => p.resource_id === effectiveResourceId)) {
      const selected = currentPrices.find((p) => p.resource_id === effectiveResourceId);
      if (selected) return [selected, ...limited];
    }
    return limited;
  }, [currentPrices, trendSearch, effectiveResourceId]);

  const selectedCurrentPrice = useMemo(
    () => currentPrices.find((p) => p.resource_id === effectiveResourceId) ?? null,
    [currentPrices, effectiveResourceId]
  );

  const selectedHistory = useMemo(
    () => (effectiveResourceId ? historyByResource.get(effectiveResourceId) ?? [] : []),
    [historyByResource, effectiveResourceId]
  );

  const chartData = useMemo(
    () =>
      selectedHistory.map((h) => ({
        date: formatDate(h.valid_from),
        price: h.unit_price,
      })),
    [selectedHistory]
  );

  // ── Quotation vs purchase gaps ───────────────────────────────────────
  const purchaseCount = useMemo(() => priceHistory.filter((h) => h.source_type === "purchase").length, [priceHistory]);
  const quotationCount = useMemo(() => priceHistory.filter((h) => h.source_type === "quotation").length, [priceHistory]);

  const resourceMetaById = useMemo(() => {
    const map = new Map<string, { code: string; description: string; unit: string }>();
    for (const p of currentPrices) {
      map.set(p.resource_id, { code: p.code, description: p.description, unit: p.unit });
    }
    return map;
  }, [currentPrices]);

  const gapRows = useMemo<GapRow[]>(() => {
    const rows: GapRow[] = [];
    for (const [resourceId, history] of historyByResource.entries()) {
      const quotations = history.filter((h) => h.source_type === "quotation");
      const purchases = history.filter((h) => h.source_type === "purchase");
      if (quotations.length === 0 || purchases.length === 0) continue;
      const latestQuotation = quotations[quotations.length - 1];
      const latestPurchase = purchases[purchases.length - 1];
      const meta = resourceMetaById.get(resourceId);
      if (!meta) continue;
      const gapAmount = latestPurchase.unit_price - latestQuotation.unit_price;
      const gapPct = latestQuotation.unit_price !== 0 ? (gapAmount / latestQuotation.unit_price) * 100 : 0;
      rows.push({
        resource_id: resourceId,
        code: meta.code,
        description: meta.description,
        unit: meta.unit,
        currency: latestPurchase.currency,
        quotationPrice: latestQuotation.unit_price,
        quotationDate: latestQuotation.valid_from,
        purchasePrice: latestPurchase.unit_price,
        purchaseDate: latestPurchase.valid_from,
        gapAmount,
        gapPct,
      });
    }
    return rows.sort((a, b) => Math.abs(b.gapPct) - Math.abs(a.gapPct));
  }, [historyByResource, resourceMetaById]);

  // ── Price History & Benchmark Records ─────────────────────────────────
  const canRecordDirect = can("qs_libraries", "can_create");
  const canSubmitPrice = can("qs_price_approval", "submit");

  const recordsRows = useMemo(() => {
    const q = recordsSearch.trim().toLowerCase();
    return priceHistory
      .filter((p) => recordsMaterial === "all" || p.resource_id === recordsMaterial)
      .filter((p) => recordsSupplier === "all" || p.supplier_id === recordsSupplier)
      .filter((p) => recordsStatus === "all" || p.price_status === recordsStatus)
      .filter((p) => {
        if (!q) return true;
        const meta = resources.get(p.resource_id);
        return (
          (meta?.code.toLowerCase().includes(q) ?? false)
          || (meta?.description.toLowerCase().includes(q) ?? false)
          || (p.quotation_ref?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => b.valid_from.localeCompare(a.valid_from) || b.created_at.localeCompare(a.created_at));
  }, [priceHistory, resources, recordsSearch, recordsMaterial, recordsSupplier, recordsStatus]);

  function handleExcelExport() {
    const data = recordsRows.map((r) => {
      const meta = resources.get(r.resource_id);
      return {
        Date: r.valid_from,
        Code: meta?.code ?? "",
        "Material Specification": meta ? dwlDisplayResourceDescription(meta.description) : "",
        Unit: meta?.unit ?? "",
        Supplier: r.supplier_id ? (suppliers.get(r.supplier_id) ?? "") : "",
        "Basic Price": r.unit_price,
        Discount: r.discount,
        Delivery: r.delivery_cost,
        Handling: r.handling_cost,
        Tax: r.tax_amount,
        "Effective Unit Cost": r.effective_unit_cost ?? "",
        Currency: r.currency,
        "Payment Terms": r.payment_terms ?? "",
        "Delivery Terms": r.delivery_terms ?? "",
        "Quotation Ref": r.quotation_ref ?? "",
        Status: r.price_status,
      };
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map((k) => ({ wch: Math.max(k.length, 12) }));
    XLSX.utils.book_append_sheet(wb, ws, "Price History");
    XLSX.writeFile(wb, `Price_History_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  const canView = !permsLoaded || can("qs_libraries", "view");

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
          <h1 className="text-2xl font-semibold tracking-tight">Price Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Price history records, expiring quotations, price trends and quotation-vs-purchase gaps across the resource price history.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : errorMsg ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-destructive/30 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive/60" />
          <p className="text-sm text-muted-foreground">Failed to load price data: {errorMsg}</p>
          <Button size="sm" variant="outline" onClick={() => void loadData()}>
            Retry
          </Button>
        </div>
      ) : currentPrices.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">No priced resources yet.</p>
          {(canRecordDirect || canSubmitPrice) && (
            <Button size="sm" onClick={() => setShowRecordPrice(true)} disabled={!tenantId}>
              <Plus className="h-3.5 w-3.5" /> Record New Price
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Package className="h-3.5 w-3.5" /> Priced resources
              </div>
              <p className="mt-1 text-xl font-semibold">{currentPrices.length}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertTriangle className="h-3.5 w-3.5" /> Expired current price
              </div>
              <p className={cn("mt-1 text-xl font-semibold", expiredRows.length > 0 && "text-destructive")}>
                {expiredRows.length}
              </p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" /> Expiring ≤ 30 days
              </div>
              <p className="mt-1 text-xl font-semibold">{windowCounts.get(30) ?? 0}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <LineChartIcon className="h-3.5 w-3.5" /> Resources with trend history
              </div>
              <p className="mt-1 text-xl font-semibold">
                {trendReadyResourceIds.size}
                <span className="ml-1 text-xs font-normal text-muted-foreground">/ {currentPrices.length}</span>
              </p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList>
              <TabsTrigger value="records">
                <Clock className="h-3.5 w-3.5" /> Records
              </TabsTrigger>
              <TabsTrigger value="expiring">
                <Calendar className="h-3.5 w-3.5" /> Expiring Quotations
              </TabsTrigger>
              <TabsTrigger value="trends">
                <LineChartIcon className="h-3.5 w-3.5" /> Price Trends
              </TabsTrigger>
              <TabsTrigger value="gaps">
                <Scale className="h-3.5 w-3.5" /> Quotation vs Purchase
              </TabsTrigger>
            </TabsList>

            {/* ── Price History & Benchmark Records ────────────────────── */}
            <TabsContent value="records" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="flex items-center gap-2 text-base font-semibold">
                    Price History &amp; Benchmark Records
                    <Badge variant="secondary">{recordsRows.length} Records</Badge>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Audit-traceable transactions including basic prices, delivery logistics, taxes, and effective rates.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={recordsRows.length === 0}>
                    <Download className="h-3.5 w-3.5" /> Excel Export
                  </Button>
                  {(canRecordDirect || canSubmitPrice) && (
                    <Button size="sm" onClick={() => setShowRecordPrice(true)} disabled={!tenantId}>
                      <Plus className="h-3.5 w-3.5" /> Record New Price
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={recordsSearch}
                    onChange={(e) => setRecordsSearch(e.target.value)}
                    placeholder="Search material, supplier, quotation ID…"
                    className="pl-8"
                  />
                </div>
                <select
                  value={recordsMaterial}
                  onChange={(e) => setRecordsMaterial(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="all">All Materials ({resources.size})</option>
                  {[...resources.entries()].sort((a, b) => a[1].code.localeCompare(b[1].code)).map(([id, meta]) => (
                    <option key={id} value={id}>{meta.code} — {dwlDisplayResourceDescription(meta.description)}</option>
                  ))}
                </select>
                <select
                  value={recordsSupplier}
                  onChange={(e) => setRecordsSupplier(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="all">All Suppliers ({suppliers.size})</option>
                  {[...suppliers.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <select
                  value={recordsStatus}
                  onChange={(e) => setRecordsStatus(e.target.value)}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                >
                  <option value="all">All Status</option>
                  {(["draft", "submitted", "verified", "approved", "rejected", "expired", "superseded", "archived", "active"] as DwlPriceStatus[]).map((s) => (
                    <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>

              {recordsRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Clock className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">No price records match the current filters.</p>
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">Date</TableHead>
                        <TableHead>Material Specification</TableHead>
                        <TableHead className="w-40">Supplier</TableHead>
                        <TableHead className="w-24 text-right">Basic Price</TableHead>
                        <TableHead className="w-20 text-right">Discount</TableHead>
                        <TableHead className="w-20 text-right">Delivery</TableHead>
                        <TableHead className="w-20 text-right">Tax</TableHead>
                        <TableHead className="w-28 text-right">Effective Unit Cost</TableHead>
                        <TableHead className="w-40">Terms &amp; Doc</TableHead>
                        <TableHead className="w-28">Approval</TableHead>
                        <TableHead className="w-20 text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recordsRows.map((r) => {
                        const meta = resources.get(r.resource_id);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(r.valid_from)}</TableCell>
                            <TableCell>
                              <p className="text-sm font-medium">{meta ? dwlDisplayResourceDescription(meta.description) : "—"}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">{meta?.code} • {meta?.unit}</p>
                            </TableCell>
                            <TableCell className="text-xs">
                              {r.supplier_id ? (suppliers.get(r.supplier_id) ?? "—") : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium">{formatMoney(r.unit_price, r.currency)}</TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {r.discount ? `-${formatMoney(r.discount, r.currency)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {r.delivery_cost ? `+${formatMoney(r.delivery_cost, r.currency)}` : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-xs text-muted-foreground">
                              {r.tax_amount ? `+${formatMoney(r.tax_amount, r.currency)}` : "—"}
                            </TableCell>
                            <TableCell className="bg-emerald-50/60 text-right font-mono text-xs font-semibold text-emerald-700">
                              {r.effective_unit_cost != null ? formatMoney(r.effective_unit_cost, r.currency) : "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.payment_terms && <p>{r.payment_terms}</p>}
                              {r.quotation_ref && <p className="font-mono text-[11px]">{r.quotation_ref}</p>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={cn("capitalize", PRICE_STATUS_STYLE[r.price_status])}>
                                {r.price_status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedResourceId(r.resource_id);
                                  setActiveTab("trends");
                                }}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ── Expiring Quotations ───────────────────────────────────── */}
            <TabsContent value="expiring" className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">Window:</span>
                {DWL_EXPIRY_WINDOWS.map((w) => (
                  <Button
                    key={w}
                    size="sm"
                    variant={expiryWindow === w ? "default" : "outline"}
                    onClick={() => setExpiryWindow(w)}
                  >
                    {w} days
                    <Badge variant="secondary" className="ml-1.5 px-1 text-[10px]">
                      {windowCounts.get(w) ?? 0}
                    </Badge>
                  </Button>
                ))}
                {expiredRows.length > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {expiredRows.length} already expired
                  </Badge>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {withExpiry.length} of {currentPrices.length} current prices carry a quotation expiry date
                </span>
              </div>

              {expiredRows.length === 0 && expiringRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Calendar className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No quotations expiring within {expiryWindow} days, and none already expired.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Try a longer window — the earliest current-price expiry on record is {formatDate(
                      withExpiry.length > 0
                        ? withExpiry.slice().sort((a, b) => (a.quote_valid_until as string).localeCompare(b.quote_valid_until as string))[0].quote_valid_until
                        : null
                    )}.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16">Unit</TableHead>
                        <TableHead className="w-28 text-right">Price</TableHead>
                        <TableHead className="w-40">Supplier</TableHead>
                        <TableHead className="w-24">Valid Until</TableHead>
                        <TableHead className="w-32">Status</TableHead>
                        <TableHead className="w-24 text-center">Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...expiredRows.map((p) => ({ ...p, daysUntilExpiry: daysUntil(p.quote_valid_until as string) })), ...expiringRows].map(
                        (row) => (
                          <TableRow key={row.resource_id}>
                            <TableCell className="font-mono text-xs font-medium">{row.code}</TableCell>
                            <TableCell className="text-sm">{dwlDisplayResourceDescription(row.description)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{row.unit}</TableCell>
                            <TableCell className="text-right font-mono text-xs font-medium">
                              {formatMoney(row.unit_price, row.currency)}
                            </TableCell>
                            <TableCell className="truncate text-xs text-muted-foreground">
                              {row.supplier_name ?? "—"}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(row.quote_valid_until)}</TableCell>
                            <TableCell>
                              {row.daysUntilExpiry < 0 ? (
                                <Badge variant="destructive">Expired {Math.abs(row.daysUntilExpiry)}d ago</Badge>
                              ) : row.daysUntilExpiry <= 14 ? (
                                <Badge variant="destructive">Expires in {row.daysUntilExpiry}d</Badge>
                              ) : (
                                <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                  Expires in {row.daysUntilExpiry}d
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedResourceId(row.resource_id);
                                  setActiveTab("trends");
                                }}
                              >
                                View history
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {/* ── Price Trends ──────────────────────────────────────────── */}
            <TabsContent value="trends" className="flex flex-col gap-4">
              {trendReadyResourceIds.size === 0 && (
                <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  Every priced resource currently has exactly one recorded price ({currentPrices.length} resources,{" "}
                  {priceHistory.length} price rows). Trend lines will appear once a second price is appended for a
                  resource — <code>dwl_resource_prices</code> is append-only, so history accumulates as new quotations,
                  purchases or surveys are entered on the Resource &amp; Price Entry screen.
                </div>
              )}

              <div className="relative w-full max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={trendSearch}
                  onChange={(e) => setTrendSearch(e.target.value)}
                  placeholder="Search resource code or description…"
                  className="pl-8"
                />
              </div>

              <select
                value={effectiveResourceId ?? ""}
                onChange={(e) => setSelectedResourceId(e.target.value || null)}
                className="h-9 w-full max-w-xl rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                {trendPickerOptions.map((p) => (
                  <option key={p.resource_id} value={p.resource_id}>
                    {p.code} — {dwlDisplayResourceDescription(p.description)}
                    {(historyByResource.get(p.resource_id)?.length ?? 0) > 1 ? " ★" : ""}
                  </option>
                ))}
              </select>
              {trendPickerOptions.length < currentPrices.length && trendSearch.trim() === "" && (
                <p className="text-xs text-muted-foreground">
                  Showing first {trendPickerOptions.length} of {currentPrices.length} resources — search to narrow.
                </p>
              )}

              {selectedCurrentPrice && (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    <span className="font-medium">{selectedCurrentPrice.code}</span>
                    <span className="text-muted-foreground">{dwlDisplayResourceDescription(selectedCurrentPrice.description)}</span>
                    <Badge variant="outline">{SOURCE_LABEL[selectedCurrentPrice.source_type]}</Badge>
                    {selectedCurrentPrice.is_expired && <Badge variant="destructive">Expired</Badge>}
                  </div>

                  <ChartWrapper
                    title={`${selectedCurrentPrice.code} — unit price over time`}
                    description={`${selectedHistory.length} price point${selectedHistory.length === 1 ? "" : "s"} recorded`}
                    empty={selectedHistory.length < 2}
                    emptyMessage="Only one price point recorded — not enough history to plot a trend yet."
                    height={220}
                  >
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#94a3b8" }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => formatMoney(v, selectedCurrentPrice.currency)}
                          width={80}
                        />
                        <Tooltip
                          formatter={(val) => [formatMoney(Number(val), selectedCurrentPrice.currency), "Unit price"]}
                          contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                        />
                        <Line
                          type="monotone"
                          dataKey="price"
                          stroke="#2563eb"
                          strokeWidth={2}
                          dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartWrapper>

                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Valid From</TableHead>
                          <TableHead className="w-28 text-right">Unit Price</TableHead>
                          <TableHead className="w-28">Source</TableHead>
                          <TableHead className="w-40">Supplier</TableHead>
                          <TableHead className="w-24">Valid Until</TableHead>
                          <TableHead>Notes</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedHistory
                          .slice()
                          .reverse()
                          .map((h) => (
                            <TableRow key={h.id}>
                              <TableCell className="text-xs">{formatDate(h.valid_from)}</TableCell>
                              <TableCell className="text-right font-mono text-xs font-medium">
                                {formatMoney(h.unit_price, h.currency)}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{SOURCE_LABEL[h.source_type]}</TableCell>
                              <TableCell className="truncate text-xs text-muted-foreground">
                                {h.supplier_id ? suppliers.get(h.supplier_id) ?? "—" : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">{formatDate(h.quote_valid_until)}</TableCell>
                              <TableCell className="truncate text-xs text-muted-foreground">{h.notes ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── Quotation vs Purchase Gaps ────────────────────────────── */}
            <TabsContent value="gaps" className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Quotation-sourced price rows</p>
                  <p className="mt-1 text-lg font-semibold">{quotationCount}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Purchase-sourced price rows</p>
                  <p className="mt-1 text-lg font-semibold">{purchaseCount}</p>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground">Resources with both</p>
                  <p className="mt-1 text-lg font-semibold">{gapRows.length}</p>
                </div>
              </div>

              {gapRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                  <Gauge className="h-8 w-8 text-muted-foreground/50" />
                  <p className="max-w-xl text-sm text-muted-foreground">
                    No quotation-vs-purchase gaps to show yet: {purchaseCount} of {priceHistory.length} price rows in the
                    library are purchase-sourced ({`source_type = 'purchase'`}).
                  </p>
                  <p className="max-w-xl text-xs text-muted-foreground">
                    This section compares, per resource, the latest quotation price against the latest actual purchase
                    price. It populates automatically once actual purchase prices are entered on the Resource &amp;
                    Price Entry screen (SOP §14: &ldquo;Monthly — Enter actual purchase prices from procurement&rdquo;).
                    The procurement module&rsquo;s own purchase-order and quotation tables ({`procurement_po_items`},{" "}
                    {`procurement_quotation_items`}) hold no rows in this environment either, and neither carries a
                    resource-level link to <code>dwl_resources</code> today, so an automatic feed from procurement is a
                    future schema change, not something this screen can compute from existing data.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-28 text-right">Latest Quote</TableHead>
                        <TableHead className="w-28 text-right">Latest Purchase</TableHead>
                        <TableHead className="w-24 text-right">Gap</TableHead>
                        <TableHead className="w-24">Flag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gapRows.map((g) => (
                        <TableRow key={g.resource_id}>
                          <TableCell className="font-mono text-xs font-medium">{g.code}</TableCell>
                          <TableCell className="text-sm">{dwlDisplayResourceDescription(g.description)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatMoney(g.quotationPrice, g.currency)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{formatMoney(g.purchasePrice, g.currency)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{g.gapPct.toFixed(1)}%</TableCell>
                          <TableCell>
                            {Math.abs(g.gapPct) >= 10 ? (
                              <Badge variant="destructive">Large gap</Badge>
                            ) : Math.abs(g.gapPct) >= 3 ? (
                              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                                Minor gap
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700">
                                In line
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}

      <DwlMaterialPriceDialog
        open={showRecordPrice}
        onOpenChange={setShowRecordPrice}
        resourceId={null}
        tenantId={tenantId}
        userId={userId}
        canSubmit={canSubmitPrice}
        canRecordDirect={canRecordDirect}
        onSaved={() => void loadData()}
      />
    </div>
  );
}
