"use client";

import {
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChartWrapper } from "@/components/reports/charts/chart-wrapper";

interface BarSeries {
  dataKey: string;
  name: string;
  color: string;
}

interface BarChartProps {
  data: Record<string, unknown>[];
  series: BarSeries[];
  xKey: string;
  stacked?: boolean;
  loading?: boolean;
  empty?: boolean;
  error?: string | null;
  onRetry?: () => void;
  title?: string;
  description?: string;
  height?: number;
  formatY?: (val: number) => string;
  formatTooltip?: (val: number, name: string) => string;
}

export function BarChart({
  data,
  series,
  xKey,
  stacked,
  loading,
  empty,
  error,
  onRetry,
  title,
  description,
  height = 280,
  formatY,
  formatTooltip,
}: BarChartProps) {
  return (
    <ChartWrapper
      title={title}
      description={description}
      loading={loading}
      empty={empty}
      error={error}
      onRetry={onRetry}
      height={height}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBar
          data={data as Record<string, number | string>[]}
          margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--border)" }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatY}
          />
          <Tooltip
            formatter={formatTooltip ? (val, name) => [formatTooltip(Number(val), String(name)), String(name)] : undefined}
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              border: "1px solid var(--border)",
              backgroundColor: "var(--popover)",
              color: "var(--popover-foreground)",
            }}
            labelStyle={{ color: "var(--popover-foreground)" }}
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
          />
          {series.length > 1 && (
            <Legend
              wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
              iconType="circle"
              iconSize={8}
            />
          )}
          {series.map((s) => (
            <Bar
              key={s.dataKey}
              dataKey={s.dataKey}
              name={s.name}
              fill={s.color}
              radius={[3, 3, 0, 0]}
              stackId={stacked ? "stack" : undefined}
              maxBarSize={32}
            />
          ))}
        </RechartsBar>
      </ResponsiveContainer>
    </ChartWrapper>
  );
}
