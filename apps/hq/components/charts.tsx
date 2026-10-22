"use client";

// Dashboard charts (recharts). One series each, so one colour: chart slot 1
// (--chart-1, validated for both themes). Thin bars with 4px rounded data ends,
// recessive grid, hover tooltips; values in text ink, never in the series colour.

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthBucket, PlanValue } from "@/lib/metrics";
import { fmtMoney } from "@/lib/format";

const AXIS = { fill: "var(--muted-foreground)", fontSize: 11 };

function TooltipBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
      <div className="mb-0.5 font-semibold text-foreground">{title}</div>
      {lines.map((l) => (
        <div key={l} className="text-muted-foreground">
          {l}
        </div>
      ))}
    </div>
  );
}

export function RenewalsChart({ data, currency }: { data: MonthBucket[]; currency: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="35%">
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--border)" }} interval={0} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={56}
            allowDecimals={false}
            tickFormatter={(v: number) => fmtMoney(v, currency, true)}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const b = payload[0].payload as MonthBucket;
              return (
                <TooltipBox
                  title={b.label}
                  lines={[fmtMoney(b.value, currency), `${b.count} license${b.count === 1 ? "" : "s"} renewing`]}
                />
              );
            }}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlanValueChart({ data, currency }: { data: PlanValue[]; currency: string }) {
  return (
    <div className="w-full" style={{ height: Math.max(120, data.length * 44) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap="30%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="plan" tick={{ ...AXIS, fontSize: 12 }} tickLine={false} axisLine={false} width={96} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as PlanValue;
              return <TooltipBox title={p.plan} lines={[fmtMoney(p.value, currency), `${p.count} license${p.count === 1 ? "" : "s"}`]} />;
            }}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => fmtMoney(Number(v), currency, true)}
              style={{ fill: "var(--foreground)", fontSize: 12 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
