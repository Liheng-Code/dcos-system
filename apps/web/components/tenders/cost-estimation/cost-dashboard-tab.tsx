"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Filter, X, ArrowRight } from "lucide-react";
import { getBoqItemsWithJoins, getPreliminariesTotal, getPreliminariesItems, getBidSummaries, type BoqItemWithJoins, type TenderPreliminariesItem, type TenderBidSummary } from "@/lib/tender-cost-service";
import { useProject } from "@/components/dashboard/project-context";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => n >= 1_000_000
  ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`;

const fmtFull = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const pct = (n: number, total: number) => total > 0 ? `${((n / total) * 100).toFixed(1)}%` : "0%";

function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-28 truncate text-muted-foreground shrink-0" title={label}>{label || "—"}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
        <div className={`h-full rounded ${color}`} style={{ width: `${Math.max(w, 1)}%` }} />
        <span className="absolute inset-0 flex items-center justify-end pr-1.5 font-medium text-[10px]">{fmt(value)}</span>
      </div>
    </div>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface FilterState {
  level: string;
  trade: string;
  discipline: string;
  sourcing: string;
  section: string;
  buildingCode: string;
}

const EMPTY_FILTERS: FilterState = { level: "", trade: "", discipline: "", sourcing: "", section: "", buildingCode: "" };

// ── Component ────────────────────────────────────────────────────────────────

interface CostDashboardTabProps {
  tenderId: string;
  tenderStatus?: string | null;
  projectId?: string | null;
  budgetConvertedAt?: string | null;
  onNavigateToBoq?: () => void;
  onNavigateToPrelims?: () => void;
}

export function CostDashboardTab({ tenderId, tenderStatus, projectId, budgetConvertedAt, onNavigateToBoq, onNavigateToPrelims }: CostDashboardTabProps) {
  const router = useRouter();
  const { setSelectedProjectId } = useProject();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<BoqItemWithJoins[]>([]);
  const [prelimsTotal, setPrelimsTotal] = useState(0);
  const [prelimsItems, setPrelimsItems] = useState<TenderPreliminariesItem[]>([]);
  const [bidSummaries, setBidSummaries] = useState<TenderBidSummary[]>([]);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);

  const [converting, setConverting] = useState(false);
  const [convertedAt, setConvertedAt] = useState<string | null>(budgetConvertedAt ?? null);

  // Re-sync local conversion state whenever the parent's tender data (re)loads.
  useEffect(() => {
    setConvertedAt(budgetConvertedAt ?? null);
  }, [budgetConvertedAt, tenderId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([getBoqItemsWithJoins(tenderId), getPreliminariesTotal(tenderId), getPreliminariesItems(tenderId), getBidSummaries(tenderId)])
      .then(([boq, prelims, prelimsItems, bids]) => {
        if (!cancelled) { setItems(boq); setPrelimsTotal(prelims); setPrelimsItems(prelimsItems); setBidSummaries(bids); setLoading(false); }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [tenderId]);

  async function handleConvertToBudget() {
    setConverting(true);
    try {
      const res = await fetch(`/api/tenders/${tenderId}/convert-to-budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (!res.ok) {
        const friendly: Record<string, string> = {
          NOT_AWARDED: "Tender must be awarded first",
          NO_PROJECT_LINKED: "Link this tender to a project first",
          ALREADY_CONVERTED: "This tender's budget was already converted",
        };
        throw new Error((json.code && friendly[json.code]) || json.error || "Conversion failed");
      }
      const { items_created, prelim_items_created, total_amount, converted_at } = json.data as {
        items_created: number;
        prelim_items_created: number;
        total_amount: number;
        converted_at: string;
      };
      toast.success(`Converted ${items_created + prelim_items_created} items (${fmtFull(total_amount)}) to project budget`);
      setConvertedAt(converted_at);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setConverting(false);
    }
  }

  function handleViewInCostDashboard() {
    if (!projectId) return;
    setSelectedProjectId(projectId);
    router.push("/dashboard?tab=cost");
  }

  // Extract distinct filter options from data
  const filterOptions = useMemo(() => {
    const levels = new Set<string>();
    const trades = new Set<string>();
    const disciplines = new Set<string>();
    const sections = new Set<string>();
    const buildings = new Set<string>();
    for (const item of items) {
      if (item.level) levels.add(item.level);
      const trade = item.tender_unit_rates?.trade;
      if (trade) trades.add(trade);
      if (item.discipline) disciplines.add(item.discipline);
      if (item.section) sections.add(item.section);
      if (item.building_code) buildings.add(item.building_code);
    }
    return {
      levels: Array.from(levels).sort(),
      trades: Array.from(trades).sort(),
      disciplines: Array.from(disciplines).sort(),
      sections: Array.from(sections).sort(),
      buildings: Array.from(buildings).sort(),
    };
  }, [items]);

  // Apply filters
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filters.level && item.level !== filters.level) return false;
      if (filters.trade && item.tender_unit_rates?.trade !== filters.trade) return false;
      if (filters.discipline && item.discipline !== filters.discipline) return false;
      if (filters.sourcing && item.sourcing !== filters.sourcing) return false;
      if (filters.section && item.section !== filters.section) return false;
      if (filters.buildingCode && item.building_code !== filters.buildingCode) return false;
      return true;
    });
  }, [items, filters]);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // Compute KPIs
  const kpis = useMemo(() => {
    const total = filtered.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
    const direct = filtered.filter((i) => i.sourcing !== "subcon").reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
    const subcon = total - direct;
    const linkedCount = filtered.filter((i) => i.unit_rate_id).length;
    const rateCoverage = filtered.length > 0 ? (linkedCount / filtered.length) * 100 : 0;
    const tradesUsed = new Set(filtered.map((i) => i.tender_unit_rates?.trade).filter(Boolean)).size;
    return { total, direct, subcon, rateCoverage, count: filtered.length, tradesUsed };
  }, [filtered]);

  const latestBid = useMemo(() => {
    if (bidSummaries.length === 0) return null;
    return [...bidSummaries].sort((a, b) => b.revision_no - a.revision_no)[0];
  }, [bidSummaries]);

  // Breakdowns
  function groupBy<T>(arr: T[], keyFn: (item: T) => string): { label: string; value: number }[] {
    const map = new Map<string, number>();
    for (const item of arr) {
      const key = keyFn(item) || "—";
      map.set(key, (map.get(key) || 0) + (Number((item as BoqItemWithJoins).total_amount) || 0));
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }

  const byLevel = useMemo(() => groupBy(filtered, (i) => i.level), [filtered]);
  const byTrade = useMemo(() => groupBy(filtered, (i) => i.tender_unit_rates?.trade || ""), [filtered]);
  const byDiscipline = useMemo(() => groupBy(filtered, (i) => i.discipline || ""), [filtered]);
  const byBudgetCode = useMemo(() => groupBy(filtered, (i) => i.budget_codes ? `${i.budget_codes.code_letter} — ${i.budget_codes.code}` : ""), [filtered]);

  const byPrelimsCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of prelimsItems) {
      const key = item.code || "—";
      map.set(key, (map.get(key) || 0) + (Number(item.amount) || 0));
    }
    return Array.from(map.entries()).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [prelimsItems]);

  const maxLevel = byLevel[0]?.value || 0;
  const maxTrade = byTrade[0]?.value || 0;
  const maxDisc = byDiscipline[0]?.value || 0;
  const maxBudget = byBudgetCode[0]?.value || 0;
  const maxPrelims = byPrelimsCode[0]?.value || 0;

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const canConvert = tenderStatus === "awarded" && !convertedAt;
  const showConvertRow = canConvert || !!convertedAt;

  return (
    <div className="space-y-4">
      {/* ── Budget Conversion ──────────────────────────────────────── */}
      {showConvertRow && (
        <div className="rounded-lg border border-border bg-card p-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-foreground">
            {convertedAt
              ? `Budget baseline converted to project on ${new Date(convertedAt).toLocaleDateString()}`
              : "This tender is awarded — convert its cost estimate into the project's Cost Dashboard budget baseline."}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {canConvert && (
              projectId ? (
                <Button size="sm" onClick={handleConvertToBudget} disabled={converting}>
                  {converting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Convert to Project Budget
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger>
                    <span className="inline-flex" tabIndex={0}>
                      <Button size="sm" disabled className="pointer-events-none">
                        Convert to Project Budget
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Link this tender to a project in the Tender Register before converting</TooltipContent>
                </Tooltip>
              )
            )}
            {convertedAt && (
              <Button size="sm" variant="outline" onClick={handleViewInCostDashboard}>
                View in Cost Dashboard <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Filters ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Filters</span>
          {activeFilterCount > 0 && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} className="ml-auto flex items-center gap-1 text-[11px] text-blue-600 hover:underline">
              <X className="h-3 w-3" /> Clear all ({activeFilterCount})
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <FilterSelect label="Level" value={filters.level} options={filterOptions.levels} onChange={(v) => setFilters((f) => ({ ...f, level: v }))} />
          <FilterSelect label="Trade" value={filters.trade} options={filterOptions.trades} onChange={(v) => setFilters((f) => ({ ...f, trade: v }))} />
          <FilterSelect label="Discipline" value={filters.discipline} options={filterOptions.disciplines} onChange={(v) => setFilters((f) => ({ ...f, discipline: v }))} />
          <FilterSelect label="Sourcing" value={filters.sourcing} options={["self", "subcon"]} onChange={(v) => setFilters((f) => ({ ...f, sourcing: v }))} />
          <FilterSelect label="Section" value={filters.section} options={filterOptions.sections} onChange={(v) => setFilters((f) => ({ ...f, section: v }))} />
          <FilterSelect label="Building" value={filterOptions.buildings.length === 1 ? "" : filters.buildingCode} options={filterOptions.buildings} onChange={(v) => setFilters((f) => ({ ...f, buildingCode: v }))} />
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
        <KpiCard label="Grand Total" value={fmtFull(kpis.total + prelimsTotal)} sub="BOQ + Prelims" accent="text-foreground font-extrabold" />
        {latestBid && (
          <KpiCard label="Bid Price (Incl. Markups)" value={fmtFull(latestBid.total_bid_price)} sub={`Rev ${latestBid.revision_no} · ${latestBid.status}`} accent="text-emerald-700 font-bold" />
        )}
        <KpiCard label="Total BOQ" value={fmtFull(kpis.total)} accent="text-foreground" />
        <KpiCard label="Direct Works" value={fmtFull(kpis.direct)} sub={pct(kpis.direct, kpis.total)} accent="text-blue-600" />
        <KpiCard label="Subcon Works" value={fmtFull(kpis.subcon)} sub={pct(kpis.subcon, kpis.total)} accent="text-orange-600" />
        <KpiCard label="Preliminaries" value={fmtFull(prelimsTotal)} accent="text-purple-600" />
        <KpiCard label="Rate Coverage" value={`${kpis.rateCoverage.toFixed(0)}%`} accent="text-emerald-600" />
        <KpiCard label="BOQ Items" value={String(kpis.count)} accent="text-muted-foreground" />
        <KpiCard label="Trades Used" value={String(kpis.tradesUsed)} accent="text-muted-foreground" />
      </div>

      {/* ── Breakdown Panels ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BreakdownPanel title="Cost by Level" items={byLevel} max={maxLevel} color="bg-blue-500" />
        <BreakdownPanel title="Cost by Trade" items={byTrade} max={maxTrade} color="bg-emerald-500" />
        <BreakdownPanel title="Cost by Discipline" items={byDiscipline} max={maxDisc} color="bg-purple-500" />
        <BreakdownPanel title="Cost by Budget Code" items={byBudgetCode} max={maxBudget} color="bg-orange-500" />
      </div>

      {/* ── Preliminaries Breakdown ─────────────────────────────────── */}
      {byPrelimsCode.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Preliminaries by Code — {fmtFull(prelimsTotal)}</h3>
          <div className="space-y-1.5">
            {byPrelimsCode.map((item) => (
              <BarRow key={item.label} label={item.label} value={item.value} max={maxPrelims} color="bg-purple-500" />
            ))}
          </div>
        </div>
      )}

      {/* ── Rate Source Mix ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Rate Source</h3>
          {(() => {
            const linked = filtered.filter((i) => i.unit_rate_id).length;
            const manual = filtered.length - linked;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 rounded bg-emerald-500" style={{ width: `${filtered.length > 0 ? (linked / filtered.length) * 100 : 0}%` }} />
                  <span className="text-xs">Linked: {linked} ({pct(linked, filtered.length)})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 rounded bg-amber-500" style={{ width: `${filtered.length > 0 ? (manual / filtered.length) * 100 : 0}%` }} />
                  <span className="text-xs">Manual: {manual} ({pct(manual, filtered.length)})</span>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-semibold mb-3">Sourcing Mix</h3>
          {(() => {
            const selfCount = filtered.filter((i) => i.sourcing !== "subcon").length;
            const subconCount = filtered.length - selfCount;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 rounded bg-blue-500" style={{ width: `${filtered.length > 0 ? (selfCount / filtered.length) * 100 : 0}%` }} />
                  <span className="text-xs">Self: {selfCount} ({pct(selfCount, filtered.length)})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 rounded bg-orange-500" style={{ width: `${filtered.length > 0 ? (subconCount / filtered.length) * 100 : 0}%` }} />
                  <span className="text-xs">Subcon: {subconCount} ({pct(subconCount, filtered.length)})</span>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* ── Navigation Links ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {onNavigateToBoq && (
          <button onClick={onNavigateToBoq} className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-center">
            View full BOQ in Tender BOQ tab →
          </button>
        )}
        {onNavigateToPrelims && (
          <button onClick={onNavigateToPrelims} className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors text-center">
            View Preliminaries →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] text-muted-foreground mb-0.5 block">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
      >
        <option value="">All {label}</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function KpiCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${accent || ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function BreakdownPanel({ title, items, max, color }: { title: string; items: { label: string; value: number }[]; max: number; color: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="text-xs font-semibold mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data</p>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <BarRow key={item.label} label={item.label} value={item.value} max={max} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}
