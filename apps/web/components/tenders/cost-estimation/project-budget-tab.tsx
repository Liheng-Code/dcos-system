"use client";

import { useEffect, useState } from "react";
import { Loader2, DollarSign, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { getProjectBudget, type ProjectBudgetSummary, type ProjectBudgetLine } from "@/lib/tender-cost-service";

const fmt = (n: number) => n >= 1_000_000
  ? `$${(n / 1_000_000).toFixed(2)}M`
  : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}K`
    : `$${n.toFixed(0)}`;

const fmtFull = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

type BreakdownKey = "by_budget_code" | "by_trade" | "by_discipline" | "by_level";

const BREAKDOWN_TABS: { key: BreakdownKey; label: string }[] = [
  { key: "by_budget_code", label: "By Budget Code" },
  { key: "by_trade", label: "By Trade" },
  { key: "by_level", label: "By Level" },
  { key: "by_discipline", label: "By Discipline" },
];

function MarginBadge({ pct }: { pct: number }) {
  const cls = pct >= 15
    ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20"
    : pct >= 8
      ? "bg-amber-50 text-amber-700 ring-amber-600/20"
      : "bg-red-50 text-red-700 ring-red-600/20";
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${cls}`}>
      {pct.toFixed(1)}%
    </span>
  );
}

function BudgetLineRow({ line, max }: { line: ProjectBudgetLine; max: number }) {
  const costW = max > 0 ? (line.total_net_cost / max) * 100 : 0;
  const sellW = max > 0 ? (line.total_selling_price / max) * 100 : 0;
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/30 transition-colors">
      <td className="px-4 py-3">
        <div className="text-[13px] font-medium truncate max-w-[220px]" title={line.group_label}>{line.group_label || "—"}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{line.item_count} item{line.item_count !== 1 ? "s" : ""}</div>
      </td>
      <td className="px-4 py-3 text-right tabular-nums text-[13px] text-muted-foreground">{fmtFull(line.total_net_cost)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-[13px] font-semibold">{fmtFull(line.total_selling_price)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-[13px]">
        <span className={line.embedded_margin >= 0 ? "text-emerald-600" : "text-red-600"}>
          {line.embedded_margin >= 0 ? "+" : ""}{fmtFull(line.embedded_margin)}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <MarginBadge pct={line.margin_pct} />
      </td>
      <td className="px-4 py-3 w-44">
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-5 bg-muted/60 rounded-md overflow-hidden">
            <div className="h-full bg-blue-500/40 rounded-md transition-all duration-500" style={{ width: `${Math.max(costW, 1)}%` }} />
          </div>
          <div className="flex-1 h-5 bg-muted/60 rounded-md overflow-hidden">
            <div className="h-full bg-primary/50 rounded-md transition-all duration-500" style={{ width: `${Math.max(sellW, 1)}%` }} />
          </div>
        </div>
      </td>
    </tr>
  );
}

