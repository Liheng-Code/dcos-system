"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Gauge,
  LineChart as LineChartIcon,
  Package,
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
import {
  DWL_EXPIRY_WINDOWS,
  type DwlCurrentPrice,
  type DwlExpiryWindow,
  type DwlResourcePriceHistory,
  type DwlSourceType,
} from "@/components/qs/dwl-types";

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

  const [activeTab, setActiveTab] = useState<"expiring" | "trends" | "gaps">("expiring");

  const [currentPrices, setCurrentPrices] = useState<DwlCurrentPrice[]>([]);
  const [priceHistory, setPriceHistory] = useState<DwlResourcePriceHistory[]>([]);
  const [suppliers, setSuppliers] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [expiryWindow, setExpiryWindow] = useState<DwlExpiryWindow>(14);

  const [trendSearch, setTrendSearch] = useState("");
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const [currentResult, historyResult, supplierResult] = await Promise.all([
      supabase
        .from("dwl_v_current_prices")
        .select("resource_id, code, description, unit, unit_price, currency, valid_from, quote_valid_until, source_type, supplier_name, is_expired")
        .order("code"),
      supabase
        .from("dwl_resource_prices")
        .select("id, tenant_id, resource_id, supplier_id, unit_price, currency, valid_from, quote_valid_until, source_type, location, notes, created_by, created_at")
        .order("valid_from", { ascending: true }),
      supabase.from("dwl_suppliers").select("id, name"),
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
    setPriceHistory((historyResult.data ?? []) as DwlResourcePriceHistory[]);

    const supplierMap = new Map<string, string>();
    for (const s of supplierResult.data ?? []) {
      supplierMap.set(s.id as string, s.name as string);
    }
    setSuppliers(supplierMap);

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
    const map = new Map<string, DwlResourcePriceHistory[]>();
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
          <h1 className="text-2xl font-semibold tracking-tight">Direct Works Cost Library — Price Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Expiring quotations, price trends and quotation-vs-purchase gaps across the resource price history.
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
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No priced resources yet. Add resources and prices on the Resource &amp; Price Entry screen first.
          </p>
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
                            <TableCell className="text-sm">{row.description}</TableCell>
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
                    {p.code} — {p.description}
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
                    <span className="text-muted-foreground">{selectedCurrentPrice.description}</span>
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
                          <TableCell className="text-sm">{g.description}</TableCell>
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
    </div>
  );
}
