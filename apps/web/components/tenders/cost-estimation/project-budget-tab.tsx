"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import {
  getBidSummaries,
  getDirectWorksTotal,
  getPreliminariesTotal,
  type TenderBidSummary,
} from "@/lib/tender-cost-service";

const fmt = (n: number) =>
  `$ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${Number(n).toFixed(1)}%`;
const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

export function ProjectBudgetTab({ tenderId }: { tenderId: string }) {
  const [loading, setLoading] = useState(true);
  const [bidSummary, setBidSummary] = useState<TenderBidSummary | null>(null);
  const [directWorks, setDirectWorks] = useState(0);
  const [preliminaries, setPreliminaries] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      getBidSummaries(tenderId),
      getDirectWorksTotal(tenderId),
      getPreliminariesTotal(tenderId),
    ])
      .then(([summaries, dw, pl]) => {
        setBidSummary(summaries[0] ?? null);
        setDirectWorks(dw);
        setPreliminaries(pl);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tenderId]);

  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );

  if (!bidSummary) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
        <p className="font-medium">No bid summary revision found</p>
        <p className="mt-1">
          Create a bid summary revision in the Bid Summary tab first.
        </p>
      </div>
    );
  }

  const bs = bidSummary;
  const netCost =
    directWorks + preliminaries + Number(bs.subcontract_cost || 0);
  const subtotalBeforeVat =
    netCost +
    Number(bs.overhead_amount || 0) +
    Number(bs.contingency || 0) +
    Number(bs.risk_allowance || 0) +
    Number(bs.profit_amount || 0);
  const sellingCost = subtotalBeforeVat + Number(bs.vat_amount || 0);
  const marginCost = sellingCost - netCost;
  const marginPct = netCost > 0 ? (marginCost / netCost) * 100 : 0;

  const barData = [
    { name: "Direct Works", amount: directWorks },
    { name: "Preliminaries", amount: preliminaries },
    { name: "Subcontract", amount: Number(bs.subcontract_cost || 0) },
    { name: "Overhead", amount: Number(bs.overhead_amount || 0) },
    { name: "Contingency", amount: Number(bs.contingency || 0) },
    { name: "Risk Allowance", amount: Number(bs.risk_allowance || 0) },
    { name: "Profit", amount: Number(bs.profit_amount || 0) },
    { name: "VAT", amount: Number(bs.vat_amount || 0) },
  ].filter((d) => d.amount > 0);

  const barColors = [
    "#2563eb",
    "#16a34a",
    "#f59e0b",
    "#8b5cf6",
    "#ef4444",
    "#ec4899",
    "#06b6d4",
    "#f97316",
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{fmt(netCost)}</p>
          <p className="text-xs text-muted-foreground mt-1">Net Cost</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{fmt(sellingCost)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Selling Cost (Tender Price)
          </p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {fmt(marginCost)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Margin Cost</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">
            {fmtPct(marginPct)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Margin %</p>
        </div>
      </div>

      {/* Bar chart */}
      {barData.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-semibold mb-4">Cost Breakdown</h3>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={barData}
              margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11 }}
                interval={0}
                angle={-35}
                textAnchor="end"
                height={65}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={60}
              />
              <Tooltip
                formatter={(value: number | string) => fmt(Number(value))}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={48}>
                {barData.map((_, i) => (
                  <Cell key={i} fill={barColors[i % barColors.length]} />
                ))}
                <LabelList
                  dataKey="amount"
                  position="top"
                  formatter={(v: number | string) => fmtShort(Number(v))}
                  style={{ fontSize: 11 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Margin summary */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Margin: </span>
            <span className="font-semibold text-emerald-600">
              {fmt(marginCost)}
            </span>
            <span className="text-muted-foreground ml-2">
              ({fmtPct(marginPct)})
            </span>
          </div>
          <div className="text-sm text-right">
            <span className="text-muted-foreground">Tender Price: </span>
            <span className="font-bold text-lg">{fmt(sellingCost)}</span>
          </div>
        </div>
      </div>

      {/* Revision info */}
      <div className="rounded-lg border border-border p-4">
        <div className="flex items-center justify-between text-sm">
          <div>
            <p className="text-muted-foreground">
              Active Revision:{" "}
              <span className="font-semibold text-foreground">
                Revision {bs.revision_no}
              </span>
            </p>
            <p className="text-muted-foreground text-xs mt-0.5">
              Status: {bs.status.replace(/_/g, " ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Bid Reference Total</p>
            <p className="text-lg font-bold">
              {fmt(Number(bs.total_bid_price || 0))}
            </p>
          </div>
        </div>
        {bs.notes && (
          <p className="mt-2 text-xs text-muted-foreground border-t border-border pt-2">
            {bs.notes}
          </p>
        )}
      </div>
    </div>
  );
}
