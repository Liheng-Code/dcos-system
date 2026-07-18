"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, LabelList,
} from "recharts";
import {
  getBoqItems,
  getPreliminariesItems,
  type TenderBoqItem,
  type TenderPreliminariesItem,
} from "@/lib/tender-cost-service";

const fmt = (n: number) =>
  `$ ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};

function groupByKey(items: TenderBoqItem[], mode: "floor" | "trade" | "budget_code"): { name: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    let key: string;
    if (mode === "floor") key = item.level || "All";
    else if (mode === "trade") key = item.section || "General";
    else key = item.budget_codes?.code || "Unclassified";
    map.set(key, (map.get(key) ?? 0) + Number(item.total_amount ?? 0));
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, amount]) => ({ name, amount }));
}

const barColors = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1"];

function MiniChart({ title, data }: { title: string; data: { name: string; amount: number }[] }) {
  if (data.length === 0) return null;
  const needsRotation = data.length > 6;
  return (
    <div className="rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={needsRotation ? -35 : 0} textAnchor={needsRotation ? "end" : "middle"} height={needsRotation ? 60 : 30} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={60} />
          <Tooltip formatter={(value: number | string) => fmt(Number(value))} labelStyle={{ fontWeight: 600 }} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]} maxBarSize={56}>
            {data.map((_, i) => (
              <Cell key={i} fill={barColors[i % barColors.length]} />
            ))}
            <LabelList dataKey="amount" position="top" formatter={(v: number | string) => fmtShort(Number(v))} style={{ fontSize: 11 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostSummaryTab({ tenderId }: { tenderId: string }) {
  const [boqItems, setBoqItems] = useState<TenderBoqItem[]>([]);
  const [prelimItems, setPrelimItems] = useState<TenderPreliminariesItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([getBoqItems(tenderId), getPreliminariesItems(tenderId)])
      .then(([b, p]) => { setBoqItems(b); setPrelimItems(p); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [tenderId]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const grandTotal = boqItems.reduce((s, i) => s + Number(i.total_amount ?? 0), 0);
  const prelimTotal = prelimItems.reduce((s, i) => s + Number(i.amount ?? 0), 0);

  const byFloor = groupByKey(boqItems, "floor");
  const byTrade = groupByKey(boqItems, "trade");
  const byBudgetCode = groupByKey(boqItems, "budget_code");
  const prelimChartData = prelimItems.map((p) => ({ name: p.code || p.description || "Item", amount: Number(p.amount ?? 0) })).sort((a, b) => b.amount - a.amount);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{fmt(grandTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Direct Works Total</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{fmt(prelimTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Preliminaries Total</p>
        </div>
        <div className="rounded-lg border border-border p-4 text-center">
          <p className="text-2xl font-bold">{fmt(grandTotal + prelimTotal)}</p>
          <p className="text-xs text-muted-foreground mt-1">Combined Total</p>
        </div>
      </div>

      <MiniChart title="Direct Works by Floor / Level" data={byFloor} />
      <MiniChart title="Direct Works by Trade / Section" data={byTrade} />
      <MiniChart title="Direct Works by Budget Code" data={byBudgetCode} />
      <MiniChart title="Preliminaries Breakdown" data={prelimChartData} />
    </div>
  );
}