export function ProjectBudgetTab({ tenderId }: { tenderId: string }) {
  const [loading, setLoading] = useState(true);
  const [budget, setBudget] = useState<ProjectBudgetSummary | null>(null);
  const [activeTab, setActiveTab] = useState<BreakdownKey>("by_budget_code");

  async function load() {
    setLoading(true);
    try {
      const data = await getProjectBudget(tenderId);
      setBudget(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [tenderId]);

  if (loading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (!budget) return <div className="text-sm text-muted-foreground py-8 text-center">No data available</div>;

  const lines = budget[activeTab];
  const maxSelling = Math.max(...lines.map((l) => l.total_selling_price), 1);

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Project Budget Summary</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">Cost vs. selling price with embedded margin analysis</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-150 shadow-sm">
          <RefreshCw className="h-3 w-3" /> Refresh
        </button>
      </div>

      {/* ── KPI Hero Row ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Cost Budget (Net)"
          value={fmtFull(budget.total_net_cost)}
          sub="Total cost to execute"
          color="blue"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Selling Price"
          value={fmtFull(budget.total_selling_price)}
          sub="Price to client"
          color="primary"
        />
        <KpiCard
          icon={budget.embedded_margin >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          label="Embedded Margin"
          value={budget.embedded_margin >= 0 ? `+${fmtFull(budget.embedded_margin)}` : fmtFull(budget.embedded_margin)}
          sub={`${budget.margin_pct.toFixed(1)}% margin on selling price`}
          color={budget.embedded_margin >= 0 ? "green" : "red"}
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Margin Rate"
          value={`${budget.margin_pct.toFixed(1)}%`}
          sub={`on ${fmtFull(budget.total_selling_price)} selling`}
          color={budget.margin_pct >= 10 ? "green" : budget.margin_pct >= 5 ? "yellow" : "red"}
        />
      </div>

      {/* ── Grand Totals Row (if prelims exist) ──────────────────────── */}
      {budget.preliminaries_cost > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-muted-foreground/40" />
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Including Preliminaries — {fmtFull(budget.preliminaries_cost)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              icon={<DollarSign className="h-5 w-5" />}
              label="Grand Cost"
              value={fmtFull(budget.grand_net_cost)}
              sub="Cost + Preliminaries"
              color="purple"
            />
            <KpiCard
              icon={<TrendingUp className="h-5 w-5" />}
              label="Grand Selling"
              value={fmtFull(budget.grand_selling_price)}
              sub="Selling + Preliminaries"
              color="purple"
            />
            <KpiCard
              icon={budget.grand_margin >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              label="Grand Margin"
              value={`${budget.grand_margin_pct.toFixed(1)}%`}
              sub={fmtFull(budget.grand_margin)}
              color={budget.grand_margin >= 0 ? "green" : "red"}
            />
          </div>
        </div>
      )}

      {/* ── Breakdown Table ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/60 bg-card overflow-hidden">
        {/* Tabs */}
        <div className="flex border-b border-border/60 bg-muted/20 overflow-x-auto">
          {BREAKDOWN_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`relative px-5 py-2.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === t.key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/70"
              }`}
            >
              {t.label}
              {activeTab === t.key && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-muted/30">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Group</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Net Cost</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Selling Price</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Margin ($)</th>
                <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">Margin %</th>
                <th className="px-4 py-2.5 font-semibold text-muted-foreground uppercase tracking-wider text-[10px] w-44">Cost vs Selling</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <BudgetLineRow key={line.group_key} line={line} max={maxSelling} />
              ))}
              {lines.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <div className="text-muted-foreground text-xs">No data — link rates to BOQ items with margin to see breakdown</div>
                  </td>
                </tr>
              )}
            </tbody>
            {lines.length > 0 && (
              <tfoot className="border-t-2 border-border/60 bg-muted/40">
                <tr>
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Total</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs font-bold">{fmtFull(budget.total_net_cost)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs font-bold">{fmtFull(budget.total_selling_price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-xs font-bold">
                    <span className={budget.embedded_margin >= 0 ? "text-emerald-600" : "text-red-600"}>
                      {budget.embedded_margin >= 0 ? "+" : ""}{fmtFull(budget.embedded_margin)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-xs font-bold">{budget.margin_pct.toFixed(1)}%</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}

const KPI_STYLES: Record<string, { bg: string; iconBg: string; accent: string; ring: string }> = {
  blue:   { bg: "from-blue-500/[0.04] to-transparent", iconBg: "bg-blue-500/10", accent: "text-blue-600 dark:text-blue-400", ring: "ring-blue-500/20" },
  green:  { bg: "from-emerald-500/[0.04] to-transparent", iconBg: "bg-emerald-500/10", accent: "text-emerald-600 dark:text-emerald-400", ring: "ring-emerald-500/20" },
  red:    { bg: "from-red-500/[0.04] to-transparent", iconBg: "bg-red-500/10", accent: "text-red-600 dark:text-red-400", ring: "ring-red-500/20" },
  yellow: { bg: "from-amber-500/[0.04] to-transparent", iconBg: "bg-amber-500/10", accent: "text-amber-600 dark:text-amber-400", ring: "ring-amber-500/20" },
  purple: { bg: "from-purple-500/[0.04] to-transparent", iconBg: "bg-purple-500/10", accent: "text-purple-600 dark:text-purple-400", ring: "ring-purple-500/20" },
  primary:{ bg: "from-primary/[0.06] to-transparent", iconBg: "bg-primary/10", accent: "text-primary", ring: "ring-primary/20" },
};

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const style = KPI_STYLES[color] || KPI_STYLES.blue;
  return (
    <div className={`group relative rounded-xl border border-border/60 bg-gradient-to-br ${style.bg} p-5 transition-all duration-200 hover:border-border hover:shadow-sm`}>
      {/* subtle gradient glow on hover */}
      <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none ring-1 ring-inset ring-border/30" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-none">{label}</p>
          <p className={`text-2xl font-extrabold tracking-tight leading-none ${style.accent}`}>{value}</p>
          <p className="text-[11px] text-muted-foreground/70 leading-none">{sub}</p>
        </div>
        <div className={`shrink-0 flex items-center justify-center h-10 w-10 rounded-xl ${style.iconBg} ring-1 ${style.ring} transition-transform duration-200 group-hover:scale-105`}>
          <span className={style.accent}>{icon}</span>
        </div>
      </div>
    </div>
  );
}
